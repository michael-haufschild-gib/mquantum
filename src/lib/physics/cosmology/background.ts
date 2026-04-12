/**
 * Classical FLRW background computation for the canonical δφ integrator.
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
 * 2. **Per-frame cosmology coefficients** `a, A, B, B_full` used to write the
 *    Free Scalar Field uniform buffer each substep. These drive the canonical
 *    Hamiltonian integrator for the physical perturbation δφ on FLRW:
 *
 *        H(π, δφ, η) = ½ A(η) π²
 *                    + ½ B(η) (∇δφ)²
 *                    + ½ m² B_full(η) δφ²
 *                    + B_full(η) V(δφ)
 *
 *    with `A(η) = a^(−(n−2))`, `B(η) = a^(n−2)`, `B_full(η) = a^n`, where
 *    `n` is the spacetime dimension. Hamilton's equations read
 *
 *        δφ' = A π,   π' = B ∇²δφ − m² B_full δφ − B_full V'(δφ).
 *
 *    This replaces the earlier Mukhanov-Sasaki `v = a^((n−2)/2)·δφ` path:
 *    the `z''/z = β(β−1)/η²` coordinate pole that formulation carried is
 *    gone, and the integrator's physical frequency is the bounded
 *    `ω² = k² + m²·a²` — the leapfrog CFL condition no longer explodes
 *    as `η → 0`.
 *
 * Time convention: we use conformal time `η < 0` for all presets, with the
 * "interesting" boundary at `η → 0⁻`. Deep past is `η → −∞`. Sign of the
 * conformal Hubble rate `ℋ = a'/a` distinguishes expansion from contraction.
 *
 * @module
 */

import { computeBianchiKasnerCoefs } from './bianchiKasner'
import type { CosmologyPreset, CosmologyPresetParams } from './presets'
import { qExponent, sCritical } from './presets'

// ───────────────────────────────────────────────────────────────────────────
// Background ODE (paper eq. 1.16) — Figure 1 phase portrait
// ───────────────────────────────────────────────────────────────────────────

/** Fixed points of the 1D flow. Corresponds to paper eq. (1.21). */
export interface BackgroundFixedPoints {
  /** x₁ = s/s_c — ekpyrotic-FLRW fixed point (positive case). */
  readonly x1: number
  /** x₂ = 1 — positive Kasner-FLRW fixed point. Always exactly 1. */
  readonly x2: number
  /** x₃ = -1 — negative Kasner-FLRW fixed point. Always exactly -1. */
  readonly x3: number
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
 * Integrate the background ODE with **fixed-step** classical RK4 from `x0`
 * over a dimensionless "Hubble time" interval `τEnd`. Used offline to verify
 * attractor convergence in unit tests, and to power the analysis readout that
 * shows `w(τ)` in the FSF analysis panel.
 *
 * Step size `h = τEnd / steps` is constant; the integrator is RK4 with
 * post-step clamping to keep `x` inside the invariant interval `[−1, 1]`
 * (the analytic boundary set by the Hamiltonian constraint).
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

/**
 * Per-substep cosmology coefficients fed into the canonical δφ integrator.
 *
 * Three dimensionless powers of the scale factor are uploaded to the shader:
 *
 * - `aKinetic = a^(−(n−2))` — weights `π²` in the kinetic term and the
 *   drift `δφ' = aKinetic · π`.
 * - `aPotential = a^(n−2)` — weights `(∇δφ)²` in the gradient term and
 *   the kick `π' ⊃ aPotential · ∇²δφ`.
 * - `aFull = a^n` — weights `m²·δφ²` and any self-interaction `V(δφ)` in
 *   the kick `π' ⊃ −mass²·aFull·δφ − aFull·V'(δφ)`.
 *
 * The physical dispersion obtained by combining the drift and kick in the
 * linearised mode is `ω² = aKinetic·(aPotential·k² + mass²·aFull) =
 * k² + mass²·a²` — bounded as `η → 0⁻` whenever `mass·a` is bounded (which
 * is the whole point of switching away from the `v = a^((n−2)/2)·δφ`
 * variables, where the `z''/z = β(β−1)/η²` pole drove the old integrator
 * CFL-unstable at late times).
 */
export interface CosmologyCoefs {
  /** `a^(−(n−2))` — kinetic (drift) coefficient. */
  aKinetic: number
  /** `a^(n−2)` — gradient (potential-stress) coefficient. */
  aPotential: number
  /** `a^n` — full volume-form coefficient for mass and self-interaction. */
  aFull: number
  /**
   * Optional per-axis potential ratio `aPot_1 / aPot_0` for the Bianchi-I
   * Kasner preset. `1` for every isotropic preset (Minkowski, de Sitter,
   * Kasner FLRW, ekpyrotic), so callers can default-substitute
   * `aPotentialRatio1 ?? 1` and stay bit-identical on those paths.
   */
  aPotentialRatio1?: number
  /**
   * Optional per-axis potential ratio `aPot_2 / aPot_0` for the Bianchi-I
   * Kasner preset. `1` under every isotropic preset.
   */
  aPotentialRatio2?: number
}

/** Scalar cosmology quantities evaluated at a single conformal time. */
export interface CosmologySnapshot extends CosmologyCoefs {
  /**
   * Scale factor `a(η)`. Under Bianchi-I this is the geometric-mean gauge
   * scalar `ã = (a_1·a_2·a_3)^(1/(n−1))`, not an axis-specific value.
   */
  a: number
  /**
   * Conformal Hubble rate `ℋ(η) = a'/a`. Under the isotropic FLRW presets
   * this equals `q/η`. Under Bianchi-I it is computed from `ã`.
   */
  hubble: number
}

/**
 * Compute the full per-frame cosmology snapshot at a given conformal time.
 *
 * For the Minkowski preset this returns the trivial `{a: 1, hubble: 0,
 * aKinetic: 1, aPotential: 1, aFull: 1}`, so the canonical leapfrog
 * degenerates bit-identically to the Klein-Gordon integrator on a flat
 * background. For the other three presets we use the closed-form
 * `a(η) = amplitude·|η|^q` with the preset-specific `q` from `presets.ts`
 * and the amplitude gauge from `scaleFactorAmplitude`.
 *
 * @param eta - Conformal time (must be non-zero for non-Minkowski presets)
 * @param params - Preset parameters
 * @returns `{ a, hubble, aKinetic, aPotential, aFull }`
 * @throws {RangeError} If `eta === 0` for a non-Minkowski preset
 */
export function computeCosmologyAt(
  eta: number,
  params: CosmologyPresetParams
): CosmologySnapshot {
  if (params.preset === 'minkowski') {
    return {
      a: 1,
      hubble: 0,
      aKinetic: 1,
      aPotential: 1,
      aFull: 1,
      aPotentialRatio1: 1,
      aPotentialRatio2: 1,
    }
  }

  if (params.preset === 'bianchiKasner') {
    const exp = params.kasnerExponents
    if (!exp) {
      throw new RangeError(
        `computeCosmologyAt: bianchiKasner preset requires kasnerExponents to be set`
      )
    }
    // η must be strictly positive for the Bianchi-I gauge convention
    // `η = (3/2)·t^(2/3)`. computeBianchiKasnerCoefs throws on non-finite
    // / non-positive η — the message matches the acceptance-bar behaviour.
    const b = computeBianchiKasnerCoefs(eta, exp, params.spacetimeDim)
    // Conformal Hubble rate `ℋ = ã'/ã` isn't a closed-form `q/η` here —
    // we use the analytic form derived from `ã = t^(1/(n−1))` and
    // `dη/dt = 1/ã` ⇒ `ã' = (1/(n−1))·t^(1/(n−1)−1)·dt/dη = ã²/((n−1)·t)`.
    // Only consumed by the analysis readout, never by the integrator.
    const n = params.spacetimeDim
    const nm1 = n - 1
    const nm2 = n - 2
    const tProper = Math.pow((eta * nm2) / nm1, nm1 / nm2)
    const hubble = tProper > 0 ? (b.a * b.a) / ((n - 1) * tProper) : 0
    return {
      a: b.a,
      hubble,
      aKinetic: b.aKinetic,
      aPotential: b.aPotential,
      aFull: b.aFull,
      aPotentialRatio1: b.aPotentialRatio1,
      aPotentialRatio2: b.aPotentialRatio2,
    }
  }

  if (!Number.isFinite(eta) || eta === 0) {
    throw new RangeError(`computeCosmologyAt requires eta !== 0 for non-Minkowski, got ${eta}`)
  }

  const n = params.spacetimeDim
  const q = qExponent(params)
  const amplitude = scaleFactorAmplitude(params.preset, params.hubble)
  const absEta = Math.abs(eta)
  const a = amplitude * Math.pow(absEta, q)
  const hubble = q / eta

  // Pre-compute the three powers used by the shader. We avoid `Math.pow(a, n)`
  // when `n − 2 = 0` (latticeDim = 1 — spacetime 2D) so `aPotential = 1`
  // comes out exactly, not `Math.pow(a, 0) = 1` with a rounding artefact.
  const aPotential = n === 2 ? 1 : Math.pow(a, n - 2)
  const aKinetic = n === 2 ? 1 : 1 / aPotential
  const aFull = aPotential * a * a // a^n = a^(n−2) · a²

  return {
    a,
    hubble,
    aKinetic,
    aPotential,
    aFull,
    aPotentialRatio1: 1,
    aPotentialRatio2: 1,
  }
}

/**
 * Evaluate just the three integrator coefficients — avoiding the two extra
 * fields (`a`, `hubble`) that the analysis panel wants but the hot path
 * doesn't need. The per-substep leapfrog loop calls this up to
 * `stepsPerFrame` times per rendered frame; shaving the struct shape keeps
 * the branch-lite and GC-free.
 *
 * @param eta - Conformal time
 * @param params - Preset parameters
 * @returns `{ aKinetic, aPotential, aFull }`
 */
export function computeCosmologyCoefs(
  eta: number,
  params: CosmologyPresetParams
): CosmologyCoefs {
  if (params.preset === 'minkowski') {
    return { aKinetic: 1, aPotential: 1, aFull: 1, aPotentialRatio1: 1, aPotentialRatio2: 1 }
  }
  const snap = computeCosmologyAt(eta, params)
  return {
    aKinetic: snap.aKinetic,
    aPotential: snap.aPotential,
    aFull: snap.aFull,
    aPotentialRatio1: snap.aPotentialRatio1 ?? 1,
    aPotentialRatio2: snap.aPotentialRatio2 ?? 1,
  }
}
