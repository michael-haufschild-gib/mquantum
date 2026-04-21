/**
 * SRMT parameter-sweep driver.
 *
 * Three pure functions — one per sweep kind — that run
 * {@link computeSrmtDiagnostic} across a range of sweep values and emit
 * per-point results through an `onProgress` callback. Designed to run
 * either on the main thread (tests) or inside a dedicated Worker
 * (`srmtSweep.worker.ts`); the functions do no I/O beyond the callback.
 *
 * ## Cut-sweep optimisation
 *
 * The Schmidt decomposition of `χ` depends only on the clock axis
 * (`src/lib/physics/srmt/schmidt.ts`) — `cutIndex` is consumed solely by
 * the Hamilton-Jacobi operator and the slice-`K` packer. `runCutSweep`
 * therefore computes {@link schmidtValues} once per clock and reuses
 * that Schmidt spectrum + modular spectrum across all cut points,
 * rebuilding only the HJ operator + affine fit per point. Asymptotic
 * savings are `O(N_points)` reduction in SVD work (the dominant
 * bottleneck at default grid).
 *
 * ## Mass/BC sweeps
 *
 * Both require a full solver re-run per point because the physics
 * parameters that invalidate the Schmidt cache (inflaton mass,
 * boundary condition) also invalidate `χ` itself. The driver calls
 * {@link solveWheelerDeWitt} per point — which is pure TS and
 * worker-safe (only dependency is `@/lib/logger`, which uses `console`
 * gated by `import.meta.env.DEV`).
 *
 * ## Sampling strategy
 *
 * For `cut` sweeps the normalised cut values are generated uniformly in
 * `[sweepMin, sweepMax]`, resolved to integer cut indices via the same
 * rounding rule as the live diagnostic
 * ({@link resolveCutIndexForAxisLen}), then deduplicated. This protects
 * low-resolution φ-grids (e.g. `Nphi=16`) where `[0.1, 0.9]` spans only
 * ~13 integer indices — running 17 sweep points against that axis would
 * otherwise produce ≥4 duplicate computes with identical results.
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
  SRMT_BC_SWEEP_ORDER,
  type SrmtSweepConfig,
  type SrmtSweepLandmark,
  type SrmtSweepPoint,
} from './sweepTypes'
import type { SrmtClock } from './types'

/** Progress callback. Receives one point after its compute completes. */
export type SrmtSweepProgressCallback = (point: SrmtSweepPoint) => void

/**
 * Optional hook fired BEFORE a per-point solver re-run starts (mass/BC
 * sweeps only). Used by the worker wrapper to emit a `solveStart` event
 * so the UI can show which sweep step is currently being (expensively)
 * re-solved.
 */
export type SrmtSweepSolveStartCallback = (index: number) => void

/**
 * Cancellation token. Driver checks `.aborted` between sweep points and
 * exits early when `true` — it does NOT interrupt an in-flight per-clock
 * compute (those are short enough that letting them finish produces no
 * user-visible lag).
 */
export interface SrmtSweepCancelToken {
  aborted: boolean
}

/** Clamp the SRMT rankCap to the [8, 256] range the worker tolerates. */
export function clampRankCap(rankCap: number): number {
  return Math.max(8, Math.min(256, Math.round(rankCap)))
}

/**
 * Clamp + integerise a Wheeler–DeWitt `gridNa` value for the
 * grid-convergence sweep. Range `[64, 1024]`. The lower bound 64 keeps
 * the leapfrog inside its CFL budget at `aMin = 0.1`; the upper bound
 * 1024 caps per-point compute (each per-point solver call grows linearly
 * in `gridNa`).
 */
export function clampGridNa(gridNa: number): number {
  return Math.max(64, Math.min(1024, Math.round(gridNa)))
}

/**
 * Clamp + integerise a Wheeler–DeWitt `gridNphi` value for the
 * grid-convergence sweep. Range `[32, 64]`.
 *
 * Lower bound 32: first asymptotic sample of `q_a(N_φ)`. Below `N_φ=32`
 * the clock-`a` Schmidt matrix has column count `min(N_a, N_φ²)` that
 * drops below `N_a=128`, and the HJ Lanczos top-k/n ratio approaches
 * full-rank extraction — both produce a non-monotone pre-asymptotic
 * hump in `q_a` that falsely fails the Cauchy convergence contract. The
 * `[9, 33]` regime was empirically measured to give a 10× `q_a`
 * regression vs. the default `N_φ=32` baseline (see
 * docs/physics/srmt-metric.md).
 *
 * Upper bound 64: the largest `N_φ` that completes a per-point solver
 * re-run in < ~10 s at default `(N_a=128, aMin=0.1, phiExtent=3.5)` on
 * commodity hardware. At `N_φ=64` the explicit-leapfrog CFL budget is
 * exceeded (`da²·8/dφ²/aMin² ≈ 24`, 6× over); the solver already emits
 * a dev-only rate-limited warn (solver.ts:447-456) rather than failing.
 * For publication runs that need `N_φ ≥ 48`, prefer the coupled
 * `gridNphiCoupled` sweep (see {@link coupledGridNaFor} in
 * `sweepSensitivityDrivers.ts`) so `gridNa` is raised from the actual
 * CFL-derived linear bound `Na_min = ceil(1 + (aMax − aMin)·(N_φ − 1) /
 * (√2·phiExtent·aMin))` instead of the old quadratic `4·Nφ²·phiExt²/aMin²`
 * heuristic (which saturated `clampGridNa`'s ceiling for every Nφ ≥ 32
 * at default physics and therefore never actually coupled `gridNa` to
 * Nφ). Alternatively raise `aMin` to keep the budget satisfied.
 */
export function clampGridNphi(gridNphi: number): number {
  return Math.max(32, Math.min(64, Math.round(gridNphi)))
}

/**
 * Clamp a Wheeler–DeWitt `phiExtent` value for the φ-window sensitivity
 * sweep. Range `[0.5, 10]` — widened from `[0.5, 5]` because empirically
 * `q_a(phiExtent)` is monotone-non-plateau inside `[1, 3]` at default
 * physics, so a meaningful convergence (plateau) claim requires window
 * expansion.
 *
 * CFL stays inside budget across the widened range: the explicit
 * leapfrog CFL term scales as `da²·(1/dφ²)·(1/aMin²)` with
 * `dφ = 2·phiExtent/(Nφ−1)`. Larger `phiExtent` ⇒ larger `dφ` ⇒ smaller
 * `1/dφ²` ⇒ looser CFL. At the default `Nφ=32`, moving `phiExtent` from
 * 2 (default) to 10 shrinks `1/dφ²` by ~25×, so the widened upper bound
 * is strictly safer for stability at fixed `Nφ`, not tighter.
 *
 * Unlike `clampGridNa` / `clampGridNphi`, `phiExtent` is a continuous
 * real-valued knob — no integer rounding.
 */
export function clampPhiExtent(phiExtent: number): number {
  // NaN falls through to the lower bound (safest default); ±Infinity
  // map to their respective bounds via Math.max / Math.min, matching
  // the behaviour of clampRankCap / clampGridNa / clampGridNphi on
  // out-of-range numeric input.
  if (Number.isNaN(phiExtent)) return 0.5
  return Math.max(0.5, Math.min(10, phiExtent))
}

/**
 * Clamp + integerise a caller-supplied `points` count to the per-kind
 * range the sweep drivers expect. Mirrors `totalPointsFor` in the worker
 * so a malformed URL/programmatic config cannot allocate far more linspace
 * samples than the UI and worker will advertise.
 */
export function normalisePointCount(kind: SrmtSweepConfig['kind'], rawPoints: number): number {
  const points = Number.isFinite(rawPoints) ? Math.floor(rawPoints) : 1
  switch (kind) {
    case 'cut':
      return Math.max(1, Math.min(64, points))
    case 'mass':
    case 'lambda':
    case 'phiRef':
      return Math.max(1, Math.min(21, points))
    case 'rankCap':
      return Math.max(1, Math.min(32, points))
    case 'phiExtent':
      return Math.max(1, Math.min(13, points))
    case 'gridNa':
    case 'gridNphi':
      return Math.max(1, Math.min(9, points))
    case 'gridNphiCoupled':
      return Math.max(1, Math.min(7, points))
    case 'bc':
      return 3
  }
}

/**
 * Resolve a normalised cut `∈ [0, 1]` to the nearest interior integer
 * index `∈ [1, axisLen − 2]`. Matches the live diagnostic's resolver in
 * `WheelerDeWittSrmtCoordinator.ts:55` so sweep-cut results align with
 * single-point diagnostic results at matching normalised values.
 */
export function resolveCutIndexForAxisLen(cutNormalized: number, axisLen: number): number {
  if (axisLen < 3) return 1
  const raw = Math.round(cutNormalized * (axisLen - 1))
  return Math.max(1, Math.min(axisLen - 2, raw))
}

/** Length of the clock axis in the grid. */
function clockAxisLen(clock: SrmtClock, gridSize: readonly [number, number, number]): number {
  return clock === 'a' ? gridSize[0] : gridSize[1]
}

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
 * Run a boundary-condition sweep. Iterates
 * {@link SRMT_BC_SWEEP_ORDER} in order, re-solving per BC.
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

/**
 * Per-point compute used by mass/BC sweeps after the solver has
 * produced a fresh `χ`. Runs the full SRMT diagnostic for each
 * requested clock at the anchor cut and writes the result into a
 * {@link SrmtSweepPoint}.
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

// Tier-3 sensitivity drivers (phiRef / rankCap / phiExtent / gridNa /
// gridNphi) live in `./sweepSensitivityDrivers.ts`. They share
// `writePerClockFit`, `linspace`, `normaliseClocks`, etc., which are
// exported below.
export type {
  RunGridNaSweepInputs,
  RunGridNphiCoupledSweepInputs,
  RunGridNphiSweepInputs,
  RunPhiExtentSweepInputs,
  RunPhiRefSweepInputs,
  RunRankCapSweepInputs,
} from './sweepSensitivityDrivers'
export {
  coupledGridNaFor,
  runGridNaSweep,
  runGridNphiCoupledSweep,
  runGridNphiSweep,
  runPhiExtentSweep,
  runPhiRefSweep,
  runRankCapSweep,
} from './sweepSensitivityDrivers'

// Re-export so consumers that branch on landmark kind keep the symbol
// path stable.
export type { SrmtSweepLandmark }

/**
 * Default to the full clock set when caller passes an empty array.
 * Exported for use by the sensitivity drivers.
 */
export function normaliseClocks(clocks: readonly SrmtClock[]): readonly SrmtClock[] {
  return clocks.length > 0 ? clocks : ['a', 'phi1', 'phi2']
}

/**
 * Predict the number of distinct sweep points a `cut` sweep will emit
 * against a given φ-grid. Mirrors `runCutSweep`'s dedup logic.
 */
export function predictCutSweepCount(
  config: SrmtSweepConfig,
  gridSize: readonly [number, number, number]
): number {
  if (config.kind !== 'cut') return normalisePointCount(config.kind, config.points)
  const clocks = normaliseClocks(config.clocks)
  const values = linspace(
    config.sweepMin,
    config.sweepMax,
    normalisePointCount('cut', config.points)
  )
  const keys = new Set<string>()
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    keys.add(
      clocks
        .map((c) => resolveCutIndexForAxisLen(v, c === 'a' ? gridSize[0] : gridSize[1]))
        .join(',')
    )
  }
  return Math.max(1, keys.size)
}

/**
 * Predict the number of distinct sweep points a `rankCap` sweep will
 * emit after rounding + dedup. Solver-independent.
 */
export function predictRankCapSweepCount(config: SrmtSweepConfig): number {
  if (config.kind !== 'rankCap') return normalisePointCount(config.kind, config.points)
  const lo = clampRankCap(config.sweepMin)
  const hi = clampRankCap(config.sweepMax)
  const [rLo, rHi] = lo <= hi ? [lo, hi] : [hi, lo]
  const series = linspace(rLo, rHi, normalisePointCount('rankCap', config.points))
  const seen = new Set<number>()
  for (let i = 0; i < series.length; i++) seen.add(Math.round(series[i]!))
  return Math.max(1, seen.size)
}

/**
 * Predict the number of distinct sweep points a `gridNa` sweep will emit
 * after clamping to `[64, 1024]`, integer-rounding, and deduplication.
 * Solver-independent; mirrors {@link predictRankCapSweepCount} so the
 * worker can report an accurate `total` for progress tracking.
 */
export function predictGridNaSweepCount(config: SrmtSweepConfig): number {
  if (config.kind !== 'gridNa') return normalisePointCount(config.kind, config.points)
  const lo = clampGridNa(config.sweepMin)
  const hi = clampGridNa(config.sweepMax)
  const [rLo, rHi] = lo <= hi ? [lo, hi] : [hi, lo]
  const series = linspace(rLo, rHi, normalisePointCount('gridNa', config.points))
  const seen = new Set<number>()
  for (let i = 0; i < series.length; i++) seen.add(Math.round(series[i]!))
  return Math.max(1, seen.size)
}

/**
 * Predict the number of distinct sweep points a `gridNphi` sweep will
 * emit after clamping to `[32, 64]`, integer-rounding, and deduplication.
 * Solver-independent; mirrors {@link predictRankCapSweepCount}.
 */
export function predictGridNphiSweepCount(config: SrmtSweepConfig): number {
  if (config.kind !== 'gridNphi') return normalisePointCount(config.kind, config.points)
  const lo = clampGridNphi(config.sweepMin)
  const hi = clampGridNphi(config.sweepMax)
  const [rLo, rHi] = lo <= hi ? [lo, hi] : [hi, lo]
  const series = linspace(rLo, rHi, normalisePointCount('gridNphi', config.points))
  const seen = new Set<number>()
  for (let i = 0; i < series.length; i++) seen.add(Math.round(series[i]!))
  return Math.max(1, seen.size)
}

/**
 * Predict the number of distinct sweep points a `gridNphiCoupled` sweep
 * will emit. The Nφ axis is sampled and deduplicated identically to the
 * uncoupled `gridNphi` kind — the coupling only affects per-point
 * `gridNa`, which is not part of the unique-key set.
 */
export function predictGridNphiCoupledSweepCount(config: SrmtSweepConfig): number {
  if (config.kind !== 'gridNphiCoupled') return normalisePointCount(config.kind, config.points)
  const lo = clampGridNphi(config.sweepMin)
  const hi = clampGridNphi(config.sweepMax)
  const [rLo, rHi] = lo <= hi ? [lo, hi] : [hi, lo]
  const series = linspace(rLo, rHi, normalisePointCount('gridNphiCoupled', config.points))
  const seen = new Set<number>()
  for (let i = 0; i < series.length; i++) seen.add(Math.round(series[i]!))
  return Math.max(1, seen.size)
}

/** Uniform [min, max] partition with `points` entries. */
export function linspace(min: number, max: number, points: number): Float64Array {
  const out = new Float64Array(Math.max(1, points))
  if (points <= 1) {
    out[0] = min
    return out
  }
  for (let i = 0; i < points; i++) {
    out[i] = min + (i * (max - min)) / (points - 1)
  }
  return out
}

/** Float64 → Float32 copy used for spectrum transferables. */
export function f32FromF64(src: Float64Array): Float32Array {
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) out[i] = src[i]!
  return out
}

/** Monotonic wall-clock milliseconds. */
export function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}
