/**
 * WASM Services
 *
 * This module provides high-performance WASM-accelerated functions
 * for the animation loop and other CPU-intensive operations.
 */

export {
  // Phase 1: Animation functions
  composeRotationsIndexedWasm,
  dotProductWasm,
  flattenVertices,
  // Data conversion helpers
  float64ToVector,
  // Initialization
  initAnimationWasm,
  isAnimationWasmReady,
  magnitudeWasm,
  // Phase 2: Matrix and vector functions
  multiplyMatricesWasm,
  multiplyMatrixVectorWasm,
  normalizeVectorWasm,
  subtractVectorsWasm,
} from './animation-wasm'
