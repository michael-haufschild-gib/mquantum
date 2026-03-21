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
  const TAU = 6.28318
  return {
    r: Math.max(0, Math.min(1, a[0] + b[0] * Math.cos(TAU * (c[0] * t + d[0])))),
    g: Math.max(0, Math.min(1, a[1] + b[1] * Math.cos(TAU * (c[1] * t + d[1])))),
    b: Math.max(0, Math.min(1, a[2] + b[2] * Math.cos(TAU * (c[2] * t + d[2])))),
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
  const clamped = Math.max(0, Math.min(1, t))
  const curved = Math.pow(clamped, power)
  const cycled = (((curved * cycles + offset) % 1) + 1) % 1 // fract equivalent
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
