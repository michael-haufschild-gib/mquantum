function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0
  const text = value.toString().toLowerCase()
  if (text.includes('e-')) {
    const [mantissa = '', exponent = '0'] = text.split('e-')
    return Math.min(100, Number(exponent) + (mantissa.split('.')[1]?.length ?? 0))
  }
  return Math.min(100, text.split('.')[1]?.length ?? 0)
}

function roundToStepPrecision(value: number, min: number, step: number): number {
  if (!Number.isFinite(value)) return value
  const precision = Math.max(decimalPlaces(min), decimalPlaces(step))
  return Number(value.toFixed(precision))
}

/** Clamp a knob value to its configured range. */
export function clampKnobValue(value: number, min: number, max: number): number {
  const finiteValue = Number.isFinite(value) ? value : min
  return Math.min(Math.max(finiteValue, min), max)
}

/**
 * Normalize pointer-derived knob values by clamping, snapping relative to the
 * configured minimum, then clamping again so non-divisible ranges cannot escape
 * their bounds.
 */
export function normalizeKnobValue(value: number, min: number, max: number, step: number): number {
  const clampedValue = clampKnobValue(value, min, max)
  if (!Number.isFinite(step) || step <= 0) return clampedValue

  const snappedValue = min + Math.round((clampedValue - min) / step) * step
  return clampKnobValue(roundToStepPrecision(snappedValue, min, step), min, max)
}
