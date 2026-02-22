/**
 * Open Quantum Systems — Public API
 *
 * Density matrix representation with Lindblad master equation dynamics
 * for modeling decoherence, relaxation, and thermal effects.
 */

export type {
  DensityMatrix,
  LindbladChannel,
  OpenQuantumConfig,
  OpenQuantumMetrics,
  OpenQuantumVisualizationMode,
} from './types'

export { DEFAULT_OPEN_QUANTUM_CONFIG } from './types'

export { buildLindbladChannels } from './channels'

export { applyDissipator, computeDissipator } from './lindblad'

export {
  createDensityMatrix,
  densityMatrixFromCoefficients,
  evolveStep,
  evolveMultiStep,
  hermitianEigendecompose,
  MAX_K,
} from './integrator'

export {
  trace,
  purity,
  linearEntropy,
  vonNeumannEntropy,
  coherenceMagnitude,
  groundPopulation,
  computeMetrics,
} from './metrics'

export {
  OPEN_QUANTUM_BUFFER_FLOATS,
  OPEN_QUANTUM_BUFFER_BYTES,
  createPackedBuffer,
  packForGPU,
  unpackFromGPU,
} from './statePacking'

// --- Hydrogen-specific modules ---

export type { HydrogenBasisState } from './hydrogenBasis'
export {
  buildHydrogenBasis,
  basisLabels,
  basisEnergies,
  hydrogenEnergy,
  extraDimEnergy,
} from './hydrogenBasis'

export { isAllowedE1, dipoleComponent } from './selectionRules'

export {
  radialDipoleIntegral,
  angularFactor,
  wigner3j,
  dipoleMatrixElementSquared,
  clearDipoleCache,
} from './dipoleElements'

export type { TransitionRate } from './hydrogenRates'
export {
  einsteinA,
  thermalOccupation,
  buildTransitionRates,
} from './hydrogenRates'

export { buildHydrogenChannels } from './hydrogenChannels'

export type { ComplexMatrix } from './complexMatrix'
export {
  complexMatZero,
  complexMatIdentity,
  complexMatMul,
  complexMatAdd,
  complexMatScale,
  complexMatCopy,
  complexMatNorm1,
  matrixExponentialPade,
  solveLinearSystem,
} from './complexMatrix'

export { buildLiouvillian } from './liouvillian'

export {
  computePropagator,
  applyPropagator,
  evolvePropagatorStep,
} from './propagator'

export type { ValidationResult } from './validation'
export {
  validateDensityMatrix,
  validateDetailedBalance,
  validateSelectionRules,
} from './validation'
