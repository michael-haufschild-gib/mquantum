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

/** Vertical drag distance (px) that sweeps the full knob range at sensitivity 1. */
export const KNOB_PAN_PIXEL_RANGE = 200

/**
 * Knob value for a drag, from the value at pan start and the TOTAL vertical
 * offset since then (upward = positive change). Snapping the accumulated
 * value — not each per-event delta — lets slow drags move the knob: a
 * per-event change below half a step used to round back to the current
 * value on every pointer event, so the knob never moved.
 *
 * @param startValue - Knob value when the pan began
 * @param offsetY - Total pointer offset along y since pan start (px, down = +)
 * @param min - Range minimum
 * @param max - Range maximum
 * @param step - Snap step (non-positive / non-finite → no snapping)
 * @param sensitivity - Range fraction per KNOB_PAN_PIXEL_RANGE pixels
 * @returns Clamped, step-snapped value
 */
export function knobValueFromPanOffset(
  startValue: number,
  offsetY: number,
  min: number,
  max: number,
  step: number,
  sensitivity: number
): number {
  const range = max - min
  if (!(range > 0) || !Number.isFinite(offsetY)) return clampKnobValue(startValue, min, max)
  const change = (-offsetY / KNOB_PAN_PIXEL_RANGE) * range * sensitivity
  return normalizeKnobValue(startValue + change, min, max, step)
}
