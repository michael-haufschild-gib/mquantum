/**
 * Hydrogen Dipole Matrix Elements
 *
 * Computes |⟨j|r|i⟩|² for electric dipole transitions between hydrogen
 * orbital states. Uses:
 *   - Radial integral via explicit associated Laguerre polynomial evaluation
 *     and Gauss-Laguerre quadrature
 *   - Angular factor via Wigner 3j symbols (Gaunt coefficients)
 *
 * All integrals are in atomic units (a₀ = 1, ℏ = 1, e = 1).
 *
 * @module lib/physics/openQuantum/dipoleElements
 */

import type { HydrogenBasisState } from './hydrogenBasis'

// ---------------------------------------------------------------------------
// Factorial / combinatorial helpers
// ---------------------------------------------------------------------------

/** Precomputed factorials up to 30! (sufficient for n_max ≤ 7) */
const FACTORIALS: number[] = [1]
for (let i = 1; i <= 30; i++) {
  FACTORIALS[i] = FACTORIALS[i - 1]! * i
}

/**
 * Compute n! from lookup table.
 *
 * @param n - Non-negative integer (0-30)
 * @returns n factorial
 */
function factorial(n: number): number {
  if (n < 0 || n > 30) return NaN
  return FACTORIALS[n]!
}

// ---------------------------------------------------------------------------
// Associated Laguerre polynomials
// ---------------------------------------------------------------------------

/**
 * Evaluate the associated Laguerre polynomial L_p^α(x) via recurrence.
 *
 * L_0^α(x) = 1
 * L_1^α(x) = 1 + α - x
 * (p+1) L_{p+1}^α(x) = (2p+1+α-x) L_p^α(x) - (p+α) L_{p-1}^α(x)
 *
 * @param p - Polynomial degree (≥ 0)
 * @param alpha - Associated parameter (≥ 0)
 * @param x - Evaluation point
 * @returns L_p^α(x)
 */
function laguerreAssoc(p: number, alpha: number, x: number): number {
  if (p === 0) return 1
  if (p === 1) return 1 + alpha - x

  let prev2 = 1
  let prev1 = 1 + alpha - x
  let current = 0

  for (let k = 1; k < p; k++) {
    current = ((2 * k + 1 + alpha - x) * prev1 - (k + alpha) * prev2) / (k + 1)
    prev2 = prev1
    prev1 = current
  }

  return current
}

// ---------------------------------------------------------------------------
// Hydrogen radial wavefunction
// ---------------------------------------------------------------------------

/**
 * Evaluate the hydrogen radial wavefunction R_nl(r).
 *
 * R_nl(r) = N_nl · (2r/(n·a₀))^l · exp(-r/(n·a₀)) · L_{n-l-1}^{2l+1}(2r/(n·a₀))
 *
 * where N_nl = sqrt((2/(n·a₀))³ · (n-l-1)! / (2n·((n+l)!)³))
 *            = (2/(n·a₀))^(3/2) · sqrt((n-l-1)! / (2n·(n+l)!))
 *
 * In atomic units (a₀ = 1).
 *
 * @param n - Principal quantum number (≥ 1)
 * @param l - Azimuthal quantum number (0 to n-1)
 * @param r - Radial coordinate (≥ 0)
 * @returns R_nl(r)
 */
function hydrogenRadialWavefunction(n: number, l: number, r: number): number {
  const rho = (2 * r) / n
  const norm = Math.sqrt(
    (8 / (n * n * n)) * (factorial(n - l - 1) / (2 * n * factorial(n + l))),
  )
  const polyDegree = n - l - 1
  const polyAlpha = 2 * l + 1
  const L = laguerreAssoc(polyDegree, polyAlpha, rho)

  return norm * Math.pow(rho, l) * Math.exp(-rho / 2) * L
}

// ---------------------------------------------------------------------------
// Radial dipole integral
// ---------------------------------------------------------------------------

/**
 * Gauss-Laguerre quadrature nodes and weights for 32 points.
 * Pre-computed for the weight function w(x) = exp(-x).
 * These are sufficient for hydrogen integrals up to n_max ~ 7.
 */
const GL_NODES_32 = [
  0.044489365833267, 0.234526109519619, 0.576884629301886, 1.072448753818169,
  1.722408776444645, 2.528336706425796, 3.492213273021994, 4.616456769749767,
  5.903958504174244, 7.358126733186241, 8.982940924212595, 10.783018632539973,
  12.763745476369854, 14.93139172381829, 17.292454336715313, 19.855860940336054,
  22.631308194205726, 25.63026585149836, 28.86628922345678, 32.35502641111809,
  36.11493729849849, 40.16884211322846, 44.54503571004595, 49.280735826498685,
  54.42560359353923, 60.04681630621912, 66.23824489808752, 73.13251352473051,
  80.93076563148772, 89.97355467168613, 100.9025383828994, 115.56587606289106,
]

const GL_WEIGHTS_32 = [
  0.109218341952385, 0.210443107938813, 0.235213229669848, 0.195903335972881,
  0.129983786286072, 0.070578623704689, 0.031760912509176, 0.011886432183018,
  0.003700805036954, 0.000957926194539, 0.000205328257529, 0.000036294699788,
  0.000005242299438, 0.000000612506834, 0.000000057140738, 0.000000004183995,
  0.000000000237067, 0.000000000010211, 0.000000000000326, 0.000000000000007,
  1.12e-16, 1.14e-18, 7.23e-21, 2.72e-23,
  5.68e-26, 5.90e-29, 2.65e-32, 4.19e-36,
  1.64e-40, 8.82e-46, 1.65e-52, 1.57e-61,
]

/**
 * Compute the radial dipole integral ∫₀^∞ R_{n1,l1}(r) · r · R_{n2,l2}(r) · r² dr.
 *
 * Uses Gauss-Laguerre quadrature with substitution r = x · s / 2 where
 * s = max(n1, n2) to handle the exponential decay scale.
 *
 * @param n1 - Principal quantum number of state 1
 * @param l1 - Azimuthal quantum number of state 1
 * @param n2 - Principal quantum number of state 2
 * @param l2 - Azimuthal quantum number of state 2
 * @returns Radial dipole integral in atomic units (a₀)
 */
export function radialDipoleIntegral(
  n1: number,
  l1: number,
  n2: number,
  l2: number,
): number {
  // Scale factor: map Gauss-Laguerre range to hydrogen radial scale
  const scale = Math.max(n1, n2) * 0.5

  let integral = 0
  for (let i = 0; i < 32; i++) {
    const x = GL_NODES_32[i]!
    const w = GL_WEIGHTS_32[i]!

    // r = x * scale, dr = scale * dx
    // The quadrature integrates f(x) * exp(-x) dx
    // We need ∫ R1(r) * r * R2(r) * r² dr
    // = ∫ R1(x*s) * (x*s) * R2(x*s) * (x*s)² * s * exp(-x) * exp(+x) dx
    // = s⁴ ∫ R1(x*s) * R2(x*s) * x³ * exp(+x) * [exp(-x) dx]
    const r = x * scale
    const R1 = hydrogenRadialWavefunction(n1, l1, r)
    const R2 = hydrogenRadialWavefunction(n2, l2, r)

    // exp(+x) compensates for the Gauss-Laguerre weight function exp(-x)
    integral += w * R1 * r * R2 * r * r * Math.exp(x) * scale
  }

  return integral
}

// ---------------------------------------------------------------------------
// Wigner 3j symbols
// ---------------------------------------------------------------------------

/**
 * Compute the Wigner 3j symbol using the Racah formula.
 *
 * ( j1  j2  j3 )
 * ( m1  m2  m3 )
 *
 * Only valid for integer or half-integer angular momenta. For hydrogen
 * E1 transitions, all values are integers with j2 = 1.
 *
 * @param j1 - First angular momentum
 * @param j2 - Second angular momentum
 * @param j3 - Third angular momentum
 * @param m1 - First projection
 * @param m2 - Second projection
 * @param m3 - Third projection
 * @returns The Wigner 3j symbol value
 */
export function wigner3j(
  j1: number,
  j2: number,
  j3: number,
  m1: number,
  m2: number,
  m3: number,
): number {
  // Selection rules: m1 + m2 + m3 = 0
  if (m1 + m2 + m3 !== 0) return 0

  // Triangle inequality: |j1 - j2| ≤ j3 ≤ j1 + j2
  if (j3 < Math.abs(j1 - j2) || j3 > j1 + j2) return 0

  // |mi| ≤ ji
  if (Math.abs(m1) > j1 || Math.abs(m2) > j2 || Math.abs(m3) > j3) return 0

  // Racah formula
  const triCoeff = Math.sqrt(
    (factorial(j1 + j2 - j3) * factorial(j1 - j2 + j3) * factorial(-j1 + j2 + j3)) /
      factorial(j1 + j2 + j3 + 1),
  )

  const preFactor =
    triCoeff *
    Math.sqrt(
      factorial(j1 + m1) *
        factorial(j1 - m1) *
        factorial(j2 + m2) *
        factorial(j2 - m2) *
        factorial(j3 + m3) *
        factorial(j3 - m3),
    )

  // Sum over t
  const tMin = Math.max(0, j2 - j3 - m1, j1 - j3 + m2)
  const tMax = Math.min(j1 + j2 - j3, j1 - m1, j2 + m2)

  let sum = 0
  for (let t = tMin; t <= tMax; t++) {
    const denom =
      factorial(t) *
      factorial(j1 + j2 - j3 - t) *
      factorial(j1 - m1 - t) *
      factorial(j2 + m2 - t) *
      factorial(j3 - j2 + m1 + t) *
      factorial(j3 - j1 - m2 + t)

    sum += Math.pow(-1, t) / denom
  }

  return Math.pow(-1, j1 - j2 - m3) * preFactor * sum
}

// ---------------------------------------------------------------------------
// Angular factor (Gaunt coefficient)
// ---------------------------------------------------------------------------

/**
 * Compute the angular dipole factor for a specific spherical component q.
 *
 * ⟨l1,m1|Y_{1,q}|l2,m2⟩ = (-1)^m1 · √((2l1+1)·3·(2l2+1)/(4π))
 *                           · (l1 1 l2; 0 0 0) · (l1 1 l2; -m1 q m2)
 *
 * @param l1 - Azimuthal quantum number of bra state
 * @param m1 - Magnetic quantum number of bra state
 * @param l2 - Azimuthal quantum number of ket state
 * @param m2 - Magnetic quantum number of ket state
 * @param q - Spherical component (-1, 0, or +1)
 * @returns Angular factor value
 */
export function angularFactor(
  l1: number,
  m1: number,
  l2: number,
  m2: number,
  q: number,
): number {
  // Selection rule: q = m1 - m2 (from m conservation in 3j: -m1 + q + m2 = 0)
  if (q !== m1 - m2) return 0

  const prefactor =
    Math.pow(-1, m1) * Math.sqrt(((2 * l1 + 1) * 3 * (2 * l2 + 1)) / (4 * Math.PI))

  const w3j_1 = wigner3j(l1, 1, l2, 0, 0, 0)
  const w3j_2 = wigner3j(l1, 1, l2, -m1, q, m2)

  return prefactor * w3j_1 * w3j_2
}

// ---------------------------------------------------------------------------
// Full dipole matrix element
// ---------------------------------------------------------------------------

/** Cache for dipole matrix elements squared */
const dipoleCache = new Map<string, number>()

/**
 * Compute |⟨j|r|i⟩|² for the electric dipole operator.
 *
 * |⟨j|r|i⟩|² = Σ_{q=-1}^{+1} |⟨radial⟩ · ⟨angular_q⟩|²
 *
 * where the radial part is ∫ R_{n_j,l_j}(r) · r · R_{n_i,l_i}(r) · r² dr
 * and the angular part is the Gaunt coefficient.
 *
 * @param stateI - Initial hydrogen basis state
 * @param stateJ - Final hydrogen basis state
 * @returns |⟨j|r|i⟩|² in atomic units (a₀²)
 */
export function dipoleMatrixElementSquared(
  stateI: HydrogenBasisState,
  stateJ: HydrogenBasisState,
): number {
  // Cache key (symmetric: |⟨j|r|i⟩|² = |⟨i|r|j⟩|²)
  const [a, b] =
    stateI.index < stateJ.index ? [stateI, stateJ] : [stateJ, stateI]
  const key = `${a.n},${a.l},${a.m}-${b.n},${b.l},${b.m}`

  const cached = dipoleCache.get(key)
  if (cached !== undefined) return cached

  // Selection rule: Δl = ±1
  if (Math.abs(stateI.l - stateJ.l) !== 1) {
    dipoleCache.set(key, 0)
    return 0
  }

  // Radial integral
  const radial = radialDipoleIntegral(stateI.n, stateI.l, stateJ.n, stateJ.l)

  // Sum over spherical components q = -1, 0, +1
  let sumSq = 0
  for (let q = -1; q <= 1; q++) {
    const angular = angularFactor(stateJ.l, stateJ.m, stateI.l, stateI.m, q)
    sumSq += radial * radial * angular * angular
  }

  dipoleCache.set(key, sumSq)
  return sumSq
}

/**
 * Clear the dipole matrix element cache.
 * Call when basis configuration changes.
 */
export function clearDipoleCache(): void {
  dipoleCache.clear()
}
