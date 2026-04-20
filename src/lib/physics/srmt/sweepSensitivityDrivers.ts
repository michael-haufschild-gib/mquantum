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
import { computeVolumeElement, normalizedSchmidtValues } from './schmidt'
import {
  clampGridNa,
  clampGridNphi,
  clampPhiExtent,
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
  // Volume-weighted `normalizedSchmidtValues` (`Σ s_n²·dVol = 1`) keeps
  // `β` uncontaminated by `−log(Σ|χ|²)` and by the residual `log(dVol)`
  // drift Frobenius-only normalisation carried across grid sweeps
  // (task #8).
  const dVol = computeVolumeElement({
    gridSize: solverOutput.gridSize,
    aMin: solverOutput.aMin,
    aMax: solverOutput.aMax,
    phiExtent: solverOutput.phiExtent,
  })
  const cache = new Map<
    SrmtClock,
    {
      kSpec: Float64Array
      hj64: Float64Array
      hj32: Float32Array
      schmidtFull: Float64Array
      epsilon: number
    }
  >()
  for (const clock of clocks) {
    const axisLen = clockAxisLen(clock, solverOutput.gridSize)
    const cutIdx = resolveCutIndexForAxisLen(config.cutNormalized, axisLen)
    const s = normalizedSchmidtValues(
      { chi: solverOutput.chi, gridSize: solverOutput.gridSize },
      clock,
      dVol
    )
    const kept = Math.min(rankCap, s.length)
    const trimmed = new Float64Array(kept)
    for (let i = 0; i < kept; i++) trimmed[i] = s[i]!
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
    cache.set(clock, { kSpec, hj64, hj32, schmidtFull: s, epsilon: modular.epsilon })
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
      alphaByClock: {},
      betaByClock: {},
      rEffByClock: {},
      floorFractionByClock: {},
      kSpectrumByClock: {},
      hjSpectrumByClock: {},
      computeMs: 0,
    }
    for (const clock of clocks) {
      const cached = cache.get(clock)!
      const compareCount = Math.min(cached.kSpec.length, cached.hj64.length, rankCap)
      writePerClockFit(
        point,
        clock,
        cached.kSpec,
        cached.hj64,
        compareCount,
        cached.schmidtFull,
        cached.epsilon
      )
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
  // Cache the FULL L²-normalised Schmidt array per clock so each per-point
  // iteration gets both the trimmed sub-spectrum (drives modular + affine
  // fit) and the full spectrum (drives `effectiveRankFromSchmidt`).
  // Volume-weighted normalisation (task #8) keeps `β` drift-free across
  // rankCap sweeps by absorbing the `log(dVol)` offset here instead of
  // leaking it into the affine fit.
  const dVol = computeVolumeElement({
    gridSize: solverOutput.gridSize,
    aMin: solverOutput.aMin,
    aMax: solverOutput.aMax,
    phiExtent: solverOutput.phiExtent,
  })
  const schmidtByClock = new Map<SrmtClock, Float64Array>()
  const schmidtFullByClock = new Map<SrmtClock, Float64Array>()
  for (const clock of clocks) {
    const s = normalizedSchmidtValues(
      { chi: solverOutput.chi, gridSize: solverOutput.gridSize },
      clock,
      dVol
    )
    schmidtFullByClock.set(clock, s)
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
      alphaByClock: {},
      betaByClock: {},
      rEffByClock: {},
      floorFractionByClock: {},
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
      writePerClockFit(
        point,
        clock,
        kSpec,
        hj64,
        compareCount,
        schmidtFullByClock.get(clock)!,
        modular.epsilon
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
 *
 * Range `[0.5, 10]` — widened from `[0.5, 5]` because empirically
 * `q_a(phiExtent)` is monotone-non-plateau inside `[1, 3]` at default
 * physics, so a meaningful convergence claim requires window expansion.
 * CFL is unchanged (phiExtent enters `dφ = 2·phiExtent/(Nφ−1)`
 * quadratically in the CFL term `da²·(1/dφ²)·(1/aMin²)`; larger
 * phiExtent ⇒ larger dφ ⇒ smaller 1/dφ² ⇒ looser CFL, so the widened
 * upper bound is strictly safer at fixed `Nφ=32`, not tighter).
 */
export function runPhiExtentSweep(input: RunPhiExtentSweepInputs): SrmtSweepPoint[] {
  const { wdwConfig, config, onProgress, onSolveStart, cancel } = input
  if (config.kind !== 'phiExtent') {
    throw new Error(`runPhiExtentSweep: expected kind='phiExtent', got '${config.kind}'`)
  }
  // Clamp sweep bounds to the driver's contract `[0.5, 10]`. Matches the
  // gridNa / gridNphi pattern: a URL / programmatic config that passes an
  // out-of-range bound must not blow past the CFL-safe envelope.
  const lo = clampPhiExtent(config.sweepMin)
  const hi = clampPhiExtent(config.sweepMax)
  const [eLo, eHi] = lo <= hi ? [lo, hi] : [hi, lo]
  const extents = linspace(eLo, eHi, normalisePointCount('phiExtent', config.points))
  const results: SrmtSweepPoint[] = []
  for (let i = 0; i < extents.length; i++) {
    if (cancel?.aborted) break
    const phiExtent = extents[i]!
    onSolveStart?.(i)
    const solverOutput = solveWheelerDeWitt({
      boundaryCondition: wdwConfig.boundaryCondition,
      inflatonMass: wdwConfig.inflatonMass,
      inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
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
        inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      },
      i,
      phiExtent
    )
    results.push(point)
    onProgress?.(point)
  }
  return results
}

/** Inputs to {@link runGridNaSweep}. */
export interface RunGridNaSweepInputs {
  /**
   * Base Wheeler–DeWitt config; `gridNa` is overridden per point. Every
   * other knob (φ-extent, mass, Λ, BC, `[aMin, aMax]`) is held fixed so
   * the convergence read isolates the `a`-discretisation error.
   */
  wdwConfig: WheelerDeWittConfig
  /** Sweep config. `kind` must be `'gridNa'`. */
  config: SrmtSweepConfig
  onProgress?: SrmtSweepProgressCallback
  onSolveStart?: SrmtSweepSolveStartCallback
  cancel?: SrmtSweepCancelToken
}

/**
 * Run a `gridNa` (Cauchy / grid-convergence) sweep. Full solver re-run
 * per point because the `a`-grid spacing `da = (aMax − aMin) / (Na − 1)`
 * enters the leapfrog step. Sweep values are clamped to `[64, 1024]`,
 * integer-rounded, and deduplicated post-round so a request that
 * collapses (e.g. `sw_n=9` across `[64, 80]`) emits the smaller
 * meaningful set instead of repeating identical solver calls.
 *
 * The end-user contract: the published `q` value is converged when the
 * tail residual `|q(N_a) − q(N_a^max)|` shrinks monotonically with
 * `N_a`. A claim that fails this property at the chosen publication
 * grid is unfit to publish — it carries unbounded systematic error from
 * the discretisation.
 */
export function runGridNaSweep(input: RunGridNaSweepInputs): SrmtSweepPoint[] {
  const { wdwConfig, config, onProgress, onSolveStart, cancel } = input
  if (config.kind !== 'gridNa') {
    throw new Error(`runGridNaSweep: expected kind='gridNa', got '${config.kind}'`)
  }
  // Clamp + integer-round + dedup, exactly mirroring the rankCap pattern:
  // a rounded linspace over a narrow range (e.g. [64, 80] with 9 points)
  // collapses to far fewer integers, and emitting duplicates would waste
  // the dominant per-point cost (full solver re-run).
  const lo = clampGridNa(config.sweepMin)
  const hi = clampGridNa(config.sweepMax)
  const [rLo, rHi] = lo <= hi ? [lo, hi] : [hi, lo]
  const series = linspace(rLo, rHi, normalisePointCount('gridNa', config.points))
  const uniqueValues: number[] = []
  const seen = new Set<number>()
  for (let i = 0; i < series.length; i++) {
    const v = Math.round(series[i]!)
    if (!seen.has(v)) {
      seen.add(v)
      uniqueValues.push(v)
    }
  }

  const results: SrmtSweepPoint[] = []
  for (let i = 0; i < uniqueValues.length; i++) {
    if (cancel?.aborted) break
    const gridNa = uniqueValues[i]!
    onSolveStart?.(i)
    const solverOutput = solveWheelerDeWitt({
      boundaryCondition: wdwConfig.boundaryCondition,
      inflatonMass: wdwConfig.inflatonMass,
      inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      cosmologicalConstant: wdwConfig.cosmologicalConstant,
      aMin: wdwConfig.aMin,
      aMax: wdwConfig.aMax,
      gridNa,
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
      gridNa
    )
    results.push(point)
    onProgress?.(point)
  }
  return results
}

/** Inputs to {@link runGridNphiSweep}. */
export interface RunGridNphiSweepInputs {
  /**
   * Base Wheeler–DeWitt config; `gridNphi` is overridden per point. As
   * with {@link RunGridNaSweepInputs} every other physical knob is held
   * fixed so the convergence read isolates the φ-axis discretisation
   * error.
   */
  wdwConfig: WheelerDeWittConfig
  /** Sweep config. `kind` must be `'gridNphi'`. */
  config: SrmtSweepConfig
  onProgress?: SrmtSweepProgressCallback
  onSolveStart?: SrmtSweepSolveStartCallback
  cancel?: SrmtSweepCancelToken
}

/**
 * Run a `gridNphi` (Cauchy / grid-convergence) sweep. Full solver re-run
 * per point because the φ-grid spacing `dφ = 2·phiExtent / (Nφ − 1)`
 * enters both the φ-Laplacian term in the WdW potential and the HJ
 * operator's φ-grid. Sweep values are clamped to `[32, 64]` — the
 * asymptotic branch of `q_a(Nφ)`. Below 32 the Schmidt matrix column
 * count `min(Na, Nφ²)` drops below `Na=128` and `q_a` enters a
 * non-monotone pre-asymptotic hump (10× regression vs. the default
 * `Nφ=32` baseline); above 64 the explicit-leapfrog CFL term
 * `da²·8/dφ²/aMin²` exceeds the solver's warn budget by >6×. Sweep
 * values are integer-rounded and deduplicated.
 *
 * Same publication contract as {@link runGridNaSweep}: monotonic Cauchy
 * convergence in the tail certifies that the published `q` is not a
 * φ-discretisation artifact.
 */
export function runGridNphiSweep(input: RunGridNphiSweepInputs): SrmtSweepPoint[] {
  const { wdwConfig, config, onProgress, onSolveStart, cancel } = input
  if (config.kind !== 'gridNphi') {
    throw new Error(`runGridNphiSweep: expected kind='gridNphi', got '${config.kind}'`)
  }
  const lo = clampGridNphi(config.sweepMin)
  const hi = clampGridNphi(config.sweepMax)
  const [rLo, rHi] = lo <= hi ? [lo, hi] : [hi, lo]
  const series = linspace(rLo, rHi, normalisePointCount('gridNphi', config.points))
  const uniqueValues: number[] = []
  const seen = new Set<number>()
  for (let i = 0; i < series.length; i++) {
    const v = Math.round(series[i]!)
    if (!seen.has(v)) {
      seen.add(v)
      uniqueValues.push(v)
    }
  }

  const results: SrmtSweepPoint[] = []
  for (let i = 0; i < uniqueValues.length; i++) {
    if (cancel?.aborted) break
    const gridNphi = uniqueValues[i]!
    onSolveStart?.(i)
    const solverOutput = solveWheelerDeWitt({
      boundaryCondition: wdwConfig.boundaryCondition,
      inflatonMass: wdwConfig.inflatonMass,
      inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      cosmologicalConstant: wdwConfig.cosmologicalConstant,
      aMin: wdwConfig.aMin,
      aMax: wdwConfig.aMax,
      gridNa: wdwConfig.gridNa,
      gridNphi,
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
      gridNphi
    )
    results.push(point)
    onProgress?.(point)
  }
  return results
}

/** Inputs to {@link runGridNphiCoupledSweep}. */
export interface RunGridNphiCoupledSweepInputs {
  /**
   * Base Wheeler–DeWitt config; `gridNphi` is overridden per point AND
   * `gridNa` is bumped per point via {@link coupledGridNaFor} so the
   * CFL term `da²·8/dφ²/aMin²` stays approximately bounded as the
   * φ-sample count grows.
   */
  wdwConfig: WheelerDeWittConfig
  /** Sweep config. `kind` must be `'gridNphiCoupled'`. */
  config: SrmtSweepConfig
  onProgress?: SrmtSweepProgressCallback
  onSolveStart?: SrmtSweepSolveStartCallback
  cancel?: SrmtSweepCancelToken
}

/**
 * Compute the per-point `gridNa` that holds the explicit-leapfrog CFL
 * term `da²·8/dφ²/aMin² ≤ 4` satisfied as `gridNphi` grows. The solver
 * enforces this inequality (see `src/lib/physics/wheelerDeWitt/solver.ts`
 * around the `WDW_CFL_BUDGET` check); reversing it with
 * `da = (aMax − aMin)/(Na − 1)` and `dφ = 2·phiExtent/(Nφ − 1)` yields
 *
 *   `Na_min = ceil(1 + (aMax − aMin)·(Nφ − 1) / (√2·phiExtent·aMin))`
 *
 * The bound is LINEAR in `(Nφ − 1)`, not quadratic in `Nφ`: the prior
 * `ceil(4·Nφ²·phiExt²/aMin²)` closed form saturated `clampGridNa`'s
 * upper bound (1024) at default physics for every Nφ ≥ 32, defeating
 * the coupling's purpose.
 *
 * The result is clamped via {@link clampGridNa} so a runaway auto-bump
 * cannot allocate a solver grid that exceeds per-point memory budgets.
 * The caller's `wdwConfig.gridNa` acts as a floor: the coupled kind
 * never decreases `gridNa` below the user's baseline, even when the
 * formula alone would.
 *
 * @param Nphi - Integer `gridNphi` for this sweep point.
 * @param wdwConfig - Base WdW config; `aMin`, `aMax`, `phiExtent`,
 *                    `gridNa` are consumed.
 * @returns The clamped, integer `gridNa` the solver should receive.
 */
export function coupledGridNaFor(Nphi: number, wdwConfig: WheelerDeWittConfig): number {
  const { aMin, aMax, phiExtent, gridNa: baseline } = wdwConfig
  const delta = aMax - aMin
  const cflBumped = Math.ceil(1 + (delta * (Nphi - 1)) / (Math.SQRT2 * phiExtent * aMin))
  const gridNa = clampGridNa(Math.max(Math.round(baseline), cflBumped))
  // Fail fast rather than silently publish a point that looks
  // "publication-grade" but violates its own CFL contract. `clampGridNa`
  // caps at 1024; if the CFL-derived minimum exceeds that, no physically
  // valid coupled value exists for this `(aMax, aMin, phiExtent, Nφ)`.
  if (gridNa < cflBumped) {
    throw new Error(
      `gridNphiCoupled cannot satisfy the CFL budget: cflBumped=${cflBumped} ` +
        `exceeds clampGridNa's ceiling (gridNa=${gridNa}). ` +
        `Raise aMin or phiExtent, or lower Nφ=${Nphi}.`
    )
  }
  return gridNa
}

/**
 * Run a joint `(gridNphi, gridNa)` grid-convergence sweep. The Nφ axis is
 * varied across `[sweepMin, sweepMax]` (clamped to `[32, 64]`,
 * integer-rounded, deduplicated) and the per-point `gridNa` is
 * co-scaled via {@link coupledGridNaFor} so the explicit-leapfrog CFL
 * term `da²·8/dφ²/aMin² ≤ 4` stays satisfied. This is the
 * **publication-grade** companion to {@link runGridNphiSweep}: where the
 * uncoupled kind holds `gridNa` fixed and lets the CFL term grow as
 * `N_φ²` — pushing the solver past its warn budget at `Nφ=64` — the
 * coupled kind keeps the CFL envelope bounded so `q(N_φ)` reflects
 * φ-discretisation alone.
 *
 * The coupling is LINEAR in `(Nφ − 1)` (see {@link coupledGridNaFor});
 * per-point solve cost is therefore linear in Nφ, not quadratic. For
 * default physics the coupled Na is roughly 155 at Nφ=32 and 313 at
 * Nφ=64 — both safely inside `clampGridNa`'s `[64, 1024]` window.
 * Callers should keep `points ∈ [3, 7]` (≈2–4× per-point cost vs.
 * `runGridNphiSweep`).
 */
export function runGridNphiCoupledSweep(input: RunGridNphiCoupledSweepInputs): SrmtSweepPoint[] {
  const { wdwConfig, config, onProgress, onSolveStart, cancel } = input
  if (config.kind !== 'gridNphiCoupled') {
    throw new Error(
      `runGridNphiCoupledSweep: expected kind='gridNphiCoupled', got '${config.kind}'`
    )
  }
  const lo = clampGridNphi(config.sweepMin)
  const hi = clampGridNphi(config.sweepMax)
  const [rLo, rHi] = lo <= hi ? [lo, hi] : [hi, lo]
  const series = linspace(rLo, rHi, normalisePointCount('gridNphiCoupled', config.points))
  const uniqueValues: number[] = []
  const seen = new Set<number>()
  for (let i = 0; i < series.length; i++) {
    const v = Math.round(series[i]!)
    if (!seen.has(v)) {
      seen.add(v)
      uniqueValues.push(v)
    }
  }

  const results: SrmtSweepPoint[] = []
  for (let i = 0; i < uniqueValues.length; i++) {
    if (cancel?.aborted) break
    const gridNphi = uniqueValues[i]!
    const gridNa = coupledGridNaFor(gridNphi, wdwConfig)
    onSolveStart?.(i)
    const solverOutput = solveWheelerDeWitt({
      boundaryCondition: wdwConfig.boundaryCondition,
      inflatonMass: wdwConfig.inflatonMass,
      inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      cosmologicalConstant: wdwConfig.cosmologicalConstant,
      aMin: wdwConfig.aMin,
      aMax: wdwConfig.aMax,
      gridNa,
      gridNphi,
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
      gridNphi
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
    inflatonMassAsymmetry: physics.inflatonMassAsymmetry,
    cosmologicalConstant: physics.cosmologicalConstant,
    aMin: solverOutput.aMin,
    aMax: solverOutput.aMax,
    phiExtent: solverOutput.phiExtent,
    phiRef,
    cutNormalized,
  }
}
