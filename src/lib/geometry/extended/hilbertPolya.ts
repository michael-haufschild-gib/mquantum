/**
 * Hilbert–Pólya Spectrum configuration — Evans-landscape filament mode.
 *
 * Renders the 3D volume (Re z, Im z, θ) of the Riemann operator's shooting
 * determinant |Ẽ_θ(z)|: the Riemann zeros appear as filaments pinned to the
 * Im z = 0 plane, the (1−2^{1−s}) prefactor comb sits at Im z = −1/2, and the
 * third axis sweeps the contour rotation θ from 0 (zeros hidden beneath the
 * archimedean/Matsubara cancellation veil) to π/2−0.15 (fully crystallized).
 * The heavy math lives in `src/lib/physics/hilbertPolya/evans.ts`; the volume
 * LUT is computed in a Web Worker and uploaded progressively.
 */

/** Named preset identifiers for the Hilbert–Pólya mode. */
export type HilbertPolyaPresetName =
  | 'criticalPlane'
  | 'matsubaraVeil'
  | 'etaComb'
  | 'doublePrecisionHorizon'
  | 'custom'

/**
 * Serializable Hilbert–Pólya configuration. Stored on
 * `SchroedingerConfig.hilbertPolya`.
 */
export interface HilbertPolyaConfig {
  /** Upper Re z bound of the window [5, zMax] (40…240). */
  zMax: number
  /** Half-extent of the Im z axis (0.6…1.2). */
  yExtent: number
  /** Gaussian filament half-width in Re z units (0.05…0.5). */
  filamentWidth: number
  /** Filament emission gain (0.2…4). */
  glow: number
  /** Veil (cancellation-noise fog) emission gain (0…2). */
  fogGain: number
  /** Faint marker plane at Im z = 0 — the critical line (render-only). */
  planeMarker: boolean
  /** Preset identifier for the UI dropdown. `custom` = user-edited state. */
  preset: HilbertPolyaPresetName
}

/** Clamp ranges for every numeric HilbertPolyaConfig scalar (UI + URL + setters). */
export const HILBERT_POLYA_RANGES = {
  zMax: { min: 40, max: 240 },
  yExtent: { min: 0.6, max: 1.2 },
  filamentWidth: { min: 0.05, max: 0.5 },
  glow: { min: 0.2, max: 4 },
  fogGain: { min: 0, max: 2 },
} as const

/** Default configuration — matches the `criticalPlane` preset. */
export const DEFAULT_HILBERT_POLYA_CONFIG: HilbertPolyaConfig = {
  zMax: 120,
  yExtent: 1,
  filamentWidth: 0.25,
  glow: 1.6,
  fogGain: 0.6,
  planeMarker: true,
  preset: 'criticalPlane',
}

/** One scenario preset (config minus the preset tag itself). */
export type HilbertPolyaPresetValues = Omit<HilbertPolyaConfig, 'preset'>

/** Scenario presets. Per-sample shader cost is one trilerp — fps-safe. */
export const HILBERT_POLYA_PRESETS: Readonly<
  Record<Exclude<HilbertPolyaPresetName, 'custom'>, HilbertPolyaPresetValues>
> = {
  /** The headline view: 31 zero-filaments pinned to the critical plane. */
  criticalPlane: {
    zMax: 120,
    yExtent: 1,
    filamentWidth: 0.25,
    glow: 1.6,
    fogGain: 0.6,
    planeMarker: true,
  },
  /** Fog-forward: the f64 cancellation veil dominating the unrotated end. */
  matsubaraVeil: {
    zMax: 240,
    yExtent: 1,
    filamentWidth: 0.3,
    glow: 1.2,
    fogGain: 1.4,
    planeMarker: false,
  },
  /** Window framing the off-axis eta-prefactor comb at Im z = −1/2. */
  etaComb: {
    zMax: 80,
    yExtent: 0.8,
    filamentWidth: 0.2,
    glow: 2,
    fogGain: 0.3,
    planeMarker: true,
  },
  /** The veil's visibility line (π/2−θ)·z ≈ 36 cutting the window in two. */
  doublePrecisionHorizon: {
    zMax: 60,
    yExtent: 0.8,
    filamentWidth: 0.2,
    glow: 1.8,
    fogGain: 1,
    planeMarker: true,
  },
}

/** Scenario metadata for the unified preset selector. */
export interface HilbertPolyaScenario {
  id: Exclude<HilbertPolyaPresetName, 'custom'>
  label: string
  description: string
}

/** Ordered scenario list shown in the Scenario dropdown. */
export const HILBERT_POLYA_SCENARIOS: readonly HilbertPolyaScenario[] = [
  {
    id: 'criticalPlane',
    label: 'Critical Plane',
    description:
      'Every spectral filament of the Riemann operator pinned to the Im z = 0 plane — the Riemann Hypothesis as geometry. One off-plane filament anywhere would be a counterexample.',
  },
  {
    id: 'matsubaraVeil',
    label: 'Matsubara Veil',
    description:
      'At θ ≈ 0 the zeros drown beneath the archimedean e^{−πz/2} envelope (double-precision cancellation fog); flying along the θ axis lifts the thermal veil and the filaments crystallize.',
  },
  {
    id: 'etaComb',
    label: 'Eta Comb (Calibration)',
    description:
      'The (1−2^{1−s}) prefactor zeros form a comb at Im z = −1/2, spaced 2π/log 2 ≈ 9.06 — proof that the instrument can see off-axis zeros when they exist. The emptiness elsewhere is a measurement.',
  },
  {
    id: 'doublePrecisionHorizon',
    label: 'Double-Precision Horizon',
    description:
      'The visibility line (π/2−θ)·z ≈ 36 — where IEEE double precision runs out of bits against the Gamma envelope — slices diagonally through the volume: numerics as a horizon.',
  },
]
