/**
 * Pack AdS bulk density onto the raymarcher's rgba16float density texture.
 *
 * Channel layout (matches the WdW convention so the existing raymarcher
 * path reads the grid without modification):
 *   R = |ψ|² / max(|ψ|²)    — normalised probability density (bulk)
 *   G = log(|ψ|² + ε)        — log-density for volumetric exposure
 *   B = arg(ψ)               — spatial phase (stable for coloring)
 *   A = boundary overlay     — |O|² on a thin shell r ∈ [0.975, 0.995],
 *                               clamped to 100× bulk peak and normalised
 *                               by the bulk peak for additive blending.
 *
 * Coordinate mapping (Poincaré ball compactification):
 *   world (x, y, z) in [−R, R]³ → r = √(x²+y²+z²) / R  ∈ [0, 1)
 *   ρ = 2·atan(r)                                      ∈ [0, π/2)
 *   Outside the unit ball (r ≥ 1) → density = 0.
 *
 * Angular density uses the 2-sphere harmonic Y_ℓm(θ, φ) with θ = acos(z/|v|),
 * φ = atan2(y, x). For d ≤ 4 this is exact. For d ≥ 5 this is the axisymmetric
 * 3D projection of the SO(d−1) angular tower where all intermediate ℓ_k = ℓ
 * — see `math.ts` header for the discussion.
 *
 * Time evolution is applied at render time by the volume raymarcher:
 *   - Stable states (above BF): phase channel B is rotated by `-E·t` via the
 *     `adsEnergy` uniform, giving ψ(x,t) = ψ(x,0) · e^{−iEt}.
 *   - Tachyonic states (below BF): channel R is multiplied by cosh²(γ·t) via
 *     the `adsGrowthRate` uniform, giving |ψ(x,t)|² = |ψ(x,0)|² · cosh²(γt).
 * The spatial envelope baked here is therefore the t=0 amplitude; all time
 * dependence lives in the shader (strictly cheaper than per-frame repacking).
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import type { AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import { clamp01 } from '@/lib/math/clamp'
import { packRGBA16F } from '@/lib/physics/freeScalar/kSpaceOccupation'

import { BTZ_AMPLITUDE_CEILING, btzScalarDelta, btzTemperature, btzThermalAmplitude } from './btz'
import {
  createBoundaryProfile,
  defaultHkllParams,
  fillBoundarySampleGrid,
  type HkllParams,
  reconstructBulkFromSampleGrid,
} from './hkll'
import { adsAngularHarmonic, jacobiP, radialNorm, resolveDelta } from './math'

/** Packed density buffer + metadata consumed by the GPU upload path. */
export interface AdsDensityUpload {
  density: Uint16Array
  gridSize: number
  bytesPerRow: number
  rowsPerImage: number
  /** Peak bulk |ψ|² before normalisation — returned for UI diagnostics. */
  peakDensity: number
  /** Whether the state is below the BF bound (tachyonic). */
  isTachyon: boolean
  /** Whether the alternate branch request fell back to the standard branch. */
  kwFallbackApplied: boolean
  /** Effective Δ used for rendering. */
  effectiveDelta: number
}

/**
 * Reusable scratch buffers for the AdS density packer. A single bundle is
 * reused across the three pack paths (bound-state / BTZ / HKLL); each path
 * only touches the buffers it needs and the packer zeroes them on entry so
 * stale voxels from the previous pack never leak through.
 *
 * When the strategy holds a pooled bundle and hands it to the packer, a
 * slider-drag burst avoids ~6 MB/frame of typed-array GC churn (the density,
 * bulk, reField, boundary, horizonFlags buffers are all N³).
 */
export interface AdsPackerScratch {
  /** Output texture bytes. Length = N³ × 4 (rgba16float). */
  density: Uint16Array
  /** Bulk |ψ|² buffer used by the bound-state and BTZ paths. Length = N³. */
  bulk: Float32Array
  /** Real part of ψ — only the bound-state path writes this. Length = N³. */
  reField: Float32Array
  /** Boundary-overlay shell amplitude. Bound-state path only. Length = N³. */
  boundary: Float32Array
  /** 1 for voxels on the BTZ horizon shell, 0 otherwise. Length = N³. */
  horizonFlags: Uint8Array
  /** Coarse HKLL real-part buffer. Length = max(C_s1, C_s2)³. */
  hkllRe: Float32Array
  /** Coarse HKLL imag-part buffer. Length = max(C_s1, C_s2)³. */
  hkllIm: Float32Array
}

/**
 * Allocate a fresh pool of scratch buffers sized for the given density
 * grid resolution and the max HKLL coarse grid. The pool is safe to
 * reuse across successive packer calls as long as the caller never mutates
 * the returned `density` array between hand-off and the GPU upload — the
 * WebGPU `queue.writeTexture` call copies the source synchronously so the
 * pool can be reused on the very next frame.
 */
export function createAdsPackerScratch(gridSize: number = DENSITY_GRID_SIZE): AdsPackerScratch {
  const N = gridSize
  const total = N * N * N
  const coarseMax = Math.max(HKLL_COARSE_SIZE_S1, HKLL_COARSE_SIZE_S2) ** 3
  return {
    density: new Uint16Array(total * 4),
    bulk: new Float32Array(total),
    reField: new Float32Array(total),
    boundary: new Float32Array(total),
    horizonFlags: new Uint8Array(total),
    hkllRe: new Float32Array(coarseMax),
    hkllIm: new Float32Array(coarseMax),
  }
}

const BOUNDARY_SHELL_MIN = 0.975
const BOUNDARY_SHELL_MAX = 0.995

/**
 * Pack the AdS configuration into the density texture bytes.
 *
 * Complexity: O(N³) where N = DENSITY_GRID_SIZE (currently 64). With ~6
 * transcendentals per voxel (cos, sin, pow, Jacobi loop) the typical
 * repack budget at 64³ = 262k voxels is ~30-60 ms on budget hardware —
 * acceptable for a one-shot recompute on config change.
 *
 * When `config.btzEnabled && config.d === 3` the bound-state path is
 * bypassed entirely — the density is packed from the BTZ thermal ansatz
 * instead; the horizon is painted as an opaque cylinder at a fixed world
 * radius. See `packBtzThermalDensityGrid` below.
 */
function isScratchCompatible(scratch: AdsPackerScratch, total: number): boolean {
  return (
    scratch.density.length >= total * 4 &&
    scratch.bulk.length >= total &&
    scratch.reField.length >= total &&
    scratch.boundary.length >= total &&
    scratch.horizonFlags.length >= total
  )
}

/**
 * Top-level density-grid dispatcher for the Anti-de Sitter mode. Routes to
 * one of three packers based on which AdS variant is active (mutex-enforced
 * by the store; if both flags are set the HKLL story wins because it's the
 * more specialised reconstruction):
 *
 *   - HKLL bulk-from-boundary reconstruction (`config.hkllEnabled`)
 *   - BTZ thermal Hartle-Hawking correlator (`config.btzEnabled && d === 3`)
 *   - Bound-state eigenstate (default fallback)
 *
 * @param config - Resolved AdS configuration (preset + overrides)
 * @param scratch - Optional reusable scratch buffers; reallocated if the
 *                  shape doesn't match `targetGridSize³`.
 * @param targetGridSize - Edge length of the cubic density grid in voxels.
 * @returns Packed RGBA16F density texture upload + diagnostic metadata.
 */
export function packAntiDeSitterDensityGrid(
  config: AntiDeSitterConfig,
  scratch?: AdsPackerScratch,
  targetGridSize: number = DENSITY_GRID_SIZE
): AdsDensityUpload {
  // HKLL takes precedence (Stage 2B). The UI setters also enforce mutex so
  // both flags should not be true simultaneously, but in case they are, the
  // HKLL reconstruction wins because it's the more specialised story.
  if (config.hkllEnabled) {
    return packHkllReconstructedDensityGrid(config, scratch, targetGridSize)
  }
  if (config.btzEnabled && config.d === 3) {
    return packBtzThermalDensityGrid(config, scratch, targetGridSize)
  }
  const N = targetGridSize
  const total = N * N * N
  const useScratch = !!scratch && isScratchCompatible(scratch, total)
  const density = useScratch ? scratch!.density : new Uint16Array(total * 4)

  const resolved = resolveDelta(config.d, config.mL, config.branch)
  const delta = resolved.delta
  const half = (config.d - 1) / 2
  const disc = half * half + (config.mL >= 0 ? config.mL * config.mL : -(config.mL * config.mL))
  const isTachyon = disc < 0

  const alpha = config.l + (config.d - 3) / 2
  const beta = delta - (config.d - 1) / 2
  const norm = radialNorm(config.n, config.l, delta, config.d)

  // First pass: compute bulk density at every voxel and track peak.
  // Bound-state eigenstates are real at t=0 — the complex time factor
  // e^{-iEt} (stable) or cosh(γt) (tachyon) is applied by the raymarcher
  // via the adsEnergy / adsGrowthRate uniforms. The baked grid therefore
  // stores only ψ (real); the phase channel is 0 when ψ ≥ 0 and π when
  // ψ < 0 (captures real-eigenstate nodal sign flips).
  let bulk: Float32Array
  let reField: Float32Array
  if (useScratch) {
    bulk = scratch!.bulk
    reField = scratch!.reField
    bulk.fill(0)
    reField.fill(0)
  } else {
    bulk = new Float32Array(total)
    reField = new Float32Array(total)
  }
  let peakDensity = 0

  for (let z = 0; z < N; z++) {
    const wz = ((z + 0.5) / N) * 2 - 1
    for (let y = 0; y < N; y++) {
      const wy = ((y + 0.5) / N) * 2 - 1
      for (let x = 0; x < N; x++) {
        const wx = ((x + 0.5) / N) * 2 - 1
        const pixelIdx = (z * N + y) * N + x
        const rCompact = Math.sqrt(wx * wx + wy * wy + wz * wz)
        if (rCompact >= 1) {
          continue
        }
        const rho = 2 * Math.atan(rCompact)
        if (rho <= 0 || rho >= Math.PI / 2) continue

        // Radial part
        const cosRho = Math.cos(rho)
        const sinRho = Math.sin(rho)
        const cosPow = Math.pow(cosRho, delta)
        const sinPow = config.l === 0 ? 1 : Math.pow(sinRho, config.l)
        const jacobi = jacobiP(config.n, alpha, beta, Math.cos(2 * rho))
        const R = norm * cosPow * sinPow * jacobi

        // Angular part. d=3 routes through adsAngularHarmonic's S¹ branch so
        // the AdS₃ bulk is z-invariant (cylindrical); d≥4 evaluates Y_ℓm on
        // the visible 2-sphere. For l=0 the S² case reduces to a constant.
        let Y: number
        if (config.l === 0 && config.d >= 4) {
          Y = 1 / Math.sqrt(4 * Math.PI)
        } else {
          const invR = rCompact > 1e-10 ? 1 / rCompact : 0
          const theta = Math.acos(Math.max(-1, Math.min(1, wz * invR)))
          const phi = Math.atan2(wy, wx)
          Y = adsAngularHarmonic(config.l, config.m, config.d, theta, phi)
        }

        const psi = R * Y
        const rho2 = psi * psi
        reField[pixelIdx] = psi
        bulk[pixelIdx] = rho2
        if (rho2 > peakDensity) peakDensity = rho2
      }
    }
  }

  // Second pass: optional boundary overlay. The asymptotic CFT primary
  // envelope |O|²(Ω) = lim_{ρ→π/2} R²(ρ)/cos^{2Δ}(ρ) · Y² factorises
  // analytically into N² · sin^{2ℓ}(ρ) · P_n^{(α,β)}(cos 2ρ)² · Y_ℓm²(Ω)
  // — the cos^{2Δ} / cos^{−2Δ} factors cancel exactly, so no overflow
  // guard or amplitude cap is needed. Evaluating at the shell ρ (rather
  // than literally ρ = π/2) picks up a smooth sub-leading correction
  // that fades near the shell's outer edge, which is what we want to
  // visualise.
  let boundary: Float32Array | null = null
  let peakBoundary = 0
  if (config.boundaryOverlay) {
    if (useScratch) {
      boundary = scratch!.boundary
      boundary.fill(0)
    } else {
      boundary = new Float32Array(total)
    }
    const norm2 = norm * norm
    for (let z = 0; z < N; z++) {
      const wz = ((z + 0.5) / N) * 2 - 1
      for (let y = 0; y < N; y++) {
        const wy = ((y + 0.5) / N) * 2 - 1
        for (let x = 0; x < N; x++) {
          const wx = ((x + 0.5) / N) * 2 - 1
          const pixelIdx = (z * N + y) * N + x
          const rCompact = Math.sqrt(wx * wx + wy * wy + wz * wz)
          if (rCompact < BOUNDARY_SHELL_MIN || rCompact >= BOUNDARY_SHELL_MAX) continue
          const rho = 2 * Math.atan(rCompact)
          if (rho <= 0 || rho >= Math.PI / 2) continue
          const sinRho = Math.sin(rho)
          const sin2l = config.l === 0 ? 1 : Math.pow(sinRho, 2 * config.l)
          const jacobi = jacobiP(config.n, alpha, beta, Math.cos(2 * rho))
          // Angular part — same dimension-aware routing as the bulk pass so
          // the overlay stays aligned with the bulk angular structure at d=3.
          let Y: number
          if (config.l === 0 && config.d >= 4) {
            Y = 1 / Math.sqrt(4 * Math.PI)
          } else {
            const invR = rCompact > 1e-10 ? 1 / rCompact : 0
            const theta = Math.acos(Math.max(-1, Math.min(1, wz * invR)))
            const phi = Math.atan2(wy, wx)
            Y = adsAngularHarmonic(config.l, config.m, config.d, theta, phi)
          }
          const value = norm2 * sin2l * jacobi * jacobi * Y * Y
          boundary[pixelIdx] = value
          if (value > peakBoundary) peakBoundary = value
        }
      }
    }
  }

  // Third pass: write rgba16float.
  const peakNorm = peakDensity > 0 ? 1 / peakDensity : 0
  const boundaryNorm = peakBoundary > 0 ? 1 / peakBoundary : 0
  for (let i = 0; i < total; i++) {
    const rho2 = bulk[i]!
    const r = clamp01(rho2 * peakNorm)
    const logRho = Math.log(rho2 + 1e-10)
    // ψ is real at t=0 → phase is 0 (ψ ≥ 0) or π (ψ < 0). atan2(0, re) was
    // a per-voxel ~60 ns call; the sign check is ~1 ns.
    const phase = reField[i]! < 0 ? Math.PI : 0
    const a = boundary ? clamp01(boundary[i]! * boundaryNorm) : 0
    packRGBA16F(density, i, r, logRho, phase, a)
  }

  return {
    density,
    gridSize: N,
    bytesPerRow: N * 8,
    rowsPerImage: N,
    peakDensity,
    isTachyon,
    kwFallbackApplied: resolved.kwFallbackApplied,
    effectiveDelta: delta,
  }
}

/** Thickness of the opaque horizon shell (world units). */
const BTZ_HORIZON_SHELL = 0.04
/** Visible-horizon mapping. The thermal profile in dimensionless ρ_w =
 * (rhoW − outerHorizon)/(1 − outerHorizon) is a true geometric invariant of
 * BTZ in L = 1 units — β·ω·√f and (r_+/r)^{2Δ} cancel the r_+ dependence
 * outside the near-horizon ε-clamp. If we drew the horizon at a fixed world
 * radius, moving r_+ would leave the render almost unchanged. To honour the
 * UI's promise that larger r_+ looks bigger (matching the BTZ thermodynamic
 * readouts T_H ∝ r_+, S ∝ r_+, M ∝ r_+²), we scale the horizon's world
 * radius with r_+ under a linear fit clamped inside the unit cube:
 *
 *   visible(r_+) = clamp(0.066 + 0.68·r_+, 0.10, 0.55)
 *
 * Anchors: (0.05 → 0.10), (0.3 → 0.270), (2.0 → 0.55). At the default r_+ =
 * 0.3 this maps to 0.270; the small-r_+ legacy preset (`btzHotSmall` at
 * 0.15) shrinks to ~0.17 and the large-r_+ legacy preset (`btzCoolLarge` at
 * 1.5) saturates at 0.55 — a visible ≈5.5× span.
 */
const BTZ_VISIBLE_HORIZON_MIN = 0.1
const BTZ_VISIBLE_HORIZON_MAX = 0.55

function btzVisibleHorizon(rplus: number): number {
  const raw = 0.066 + 0.68 * rplus
  if (raw < BTZ_VISIBLE_HORIZON_MIN) return BTZ_VISIBLE_HORIZON_MIN
  if (raw > BTZ_VISIBLE_HORIZON_MAX) return BTZ_VISIBLE_HORIZON_MAX
  return raw
}
/** Lower floor on the BTZ compactification coordinate u = r_+/r; below
 * this the mapping r = r_+/u would blow up. u_min = 0.05 ⇒ r_max = 20 r_+. */
const BTZ_U_MIN = 0.05
/** Amplitude written into the horizon-marker voxels. Large enough to
 * saturate the raymarcher's alpha compositor for a crisp black disk. */
const BTZ_HORIZON_MARKER_AMP = BTZ_AMPLITUDE_CEILING * 2

/**
 * Pack the BTZ thermal state onto the density grid. Only called when
 * `config.btzEnabled && config.d === 3`.
 *
 * ## Coordinate map
 * The BTZ spacetime is cylindrically symmetric in (r, φ); the rendered 3D
 * volume packs a z-independent slab so the horizon appears as an opaque
 * cylinder along z — a recognisable black-hole shadow regardless of the
 * camera angle inside the unit cube.
 *
 *   world (x, y, z) ∈ [−1, 1]³  →  ρ_w = √(x² + y²),   φ = atan2(y, x)
 *   ρ_w < `BTZ_WORLD_HORIZON`                          →  inside horizon → density 0
 *   ρ_w ∈ [WH, WH+SHELL]                               →  opaque horizon shell
 *   ρ_w > WH+SHELL                                     →  bulk thermal profile
 *
 * Bulk mapping ρ_w → physical r uses the spec's Poincaré-disk coord
 *   u = r_+ / r ∈ (0, 1]    with    r = r_+ / max(u, BTZ_U_MIN).
 * Outer world radius ρ_w = 1 corresponds to u = BTZ_U_MIN (asymptotic
 * AdS₃ boundary); world radius ρ_w = WH+SHELL corresponds to u = 1
 * (just outside the horizon).
 *
 * @param config - AdS configuration with btzEnabled = true and d = 3.
 * @returns Packed RGBA16F density + diagnostics (isTachyon reported false
 *   for BTZ; effectiveDelta = scalar asymptotic dimension).
 */
export function packBtzThermalDensityGrid(
  config: AntiDeSitterConfig,
  scratch?: AdsPackerScratch,
  targetGridSize: number = DENSITY_GRID_SIZE
): AdsDensityUpload {
  const N = targetGridSize
  const total = N * N * N
  const useScratch = !!scratch && isScratchCompatible(scratch, total)
  const density = useScratch ? scratch!.density : new Uint16Array(total * 4)
  let bulk: Float32Array
  if (useScratch) {
    bulk = scratch!.bulk
    bulk.fill(0)
  } else {
    bulk = new Float32Array(total)
  }

  const rplus = Math.max(config.btzHorizonRadius, 1e-3)
  const L = 1
  const omega = Math.max(config.btzOmega, 1e-3)
  const delta = btzScalarDelta(config.mL)
  const mA = Math.round(config.btzAngularM)
  const T = btzTemperature(rplus, L)
  const beta = T > 1e-8 ? 1 / T : 1e8

  const horizonWorld = btzVisibleHorizon(rplus)
  const outerHorizon = horizonWorld + BTZ_HORIZON_SHELL
  const uRange = 1 - outerHorizon

  let peakDensity = 0
  let horizonFlags: Uint8Array
  if (useScratch) {
    horizonFlags = scratch!.horizonFlags
    horizonFlags.fill(0)
  } else {
    horizonFlags = new Uint8Array(total)
  }

  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      const wy = ((y + 0.5) / N) * 2 - 1
      for (let x = 0; x < N; x++) {
        const wx = ((x + 0.5) / N) * 2 - 1
        const pixelIdx = (z * N + y) * N + x
        const rhoW = Math.sqrt(wx * wx + wy * wy)
        // Clip rendering to the inscribed cylinder so the outer cube corners
        // don't bleed "boundary" density onto the camera path at oblique
        // angles. (wz is always inside the cube by construction.)
        if (rhoW > 1) continue

        if (rhoW < horizonWorld) continue

        if (rhoW <= outerHorizon) {
          // Opaque horizon shell marker.
          bulk[pixelIdx] = BTZ_HORIZON_MARKER_AMP
          horizonFlags[pixelIdx] = 1
          if (BTZ_HORIZON_MARKER_AMP > peakDensity) peakDensity = BTZ_HORIZON_MARKER_AMP
          continue
        }

        // Map ρ_w → u = r_+/r ∈ [u_min, 1]
        const uNorm = 1 - (rhoW - outerHorizon) / uRange
        const uClamped = Math.max(uNorm, BTZ_U_MIN)
        const r = rplus / uClamped
        const phi = Math.atan2(wy, wx)

        const amp = btzThermalAmplitude(r, phi, rplus, L, omega, delta, mA, beta)
        if (amp > 0) {
          bulk[pixelIdx] = amp
          if (amp > peakDensity) peakDensity = amp
        }
      }
    }
  }

  const peakNorm = peakDensity > 0 ? 1 / peakDensity : 0
  for (let i = 0; i < total; i++) {
    const amp = bulk[i]!
    if (amp === 0) {
      packRGBA16F(density, i, 0, Math.log(1e-10), 0, 0)
      continue
    }
    const r = Math.min(amp * peakNorm, 1)
    const logRho = Math.log(amp + 1e-10)
    // Encode horizon marker into the phase channel so the color palette
    // paints horizon voxels with a distinct tone. Value chosen so the
    // cosine-palette lookup lands on a near-black phase colour.
    const phase = horizonFlags[i] === 1 ? Math.PI : 0
    // Route horizon markers into the boundary-overlay channel so the
    // additive A blend in the raymarcher reinforces the shell at low
    // view angles where the shell voxels are thin.
    const a = horizonFlags[i] === 1 ? 1 : 0
    packRGBA16F(density, i, r, logRho, phase, a)
  }

  return {
    density,
    gridSize: N,
    bytesPerRow: N * 8,
    rowsPerImage: N,
    peakDensity,
    isTachyon: false,
    kwFallbackApplied: false,
    effectiveDelta: delta,
  }
}

/** Coarse grid resolution used by the HKLL evaluation. The bulk field is
 *  computed on this grid and trilinearly upsampled to `DENSITY_GRID_SIZE`
 *  before RGBA packing. Sized to keep the CPU pack under ~500 ms on a
 *  typical laptop. At d=3 (S¹ boundary) the convolution is cheap and a
 *  32³ grid fits the budget; at d≥4 (S² boundary) the per-voxel work is
 *  an order of magnitude larger, so we drop the coarse grid to 24³ and
 *  let the trilinear upsampler carry the bulk structure to 96³. */
const HKLL_COARSE_SIZE_S1 = 32
const HKLL_COARSE_SIZE_S2 = 24

/**
 * Pack the HKLL-reconstructed bulk density onto the shared rgba16float
 * texture. Dispatched by `packAntiDeSitterDensityGrid` when
 * `config.hkllEnabled` is true.
 *
 * ## Algorithm
 *
 *   1. Resolve Δ (plus KW-window fallback diagnostic) exactly as the bound-
 *      state path does.
 *   2. Build the boundary profile O(t, Ω') from the selected source mode.
 *   3. Walk the coarse `HKLL_COARSE_SIZE³` grid. For each bulk voxel inside
 *      the Poincaré ball compute φ(t = 0, ρ, θ, φ) by calling
 *      `reconstructBulk` with the default per-dimension sample parameters.
 *   4. Peak-normalise and trilinearly upsample the coarse field to the
 *      renderer-expected `DENSITY_GRID_SIZE³` grid, writing
 *      (|ψ|²/peak, log|ψ|², arg(ψ), 0) into RGBA.
 *
 * The render-time adsEnergy uniform keeps rotating the phase channel at
 * rate E_{n,ℓ} from the current bound-state parameters. This is physically
 * meaningful only in `eigenstate` mode — the other sources are treated as
 * static demonstrations. The alternative (per-mode energy dispatch) would
 * require shader changes that are out of Stage 2B scope.
 */
export function packHkllReconstructedDensityGrid(
  config: AntiDeSitterConfig,
  scratch?: AdsPackerScratch,
  targetGridSize: number = DENSITY_GRID_SIZE
): AdsDensityUpload {
  const N = targetGridSize
  const total = N * N * N
  const useScratch = !!scratch && scratch.density.length >= total * 4
  const density = useScratch ? scratch!.density : new Uint16Array(total * 4)

  const resolved = resolveDelta(config.d, config.mL, config.branch)
  const delta = resolved.delta
  const params: HkllParams = defaultHkllParams(config.d, delta)
  const profile = createBoundaryProfile({
    mode: config.hkllBoundarySource,
    d: config.d,
    delta,
    n: config.n,
    l: config.l,
    m: config.m,
    branch: config.branch,
    sourceSigma: config.hkllSourceSigma,
    planeWaveM: config.hkllPlaneWaveM,
  })

  // Coarse buffers: Re(ψ), Im(ψ). The density |ψ|² is derived from the
  // interpolated (re, im) pair AFTER upsampling — interpolating rho² on its
  // own would produce rho² · trilinear ≠ |re·trilinear|² + |im·trilinear|²
  // at points between opposite-phase voxels (finite density + random phase
  // from quantisation noise = visible sparkle near nodal surfaces).
  const C = config.d <= 3 ? HKLL_COARSE_SIZE_S1 : HKLL_COARSE_SIZE_S2
  const coarseTotal = C ** 3
  let reField: Float32Array
  let imField: Float32Array
  const useCoarseScratch = !!scratch && scratch.hkllRe.length >= coarseTotal
  if (useCoarseScratch) {
    reField = scratch!.hkllRe
    imField = scratch!.hkllIm
    reField.subarray(0, coarseTotal).fill(0)
    imField.subarray(0, coarseTotal).fill(0)
  } else {
    reField = new Float32Array(coarseTotal)
    imField = new Float32Array(coarseTotal)
  }
  let peakDensity = 0

  // Precompute the boundary source samples on the τ' × Ω' grid once. The
  // per-(τ, Ω') value depends only on the boundary coordinate, not on the
  // bulk voxel, so factoring it out of the voxel loop replaces C³ · N_τ ·
  // N_Ω redundant profile() calls with N_τ · N_Ω.
  const sampleGrid = fillBoundarySampleGrid(profile, params)

  for (let z = 0; z < C; z++) {
    const wz = ((z + 0.5) / C) * 2 - 1
    for (let y = 0; y < C; y++) {
      const wy = ((y + 0.5) / C) * 2 - 1
      for (let x = 0; x < C; x++) {
        const wx = ((x + 0.5) / C) * 2 - 1
        const pixelIdx = (z * C + y) * C + x
        const rCompact = Math.sqrt(wx * wx + wy * wy + wz * wz)
        if (rCompact >= 1) continue
        const rho = 2 * Math.atan(rCompact)
        if (rho <= 0 || rho >= Math.PI / 2) continue
        const invR = rCompact > 1e-10 ? 1 / rCompact : 0
        const theta = Math.acos(Math.max(-1, Math.min(1, wz * invR)))
        const phi = Math.atan2(wy, wx)
        reconstructBulkFromSampleGrid(sampleGrid, rho, theta, phi, reField, imField, pixelIdx)
        const re = reField[pixelIdx]!
        const im = imField[pixelIdx]!
        const rho2 = re * re + im * im
        if (rho2 > peakDensity) peakDensity = rho2
      }
    }
  }

  const peakNorm = peakDensity > 1e-20 ? 1 / peakDensity : 0

  // Trilinear upsample into the packed density. rho² is derived from the
  // INTERPOLATED (re, im) pair rather than from a separately-interpolated
  // rho² field, so density and phase stay self-consistent across nodal
  // surfaces (both go to zero together, no sparkly/random phase angle).
  for (let z = 0; z < N; z++) {
    const fz = ((z + 0.5) / N) * C - 0.5
    const iz0 = Math.max(0, Math.min(C - 1, Math.floor(fz)))
    const iz1 = Math.max(0, Math.min(C - 1, iz0 + 1))
    const tz = Math.max(0, Math.min(1, fz - iz0))
    for (let y = 0; y < N; y++) {
      const fy = ((y + 0.5) / N) * C - 0.5
      const iy0 = Math.max(0, Math.min(C - 1, Math.floor(fy)))
      const iy1 = Math.max(0, Math.min(C - 1, iy0 + 1))
      const ty = Math.max(0, Math.min(1, fy - iy0))
      for (let x = 0; x < N; x++) {
        const fx = ((x + 0.5) / N) * C - 0.5
        const ix0 = Math.max(0, Math.min(C - 1, Math.floor(fx)))
        const ix1 = Math.max(0, Math.min(C - 1, ix0 + 1))
        const tx = Math.max(0, Math.min(1, fx - ix0))

        const re = trilinear(reField, C, ix0, iy0, iz0, ix1, iy1, iz1, tx, ty, tz)
        const im = trilinear(imField, C, ix0, iy0, iz0, ix1, iy1, iz1, tx, ty, tz)
        const rho2 = re * re + im * im
        const outIdx = (z * N + y) * N + x

        const r = clamp01(rho2 * peakNorm)
        const logRho = Math.log(rho2 + 1e-10)
        const phase = Math.atan2(im, re)
        packRGBA16F(density, outIdx, r, logRho, phase, 0)
      }
    }
  }

  return {
    density,
    gridSize: N,
    bytesPerRow: N * 8,
    rowsPerImage: N,
    peakDensity,
    // HKLL reconstructions by construction sit above the BF bound (we pick
    // the BF-safe Δ via resolveDelta) and never hit the KW fallback path
    // that the bound-state diagnostics report.
    isTachyon: false,
    kwFallbackApplied: resolved.kwFallbackApplied,
    effectiveDelta: delta,
  }
}

/**
 * Fetch-with-trilinear-interpolation from a coarse Float32 buffer indexed
 * (ix, iy, iz) with per-axis fractional positions (tx, ty, tz) ∈ [0, 1].
 * Returns the interpolated scalar.
 */
function trilinear(
  field: Float32Array,
  size: number,
  ix0: number,
  iy0: number,
  iz0: number,
  ix1: number,
  iy1: number,
  iz1: number,
  tx: number,
  ty: number,
  tz: number
): number {
  const idx = (x: number, y: number, z: number): number => (z * size + y) * size + x
  const c000 = field[idx(ix0, iy0, iz0)]!
  const c100 = field[idx(ix1, iy0, iz0)]!
  const c010 = field[idx(ix0, iy1, iz0)]!
  const c110 = field[idx(ix1, iy1, iz0)]!
  const c001 = field[idx(ix0, iy0, iz1)]!
  const c101 = field[idx(ix1, iy0, iz1)]!
  const c011 = field[idx(ix0, iy1, iz1)]!
  const c111 = field[idx(ix1, iy1, iz1)]!
  const c00 = c000 * (1 - tx) + c100 * tx
  const c10 = c010 * (1 - tx) + c110 * tx
  const c01 = c001 * (1 - tx) + c101 * tx
  const c11 = c011 * (1 - tx) + c111 * tx
  const c0 = c00 * (1 - ty) + c10 * ty
  const c1 = c01 * (1 - ty) + c11 * ty
  return c0 * (1 - tz) + c1 * tz
}
