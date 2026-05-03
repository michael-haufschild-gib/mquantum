/**
 * WASM Animation Service — barrel re-export.
 *
 * The implementation lives in {@link ./animation/}, split per-phase
 * (matrix/vector ops, FFT, entanglement, complex matrix, TDSE
 * diagnostics, collapse). This file preserves the historical public
 * surface so existing imports keep working without churn:
 *
 * ```ts
 * import { multiplyMatricesWasm } from '@/lib/wasm/animation-wasm'
 * ```
 *
 * Every binding is an optional WASM acceleration: returns `null` when
 * the runtime is not ready or the binding is missing, and the caller
 * falls back to its pure-JS implementation.
 *
 * @module lib/wasm/animation-wasm
 */

export {
  computeFullCollapseWasm,
  computePartialCollapseWasm,
  generateDisorderNoiseWasm,
  generateDisorderPotentialWasm,
} from './animation/collapse'
export { complexMatMulWasm, matrixExponentialPadeWasm } from './animation/complexMatrix'
export {
  computeJointRdmWasm,
  computeRdmWasm,
  hermitianEigenvaluesWasm,
  vonNeumannEntropyWasm,
} from './animation/entanglement'
export { fft1dWasm, fftNdWasm, ifft1dWasm, ifftNdWasm } from './animation/fft'
export { float64ToVector } from './animation/helpers'
export {
  dotProductWasm,
  magnitudeWasm,
  multiplyMatricesWasm,
  normalizeVectorWasm,
  subtractVectorsWasm,
} from './animation/matrixVector'
export { composeRotationsIndexedWasm, multiplyMatrixVectorWasm } from './animation/operations'
export { initAnimationWasm, isAnimationWasmReady } from './animation/runtime'
export {
  computeIncompressibleSpectrumWasm,
  computeLevelSpacingWasm,
  computeScarCorrelationWasm,
} from './animation/tdseDiagnostics'
