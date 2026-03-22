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
  /** Enable absorbing boundaries (amplitude damping near edges) */
  absorberEnabled: boolean
  /** Fraction of grid per side used for absorbing layer (0–0.5) */
  absorberWidth: number
  /** Per-step damping target at outer edge (e.g. 1e-6) */
  pmlTargetReflection: number
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
  absorberEnabled: true,
  absorberWidth: 0.2,
  pmlTargetReflection: 1e-6,
}

/** Maximum total lattice sites for quantum walk (matches MAX_LINEAR_DISPATCH_SITES) */
const QW_MAX_TOTAL_SITES = 65535 * 64

/**
 * Compute the default per-dimension grid size for quantum walk, capped
 * so that gridSize^dim stays within the GPU dispatch limit.
 *
 * @param dim - Number of lattice dimensions
 * @returns Power-of-2 grid size per dimension
 */
function defaultQwGridPerDim(dim: number): number {
  let pow2 = 64
  while (pow2 > 2 && Math.pow(pow2, dim) > QW_MAX_TOTAL_SITES) {
    pow2 = pow2 / 2
  }
  return pow2
}

/**
 * Resize quantum walk arrays to match a new lattice dimension, computing appropriate
 * grid sizes and recentering the initial walker position.
 *
 * @param prev - Previous quantum walk configuration
 * @param newDim - New lattice dimensionality
 * @returns Partial config with resized arrays and needsReset=true
 */
export function resizeQuantumWalkArrays(
  prev: QuantumWalkConfig,
  newDim: number
): Partial<QuantumWalkConfig> {
  const gridDefault = defaultQwGridPerDim(newDim)
  const gridSize = Array.from({ length: newDim }, () => gridDefault)
  const spacing = Array.from({ length: newDim }, (_, i) =>
    i < prev.spacing.length ? prev.spacing[i]! : 0.1
  )
  const initialPosition = gridSize.map((s) => Math.floor(s / 2))
  return {
    latticeDim: newDim,
    gridSize,
    spacing,
    initialPosition,
    steps: 0,
    needsReset: true,
  }
}
