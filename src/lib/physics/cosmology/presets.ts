/**
 * Cosmological background presets for the canonical δφ integrator.
 *
 * Defines regimes under which the Free Scalar Field mode can evolve:
 *
 * - `minkowski`   — flat spacetime, `a = 1` (bit-identical to the default FSF pass)
 * - `deSitter`      — exponential inflation, `a ∝ |η|^(-1)`, scale-invariant spectrum
 * - `kasner`        — positive Kasner FLRW (`V₀ = 0`, `x = 1`), stiff-fluid limit
 * - `ekpyrotic`     — positive ekpyrotic FLRW (`V₀ = -1`, `s > s_c`), the regime
 *                     whose nonlinear stability is proven in Beyer et al. (2026)
 * - `bianchiKasner` — anisotropic Bianchi-I Kasner background with per-axis scale factors
 * - `lqcBounce`     — loop-quantum-cosmology bounce from tabulated Friedmann dynamics
 *
 * Isotropic power-law presets share the closed-form scale factor
 * `a(η) = A·|η|^q`, so the legacy Mukhanov-Sasaki effective mass would be
 *
 *     z''/z = β·(β − 1)/η²       with   β = q·(n − 2)/2,   z = a^((n − 2)/2)
 *
 * which is the expression fed into the shader uniform `mEffSq`.
 *
 * Derivations:
 *
 * - Kasner / ekpyrotic forms match Beyer–Garfinkle–Isenberg–Oliynyk eqs. (3.38)
 *   and (3.41): the physical metric in the conformal representation is
 *   `g = a²(t)·(-dt² + Σdxᵢ²)` with
 *
 *       a_Kasner ∝ t^(1/(n−2))                          ⟹  q = 1/(n−2)
 *       a_ekpyrotic ∝ t^((1−R)/(n−2))                    ⟹  q = s_c²/((n−1)s² − s_c²)
 *
 *   where `R = (n−1)(s² − s_c²)/((n−1)s² − s_c²)` (paper eq. 3.41) and
 *   `s_c = √(8(n−1)/(n−2))` is the critical steepness (eq. 1.17).
 *
 * - de Sitter: `a(t_cosmic) = e^(Ht)` ⟹ conformal time `η = −e^(−Ht)/H`,
 *   giving `a(η) = −1/(Hη)` ⟹ `q = −1`, standard textbook form.
 *
 * @module
 */

// ───────────────────────────────────────────────────────────────────────────
// Types & constants
// ───────────────────────────────────────────────────────────────────────────

import type { KasnerExponents } from './bianchiKasner'

/** Cosmological background preset identifier. */
export type CosmologyPreset =
  | 'minkowski'
  | 'deSitter'
  | 'ekpyrotic'
  | 'kasner'
  | 'bianchiKasner'
  | 'lqcBounce'

/** All preset keys in a stable UI order. */
export const COSMOLOGY_PRESETS: readonly CosmologyPreset[] = [
  'minkowski',
  'deSitter',
  'ekpyrotic',
  'kasner',
  'bianchiKasner',
  'lqcBounce',
] as const

/** Runtime guard for data loaded from URLs, persisted scenes, or devtools. */
export function isCosmologyPreset(value: unknown): value is CosmologyPreset {
  return typeof value === 'string' && (COSMOLOGY_PRESETS as readonly string[]).includes(value)
}

/** Minimum spacetime dimension supported (paper requires `n ≥ 3`). */
export const MIN_SPACETIME_DIM = 3

/** Maximum spacetime dimension (latticeDim ≤ 6 ⟹ spacetime n ≤ 7). */
export const MAX_SPACETIME_DIM = 7

// ───────────────────────────────────────────────────────────────────────────
// Critical steepness
// ───────────────────────────────────────────────────────────────────────────

/**
 * Critical steepness `s_c(n) = √(8(n − 1)/(n − 2))` from paper eq. (1.17).
 *
 * The ekpyrotic regime is defined by `s > s_c`. At `s = s_c` the two fixed
 * points x₁ and x₂ of the background ODE coincide and the system is
 * degenerate. For `s < s_c` the positive ekpyrotic fixed point becomes
 * past-unstable (see paper Table 1).
 *
 * @param spacetimeDim - Spacetime dimension `n ≥ 3`
 * @returns The critical steepness `s_c(n)`
 * @throws {RangeError} If `spacetimeDim < 3`
 */
export function sCritical(spacetimeDim: number): number {
  if (!Number.isFinite(spacetimeDim) || spacetimeDim < MIN_SPACETIME_DIM) {
    throw new RangeError(
      `sCritical requires spacetimeDim >= ${MIN_SPACETIME_DIM}, got ${spacetimeDim}`
    )
  }
  return Math.sqrt((8 * (spacetimeDim - 1)) / (spacetimeDim - 2))
}

// ───────────────────────────────────────────────────────────────────────────
// Closed-form exponent q in a(η) = A·|η|^q
// ───────────────────────────────────────────────────────────────────────────

/**
 * Parameters defining a cosmological background in power-law conformal form.
 *
 * `steepness` is only consulted for the ekpyrotic preset. `hubble` is only
 * consulted for the de Sitter preset; it sets the prefactor `a(η) = −1/(Hη)`
 * but does not affect the conformal-time exponent.
 */
export interface CosmologyPresetParams {
  /** Which preset to evaluate */
  preset: CosmologyPreset
  /** Spacetime dimension `n` (spatial dim + 1) */
  spacetimeDim: number
  /** Paper's steepness `s` (ekpyrotic only); must satisfy `s > s_c(n)` */
  steepness?: number
  /** Hubble rate `H > 0` for de Sitter (sets the overall amplitude) */
  hubble?: number
  /**
   * Kasner exponent triple `(p₁, p₂, p₃)` for the `bianchiKasner` preset.
   * Required under that preset; ignored for all others. The vacuum
   * solution requires `Σp_i = 1 ∧ Σp_i² = 1` but the evaluator accepts
   * any finite triple — the store may deliberately choose a non-vacuum
   * Bianchi-I background.
   */
  kasnerExponents?: KasnerExponents
  /**
   * LQC critical density `ρ_c > 0` (only consulted for `lqcBounce`). Sets
   * the density at which the Hubble rate vanishes and the pre-bounce
   * contraction switches to post-bounce expansion.
   */
  lqcRhoCritical?: number
  /**
   * LQC matter equation-of-state `w ∈ [0, 1]` (only consulted for
   * `lqcBounce`). Default path is the stiff-fluid `w = 1` case which
   * admits the closed-form `ρ(τ) = ρ_c / (1 + γτ²)` analytic solution.
   */
  lqcEquationOfState?: number
  /**
   * LQC initial `ρ/ρ_c` ratio at the pre-bounce window edge, `(0, 1)`.
   * Only consulted for `lqcBounce`; controls how far into the Kasner
   * asymptote the integration starts.
   */
  lqcInitialRhoRatio?: number
}

/**
 * Conformal-time exponent `q` such that `a(η) = A·|η|^q`.
 *
 * | Preset     | q                               |
 * |------------|---------------------------------|
 * | minkowski  | 0                               |
 * | deSitter   | −1                              |
 * | kasner     | 1/(n − 2)                       |
 * | ekpyrotic  | s_c²/((n − 1)s² − s_c²)         |
 *
 * Ekpyrotic validity: requires `s > s_c(n)`, otherwise the expression changes
 * sign / diverges and the Mukhanov-Sasaki bridge does not apply.
 *
 * @param params - Preset parameters
 * @returns The exponent `q`
 * @throws {RangeError} If the ekpyrotic preset is selected without a valid
 *                      `steepness > s_c(n)`
 */
export function qExponent(params: CosmologyPresetParams): number {
  const { preset, spacetimeDim } = params

  // Always validate spacetimeDim, regardless of preset. The previous form
  // skipped validation for Minkowski and de Sitter, allowing nonsense
  // values like `n = -5` to pass silently. The Mukhanov-Sasaki bridge is
  // physically defined only for `n ∈ [3, 7]`, so a single guard at the
  // top of `qExponent` is the simplest contract.
  validateSpacetimeDim(spacetimeDim)
  if (!isCosmologyPreset(preset)) {
    throw new RangeError(`unknown cosmology preset: ${String(preset)}`)
  }

  if (preset === 'minkowski') return 0
  if (preset === 'deSitter') return -1
  if (preset === 'kasner') {
    return 1 / (spacetimeDim - 2)
  }
  if (preset === 'lqcBounce') {
    // LQC bounce is NOT a closed-form scalar-q FLRW preset — the scale
    // factor has a local minimum at the bounce and the three cosmology
    // coefficients come from a dense tabulated look-up in
    // `lqcBounce.ts`, consumed by `computeCosmologyAt` directly. Mirror
    // the Bianchi-I branch: throw so mis-routed callers (e.g. the
    // Mukhanov-Sasaki `β(β−1)/η²` helper) are found at runtime.
    throw new RangeError(
      `qExponent is not defined for preset='lqcBounce' — use evaluateLqcBounceCoefs directly.`
    )
  }
  if (preset === 'bianchiKasner') {
    // Bianchi-I vacuum Kasner is NOT a closed-form scalar-q FLRW preset —
    // the scale factor is anisotropic `a_i(t) = t^{p_i}` and the three
    // cosmology coefs come from `computeBianchiKasnerCoefs` (per axis).
    // Callers that reach this branch are reaching for the wrong helper
    // (e.g. the Mukhanov-Sasaki `β(β−1)/η²` coefficient), which is not
    // defined here. `computeCosmologyAt` dispatches around this branch
    // directly. We throw so mis-routed call sites are found at runtime
    // rather than silently returning garbage.
    throw new RangeError(
      `qExponent is not defined for preset='bianchiKasner' — use computeBianchiKasnerCoefs directly.`
    )
  }

  // ekpyrotic
  const s = params.steepness
  if (typeof s !== 'number' || !Number.isFinite(s)) {
    throw new RangeError(`ekpyrotic preset requires a finite steepness, got ${s}`)
  }
  const sc = sCritical(spacetimeDim)
  if (s <= sc) {
    throw new RangeError(
      `ekpyrotic preset requires steepness > s_c(n=${spacetimeDim})=${sc}, got ${s}`
    )
  }
  const denom = (spacetimeDim - 1) * s * s - sc * sc
  // denom > 0 is guaranteed by s > s_c: (n-1)s² > (n-1)s_c² ≥ s_c² for n ≥ 2.
  return (sc * sc) / denom
}

// ───────────────────────────────────────────────────────────────────────────
// Mukhanov-Sasaki effective mass coefficient
// ───────────────────────────────────────────────────────────────────────────

/**
 * Dimensionless coefficient `β·(β − 1)` appearing in the Mukhanov-Sasaki term
 *
 *     z''/z = β·(β − 1)/η²,   β = q·(n − 2)/2
 *
 * Because `a(η) = A·|η|^q`, `z = a^((n − 2)/2) ∝ |η|^β`, so two derivatives
 * yield `z''/z = β(β − 1)·η^(−2)`. This coefficient is the only regime-dependent
 * scalar the shader needs; the full `M²_eff(η)` is assembled per frame as
 *
 *     M²_eff(η) = a²(η)·m² − β(β − 1)/η²
 *
 * Sign intuition:
 *
 * - `β(β − 1) > 0` → oscillatory, spectrum blue
 * - `β(β − 1) < 0` → tachyonic super-horizon growth (de Sitter, mild Kasner)
 *
 * @param params - Preset parameters
 * @returns `β·(β − 1)` for the chosen preset
 * @throws {RangeError} For the anisotropic / tabulated presets
 *   (`bianchiKasner`, `lqcBounce`): the Mukhanov-Sasaki `β(β−1)/η²`
 *   coefficient is a closed-form scalar only under the `a(η) = A·|η|^q`
 *   ansatz, which these presets do not satisfy. Callers must dispatch
 *   through `computeBianchiKasnerCoefs` / `evaluateLqcBounceCoefs`
 *   directly and consume the axis-specific or tabulated coefficients.
 */
export function zppOverZCoefficient(params: CosmologyPresetParams): number {
  // Always validate dimensionality, even in the Minkowski short-circuit, so
  // bad params surface as a RangeError instead of silently returning 0.
  validateSpacetimeDim(params.spacetimeDim)
  if (params.preset === 'minkowski') return 0
  const q = qExponent(params)
  const beta = (q * (params.spacetimeDim - 2)) / 2
  return beta * (beta - 1)
}

/**
 * Exponent `β = q·(n − 2)/2` — exposed for the adiabatic-vacuum sampler which
 * needs `β` directly to evaluate `ω_k(η₀)`.
 *
 * @param params - Preset parameters
 * @returns `β`
 * @throws {RangeError} For the anisotropic / tabulated presets
 *   (`bianchiKasner`, `lqcBounce`) because `β` is derived from the
 *   closed-form `q` exponent, which those presets do not expose. Bianchi-I
 *   and LQC bounce vacuum sampling must route through the preset-specific
 *   coefficient evaluators.
 */
export function betaExponent(params: CosmologyPresetParams): number {
  validateSpacetimeDim(params.spacetimeDim)
  if (params.preset === 'minkowski') return 0
  const q = qExponent(params)
  return (q * (params.spacetimeDim - 2)) / 2
}

// ───────────────────────────────────────────────────────────────────────────
// Validation helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Enforce spacetime-dim range. Callers should validate earlier with a
 * user-facing error, but this acts as a last line of defence.
 *
 * @param spacetimeDim - Spacetime dimension `n`
 * @throws {RangeError} If outside `[3, 7]`
 */
export function validateSpacetimeDim(spacetimeDim: number): void {
  if (
    !Number.isInteger(spacetimeDim) ||
    spacetimeDim < MIN_SPACETIME_DIM ||
    spacetimeDim > MAX_SPACETIME_DIM
  ) {
    throw new RangeError(
      `spacetimeDim must be an integer in [${MIN_SPACETIME_DIM}, ${MAX_SPACETIME_DIM}], got ${spacetimeDim}`
    )
  }
}

/**
 * True iff the given `(preset, spacetimeDim, steepness, hubble)` combination is
 * physically admissible AND evaluatable by `computeCosmologyAt`. Covers the
 * preset-specific requirements that `qExponent` does not touch:
 *
 * - **de Sitter:** requires finite `hubble > 0` (enforced by
 *   `scaleFactorAmplitude` — see `background.ts`). Without this check the
 *   compute pass could crash at reset time despite `isValidPreset` returning
 *   `true`, because `qExponent` only consults `spacetimeDim` for de Sitter.
 * - **Bianchi-Kasner:** requires 3+1 dimensions, finite exponents, and a
 *   positive-η gauge that maps to positive real proper time (`Σp ≤ n−1`).
 * - **ekpyrotic:** covered by `qExponent` (requires `steepness > s_c(n)`).
 * - **kasner / minkowski:** no extra parameters.
 *
 * Used by the store setters and URL deserializer as an evaluatability
 * signal — a `true` return guarantees `computeCosmologyAt` will not throw
 * for the same params.
 *
 * @param params - Preset parameters
 * @returns `true` if every downstream consumer would accept these params
 */
export function isValidPreset(params: CosmologyPresetParams): boolean {
  if (!isCosmologyPreset(params.preset)) return false

  if (params.preset === 'lqcBounce') {
    // LQC bounce requires n ≥ 3 (the Friedmann prefactor 1/(3(n − 2))
    // diverges at n = 2). The overall cosmology range `[3, 7]` applies
    // here too so the shader stays bit-identical on unsupported
    // dimensions.
    if (
      !Number.isInteger(params.spacetimeDim) ||
      params.spacetimeDim < MIN_SPACETIME_DIM ||
      params.spacetimeDim > MAX_SPACETIME_DIM
    ) {
      return false
    }
    const rhoC = params.lqcRhoCritical
    if (typeof rhoC !== 'number' || !Number.isFinite(rhoC) || rhoC <= 0) return false
    const w = params.lqcEquationOfState
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 1) return false
    const r0 = params.lqcInitialRhoRatio
    if (typeof r0 !== 'number' || !Number.isFinite(r0) || r0 <= 0 || r0 >= 1) return false
    return true
  }
  if (params.preset === 'bianchiKasner') {
    // This implementation carries exactly three Kasner exponents and two
    // axis-ratio uniforms. Treating latticeDim > 3 as "Bianchi-I plus
    // isotropic extra axes" is a different higher-dimensional model, not this
    // preset. Require spacetimeDim = 4 until a d-dimensional exponent vector
    // and shader contract exist.
    if (params.spacetimeDim !== 4) return false
    const exp = params.kasnerExponents
    if (!exp || !Number.isFinite(exp.p1) || !Number.isFinite(exp.p2) || !Number.isFinite(exp.p3)) {
      return false
    }
    const maxMagnitude = 20
    if (
      Math.abs(exp.p1) > maxMagnitude ||
      Math.abs(exp.p2) > maxMagnitude ||
      Math.abs(exp.p3) > maxMagnitude
    ) {
      return false
    }
    return exp.p1 + exp.p2 + exp.p3 <= params.spacetimeDim - 1 + 1e-12
  }
  try {
    qExponent(params)
  } catch {
    return false
  }
  if (params.preset === 'deSitter') {
    const h = params.hubble
    if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) return false
  }
  return true
}
