/**
 * Modular Knot ("Rademacher Horizon") configuration — modular geodesics knotted
 * around the trefoil, colored by the Rademacher invariant Φ.
 *
 * Encodes the Ghys identification: the unit tangent bundle of the modular
 * surface `SL₂(ℝ)/SL₂(ℤ)` is the complement of the trefoil knot in `S³`. Every
 * closed modular geodesic lifts to a **modular knot** whose linking number with
 * the trefoil core equals the **Rademacher invariant Φ** — the same global
 * topological winding that `S(T) = (1/π) arg ζ(½ + iT)` realizes analytically.
 *
 * The heavy number-theory + volume-bake math lives in
 * `src/lib/physics/modularKnot.ts`; this file is the serializable knob set
 * routed to the renderer via the schroedinger version counter and consumed by
 * `ModularKnotStrategy` (which bakes a 3D RGBA volume) plus a few uniform
 * fields packed by `packModularKnot`.
 *
 * @module lib/geometry/extended/modularKnot
 */

/** Named preset identifiers for the Modular Knot mode. */
export type ModularKnotPresetName =
  | 'rademacherTangle'
  | 'primeGeodesics'
  | 'deepSpectrum'
  | 'custom'

/**
 * Serializable Modular Knot configuration. Stored on
 * `SchroedingerConfig.modularKnot`.
 *
 * `maxLen` and `geodesicCount` are bake-affecting (they change the enumerated
 * geodesic set and so the volume contents); `glow`, `flow`, and `tubeWidth`
 * are render-only / cheap-to-rebake knobs. The strategy caches the baked volume
 * and only re-bakes when a bake-affecting field changes.
 */
export interface ModularKnotConfig {
  /** Cloud emission gain ∈ [0.2, 4]. Render-only (uniform-driven). */
  glow: number
  /** Auto-rotation flow rate ∈ [0, 1.5] (render-only; turns the knot for 3D read). */
  flow: number
  /** Maximum geodesic word length to enumerate ∈ [4, 10] (integer). Bake-affecting. */
  maxLen: number
  /** Cap on the number of shortest geodesics splatted ∈ [6, 64] (integer). Bake-affecting. */
  geodesicCount: number
  /** Geodesic tube Gaussian radius in voxel units ∈ [0.6, 3]. Bake-affecting. */
  tubeWidth: number
  /** Preset identifier for the UI dropdown. `custom` = user-edited state. */
  preset: ModularKnotPresetName
}

/** Clamp ranges for every numeric ModularKnotConfig scalar (UI + URL + setters). */
export const MODULAR_KNOT_RANGES = {
  glow: { min: 0.2, max: 4 },
  flow: { min: 0, max: 1.5 },
  maxLen: { min: 4, max: 10 },
  geodesicCount: { min: 6, max: 64 },
  tubeWidth: { min: 0.6, max: 3 },
} as const

/**
 * Default Modular Knot configuration — matches the `rademacherTangle` preset:
 * a slowly-turning trefoil-cored tangle of the 24 shortest modular geodesics,
 * each colored by its exact Rademacher invariant Φ.
 */
export const DEFAULT_MODULAR_KNOT_CONFIG: ModularKnotConfig = {
  glow: 0.5,
  flow: 0.15,
  maxLen: 8,
  geodesicCount: 24,
  tubeWidth: 1.6,
  preset: 'rademacherTangle',
}

/** One Modular Knot scenario preset (config minus the preset tag itself). */
export type ModularKnotPresetValues = Omit<ModularKnotConfig, 'preset'>

/**
 * Scenario presets. The per-frame cost is a 3D-texture raymarch independent of
 * the geodesic count (the Σ-over-classes enumeration + splat runs once on the
 * CPU when the bake-affecting config changes), so all presets hold ≥45 fps.
 */
export const MODULAR_KNOT_PRESETS: Readonly<
  Record<Exclude<ModularKnotPresetName, 'custom'>, ModularKnotPresetValues>
> = {
  /** The default Rademacher tangle: 24 shortest geodesics, slow turn. */
  rademacherTangle: {
    glow: 0.5,
    flow: 0.15,
    maxLen: 8,
    geodesicCount: 24,
    tubeWidth: 1.6,
  },
  /** Prime geodesics: only the shortest, sparsest classes — clean linking read. */
  primeGeodesics: {
    glow: 0.6,
    flow: 0.1,
    maxLen: 6,
    geodesicCount: 10,
    tubeWidth: 2.0,
  },
  /** Deep spectrum: the long-word, high-|Φ| tail — a dense knotted thicket. */
  deepSpectrum: {
    glow: 0.45,
    flow: 0.25,
    maxLen: 10,
    geodesicCount: 56,
    tubeWidth: 1.2,
  },
}

/** Scenario metadata for the unified preset selector. */
export interface ModularKnotScenario {
  id: Exclude<ModularKnotPresetName, 'custom'>
  label: string
  description: string
}

/** Ordered scenario list shown in the Scenario dropdown. */
export const MODULAR_KNOT_SCENARIOS: readonly ModularKnotScenario[] = [
  {
    id: 'rademacherTangle',
    label: 'Rademacher Tangle',
    description:
      'The 24 shortest closed modular geodesics knotted around the trefoil core, each tube wound |Φ| times in the meridian and colored by its exact Rademacher invariant Φ = lk(modular knot, trefoil) — the same global winding that S(T) = arg ζ(½ + iT) realizes analytically.',
  },
  {
    id: 'primeGeodesics',
    label: 'Prime Geodesics',
    description:
      'Only the shortest primitive hyperbolic conjugacy classes (max word length 6, 10 geodesics): a sparse, clean view where each knot’s linking with the trefoil is individually legible.',
  },
  {
    id: 'deepSpectrum',
    label: 'Deep Spectrum',
    description:
      'The long-word, high-|Φ| tail (max word length 10, 56 geodesics): a dense knotted thicket whose diverging Φ colormap (cool Φ < 0 / white 0 / warm Φ > 0) exposes the spread of the Rademacher quasimorphism over the modular surface.',
  },
]
