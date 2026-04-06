/**
 * Physicist's Hermite polynomial H_n(x) via stable recurrence.
 *
 * Uses the standard three-term recurrence:
 *   H_0(x) = 1
 *   H_1(x) = 2x
 *   H_{n+1}(x) = 2x·H_n(x) - 2n·H_{n-1}(x)
 *
 * @module lib/math/hermitePolynomial
 */

/**
 * Evaluate the physicist's Hermite polynomial H_n(x).
 *
 * @param n - Non-negative integer order
 * @param x - Evaluation point
 * @returns H_n(x)
 */
export function hermite(n: number, x: number): number {
  const order = Math.max(0, Math.floor(n))
  if (order === 0) return 1
  if (order === 1) return 2 * x
  let h0 = 1
  let h1 = 2 * x
  for (let k = 2; k <= order; k++) {
    const h2 = 2 * x * h1 - 2 * (k - 1) * h0
    h0 = h1
    h1 = h2
  }
  return h1
}
