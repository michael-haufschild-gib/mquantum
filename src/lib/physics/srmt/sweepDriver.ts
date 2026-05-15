/**
 * SRMT parameter-sweep driver — primary kinds (`cut`, `mass`, `lambda`,
 * `bc`).
 *
 * Three pure functions — one per sweep kind — that run
 * {@link computeSrmtDiagnostic} across a range of sweep values and emit
 * per-point results through an `onProgress` callback. Designed to run
 * either on the main thread (tests) or inside a dedicated Worker
 * (`srmtSweep.worker.ts`); the functions do no I/O beyond the callback.
 *
 * ## Module layout
 *
 * The driver was originally a single 800-line file. It is now split:
 *
 * - `./sweepDriverHelpers` — clamps, `normalisePointCount`,
 *   `resolveCutIndexForAxisLen`, `linspace` / `f32FromF64` / `nowMs`,
 *   the `predict*SweepCount` family, and the `SrmtSweepCancelToken` /
 *   progress-callback type aliases.
 * - `./sweepPoint`         — `computeSrmtPointFromSolver` (full per-point
 *   compute) and `writePerClockFit` (per-clock field writer).
 * - `./sweepDriver`        — this file. The four `run*Sweep` functions
 *   plus re-exports of the public surface.
 *
 * Tier-3 sensitivity drivers (phiRef / rankCap / phiExtent / gridNa /
 * gridNphi) live in `./sweepSensitivityDrivers.ts` and import directly
 * from `./sweepDriverHelpers` and `./sweepPoint`.
 *
 * ## Cut-sweep optimisation
 *
 * The Schmidt decomposition of `χ` depends only on the clock axis
 * (`src/lib/physics/srmt/schmidt.ts`) — `cutIndex` is consumed solely by
 * the Hamilton-Jacobi operator and the slice-`K` packer. `runCutSweep`
 * therefore computes {@link schmidtValues} once per clock and reuses
 * that Schmidt spectrum + modular spectrum across all cut points,
 * rebuilding only the HJ operator + affine fit per point.
 *
 * ## Mass / λ / BC sweeps
 *
 * All three require a full solver re-run per point because the physics
 * parameters that invalidate the Schmidt cache (inflaton mass, Λ,
 * boundary condition) also invalidate `χ` itself.
 *
 * @module lib/physics/srmt/sweepDriver
 */

import type {
  WdwBoundaryCondition,
  WheelerDeWittConfig,
} from '@/lib/geometry/extended/wheelerDeWitt'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverOutput,
} from '@/lib/physics/wheelerDeWitt/solver'

import type { SrmtPhysicsContext } from './diagnostic'
import { hjSpectrumOnSliceTopK } from './hjOperator'
import { modularSpectrum } from './modularHamiltonian'
import { computeVolumeElement, normalizedSchmidtValues } from './schmidt'
import {
  clampRankCap,
  clockAxisLen,
  f32FromF64,
  linspace,
  normaliseClocks,
  normalisePointCount,
  nowMs,
  resolveCutIndexForAxisLen,
  type SrmtSweepCancelToken,
  type SrmtSweepProgressCallback,
  type SrmtSweepSolveStartCallback,
} from './sweepDriverHelpers'
import { computeSrmtPointFromSolver, writePerClockFit } from './sweepPoint'
import {
  SRMT_BC_SWEEP_ORDER,
  type SrmtSweepConfig,
  type SrmtSweepLandmark,
  type SrmtSweepPoint,
} from './sweepTypes'
import type { SrmtClock } from './types'

// Re-export the helper / point-compute symbols so consumers that import
// from `./sweepDriver` don't have to update their import paths.
export {
  clampGridNa,
  clampGridNphi,
  clampPhiExtent,
  clampRankCap,
  clockAxisLen,
  f32FromF64,
  linspace,
  normaliseClocks,
  normalisePointCount,
  nowMs,
  predictCutSweepCount,
  predictGridNaSweepCount,
  predictGridNphiCoupledSweepCount,
  predictGridNphiSweepCount,
  predictRankCapSweepCount,
  resolveCutIndexForAxisLen,
  type SrmtSweepCancelToken,
  type SrmtSweepProgressCallback,
  type SrmtSweepSolveStartCallback,
} from './sweepDriverHelpers'
export { computeSrmtPointFromSolver, writePerClockFit } from './sweepPoint'
// `floorFractionFromModular` is referenced directly by the cut-sweep below
// but `floorWindow` lives in `writePerClockFit`; this comment is here so
// future maintainers know the deps haven't drifted.
// (no-op import re-export needed; the consumers grab it via `./modularHamiltonian`.)

// Re-export the sweep-landmark type so consumers that branch on landmark
// kind keep the symbol path stable.
export type { SrmtSweepLandmark }

// ── runCutSweep (Schmidt-cached) ────────────────────────────────────────────

/** Inputs to {@link runCutSweep}. */
export interface RunCutSweepInputs {
  /** Solver output to partition / slice. */
  solverOutput: WheelerDeWittSolverOutput
  /** Sweep config. `kind` must be `'cut'`. */
  config: SrmtSweepConfig
  /** Physics context for the HJ operator. */
  physics: SrmtPhysicsContext
  /** Progress hook fired per completed sweep point. */
  onProgress?: SrmtSweepProgressCallback
  /** Cancellation token. */
  cancel?: SrmtSweepCancelToken
}

/**
 * Run a cut-position sweep. Returns the accumulated sweep points.
 *
 * The Schmidt + modular spectra are computed once per clock and cached
 * across all sweep points; only the HJ operator + affine fit re-run.
 * This is a `O(N_points)` reduction in SVD work — the dominant
 * bottleneck at default grid.
 */
export function runCutSweep(input: RunCutSweepInputs): SrmtSweepPoint[] {
  const { solverOutput, config, physics, onProgress, cancel } = input
  if (config.kind !== 'cut') {
    throw new Error(`runCutSweep: expected kind='cut', got '${config.kind}'`)
  }
  const clocks = normaliseClocks(config.clocks)
  const rankCap = clampRankCap(config.rankCap)
  const [Na, Nphi1, Nphi2] = solverOutput.gridSize
  if (Nphi1 !== Nphi2) {
    throw new Error(`runCutSweep: non-square φ-grid (${Nphi1}×${Nphi2}) unsupported`)
  }

  // Precompute Schmidt + K spectra once per clock. Cut-independent. Uses
  // volume-weighted `normalizedSchmidtValues` (`Σ s_n²·dVol = 1`) so the
  // downstream affine fit's `β` is neither contaminated by `−log(Σ|χ|²)`
  // nor the residual `log(dVol)` drift Frobenius-only normalisation left
  // across `gridNa` / `gridNphi` / `phiExtent` sweeps (task #8).
  const dVol = computeVolumeElement({
    gridSize: solverOutput.gridSize,
    aMin: solverOutput.aMin,
    aMax: solverOutput.aMax,
    phiExtent: solverOutput.phiExtent,
  })
  const schmidtByClock = new Map<SrmtClock, Float64Array>()
  const kSpectrumByClock = new Map<SrmtClock, Float64Array>()
  const schmidtFullByClock = new Map<SrmtClock, Float64Array>()
  const modularEpsilonByClock = new Map<SrmtClock, number>()
  for (const clock of clocks) {
    const s = normalizedSchmidtValues(
      { chi: solverOutput.chi, gridSize: solverOutput.gridSize },
      clock,
      dVol
    )
    schmidtFullByClock.set(clock, s)
    const kept = Math.min(rankCap, s.length)
    const trimmed = new Float64Array(kept)
    for (let i = 0; i < kept; i++) trimmed[i] = s[i]!
    schmidtByClock.set(clock, trimmed)
    const modular = modularSpectrum(trimmed)
    kSpectrumByClock.set(clock, modular.spectrum)
    modularEpsilonByClock.set(clock, modular.epsilon)
  }

  // Generate normalised sweep values, resolve per-clock integer indices,
  // dedup across points that collapse to the same index on ALL requested
  // clocks.
  const sweepValues = linspace(
    config.sweepMin,
    config.sweepMax,
    normalisePointCount('cut', config.points)
  )
  const uniqueKeys = new Set<string>()
  const results: SrmtSweepPoint[] = []

  for (let i = 0; i < sweepValues.length; i++) {
    if (cancel?.aborted) break
    const cutNorm = sweepValues[i]!
    const indicesKey = clocks
      .map((c) => resolveCutIndexForAxisLen(cutNorm, clockAxisLen(c, solverOutput.gridSize)))
      .join(',')
    if (uniqueKeys.has(indicesKey)) continue
    uniqueKeys.add(indicesKey)

    const t0 = nowMs()
    const point: SrmtSweepPoint = {
      index: results.length,
      sweepValue: cutNorm,
      cutNormalized: cutNorm,
      quality: {},
      qStdev: {},
      qRigid: {},
      qRigidStdev: {},
      qLInf: {},
      nullBaselinesByClock: {},
      nullBaselinesRigidByClock: {},
      alphaByClock: {},
      betaByClock: {},
      rEffByClock: {},
      floorFractionByClock: {},
      kSpectrumByClock: {},
      hjSpectrumByClock: {},
      computeMs: 0,
    }

    for (const clock of clocks) {
      if (cancel?.aborted) break
      const axisLen = clockAxisLen(clock, solverOutput.gridSize)
      const cutIdx = resolveCutIndexForAxisLen(cutNorm, axisLen)
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
      const kSpec = kSpectrumByClock.get(clock)!
      const compareCount = Math.min(kSpec.length, hj64.length, rankCap)
      writePerClockFit(
        point,
        clock,
        kSpec,
        hj64,
        compareCount,
        schmidtFullByClock.get(clock)!,
        modularEpsilonByClock.get(clock)!
      )
      point.kSpectrumByClock[clock] = f32FromF64(kSpec)
      point.hjSpectrumByClock[clock] = hj32
    }
    point.computeMs = nowMs() - t0
    results.push(point)
    onProgress?.(point)
  }
  return results
}

// ── runMassSweep ─────────────────────────────────────────────────────────────

/** Inputs to {@link runMassSweep}. */
export interface RunMassSweepInputs {
  /** Base Wheeler–DeWitt config; `inflatonMass` is overridden per point. */
  wdwConfig: WheelerDeWittConfig
  /** Sweep config. `kind` must be `'mass'`. */
  config: SrmtSweepConfig
  onProgress?: SrmtSweepProgressCallback
  onSolveStart?: SrmtSweepSolveStartCallback
  cancel?: SrmtSweepCancelToken
}

/**
 * Run an inflaton-mass sweep. The solver re-runs for each sweep point
 * because mass changes the `χ` tensor itself. Expensive: per-point cost
 * dominated by `solveWheelerDeWitt`.
 */
export function runMassSweep(input: RunMassSweepInputs): SrmtSweepPoint[] {
  const { wdwConfig, config, onProgress, onSolveStart, cancel } = input
  if (config.kind !== 'mass') {
    throw new Error(`runMassSweep: expected kind='mass', got '${config.kind}'`)
  }
  const masses = linspace(
    config.sweepMin,
    config.sweepMax,
    normalisePointCount('mass', config.points)
  )
  const results: SrmtSweepPoint[] = []
  for (let i = 0; i < masses.length; i++) {
    if (cancel?.aborted) break
    const m = masses[i]!
    onSolveStart?.(i)
    const solverOutput = solveWheelerDeWitt({
      boundaryCondition: wdwConfig.boundaryCondition,
      inflatonMass: m,
      inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      cosmologicalConstant: wdwConfig.cosmologicalConstant,
      aMin: wdwConfig.aMin,
      aMax: wdwConfig.aMax,
      gridNa: wdwConfig.gridNa,
      gridNphi: wdwConfig.gridNphi,
      phiExtent: wdwConfig.phiExtent,
    })
    if (cancel?.aborted) break
    const point = computeSrmtPointFromSolver(
      solverOutput,
      config,
      {
        inflatonMass: m,
        cosmologicalConstant: wdwConfig.cosmologicalConstant,
        inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      },
      i,
      m
    )
    results.push(point)
    onProgress?.(point)
  }
  return results
}

// ── runLambdaSweep ───────────────────────────────────────────────────────────

/** Inputs to {@link runLambdaSweep}. */
export interface RunLambdaSweepInputs {
  /** Base Wheeler–DeWitt config; `cosmologicalConstant` is overridden per point. */
  wdwConfig: WheelerDeWittConfig
  /** Sweep config. `kind` must be `'lambda'`. */
  config: SrmtSweepConfig
  onProgress?: SrmtSweepProgressCallback
  onSolveStart?: SrmtSweepSolveStartCallback
  cancel?: SrmtSweepCancelToken
}

/**
 * Run a cosmological-constant (Λ) sweep. The solver re-runs for each
 * sweep point because Λ enters the WdW potential and therefore
 * invalidates `χ`. Expensive: per-point cost dominated by
 * `solveWheelerDeWitt`.
 */
export function runLambdaSweep(input: RunLambdaSweepInputs): SrmtSweepPoint[] {
  const { wdwConfig, config, onProgress, onSolveStart, cancel } = input
  if (config.kind !== 'lambda') {
    throw new Error(`runLambdaSweep: expected kind='lambda', got '${config.kind}'`)
  }
  const lambdas = linspace(
    config.sweepMin,
    config.sweepMax,
    normalisePointCount('lambda', config.points)
  )
  const results: SrmtSweepPoint[] = []
  for (let i = 0; i < lambdas.length; i++) {
    if (cancel?.aborted) break
    const lambda = lambdas[i]!
    onSolveStart?.(i)
    const solverOutput = solveWheelerDeWitt({
      boundaryCondition: wdwConfig.boundaryCondition,
      inflatonMass: wdwConfig.inflatonMass,
      inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      cosmologicalConstant: lambda,
      aMin: wdwConfig.aMin,
      aMax: wdwConfig.aMax,
      gridNa: wdwConfig.gridNa,
      gridNphi: wdwConfig.gridNphi,
      phiExtent: wdwConfig.phiExtent,
    })
    if (cancel?.aborted) break
    const point = computeSrmtPointFromSolver(
      solverOutput,
      config,
      {
        inflatonMass: wdwConfig.inflatonMass,
        cosmologicalConstant: lambda,
        inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      },
      i,
      lambda
    )
    results.push(point)
    onProgress?.(point)
  }
  return results
}

// ── runBcSweep ───────────────────────────────────────────────────────────────

/** Inputs to {@link runBcSweep}. */
export interface RunBcSweepInputs {
  wdwConfig: WheelerDeWittConfig
  /** Sweep config. `kind` must be `'bc'`. `points` is forced to 3. */
  config: SrmtSweepConfig
  onProgress?: SrmtSweepProgressCallback
  onSolveStart?: SrmtSweepSolveStartCallback
  cancel?: SrmtSweepCancelToken
}

/**
 * Run a boundary-condition sweep. Iterates {@link SRMT_BC_SWEEP_ORDER}
 * in order, re-solving per BC.
 */
export function runBcSweep(input: RunBcSweepInputs): SrmtSweepPoint[] {
  const { wdwConfig, config, onProgress, onSolveStart, cancel } = input
  if (config.kind !== 'bc') {
    throw new Error(`runBcSweep: expected kind='bc', got '${config.kind}'`)
  }
  const results: SrmtSweepPoint[] = []
  for (let i = 0; i < SRMT_BC_SWEEP_ORDER.length; i++) {
    if (cancel?.aborted) break
    const bc: WdwBoundaryCondition = SRMT_BC_SWEEP_ORDER[i]!
    onSolveStart?.(i)
    const solverOutput = solveWheelerDeWitt({
      boundaryCondition: bc,
      inflatonMass: wdwConfig.inflatonMass,
      inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      cosmologicalConstant: wdwConfig.cosmologicalConstant,
      aMin: wdwConfig.aMin,
      aMax: wdwConfig.aMax,
      gridNa: wdwConfig.gridNa,
      gridNphi: wdwConfig.gridNphi,
      phiExtent: wdwConfig.phiExtent,
    })
    if (cancel?.aborted) break
    const point = computeSrmtPointFromSolver(
      solverOutput,
      config,
      {
        inflatonMass: wdwConfig.inflatonMass,
        cosmologicalConstant: wdwConfig.cosmologicalConstant,
        inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      },
      i,
      i
    )
    point.sweepValueBc = bc
    results.push(point)
    onProgress?.(point)
  }
  return results
}
