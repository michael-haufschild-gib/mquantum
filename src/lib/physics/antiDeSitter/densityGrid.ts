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
 */
export function packAntiDeSitterDensityGrid(config: AntiDeSitterConfig): AdsDensityUpload {
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
