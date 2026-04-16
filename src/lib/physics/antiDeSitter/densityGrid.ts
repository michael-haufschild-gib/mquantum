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
import { packRGBA16F } from '@/lib/physics/freeScalar/kSpaceOccupation'

import { BTZ_AMPLITUDE_CEILING, btzScalarDelta, btzTemperature, btzThermalAmplitude } from './btz'
import { jacobiP, radialNorm, resolveDelta, sphericalHarmonicReal } from './math'

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

const BOUNDARY_SHELL_MIN = 0.975
const BOUNDARY_SHELL_MAX = 0.995
const BOUNDARY_OVERLAY_MAX = 100
const WORLD_HALF_EXTENT = 1.0

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

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
export function packAntiDeSitterDensityGrid(config: AntiDeSitterConfig): AdsDensityUpload {
  if (config.btzEnabled && config.d === 3) {
    return packBtzThermalDensityGrid(config)
  }
  const N = DENSITY_GRID_SIZE
  const total = N * N * N
  const density = new Uint16Array(total * 4)

  const resolved = resolveDelta(config.d, config.mL, config.branch)
  const delta = resolved.delta
  const half = (config.d - 1) / 2
  const disc = half * half + (config.mL >= 0 ? config.mL * config.mL : -(config.mL * config.mL))
  const isTachyon = disc < 0

  const alpha = config.l + (config.d - 3) / 2
  const beta = delta - (config.d - 1) / 2
  const norm = radialNorm(config.n, config.l, delta, config.d)

  // First pass: compute bulk density at every voxel and track peak.
  const bulk = new Float32Array(total)
  const reField = new Float32Array(total)
  const imField = new Float32Array(total)
  let peakDensity = 1e-20

  for (let z = 0; z < N; z++) {
    const wz = ((z + 0.5) / N) * 2 - 1
    for (let y = 0; y < N; y++) {
      const wy = ((y + 0.5) / N) * 2 - 1
      for (let x = 0; x < N; x++) {
        const wx = ((x + 0.5) / N) * 2 - 1
        const pixelIdx = (z * N + y) * N + x
        const rCompact = Math.sqrt(wx * wx + wy * wy + wz * wz) / WORLD_HALF_EXTENT
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

        // Angular part on the 2-sphere slice. For l = 0 the harmonic is a
        // constant 1/√(4π); use the explicit formula to skip the associated
        // Legendre path.
        let Y: number
        if (config.l === 0) {
          Y = 1 / Math.sqrt(4 * Math.PI)
        } else {
          const radius3D = Math.sqrt(wx * wx + wy * wy + wz * wz)
          const invR = radius3D > 1e-10 ? 1 / radius3D : 0
          const theta = Math.acos(Math.max(-1, Math.min(1, wz * invR)))
          const phi = Math.atan2(wy, wx)
          Y = sphericalHarmonicReal(config.l, config.m, theta, phi)
        }

        const psi = R * Y
        const rho2 = psi * psi
        reField[pixelIdx] = psi
        // Bound-state eigenstates are real at t=0; the complex time factor
        // e^{-iEt} (stable) or cosh(γt) (tachyon) is applied by the volume
        // raymarcher via the adsEnergy / adsGrowthRate uniforms, so no imag
        // component is baked into the grid.
        imField[pixelIdx] = 0
        bulk[pixelIdx] = rho2
        if (rho2 > peakDensity) peakDensity = rho2
      }
    }
  }

  // Second pass: optional boundary overlay magnitude. We evaluate
  // |ψ|²·cos^{-2Δ}(ρ) on the thin shell r ∈ [0.975, 0.995] (compactified
  // coordinate), then clamp and normalise against the bulk peak so channel A
  // stays in [0, 1] for the downstream raymarcher.
  const boundary = new Float32Array(total)
  let peakBoundary = 0
  if (config.boundaryOverlay) {
    const boundaryCap = BOUNDARY_OVERLAY_MAX * peakDensity
    for (let z = 0; z < N; z++) {
      const wz = ((z + 0.5) / N) * 2 - 1
      for (let y = 0; y < N; y++) {
        const wy = ((y + 0.5) / N) * 2 - 1
        for (let x = 0; x < N; x++) {
          const wx = ((x + 0.5) / N) * 2 - 1
          const pixelIdx = (z * N + y) * N + x
          const rCompact = Math.sqrt(wx * wx + wy * wy + wz * wz) / WORLD_HALF_EXTENT
          if (rCompact < BOUNDARY_SHELL_MIN || rCompact >= BOUNDARY_SHELL_MAX) continue
          const rho = 2 * Math.atan(rCompact)
          if (rho <= 0 || rho >= Math.PI / 2) continue
          const cosRho = Math.cos(rho)
          // cos^{-2Δ}(ρ) grows rapidly near ρ=π/2; rely on the cap below
          // rather than attempting analytical clamping.
          const cosPower = Math.pow(cosRho, -2 * delta)
          const rho2 = bulk[pixelIdx]!
          let value = rho2 * cosPower
          if (!Number.isFinite(value)) value = boundaryCap
          if (value > boundaryCap) value = boundaryCap
          boundary[pixelIdx] = value
          if (value > peakBoundary) peakBoundary = value
        }
      }
    }
  }

  // Third pass: write rgba16float.
  const peakNorm = peakDensity > 1e-20 ? 1 / peakDensity : 0
  const boundaryNorm = peakBoundary > 1e-20 ? 1 / peakBoundary : 0
  for (let i = 0; i < total; i++) {
    const rho2 = bulk[i]!
    const r = clamp01(rho2 * peakNorm)
    const logRho = Math.log(rho2 + 1e-10)
    const phase = Math.atan2(imField[i]!, reField[i]!)
    const a = clamp01(boundary[i]! * boundaryNorm)
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

/** World radius at which the BTZ horizon is drawn. Independent of r_+ so
 * sliding r_+ changes the thermal spectrum but leaves the horizon at the
 * same visible scale — keeps the rendered object framed inside the unit
 * cube for the full slider range. */
const BTZ_WORLD_HORIZON = 0.35
/** Thickness of the opaque horizon shell (world units). */
const BTZ_HORIZON_SHELL = 0.04
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
export function packBtzThermalDensityGrid(config: AntiDeSitterConfig): AdsDensityUpload {
  const N = DENSITY_GRID_SIZE
  const total = N * N * N
  const density = new Uint16Array(total * 4)
  const bulk = new Float32Array(total)

  const rplus = Math.max(config.btzHorizonRadius, 1e-3)
  const L = 1
  const omega = Math.max(config.btzOmega, 1e-3)
  const delta = btzScalarDelta(config.mL)
  const mA = Math.round(config.btzAngularM)
  const T = btzTemperature(rplus, L)
  const beta = T > 1e-8 ? 1 / T : 1e8

  const outerHorizon = BTZ_WORLD_HORIZON + BTZ_HORIZON_SHELL
  const uRange = 1 - outerHorizon

  let peakDensity = 1e-20
  const horizonFlags = new Uint8Array(total)

  for (let z = 0; z < N; z++) {
    const wz = ((z + 0.5) / N) * 2 - 1
    for (let y = 0; y < N; y++) {
      const wy = ((y + 0.5) / N) * 2 - 1
      for (let x = 0; x < N; x++) {
        const wx = ((x + 0.5) / N) * 2 - 1
        const pixelIdx = (z * N + y) * N + x
        const rhoW = Math.sqrt(wx * wx + wy * wy)
        // Clip rendering to the inscribed cylinder (keep corners empty so
        // the outer cube faces don't bleed "boundary" density onto the
        // camera path at oblique angles).
        if (rhoW > 1 || Math.abs(wz) > 1) continue

        if (rhoW < BTZ_WORLD_HORIZON) continue

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

  const peakNorm = peakDensity > 1e-20 ? 1 / peakDensity : 0
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
