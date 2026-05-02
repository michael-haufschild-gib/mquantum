/**
 * Tier-3 grid-convergence sensitivity sweeps.
 *
 * `gridNa` and `gridNphi` are independent Cauchy-convergence axes; the
 * `gridNphiCoupled` kind co-scales `gridNa` with `gridNphi` via
 * {@link coupledGridNaFor} so the explicit-leapfrog CFL term stays
 * bounded as the φ-sample count grows.
 *
 * Extracted from `./sweepSensitivityDrivers.ts` as part of the
 * file-size split.
 *
 * @module lib/physics/srmt/sweepSensitivityGrid
 */

import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'

import {
  clampGridNa,
  clampGridNphi,
  linspace,
  normalisePointCount,
  type SrmtSweepCancelToken,
  type SrmtSweepProgressCallback,
  type SrmtSweepSolveStartCallback,
} from './sweepDriverHelpers'
import { computeSrmtPointFromSolver } from './sweepPoint'
import type { SrmtSweepConfig, SrmtSweepPoint } from './sweepTypes'

// ── runGridNaSweep ───────────────────────────────────────────────────────────

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

// ── runGridNphiSweep ─────────────────────────────────────────────────────────

/** Inputs to {@link runGridNphiSweep}. */
export interface RunGridNphiSweepInputs {
  /**
   * Base Wheeler–DeWitt config; `gridNphi` is overridden per point.
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

// ── runGridNphiCoupledSweep ──────────────────────────────────────────────────

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
 * term `da²·8/dφ²/aMin² ≤ 4` stays satisfied.
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
    const coupledGridNa = coupledGridNaFor(gridNphi, wdwConfig)
    onSolveStart?.(i)
    const solverOutput = solveWheelerDeWitt({
      boundaryCondition: wdwConfig.boundaryCondition,
      inflatonMass: wdwConfig.inflatonMass,
      inflatonMassAsymmetry: wdwConfig.inflatonMassAsymmetry,
      cosmologicalConstant: wdwConfig.cosmologicalConstant,
      aMin: wdwConfig.aMin,
      aMax: wdwConfig.aMax,
      gridNa: coupledGridNa,
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
    point.coupledGridNa = coupledGridNa
    results.push(point)
    onProgress?.(point)
  }
  return results
}
