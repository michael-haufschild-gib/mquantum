/**
 * Classical FLRW background computation for the Mukhanov-Sasaki bridge.
 *
 * Two responsibilities:
 *
 * 1. **ODE integrator** for the one-dimensional autonomous system (paper eq. 1.16)
 *
 *        x'(τ) = (n − 1)·(s/s_c − x)·(1 − x²)
 *
 *    which captures the essential dynamics of spatially flat FLRW solutions
 *    to the Einstein-scalar field equations with potential `V(φ) = V₀e^(−sφ)`.
 *    Fixed points `x₁ = s/s_c`, `x₂ = 1`, `x₃ = −1`; effective equation of
 *    state `w(x) = 2x² − 1`. Used for the analysis readout only — the shader
 *    hot path uses the closed-form `q` exponent from `presets.ts`.
 *
 * 2. **Per-frame scalars** `a(η), ℋ(η), z''/z(η), M²_eff(η)` used to write
 *    the Free Scalar Field uniform buffer each render frame. These are
 *    closed-form for the power-law presets (Minkowski, de Sitter, Kasner,
 *    ekpyrotic).
 *
 * Time convention: we use conformal time `η < 0` for all presets, with the
 * "interesting" boundary at `η → 0⁻`. Deep past is `η → −∞`. Sign of the
 * conformal Hubble rate `ℋ = a'/a` distinguishes expansion from contraction.
 *
 * @module
 */

import type { CosmologyPreset, CosmologyPresetParams } from './presets'
import { qExponent, sCritical, zppOverZCoefficient } from './presets'

// ───────────────────────────────────────────────────────────────────────────
// Background ODE (paper eq. 1.16) — Figure 1 phase portrait
// ───────────────────────────────────────────────────────────────────────────

/** Fixed points of the 1D flow. Corresponds to paper eq. (1.21). */
export interface BackgroundFixedPoints {
  /** x₁ = s/s_c — ekpyrotic-FLRW fixed point (positive case). */
  x1: number
  /** x₂ = 1 — positive Kasner-FLRW fixed point. */
  readonly x2: 1
  /** x₃ = -1 — negative Kasner-FLRW fixed point. */
  readonly x3: -1
}

/**
 * Compute the three fixed points of the background ODE for a given `(s, n)`.
 *
 * @param spacetimeDim - Spacetime dimension `n ≥ 3`
 * @param steepness - Paper's potential steepness `s`
 * @returns The three fixed points `{ x1, x2, x3 }`
 */
export function fixedPoints(spacetimeDim: number, steepness: number): BackgroundFixedPoints {
  const sc = sCritical(spacetimeDim)
  return { x1: steepness / sc, x2: 1, x3: -1 }
}

/**
 * Effective equation-of-state parameter `w(x) = 2x² − 1`. Derived from
 * paper eq. (1.20). Reflects the Kasner limit (`w → 1`) when `x → ±1` and
 * the ekpyrotic "ultra-stiff" regime (`w > 1`) when `|x| > 1`.
 *
 * @param x - The state variable from the 1D flow
 * @returns Effective EoS
 */
export function equationOfState(x: number): number {
  return 2 * x * x - 1
}

/**
 * Right-hand side of the background ODE (paper eq. 1.16).
 *
 * @param x - State variable in `[−1, 1]` (Hamiltonian constraint enforces `x² + y = 1`)
 * @param spacetimeDim - Spacetime dimension `n`
 * @param steepness - Paper's potential steepness `s`
 * @returns `x'`
 */
export function backgroundRhs(x: number, spacetimeDim: number, steepness: number): number {
  const sc = sCritical(spacetimeDim)
  return (spacetimeDim - 1) * (steepness / sc - x) * (1 - x * x)
}

/**
 * Integrate the background ODE with adaptive-step classical RK4 from `x0`
 * over a dimensionless "Hubble time" interval `τEnd`. Used offline to verify
 * attractor convergence in unit tests, and to power the analysis readout that
 * shows `w(τ)` in the FSF analysis panel.
 *
 * @param x0 - Initial state (must lie in `[−1, 1]`)
 * @param spacetimeDim - Spacetime dimension `n`
 * @param steepness - Paper's potential steepness `s`
 * @param tauEnd - Dimensionless integration time
 * @param steps - Number of uniform RK4 steps (default 512)
 * @returns Final `x(τEnd)` value
 * @throws {RangeError} If `x0` is outside `[−1, 1]`
 */
export function integrateBackground(
  x0: number,
  spacetimeDim: number,
  steepness: number,
  tauEnd: number,
  steps = 512
): number {
  if (!Number.isFinite(x0) || x0 < -1 || x0 > 1) {
    throw new RangeError(`integrateBackground requires x0 ∈ [−1, 1], got ${x0}`)
  }
  if (!(steps > 0) || !Number.isInteger(steps)) {
    throw new RangeError(`steps must be a positive integer, got ${steps}`)
  }
  const h = tauEnd / steps
  let x = x0
  for (let i = 0; i < steps; i++) {
    const k1 = backgroundRhs(x, spacetimeDim, steepness)
    const k2 = backgroundRhs(x + (h / 2) * k1, spacetimeDim, steepness)
    const k3 = backgroundRhs(x + (h / 2) * k2, spacetimeDim, steepness)
    const k4 = backgroundRhs(x + h * k3, spacetimeDim, steepness)
    x += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
    // Clamp to bounds to tame numerical drift past the invariant ±1 boundary
    if (x > 1) x = 1
    else if (x < -1) x = -1
  }
  return x
}

/**
 * Classify which fixed point a trajectory starting at `x0` converges to in
 * the **future** direction (paper Fig. 1 determines the past attractor; here
 * we pick the forward flow because the `integrateBackground` helper evolves
 * in `+τ`). For ekpyrotic/Kasner use-cases the user typically runs this
 * helper with `-τ` to recover the past attractor.
 *
 * @param x0 - Initial state
 * @param spacetimeDim - Spacetime dimension `n`
 * @param steepness - Paper's potential steepness `s`
 * @returns The fixed-point label the trajectory approaches
 */
export function classifyAttractor(
  x0: number,
  spacetimeDim: number,
  steepness: number
): 'x1' | 'x2' | 'x3' {
  const xFinal = integrateBackground(x0, spacetimeDim, steepness, 50, 2048)
  const { x1 } = fixedPoints(spacetimeDim, steepness)
  const dists: Array<[number, 'x1' | 'x2' | 'x3']> = [
    [Math.abs(xFinal - x1), 'x1'],
    [Math.abs(xFinal - 1), 'x2'],
    [Math.abs(xFinal + 1), 'x3'],
  ]
  dists.sort((a, b) => a[0] - b[0])
  return dists[0]![1]
}

// ───────────────────────────────────────────────────────────────────────────
// Scale factor amplitude convention
// ───────────────────────────────────────────────────────────────────────────

/**
 * The overall prefactor `A` in `a(η) = A·|η|^q` for each preset. This is
 * physically a gauge choice; we fix it consistently so the analysis readouts
 * make sense and the de Sitter case lines up with the textbook form
 * `a(η) = −1/(Hη)`.
 *
 * - Minkowski: `A = 1` (`a ≡ 1`, independent of `η`).
 * - de Sitter: `A = 1/H` so that `a(η) = −1/(Hη) = (1/H)·|η|^(−1)` for `η < 0`.
 * - Kasner / ekpyrotic: `A = 1` (unit-scale convention; the overall amplitude
 *   drops out of the power spectrum of a free massless scalar, and the mass
 *   term is set by the user through `FreeScalarConfig.mass`).
 *
 * @param preset - Preset identifier
 * @param hubble - Hubble rate `H` (de Sitter only; must be positive)
 * @returns The prefactor `A`
 */
export function scaleFactorAmplitude(preset: CosmologyPreset, hubble: number | undefined): number {
  if (preset === 'minkowski') return 1
  if (preset === 'deSitter') {
    if (typeof hubble !== 'number' || !Number.isFinite(hubble) || hubble <= 0) {
      throw new RangeError(`deSitter preset requires hubble > 0, got ${hubble}`)
    }
    return 1 / hubble
  }
  return 1
}

// ───────────────────────────────────────────────────────────────────────────
// Per-frame cosmology snapshot
// ───────────────────────────────────────────────────────────────────────────

/** Scalar cosmology quantities evaluated at a single conformal time. */
export interface CosmologySnapshot {
  /** Scale factor `a(η)`. */
  a: number
  /** Conformal Hubble rate `ℋ(η) = a'/a = q/η`. Negative for contracting. */
  hubble: number
  /** Mukhanov-Sasaki term `z''/z = β(β − 1)/η²`. */
  zppOverZ: number
  /**
   * Effective squared mass fed into the shader:
   *     M²_eff(η) = a²(η)·m² − z''(η)/z(η)
   */
  mEffSq: number
}

/**
 * Compute the per-frame cosmology scalars at a given conformal time.
 *
 * For the Minkowski preset this returns the trivial `{a: 1, hubble: 0,
 * zppOverZ: 0, mEffSq: mass²}`, so the shader path degenerates to the
 * current Klein-Gordon behaviour — bit-identical by construction.
 *
 * @param eta - Conformal time (must be non-zero for non-Minkowski presets)
 * @param params - Preset parameters
 * @param mass - Physical scalar mass (enters via `a²·m²`)
 * @returns The snapshot `{ a, hubble, zppOverZ, mEffSq }`
 * @throws {RangeError} If `eta === 0` for a non-Minkowski preset
 */
export function computeCosmologyAt(
  eta: number,
  params: CosmologyPresetParams,
  mass: number
): CosmologySnapshot {
  if (params.preset === 'minkowski') {
    return { a: 1, hubble: 0, zppOverZ: 0, mEffSq: mass * mass }
  }

  if (!Number.isFinite(eta) || eta === 0) {
    throw new RangeError(`computeCosmologyAt requires eta !== 0 for non-Minkowski, got ${eta}`)
  }

  const q = qExponent(params)
  const amplitude = scaleFactorAmplitude(params.preset, params.hubble)
  const absEta = Math.abs(eta)
  const a = amplitude * Math.pow(absEta, q)
  const hubble = q / eta
  const zppCoef = zppOverZCoefficient(params)
  const zppOverZ = zppCoef / (eta * eta)
  const mEffSq = a * a * mass * mass - zppOverZ

  return { a, hubble, zppOverZ, mEffSq }
}

/**
 * Evaluate just the effective squared mass — the only scalar the shader
 * consumes per frame. Skips computing `a` and `ℋ` when the analysis panel
 * isn't open.
 *
 * @param eta - Conformal time
 * @param params - Preset parameters
 * @param mass - Physical scalar mass
 * @returns `M²_eff(η)`
 */
export function effectiveMassSquared(
  eta: number,
  params: CosmologyPresetParams,
  mass: number
): number {
  return computeCosmologyAt(eta, params, mass).mEffSq
}
