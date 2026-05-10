/**
 * Canonical numeric clamping helpers with non-finite fallback semantics.
 *
 * All four helpers share the same fallback discipline: any non-finite input
 * (NaN, ±Infinity, undefined, or non-number for the unknown variant) returns
 * the supplied `fallback` BEFORE clamping is applied. Finite inputs are then
 * clamped to `[min, max]`. This means `fallback` does NOT have to lie inside
 * `[min, max]` — it is returned verbatim for non-finite inputs. Use this when
 * an out-of-range fallback is intentional (e.g. fallback = 0 with min = 0.05).
 *
 * Replaces seven near-duplicate file-local helpers that were drifting in
 * subtle ways (some returned `min` instead of a fallback, some floored
 * instead of rounded, some accepted `unknown` and some `number | undefined`).
 *
 * @module lib/math/clamp
 */

/**
 * Clamp `value` to `[min, max]`. Returns `fallback` when the input is
 * `undefined`, `NaN`, or ±`Infinity`.
 *
 * @example
 * clampFinite(0.5, 0, 0, 1)         // 0.5
 * clampFinite(2,   0, 0, 1)         // 1   (clamped to max)
 * clampFinite(NaN, 0.7, 0, 1)       // 0.7 (fallback, not clamped)
 * clampFinite(undefined, 5, 0, 1)   // 5   (fallback, even out of range)
 */
export function clampFinite(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value as number))
}

/**
 * Clamp an integer-valued number to `[min, max]`. Returns `fallback` when
 * the input is non-finite. Rounds the clamped result to the nearest integer
 * by default; pass `mode: 'floor'` to truncate toward negative infinity.
 *
 * Rounding/flooring is applied AFTER clamping, matching the behaviour of
 * the legacy `clampInteger` and `clampFiniteInteger` helpers this replaces.
 *
 * @example
 * clampFiniteInteger(2.7, 0, 0, 10)              // 3 (rounded)
 * clampFiniteInteger(2.7, 0, 0, 10, 'floor')     // 2
 * clampFiniteInteger(NaN, 5, 0, 10)              // 5 (fallback)
 */
export function clampFiniteInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  mode: 'round' | 'floor' = 'round'
): number {
  if (!Number.isFinite(value)) return fallback
  const clamped = clampFinite(value, fallback, min, max)
  return mode === 'floor' ? Math.floor(clamped) : Math.round(clamped)
}

/**
 * Clamp an `unknown`-typed value (e.g. JSON-parsed input) to `[min, max]`.
 * Non-numeric or non-finite inputs return `fallback`.
 *
 * Use this when the input could be any JSON value (string, null, object,
 * etc.). For values already typed as `number | undefined`, prefer
 * {@link clampFinite}.
 *
 * @example
 * clampFiniteUnknown('foo', 0, 0, 1)   // 0   (fallback, not a number)
 * clampFiniteUnknown(0.5, 0, 0, 1)     // 0.5
 * clampFiniteUnknown(NaN, 0.7, 0, 1)   // 0.7 (fallback)
 */
export function clampFiniteUnknown(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

/**
 * Build a fixed-length array by clamping each input element. Missing
 * elements (out-of-bounds index, `undefined`, or non-finite) become
 * `fallback`. The result always has exactly `len` entries.
 *
 * @example
 * clampFiniteArray([0.5, 2, NaN], 3, 0, 0, 1)        // [0.5, 1, 0]
 * clampFiniteArray(undefined, 2, 0.3, 0, 1)          // [0.3, 0.3]
 * clampFiniteArray([0.5], 3, 0.1, 0, 1)              // [0.5, 0.1, 0.1]
 */
export function clampFiniteArray(
  values: readonly (number | undefined)[] | undefined,
  len: number,
  fallback: number,
  min: number,
  max: number
): number[] {
  return Array.from({ length: len }, (_, i) => clampFinite(values?.[i], fallback, min, max))
}

/**
 * Clamp a finite number to `[min, max]`. Trusts the caller to have already
 * validated finiteness (passes `NaN` through unchanged). Use {@link clampFinite}
 * when the input may be non-finite and a fallback is needed.
 *
 * @example
 * clamp(0.5, 0, 1)   // 0.5
 * clamp(2,   0, 1)   // 1
 * clamp(-3,  0, 1)   // 0
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Clamp to `[0, 1]`. Common enough across density grids, color sampling, and
 * UI sliders to warrant its own export. NaN passes through unchanged because
 * IEEE 754 comparisons with NaN are always false — callers in physics paths
 * rely on this to propagate non-finite voxels into downstream alpha
 * compositing where `NaN * 0 = NaN` keeps the bug visible.
 *
 * @example
 * clamp01(0.5)   // 0.5
 * clamp01(1.7)   // 1
 * clamp01(-0.3)  // 0
 */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
