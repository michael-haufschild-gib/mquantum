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

import { RIEMANN_ZEROS } from '@/lib/physics/riemannZeta'

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
  const ringT = new Float64Array(BIFURCATION_RING_COUNT)
  for (let n = 0; n < BIFURCATION_RING_COUNT; n++) {
    ringT[n] = bifurcationRingHeight(RIEMANN_ZEROS[n]!)
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
        f += Math.exp(-dT * dT * inv2Ring2) * Math.exp(-dU * dU * invWU2)
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
