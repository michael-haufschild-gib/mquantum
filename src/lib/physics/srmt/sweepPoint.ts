/**
 * Per-point SRMT diagnostic compute used by every sweep kind.
 *
 * Two functions:
 * - `computeSrmtPointFromSolver` — full per-point diagnostic (Schmidt
 *   decomposition + HJ Lanczos + affine fit) given a solver output and
 *   a sweep config / physics context.
 * - `writePerClockFit` — the affine + rigid quality fields plus α/β,
 *   `rEff`, and `floorFraction`. Called by every sweep kind so the
 *   per-clock fields are filled by a single code path.
 *
 * Extracted from `./sweepDriver.ts` so the four `run*Sweep` functions
 * and the sensitivity drivers all import the same per-point compute.
 *
 * @module lib/physics/srmt/sweepPoint
 */

import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'

import {
  computeRigidFitQuality,
  fitAffineParams,
  jackknifeAffineFitStdev,
  jackknifeRigidFitStdev,
} from './affineFit'
import type { SrmtPhysicsContext } from './diagnostic'
import { hjSpectrumOnSliceTopK } from './hjOperator'
import { floorFractionFromModular, modularSpectrum } from './modularHamiltonian'
import { computeVolumeElement, effectiveRankFromSchmidt, normalizedSchmidtValues } from './schmidt'
import {
  clampRankCap,
  clockAxisLen,
  f32FromF64,
  normaliseClocks,
  nowMs,
  resolveCutIndexForAxisLen,
} from './sweepDriverHelpers'
import type { SrmtSweepConfig, SrmtSweepPoint } from './sweepTypes'
import type { SrmtClock } from './types'

/**
 * Compute an SRMT diagnostic point from a fully-resolved solver output.
 *
 * Used by mass / λ / BC / sensitivity sweeps where a full per-point
 * solver re-run produces fresh `χ`, so each call recomputes the Schmidt
 * spectrum + modular spectrum + HJ spectrum + affine fit from scratch.
 *
 * Cut sweeps short-circuit this function for speed: they precompute
 * Schmidt + K once per clock and only refit the HJ/affine per point.
 * See `runCutSweep`.
 */
export function computeSrmtPointFromSolver(
  solverOutput: WheelerDeWittSolverOutput,
  config: SrmtSweepConfig,
  physics: SrmtPhysicsContext,
  index: number,
  sweepValue: number
): SrmtSweepPoint {
  const clocks = normaliseClocks(config.clocks)
  const rankCap = clampRankCap(config.rankCap)
  const t0 = nowMs()
  const point: SrmtSweepPoint = {
    index,
    sweepValue,
    cutNormalized: config.cutNormalized,
    quality: {},
    qStdev: {},
    qRigid: {},
    qRigidStdev: {},
    alphaByClock: {},
    betaByClock: {},
    rEffByClock: {},
    floorFractionByClock: {},
    kSpectrumByClock: {},
    hjSpectrumByClock: {},
    computeMs: 0,
  }
  const [Na, Nphi1] = solverOutput.gridSize
  const dVol = computeVolumeElement({
    gridSize: solverOutput.gridSize,
    aMin: solverOutput.aMin,
    aMax: solverOutput.aMax,
    phiExtent: solverOutput.phiExtent,
  })
  for (const clock of clocks) {
    const axisLen = clockAxisLen(clock, solverOutput.gridSize)
    const cutIdx = resolveCutIndexForAxisLen(config.cutNormalized, axisLen)
    const schmidt = normalizedSchmidtValues(
      { chi: solverOutput.chi, gridSize: solverOutput.gridSize },
      clock,
      dVol
    )
    const kept = Math.min(rankCap, schmidt.length)
    const trimmed = new Float64Array(kept)
    for (let i = 0; i < kept; i++) trimmed[i] = schmidt[i]!
    const modular = modularSpectrum(trimmed)
    const kSpec = modular.spectrum

    const { spectrum: hj32 } = hjSpectrumOnSliceTopK(
      clock,
      {
        Na,
        Nphi: Nphi1,
        aMin: solverOutput.aMin,
        aMax: solverOutput.aMax,
        phiExtent: solverOutput.phiExtent,
        inflatonMass: physics.inflatonMass,
        cosmologicalConstant: physics.cosmologicalConstant,
        inflatonMassAsymmetry: physics.inflatonMassAsymmetry ?? 1,
        sliceIndex: cutIdx,
      },
      rankCap,
      config.seed !== undefined ? { seed: config.seed } : undefined
    )
    const hj64 = new Float64Array(hj32.length)
    for (let j = 0; j < hj32.length; j++) hj64[j] = hj32[j]!
    const compareCount = Math.min(kSpec.length, hj64.length, rankCap)
    writePerClockFit(point, clock, kSpec, hj64, compareCount, schmidt, modular.epsilon)
    point.kSpectrumByClock[clock] = f32FromF64(kSpec)
    point.hjSpectrumByClock[clock] = hj32
  }
  point.computeMs = nowMs() - t0
  return point
}

/**
 * Write the affine + rigid fit quality, their jackknife σ, the
 * affine-fit parameters `α` / `β`, and the spectrum-diagnostic
 * `rEff` / `floorFraction` fields for one clock into a sweep point.
 *
 * Factored out so every sweep kind — cut, mass, λ, bc, phiRef, rankCap,
 * phiExtent, gridNa, gridNphi — fills the same per-clock fields via a
 * single call site. `compareCount` must already be clamped to
 * `min(K.length, E.length, rankCap)`.
 *
 * `q_affine` and `q_rigid` remain numerically identical to the
 * pre-`fitAffineParams` implementation — the affine q is pulled from
 * the unified `fitAffineParams` result (same FP ops in the same order)
 * and the rigid q is unchanged. `α` / `β` are written only when finite
 * so consumers can distinguish "fit succeeded" from "degenerate".
 *
 * `rEff` is computed over the FULL schmidt array (pre-rankCap trim) so
 * a caller with `rankCap < fullRank` still sees the true
 * effective-rank rather than a ceiling at `rankCap`. `floorFraction`
 * is computed over the top-`compareCount` slice of K (the window the
 * affine fit actually consumed), using the same ε the modular
 * spectrum was regularised with — so pinned-at-floor modes the fit
 * saw are the same ones the diagnostic counts.
 *
 * @param schmidtFull - Full (untrimmed) descending Schmidt array,
 *                      L²-normalised. Pass the array returned from
 *                      {@link normalizedSchmidtValues}.
 * @param modularEpsilon - The `epsilon` value returned from
 *                      {@link modularSpectrum} for this clock's K.
 */
export function writePerClockFit(
  point: SrmtSweepPoint,
  clock: SrmtClock,
  K: Float64Array,
  E: Float64Array,
  compareCount: number,
  schmidtFull: Float64Array,
  modularEpsilon: number
): void {
  const affine = fitAffineParams(K, E, compareCount)
  point.quality[clock] = affine.q
  const { alpha, beta, q } = affine
  if (Number.isFinite(alpha)) point.alphaByClock![clock] = alpha
  if (Number.isFinite(beta)) point.betaByClock![clock] = beta
  if (Number.isFinite(q)) {
    const sigma = jackknifeAffineFitStdev(K, E, compareCount)
    if (Number.isFinite(sigma)) point.qStdev![clock] = sigma
  }
  const qRigid = computeRigidFitQuality(K, E, compareCount)
  point.qRigid![clock] = qRigid
  if (Number.isFinite(qRigid)) {
    const sigma = jackknifeRigidFitStdev(K, E, compareCount)
    if (Number.isFinite(sigma)) point.qRigidStdev![clock] = sigma
  }
  point.rEffByClock![clock] = effectiveRankFromSchmidt(schmidtFull)
  const floorWindow = compareCount > 0 && compareCount <= K.length ? K.subarray(0, compareCount) : K
  point.floorFractionByClock![clock] = floorFractionFromModular(floorWindow, modularEpsilon)
}
