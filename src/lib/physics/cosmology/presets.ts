/**
 * Cosmological FLRW background presets for the Mukhanov-Sasaki bridge.
 *
 * Defines the four regimes under which the Free Scalar Field mode can evolve:
 *
 * - `minkowski`   — flat spacetime, `a = 1` (bit-identical to the default FSF pass)
 * - `deSitter`    — exponential inflation, `a ∝ |η|^(-1)`, scale-invariant spectrum
 * - `kasner`      — positive Kasner FLRW (`V₀ = 0`, `x = 1`), stiff-fluid limit
 * - `ekpyrotic`   — positive ekpyrotic FLRW (`V₀ = -1`, `s > s_c`), the regime
 *                   whose nonlinear stability is proven in Beyer et al. (2026).
 *
 * All power-law presets share the closed-form scale factor `a(η) = A·|η|^q`,
 * so the Mukhanov-Sasaki effective mass becomes
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

/** Cosmological background preset identifier. */
export type CosmologyPreset = 'minkowski' | 'deSitter' | 'ekpyrotic' | 'kasner'

/** All preset keys in a stable UI order. */
export const COSMOLOGY_PRESETS: readonly CosmologyPreset[] = [
  'minkowski',
  'deSitter',
  'ekpyrotic',
  'kasner',
] as const

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

  if (preset === 'minkowski') return 0
  if (preset === 'deSitter') return -1
  if (preset === 'kasner') {
    return 1 / (spacetimeDim - 2)
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
