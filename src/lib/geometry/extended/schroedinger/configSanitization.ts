import { SCHROEDINGER_MAX_TERMS } from '@/constants/quantum'

import type { SchroedingerConfig } from '../schroedinger'

type HarmonicOscillatorScalarKey = 'seed' | 'termCount' | 'maxQuantumNumber' | 'frequencySpread'
type HarmonicOscillatorScalars = Pick<SchroedingerConfig, HarmonicOscillatorScalarKey>

const MIN_TERM_COUNT = 1
const MIN_MAX_QUANTUM_NUMBER = 1
export const MAX_HARMONIC_OSCILLATOR_QUANTUM_NUMBER = 6
const MIN_FREQUENCY_SPREAD = 0
const MAX_FREQUENCY_SPREAD = 0.5

function hasOwn(record: object, key: HarmonicOscillatorScalarKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function finiteOrFallback(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function sanitizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const safeFallback = Number.isFinite(fallback) ? fallback : min
  return clamp(Math.floor(finiteOrFallback(value, safeFallback)), min, max)
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const safeFallback = Number.isFinite(fallback) ? fallback : min
  return clamp(finiteOrFallback(value, safeFallback), min, max)
}

/**
 * Normalize harmonic-oscillator scalar controls for paths that bypass
 * dedicated UI setters, such as setSchroedingerConfig and scene loading.
 */
export function sanitizeHarmonicOscillatorScalars<T extends Partial<HarmonicOscillatorScalars>>(
  config: T,
  fallback: HarmonicOscillatorScalars
): T {
  let next: T | undefined
  const mutable = (): T => {
    next ??= { ...config }
    return next
  }

  if (hasOwn(config, 'seed')) {
    const sanitized = Math.floor(finiteOrFallback(config.seed, finiteOrFallback(fallback.seed, 0)))
    if (config.seed !== sanitized) mutable().seed = sanitized
  }

  if (hasOwn(config, 'termCount')) {
    const sanitized = sanitizeInteger(
      config.termCount,
      fallback.termCount,
      MIN_TERM_COUNT,
      SCHROEDINGER_MAX_TERMS
    )
    if (config.termCount !== sanitized) mutable().termCount = sanitized
  }

  if (hasOwn(config, 'maxQuantumNumber')) {
    const sanitized = sanitizeInteger(
      config.maxQuantumNumber,
      fallback.maxQuantumNumber,
      MIN_MAX_QUANTUM_NUMBER,
      MAX_HARMONIC_OSCILLATOR_QUANTUM_NUMBER
    )
    if (config.maxQuantumNumber !== sanitized) mutable().maxQuantumNumber = sanitized
  }

  if (hasOwn(config, 'frequencySpread')) {
    const sanitized = sanitizeNumber(
      config.frequencySpread,
      fallback.frequencySpread,
      MIN_FREQUENCY_SPREAD,
      MAX_FREQUENCY_SPREAD
    )
    if (config.frequencySpread !== sanitized) mutable().frequencySpread = sanitized
  }

  return next ?? config
}
