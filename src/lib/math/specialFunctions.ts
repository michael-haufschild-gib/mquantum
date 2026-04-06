/**
 * Special mathematical functions for quantum physics computations.
 *
 * Provides log-factorial and log-gamma-half via precomputed lookup tables,
 * matching the corresponding WGSL LUTs for CPU/GPU parity.
 *
 * @module lib/math/specialFunctions
 */

// ============================================================================
// Log-Factorial LUT: ln(k!) for k = 0..30
// ============================================================================

const LN_FACTORIAL_LUT: number[] = []
;(() => {
  LN_FACTORIAL_LUT[0] = 0
  let acc = 0
  for (let k = 1; k <= 30; k++) {
    acc += Math.log(k)
    LN_FACTORIAL_LUT[k] = acc
  }
})()

/**
 * Log-factorial: ln(k!) via precomputed LUT.
 *
 * For k > 30, falls back to iterative computation.
 * Matches the WGSL LN_FACTORIAL_LUT for k ≤ 22.
 *
 * @param k - Non-negative integer
 * @returns ln(k!), or 0 for k < 0
 */
export function lnFactorial(k: number): number {
  const n = Math.floor(k)
  if (n < 0) return 0
  if (n <= 30) return LN_FACTORIAL_LUT[n]!
  // Fallback for large n (rare in quantum number contexts)
  let sum = LN_FACTORIAL_LUT[30]!
  for (let i = 31; i <= n; i++) sum += Math.log(i)
  return sum
}

// ============================================================================
// Factorial LUT: n! for n = 0..30
// ============================================================================

/** Precomputed n! for n = 0..30 (f64 exact for n ≤ 21, < 1 ULP error for n ≤ 30). */
const FACTORIAL_LUT: number[] = [1]
;(() => {
  for (let k = 1; k <= 30; k++) FACTORIAL_LUT[k] = FACTORIAL_LUT[k - 1]! * k
})()

/**
 * Factorial n! via precomputed lookup table with iterative fallback.
 *
 * Uses LUT for n ≤ 30, iterative multiplication for 31 ≤ n ≤ 170.
 * Returns NaN for n < 0 or n > 170 (overflows f64).
 * For log-space computation of very large factorials, use {@link lnFactorial}.
 *
 * @param n - Non-negative integer
 * @returns n!
 */
export function factorial(n: number): number {
  const k = Math.floor(n)
  if (k < 0) return NaN
  if (k <= 30) return FACTORIAL_LUT[k]!
  if (k > 170) return NaN // 171! exceeds Number.MAX_VALUE
  let result = FACTORIAL_LUT[30]!
  for (let i = 31; i <= k; i++) result *= i
  return result
}

// ============================================================================
// Log-Gamma-Half LUT: ln(Γ(n/2)) for n = 1..30
// ============================================================================

/**
 * Precomputed ln(Γ(n/2)) for n = 1..30.
 * Matches the WGSL LN_GAMMA_HALF LUT exactly.
 */
const LN_GAMMA_HALF_LUT: readonly number[] = [
  0.5723649, 0.0, -0.1207822, 0.0, 0.2846829, 0.6931472, 1.2009736, 1.7917595, 2.4537365, 3.1780539,
  3.957814, 4.7874917, 5.6625621, 6.5792512, 7.5343642, 8.5251614, 9.5492673, 10.604602, 11.689333,
  12.801827, 13.940625, 15.104413, 16.291956, 17.502308, 18.734347, 19.987214, 21.260076, 22.552164,
  23.862765, 25.191221,
]

/**
 * Log-gamma-half: ln(Γ(n/2)) via precomputed LUT.
 *
 * @param n - Integer in [1, 30]
 * @returns ln(Γ(n/2)), or 0 if out of range
 */
export function lnGammaHalf(n: number): number {
  const k = Math.floor(n)
  if (k < 1 || k > 30) return 0
  return LN_GAMMA_HALF_LUT[k - 1]!
}
