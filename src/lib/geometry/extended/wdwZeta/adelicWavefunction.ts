/**
 * Mode 9 — The Adelic Wavefunction (`adelicWavefunction`).
 *
 * Adelic quantum cosmology factorizes the wavefunction over every place of ℚ:
 * ψ = ψ_∞ · Π_p ψ_p, an Archimedean (real) factor times one p-adic factor per
 * prime. The natural geometry of the p-adic factor is the Bruhat–Tits tree of
 * PGL₂(ℚ_p) — the UNIQUE (p + 1)-regular tree, the homogeneous space on which
 * the p-adic wavefunction lives. There is no freedom in the branching number:
 * the prime p forces a (p + 1)-valent tree.
 *
 * The render is a luminous FRACTAL FOREST. For each prime in a small set
 * (2, 3, 5, 7, …) a (p + 1)-ary tree of depth D radiates from a common central
 * Archimedean core, each tree confined to its own solid-angle cone; edges are
 * splatted as glowing tubes and nodes as bright points, the prime's tree colored
 * distinctly (a viridis hue per prime), brightness fading with depth. Where all
 * the trees meet sits the bright Archimedean core ψ_∞.
 *
 * "It is a constraint, not a flow": the (p + 1)-regular tree is the forced
 * p-adic geometry — no time argument, the unique branching structure per prime.
 *
 * @module lib/geometry/extended/wdwZeta/adelicWavefunction
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the Adelic Wavefunction mode. */
export type AdelicWavefunctionPresetName =
  | 'fullForest'
  | 'archimedeanBloom'
  | 'dyadicTree'
  | 'deepStrands'
  | 'placeProduct4D'
  | 'custom'

/**
 * Serializable Adelic Wavefunction config (stored on
 * `SchroedingerConfig.adelicWavefunction`). Every field reshapes the baked
 * forest; emission/glow is the shared Advanced control and is NOT here.
 */
export interface AdelicWavefunctionConfig {
  /** Bruhat–Tits tree depth D (levels of branching) ∈ [1, 4]. */
  treeDepth: number
  /** Number of primes (trees) grown from the core ∈ [1, 5] → {2,3,5,7,11}. */
  primeCount: number
  /** Angular spread of each prime's cone (children fan width) ∈ [0.2, 1.0]. */
  branchSpread: number
  /** IFS fold exponent (the p-adic branching ratio) ∈ [1.4, 2.2]; tightens/loosens the self-similar forest. */
  foldExponent: number
  /** Archimedean core ∈ [0, 1]: size/brightness of the real-place factor ψ_∞ = e^{−πx²} blooming at the centre. */
  archCore: number
  /** Preset identifier; `custom` = user-edited. */
  preset: AdelicWavefunctionPresetName
}

/** Clamp ranges for every numeric AdelicWavefunctionConfig scalar. */
export const ADELIC_WAVEFUNCTION_RANGES = {
  treeDepth: { min: 1, max: 4 },
  primeCount: { min: 1, max: 5 },
  branchSpread: { min: 0.2, max: 1.0 },
  foldExponent: { min: 1.4, max: 2.2 },
  archCore: { min: 0, max: 1 },
} as const

/** Default config — matches the `fullForest` preset. */
export const DEFAULT_ADELIC_WAVEFUNCTION_CONFIG: AdelicWavefunctionConfig = {
  treeDepth: 3,
  primeCount: 4,
  branchSpread: 0.6,
  foldExponent: 1.9,
  archCore: 0.5,
  preset: 'fullForest',
}

/** One Adelic Wavefunction scenario (config minus the preset tag). */
export type AdelicWavefunctionPresetValues = Omit<AdelicWavefunctionConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const ADELIC_WAVEFUNCTION_PRESETS: Readonly<
  Record<Exclude<AdelicWavefunctionPresetName, 'custom'>, AdelicWavefunctionPresetValues>
> = {
  /** The full ψ = ψ_∞·Π_p ψ_p: four prime trees radiating from the core. */
  fullForest: {
    treeDepth: 3,
    primeCount: 4,
    branchSpread: 0.6,
    foldExponent: 1.9,
    archCore: 0.5,
  },
  /** The Archimedean place dominant: a bright ψ_∞ Gaussian core blooming over a low forest. */
  archimedeanBloom: {
    treeDepth: 2,
    primeCount: 5,
    branchSpread: 0.7,
    foldExponent: 1.7,
    archCore: 1.0,
  },
  /** A single dyadic (p = 2) tree: the 3-regular Bruhat–Tits tree alone. */
  dyadicTree: {
    treeDepth: 4,
    primeCount: 1,
    branchSpread: 0.8,
    foldExponent: 2.0,
    archCore: 0.3,
  },
  /** Deep, narrow strands: tall trees with tight cones — the p-adic fractal. */
  deepStrands: {
    treeDepth: 4,
    primeCount: 3,
    branchSpread: 0.35,
    foldExponent: 2.15,
    archCore: 0.2,
  },
  /** 4D place product (dimension 4): the full forest, its product over places wound by W. */
  placeProduct4D: {
    treeDepth: 3,
    primeCount: 4,
    branchSpread: 0.6,
    foldExponent: 1.9,
    archCore: 0.55,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const ADELIC_WAVEFUNCTION_SCENARIOS: readonly WdwZetaScenario<
  Exclude<AdelicWavefunctionPresetName, 'custom'>
>[] = [
  {
    id: 'fullForest',
    label: 'Full Forest',
    description:
      'The adelic wavefunction ψ = ψ_∞·Π_p ψ_p drawn in full: the trees of p = 2, 3, 5, 7 radiate from a single bright Archimedean core, each a (p + 1)-regular Bruhat–Tits tree confined to its own cone and colored by its prime. The branching number is forced — a 3-valent tree for 2, a 4-valent for 3 — so the forest is the geometry the primes have no choice but to grow.',
  },
  {
    id: 'archimedeanBloom',
    label: 'Archimedean Bloom',
    description:
      'The real place taking over: the Archimedean factor ψ_∞ = e^{−πx²} — the self-dual Gaussian fixed by the Fourier transform, the ∞-place of the adeles — blooms as a bright Gaussian core over a low p-adic forest. The product ψ = ψ_∞·Π_p ψ_p is the same, but here the continuous place dominates the discrete trees, the one archimedean factor outshining the infinitely many p-adic ones.',
  },
  {
    id: 'dyadicTree',
    label: 'Dyadic Tree',
    description:
      'A single p = 2 factor: the 3-regular Bruhat–Tits tree of PGL₂(ℚ₂), grown deep. It is the unique 3-valent homogeneous tree — the 2-adic geometry has exactly this shape and no other. The self-similar dyadic branching fills the cone like a luminous coral.',
  },
  {
    id: 'deepStrands',
    label: 'Deep Strands',
    description:
      'Three prime trees with tight cones and maximal depth: long, narrow p-adic strands reaching toward the box edge. Brightness fades with tree depth, so the eye follows each strand from the bright Archimedean core out to the dim p-adic boundary at infinity.',
  },
  {
    id: 'placeProduct4D',
    label: '4D Place Product',
    description:
      'The adelic wavefunction ψ = ψ_∞·Π_p ψ_p revealed as a product over places spread through a fourth dimension. The Archimedean core is a 4-ball; the per-iteration fold of the Bruhat–Tits forest winds with the W coordinate, so rotating the X–W plane swings the trees of different prime places forward in turn — the infinite Euler product over the primes laid out along the 4th axis, each place a different slice of the same forced branching. Opens at dimension 4.',
    dimension: 4,
    rotation: { XW: 0.7 },
  },
]
