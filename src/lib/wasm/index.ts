/**
 * WASM Services
 *
 * This module provides high-performance WASM-accelerated functions
 * for the animation loop and other CPU-intensive operations.
 */

export {
  // Initialization
  initAnimationWasm,
  isAnimationWasmReady,
  // Phase 1: Animation functions
  composeRotationsWasm,
  projectVerticesWasm,
  projectEdgesWasm,
  multiplyMatrixVectorWasm,
  // Phase 2: Matrix and vector functions
  multiplyMatricesWasm,
  dotProductWasm,
  magnitudeWasm,
  normalizeVectorWasm,
  subtractVectorsWasm,
  // Data conversion helpers
  float64ToVector,
  flattenVertices,
  flattenEdges,
} from './animation-wasm'
