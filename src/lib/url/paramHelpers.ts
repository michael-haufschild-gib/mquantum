/**
 * Primitive URL-param parsers and emitters used by every per-domain
 * serializer module.
 *
 * Extracted from `./state-serializer.ts` so the parser primitives live
 * in one place and per-domain modules don't redefine them inconsistently.
 *
 * Contract for parsers: invalid input (non-numeric, NaN, out-of-range,
 * unknown enum) returns `undefined`. Callers either accept `undefined`
 * (the field stays at app default) or short-circuit a whole sub-block
 * when the missing param is required.
 *
 * Contract for emitters: `undefined` is a no-op so the shared
 * `URLSearchParams` can accumulate only the fields the caller actually
 * set.
 *
 * @module lib/url/paramHelpers
 */

const INTEGER_RE = /^-?\d+$/
const FLOAT_RE = /^-?(?:\d+\.?\d*|\.\d+)$/

/** Parse a URL param as a clamped integer. Returns undefined on invalid input. */
export function parseIntParam(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number
): number | undefined {
  const raw = params.get(key)
  if (!raw || !INTEGER_RE.test(raw)) return undefined
  const v = Number(raw)
  if (!Number.isSafeInteger(v)) return undefined
  return Math.max(min, Math.min(max, v))
}

/** Parse a URL param as a clamped float. Returns undefined on invalid input. */
export function parseFloatParam(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number
): number | undefined {
  const raw = params.get(key)
  if (!raw || !FLOAT_RE.test(raw)) return undefined
  const v = Number(raw)
  if (!Number.isFinite(v)) return undefined
  return Math.max(min, Math.min(max, v))
}

const FLOAT_SCI_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/

/**
 * Parse a URL param as a clamped float, ALLOWING scientific notation
 * (e.g. `1e-3`, `2.5E+10`). For user-typed URLs prefer the strict
 * {@link parseFloatParam} which rejects exponent notation. Use this only
 * when programmatic state restoration may emit numbers in exponent form.
 */
export function parseFloatParamSci(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number
): number | undefined {
  const raw = params.get(key)
  if (!raw || !FLOAT_SCI_RE.test(raw)) return undefined
  const v = Number(raw)
  if (!Number.isFinite(v)) return undefined
  return Math.max(min, Math.min(max, v))
}

/** Parse a URL param as a boolean (0/1). Returns undefined on invalid input. */
export function parseBoolParam(params: URLSearchParams, key: string): boolean | undefined {
  const raw = params.get(key)
  if (raw === '1') return true
  if (raw === '0') return false
  return undefined
}

/** Parse a URL param as an enum value. Returns undefined if not in the set. */
export function parseEnumParam<T extends string>(
  params: URLSearchParams,
  key: string,
  valid: readonly T[]
): T | undefined {
  const raw = params.get(key)
  if (raw && (valid as readonly string[]).includes(raw)) return raw as T
  return undefined
}

/** Set a URL param only when the value is defined. */
export function setBoolParam(
  params: URLSearchParams,
  key: string,
  value: boolean | undefined
): void {
  if (value !== undefined) params.set(key, value ? '1' : '0')
}

/**
 * Set a URL param to a fixed-precision float string only when the value
 * is defined and finite. When `omitZero` is true a value of exactly `0`
 * is treated the same as undefined, so default-zero fields don't bloat
 * the URL. Non-finite values (NaN, ±Infinity) are silently dropped to
 * stay symmetric with {@link parseFloatParam}, which rejects those
 * tokens — otherwise an emit+parse round-trip would lose the field.
 */
export function setFloatParam(
  params: URLSearchParams,
  key: string,
  value: number | undefined,
  omitZero = false,
  precision = 2
): void {
  if (value === undefined || !Number.isFinite(value)) return
  if (omitZero && value === 0) return
  params.set(key, value.toFixed(precision))
}

/**
 * Set a URL param to a base-10 integer string only when the value is a
 * defined safe integer. Non-integer floats and NaN/Infinity are dropped
 * because {@link parseIntParam} would reject them on the way back in.
 */
export function setIntParam(params: URLSearchParams, key: string, value: number | undefined): void {
  if (value === undefined || !Number.isInteger(value)) return
  params.set(key, value.toString())
}

/** Set a URL param to the given string only when the value is defined. */
export function setStringParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined
): void {
  if (value !== undefined) params.set(key, value)
}
