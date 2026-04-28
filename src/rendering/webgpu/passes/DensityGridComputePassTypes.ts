/**
 * Type-only module for the DensityGridComputePass shape.
 *
 * Lives in its own file so `DensityGridComputePassBuffers.ts` can reference
 * the config without importing the pass module — the pass module imports the
 * buffer factory back, which forms a structural cycle.
 *
 * @module rendering/webgpu/passes/DensityGridComputePassTypes
 */

/**
 * Configuration for the density grid compute pass.
 */
export interface DensityGridComputeConfig {
  /** Grid resolution (default: 64) */
  gridSize?: number
  /** Number of dimensions (3-11) */
  dimension: number
  /** Quantum mode */
  quantumMode?: 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled'
  /** Number of HO superposition terms for compile-time optimization */
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** Force rgba16float format (ensures phase data for dim > 3 momentum mode) */
  forceRgba?: boolean
  /** Use density matrix evaluation (open quantum system mode) */
  useDensityMatrix?: boolean
  /** Use hydrogen basis buffer for per-basis quantum numbers (hydrogen + density matrix) */
  useHydrogenBasis?: boolean
}
