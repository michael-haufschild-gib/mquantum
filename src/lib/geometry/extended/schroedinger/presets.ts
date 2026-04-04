/**
 * Quantum preset generation for Schrödinger visualization
 *
 * Generates seeded configurations for quantum states:
 * - Quantum numbers for each superposition term
 * - Complex coefficients
 * - Per-dimension frequencies
 * - Precomputed energies
 */

import { mulberry32 } from '@/lib/math/rng'
import { MAX_DIM, MAX_TERMS } from '@/rendering/webgpu/shaders/schroedinger/uniforms.wgsl'

/**
 * Generated quantum state data
 */
export interface QuantumPreset {
  /** Number of superposition terms */
  termCount: number
  /** Per-dimension angular frequencies ω_j */
  omega: number[]
  /** Quantum numbers n[k][j] for each term and dimension */
  quantumNumbers: number[][]
  /** Complex coefficients c_k = (re, im) */
  coefficients: [number, number][]
  /** Precomputed energies E_k = Σ ω_j(n_{kj} + 0.5) */
  energies: number[]
}

/**
 * Named preset configurations
 */
export interface NamedPresetConfig {
  name: string
  description: string
  seed: number
  termCount: number
  maxN: number
  frequencySpread: number
}

/**
 * Per-term RNG offset prime — used to create independent PRNG sequences
 * for each superposition term so that adding/removing terms does not
 * affect the quantum numbers or coefficients of other terms.
 */
const TERM_RNG_PRIME = 0x9e3779b9 // ≈ 2^32 × golden ratio, Knuth multiplicative hash

/**
 * Sample a biased quantum number for one dimension.
 *
 * For extra dimensions (j >= 3), only even quantum numbers are allowed
 * because Hermite polynomials H_n(0) = 0 for odd n at the slice coordinate 0.
 *
 * @param r - Uniform random sample in [0,1)
 * @param nMax - Maximum quantum number
 * @param mustBeEven - Whether only even values are allowed
 * @param evenMax - Largest even number <= nMax
 * @param rng - PRNG for the tail of the distribution
 * @returns Biased quantum number
 */
function sampleQuantumNumber(
  r: number,
  nMax: number,
  mustBeEven: boolean,
  evenMax: number,
  rng: () => number
): number {
  if (r < 0.4) return 0
  if (r < 0.65) return mustBeEven ? Math.min(2, evenMax) : Math.min(1, nMax)
  if (r < 0.82) return Math.min(2, mustBeEven ? evenMax : nMax)
  if (r < 0.92) return mustBeEven ? Math.min(4, evenMax) : Math.min(3, nMax)
  const raw = Math.floor(rng() * (nMax + 1))
  return mustBeEven ? Math.min(raw & ~1, evenMax) : Math.min(raw, nMax)
}

/**
 * Generate quantum numbers for a single superposition term.
 *
 * @param termRng - Per-term PRNG
 * @param dim - Number of dimensions
 * @param nMax - Maximum quantum number per dimension
 * @returns Array of quantum numbers for each dimension
 */
function generateTermQuantumNumbers(termRng: () => number, dim: number, nMax: number): number[] {
  const evenMax = nMax & ~1
  const n: number[] = []
  for (let j = 0; j < dim; j++) {
    n.push(sampleQuantumNumber(termRng(), nMax, j >= 3, evenMax, termRng))
  }
  return n
}

/**
 * Compute energy and coefficient for a superposition term.
 *
 * @param n - Quantum numbers for this term
 * @param omega - Per-dimension angular frequencies
 * @param termRng - Per-term PRNG (used for phase)
 * @returns Tuple of [energy, [re, im] coefficient]
 */
function computeTermEnergyAndCoeff(
  n: number[],
  omega: number[],
  termRng: () => number
): { energy: number; coeff: [number, number] } {
  let E = 0
  for (let j = 0; j < n.length; j++) {
    E += (omega[j] ?? 1.0) * ((n[j] ?? 0) + 0.5)
  }
  const amplitude = 1.0 / (1.0 + 0.15 * E)
  const phase = termRng() * 2 * Math.PI
  return { energy: E, coeff: [amplitude * Math.cos(phase), amplitude * Math.sin(phase)] }
}

/**
 * Generate a quantum preset with the given parameters.
 *
 * Uses per-term independent PRNG sequences so that each term's quantum
 * numbers and coefficients are determined solely by (seed, termIndex).
 * Changing termCount or maxQuantumNumber produces incremental visual
 * changes rather than wholesale randomization.
 *
 * @param seed - Random seed for deterministic generation
 * @param dimension - Number of dimensions (3-11)
 * @param termCount - Number of superposition terms (1-8)
 * @param maxN - Maximum quantum number per dimension (2-6)
 * @param frequencySpread - Variation in ω values (0-0.5)
 * @returns Generated quantum preset
 */
export function generateQuantumPreset(
  seed: number,
  dimension: number,
  termCount: number = 3,
  maxN: number = 5,
  frequencySpread: number = 0.02
): QuantumPreset {
  // Clamp parameters to valid ranges
  const dim = Math.min(Math.max(dimension, 3), MAX_DIM)
  const terms = Math.min(Math.max(termCount, 1), MAX_TERMS)
  const nMax = Math.min(Math.max(maxN, 1), 6)
  const spread = Math.min(Math.max(frequencySpread, 0), 0.5)

  // Omega uses the base seed — independent of term count
  const omegaRng = mulberry32(seed)
  const omega: number[] = []
  for (let j = 0; j < dim; j++) {
    const baseFreq = 0.8 + omegaRng() * spread * 2
    const offset = (j * 0.618033988749895) % 1.0
    omega.push(baseFreq + offset * spread * 0.5)
  }

  const quantumNumbers: number[][] = []
  const coefficients: [number, number][] = []
  const energies: number[] = []

  for (let k = 0; k < terms; k++) {
    const termRng = mulberry32((seed + (k + 1) * TERM_RNG_PRIME) | 0)
    const n = generateTermQuantumNumbers(termRng, dim, nMax)
    quantumNumbers.push(n)

    const { energy, coeff } = computeTermEnergyAndCoeff(n, omega, termRng)
    energies.push(energy)
    coefficients.push(coeff)
  }

  // Normalize coefficients so Σ|c_k|² = 1 (valid quantum state)
  const normSq = coefficients.reduce((sum, [re, im]) => sum + re * re + im * im, 0)
  if (normSq > 0) {
    const invNorm = 1.0 / Math.sqrt(normSq)
    for (let k = 0; k < coefficients.length; k++) {
      coefficients[k]![0] *= invNorm
      coefficients[k]![1] *= invNorm
    }
  }

  return {
    termCount: terms,
    omega,
    quantumNumbers,
    coefficients,
    energies,
  }
}

/**
 * Named preset configurations for the UI
 */
export const SCHROEDINGER_NAMED_PRESETS: Record<string, NamedPresetConfig> = {
  groundState: {
    name: 'Ground State',
    description:
      'The lowest energy eigenstate |0,0,0\u27E9 \u2014 a Gaussian probability density centered at the origin',
    seed: 13,
    termCount: 1,
    maxN: 1,
    frequencySpread: 0.01,
  },
  firstExcited: {
    name: 'First Excited State',
    description:
      'A single excited mode |0,0,1\u27E9 showing one nodal plane where the wavefunction changes sign',
    seed: 4,
    termCount: 1,
    maxN: 1,
    frequencySpread: 0.01,
  },
  quantumBeat: {
    name: 'Quantum Beat',
    description:
      'Two energy eigenstates with different eigenvalues, creating visible time-dependent probability oscillation',
    seed: 314,
    termCount: 2,
    maxN: 2,
    frequencySpread: 0.005,
  },
  groundExcitedBeat: {
    name: 'Ground vs Excited Beat',
    description:
      'Superposition of |0,0,0\u27E9 and |0,3,0\u27E9 \u2014 a textbook example of quantum beating between ground and third excited state',
    seed: 50,
    termCount: 2,
    maxN: 3,
    frequencySpread: 0.005,
  },
  highEnergy: {
    name: 'Excited Interference',
    description:
      'Four-term superposition with moderate quantum numbers creating complex interference fringes',
    seed: 137,
    termCount: 4,
    maxN: 5,
    frequencySpread: 0.01,
  },
  excitedTriad: {
    name: 'Excited Triad',
    description:
      'Three excited terms with varied quantum numbers producing rich, asymmetric probability density',
    seed: 2718,
    termCount: 3,
    maxN: 4,
    frequencySpread: 0.008,
  },
  nearDegenerate: {
    name: 'Near-Degenerate Trio',
    description:
      'Three terms where two share nearly equal energies, producing slowly evolving structure alongside fast oscillation',
    seed: 1618,
    termCount: 3,
    maxN: 6,
    frequencySpread: 0.01,
  },
  isotropic: {
    name: 'Isotropic Oscillator',
    description:
      'Zero frequency spread creates exact energy degeneracies \u2014 degenerate terms form time-independent combinations',
    seed: 777,
    termCount: 3,
    maxN: 3,
    frequencySpread: 0.0,
  },
  nodalStructure: {
    name: 'Nodal Structure',
    description:
      'Single highly-excited term |6,2,2\u27E9 with many nodal surfaces \u2014 shows the rich spatial structure of high quantum numbers',
    seed: 102,
    termCount: 1,
    maxN: 6,
    frequencySpread: 0.01,
  },
  richSuperposition: {
    name: 'Rich Superposition',
    description:
      'Five-term superposition producing complex, evolving probability dynamics with multiple beating frequencies',
    seed: 666,
    termCount: 5,
    maxN: 6,
    frequencySpread: 0.02,
  },
}

/**
 * Get a preset by name
 * @param name - Name of the preset
 * @param dimension - Number of dimensions
 * @returns QuantumPreset or null if not found
 */
export function getNamedPreset(name: string, dimension: number): QuantumPreset | null {
  const config = SCHROEDINGER_NAMED_PRESETS[name]
  if (!config) return null

  return generateQuantumPreset(
    config.seed,
    dimension,
    config.termCount,
    config.maxN,
    config.frequencySpread
  )
}

/**
 * Generate a random preset with the given seed
 * @param seed - Random seed
 * @param dimension - Number of dimensions
 * @returns Generated QuantumPreset
 */
export function generateRandomPreset(seed: number, dimension: number): QuantumPreset {
  const rng = mulberry32(seed)

  // Randomize parameters within reasonable ranges
  const termCount = Math.floor(rng() * 4) + 2 // 2-5
  const maxN = Math.floor(rng() * 4) + 2 // 2-5
  const frequencySpread = rng() * 0.045 + 0.005 // 0.005-0.05

  return generateQuantumPreset(seed, dimension, termCount, maxN, frequencySpread)
}

/**
 * Flatten quantum preset data for GPU uniforms
 * @param preset - The preset to flatten
 * @returns Object containing typed arrays for GPU uniforms
 */
export function flattenPresetForUniforms(preset: QuantumPreset): {
  omega: Float32Array
  quantum: Int32Array
  coeff: Float32Array
  energy: Float32Array
} {
  // Omega array (padded to MAX_DIM)
  const omega = new Float32Array(MAX_DIM)
  for (let j = 0; j < preset.omega.length; j++) {
    omega[j] = preset.omega[j] ?? 1.0
  }

  // Quantum numbers (flattened, padded to MAX_TERMS * MAX_DIM)
  const quantum = new Int32Array(MAX_TERMS * MAX_DIM)
  for (let k = 0; k < preset.quantumNumbers.length; k++) {
    const row = preset.quantumNumbers[k]
    if (row) {
      for (let j = 0; j < row.length; j++) {
        quantum[k * MAX_DIM + j] = row[j] ?? 0
      }
    }
  }

  // Coefficients (interleaved re, im)
  const coeff = new Float32Array(MAX_TERMS * 2)
  for (let k = 0; k < preset.coefficients.length; k++) {
    const pair = preset.coefficients[k]
    if (pair) {
      coeff[k * 2] = pair[0] ?? 0
      coeff[k * 2 + 1] = pair[1] ?? 0
    }
  }

  // Energies
  const energy = new Float32Array(MAX_TERMS)
  for (let k = 0; k < preset.energies.length; k++) {
    energy[k] = preset.energies[k] ?? 0
  }

  return { omega, quantum, coeff, energy }
}
