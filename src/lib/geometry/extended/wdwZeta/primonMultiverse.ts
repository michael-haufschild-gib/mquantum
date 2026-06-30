/**
 * Mode 5 — The Third-Quantized Multiverse (`primonMultiverse`).
 *
 * Third quantization promotes the Wheeler–DeWitt wavefunction itself to a
 * field operator: the cosmos becomes a Fock gas of universe-quanta. Index the
 * quanta by the PRIMES — each prime p is a "primon" with energy E_p = ln p, so
 * the single-prime occupation is the Bose number n_p = 1/(p^β − 1) and the
 * grand partition function is exactly the Riemann zeta function ζ(β) = Σ n^{−β}.
 * As the inverse temperature β → 1⁺ the partition function diverges (the
 * Hagedorn point) and the low primes' occupations blow up — a multiverse
 * "ignition".
 *
 * The render is a sparse 3D CONSTELLATION of glowing prime-nodes distributed
 * over a golden-angle Fibonacci sphere (NOT concentric shells): each node is a
 * Gaussian splat whose brightness rides its Bose occupation, so as β → 1 the
 * first few primes blaze and the constellation ignites. Optionally faint tubes
 * link each universe to its antiuniverse partner (a node and its antipode −p),
 * the third-quantized creation/annihilation pairing.
 *
 * "It is a constraint, not a flow": β is a bake-affecting control — each value
 * fixes the FORCED thermal equilibrium of the gas, not an animation frame.
 *
 * @module lib/geometry/extended/wdwZeta/primonMultiverse
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the Primon Multiverse mode. */
export type PrimonMultiversePresetName =
  | 'coldGas'
  | 'hagedornIgnition'
  | 'adsMultiverse'
  | 'momentumShells'
  | 'pairedVacuum'
  | 'antiverse4D'
  | 'custom'

/**
 * Serializable Primon Multiverse config (stored on
 * `SchroedingerConfig.primonMultiverse`). Every field reshapes the baked
 * constellation; emission/glow is the shared Advanced control and is NOT here.
 */
export interface PrimonMultiverseConfig {
  /** Primon-gas inverse temperature β ∈ [1.02, 3]; → 1⁺ is the Hagedorn point. */
  beta: number
  /** Number of prime universe-quanta placed on the Fibonacci sphere ∈ [8, 120]. */
  primeCount: number
  /** Draw faint universe–antiuniverse pair links (node ↔ its antipode). */
  pairLinks: boolean
  /** Constellation geometry ∈ {0,1,2}: 0 = log-spiral, 1 = AdS Poincaré-ball (primes crowd the boundary by hyperbolic radius), 2 = free-scalar-field momentum k-shells. */
  latticeMode: number
  /** Universe–antiuniverse link-tube brightness/extent ∈ [0, 1]. */
  linkGain: number
  /** Node-radius scaling by Bose occupation ∈ [0.3, 2]. */
  occScale: number
  /** Preset identifier; `custom` = user-edited. */
  preset: PrimonMultiversePresetName
}

/** Clamp ranges for every numeric PrimonMultiverseConfig scalar. */
export const PRIMON_MULTIVERSE_RANGES = {
  beta: { min: 1.02, max: 3 },
  primeCount: { min: 8, max: 120 },
  latticeMode: { min: 0, max: 2 },
  linkGain: { min: 0, max: 1 },
  occScale: { min: 0.3, max: 2 },
} as const

/** Default config — matches the `hagedornIgnition` preset. */
export const DEFAULT_PRIMON_MULTIVERSE_CONFIG: PrimonMultiverseConfig = {
  beta: 1.15,
  primeCount: 64,
  pairLinks: false,
  latticeMode: 0,
  linkGain: 0.5,
  occScale: 1.0,
  preset: 'hagedornIgnition',
}

/** One Primon Multiverse scenario (config minus the preset tag). */
export type PrimonMultiversePresetValues = Omit<PrimonMultiverseConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const PRIMON_MULTIVERSE_PRESETS: Readonly<
  Record<Exclude<PrimonMultiversePresetName, 'custom'>, PrimonMultiversePresetValues>
> = {
  /** A cold, near-empty gas: high β, almost every occupation suppressed. */
  coldGas: {
    beta: 2.4,
    primeCount: 80,
    pairLinks: false,
    latticeMode: 0,
    linkGain: 0.5,
    occScale: 1.0,
  },
  /** Just above the Hagedorn point: the low primes blaze, the gas ignites. */
  hagedornIgnition: {
    beta: 1.15,
    primeCount: 64,
    pairLinks: false,
    latticeMode: 0,
    linkGain: 0.5,
    occScale: 1.2,
  },
  /** The Fock gas laid out on the AdS Poincaré ball — primes crowd the boundary. */
  adsMultiverse: {
    beta: 1.3,
    primeCount: 90,
    pairLinks: false,
    latticeMode: 1,
    linkGain: 0.5,
    occScale: 1.0,
  },
  /** Free-scalar-field momentum shells: the primes sorted onto |k|-spheres. */
  momentumShells: {
    beta: 1.5,
    primeCount: 72,
    pairLinks: false,
    latticeMode: 2,
    linkGain: 0.4,
    occScale: 0.9,
  },
  /** Universe–antiuniverse pairs threaded across the box (third-quantized vacuum). */
  pairedVacuum: {
    beta: 1.4,
    primeCount: 48,
    pairLinks: true,
    latticeMode: 0,
    linkGain: 0.85,
    occScale: 1.0,
  },
  /** 4D Hopf multiverse (dimension 4): the prime constellation mangled onto the
   *  Hopf fibration of S³ — beads winding the interlinked Villarceau circles, the
   *  fiber thread fusing them into rings. Gentle ignition so it reads in colour. */
  antiverse4D: {
    beta: 1.5,
    primeCount: 64,
    pairLinks: true,
    latticeMode: 0,
    linkGain: 0.5,
    occScale: 0.95,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const PRIMON_MULTIVERSE_SCENARIOS: readonly WdwZetaScenario<
  Exclude<PrimonMultiversePresetName, 'custom'>
>[] = [
  {
    id: 'hagedornIgnition',
    label: 'Hagedorn Ignition',
    description:
      'The gas just above its Hagedorn point (β = 1.15). The grand partition function ζ(β) is climbing toward its β = 1 divergence, so the lowest primes — the 2-quantum, the 3-quantum, the 5-quantum — blaze with runaway Bose occupation n_p = 1/(p^β − 1) while the high primes stay dim points. The constellation is the third-quantized vacuum on the brink of igniting a multiverse.',
  },
  {
    id: 'coldGas',
    label: 'Cold Gas',
    description:
      'A cold third-quantized gas (β = 2.4): every prime occupation is exponentially suppressed and the partition function ζ(2.4) is finite and small. The constellation is a faint, even scatter of dim primon-nodes — far from ignition, the universes barely populate their Fock states.',
  },
  {
    id: 'adsMultiverse',
    label: 'AdS Multiverse',
    description:
      'The third-quantized gas laid out on the AdS Poincaré ball: each prime universe-quantum is placed at hyperbolic radius tanh(½·ln p) along a Fibonacci-sphere direction, so the heavy primes crowd toward the conformal boundary while the light ones sit near the centre. The same Bose occupations blaze, but now read as a holographic shell of worlds packed against the boundary of anti-de Sitter space.',
  },
  {
    id: 'momentumShells',
    label: 'Momentum Shells',
    description:
      'The primes sorted into free-scalar-field momentum shells: |k| ∝ ln p, quantized into concentric spheres. The constellation reorganizes from a spiral into nested k-shells — the Fock gas seen in momentum space, each shell a band of universe-quanta of equal field momentum, brightness still riding the Bose occupation.',
  },
  {
    id: 'pairedVacuum',
    label: 'Paired Vacuum',
    description:
      'The third-quantized vacuum with universe–antiuniverse links switched on: each primon-node is joined by a faint tube to its antipode −p, the partner produced with it from the no-boundary vacuum. The pairing is the creation/annihilation structure of the cosmological field operator, drawn as a web of conjugate worlds.',
  },
  {
    id: 'antiverse4D',
    label: 'Hopf Multiverse (4D)',
    description:
      'The third-quantized gas laid on the Hopf fibration of the 3-sphere: three mutually interlinked rings thread the prime constellation, each prime-universe a quantum riding a Hopf circle. The Fock gas ζ(β) forces into thermal equilibrium is revealed as a genuinely four-dimensional weave — the universe-quanta are no longer a loose scatter but links of a single Hopf bundle. Rotate the X–W plane to spin the fibration. Opens at dimension 4.',
    dimension: 4,
    rotation: { XW: 0.7 },
  },
]
