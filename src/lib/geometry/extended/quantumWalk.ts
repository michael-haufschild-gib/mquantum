/**
 * Quantum Walk Configuration
 *
 * Type definitions and defaults for discrete-time quantum walk on N-D lattice.
 *
 * @module lib/geometry/extended/quantumWalk
 */

import { sanitizePowerOfTwoGridSizes } from '@/lib/math/ndArray'

/** Coin operator type for the quantum walk. */
export type QuantumWalkCoinType = 'grover' | 'hadamard' | 'dft'

/** Initial coin state type for the quantum walk. */
export type QuantumWalkCoinInitial = 'real' | 'symmetric'

/** Field view modes for quantum walk visualization. */
export type QuantumWalkFieldView =
  | 'probability'
  | 'phase'
  | 'coinState'
  | 'coinEntropy'
  | 'causalCurvature'

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
  /** Initial coin state: 'real' = (1/√2)(|+⟩+|−⟩) asymmetric, 'symmetric' = (1/√2)(|+⟩+i|−⟩) balanced */
  coinInitial: QuantumWalkCoinInitial
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
  /** Slice positions for extra dimensions (d>3) — length equals max(0, latticeDim - 3) */
  slicePositions: number[]
}

/** Default quantum walk configuration. */
export const DEFAULT_QUANTUM_WALK_CONFIG: QuantumWalkConfig = {
  latticeDim: 2,
  gridSize: [64, 64],
  coinType: 'grover',
  coinBias: 0.5,
  coinInitial: 'real',
  steps: 0,
  stepsPerFrame: 1,
  initialPosition: [32, 32],
  fieldView: 'probability',
  autoScale: false,
  spacing: [0.1, 0.1],
  needsReset: false,
  absorberEnabled: true,
  absorberWidth: 0.2,
  pmlTargetReflection: 1e-6,
  slicePositions: [],
}

/** Maximum total lattice sites for quantum walk (matches MAX_LINEAR_DISPATCH_SITES) */
export const QW_MAX_TOTAL_SITES = 65535 * 64

/** Quantum walk shader local coin arrays are sized for 2 * 11 coin states. */
export const QW_MAX_LATTICE_DIM = 11

/** CPU references and saved states support 1D walks even though the global UI starts at 2D. */
export const QW_MIN_LATTICE_DIM = 1

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

function sanitizeQwLatticeDim(latticeDim: number): number {
  const safe = Number.isFinite(latticeDim)
    ? Math.floor(latticeDim)
    : DEFAULT_QUANTUM_WALK_CONFIG.latticeDim
  return Math.max(QW_MIN_LATTICE_DIM, Math.min(QW_MAX_LATTICE_DIM, safe))
}

function activeGridChanged(
  prev: readonly number[],
  next: readonly number[],
  latticeDim: number
): boolean {
  if (prev.length !== latticeDim || next.length !== latticeDim) return true
  for (let d = 0; d < latticeDim; d++) {
    if (prev[d] !== next[d]) return true
  }
  return false
}

/**
 * Normalize quantum-walk configs before they reach WebGPU.
 *
 * The QW shift and N-D index shaders rely on power-of-two active grid sizes
 * and a maximum 11D lattice. Direct `setSchroedingerConfig` calls, loaded
 * presets, or external callers can bypass the UI controls that normally
 * enforce those invariants, so this is the authoritative sanitizer.
 */
export function sanitizeQuantumWalkConfig<T extends QuantumWalkConfig>(config: T): T {
  const latticeDim = sanitizeQwLatticeDim(config.latticeDim)
  const dimAdjusted = latticeDim !== config.latticeDim
  const gridFallback = defaultQwGridPerDim(latticeDim)
  const paddedGridSize = Array.from({ length: latticeDim }, (_, d) => {
    const g = config.gridSize[d]
    return typeof g === 'number' ? g : gridFallback
  })
  const withDim = { ...config, latticeDim, gridSize: paddedGridSize }
  const sized = sanitizePowerOfTwoGridSizes(withDim, {
    maxTotalSites: QW_MAX_TOTAL_SITES,
  })
  const gridSize = sized.gridSize.slice(0, latticeDim)
  const gridAdjusted = activeGridChanged(config.gridSize, gridSize, latticeDim)
  const spacing = Array.from({ length: latticeDim }, (_, d) => {
    const s = sized.spacing[d]
    return typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 0.1
  })
  const spacingAdjusted = activeGridChanged(config.spacing, spacing, latticeDim)
  const initialPosition = Array.from({ length: latticeDim }, (_, d) => {
    const grid = gridSize[d] ?? 2
    const fallback = Math.floor(grid / 2)
    const raw = sized.initialPosition[d]
    const rounded = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : fallback
    return Math.max(0, Math.min(grid - 1, rounded))
  })
  const initialAdjusted = activeGridChanged(config.initialPosition, initialPosition, latticeDim)
  const slicePositions = Array.from({ length: Math.max(0, latticeDim - 3) }, (_, i) => {
    const value = sized.slicePositions[i]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  })
  const sliceAdjusted = activeGridChanged(
    config.slicePositions,
    slicePositions,
    Math.max(0, latticeDim - 3)
  )
  const changed = dimAdjusted || gridAdjusted || spacingAdjusted || initialAdjusted || sliceAdjusted
  if (!changed) return config
  return {
    ...sized,
    latticeDim,
    gridSize,
    spacing,
    initialPosition,
    slicePositions,
    needsReset: true,
  }
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
  const slicePositions = Array.from({ length: Math.max(0, newDim - 3) }, (_, i) =>
    i < prev.slicePositions.length ? prev.slicePositions[i]! : 0
  )
  return {
    latticeDim: newDim,
    gridSize,
    spacing,
    initialPosition,
    slicePositions,
    steps: 0,
    needsReset: true,
  }
}
