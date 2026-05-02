/**
 * Per-frame evaluator + module-level LRU cache for the LQC bounce table.
 *
 * Extracted from `./lqcBounce.ts` so the bulk numerical solver
 * (`computeLqcBounceBackground`) and the per-frame eval / cache layer
 * sit in separate files. Behaviour is unchanged; the `getOrCompute*`
 * driver, the cache, and the binary-search interpolation helpers all
 * moved verbatim.
 *
 * @module lib/physics/cosmology/lqcBounceTable
 */

import {
  computeLqcBounceBackground,
  type LqcBounceCoefs,
  type LqcBounceParams,
  type LqcBounceTable,
} from './lqcBounceModel'
import { resolveLqcTHalfWidth } from './lqcBounceModel'

/**
 * Binary-search the largest `i` such that `etaGrid[i] ≤ eta`. Returns
 * `0` if `eta` is below the grid minimum and `etaGrid.length - 2` if
 * above the maximum (so the caller can always index `[i, i+1]` safely).
 */
function lowerBoundIndex(etaGrid: Float64Array, eta: number): number {
  const n = etaGrid.length
  if (n < 2) return 0
  if (eta <= etaGrid[0]!) return 0
  if (eta >= etaGrid[n - 1]!) return n - 2
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1
    if (etaGrid[mid]! <= eta) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Linear interpolation in one grid, selected by the `etaGrid` sample
 * bracket `[i, i+1]` and fractional position `t ∈ [0, 1]`.
 */
function linearInterpolate(grid: Float64Array, i: number, t: number): number {
  return grid[i]! * (1 - t) + grid[i + 1]! * t
}

/**
 * Evaluate the LQC bounce coefficients at a conformal time `η`,
 * returning the per-frame bundle expected by the FSF Hamiltonian
 * integrator.
 *
 * Endpoint clamping: `η` outside the table's `[etaMin, etaMax]` window
 * is clamped to the nearest endpoint. The caller (the FSF compute pass)
 * is already responsible for keeping `simEta` inside the window via the
 * `tHalfWidth` setting; the clamp is a last-line-of-defence.
 *
 * @param table - Precomputed bounce table.
 * @param eta - Conformal time at which to evaluate.
 * @param spacetimeDim - Spacetime dimension `n`. Needed to raise `a` to
 *                       `n − 2` / `n` for the canonical `(A, B, B_full)`
 *                       coefficient triple.
 * @returns Per-frame coefficients.
 */
export function evaluateLqcBounceCoefs(
  table: LqcBounceTable,
  eta: number,
  spacetimeDim: number
): LqcBounceCoefs {
  const i = lowerBoundIndex(table.etaGrid, eta)
  const e0 = table.etaGrid[i]!
  const e1 = table.etaGrid[i + 1]!
  const denom = e1 - e0
  const tRaw = denom > 0 ? (eta - e0) / denom : 0
  // Clamp the fractional position to [0, 1] so an out-of-range `eta`
  // returns the endpoint value instead of extrapolating.
  const tInterp = tRaw < 0 ? 0 : tRaw > 1 ? 1 : tRaw
  const a = linearInterpolate(table.aGrid, i, tInterp)
  const aPrime = linearInterpolate(table.aPrimeGrid, i, tInterp)
  const rho = linearInterpolate(table.rhoGrid, i, tInterp)

  const nm2 = spacetimeDim - 2
  // n >= 3 is enforced upstream, so n - 2 >= 1. Use `a^(n-2)` via pow,
  // accepting the slight double→double round-off; the `a^n` factor reuses
  // the result times `a²` to save one pow call per frame.
  const B = Math.pow(a, nm2)
  const A = B > 0 ? 1 / B : 1
  const B_full = B * a * a

  return { a, aPrime, A, B, B_full, rho }
}

// ── Module-level cache ──────────────────────────────────────────────────────

/**
 * Cache key for the LQC table. The params are value-compared so the
 * cache correctly invalidates when *any* input changes.
 */
interface LqcCacheKey {
  spacetimeDim: number
  rhoCritical: number
  equationOfState: number
  initialRhoRatio: number
  tHalfWidth: number
  stepSize: number
  etaBounceAnchor: number
}

/** Maximum total byte budget for the LQC LRU cache (~4 MB). */
const LQC_CACHE_MAX_BYTES = 4 * 1024 * 1024

/**
 * Map-backed LRU: JavaScript `Map` preserves insertion order. A cache
 * hit re-inserts the entry at the tail; when the map is full, the head
 * entry (the oldest) is evicted. This gives amortised O(1) lookup +
 * update with no external dependency.
 */
const lqcCache = new Map<string, LqcBounceTable>()

/**
 * Build a deterministic cache key string from the resolved LQC params.
 * Each field is stringified with enough precision to distinguish
 * semantic changes but not so much that rounding flicker invalidates
 * the entry.
 */
function lqcCacheKeyString(k: LqcCacheKey): string {
  return [
    k.spacetimeDim,
    k.rhoCritical,
    k.equationOfState,
    k.initialRhoRatio,
    k.tHalfWidth,
    k.stepSize,
    k.etaBounceAnchor,
  ].join('|')
}

/**
 * Memoised {@link computeLqcBounceBackground}. Returns the cached table
 * when the params match a previous invocation; rebuilds otherwise. The
 * FSF compute pass invokes this every substep under an active
 * `lqcBounce` preset, so the cache is essential — a full rebuild
 * touches ~20k float samples.
 *
 * The cache is a byte-budgeted LRU ({@link LQC_CACHE_MAX_BYTES}) so a
 * user toggling between two presets (A → B → A → B) hits the cache
 * every call instead of rebuilding on each switch.
 *
 * @param params - Bounce parameters.
 * @returns Cached or freshly computed lookup table.
 */
export function getOrComputeLqcBounceTable(params: LqcBounceParams): LqcBounceTable {
  // The effective `tHalfWidth` is shared with `computeLqcBounceBackground`
  // via `resolveLqcTHalfWidth` — identical input params therefore always
  // hash to the same key regardless of whether the caller passed
  // `tHalfWidth` explicitly or relied on the adaptive default.
  const key: LqcCacheKey = {
    spacetimeDim: params.spacetimeDim,
    rhoCritical: params.rhoCritical,
    equationOfState: params.equationOfState ?? 1,
    initialRhoRatio: params.initialRhoRatio,
    tHalfWidth: resolveLqcTHalfWidth(params),
    stepSize: params.stepSize ?? 5e-4,
    etaBounceAnchor: params.etaBounceAnchor ?? 10,
  }
  const keyStr = lqcCacheKeyString(key)
  const cached = lqcCache.get(keyStr)
  if (cached) {
    // Refresh recency: Map preserves insertion order, so delete + re-insert
    // moves the entry to the tail.
    lqcCache.delete(keyStr)
    lqcCache.set(keyStr, cached)
    return cached
  }
  const table = computeLqcBounceBackground(params)
  const tableBytes =
    table.etaGrid.byteLength +
    table.aGrid.byteLength +
    table.aPrimeGrid.byteLength +
    table.rhoGrid.byteLength
  if (tableBytes > LQC_CACHE_MAX_BYTES) return table

  lqcCache.set(keyStr, table)
  let totalBytes = 0
  for (const t of lqcCache.values()) {
    totalBytes +=
      t.etaGrid.byteLength + t.aGrid.byteLength + t.aPrimeGrid.byteLength + t.rhoGrid.byteLength
  }
  while (totalBytes > LQC_CACHE_MAX_BYTES && lqcCache.size > 1) {
    const oldest = lqcCache.keys().next().value
    if (oldest === undefined) break
    const evicted = lqcCache.get(oldest)!
    totalBytes -=
      evicted.etaGrid.byteLength +
      evicted.aGrid.byteLength +
      evicted.aPrimeGrid.byteLength +
      evicted.rhoGrid.byteLength
    lqcCache.delete(oldest)
  }
  return table
}

/**
 * Test-only helper: clear the memoised tables so cache state does not
 * leak across `vitest` runs. Production code never needs this.
 */
export function __resetLqcBounceCacheForTests(): void {
  lqcCache.clear()
}
