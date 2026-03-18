/**
 * Open Quantum Systems — Public API
 *
 * Density matrix representation with Lindblad master equation dynamics
 * for modeling decoherence, relaxation, and thermal effects.
 */

export { buildLindbladChannels } from './channels'
export {
  createDensityMatrix,
  densityMatrixFromCoefficients,
  evolveMultiStep,
  evolveStep,
  hermitianEigendecompose,
  MAX_K,
} from './integrator'
export { applyDissipator, computeDissipator } from './lindblad'
export {
  coherenceMagnitude,
  computeMetrics,
  groundPopulation,
  linearEntropy,
  purity,
  trace,
  vonNeumannEntropy,
} from './metrics'
export {
  createPackedBuffer,
  OPEN_QUANTUM_BUFFER_BYTES,
  OPEN_QUANTUM_BUFFER_FLOATS,
  packForGPU,
  unpackFromGPU,
} from './statePacking'
export type {
  DensityMatrix,
  LindbladChannel,
  OpenQuantumConfig,
  OpenQuantumMetrics,
  OpenQuantumVisualizationMode,
} from './types'
export { DEFAULT_OPEN_QUANTUM_CONFIG } from './types'

// --- Hydrogen-specific modules ---

export type { ComplexMatrix } from './complexMatrix'
export {
  complexMatAdd,
  complexMatCopy,
  complexMatIdentity,
  complexMatMul,
  complexMatNorm1,
  complexMatScale,
  complexMatZero,
  matrixExponentialPade,
  solveLinearSystem,
} from './complexMatrix'
export {
  angularFactor,
  clearDipoleCache,
  dipoleMatrixElementSquared,
  radialDipoleIntegral,
  wigner3j,
} from './dipoleElements'
export type { HydrogenBasisState } from './hydrogenBasis'
export {
  basisEnergies,
  basisLabels,
  buildHydrogenBasis,
  extraDimEnergy,
  hydrogenEnergy,
} from './hydrogenBasis'
export { buildHydrogenChannels } from './hydrogenChannels'
export type { TransitionRate } from './hydrogenRates'
export { buildTransitionRates, einsteinA, thermalOccupation } from './hydrogenRates'
export { buildLiouvillian } from './liouvillian'
export { applyPropagator, computePropagator, evolvePropagatorStep } from './propagator'
export { dipoleComponent, isAllowedE1 } from './selectionRules'
export type { ValidationResult } from './validation'
export {
  validateDensityMatrix,
  validateDetailedBalance,
  validateSelectionRules,
} from './validation'
