/**
 * Hydrogen quantum-state sanitization shared by store bulk updates and GPU
 * uniform packing. Extracted from `extended/schroedinger.ts` (which owns the
 * config types and defaults) so each file stays within the size budget.
 *
 * Direct UI setters reject non-finite values; bulk scene/preset loads and
 * tests can bypass those setters, so callers use previous state as fallback.
 *
 * @module lib/geometry/extended/schroedinger/hydrogenStateSanitize
 */

import { DEFAULT_SCHROEDINGER_CONFIG } from '../schroedinger'

/** Sanitized hydrogen quantum fields safe for store state and GPU uniforms. */
export interface SanitizedHydrogenQuantumState {
  principalQuantumNumber: number
  azimuthalQuantumNumber: number
  magneticQuantumNumber: number
  bohrRadiusScale: number
}

type HydrogenQuantumStateInput = Partial<SanitizedHydrogenQuantumState>

/** Sanitized Hydrogen-ND extra-dimensional controls safe for store state. */
export interface SanitizedHydrogenExtraDimState {
  extraDimQuantumNumbers: number[]
  extraDimOmega: number[]
  extraDimFrequencySpread: number
}

type HydrogenExtraDimStateInput = Partial<SanitizedHydrogenExtraDimState>

function finiteOrFallback(
  value: number | undefined,
  fallback: number,
  defaultValue: number
): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Number.isFinite(fallback)) return fallback
  return defaultValue
}

function clampFloored(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function finiteArrayFallbackAt(
  fallback: readonly number[] | undefined,
  defaults: readonly number[],
  index: number,
  defaultValue: number
): number {
  const fallbackValue = fallback?.[index]
  if (typeof fallbackValue === 'number' && Number.isFinite(fallbackValue)) return fallbackValue
  const defaultArrayValue = defaults[index]
  return typeof defaultArrayValue === 'number' && Number.isFinite(defaultArrayValue)
    ? defaultArrayValue
    : defaultValue
}

function sanitizeFixedNumberArray(
  input: unknown,
  fallback: readonly number[] | undefined,
  defaults: readonly number[],
  length: number,
  min: number,
  max: number,
  defaultValue: number,
  floor: boolean
): number[] {
  const source = Array.isArray(input) ? input : []
  return Array.from({ length }, (_, index) => {
    const fallbackValue = finiteArrayFallbackAt(fallback, defaults, index, defaultValue)
    const raw = source[index]
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallbackValue
    const normalized = floor ? Math.floor(value) : value
    return Math.max(min, Math.min(max, normalized))
  })
}

/**
 * Normalize hydrogen quantum fields shared by store bulk updates and GPU packing.
 *
 * Direct UI setters reject non-finite values; bulk scene/preset loads and tests
 * can bypass those setters, so callers use previous state as fallback.
 */
export function sanitizeHydrogenQuantumState(
  input: HydrogenQuantumStateInput | null | undefined,
  fallback: HydrogenQuantumStateInput = DEFAULT_SCHROEDINGER_CONFIG
): SanitizedHydrogenQuantumState {
  const defaultState = DEFAULT_SCHROEDINGER_CONFIG
  const rawN = finiteOrFallback(
    input?.principalQuantumNumber,
    fallback.principalQuantumNumber ?? defaultState.principalQuantumNumber,
    defaultState.principalQuantumNumber
  )
  const principalQuantumNumber = clampFloored(rawN, 1, 7)

  const rawL = finiteOrFallback(
    input?.azimuthalQuantumNumber,
    fallback.azimuthalQuantumNumber ?? defaultState.azimuthalQuantumNumber,
    defaultState.azimuthalQuantumNumber
  )
  const azimuthalQuantumNumber = clampFloored(rawL, 0, principalQuantumNumber - 1)

  const rawM = finiteOrFallback(
    input?.magneticQuantumNumber,
    fallback.magneticQuantumNumber ?? defaultState.magneticQuantumNumber,
    defaultState.magneticQuantumNumber
  )
  const magneticQuantumNumber =
    Math.max(-azimuthalQuantumNumber, Math.min(azimuthalQuantumNumber, Math.floor(rawM))) || 0

  const rawBohrRadius = finiteOrFallback(
    input?.bohrRadiusScale,
    fallback.bohrRadiusScale ?? defaultState.bohrRadiusScale,
    defaultState.bohrRadiusScale
  )
  const bohrRadiusScale = Math.max(0.5, Math.min(3.0, rawBohrRadius))

  return {
    principalQuantumNumber,
    azimuthalQuantumNumber,
    magneticQuantumNumber,
    bohrRadiusScale,
  }
}

/**
 * Normalize Hydrogen-ND extra-dimensional controls shared by bulk config
 * updates and scene/state loads. Dedicated UI setters reject malformed
 * runtime inputs; this keeps programmatic bulk updates from storing NaN,
 * Infinity, short arrays, or out-of-range values that can poison controls.
 */
export function sanitizeHydrogenExtraDimState(
  input: HydrogenExtraDimStateInput | null | undefined,
  fallback: HydrogenExtraDimStateInput = DEFAULT_SCHROEDINGER_CONFIG
): SanitizedHydrogenExtraDimState {
  const defaultState = DEFAULT_SCHROEDINGER_CONFIG
  const extraDimQuantumNumbers = sanitizeFixedNumberArray(
    input?.extraDimQuantumNumbers,
    fallback.extraDimQuantumNumbers,
    defaultState.extraDimQuantumNumbers,
    8,
    0,
    6,
    0,
    true
  )
  const extraDimOmega = sanitizeFixedNumberArray(
    input?.extraDimOmega,
    fallback.extraDimOmega,
    defaultState.extraDimOmega,
    8,
    0.1,
    2.0,
    1.0,
    false
  )
  const rawSpread = finiteOrFallback(
    input?.extraDimFrequencySpread,
    fallback.extraDimFrequencySpread ?? defaultState.extraDimFrequencySpread,
    defaultState.extraDimFrequencySpread
  )
  const extraDimFrequencySpread = Math.max(0, Math.min(0.5, rawSpread))

  return {
    extraDimQuantumNumbers,
    extraDimOmega,
    extraDimFrequencySpread,
  }
}
