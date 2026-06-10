/**
 * Coherence Horizon configuration — Coherence-Sourced Gravity (CSG) mode.
 *
 * Renders a two-branch "cat" superposition whose *quantum coherence* (the
 * l1-norm off-diagonal coherence of the branch density matrix, C = 1 − δ)
 * sources an effective Schwarzschild–Tangherlini black hole. The renderer
 * traces null geodesics through f(r) = 1 − (r_h/r)^(d−2), producing a black
 * event-horizon shadow, a bright photon ring, and Einstein-arc lensing of the
 * glowing interference cloud. Raising `decoherence` damps only the cross term:
 * the fringes fade and the horizon evaporates exactly to zero at δ = 1 while
 * the diagonal density stays unchanged.
 *
 * Physics core: `src/lib/physics/coherenceHorizon.ts`.
 */

/** Named preset identifiers for the Coherence Horizon mode. */
export type CoherenceHorizonPresetName =
  | 'coherentCat'
  | 'halfDecohered'
  | 'evaporatedFlat'
  | 'criticalRing'
  | 'hyperLens6D'
  | 'custom'

/**
 * Serializable Coherence Horizon configuration. Stored on
 * `SchroedingerConfig.coherenceHorizon`; routed to the renderer through the
 * schroedinger version counter and packed by `packCoherenceHorizon`.
 */
export interface CoherenceHorizonConfig {
  /** Decoherence δ ∈ [0, 1]. Damps only the interference cross term; the
   * horizon radius is r_h = horizonScale·(1−δ)^(1/(d−2)) and vanishes at δ=1. */
  decoherence: number
  /** Branch separation s ∈ [0.5, 3]: lobes sit at ±s along the first axis. */
  separation: number
  /** Gaussian branch width w ∈ [0.15, 1.2]. */
  width: number
  /** Relative wavenumber k ∈ [0, 12]: interference fringes go as cos(2k·u). */
  waveNumber: number
  /** Horizon scale ∈ [0, 1.2]: r_h at full coherence (model-space units). */
  horizonScale: number
  /** Photon-ring emission gain ∈ [0, 4]. */
  ringGain: number
  /** Cloud emission gain ∈ [0.2, 4]. */
  glow: number
  /** Preset identifier for the UI dropdown. `custom` = user-edited state. */
  preset: CoherenceHorizonPresetName
}

/** Clamp ranges for every CoherenceHorizonConfig scalar (UI + URL + setters). */
export const COHERENCE_HORIZON_RANGES = {
  decoherence: { min: 0, max: 1 },
  separation: { min: 0.5, max: 3 },
  width: { min: 0.15, max: 1.2 },
  waveNumber: { min: 0, max: 12 },
  horizonScale: { min: 0, max: 1.2 },
  ringGain: { min: 0, max: 4 },
  glow: { min: 0.2, max: 4 },
} as const

/**
 * Default Coherence Horizon configuration — matches the `coherentCat` preset:
 * fully coherent cat at separation 1.6, mid-size horizon, visible fringes.
 */
export const DEFAULT_COHERENCE_HORIZON_CONFIG: CoherenceHorizonConfig = {
  decoherence: 0,
  separation: 1.6,
  width: 0.45,
  waveNumber: 5,
  horizonScale: 0.5,
  ringGain: 2.2,
  glow: 1.2,
  preset: 'coherentCat',
}

/** One Coherence Horizon scenario preset (config minus the preset tag itself). */
export type CoherenceHorizonPresetValues = Omit<CoherenceHorizonConfig, 'preset'>

/**
 * Scenario presets. All presets are tuned to hold ≥45 fps with the default
 * quality settings: the geodesic march is adaptive and the only per-preset
 * cost driver is the bounding radius (kept ≤ ~4).
 */
export const COHERENCE_HORIZON_PRESETS: Readonly<
  Record<Exclude<CoherenceHorizonPresetName, 'custom'>, CoherenceHorizonPresetValues>
> = {
  /** Fully coherent cat — shadow, photon ring, Einstein arcs, full fringes. */
  coherentCat: {
    decoherence: 0,
    separation: 1.6,
    width: 0.45,
    waveNumber: 5,
    horizonScale: 0.5,
    ringGain: 2.2,
    glow: 1.2,
  },
  /** δ = 0.55 — fringes faded, horizon shrunk: gravity mid-evaporation. */
  halfDecohered: {
    decoherence: 0.55,
    separation: 1.6,
    width: 0.45,
    waveNumber: 5,
    horizonScale: 0.5,
    ringGain: 2.2,
    glow: 1.2,
  },
  /** δ = 1 — no cross term, no horizon: bare classical lobes in flat space. */
  evaporatedFlat: {
    decoherence: 1,
    separation: 1.6,
    width: 0.45,
    waveNumber: 5,
    horizonScale: 0.5,
    ringGain: 2.2,
    glow: 1.2,
  },
  /** Tight cloud hugging the photon sphere — maximal ring + arc brightness. */
  criticalRing: {
    decoherence: 0,
    separation: 1.05,
    width: 0.3,
    waveNumber: 8,
    horizonScale: 0.6,
    ringGain: 2.6,
    glow: 1.6,
  },
  /** Designed for d ≥ 6: the (d−2) exponent walls the lensing at the photon
   * sphere — switch dimensions to compare against the gentle 3D bend. */
  hyperLens6D: {
    decoherence: 0,
    separation: 1.4,
    width: 0.4,
    waveNumber: 6,
    horizonScale: 0.55,
    ringGain: 2.0,
    glow: 1.3,
  },
}

/** Scenario metadata for the unified preset selector. */
export interface CoherenceHorizonScenario {
  id: Exclude<CoherenceHorizonPresetName, 'custom'>
  label: string
  description: string
}

/** Ordered scenario list shown in the Scenario dropdown. */
export const COHERENCE_HORIZON_SCENARIOS: readonly CoherenceHorizonScenario[] = [
  {
    id: 'coherentCat',
    label: 'Coherent Cat Horizon',
    description:
      'Fully coherent cat state (δ=0): the l1-coherence sources a Tangherlini horizon — black shadow, gold photon ring, Einstein arcs through the interference fringes.',
  },
  {
    id: 'halfDecohered',
    label: 'Half-Decohered (δ=0.55)',
    description:
      'Partial decoherence: fringes fade with visibility 0.45 and the horizon has shrunk to r_h = 0.45^(1/(d−2))·scale. Gravity mid-evaporation.',
  },
  {
    id: 'evaporatedFlat',
    label: 'Evaporated — Flat Space (δ=1)',
    description:
      'Full decoherence: the cross term is gone, r_h = 0 exactly, rays travel straight. The bare classical lobes — same diagonal density as the coherent cat.',
  },
  {
    id: 'criticalRing',
    label: 'Critical Photon Ring',
    description:
      'Tight bright cloud hugging the photon sphere with maximal ring gain — near-critical rays wind around r_ph and light up the ring.',
  },
  {
    id: 'hyperLens6D',
    label: 'Hyperdimensional Lens',
    description:
      'Tuned for 6D+: the 1/r^(d−2) Tangherlini falloff turns gentle 3D lensing into a sharp wall at the photon sphere. Switch dimension to compare.',
  },
]
