/**
 * Tier-3 SRMT sensitivity sweep drivers.
 *
 * Varies a **non-physical** or **grid** knob across sweep points, so that
 * a claim that survives the sweep cannot be an artifact of that knob:
 *
 *  - {@link runPhiRefSweep}  — vary the landmark `phiRef`. `q` is exactly
 *    invariant by construction (the modular and HJ spectra do not
 *    consume phiRef); the landmark is recomputed per point and attached
 *    to `SrmtSweepPoint.perPointLandmarks` so the UI can render its
 *    motion alongside the flat `q(φref)` curves.
 *  - {@link runRankCapSweep} — vary the Lanczos / Schmidt `rankCap`. A
 *    claim that moves with rankCap is a numerical artifact of spectrum
 *    truncation, not physics.
 *  - {@link runPhiExtentSweep} — vary the φ-grid half-range. Requires a
 *    solver re-run per point (changes `dφ`). A claim that moves with
 *    phiExtent is a discretisation artifact.
 *
 * Extracted from `sweepDriver.ts` to keep each file within the 600-line
 * `max-lines` budget and to reflect the conceptual separation between
 * physics sweeps (cut / mass / λ / bc) and sensitivity sweeps.
 *
 * @module lib/physics/srmt/sweepSensitivityDrivers
 */

import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverOutput,
} from '@/lib/physics/wheelerDeWitt/solver'

import type { SrmtPhysicsContext } from './diagnostic'
import { hjSpectrumOnSliceTopK } from './hjOperator'
import { modularSpectrum } from './modularHamiltonian'
import { schmidtValues } from './schmidt'
import {
  clampRankCap,
  computeSrmtPointFromSolver,
  f32FromF64,
  linspace,
  normaliseClocks,
  normalisePointCount,
  nowMs,
  resolveCutIndexForAxisLen,
  type SrmtSweepCancelToken,
  type SrmtSweepProgressCallback,
  type SrmtSweepSolveStartCallback,
  writePerClockFit,
} from './sweepDriver'
import type { SrmtSweepConfig, SrmtSweepPoint } from './sweepTypes'
import { computeCutLandmark, type TurningPointLandmarkInputs } from './turningPointLandmark'
import type { SrmtClock } from './types'

/** Length of the clock axis in the grid. */
function clockAxisLen(clock: SrmtClock, gridSize: readonly [number, number, number]): number {
  return clock === 'a' ? gridSize[0] : gridSize[1]
}

/** Inputs to {@link runPhiRefSweep}. */
export interface RunPhiRefSweepInputs {
  /**
   * Solver output captured at sweep start. The φRef sweep does **not**
   * re-solve — phiRef is not a solver input. It is purely a
   * landmark-reference knob, so the driver reuses the same χ across
   * every sweep point.
   */
  solverOutput: WheelerDeWittSolverOutput
  /** Sweep config. `kind` must be `'phiRef'`. */
  config: SrmtSweepConfig
  /** Physics context for the HJ operator. */
  physics: SrmtPhysicsContext
  onProgress?: SrmtSweepProgressCallback
  cancel?: SrmtSweepCancelToken
}

/**
 * Run a phiRef sweep at fixed physics + cut. `q` is identical across
 * every sweep point by construction (phiRef does not enter the compute);
 * the physics read is the per-point landmark motion. See
 * `docs/physics/srmt-metric.md` for the Tier-3 sensitivity framing.
 */
export function runPhiRefSweep(input: RunPhiRefSweepInputs): SrmtSweepPoint[] {
  const { solverOutput, config, physics, onProgress, cancel } = input
  if (config.kind !== 'phiRef') {
    throw new Error(`runPhiRefSweep: expected kind='phiRef', got '${config.kind}'`)
  }
  const clocks = normaliseClocks(config.clocks)
  const rankCap = clampRankCap(config.rankCap)
  const [Na, Nphi1, Nphi2] = solverOutput.gridSize
  if (Nphi1 !== Nphi2) {
    throw new Error(`runPhiRefSweep: non-square φ-grid (${Nphi1}×${Nphi2}) unsupported`)
  }

  // Per-clock cached K and HJ spectra — φref does not change either.
  const cache = new Map<
    SrmtClock,
    { kSpec: Float64Array; hj64: Float64Array; hj32: Float32Array }
  >()
  for (const clock of clocks) {
    const axisLen = clockAxisLen(clock, solverOutput.gridSize)
    const cutIdx = resolveCutIndexForAxisLen(config.cutNormalized, axisLen)
    const s = schmidtValues({ chi: solverOutput.chi, gridSize: solverOutput.gridSize }, clock)
    const kept = Math.min(rankCap, s.length)
    const trimmed = new Float64Array(kept)
    for (let i = 0; i < kept; i++) trimmed[i] = s[i]!
    const kSpec = modularSpectrum(trimmed).spectrum
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
        sliceIndex: cutIdx,
      },
      rankCap
    )
    const hj64 = new Float64Array(hj32.length)
    for (let j = 0; j < hj32.length; j++) hj64[j] = hj32[j]!
    cache.set(clock, { kSpec, hj64, hj32 })
  }

  const phiRefs = linspace(
    config.sweepMin,
    config.sweepMax,
    normalisePointCount('phiRef', config.points)
  )
  const results: SrmtSweepPoint[] = []
  for (let i = 0; i < phiRefs.length; i++) {
    if (cancel?.aborted) break
    const phiRef = phiRefs[i]!
    const t0 = nowMs()
    const point: SrmtSweepPoint = {
      index: i,
      sweepValue: phiRef,
      cutNormalized: config.cutNormalized,
      quality: {},
      qStdev: {},
      qRigid: {},
      qRigidStdev: {},
      kSpectrumByClock: {},
      hjSpectrumByClock: {},
      computeMs: 0,
    }
    for (const clock of clocks) {
      const cached = cache.get(clock)!
      const compareCount = Math.min(cached.kSpec.length, cached.hj64.length, rankCap)
      writePerClockFit(point, clock, cached.kSpec, cached.hj64, compareCount)
      point.kSpectrumByClock[clock] = f32FromF64(cached.kSpec)
      // Copy the cached HJ32 so per-point transferables stay independent:
      // transferring a shared buffer detaches every subsequent reader.
      point.hjSpectrumByClock[clock] = new Float32Array(cached.hj32)
    }
    point.perPointLandmarks = clocks.map((clock) =>
      computeCutLandmark(
        buildLandmarkInputsForPhiRef(clock, phiRef, config.cutNormalized, physics, solverOutput)
      )
    )
    point.computeMs = nowMs() - t0
    results.push(point)
    onProgress?.(point)
  }
  return results
}

/** Inputs to {@link runRankCapSweep}. */
export interface RunRankCapSweepInputs {
  solverOutput: WheelerDeWittSolverOutput
  /** Sweep config. `kind` must be `'rankCap'`. */
  config: SrmtSweepConfig
  physics: SrmtPhysicsContext
  onProgress?: SrmtSweepProgressCallback
  cancel?: SrmtSweepCancelToken
}

/**
 * Run a rankCap sweep at fixed physics + cut + grid. Schmidt is
 * precomputed once at the maximum rankCap and sliced per point; HJ
 * top-k is rank-dependent and re-extracted per point.
 */
export function runRankCapSweep(input: RunRankCapSweepInputs): SrmtSweepPoint[] {
  const { solverOutput, config, physics, onProgress, cancel } = input
  if (config.kind !== 'rankCap') {
    throw new Error(`runRankCapSweep: expected kind='rankCap', got '${config.kind}'`)
  }
  const clocks = normaliseClocks(config.clocks)
  const [Na, Nphi1, Nphi2] = solverOutput.gridSize
  if (Nphi1 !== Nphi2) {
    throw new Error(`runRankCapSweep: non-square φ-grid (${Nphi1}×${Nphi2}) unsupported`)
  }

  // Integer-valued sweep values with dedup (rounded linspace can collapse).
  const lo = clampRankCap(config.sweepMin)
  const hi = clampRankCap(config.sweepMax)
  const [rLo, rHi] = lo <= hi ? [lo, hi] : [hi, lo]
  const rankSeries = linspace(rLo, rHi, normalisePointCount('rankCap', config.points))
  const uniqueRanks: number[] = []
  const seen = new Set<number>()
  for (let i = 0; i < rankSeries.length; i++) {
    const r = Math.round(rankSeries[i]!)
    if (!seen.has(r)) {
      seen.add(r)
      uniqueRanks.push(r)
    }
  }

  const maxRank = uniqueRanks.reduce((a, b) => Math.max(a, b), 0)
  const schmidtByClock = new Map<SrmtClock, Float64Array>()
  for (const clock of clocks) {
    const s = schmidtValues({ chi: solverOutput.chi, gridSize: solverOutput.gridSize }, clock)
    const kept = Math.min(maxRank, s.length)
    const trimmed = new Float64Array(kept)
    for (let i = 0; i < kept; i++) trimmed[i] = s[i]!
    schmidtByClock.set(clock, trimmed)
  }

  const results: SrmtSweepPoint[] = []
  for (let i = 0; i < uniqueRanks.length; i++) {
    if (cancel?.aborted) break
    const rankCap = uniqueRanks[i]!
    const t0 = nowMs()
    const point: SrmtSweepPoint = {
      index: i,
      sweepValue: rankCap,
      cutNormalized: config.cutNormalized,
      quality: {},
      qStdev: {},
      qRigid: {},
      qRigidStdev: {},
      kSpectrumByClock: {},
      hjSpectrumByClock: {},
      computeMs: 0,
    }
    for (const clock of clocks) {
      const axisLen = clockAxisLen(clock, solverOutput.gridSize)
      const cutIdx = resolveCutIndexForAxisLen(config.cutNormalized, axisLen)
      const schmidtMax = schmidtByClock.get(clock)!
      const kept = Math.min(rankCap, schmidtMax.length)
      const trimmed = new Float64Array(kept)
      for (let j = 0; j < kept; j++) trimmed[j] = schmidtMax[j]!
      const kSpec = modularSpectrum(trimmed).spectrum

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
          sliceIndex: cutIdx,
        },
        rankCap
      )
      const hj64 = new Float64Array(hj32.length)
      for (let j = 0; j < hj32.length; j++) hj64[j] = hj32[j]!
      const compareCount = Math.min(kSpec.length, hj64.length, rankCap)
      writePerClockFit(point, clock, kSpec, hj64, compareCount)
      point.kSpectrumByClock[clock] = f32FromF64(kSpec)
      point.hjSpectrumByClock[clock] = hj32
    }
    point.computeMs = nowMs() - t0
    results.push(point)
    onProgress?.(point)
  }
  return results
}

/** Inputs to {@link runPhiExtentSweep}. */
export interface RunPhiExtentSweepInputs {
  /**
   * Base Wheeler–DeWitt config; `phiExtent` is overridden per point.
   * The grid count `gridNphi` stays fixed — the φ-grid *spacing* `dφ`
   * changes with `phiExtent`, not the number of samples.
   */
  wdwConfig: WheelerDeWittConfig
  /** Sweep config. `kind` must be `'phiExtent'`. */
  config: SrmtSweepConfig
  onProgress?: SrmtSweepProgressCallback
  onSolveStart?: SrmtSweepSolveStartCallback
  cancel?: SrmtSweepCancelToken
}

/**
 * Run a phiExtent sweep. Full solver re-run per point because the φ
 * half-range enters both the WdW potential's φ-Laplacian spacing and
 * the HJ operator's φ-grid.
 */
export function runPhiExtentSweep(input: RunPhiExtentSweepInputs): SrmtSweepPoint[] {
  const { wdwConfig, config, onProgress, onSolveStart, cancel } = input
  if (config.kind !== 'phiExtent') {
    throw new Error(`runPhiExtentSweep: expected kind='phiExtent', got '${config.kind}'`)
  }
  const extents = linspace(
    config.sweepMin,
    config.sweepMax,
    normalisePointCount('phiExtent', config.points)
  )
  const results: SrmtSweepPoint[] = []
  for (let i = 0; i < extents.length; i++) {
    if (cancel?.aborted) break
    const phiExtent = extents[i]!
    onSolveStart?.(i)
    const solverOutput = solveWheelerDeWitt({
      boundaryCondition: wdwConfig.boundaryCondition,
      inflatonMass: wdwConfig.inflatonMass,
      cosmologicalConstant: wdwConfig.cosmologicalConstant,
      aMin: wdwConfig.aMin,
      aMax: wdwConfig.aMax,
      gridNa: wdwConfig.gridNa,
      gridNphi: wdwConfig.gridNphi,
      phiExtent,
    })
    if (cancel?.aborted) break
    const point = computeSrmtPointFromSolver(
      solverOutput,
      config,
      {
        inflatonMass: wdwConfig.inflatonMass,
        cosmologicalConstant: wdwConfig.cosmologicalConstant,
      },
      i,
      phiExtent
    )
    results.push(point)
    onProgress?.(point)
  }
  return results
}

/**
 * Build landmark-inputs for the phiRef driver. The φref sweep needs
 * per-point landmarks; the driver calls this once per point and per
 * clock.
 */
function buildLandmarkInputsForPhiRef(
  clock: SrmtClock,
  phiRef: number,
  cutNormalized: number,
  physics: SrmtPhysicsContext,
  solverOutput: WheelerDeWittSolverOutput
): TurningPointLandmarkInputs {
  return {
    clock,
    inflatonMass: physics.inflatonMass,
    cosmologicalConstant: physics.cosmologicalConstant,
    aMin: solverOutput.aMin,
    aMax: solverOutput.aMax,
    phiExtent: solverOutput.phiExtent,
    phiRef,
    cutNormalized,
  }
}
