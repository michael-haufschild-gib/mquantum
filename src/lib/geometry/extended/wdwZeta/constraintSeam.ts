/**
 * Mode 1 — The Constraint Seam (`constraintSeam`).
 *
 * Renders the completed Riemann ξ(s) = ½ s(s−1) π^(−s/2) Γ(s/2) ζ(s) over the
 * critical strip as a luminous relief that is mirror-symmetric about the seam
 * `Re s = ½` — because `ξ(s) = ξ(1−s)`, the surface *cannot* be anything but
 * symmetric. The non-trivial zeros are pinned to the seam as pits where the
 * relief touches the floor; the phase arg ξ winds once around each (the
 * argument principle). A "ghost sector" toggle injects a Davenport–Heilbronn-
 * style off-seam zero pair — a *forbidden* configuration (κ₋ > 0): a real
 * mathematical object (an L-like function with a functional equation but zeros
 * off the line) shown precisely because it is the thing the constraint forbids.
 *
 * @module lib/geometry/extended/wdwZeta/constraintSeam
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the Constraint Seam mode. */
export type ConstraintSeamPresetName =
  | 'completedState'
  | 'phasePortrait'
  | 'quantumCarpet'
  | 'ghostSector'
  | 'deepStrip'
  | 'custom'

/**
 * Serializable Constraint Seam config (stored on `SchroedingerConfig.constraintSeam`).
 * Every field is bake-affecting (changes the ξ relief or the marked zeros);
 * emission/glow is the shared Advanced control and is NOT here.
 */
export interface ConstraintSeamConfig {
  /** Upper ordinate T of the rendered strip ∈ [20, 80]; sets how many zeros show. */
  heightWindow: number
  /** Relief height (visual amplitude of the |ξ| terrain) ∈ [0.3, 1.0]. */
  reliefHeight: number
  /** Inject a Davenport–Heilbronn-style off-seam ghost zero pair (κ₋ probe). */
  ghostSector: boolean
  /** σ-deviation of the ghost zeros from the seam ∈ [0.08, 0.4]. */
  ghostOffset: number
  /** Half-width of the rendered σ-band around the seam ∈ [0.06, 0.5]: small = a tight seam canyon, large = the explosive off-line |ξ| walls. */
  stripBand: number
  /** Intensity ∈ [0, 1] of the TDSE Talbot quantum-carpet overlay (a free-eigenstate superposition Σₙ e^{i(nx − n²τ + γₙ)} phased by the ζ ordinates). */
  carpetGain: number
  /** Domain-colour the relief by arg ξ (phase portrait) when true; height-luminance ramp when false. */
  domainShade: boolean
  /** Preset identifier; `custom` = user-edited. */
  preset: ConstraintSeamPresetName
}

/** Clamp ranges for every numeric ConstraintSeamConfig scalar. */
export const CONSTRAINT_SEAM_RANGES = {
  heightWindow: { min: 20, max: 80 },
  reliefHeight: { min: 0.3, max: 1.0 },
  ghostOffset: { min: 0.08, max: 0.4 },
  stripBand: { min: 0.06, max: 0.5 },
  carpetGain: { min: 0, max: 1 },
} as const

/** Default config — matches the `completedState` preset. */
export const DEFAULT_CONSTRAINT_SEAM_CONFIG: ConstraintSeamConfig = {
  heightWindow: 50,
  reliefHeight: 0.7,
  ghostSector: false,
  ghostOffset: 0.2,
  stripBand: 0.22,
  carpetGain: 0,
  domainShade: true,
  preset: 'completedState',
}

/** One Constraint Seam scenario (config minus the preset tag). */
export type ConstraintSeamPresetValues = Omit<ConstraintSeamConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const CONSTRAINT_SEAM_PRESETS: Readonly<
  Record<Exclude<ConstraintSeamPresetName, 'custom'>, ConstraintSeamPresetValues>
> = {
  /** The physical state: ξ folded on the seam, zeros pinned, no ghosts. */
  completedState: {
    heightWindow: 50,
    reliefHeight: 0.7,
    ghostSector: false,
    ghostOffset: 0.2,
    stripBand: 0.22,
    carpetGain: 0,
    domainShade: true,
  },
  /** The full strip opened up: the explosive off-line |ξ| walls flanking the seam, read as a flat arg-ξ phase portrait. */
  phasePortrait: {
    heightWindow: 55,
    reliefHeight: 0.4,
    ghostSector: false,
    ghostOffset: 0.2,
    stripBand: 0.48,
    carpetGain: 0,
    domainShade: true,
  },
  /** TDSE Talbot carpet ignited: the ζ-phased free-eigenstate revival fabric climbing the seam. */
  quantumCarpet: {
    heightWindow: 60,
    reliefHeight: 0.6,
    ghostSector: false,
    ghostOffset: 0.2,
    stripBand: 0.18,
    carpetGain: 0.9,
    domainShade: false,
  },
  /** The forbidden configuration: a Davenport–Heilbronn off-seam zero pair. */
  ghostSector: {
    heightWindow: 40,
    reliefHeight: 0.8,
    ghostSector: true,
    ghostOffset: 0.26,
    stripBand: 0.3,
    carpetGain: 0,
    domainShade: true,
  },
  /** A tall window of the strip — the rigid ladder of zeros climbing the seam. */
  deepStrip: {
    heightWindow: 78,
    reliefHeight: 0.55,
    ghostSector: false,
    ghostOffset: 0.2,
    stripBand: 0.16,
    carpetGain: 0,
    domainShade: true,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const CONSTRAINT_SEAM_SCENARIOS: readonly WdwZetaScenario<
  Exclude<ConstraintSeamPresetName, 'custom'>
>[] = [
  {
    id: 'completedState',
    label: 'Completed State',
    description:
      'The completed ξ(s) over the critical strip, folded into a perfect mirror about the seam Re s = ½ because ξ(s) = ξ(1−s). The non-trivial zeros are pinned to the seam as pits where the relief touches the floor and the phase arg ξ winds once around each — the functional equation is the Wheeler–DeWitt constraint made literal.',
  },
  {
    id: 'phasePortrait',
    label: 'Phase Portrait',
    description:
      'The σ-band opened to the full critical strip: the off-line |ξ| growth rears up into two flanking walls and the relief flattens into a domain-coloured phase portrait, hue = arg ξ winding ±2π around every zero. The argument principle drawn straight — each winding is one non-trivial zero, and they all sit on the seam.',
  },
  {
    id: 'quantumCarpet',
    label: 'Quantum Carpet',
    description:
      'A TDSE Talbot carpet is overlaid on the seam: the free-particle eigenstate superposition Σₙ e^{i(nx − n²τ + γₙ)} — exact n² energies, so the revivals are real — with its initial phases set by the Riemann zero ordinates γₙ. The ζ spectrum fingerprints a self-similar interference fabric climbing the strip. It is the wavefunction a comb of constraints would weave if it were ever allowed to evolve.',
  },
  {
    id: 'ghostSector',
    label: 'Ghost Sector',
    description:
      'The forbidden configuration. A Davenport–Heilbronn-style zero pair is injected off the seam (σ = ½ ± offset): a genuine L-like object with a functional equation but zeros off the critical line. It glows where the constraint forbids — the negative-norm ghost sector κ₋ > 0 that RH says cannot exist.',
  },
  {
    id: 'deepStrip',
    label: 'Deep Strip',
    description:
      'A tall window of the critical strip (ordinate up to ≈ 78): the rigid ladder of the first ~25 zeros climbing the seam, each a pinned pit. The mirror symmetry holds at every height — the relief has no freedom to be otherwise.',
  },
]
