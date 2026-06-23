/**
 * Mode — The Ghost Sector / Weil Positivity (`weilPositivity`).
 *
 * Renders the Weil explicit-formula quadratic form as a wide, shallow glowing
 * bowl-landscape. André Weil's positivity criterion states that the Riemann
 * Hypothesis is equivalent to the positive-definiteness of a certain Hermitian
 * form built from the explicit formula: a "zero term" (a sum over the non-trivial
 * zeros γₙ), a "prime term" (a sum over prime powers), and an archimedean term.
 * RH holds iff this form is ≥ 0 for every test function — iff the "ghost sector"
 * κ₋ (the negative-norm subspace) is empty.
 *
 * The surface here is a height field `W(x, z)` over a plane: a smooth positive
 * bowl, gently rippled by the oscillation `Σₙ cos(γₙ·ρ)·envelope` of the zeros
 * and dented by a subtracted prime term. Everywhere positive, it reads as a warm
 * golden basin whose zero-level contour glows bright — RH made visible as a
 * landscape with no holes. The `offLineZero` toggle injects a localized NEGATIVE
 * dip — a violet "ghost well" where positivity fails (κ₋ > 0): the forbidden
 * counterexample drawn precisely because the constraint forbids it.
 *
 * @module lib/geometry/extended/wdwZeta/weilPositivity
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the Weil Positivity mode. */
export type WeilPositivityPresetName =
  | 'positiveBasin'
  | 'ghostWell'
  | 'vacuumCore'
  | 'steepForm'
  | 'denseSpectrum'
  | 'custom'

/**
 * Serializable Weil Positivity config (stored on
 * `SchroedingerConfig.weilPositivity`). Every field is bake-affecting (it
 * reshapes the explicit-formula landscape or the ghost well); emission/glow is
 * the shared Advanced control and is NOT here.
 */
export interface WeilPositivityConfig {
  /** Number of ζ-zeros γₙ summed into the oscillation term ∈ [4, 40]; more zeros = finer ripples. */
  zeroCount: number
  /** Strength of the subtracted prime term (depth of the bowl's dents) ∈ [0, 1]. */
  primeWeight: number
  /** Inject a localized negative dip — the forbidden κ₋ > 0 ghost well. */
  offLineZero: boolean
  /** Lateral offset of the ghost well from the basin centre ∈ [0, 0.8]. */
  offLineOffset: number
  /** Bowl curvature ∈ [0.2, 1.2]: steepness of the Weil quadratic form's basin. */
  bowlCurve: number
  /** Iso-positivity contour-ring brightness ∈ [0, 1]. */
  ringGain: number
  /** Coherent-state vacuum-mound blend ∈ [0, 1]: a Gaussian e^{−r²} (the |α=0⟩ vacuum) raised in the basin floor. */
  kahlerMix: number
  /** Preset identifier; `custom` = user-edited. */
  preset: WeilPositivityPresetName
}

/** Clamp ranges for every numeric WeilPositivityConfig scalar. */
export const WEIL_POSITIVITY_RANGES = {
  zeroCount: { min: 4, max: 40 },
  primeWeight: { min: 0, max: 1 },
  offLineOffset: { min: 0, max: 0.8 },
  bowlCurve: { min: 0.2, max: 1.2 },
  ringGain: { min: 0, max: 1 },
  kahlerMix: { min: 0, max: 1 },
} as const

/** Default config — matches the `positiveBasin` preset. */
export const DEFAULT_WEIL_POSITIVITY_CONFIG: WeilPositivityConfig = {
  zeroCount: 16,
  primeWeight: 0.45,
  offLineZero: false,
  offLineOffset: 0.45,
  bowlCurve: 0.42,
  ringGain: 0.4,
  kahlerMix: 0,
  preset: 'positiveBasin',
}

/** One Weil Positivity scenario (config minus the preset tag). */
export type WeilPositivityPresetValues = Omit<WeilPositivityConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const WEIL_POSITIVITY_PRESETS: Readonly<
  Record<Exclude<WeilPositivityPresetName, 'custom'>, WeilPositivityPresetValues>
> = {
  /** RH holds: a flawless positive basin, zero-level contour glowing, no ghost. */
  positiveBasin: {
    zeroCount: 16,
    primeWeight: 0.45,
    offLineZero: false,
    offLineOffset: 0.45,
    bowlCurve: 0.42,
    ringGain: 0.4,
    kahlerMix: 0,
  },
  /** RH fails: a violet ghost well punched below zero — the κ₋ > 0 sector. */
  ghostWell: {
    zeroCount: 16,
    primeWeight: 0.5,
    offLineZero: true,
    offLineOffset: 0.5,
    bowlCurve: 0.42,
    ringGain: 0.5,
    kahlerMix: 0,
  },
  /** A coherent-state vacuum mound raised at the basin floor — the |α=0⟩ Gaussian. */
  vacuumCore: {
    zeroCount: 20,
    primeWeight: 0.4,
    offLineZero: false,
    offLineOffset: 0.45,
    bowlCurve: 0.5,
    ringGain: 0.6,
    kahlerMix: 0.9,
  },
  /** A steep, narrow basin: the quadratic form curving sharply up from the floor. */
  steepForm: {
    zeroCount: 24,
    primeWeight: 0.55,
    offLineZero: false,
    offLineOffset: 0.45,
    bowlCurve: 1.1,
    ringGain: 0.7,
    kahlerMix: 0.2,
  },
  /** A deep spectrum: 32 zeros ripple the basin into a finely corrugated bowl. */
  denseSpectrum: {
    zeroCount: 32,
    primeWeight: 0.6,
    offLineZero: false,
    offLineOffset: 0.45,
    bowlCurve: 0.42,
    ringGain: 0.5,
    kahlerMix: 0,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const WEIL_POSITIVITY_SCENARIOS: readonly WdwZetaScenario<
  Exclude<WeilPositivityPresetName, 'custom'>
>[] = [
  {
    id: 'positiveBasin',
    label: 'Positive Basin',
    description:
      "Weil's explicit-formula quadratic form as a wide, shallow bowl. The zero term Σ cos(γₙ·ρ) ripples a smooth positive basin; the prime term dents it; everywhere the height stays ≥ 0. RH is exactly this: the form is positive-definite, the negative-norm ghost sector κ₋ is empty. The zero-level contour glows golden around the rim — the boundary the landscape never crosses.",
  },
  {
    id: 'ghostWell',
    label: 'Ghost Well (κ₋ > 0)',
    description:
      'The forbidden landscape. A localized negative dip — a violet ghost well — is punched into the basin where positivity fails. This is the κ₋ > 0 sector: a single off-line zero would create exactly such a hole in the Weil form, and the Riemann Hypothesis is the statement that no such hole can exist. Shown because it is the thing the constraint forbids.',
  },
  {
    id: 'vacuumCore',
    label: 'Vacuum Core',
    description:
      'A coherent-state vacuum mound raised at the floor of the positivity basin: the Gaussian e^{−r²} of the |α=0⟩ harmonic-oscillator vacuum — the minimum-uncertainty ground state — sitting at the bottom of the Weil form. The positivity is intact; the basin simply cradles a luminous Gaussian core, the quantum vacuum nesting inside the arithmetic constraint.',
  },
  {
    id: 'steepForm',
    label: 'Steep Form',
    description:
      'The same Li/Keiper positivity, but the quadratic form curves up steeply from the floor into a narrow, deep basin. The zero-level contour rings tighten; the positivity is more sharply enforced. Even at this curvature the floor never crosses zero — RH holds, rigidly.',
  },
  {
    id: 'denseSpectrum',
    label: 'Dense Spectrum',
    description:
      'Thirty-two zeros summed into the oscillation term corrugate the positive basin into a finely rippled bowl. Even with the densest spectrum the floor never dips below zero — the positivity is rigid, not coincidental. The prime term carves the deepest warm troughs without ever breaking through.',
  },
]
