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

export {
  computeAffineFitLInf,
  computeAffineFitQuality,
  computeRigidFitQuality,
  jackknifeAffineFitStdev,
  jackknifeRigidFitStdev,
} from './affineFit'
export type { ClockQualityRecord } from './championClock'
export { DEFAULT_CHAMPION_TIE_TOLERANCE, findChampionClock } from './championClock'
export type { SrmtPhysicsContext } from './diagnostic'
export { computeSrmtDiagnostic } from './diagnostic'
export type { HjOperatorInputs } from './hjOperator'
export {
  harmonicOscillator1DSpectrum,
  hjSpectrumOnSlice,
  hjSpectrumOnSliceTopK,
} from './hjOperator'
export { modularSpectrum } from './modularHamiltonian'
export type { NullBaselineQuality } from './nullBaselines'
export {
  bestBaselineRatio,
  computeNullBaselines,
  computeNullBaselinesRigid,
  DEFAULT_NULL_BASELINE_SEED,
} from './nullBaselines'
export type { ChiTensor } from './schmidt'
export { reshapeForClock, schmidtValues } from './schmidt'
/**
 * Semver tag of the SRMT diagnostic pipeline (Schmidt + modular
 * Hamiltonian + HJ operator + affine/rigid fits + jackknife σ). Bumped
 * when any stage's output semantics change. Paired with
 * `WDW_SOLVER_VERSION` in the sweep CSV reproducibility manifest.
 */
export const SRMT_DIAGNOSTIC_VERSION = '1.2.0'
export type { BornOppenheimerRecord } from './bornOppenheimerChampion'
export { computeBornOppenheimerRates, findBornOppenheimerChampion } from './bornOppenheimerChampion'
export type { CutStabilityRecord } from './cutStabilityChampion'
export { computeCutStability, findCutStabilityChampion } from './cutStabilityChampion'
export type { PageWoottersRecord } from './pageWoottersChampion'
export { computePageWoottersRates, findPageWoottersChampion } from './pageWoottersChampion'
export type { ComplexMatrix } from './svd'
export { complexSvdSingularValues } from './svd'
export type {
  SrmtSweepConfig,
  SrmtSweepKind,
  SrmtSweepLandmark,
  SrmtSweepPoint,
} from './sweepTypes'
export { SRMT_BC_SWEEP_ORDER } from './sweepTypes'
export type { SrmtClock, SrmtConfig, SrmtResult, SrmtSlicePlane } from './types'
export type { WkbPhaseRateRecord } from './wkbChampion'
export { computeWkbPhaseRates, findWkbChampion } from './wkbChampion'
export { extractWkbPhase } from './wkbPhase'
