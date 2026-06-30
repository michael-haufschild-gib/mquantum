/**
 * Complex-analytic core for the WDW ⊗ ζ suite: the Gamma function, the Riemann
 * zeta function ζ(s) (Euler–Maclaurin — accurate across the critical strip), and
 * the completed ξ(s) = ½ s(s−1) π^(−s/2) Γ(s/2) ζ(s).
 *
 * These are the "physical wavefunction" objects of the suite: ζ is the raw
 * (kinematic) amplitude, ξ the completed (physical) state with `ξ(s) = ξ(1−s)`.
 * The functions are evaluated on the CPU during the bake and never re-derived on
 * the GPU. Accuracy target is visualization-grade (~6–8 digits in the strip),
 * not number-theory-grade; the unit test pins the first few zeros and the
 * functional-equation symmetry.
 *
 * @module lib/physics/wdwZeta/complex
 */

/** A complex number as a `[re, im]` tuple. */
export type Complex = [number, number]

/** Complex multiply. */
export function cmul(a: Complex, b: Complex): Complex {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
}

/** Complex add. */
export function cadd(a: Complex, b: Complex): Complex {
  return [a[0] + b[0], a[1] + b[1]]
}

/** Complex divide. */
export function cdiv(a: Complex, b: Complex): Complex {
  const d = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}

/** Complex exponential `e^z`. */
export function cexp(z: Complex): Complex {
  const e = Math.exp(z[0])
  return [e * Math.cos(z[1]), e * Math.sin(z[1])]
}

/** Complex modulus. */
export function cabs(z: Complex): number {
  return Math.hypot(z[0], z[1])
}

/** Complex argument in `(−π, π]`. */
export function carg(z: Complex): number {
  return Math.atan2(z[1], z[0])
}

/** `n^(−s)` for a real positive integer base `n` and complex exponent `s`. */
function realPowNegS(n: number, s: Complex): Complex {
  // n^(−s) = e^(−s·ln n) = n^(−sRe)·(cos(sIm·ln n) − i·sin(sIm·ln n)).
  const ln = Math.log(n)
  const mag = Math.pow(n, -s[0])
  const ang = -s[1] * ln
  return [mag * Math.cos(ang), mag * Math.sin(ang)]
}

// Lanczos g=7, n=9 coefficients (double precision).
const LANCZOS_G = 7
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

/**
 * Complex Gamma function Γ(z) via the Lanczos approximation with the reflection
 * formula for `Re z < 0.5`. Visualization-grade accuracy.
 *
 * @param z - Complex argument.
 * @returns Γ(z).
 */
export function cgamma(z: Complex): Complex {
  if (z[0] < 0.5) {
    // Reflection: Γ(z) = π / (sin(πz)·Γ(1−z)).
    const piz: Complex = [Math.PI * z[0], Math.PI * z[1]]
    const sinPiz: Complex = [
      Math.sin(piz[0]) * Math.cosh(piz[1]),
      Math.cos(piz[0]) * Math.sinh(piz[1]),
    ]
    const oneMinus: Complex = [1 - z[0], -z[1]]
    const g = cgamma(oneMinus)
    return cdiv([Math.PI, 0], cmul(sinPiz, g))
  }
  const zz: Complex = [z[0] - 1, z[1]]
  let x: Complex = [LANCZOS_C[0]!, 0]
  for (let i = 1; i < LANCZOS_G + 2; i++) {
    x = cadd(x, cdiv([LANCZOS_C[i]!, 0], [zz[0] + i, zz[1]]))
  }
  const t: Complex = [zz[0] + LANCZOS_G + 0.5, zz[1]]
  // Γ(z) = √(2π) · t^(z+0.5) · e^(−t) · x.
  const halfLogT: Complex = [Math.log(cabs(t)), carg(t)] // ln t
  const exponent: Complex = [zz[0] + 0.5, zz[1]]
  const tPow = cexp(cmul(exponent, halfLogT)) // t^(z+0.5)
  const eNegT = cexp([-t[0], -t[1]])
  const sqrt2pi: Complex = [Math.sqrt(2 * Math.PI), 0]
  return cmul(sqrt2pi, cmul(tPow, cmul(eNegT, x)))
}

// Bernoulli numbers B_{2k} for k = 1..6 (Euler–Maclaurin correction terms).
const BERNOULLI_2K = [
  1 / 6, // B2
  -1 / 30, // B4
  1 / 42, // B6
  -1 / 30, // B8
  5 / 66, // B10
  -691 / 2730, // B12
]

/**
 * Riemann zeta ζ(s) via Euler–Maclaurin summation. Accurate across the critical
 * strip (and beyond `Re s > 0` away from the pole at `s = 1`). Uses `N` direct
 * terms plus `M` Bernoulli correction terms.
 *
 * @param s - Complex argument (avoid `s = 1`).
 * @param N - Number of direct terms (default 18).
 * @param M - Number of Bernoulli correction terms, ≤ 6 (default 5).
 * @returns ζ(s).
 */
export function czeta(s: Complex, N = 18, M = 5): Complex {
  // Pole guard.
  if (Math.abs(s[0] - 1) < 1e-9 && Math.abs(s[1]) < 1e-9) return [1e9, 0]

  let sum: Complex = [0, 0]
  for (let n = 1; n < N; n++) sum = cadd(sum, realPowNegS(n, s))

  // Tail: N^(−s)/2 + N^(1−s)/(s−1).
  const Ns = realPowNegS(N, s)
  sum = cadd(sum, [Ns[0] * 0.5, Ns[1] * 0.5])
  const oneMinusS: Complex = [1 - s[0], -s[1]]
  const N1ms = cexp(cmul(oneMinusS, [Math.log(N), 0])) // N^(1−s)
  sum = cadd(sum, cdiv(N1ms, [s[0] - 1, s[1]]))

  // Euler–Maclaurin correction: Σ_k B_{2k}/(2k)! · (s)_{2k−1} · N^(−s−2k+1).
  // (s)_{2k−1} = s(s+1)…(s+2k−2) is the rising factorial of length 2k−1.
  const mm = Math.min(M, BERNOULLI_2K.length)
  let factorial = 1 // (2k)!
  for (let k = 1; k <= mm; k++) {
    factorial *= 2 * k * (2 * k - 1)
    // Rising factorial (s)_{2k−1}.
    let rising: Complex = [1, 0]
    for (let j = 0; j < 2 * k - 1; j++) rising = cmul(rising, [s[0] + j, s[1]])
    // N^(−s−2k+1).
    const exp: Complex = [-s[0] - 2 * k + 1, -s[1]]
    const Np = cexp(cmul(exp, [Math.log(N), 0]))
    const coeff = BERNOULLI_2K[k - 1]! / factorial
    const term = cmul([coeff, 0], cmul(rising, Np))
    sum = cadd(sum, term)
  }
  return sum
}

/**
 * The completed Riemann xi function ξ(s) = ½ s(s−1) π^(−s/2) Γ(s/2) ζ(s). Entire,
 * real on the critical line, and symmetric: `ξ(s) = ξ(1−s)`. Its zeros are
 * exactly the non-trivial zeros of ζ. This is the suite's "physical state": the
 * functional-equation symmetry is the Wheeler–DeWitt constraint made literal.
 *
 * @param s - Complex argument.
 * @returns ξ(s).
 */
export function cxi(s: Complex): Complex {
  const half: Complex = [0.5, 0]
  // ½ s (s−1).
  const sMinus1: Complex = [s[0] - 1, s[1]]
  let pre = cmul(half, cmul(s, sMinus1))
  // π^(−s/2) = e^(−(s/2)·ln π).
  const piPow = cexp(cmul([-s[0] / 2, -s[1] / 2], [Math.log(Math.PI), 0]))
  // Γ(s/2).
  const gam = cgamma([s[0] / 2, s[1] / 2])
  // ζ(s).
  const zeta = czeta(s)
  pre = cmul(pre, piPow)
  pre = cmul(pre, gam)
  pre = cmul(pre, zeta)
  return pre
}

/**
 * The Riemann–Siegel theta function θ(t) = arg Γ(¼ + it/2) − (t/2) ln π, used to
 * form the real Hardy Z-function Z(t) = e^(iθ(t)) ζ(½ + it). Sign changes of Z
 * are the zeros on the critical line.
 *
 * @param t - Ordinate on the critical line.
 * @returns θ(t).
 */
export function riemannSiegelTheta(t: number): number {
  const g = cgamma([0.25, t / 2])
  return carg(g) - (t / 2) * Math.log(Math.PI)
}

/**
 * The real Hardy Z-function Z(t) = e^(iθ(t)) ζ(½ + it). Real-valued; its zeros
 * are the ζ-zeros on the critical line.
 *
 * @param t - Ordinate on the critical line.
 * @returns Z(t).
 */
export function hardyZ(t: number): number {
  const z = czeta([0.5, t])
  const th = riemannSiegelTheta(t)
  // Re(e^(iθ)·ζ) = cos θ·Re ζ − sin θ·Im ζ.
  return Math.cos(th) * z[0] - Math.sin(th) * z[1]
}
