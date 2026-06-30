/**
 * Mode — The Turning Surface (`turningSurface`).
 *
 * Renders the Wheeler–DeWitt minisuperspace turning surface `U(a, φ) = 0` as an
 * Airy-fold caustic. In the WKB picture of quantum cosmology the universe's
 * configuration space `(a, φ)` (scale factor × inflaton) splits into a
 * classically *allowed* region `U > 0`, where the wavefunction oscillates, and a
 * classically *forbidden* region `U < 0`, where it decays exponentially under the
 * barrier. The locus `U = 0` is the caustic — the turning surface — and near it
 * the two behaviours fuse into an Airy function: oscillatory fringes on one side,
 * a vanishing exponential tail on the other, with a single bright ridge where
 * they meet. The minisuperspace potential used is
 *
 *   U(a, φ) = a²(1 − Λ a²/3) − a⁴ · ½ m² φ²,
 *
 * (positive curvature term, cosmological constant Λ, inflaton mass m). The fringe
 * ridges are brightened at scale-factor positions `a = log(p)` for the first
 * prime powers — the "explicit-formula scoring" that ties the cosmological
 * caustic to the arithmetic of the primes.
 *
 * @module lib/geometry/extended/wdwZeta/turningSurface
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the Turning Surface mode. */
export type TurningSurfacePresetName =
  | 'airyFold'
  | 'anisotropicRidge'
  | 'vacuumFoam'
  | 'deSitterWall'
  | 'massiveInflaton'
  | 'twoFieldFold4D'
  | 'custom'

/**
 * Serializable Turning Surface config (stored on
 * `SchroedingerConfig.turningSurface`). Every field is bake-affecting (it moves
 * the caustic, the fringes, or the prime ridges); emission/glow is the shared
 * Advanced control and is NOT here.
 */
export interface TurningSurfaceConfig {
  /** Inflaton mass m in the potential `−a⁴·½ m² φ²` ∈ [0.2, 2.5]; sets how steeply the forbidden wall closes in φ. */
  inflatonMass: number
  /** Cosmological constant Λ in `a²(1 − Λ a²/3)` ∈ [0.05, 1.5]; pulls the caustic inward as Λ grows. */
  lambda: number
  /** WKB fringe wavenumber k multiplying the action integral `∫√U` ∈ [2, 14]; more fringes = more oscillations on the allowed side. */
  fringeCount: number
  /** Number of prime-power ridges scored at a = log(p^k) ∈ [0, 12]. */
  termCount: number
  /** φ-axis inflaton-mass asymmetry ∈ [0.2, 3]: the +φ half carries mass m·asym, the −φ half mass m — an anisotropic minisuperspace that bends the caustic fold. */
  asymmetry: number
  /** Free-scalar-field vacuum-foam gain ∈ [0, 1]: a mode-sum Σ_{k∈primes} cos(k·a)/√(k²+m²) speckling the classically-allowed lens. */
  vacuumGain: number
  /** Preset identifier; `custom` = user-edited. */
  preset: TurningSurfacePresetName
}

/** Clamp ranges for every numeric TurningSurfaceConfig scalar. */
export const TURNING_SURFACE_RANGES = {
  inflatonMass: { min: 0.2, max: 2.5 },
  lambda: { min: 0.05, max: 1.5 },
  fringeCount: { min: 2, max: 14 },
  termCount: { min: 0, max: 12 },
  asymmetry: { min: 0.2, max: 3 },
  vacuumGain: { min: 0, max: 1 },
} as const

/** Default config — matches the `airyFold` preset. */
export const DEFAULT_TURNING_SURFACE_CONFIG: TurningSurfaceConfig = {
  inflatonMass: 1.0,
  lambda: 0.4,
  fringeCount: 8,
  termCount: 6,
  asymmetry: 1.0,
  vacuumGain: 0,
  preset: 'airyFold',
}

/** One Turning Surface scenario (config minus the preset tag). */
export type TurningSurfacePresetValues = Omit<TurningSurfaceConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const TURNING_SURFACE_PRESETS: Readonly<
  Record<Exclude<TurningSurfacePresetName, 'custom'>, TurningSurfacePresetValues>
> = {
  /** The canonical Airy fold: balanced allowed/forbidden split, mid prime scoring. */
  airyFold: {
    inflatonMass: 1.0,
    lambda: 0.4,
    fringeCount: 8,
    termCount: 6,
    asymmetry: 1.0,
    vacuumGain: 0,
  },
  /** Anisotropic minisuperspace: the φ-mass asymmetry skews the allowed lens into a leaning ridge. */
  anisotropicRidge: {
    inflatonMass: 1.2,
    lambda: 0.35,
    fringeCount: 9,
    termCount: 6,
    asymmetry: 2.5,
    vacuumGain: 0.2,
  },
  /** Scalar-field vacuum foam: the prime mode-sum speckles the allowed lens with quantum froth. */
  vacuumFoam: {
    inflatonMass: 0.9,
    lambda: 0.3,
    fringeCount: 7,
    termCount: 5,
    asymmetry: 1.0,
    vacuumGain: 0.85,
  },
  /** Λ-dominated: a high cosmological constant snaps the turning wall close to the origin. */
  deSitterWall: {
    inflatonMass: 0.6,
    lambda: 1.2,
    fringeCount: 6,
    termCount: 4,
    asymmetry: 1.0,
    vacuumGain: 0,
  },
  /** Heavy inflaton: a steep φ-mass wall pinches the allowed lens into a narrow fold. */
  massiveInflaton: {
    inflatonMass: 2.2,
    lambda: 0.25,
    fringeCount: 12,
    termCount: 8,
    asymmetry: 1.0,
    vacuumGain: 0,
  },
  /** 4D two-field fold (dimension 4): the balanced Airy fold, opened to a second inflaton. */
  twoFieldFold4D: {
    inflatonMass: 1.0,
    lambda: 0.4,
    fringeCount: 8,
    termCount: 6,
    asymmetry: 1.0,
    vacuumGain: 0,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const TURNING_SURFACE_SCENARIOS: readonly WdwZetaScenario<
  Exclude<TurningSurfacePresetName, 'custom'>
>[] = [
  {
    id: 'airyFold',
    label: 'Airy Fold',
    description:
      'The Wheeler–DeWitt turning surface U(a, φ) = 0 rendered as an Airy-fold caustic. Inside the classically allowed lens (U > 0) the WKB wavefunction oscillates in bright rainbow fringes ∝ cos(k·∫√U); outside (U < 0) it decays exponentially under the barrier into darkness. The caustic ridge where the two fuse glows white — the literal edge between the universe that can be and the universe that cannot.',
  },
  {
    id: 'anisotropicRidge',
    label: 'Anisotropic Ridge',
    description:
      'An anisotropic minisuperspace: the inflaton mass on the +φ half-axis is scaled by 2.5×, so the forbidden wall closes faster on one side than the other. The Airy fold tilts into a leaning ridge — the same caustic, but the universe is allowed more room to expand in one direction of field space than the other, exactly the wdw_ma asymmetry that re-runs the Wheeler–DeWitt potential.',
  },
  {
    id: 'vacuumFoam',
    label: 'Vacuum Foam',
    description:
      'The cosmological caustic dressed in free-scalar-field vacuum fluctuations. A mode-sum Σ_{k∈primes} cos(k·a)/√(k²+m²) — primes as the field momenta, ω_k = √(k²+m²) the relativistic dispersion — speckles the classically-allowed lens with quantum froth. The turning surface is firm; the vacuum that fills the allowed region is not.',
  },
  {
    id: 'deSitterWall',
    label: 'de Sitter Wall',
    description:
      'A Λ-dominated minisuperspace. The cosmological-constant term a²(1 − Λa²/3) turns over early, so the turning surface snaps inward into a tight bright wall close to the origin — the de Sitter horizon of the no-boundary universe seen as a caustic. The forbidden exterior is a near-total void.',
  },
  {
    id: 'massiveInflaton',
    label: 'Massive Inflaton',
    description:
      'A heavy inflaton (large m) makes the φ-direction barrier steep: the allowed lens pinches into a narrow vertical fold and the fringe density rises. The prime-power ridges at a = log(p^k) score the fringes — the arithmetic skeleton inside the cosmological caustic.',
  },
  {
    id: 'twoFieldFold4D',
    label: 'Swallowtail Caustic (4D)',
    description:
      'The Airy fold is a fold catastrophe; add a second inflaton field and it blooms into a SWALLOWTAIL — the next catastrophe in the hierarchy. The classically-allowed lens crumples into self-folding luminous pleats, cusp-ridges where the WKB fringes pile up, the edge of cosmological existence pleated through field space. Rotate the Z–W plane to drift the folds. Opens at dimension 4.',
    dimension: 4,
    rotation: { ZW: 0.65 },
  },
]
