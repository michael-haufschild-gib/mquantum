/**
 * Bunch-Davies adiabatic vacuum sampler for the canonical δφ integrator.
 *
 * At a sufficiently early conformal time `η₀`, every lattice mode lies deep
 * inside the comoving horizon (`k·|η₀| ≫ 1`). In this adiabatic regime the
 * quantum state of each mode is indistinguishable from an instantaneous
 * harmonic oscillator ground state with the canonical quadratic Hamiltonian
 *
 *     H_k(η₀) = ½ A(η₀) |π_k|² + ½ (B(η₀)·k_lat² + m²·B_full(η₀)) |δφ_k|²
 *
 * where `A = a^(−(n−2))`, `B = a^(n−2)`, `B_full = a^n`. This is a SHO with
 * effective mass `μ = 1/A = B` and stiffness `K = B·k_lat² + m²·B_full`, so
 *
 *     ω_k² = K / μ = A · (B·k_lat² + m²·B_full) = k_lat² + m²·a²(η₀)
 *
 * is the **physical** frequency — bounded by `k_lat` for massless modes,
 * unlike the pathological Mukhanov-Sasaki `v = z·δφ` formulation whose
 * `z''/z = β(β−1)/η²` term drives the CFL condition unstable near `η = 0`.
 *
 * The ground-state variances are
 *
 *     ⟨|δφ_k|²⟩ = 1 / (2 B ω_k),   ⟨|π_δφ,k|²⟩ = B ω_k / 2.
 *
 * We obtain these by sampling the flat-space Minkowski vacuum with the
 * injected dispersion `ω_k² = k_lat² + m²·a²(η₀)` — which yields `(φ_M,
 * π_M)` with variances `1/(2ω_k)` and `ω_k/2` — and then rescaling by
 * `√B = a^((n−2)/2)` to land in the canonical δφ basis.
 *
 * **Why no tachyonic guard anymore?** Under the δφ formulation the
 * effective squared mass `m²·a²` is always non-negative for real `m`, so
 * the adiabatic vacuum is well-defined at any `η₀ ≠ 0`. The old
 * `safeEta0`/`clampEta0` plumbing that the Mukhanov-Sasaki `β(β−1)/η²`
 * bridge required to avoid super-horizon tachyonic modes is preserved as
 * a plain user-facing guardrail ("don't start too close to the
 * singularity") but no longer encodes any physical rejection — every
 * non-Minkowski preset now returns `DEFAULT_SAFE_ETA0` from `safeEta0`.
 *
 * @module
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'

import { computeCosmologyAt } from './background'
import type { CosmologyPresetParams } from './presets'

/**
 * Default minimum `|η₀|` — the user-facing floor returned for every preset.
 *
 * Under the canonical δφ formulation the adiabatic vacuum is well-defined
 * at any non-zero `η₀`, so this constant is purely cosmetic. It's chosen
 * small enough that the four default presets (with `eta0 ∈ {−10, −8}`) and
 * typical user input in the `−10 … −0.5` range pass through unchanged,
 * while still catching the accidental `eta0 = 0` case where the power-law
 * `a(η) = |η|^q` would otherwise blow up. The adaptive CFL sub-stepping
 * in the compute pass handles any late-time stability concerns
 * independently of this floor.
 */
export const DEFAULT_SAFE_ETA0 = 0.1

/**
 * Legacy safety factor preserved for the store plumbing and tests that
 * reference it. The δφ formulation no longer derives a physical floor from
 * it — kept as a named constant so callers don't litter magic numbers.
 */
export const DEFAULT_ETA0_SAFETY_FACTOR = 4

// ───────────────────────────────────────────────────────────────────────────
// Lattice momentum helper
// ───────────────────────────────────────────────────────────────────────────

/**
 * Smallest comoving lattice momentum on a periodic box of size `L = N·a` in
 * each active dimension. The smallest **non-zero** physical momentum is
 * `k_min = 2π/L_max`, where `L_max = max_d (N_d·a_d)`.
 *
 * Exposed for the analysis panel and a handful of test files that use it
 * to compare simulation modes against their comoving-horizon scale.
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

// ───────────────────────────────────────────────────────────────────────────
// Safe initial-time guard
// ───────────────────────────────────────────────────────────────────────────

/**
 * Return the user-facing `|η₀|` floor. Under the δφ formulation the
 * adiabatic vacuum is well-defined at any non-zero `η₀`, so this is no
 * longer a physical constraint — it's just a heuristic to stop the user
 * from starting trivially close to the singularity. A single constant
 * covers every preset (including Minkowski, where `η₀` is irrelevant).
 *
 * Kept as a function (rather than a bare constant) so the public API is
 * stable against future changes to the heuristic.
 *
 * @returns `DEFAULT_SAFE_ETA0`
 */
export function safeEta0(
  _params: CosmologyPresetParams,
  _gridSize: readonly number[],
  _spacing: readonly number[],
  _latticeDim: number,
  _safety: number = DEFAULT_ETA0_SAFETY_FACTOR
): number {
  return DEFAULT_SAFE_ETA0
}

/**
 * Clamp a user-chosen `η₀` so `|η₀| ≥ safeEta0(...)`. Preserves the sign of
 * the user's input — the cosmology module uses the `η < 0` deep-past
 * convention but the clamp is sign-agnostic.
 *
 * @param userEta0 - User-provided initial conformal time
 * @param params - Preset parameters
 * @param gridSize - Lattice size per dimension
 * @param spacing - Lattice spacing per dimension
 * @param latticeDim - Active spatial dimensions
 * @returns `{ eta0, clamped }` where `clamped` reports whether the input was modified
 * @throws {RangeError} If `userEta0` is zero or non-finite
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
 * Draw a Bunch-Davies adiabatic vacuum state in the canonical `(δφ, π_δφ)`
 * variables at conformal time `η₀`.
 *
 * Algorithm:
 *
 * 1. Evaluate the scale factor `a(η₀)` and the gradient coefficient
 *    `B = a^(n−2)` from the preset.
 * 2. Draw a Minkowski-style vacuum sample with the injected physical
 *    dispersion `ω_k² = k_lat² + m²·a²(η₀)`. The existing lattice sampler
 *    accepts this as its `VacuumDispersion` number argument.
 * 3. Rescale to the canonical basis: `δφ = φ_M · B^(−1/2)`,
 *    `π_δφ = π_M · B^(1/2)`. This is a per-site scalar multiply, so the
 *    Hermitian structure and the per-mode amplitude calibration from the
 *    Minkowski sampler transfer intact.
 *
 * The Minkowski preset is handled by the early-out `B = 1` branch — the
 * rescale is a bit-identical no-op and the result collapses to
 * `sampleVacuumSpectrum(config, seed, 'kgFloor')` (for `mass > M_FLOOR`).
 *
 * @param config - Free scalar field configuration (grid shape + mass)
 * @param params - Cosmology preset parameters
 * @param eta0 - Initial conformal time (any finite non-zero value is accepted)
 * @param seed - PRNG seed for deterministic sampling
 * @returns `{ phi, pi }` lattice arrays matching the GPU buffer layout
 */
export function sampleAdiabaticVacuum(
  config: FreeScalarConfig,
  params: CosmologyPresetParams,
  eta0: number,
  seed: number
): { phi: Float32Array; pi: Float32Array } {
  // Minkowski short-circuit: aPotential = 1, nothing to rescale. Route
  // through the explicit-mass dispatch so the Minkowski preset remains
  // bit-identical to the disabled-cosmology path when mass > M_FLOOR.
  if (params.preset === 'minkowski') {
    return sampleVacuumSpectrum(config, seed, config.mass * config.mass)
  }

  const snap = computeCosmologyAt(eta0, params)
  const aSq = snap.a * snap.a
  const massSq = config.mass * config.mass * aSq

  if (!Number.isFinite(massSq)) {
    throw new RangeError(
      `sampleAdiabaticVacuum: non-finite mass²·a² at eta0=${eta0} (a=${snap.a}, mass=${config.mass})`
    )
  }

  // Draw the Minkowski-style ground state with the physical dispersion
  // ω_k² = k_lat² + m²·a². `sampleVacuumSpectrum` with a numeric dispatch
  // plumbs the mass-term through as the `omegaSq` base without any
  // `max(mass, M_FLOOR)` regularization, so the rescale below exactly
  // tracks the per-mode amplitude calibration.
  const { phi: phiM, pi: piM } = sampleVacuumSpectrum(config, seed, massSq)

  // Rescale into the canonical basis δφ = φ_M · B^(−1/2),
  // π_δφ = π_M · B^(1/2) where B = aPotential = a^(n−2). This is the
  // change of variables from the "unit effective mass" harmonic-oscillator
  // sampler to the canonical Hamiltonian variances.
  const sqrtB = Math.sqrt(snap.aPotential)
  // Guard against zero aPotential (would only happen for degenerate presets).
  const invSqrtB = sqrtB > 0 ? 1 / sqrtB : 1
  const phi = new Float32Array(phiM.length)
  const pi = new Float32Array(piM.length)
  for (let i = 0; i < phiM.length; i++) {
    phi[i] = phiM[i]! * invSqrtB
    pi[i] = piM[i]! * sqrtB
  }

  return { phi, pi }
}
