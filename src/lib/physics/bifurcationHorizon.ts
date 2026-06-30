/**
 * Bifurcation Horizon quantum mode — physics core.
 *
 * Renders the Riemann critical strip as the maximally-extended (Kruskal)
 * eternal black hole. This module is the **single source of truth** for the
 * `bifurcationHorizon` render mode: the GPU never re-derives the ζ-zero rings
 * or the throat membrane — the strategy calls {@link generateBifurcationLut}
 * on the CPU and uploads the result as a read-only 2D look-up table indexed by
 * `(t, u)`, so the shader only does a bilinear lookup, a flow shift, and an
 * optional extremal redshift.
 *
 * ## The physics
 * The eternal (two-sided) AdS / Schwarzschild black hole has a
 * maximally-extended Kruskal diagram with two wedges meeting at the
 * **bifurcation surface** — the throat of the Einstein–Rosen bridge. In the
 * Riemann picture:
 *
 *   - The **critical line** Re s = ½ is the bifurcation surface / ERB throat.
 *   - The functional-equation involution s ↦ 1 − s̄ (the wedge reflection that
 *     swaps Re s = ½ + δ ↔ Re s = ½ − δ) is the **Tomita modular conjugation
 *     J** of Tomita–Takesaki theory — the antiunitary that maps one wedge
 *     algebra to its commutant in the other wedge.
 *   - The non-trivial **ζ-zeros** ½ + iγ_n are the spectrum pinned to the
 *     throat, stacked along the height axis t = Im s.
 *
 * We work in a wedge coordinate `u = log(rPerp / r0)`, where `rPerp` is the
 * world-space perpendicular distance from the throat axis and `r0` is a fixed
 * neck radius. Then `u = 0` is the bifurcation surface (rPerp = r0 = critical
 * line); `u > 0` and `u < 0` are the two Kruskal wedges; and the FE / modular
 * mirror s ↦ 1 − s̄ is exactly `u ↦ −u`. The CPU builds a 2D field
 * `F(t, u) = [density, edge, ψRe, ψIm]`:
 *
 *   - `membrane(u) = exp(−(u/wThroat)²)` — a glowing bifurcation surface at u=0.
 *   - `rings = Σ_n A_n·exp(−(t−Y_n)²/2wRing²)·exp(−((u−uOff_n)/wU)²)` — the
 *     GUE-spaced ζ-zero rings, with `Y_n` the first ~40 zero ordinates γ_n
 *     mapped linearly into [0, tMax]. `uOff_n = 0` (all on-line, the RH case)
 *     unless `offLine` perturbs them off the throat.
 *   - a faint **KMS thermal-wedge** haze `thermalGain·exp(−|u|/uHalf)` filling
 *     the two funnels (the eternal black hole is a thermofield-double / KMS
 *     state — both wedges are thermally populated).
 *
 * The complex phase channel ψ winds with a carrier in `u` and a slow winding in
 * `t`, giving each wedge a distinct, mirror-symmetric hue rotation.
 *
 * @module lib/physics/bifurcationHorizon
 */

import { RIEMANN_ZEROS, smoothZeroCount } from '@/lib/physics/riemannZeta'

/** Number of samples along the throat-height axis t = Im s. */
export const BIFURCATION_NT = 384

/** Number of samples across the wedge coordinate u = log(rPerp/r0). */
export const BIFURCATION_NU = 96

/**
 * Number of ζ-zeros mapped into rings. Kept small (≪ RIEMANN_ZEROS.length) so
 * adjacent rings stay visually separated along the throat at the default tMax.
 */
export const BIFURCATION_RING_COUNT = 40

/**
 * Upper bound of the throat-height window t ∈ [0, tMax]. The first
 * {@link BIFURCATION_RING_COUNT} zero ordinates γ_n live in roughly
 * [14, 150]; mapping that span into [0, tMax] with tMax = 12 leaves the
 * GUE-spaced rings clearly resolved.
 */
export const BIFURCATION_T_MAX = 12

/**
 * Half-width of the wedge window u ∈ [−uHalf, uHalf]. Beyond ±uHalf the field
 * is exactly zero (the shader skips those samples — see the u-window guard in
 * `mainBifurcationHorizon.wgsl`).
 */
export const BIFURCATION_U_HALF = 2.4

/**
 * World-space neck radius factor: the bifurcation surface sits at
 * `rPerp = r0 = BIFURCATION_NECK_FACTOR · boundingRadius` (u = 0). The packer
 * folds this into the world-space neck radius written to the uniform.
 */
export const BIFURCATION_NECK_FACTOR = 0.22

/** Parameters controlling the 2D LUT generation. */
export interface BifurcationLutParams {
  /** Throat-membrane Gaussian half-width in u (the bifurcation-surface glow). */
  throatWidth: number
  /** Ring Gaussian half-width along the throat-height axis t (sharp zero rings). */
  ringWidth: number
  /** Ring Gaussian half-width across the wedge axis u. */
  ringWidthU: number
  /** Off-line displacement of the zero rings in u (0 = RH case, all on-line). */
  offLine: number
  /** KMS thermal-wedge haze gain (faint atmosphere filling the two wedges). */
  thermalGain: number
  /** Phase carrier (rotation rate of ψ hue across the wedge coordinate u). */
  carrier: number
  /** Phase winding (rotation rate of ψ hue along the throat-height axis t). */
  winding: number
  /**
   * Optional per-ring centre shift Δt added to ring n's throat-height centre,
   * in t-units (the **living log-gas** displacement: soft-mode breathing or
   * Dyson-relaxation state). Index n addresses the n-th ζ-zero ring. Absent ⇒
   * every ring stays at its static γ_n height (identical to the legacy LUT).
   * Accepts any indexable numeric sequence (a `number[]` or a `Float64Array`).
   */
  ringOffsets?: ArrayLike<number>
  /**
   * Optional per-ring multiplicative amplitude applied to ring n's Gaussian
   * weight (default 1 each). Used by the stiffness tint so transverse-stiffer
   * rings glow brighter. Absent ⇒ unit amplitude for every ring. Accepts any
   * indexable numeric sequence (a `number[]` or a `Float64Array`).
   */
  ringAmpScale?: ArrayLike<number>
}

/**
 * Default LUT parameters. Also the reference scale for normalisation: the
 * generated density is normalised to unit peak so the shader's glow control
 * sets brightness.
 */
export const BIFURCATION_DEFAULT_LUT: BifurcationLutParams = {
  throatWidth: 0.18,
  ringWidth: 0.07,
  ringWidthU: 0.18,
  offLine: 0,
  thermalGain: 0.35,
  carrier: 6,
  winding: 0.5,
}

/**
 * Map a ζ-zero ordinate γ into the throat-height coordinate t ∈ [0, tMax].
 * Linear over the span of the first {@link BIFURCATION_RING_COUNT} zeros so the
 * relative (GUE) spacings — which carry the visual signal — are preserved.
 *
 * @param gamma - Zero ordinate γ_n.
 * @returns Throat-height coordinate t.
 */
export function bifurcationRingHeight(gamma: number): number {
  const gMin = RIEMANN_ZEROS[0]!
  const gMax = RIEMANN_ZEROS[BIFURCATION_RING_COUNT - 1]!
  const span = gMax - gMin
  // Keep rings inside (0, tMax) with a small inset margin so the outermost
  // ring is not clipped by the LUT edge.
  const margin = 0.04 * BIFURCATION_T_MAX
  const usable = BIFURCATION_T_MAX - 2 * margin
  return margin + (usable * (gamma - gMin)) / (span > 1e-9 ? span : 1)
}

/**
 * Convert a wedge coordinate `u` into a fractional LUT column index iu.
 * The field is zero outside [−uHalf, uHalf]; callers must guard before
 * sampling (this returns a clamped index for convenience).
 *
 * @param u - Wedge coordinate u = log(rPerp/r0).
 * @returns Fractional column index in [0, BIFURCATION_NU − 1].
 */
export function bifurcationUIndex(u: number): number {
  const f = ((u + BIFURCATION_U_HALF) / (2 * BIFURCATION_U_HALF)) * (BIFURCATION_NU - 1)
  return Math.max(0, Math.min(BIFURCATION_NU - 1, f))
}

/**
 * Convert a throat-height coordinate `t` into a fractional LUT row index it.
 *
 * @param t - Throat-height coordinate t = Im s.
 * @returns Fractional row index in [0, BIFURCATION_NT − 1].
 */
export function bifurcationTIndex(t: number): number {
  const f = (t / BIFURCATION_T_MAX) * (BIFURCATION_NT - 1)
  return Math.max(0, Math.min(BIFURCATION_NT - 1, f))
}

/**
 * Generate the 2D look-up table the shader samples. Layout: an interleaved
 * `Float32Array` of length `BIFURCATION_NT · BIFURCATION_NU · 4`, with stride-4
 * entries `[density, edge, ψRe, ψIm]` per `(t, u)` cell (row-major in `t`,
 * column index `u` fastest). `density` is the (normalised, ≥0) field; `edge` is
 * the central-difference derivative d(density)/du used for warm-white rim
 * highlights; `ψ` is the complex phase field used for hue colouring.
 *
 * The field is the sum of the throat membrane, the ζ-zero rings, and the KMS
 * thermal-wedge haze, normalised to unit peak. A soft background cut + gamma
 * sharpen drives the inter-ring space to exactly zero so a chord through the
 * volume never integrates into opaque fog.
 *
 * @param params - LUT parameters.
 * @returns Interleaved Float32Array of length `BIFURCATION_NT * BIFURCATION_NU * 4`.
 */
export function generateBifurcationLut(params: BifurcationLutParams): Float32Array {
  const NT = BIFURCATION_NT
  const NU = BIFURCATION_NU
  const uHalf = BIFURCATION_U_HALF
  const du = (2 * uHalf) / (NU - 1)
  const dt = BIFURCATION_T_MAX / (NT - 1)

  const wThroat = Math.max(1e-3, params.throatWidth)
  const wRing = Math.max(1e-3, params.ringWidth)
  const wU = Math.max(1e-3, params.ringWidthU)
  const invThroat2 = 1 / (wThroat * wThroat)
  const inv2Ring2 = 1 / (2 * wRing * wRing)
  const invWU2 = 1 / (wU * wU)

  // Precompute ring centres (t, u) for the first BIFURCATION_RING_COUNT zeros.
  // The living-log-gas displacement `ringOffsets[n]` (soft-mode breathing or
  // Dyson relaxation) is folded into the centre here; absent ⇒ Δt = 0.
  const ringOffsets = params.ringOffsets
  const ringAmpScale = params.ringAmpScale
  const ringT = new Float64Array(BIFURCATION_RING_COUNT)
  for (let n = 0; n < BIFURCATION_RING_COUNT; n++) {
    const off = ringOffsets ? (ringOffsets[n] ?? 0) : 0
    const dtN = Number.isFinite(off) ? off : 0
    ringT[n] = bifurcationRingHeight(RIEMANN_ZEROS[n]!) + dtN
  }
  // Per-ring amplitude (stiffness tint). Absent ⇒ unit amplitude.
  const ringAmp = new Float64Array(BIFURCATION_RING_COUNT)
  for (let n = 0; n < BIFURCATION_RING_COUNT; n++) {
    const a = ringAmpScale ? (ringAmpScale[n] ?? 1) : 1
    ringAmp[n] = Number.isFinite(a) ? a : 1
  }
  // Off-line displacement alternates sign per ring so the mirror pair is
  // visibly broken symmetrically (J·s and s straddle the throat). uOff = 0
  // is the on-line RH case.
  const ringUOff = new Float64Array(BIFURCATION_RING_COUNT)
  for (let n = 0; n < BIFURCATION_RING_COUNT; n++) {
    ringUOff[n] = params.offLine * (n % 2 === 0 ? 1 : -1)
  }

  const density = new Float64Array(NT * NU)

  for (let it = 0; it < NT; it++) {
    const t = it * dt
    for (let iu = 0; iu < NU; iu++) {
      const u = -uHalf + iu * du
      // Throat membrane: glowing bifurcation surface at u = 0.
      let f = Math.exp(-(u * u) * invThroat2)
      // KMS thermal-wedge haze: faint, decays away from the throat.
      f += params.thermalGain * Math.exp(-Math.abs(u) / uHalf)
      // ζ-zero rings stacked along the throat (only touch nearby rows/cols).
      for (let n = 0; n < BIFURCATION_RING_COUNT; n++) {
        const dT = t - ringT[n]!
        if (Math.abs(dT) > 5 * wRing) continue
        const dU = u - ringUOff[n]!
        f += ringAmp[n]! * Math.exp(-dT * dT * inv2Ring2) * Math.exp(-dU * dU * invWU2)
      }
      density[it * NU + iu] = f
    }
  }

  // Normalise density to unit peak.
  let maxRho = 0
  for (let i = 0; i < density.length; i++) if (density[i]! > maxRho) maxRho = density[i]!
  const invMax = maxRho > 1e-12 ? 1 / maxRho : 1

  // Background cut + gamma sharpen: send inter-ring background to exactly zero
  // (a monotone transform, so every peak position is preserved) so chords do
  // not integrate the low-level field into fog.
  const BG_CUT = 0.12
  const invCut = 1 / (1 - BG_CUT)

  const out = new Float32Array(NT * NU * 4)
  for (let it = 0; it < NT; it++) {
    const t = it * dt
    for (let iu = 0; iu < NU; iu++) {
      const u = -uHalf + iu * du
      const idx = it * NU + iu
      const rhoN = Math.max(0, density[idx]! * invMax - BG_CUT) * invCut
      const d = Math.pow(rhoN, 1.6)
      const base = idx * 4
      out[base + 0] = d
      // Phase channel: carrier winding in u, slow winding along the throat.
      const phase = params.carrier * u + params.winding * t
      out[base + 2] = d * Math.cos(phase)
      out[base + 3] = d * Math.sin(phase)
    }
  }

  // Edge channel: central difference of normalised density along u (rim
  // highlight tracing the flanks of the membrane and the rings).
  for (let it = 0; it < NT; it++) {
    for (let iu = 0; iu < NU; iu++) {
      const lo = Math.max(0, iu - 1)
      const hi = Math.min(NU - 1, iu + 1)
      const dlo = out[(it * NU + lo) * 4]!
      const dhi = out[(it * NU + hi) * 4]!
      out[(it * NU + iu) * 4 + 1] = (dhi - dlo) / ((hi - lo) * du)
    }
  }

  return out
}

/**
 * Sample the (normalised) density from a generated LUT at `(t, u)` with full
 * bilinear interpolation — the CPU twin of the shader's lookup, used by tests.
 * Outside the LUT window (t ∉ [0, tMax] or |u| > uHalf) the density is exactly
 * zero (the shader skips those samples; edge-clamping would smear the boundary
 * over the whole funnel as fog).
 *
 * @param lut - LUT from {@link generateBifurcationLut}.
 * @param t - Throat-height coordinate t = Im s.
 * @param u - Wedge coordinate u = log(rPerp/r0).
 * @returns Interpolated density (0 outside the LUT window).
 */
export function sampleBifurcationDensity(lut: Float32Array, t: number, u: number): number {
  const NT = BIFURCATION_NT
  const NU = BIFURCATION_NU
  const uHalf = BIFURCATION_U_HALF
  if (t < 0 || t > BIFURCATION_T_MAX || u < -uHalf || u > uHalf) return 0

  const ft = bifurcationTIndex(t)
  const fu = bifurcationUIndex(u)
  const it0 = Math.floor(ft)
  const iu0 = Math.floor(fu)
  const it1 = Math.min(it0 + 1, NT - 1)
  const iu1 = Math.min(iu0 + 1, NU - 1)
  const at = ft - it0
  const au = fu - iu0

  const s00 = lut[(it0 * NU + iu0) * 4]!
  const s01 = lut[(it0 * NU + iu1) * 4]!
  const s10 = lut[(it1 * NU + iu0) * 4]!
  const s11 = lut[(it1 * NU + iu1) * 4]!
  const top = s00 * (1 - au) + s01 * au
  const bot = s10 * (1 - au) + s11 * au
  return top * (1 - at) + bot * at
}

/** Bounding-radius input (only the fields that affect the spatial extent). */
export interface BifurcationBoundingInput {
  /** Optional override of the throat-height extent (pre-scale t units). */
  tMax?: number
}

/**
 * Physics-based bounding radius for the cube geometry. The throat is a vertical
 * funnel of height ≈ tMax along x₁ and radial width set by the wedge window
 * exp(±uHalf)·r0; a sphere that comfortably contains the throat height drives
 * the extent. Capped at 14 for performance (matches riemannZetaBoundingRadius).
 * Dimension-independent (the wedge folds all extra dimensions into rPerp).
 *
 * @param config - Bounding input (`tMax` overrides the throat-height extent).
 * @param _dimension - Spatial dimension (unused; the field is radial in the
 *   perpendicular dimensions).
 * @returns Bounding radius in model-space units.
 */
export function bifurcationHorizonBoundingRadius(
  config: BifurcationBoundingInput | undefined,
  _dimension: number
): number {
  const tMax = config?.tMax ?? BIFURCATION_T_MAX
  // Half the throat height plus the widest wedge funnel radius. The throat is
  // centred at t ∈ [0, tMax] mapped onto x₁ around the origin; a radius of
  // ~0.55·tMax frames the funnel with margin.
  return Math.min(14, tMax * 0.55 + 1.0)
}

/* ────────────────────────────────────────────────────────────── */
/*  Living log-gas: type-II₁ no-margin / soft-mode analysis        */
/* ────────────────────────────────────────────────────────────── */

/**
 * Unfold the ζ-zero ordinates with the smooth Riemann–von Mangoldt counting
 * function N̄(t) (reused from {@link smoothZeroCount}) so the unfolded mean
 * spacing is exactly 1. The Coulomb log-gas is **scale-free in the unfolded
 * coordinate**: only after unfolding does the transverse-rigidity Laplacian
 * carry the universal 1/r² hydrodynamic structure whose marginal soft mode is
 * Object X's type-II₁ gaplessness.
 *
 * @param zeros - Raw zero ordinates γ_n.
 * @returns The unfolded coordinates x_n = N̄(γ_n).
 */
export function unfoldZeros(zeros: readonly number[]): number[] {
  return zeros.map((g) => smoothZeroCount(g))
}

/**
 * Build the Coulomb log-gas transverse-rigidity Laplacian M for an unfolded
 * 1-D point set. This is the "no-margin" / transverse-stiffness operator:
 *
 *   M_ik = −(x_i − x_k)^{-2}   (i ≠ k)
 *   M_ii = Σ_{k≠i} (x_i − x_k)^{-2} = K_i   (transverse stiffness; the
 *                                            diagonal of ∂²_σ log|ξ|)
 *
 * M is symmetric and PSD with constant row-sums of 0 ⇒ the uniform vector is
 * the exact λ = 0 eigenmode (a rigid global shift, forbidden by the functional
 * equation). The smallest **nonzero** eigenvalue is the marginal hydrodynamic
 * 1/r² mode — λ₁(M) → 0 ~ N⁻¹ is the type-II₁ gaplessness.
 *
 * @param unfolded - Unfolded ordinates x_n (strictly increasing, mean spacing 1).
 * @returns Row-major N×N {@link Float64Array} holding M.
 */
export function buildLogGasLaplacian(unfolded: readonly number[]): Float64Array {
  const n = unfolded.length
  const M = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    let diag = 0
    for (let k = 0; k < n; k++) {
      if (k === i) continue
      const d = unfolded[i]! - unfolded[k]!
      const w = 1 / (d * d)
      M[i * n + k] = -w
      diag += w
    }
    M[i * n + i] = diag
  }
  return M
}

/** Eigen-decomposition of a small real symmetric matrix. */
export interface SymmetricEigen {
  /** Eigenvalues sorted ascending. */
  values: number[]
  /** Eigenvectors as columns: `vectors[row][col]` is component `row` of the
   *  `col`-th eigenvector (so column `j` pairs with `values[j]`). */
  vectors: number[][]
}

/**
 * Classic cyclic Jacobi rotation eigensolver for a small real symmetric matrix
 * (n ≤ 64). Fully deterministic — no RNG, no iteration-order randomness — so
 * repeated calls on the same matrix return bit-identical output. Eigenvectors
 * are returned as columns and the pairs are sorted ascending by eigenvalue.
 *
 * @param matrix - Row-major n×n symmetric matrix (mutated copy is made internally).
 * @param n - Matrix dimension.
 * @returns Ascending eigenvalues and their column-eigenvectors.
 */
export function jacobiEigenSymmetric(matrix: Float64Array, n: number): SymmetricEigen {
  // Work on a copy of A (Jacobi destroys the off-diagonal as it rotates).
  const a = Float64Array.from(matrix)
  // Eigenvector accumulator V, initialised to the identity.
  const v = new Float64Array(n * n)
  for (let i = 0; i < n; i++) v[i * n + i] = 1

  const maxSweeps = 100
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // Off-diagonal Frobenius norm — convergence is when it underflows tolerance.
    let off = 0
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        off += a[p * n + q]! * a[p * n + q]!
      }
    }
    if (off < 1e-30) break

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q]!
        if (Math.abs(apq) < 1e-300) continue
        const app = a[p * n + p]!
        const aqq = a[q * n + q]!
        // Rotation angle that annihilates (p, q): cot(2θ) = (aqq − app)/(2 apq).
        const theta = (aqq - app) / (2 * apq)
        const sign = theta >= 0 ? 1 : -1
        const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c

        // Rotate rows/cols p and q of A.
        for (let i = 0; i < n; i++) {
          const aip = a[i * n + p]!
          const aiq = a[i * n + q]!
          a[i * n + p] = c * aip - s * aiq
          a[i * n + q] = s * aip + c * aiq
        }
        for (let i = 0; i < n; i++) {
          const api = a[p * n + i]!
          const aqi = a[q * n + i]!
          a[p * n + i] = c * api - s * aqi
          a[q * n + i] = s * api + c * aqi
        }
        // Accumulate the rotation into the eigenvector matrix V.
        for (let i = 0; i < n; i++) {
          const vip = v[i * n + p]!
          const viq = v[i * n + q]!
          v[i * n + p] = c * vip - s * viq
          v[i * n + q] = s * vip + c * viq
        }
      }
    }
  }

  // Collect (eigenvalue, eigenvector column) pairs and sort ascending.
  const pairs: { value: number; vec: number[] }[] = []
  for (let j = 0; j < n; j++) {
    const vec = new Array<number>(n)
    for (let i = 0; i < n; i++) vec[i] = v[i * n + j]!
    pairs.push({ value: a[j * n + j]!, vec })
  }
  pairs.sort((x, y) => x.value - y.value)

  const values = pairs.map((p) => p.value)
  // Re-emit as column-major: vectors[row][col].
  const vectors: number[][] = []
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n)
    for (let j = 0; j < n; j++) row[j] = pairs[j]!.vec[i]!
    vectors.push(row)
  }
  return { values, vectors }
}

/** Result of the {@link bifurcationSoftMode} log-gas analysis. */
export interface BifurcationSoftMode {
  /** Smallest NONZERO eigenvalue of M — the type-II₁ gaplessness λ₁(M). */
  lambda1: number
  /** Soft-mode eigenvector (normalised, mean-subtracted so it is ⟂ the uniform
   *  λ = 0 mode) — the shape the rings breathe in. Length = ring count. */
  mode: number[]
  /** Per-ring transverse stiffness K_i = diag(M)_i. Length = ring count. */
  stiffness: number[]
  /** Full ascending spectrum of M (length = ring count). */
  lambdas: number[]
}

/** Memo cache keyed by ring count (the zeros are fixed, so M is pure in count). */
const SOFT_MODE_CACHE = new Map<number, BifurcationSoftMode>()

/**
 * Compute the living-log-gas soft mode of the ζ-zero spectrum: unfold the
 * first `count` zeros, build the transverse-rigidity Laplacian M, eigensolve,
 * and return the marginal soft mode that exposes Object X's type-II₁
 * gaplessness.
 *
 * λ = 0 is the rigid-shift mode (uniform vector); the **smallest nonzero**
 * eigenvalue λ₁(M) → 0 ~ N⁻¹ is the marginal 1/r² hydrodynamic mode — the
 * no-margin signature invisible in the naked zero list. The returned `mode`
 * is mean-subtracted and unit-normalised so it is orthogonal to the uniform
 * mode and renders as a pure breathing shape.
 *
 * Memoised on `count` (the zeros never change).
 *
 * @param zeros - Zero ordinates (defaults to {@link RIEMANN_ZEROS}).
 * @param count - Number of leading zeros to include (default
 *   {@link BIFURCATION_RING_COUNT}).
 * @returns The soft-mode analysis (gaplessness, mode shape, stiffness, spectrum).
 */
export function bifurcationSoftMode(
  zeros: readonly number[] = RIEMANN_ZEROS,
  count: number = BIFURCATION_RING_COUNT
): BifurcationSoftMode {
  const usesDefaultZeros = zeros === RIEMANN_ZEROS
  if (usesDefaultZeros) {
    const hit = SOFT_MODE_CACHE.get(count)
    if (hit) return hit
  }

  const n = Math.max(2, Math.min(count, zeros.length))
  const unfolded = unfoldZeros(zeros.slice(0, n))
  const M = buildLogGasLaplacian(unfolded)
  const { values, vectors } = jacobiEigenSymmetric(M, n)

  // The smallest eigenvalue is the rigid λ = 0 shift (uniform vector); the
  // marginal soft mode is the next one up.
  const lambda1 = values[1] ?? 0
  const rawMode = new Array<number>(n)
  for (let i = 0; i < n; i++) rawMode[i] = vectors[i]![1]!

  // Mean-subtract so the mode is ⟂ the uniform λ = 0 eigenvector, then
  // unit-normalise (Jacobi already returns unit columns, but the subtraction
  // changes the norm slightly).
  let mean = 0
  for (let i = 0; i < n; i++) mean += rawMode[i]!
  mean /= n
  let norm = 0
  for (let i = 0; i < n; i++) {
    rawMode[i] = rawMode[i]! - mean
    norm += rawMode[i]! * rawMode[i]!
  }
  norm = Math.sqrt(norm)
  const mode = new Array<number>(n)
  const invNorm = norm > 1e-12 ? 1 / norm : 1
  for (let i = 0; i < n; i++) mode[i] = rawMode[i]! * invNorm

  const stiffness = new Array<number>(n)
  for (let i = 0; i < n; i++) stiffness[i] = M[i * n + i]!

  const result: BifurcationSoftMode = { lambda1, mode, stiffness, lambdas: values }
  if (usesDefaultZeros) SOFT_MODE_CACHE.set(count, result)
  return result
}
