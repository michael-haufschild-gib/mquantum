/**
 * WASM Services
 *
 * This module provides high-performance WASM-accelerated functions
 * for the animation loop and other CPU-intensive operations.
 */

export {
  // Phase 6: Complex matrix exponential functions
  complexMatMulWasm,
  // Phase 1: Animation functions
  composeRotationsIndexedWasm,
  // Phase 8: Init-loop kernels (measurement collapse)
  computeFullCollapseWasm,
  // Phase 7: TDSE diagnostics functions
  // BEC incompressible spectrum
  computeIncompressibleSpectrumWasm,
  // Phase 5: Coordinate entanglement functions
  computeJointRdmWasm,
  computeLevelSpacingWasm,
  computePartialCollapseWasm,
  computeRdmWasm,
  computeScarCorrelationWasm,
  dotProductWasm,
  // Phase 4: FFT functions
  fft1dWasm,
  fftNdWasm,
  // Data conversion helpers
  float64ToVector,
  // Phase 8: Init-loop kernels (disorder)
  generateDisorderNoiseWasm,
  generateDisorderPotentialWasm,
  hermitianEigenvaluesWasm,
  ifft1dWasm,
  ifftNdWasm,
  // Initialization
  initAnimationWasm,
  isAnimationWasmReady,
  magnitudeWasm,
  matrixExponentialPadeWasm,
  // Phase 2: Matrix and vector functions
  multiplyMatricesWasm,
  multiplyMatrixVectorWasm,
  normalizeVectorWasm,
  subtractVectorsWasm,
  vonNeumannEntropyWasm,
} from './animation-wasm'
