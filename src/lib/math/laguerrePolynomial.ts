/**
 * Associated Laguerre polynomial L_p^α(x) via stable three-term recurrence.
 *
 * Standard recurrence:
 *   L_0^α(x) = 1
 *   L_1^α(x) = 1 + α − x
 *   L_{j}^α(x) = ((2j − 1 + α − x)·L_{j−1} − (j − 1 + α)·L_{j−2}) / j
 *
 * Used for hydrogen radial wavefunctions R_nl(r), dipole matrix elements,
 * and radial probability density visualizations.
 *
 * @module lib/math/laguerrePolynomial
 */

/**
 * Evaluate the associated Laguerre polynomial L_p^α(x).
 *
 * @param p - Non-negative integer order (degree)
 * @param alpha - Associated parameter (≥ 0)
 * @param x - Evaluation point
 * @returns L_p^α(x)
 */
export function associatedLaguerre(p: number, alpha: number, x: number): number {
  const order = Math.floor(p)
  if (order <= 0) return order < 0 ? 0 : 1
  if (order === 1) return 1 + alpha - x

  let lPrev2 = 1
  let lPrev1 = 1 + alpha - x
  let lCurr = lPrev1
  for (let j = 2; j <= order; j++) {
    lCurr = ((2 * j - 1 + alpha - x) * lPrev1 - (j - 1 + alpha) * lPrev2) / j
    lPrev2 = lPrev1
    lPrev1 = lCurr
  }
  return lCurr
}
