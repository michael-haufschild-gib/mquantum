/**
 * Mode 7 — The DeWitt Null Cone (`dewittCone`).
 *
 * The DeWitt supermetric on superspace is *indefinite* — Lorentzian — and its
 * single timelike direction is the conformal / dilation mode (the overall scale
 * of geometry). The Wheeler–DeWitt equation is therefore a wave equation, not a
 * diffusion: "a cone, not an arrow". This mode renders that light cone literally
 * as a double cone — two open cones meeting at the apex at the origin and flaring
 * *outward* along ±y (the timelike axis), surface radius r = slope·|y|. It is NOT
 * a pinched throat: the cones open as they recede from the apex. On the cone
 * surface, bright latitude rings are pinned at heights y_n whose spacing follows
 * the Riemann-zero ordinates t_n — the standing-wave spectrum of the constraint
 * along the timelike axis. Faint null generators (straight lines from the apex
 * outward) rule the surface. The upper cone (expanding branch) glows warm, the
 * lower cone (contracting branch) cool — the two Wheeler–DeWitt branches.
 *
 * @module lib/geometry/extended/wdwZeta/dewittCone
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the DeWitt Cone mode. */
export type DewittConePresetName =
  | 'nullCone'
  | 'narrowCone'
  | 'denseSpectrum'
  | 'btzThroat'
  | 'lightconeFan'
  | 'helicalBranches'
  | 'custom'

/**
 * Serializable DeWitt Cone config (stored on `SchroedingerConfig.dewittCone`).
 * Every field is bake-affecting (changes the cone opening, ring count, or branch
 * coloring); emission/glow is the shared Advanced control and is NOT here.
 */
export interface DewittConeConfig {
  /** Cone opening: surface radius per unit |y| ∈ [0.4, 1.2]. */
  coneSlope: number
  /** Number of latitude rings per branch ∈ [4, 24]; heights follow ζ-zero spacing. */
  ringCount: number
  /** Branch-tint strength: 0 = uniform white, 1 = full warm/cool split ∈ [0, 1]. */
  branchTint: number
  /** AdS/BTZ throat horizon disc radius at the apex ∈ [0, 1]; 0 = no horizon. */
  horizon: number
  /** Number of nested light cones (WDW branches of increasing aperture) ∈ [1, 6]. */
  fanCount: number
  /** Helical warp ∈ [0, 1] twisting the ζ-zero latitude rings into standing helices. */
  warp: number
  /** Preset identifier; `custom` = user-edited. */
  preset: DewittConePresetName
}

/** Clamp ranges for every numeric DewittConeConfig scalar. */
export const DEWITT_CONE_RANGES = {
  coneSlope: { min: 0.4, max: 1.2 },
  ringCount: { min: 4, max: 24 },
  branchTint: { min: 0, max: 1 },
  horizon: { min: 0, max: 1 },
  fanCount: { min: 1, max: 6 },
  warp: { min: 0, max: 1 },
} as const

/** Default config — matches the `nullCone` preset. */
export const DEFAULT_DEWITT_CONE_CONFIG: DewittConeConfig = {
  coneSlope: 0.8,
  ringCount: 12,
  branchTint: 0.85,
  horizon: 0,
  fanCount: 1,
  warp: 0,
  preset: 'nullCone',
}

/** One DeWitt Cone scenario (config minus the preset tag). */
export type DewittConePresetValues = Omit<DewittConeConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const DEWITT_CONE_PRESETS: Readonly<
  Record<Exclude<DewittConePresetName, 'custom'>, DewittConePresetValues>
> = {
  /** The canonical double null cone: warm/cool branches, mid ring count. */
  nullCone: {
    coneSlope: 0.8,
    ringCount: 12,
    branchTint: 0.85,
    horizon: 0,
    fanCount: 1,
    warp: 0,
  },
  /** A narrow cone: steep timelike axis, the cone barely opening. */
  narrowCone: {
    coneSlope: 0.5,
    ringCount: 10,
    branchTint: 0.9,
    horizon: 0,
    fanCount: 1,
    warp: 0,
  },
  /** A wide cone with a dense standing-wave spectrum of latitude rings. */
  denseSpectrum: {
    coneSlope: 1.1,
    ringCount: 22,
    branchTint: 0.75,
    horizon: 0,
    fanCount: 1,
    warp: 0,
  },
  /** A BTZ throat: an event-horizon disc punched through the cone apex. */
  btzThroat: {
    coneSlope: 0.85,
    ringCount: 14,
    branchTint: 0.8,
    horizon: 0.8,
    fanCount: 1,
    warp: 0,
  },
  /** A fan of nested light cones — several WDW branches at growing aperture. */
  lightconeFan: {
    coneSlope: 0.6,
    ringCount: 10,
    branchTint: 0.85,
    horizon: 0,
    fanCount: 4,
    warp: 0,
  },
  /** Helical branches: the latitude rings twisted into standing helices. */
  helicalBranches: {
    coneSlope: 0.9,
    ringCount: 18,
    branchTint: 0.8,
    horizon: 0.2,
    fanCount: 1,
    warp: 0.85,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const DEWITT_CONE_SCENARIOS: readonly WdwZetaScenario<
  Exclude<DewittConePresetName, 'custom'>
>[] = [
  {
    id: 'nullCone',
    label: 'Null Cone',
    description:
      'The indefinite DeWitt supermetric made literal: a double light cone meeting at the apex and flaring outward along the timelike conformal axis (±y), radius r = slope·|y|. Latitude rings are pinned at heights spaced by the Riemann-zero ordinates — the standing-wave spectrum of the Wheeler–DeWitt constraint. The upper (expanding) branch glows warm, the lower (contracting) branch cool. A cone, not an arrow.',
  },
  {
    id: 'narrowCone',
    label: 'Narrow Cone',
    description:
      'A steep null cone barely opening from the apex: the timelike conformal mode dominates, the spatial spread is tight. The latitude rings climb the slender surface, each one a pinned node of the standing wave — the constraint has no freedom in where they sit.',
  },
  {
    id: 'denseSpectrum',
    label: 'Dense Spectrum',
    description:
      'A wide-flaring cone carrying a dense ladder of 22 latitude rings whose heights crowd together exactly as the Riemann zeros do. The two branches — expansion and contraction — fan out from the shared apex, the warm and cool faces of the same Wheeler–DeWitt wave.',
  },
  {
    id: 'btzThroat',
    label: 'BTZ Throat',
    description:
      'A BTZ-style event-horizon disc is punched through the cone apex: a shimmering throat at the conformal pinch where the supermetric light-cone meets the black-hole horizon of AdS₃. The expanding and contracting branches still flare from the apex, but now they meet at a luminous horizon ring — the timelike conformal mode crossing into the throat.',
  },
  {
    id: 'lightconeFan',
    label: 'Light-Cone Fan',
    description:
      'Not one null cone but a fan of four, nested at growing apertures from the shared apex — a family of Wheeler–DeWitt branches, each a different causal wedge of superspace. The standing-wave rings thread all of them, the same ζ-spectrum read across every cone of the fan.',
  },
  {
    id: 'helicalBranches',
    label: 'Helical Branches',
    description:
      'The latitude rings twisted into standing helices: the ζ-zero standing wave given an azimuthal warp so each ring winds as it climbs the cone. A faint horizon glimmers at the throat. The spectrum is unchanged — the heights are still the Riemann ordinates — but the wave now spirals around the timelike axis.',
  },
]
