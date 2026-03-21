/**
 * Quantum Walk Configuration
 *
 * Type definitions and defaults for discrete-time quantum walk on N-D lattice.
 *
 * @module lib/geometry/extended/quantumWalk
 */

/** Coin operator type for the quantum walk. */
export type QuantumWalkCoinType = 'grover' | 'hadamard' | 'dft'

/** Field view modes for quantum walk visualization. */
export type QuantumWalkFieldView = 'probability' | 'phase' | 'coinState'

/**
 * Configuration for discrete-time quantum walk simulation.
 */
export interface QuantumWalkConfig {
  /** Lattice dimensionality (driven by global dimension selector) */
  latticeDim: number
  /** Per-dimension grid sizes (power of 2) */
  gridSize: number[]
  /** Coin operator type */
  coinType: QuantumWalkCoinType
  /** Bias parameter for generalized coins */
  coinBias: number
  /** Number of walk steps completed (runtime, not persisted) */
  steps: number
  /** Steps to advance per frame */
  stepsPerFrame: number
  /** Initial walker position (grid indices) */
  initialPosition: number[]
  /** Which quantity to visualize */
  fieldView: QuantumWalkFieldView
  /** Auto-scale density normalization */
  autoScale: boolean
  /** Per-dimension grid spacing */
  spacing: number[]
  /** Runtime flag to trigger re-initialization */
  needsReset: boolean
}

/** Default quantum walk configuration. */
export const DEFAULT_QUANTUM_WALK_CONFIG: QuantumWalkConfig = {
  latticeDim: 2,
  gridSize: [64, 64],
  coinType: 'grover',
  coinBias: 0.5,
  steps: 0,
  stepsPerFrame: 1,
  initialPosition: [32, 32],
  fieldView: 'probability',
  autoScale: true,
  spacing: [0.1, 0.1],
  needsReset: false,
}
