/**
 * Shared helpers for the SRMT sweep driver and its sensitivity-driver
 * cousins.
 *
 * Holds: clamp / round / dedup helpers, `normaliseClocks`, the per-kind
 * sweep-point count clamp, the cut-index resolver, the clock-axis-length
 * lookup, the `predict*SweepCount` family, and small numeric utilities
 * (`linspace`, `f32FromF64`, `nowMs`).
 *
 * Extracted from `./sweepDriver.ts` so the run-* sweep functions can sit
 * in their own focused module and the sensitivity drivers can import
 * helpers without pulling in `solveWheelerDeWitt` (the slowest dependency).
 *
 * @module lib/physics/srmt/sweepDriverHelpers
 */

import type { SrmtSweepConfig } from './sweepTypes'
import type { SrmtClock } from './types'

/** Progress callback. Receives one point after its compute completes. */
export type SrmtSweepProgressCallback = (point: import('./sweepTypes').SrmtSweepPoint) => void

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
  const rounded = Math.round(rankCap)
  if (Number.isNaN(rounded)) return 8
  return Math.max(8, Math.min(256, rounded))
}

/**
 * Clamp + integerise a Wheeler–DeWitt `gridNa` value for the
 * grid-convergence sweep. Range `[64, 1024]`. The lower bound 64 keeps
 * the leapfrog inside its CFL budget at `aMin = 0.1`; the upper bound
 * 1024 caps per-point compute (each per-point solver call grows linearly
 * in `gridNa`).
 */
export function clampGridNa(gridNa: number): number {
  const rounded = Math.round(gridNa)
  if (Number.isNaN(rounded)) return 64
  return Math.max(64, Math.min(1024, rounded))
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
 * a dev-only rate-limited warn rather than failing. For publication
 * runs that need `N_φ ≥ 48`, prefer the coupled `gridNphiCoupled`
 * sweep so `gridNa` is raised from the actual CFL-derived linear bound.
 */
export function clampGridNphi(gridNphi: number): number {
  const rounded = Math.round(gridNphi)
  if (Number.isNaN(rounded)) return 32
  return Math.max(32, Math.min(64, rounded))
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
  // NaN and non-numeric values fall through to the lower bound (safest
  // default). +Infinity maps to the upper bound; -Infinity to lower.
  if (phiExtent === Number.POSITIVE_INFINITY) return 10
  if (!Number.isFinite(phiExtent)) return 0.5
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
 * index `∈ [1, axisLen − 2]`. Matches the live diagnostic's resolver
 * in `WheelerDeWittSrmtCoordinator.ts` so sweep-cut results align with
 * single-point diagnostic results at matching normalised values.
 */
export function resolveCutIndexForAxisLen(cutNormalized: number, axisLen: number): number {
  if (axisLen < 3) return 1
  const raw = Math.round(cutNormalized * (axisLen - 1))
  return Math.max(1, Math.min(axisLen - 2, raw))
}

/** Length of the clock axis in the grid. */
export function clockAxisLen(
  clock: SrmtClock,
  gridSize: readonly [number, number, number]
): number {
  return clock === 'a' ? gridSize[0] : gridSize[1]
}

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
