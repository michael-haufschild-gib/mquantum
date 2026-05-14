/**
 * Cosine Gradient Palette — TypeScript Evaluation Functions
 *
 * Implements the Inigo Quilez cosine palette technique for smooth,
 * infinitely variable color gradients. Provides CPU-side evaluation
 * functions used for UI color preview and distribution control.
 *
 * The equivalent WGSL implementation is in
 * `src/rendering/webgpu/shaders/shared/color/cosine-palette.wgsl.ts`.
 *
 * @see https://iquilezles.org/articles/palettes/
 */

function finiteOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function coefficientAt(values: readonly number[], index: number, fallback: number): number {
  return Array.isArray(values) ? finiteOrFallback(values[index] ?? Number.NaN, fallback) : fallback
}

function cosineChannel(
  t: number,
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  d: readonly number[],
  index: number
): number {
  const base = coefficientAt(a, index, 0)
  const amplitude = coefficientAt(b, index, 0)
  const frequency = coefficientAt(c, index, 1)
  const phase = coefficientAt(d, index, 0)
  const angle = Math.PI * 2 * (frequency * finiteOrFallback(t, 0) + phase)
  return clamp01(base + amplitude * Math.cos(angle))
}

/**
 * TypeScript utility function to calculate cosine palette color.
 * Used for color preview in UI.
 * @param t - Input value (0-1)
 * @param a - Base offset coefficients
 * @param b - Amplitude coefficients
 * @param c - Frequency coefficients
 * @param d - Phase coefficients
 * @returns RGB color object with values 0-1
 */
export function calculateCosineColor(
  t: number,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number]
): { r: number; g: number; b: number } {
  return {
    r: cosineChannel(t, a, b, c, d, 0),
    g: cosineChannel(t, a, b, c, d, 1),
    b: cosineChannel(t, a, b, c, d, 2),
  }
}

/**
 * Apply distribution curve to t value (TypeScript version).
 * @param t - Input value (0-1)
 * @param power - Power curve exponent
 * @param cycles - Number of palette cycles
 * @param offset - Offset shift
 * @returns Distributed t value
 */
export function applyDistributionTS(
  t: number,
  power: number,
  cycles: number,
  offset: number
): number {
  const clamped = clamp01(t)
  const safePower = Math.max(0.001, finiteOrFallback(power, 1))
  const safeCycles = finiteOrFallback(cycles, 1)
  const safeOffset = finiteOrFallback(offset, 0)
  const curved = Math.pow(clamped, safePower)
  const cycled = (((curved * safeCycles + safeOffset) % 1) + 1) % 1 // fract equivalent
  return cycled
}

/**
 * Get cosine palette color with distribution (TypeScript version).
 * Used for UI preview rendering.
 * @param t - Input value (0-1)
 * @param a - Base offset coefficients
 * @param b - Amplitude coefficients
 * @param c - Frequency coefficients
 * @param d - Phase coefficients
 * @param power - Power curve exponent
 * @param cycles - Number of palette cycles
 * @param offset - Offset shift
 * @returns RGB color object with values 0-1
 */
export function getCosinePaletteColorTS(
  t: number,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  power: number,
  cycles: number,
  offset: number
): { r: number; g: number; b: number } {
  const distributedT = applyDistributionTS(t, power, cycles, offset)
  return calculateCosineColor(distributedT, a, b, c, d)
}
