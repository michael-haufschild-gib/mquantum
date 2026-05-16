/**
 * (η, v) atlas-sweep driver for the Bell-experiment diagnostic.
 *
 * Scans a 2D grid of detection-efficiency η and Werner visibility v,
 * runs N trials per cell at the canonical CHSH angles, and reports the
 * empirical |S| plus the coincidence fraction. The result lets the UI
 * draw a heat map of the (η, v) region where CHSH violation is
 * actually achievable — a publication-grade quantum cosmology /
 * foundations panel.
 *
 * The driver is **synchronous and incremental**: each call to
 * {@link stepEtaVisibilitySweep} consumes one cell and returns the
 * result. Callers (e.g. the sweep coordinator) drive it via a setTimeout
 * loop or rAF to yield to the UI thread.
 *
 * Deterministic: each cell seeds a fresh PCG-32 from
 * `baseSeed + cellIndex` so the entire sweep replays bit-identically.
 *
 * @module lib/physics/bell/atlasSweep
 */

import type { BellAnalysisMode } from '@/lib/geometry/extended/bellPair'

import { CANONICAL_CHSH_PHI } from './analytic'
import { sampleJointOutcome } from './bornSample'
import { ChshAccumulator } from './chsh'
import { applyDetectionEfficiency, postSelectOutcome } from './loopholes'
import { PCG32 } from './pcg32'
import { azimuthalVec, jointOutcomeProbabilities } from './projectors'
import { wernerDensityMatrix } from './state'
import type { Vec3 } from './types'

/** Atlas-sweep cell coordinates and result. */
export interface AtlasSweepCellResult {
  /** Row index (η axis). */
  rowIndex: number
  /** Column index (v axis). */
  colIndex: number
  /** Detection efficiency at this cell. */
  eta: number
  /** Werner visibility at this cell. */
  visibility: number
  /** Empirical |S| at this cell (QM sampler). */
  absS: number
  /** Trial count after post-selection (fair-sampling drops non-coincidences). */
  postSelectedTrials: number
  /** Non-detections (Alice or Bob fired but not both). */
  nonDetections: number
  /** Coincidence fraction = postSelectedTrials / (postSelectedTrials + nonDetections). */
  coincidenceFraction: number
  /** Whether the cell produced |S| > 2 (CHSH violation, modulo finite-sample noise). */
  violated: boolean
}

/** Configuration for a full atlas sweep. */
export interface AtlasSweepPlan {
  /** Minimum η on the row axis. */
  etaMin: number
  /** Maximum η on the row axis. */
  etaMax: number
  /** Number of η rows. */
  etaSteps: number
  /** Minimum v on the column axis. */
  visibilityMin: number
  /** Maximum v on the column axis. */
  visibilityMax: number
  /** Number of v columns. */
  visibilitySteps: number
  /** Trials per cell. */
  trialsPerCell: number
  /** Analysis policy applied at each cell. */
  analysisMode: BellAnalysisMode
  /** Base PRNG seed; each cell uses `baseSeed + cellIndex` for independence. */
  baseSeed: number
}

/**
 * Total cell count for a sweep plan.
 *
 * @param plan - The sweep plan.
 * @returns `etaSteps × visibilitySteps`.
 */
export function totalCells(plan: AtlasSweepPlan): number {
  return plan.etaSteps * plan.visibilitySteps
}

/**
 * Run one cell of the (η, v) sweep at the canonical CHSH angles.
 *
 * @param plan - The sweep plan (only `analysisMode` + `trialsPerCell` +
 *   `baseSeed` are consumed; axis bounds are looked up via the cell
 *   index).
 * @param rowIndex - Row index (0..etaSteps-1).
 * @param colIndex - Column index (0..visibilitySteps-1).
 * @returns Cell result.
 */
export function stepEtaVisibilitySweep(
  plan: AtlasSweepPlan,
  rowIndex: number,
  colIndex: number
): AtlasSweepCellResult {
  const etaSpan = plan.etaSteps > 1 ? (plan.etaMax - plan.etaMin) / (plan.etaSteps - 1) : 0
  const visSpan =
    plan.visibilitySteps > 1
      ? (plan.visibilityMax - plan.visibilityMin) / (plan.visibilitySteps - 1)
      : 0
  const eta = plan.etaMin + rowIndex * etaSpan
  const v = plan.visibilityMin + colIndex * visSpan

  // Canonical CHSH angles (xy-plane).
  const aliceAxes: readonly [Vec3, Vec3] = [
    azimuthalVec(CANONICAL_CHSH_PHI.a),
    azimuthalVec(CANONICAL_CHSH_PHI.aPrime),
  ]
  const bobAxes: readonly [Vec3, Vec3] = [
    azimuthalVec(CANONICAL_CHSH_PHI.b),
    azimuthalVec(CANONICAL_CHSH_PHI.bPrime),
  ]
  const rho = wernerDensityMatrix(v)
  const probsByBin = [0, 1, 2, 3].map((bin) => {
    const sA = (bin >>> 1) & 1
    const sB = bin & 1
    return jointOutcomeProbabilities(rho, aliceAxes[sA]!, bobAxes[sB]!)
  })

  const cellIndex = rowIndex * plan.visibilitySteps + colIndex
  const seed = (plan.baseSeed + cellIndex) >>> 0
  const rng = new PCG32(BigInt(seed))
  const acc = new ChshAccumulator()
  let nonDetections = 0
  let postSelectedTrials = 0
  const trials = plan.trialsPerCell

  for (let k = 0; k < trials; k++) {
    const draw = rng.nextU32()
    const settingA = (draw >>> 31) & 1
    const settingB = (draw >>> 30) & 1
    const bin = settingA * 2 + settingB
    const outcome = sampleJointOutcome(probsByBin[bin]!, rng)
    const detected = applyDetectionEfficiency(outcome, { etaA: eta, etaB: eta }, rng)
    const post = postSelectOutcome(detected, plan.analysisMode)
    if (post === null) {
      nonDetections++
      continue
    }
    postSelectedTrials++
    acc.recordTrial(settingA as 0 | 1, settingB as 0 | 1, post[0], post[1])
  }

  const S = acc.getS()
  const absS = Number.isFinite(S) ? Math.abs(S) : 0
  const total = postSelectedTrials + nonDetections
  const coincidenceFraction = total > 0 ? postSelectedTrials / total : 0
  return {
    rowIndex,
    colIndex,
    eta,
    visibility: v,
    absS,
    postSelectedTrials,
    nonDetections,
    coincidenceFraction,
    violated: absS > 2,
  }
}

/**
 * Run the full sweep synchronously and return all cell results.
 *
 * Convenience for headless / test usage. Interactive UI callers should
 * prefer {@link stepEtaVisibilitySweep} in a yielding loop so the main
 * thread stays responsive at large grid sizes.
 *
 * @param plan - Sweep plan.
 * @returns Flat list of cell results, row-major (row = η, col = v).
 */
export function runFullEtaVisibilitySweep(plan: AtlasSweepPlan): AtlasSweepCellResult[] {
  const results: AtlasSweepCellResult[] = []
  for (let r = 0; r < plan.etaSteps; r++) {
    for (let c = 0; c < plan.visibilitySteps; c++) {
      results.push(stepEtaVisibilitySweep(plan, r, c))
    }
  }
  return results
}
