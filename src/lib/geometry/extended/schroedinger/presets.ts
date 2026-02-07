/**
 * Quantum preset generation for Schrödinger visualization
 *
 * Generates seeded configurations for quantum states:
 * - Quantum numbers for each superposition term
 * - Complex coefficients
 * - Per-dimension frequencies
 * - Precomputed energies
 */

import { MAX_DIM, MAX_TERMS } from '@/rendering/shaders/schroedinger/uniforms.glsl'

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
 * Mulberry32 seeded PRNG
 * Fast, deterministic random number generator
 * @param seed - Initial seed value
 * @returns Function that returns next random number between 0 and 1
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generate a quantum preset with the given parameters
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
  const rng = mulberry32(seed)

  // Clamp parameters to valid ranges
  const dim = Math.min(Math.max(dimension, 3), MAX_DIM)
  const terms = Math.min(Math.max(termCount, 1), MAX_TERMS)
  const nMax = Math.min(Math.max(maxN, 1), 6)
  const spread = Math.min(Math.max(frequencySpread, 0), 0.5)

  // Generate per-dimension frequencies (0.8 - 1.3 base range)
  const omega: number[] = []
  for (let j = 0; j < dim; j++) {
    const baseFreq = 0.8 + rng() * spread * 2
    // Add slight golden-ratio-based offset for each dimension
    // This creates non-repeating patterns
    const offset = (j * 0.618033988749895) % 1.0
    omega.push(baseFreq + offset * spread * 0.5)
  }

  // Generate quantum numbers and coefficients for each term
  const quantumNumbers: number[][] = []
  const coefficients: [number, number][] = []
  const energies: number[] = []

  for (let k = 0; k < terms; k++) {
    // Quantum numbers: distribution biased toward low values
    // This creates smoother, more organic shapes
    const n: number[] = []
    let _totalN = 0

    for (let j = 0; j < dim; j++) {
      const r = rng()
      let quantumN: number

      // For dimensions beyond the 3D visualization slice (j >= 3),
      // we MUST use even quantum numbers. This is because when the
      // slice coordinate is 0, Hermite polynomials H_n(0) = 0 for odd n,
      // which would zero out the entire wavefunction term.
      const mustBeEven = j >= 3

      // Biased distribution: lower numbers more likely
      if (r < 0.4) {
        quantumN = 0
      } else if (r < 0.65) {
        quantumN = mustBeEven ? 2 : 1
      } else if (r < 0.82) {
        quantumN = 2
      } else if (r < 0.92) {
        quantumN = mustBeEven ? Math.min(4, nMax) : Math.min(3, nMax)
      } else {
        const raw = Math.floor(rng() * (nMax + 1))
        quantumN = mustBeEven ? Math.min(raw & ~1, nMax) : Math.min(raw, nMax) // mask off lowest bit if must be even
      }

      n.push(quantumN)
      _totalN += quantumN
    }

    quantumNumbers.push(n)

    // Compute energy: E_k = Σ ω_j(n_{kj} + 0.5)
    let E = 0
    for (let j = 0; j < dim; j++) {
      const omegaJ = omega[j] ?? 1.0
      const nJ = n[j] ?? 0
      E += omegaJ * (nJ + 0.5)
    }
    energies.push(E)

    // Coefficient: amplitude decreases with energy, random phase
    // This keeps low-energy (smooth) terms dominant
    const amplitude = 1.0 / (1.0 + 0.15 * E)
    const phase = rng() * 2 * Math.PI
    coefficients.push([amplitude * Math.cos(phase), amplitude * Math.sin(phase)])
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
    description: 'The lowest energy eigenstate |0,0,0\u27E9 \u2014 a Gaussian probability density centered at the origin',
    seed: 13,
    termCount: 1,
    maxN: 1,
    frequencySpread: 0.01,
  },
  firstExcited: {
    name: 'First Excited State',
    description: 'A single excited mode |0,0,1\u27E9 showing one nodal plane where the wavefunction changes sign',
    seed: 4,
    termCount: 1,
    maxN: 1,
    frequencySpread: 0.01,
  },
  quantumBeat: {
    name: 'Quantum Beat',
    description: 'Two energy eigenstates with different eigenvalues, creating visible time-dependent probability oscillation',
    seed: 314,
    termCount: 2,
    maxN: 2,
    frequencySpread: 0.005,
  },
  groundExcitedBeat: {
    name: 'Ground vs Excited Beat',
    description: 'Superposition of |0,0,0\u27E9 and |0,3,0\u27E9 \u2014 a textbook example of quantum beating between ground and third excited state',
    seed: 50,
    termCount: 2,
    maxN: 3,
    frequencySpread: 0.005,
  },
  highEnergy: {
    name: 'Excited Interference',
    description: 'Four-term superposition with moderate quantum numbers creating complex interference fringes',
    seed: 137,
    termCount: 4,
    maxN: 5,
    frequencySpread: 0.01,
  },
  excitedTriad: {
    name: 'Excited Triad',
    description: 'Three excited terms with varied quantum numbers producing rich, asymmetric probability density',
    seed: 2718,
    termCount: 3,
    maxN: 4,
    frequencySpread: 0.008,
  },
  nearDegenerate: {
    name: 'Near-Degenerate Trio',
    description: 'Three terms where two share nearly equal energies, producing slowly evolving structure alongside fast oscillation',
    seed: 1618,
    termCount: 3,
    maxN: 6,
    frequencySpread: 0.01,
  },
  isotropic: {
    name: 'Isotropic Oscillator',
    description: 'Zero frequency spread creates exact energy degeneracies \u2014 degenerate terms form time-independent combinations',
    seed: 777,
    termCount: 3,
    maxN: 3,
    frequencySpread: 0.0,
  },
  nodalStructure: {
    name: 'Nodal Structure',
    description: 'Single highly-excited term |6,2,2\u27E9 with many nodal surfaces \u2014 shows the rich spatial structure of high quantum numbers',
    seed: 102,
    termCount: 1,
    maxN: 6,
    frequencySpread: 0.01,
  },
  richSuperposition: {
    name: 'Rich Superposition',
    description: 'Five-term superposition producing complex, evolving probability dynamics with multiple beating frequencies',
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
