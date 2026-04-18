/**
 * SRMT (Superspace-Relational Modular Time) — barrel export.
 *
 * Pure-TS diagnostic: Schmidt decomposition of a Wheeler–DeWitt `χ`
 * tensor, modular-Hamiltonian spectrum from the Schmidt singular values,
 * Hamilton-Jacobi operator spectrum on a fixed clock slice, and an
 * affine-match quality metric between the two spectra.
 *
 * @module lib/physics/srmt
 */

export type { SrmtPhysicsContext } from './diagnostic'
export { computeSrmtDiagnostic } from './diagnostic'
export type { HjOperatorInputs } from './hjOperator'
export { harmonicOscillator1DSpectrum, hjSpectrumOnSlice } from './hjOperator'
export { modularSpectrum } from './modularHamiltonian'
export type { ChiTensor } from './schmidt'
export { reshapeForClock, schmidtValues } from './schmidt'
export type { ComplexMatrix } from './svd'
export { complexSvdSingularValues } from './svd'
export type { SrmtClock, SrmtConfig, SrmtResult, SrmtSlicePlane } from './types'
export { extractWkbPhase } from './wkbPhase'
