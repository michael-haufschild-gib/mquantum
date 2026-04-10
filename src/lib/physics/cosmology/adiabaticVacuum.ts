/**
 * Bunch-Davies adiabatic vacuum sampler for the Mukhanov-Sasaki bridge.
 *
 * At a sufficiently early conformal time `η₀`, all modes of the lattice field
 * lie deep inside the comoving horizon (`k²·η₀² ≫ |β(β − 1)|`). In this
 * adiabatic regime the quantum state of each mode is indistinguishable from
 * a free Minkowski vacuum whose dispersion is
 *
 *     ω_k²(η₀) = k_lat² + M²_eff(η₀) = k_lat² + a²(η₀)·m² − z''(η₀)/z(η₀)
 *
 * so we can reuse the existing Klein-Gordon vacuum sampler verbatim with
 * `mass_eff = √(max(M²_eff, 0))` injected in place of `config.mass`. The
 * `safeEta0` helper enforces the adiabatic condition by pushing `|η₀|` to a
 * depth at which the smallest non-zero lattice mode satisfies
 *
 *     k_min²·η₀² ≥ safety · |β(β − 1)|
 *
 * For `β(β − 1) ≤ 0` the effective mass is non-tachyonic at all `η` and any
 * `|η₀| > 0` is admissible; we return a generous default in that case.
 *
 * **Limitations.**
 *
 * 1. The sampler treats the zero mode `k = 0` with the existing `M_FLOOR`
 *    regularisation inherited from `vacuumSpectrum.ts`. This is not the
 *    "true" adiabatic vacuum for the zero mode (which would require solving
 *    the mode equation analytically), but it matches what the free-scalar
 *    pass already does.
 * 2. For a tachyonic effective mass (`M²_eff < 0`), super-horizon modes have
 *    `ω_k² < 0` and the adiabatic vacuum is undefined. The `safeEta0`
 *    constraint eliminates this by construction at `η₀`; dynamics from
 *    `η₀ → 0` then generates the squeezing via the leapfrog integrator.
 *
 * @module
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'

import { computeCosmologyAt } from './background'
import type { CosmologyPresetParams } from './presets'
import { zppOverZCoefficient } from './presets'

/** Default minimum |η₀| when the regime is non-tachyonic. */
export const DEFAULT_SAFE_ETA0 = 10

/** Safety factor applied to the sub-horizon condition `k_min²·η₀² ≥ safety·|β(β−1)|`. */
export const DEFAULT_ETA0_SAFETY_FACTOR = 4

// ───────────────────────────────────────────────────────────────────────────
// Safe initial-time clamp
// ───────────────────────────────────────────────────────────────────────────

/**
 * Smallest comoving lattice momentum on a periodic box of size `L = N·a` in
 * each active dimension. The smallest **non-zero** physical momentum is
 * `k_min = 2π/L_max`, where `L_max = max_d (N_d·a_d)`.
 *
 * @param gridSize - Number of sites per dimension
 * @param spacing - Lattice spacing per dimension
 * @param latticeDim - Active spatial dimensions
 * @returns `k_min` (strictly positive for any non-degenerate lattice)
 * @throws {RangeError} If no dimension has at least 2 sites
 */
export function minLatticeMomentum(
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number
): number {
  let maxL = 0
  for (let d = 0; d < latticeDim; d++) {
    const N = gridSize[d]!
    const a = spacing[d]!
    if (N >= 2 && a > 0) {
      const L = N * a
      if (L > maxL) maxL = L
    }
  }
  if (maxL <= 0) {
    throw new RangeError('minLatticeMomentum: no dimension has at least 2 sites')
  }
  return (2 * Math.PI) / maxL
}

/**
 * Compute the closest-to-zero admissible `|η₀|` for the adiabatic vacuum
 * condition on the given lattice. For non-tachyonic regimes (`β(β − 1) ≤ 0`,
 * which includes the Minkowski and Kasner presets and high-steepness
 * ekpyrotic) the condition is vacuous and we return `DEFAULT_SAFE_ETA0`.
 *
 * Physical derivation: we require `k_min² + M²_eff(η₀) > 0`, ignoring the
 * mass contribution which only relaxes the bound. For a massless scalar,
 * `M²_eff = −β(β − 1)/η²`, so the condition becomes
 * `|η₀|² ≥ safety·β(β − 1)/k_min²` (only binding when `β(β − 1) > 0`).
 *
 * @param params - Preset parameters
 * @param gridSize - Lattice size per dimension
 * @param spacing - Lattice spacing per dimension
 * @param latticeDim - Active spatial dimensions
 * @param safety - Over-saturation factor (default `DEFAULT_ETA0_SAFETY_FACTOR`)
 * @returns Minimum allowed `|η₀|`
 */
export function safeEta0(
  params: CosmologyPresetParams,
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number,
  safety: number = DEFAULT_ETA0_SAFETY_FACTOR
): number {
  if (params.preset === 'minkowski') return DEFAULT_SAFE_ETA0
  const zpp = zppOverZCoefficient(params)
  if (zpp <= 0) return DEFAULT_SAFE_ETA0

  const kMin = minLatticeMomentum(gridSize, spacing, latticeDim)
  const etaSqMin = (safety * zpp) / (kMin * kMin)
  return Math.sqrt(etaSqMin)
}

/**
 * Clamp a user-chosen `η₀` so that `|η₀| ≥ safeEta0(...)`. Preserves the
 * user's sign convention — we use `η < 0` throughout the cosmology module
 * but the clamp is sign-agnostic.
 *
 * @param userEta0 - User-provided initial conformal time
 * @param params - Preset parameters
 * @param gridSize - Lattice size per dimension
 * @param spacing - Lattice spacing per dimension
 * @param latticeDim - Active spatial dimensions
 * @returns `{ eta0, clamped }` where `clamped` reports whether the input was modified
 */
export function clampEta0(
  userEta0: number,
  params: CosmologyPresetParams,
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number
): { eta0: number; clamped: boolean } {
  if (!Number.isFinite(userEta0) || userEta0 === 0) {
    throw new RangeError(`clampEta0: userEta0 must be a non-zero finite number, got ${userEta0}`)
  }
  const minAbs = safeEta0(params, gridSize, spacing, latticeDim)
  const sign = userEta0 < 0 ? -1 : 1
  const absUser = Math.abs(userEta0)
  if (absUser >= minAbs) return { eta0: userEta0, clamped: false }
  return { eta0: sign * minAbs, clamped: true }
}

// ───────────────────────────────────────────────────────────────────────────
// Adiabatic vacuum sampler
// ───────────────────────────────────────────────────────────────────────────

/**
 * Draw a Bunch-Davies adiabatic vacuum state for the Mukhanov-Sasaki field
 * at conformal time `η₀`. Delegates to the existing lattice vacuum sampler
 * with an injected effective mass.
 *
 * The returned `{ phi, pi }` buffers are in the **conformal** variable
 * `v = a^((n−2)/2)·δφ`. The Free Scalar Field compute pass evolves them
 * forward via leapfrog with a time-dependent mass term supplied by
 * `computeCosmologyAt(η, ...)`.
 *
 * @param config - Free scalar field configuration (grid shape + mass)
 * @param params - Cosmology preset parameters
 * @param eta0 - Initial conformal time (must satisfy `|η₀| ≥ safeEta0(...)`)
 * @param seed - PRNG seed for deterministic sampling
 * @returns `{ phi, pi }` lattice arrays matching the GPU buffer layout
 * @throws {RangeError} If the adiabatic condition is violated at `eta0`
 */
export function sampleAdiabaticVacuum(
  config: FreeScalarConfig,
  params: CosmologyPresetParams,
  eta0: number,
  seed: number
): { phi: Float32Array; pi: Float32Array } {
  const snapshot = computeCosmologyAt(eta0, params, config.mass)
  const mEffSq = snapshot.mEffSq

  // Sub-horizon safety: with m ≥ 0 and mEffSq ≥ 0, the existing lattice sampler
  // is exact. We reject configurations that would leave super-horizon modes
  // without a well-defined adiabatic vacuum.
  if (!Number.isFinite(mEffSq)) {
    throw new RangeError(`sampleAdiabaticVacuum: non-finite mEffSq at eta0=${eta0}`)
  }
  if (mEffSq < 0) {
    const kMin = minLatticeMomentum(config.gridSize, config.spacing, config.latticeDim)
    if (kMin * kMin + mEffSq <= 0) {
      throw new RangeError(
        `sampleAdiabaticVacuum: tachyonic super-horizon modes at eta0=${eta0} ` +
          `(kMin²=${kMin * kMin}, mEffSq=${mEffSq}). Use clampEta0 to push eta0 deeper into the past.`
      )
    }
  }

  // Reproduce the Mukhanov-Sasaki dispersion ω_k² = k_lat² + M²_eff(η₀)
  // exactly — including the tachyonic-but-safe branch `M²_eff < 0` with
  // `kMin² + M²_eff > 0`, which the old path silently replaced with
  // `effectiveMass = 0`. The sampler's third argument bypasses the
  // `max(mass, M_FLOOR)` clamp and uses `omegaSqMassTerm` directly.
  return sampleVacuumSpectrum(config, seed, mEffSq)
}
