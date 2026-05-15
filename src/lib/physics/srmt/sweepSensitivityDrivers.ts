/**
 * Tier-3 SRMT sensitivity sweep drivers.
 *
 * Varies a **non-physical** or **grid** knob across sweep points so that
 * a claim that survives the sweep cannot be an artifact of that knob:
 *
 *  - `runPhiRefSweep`  — vary the landmark `phiRef`. `q` is exactly
 *    invariant by construction (the modular and HJ spectra do not
 *    consume phiRef); the landmark is recomputed per point and attached
 *    to `SrmtSweepPoint.perPointLandmarks` so the UI can render its
 *    motion alongside the flat `q(φref)` curves.
 *  - `runRankCapSweep` — vary the Lanczos / Schmidt `rankCap`. A
 *    claim that moves with rankCap is a numerical artifact of spectrum
 *    truncation, not physics.
 *  - `runPhiExtentSweep` — vary the φ-grid half-range. Requires a
 *    solver re-run per point (changes `dφ`). A claim that moves with
 *    phiExtent is a discretisation artifact.
 *  - `runGridNaSweep` / `runGridNphiSweep` / `runGridNphiCoupledSweep` —
 *    Cauchy / grid-convergence kinds. See `./sweepSensitivityGrid`.
 *
 * The grid sweeps were extracted into `./sweepSensitivityGrid.ts` to
 * keep this file focused on the phi/rank-cap kinds.
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
  clampPhiExtent,
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
import type { SrmtSweepConfig, SrmtSweepPoint } from './sweepTypes'
import { computeCutLandmark, type TurningPointLandmarkInputs } from './turningPointLandmark'
import type { SrmtClock } from './types'

// Re-export the grid sensitivity drivers so callers that historically
// imported them from this module keep their import paths.
export {
  coupledGridNaFor,
  runGridNaSweep,
  type RunGridNaSweepInputs,
  runGridNphiCoupledSweep,
  type RunGridNphiCoupledSweepInputs,
  runGridNphiSweep,
  type RunGridNphiSweepInputs,
} from './sweepSensitivityGrid'

// ── runPhiRefSweep ───────────────────────────────────────────────────────────

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

// ── runRankCapSweep ──────────────────────────────────────────────────────────

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

// ── runPhiExtentSweep ────────────────────────────────────────────────────────

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
    // Enforce the documented `phiRef ∈ [-phiExtent, +phiExtent]` contract
    // per-point: the sweep varies `phiExtent`, so a configured `phiRef`
    // (e.g. 1.0) can fall outside the window on small `phiExtent`
    // points (e.g. 0.5) and either push the landmark off-domain or be
    // rejected downstream. Clamp in-place so every point's landmark
    // lives inside its own φ-grid.
    const pointConfig =
      Math.abs(config.phiRef) <= phiExtent
        ? config
        : {
            ...config,
            phiRef: Math.max(-phiExtent, Math.min(phiExtent, config.phiRef)),
          }
    const point = computeSrmtPointFromSolver(
      solverOutput,
      pointConfig,
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
