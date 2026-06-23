/**
 * Mode 6 — The Frobenius Wheel (`frobeniusWheel`).
 *
 * The Riemann Hypothesis over a finite field F_q is a *theorem* (Deligne): for a
 * smooth projective curve over F_q, every Frobenius eigenvalue α acting on the
 * ℓ-adic cohomology H^w has absolute value |α| = q^{w/2} **exactly**. The
 * eigenvalues have no choice but to lie on the circle of radius q^{w/2} — the
 * cleanest "no other option" in the whole arithmetic story. This mode renders
 * the weight filtration as nested luminous rings in a horizontal plane, each
 * ring at radius R_w ∝ q^{w/2} and lifted to its own height z = w (the foliation
 * of superspace by cohomological weight). Bright eigenvalue dots are pinned to
 * each ring: H^0 carries α = 1; H^1 carries the 2g conjugate pairs q^{1/2}·e^{±iθ_j}
 * of a genus-g curve; H^2 (Poincaré dual to H^0) carries α = q. A gyroscope of
 * nested rings with pinned points.
 *
 * @module lib/geometry/extended/wdwZeta/frobeniusWheel
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the Frobenius Wheel mode. */
export type FrobeniusWheelPresetName =
  | 'ellipticCurve'
  | 'genusTwo'
  | 'highWeight'
  | 'weightSpindle'
  | 'zetaTinted'
  | 'custom'

/**
 * Serializable Frobenius Wheel config (stored on `SchroedingerConfig.frobeniusWheel`).
 * Every field is bake-affecting (changes the ring radii or the pinned dots);
 * emission/glow is the shared Advanced control and is NOT here.
 */
export interface FrobeniusWheelConfig {
  /** Prime power q (curve over F_q), integer ∈ [2, 9]; sets all radii q^{w/2}. */
  baseQ: number
  /** Highest cohomological weight W ∈ [2, 6]; rings drawn for w = 0..W. */
  maxWeight: number
  /** Curve genus g ∈ [1, 4]; H^1 carries 2g pinned conjugate eigenvalue dots. */
  genus: number
  /** Eigenvalue angular spread ∈ [0, 1.5]: Frobenius conjugacy scatter jittering the pinned dots around their forced ring. */
  spread: number
  /** Render the weight filtration as a vertical spindle (with central rod) instead of a flat gyroscope of rings. */
  coneSpindle: boolean
  /** ζ-zero-density tint ∈ [0, 1]: bleed the analytic Riemann zeros into the finite-field purity rings' colour. */
  zetaTint: number
  /** Preset identifier; `custom` = user-edited. */
  preset: FrobeniusWheelPresetName
}

/** Clamp ranges for every numeric FrobeniusWheelConfig scalar. */
export const FROBENIUS_WHEEL_RANGES = {
  baseQ: { min: 2, max: 9 },
  maxWeight: { min: 2, max: 6 },
  genus: { min: 1, max: 4 },
  spread: { min: 0, max: 1.5 },
  zetaTint: { min: 0, max: 1 },
} as const

/** Default config — matches the `ellipticCurve` preset. */
export const DEFAULT_FROBENIUS_WHEEL_CONFIG: FrobeniusWheelConfig = {
  baseQ: 2,
  maxWeight: 2,
  genus: 1,
  spread: 0,
  coneSpindle: false,
  zetaTint: 0,
  preset: 'ellipticCurve',
}

/** One Frobenius Wheel scenario (config minus the preset tag). */
export type FrobeniusWheelPresetValues = Omit<FrobeniusWheelConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const FROBENIUS_WHEEL_PRESETS: Readonly<
  Record<Exclude<FrobeniusWheelPresetName, 'custom'>, FrobeniusWheelPresetValues>
> = {
  /** An elliptic curve / F_2 (genus 1): H^0, H^1 (one conjugate pair), H^2. */
  ellipticCurve: {
    baseQ: 2,
    maxWeight: 2,
    genus: 1,
    spread: 0,
    coneSpindle: false,
    zetaTint: 0,
  },
  /** A genus-2 curve / F_4: H^1 carries 4 pinned eigenvalue dots on its ring. */
  genusTwo: {
    baseQ: 4,
    maxWeight: 2,
    genus: 2,
    spread: 0.4,
    coneSpindle: false,
    zetaTint: 0,
  },
  /** A higher-weight tower / F_7: the foliation climbs to weight 4. */
  highWeight: {
    baseQ: 7,
    maxWeight: 4,
    genus: 2,
    spread: 0.2,
    coneSpindle: false,
    zetaTint: 0,
  },
  /** The weight filtration wound into a vertical spindle with a central rod. */
  weightSpindle: {
    baseQ: 5,
    maxWeight: 5,
    genus: 3,
    spread: 0.6,
    coneSpindle: true,
    zetaTint: 0.3,
  },
  /** The purity rings tinted by the Riemann zero density — number theory bleeding in. */
  zetaTinted: {
    baseQ: 3,
    maxWeight: 4,
    genus: 2,
    spread: 0.5,
    coneSpindle: false,
    zetaTint: 0.85,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const FROBENIUS_WHEEL_SCENARIOS: readonly WdwZetaScenario<
  Exclude<FrobeniusWheelPresetName, 'custom'>
>[] = [
  {
    id: 'ellipticCurve',
    label: 'Elliptic Curve / F₂',
    description:
      "Deligne's purity for an elliptic curve over F₂. Three nested rings — H⁰ at radius 1, H¹ at √2, H² at 2 — lifted to weights 0, 1, 2. The H¹ ring carries the genus-1 conjugate eigenvalue pair √2·e^{±iθ}, pinned exactly to the circle because |α| = q^{w/2} is a theorem, not a hope.",
  },
  {
    id: 'genusTwo',
    label: 'Genus-2 / F₄',
    description:
      'A genus-2 curve over F₄: the H¹ ring now carries 2g = 4 pinned eigenvalue dots, two conjugate pairs at radius √4 = 2. The weight filtration foliates superspace into three luminous levels, every dot locked to its circle — Frobenius has no eigenvalue that could escape the radius.',
  },
  {
    id: 'highWeight',
    label: 'High Weight / F₇',
    description:
      'A taller tower over F₇ climbing to weight 4: five nested rings at radii 7^{w/2}, each foliated to its own height. The exponential growth of the radii is the purity statement made geometric — every cohomological degree is pinned to its own forced circle.',
  },
  {
    id: 'weightSpindle',
    label: 'Weight Spindle',
    description:
      'The same forced radii, but the weight filtration is wound into a vertical spindle on a central rod rather than a flat gyroscope. The eigenvalue dots are given a Frobenius-conjugacy angular spread so they scatter around their circle — still on |α| = q^{w/2} to the last digit, but jittered in phase. A spinning top of cohomology.',
  },
  {
    id: 'zetaTinted',
    label: 'ζ-Tinted Wheel',
    description:
      'Deligne purity over F₃ with the analytic Riemann zeros bleeding in: each weight ring is tinted by the local ζ-zero density, the finite-field RH (a theorem) coloured by the archimedean RH (a conjecture). The two faces of the Riemann Hypothesis painted onto one wheel — the proven and the hoped-for sharing a radius.',
  },
]
