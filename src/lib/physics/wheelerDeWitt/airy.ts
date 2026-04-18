/**
 * Real-argument Airy functions `Ai(z)`, `Bi(z)` and their derivatives.
 *
 * Used by the Wheeler–DeWitt Langer-uniform connection (see
 * {@link ./airyConnection}) to overwrite Euclidean-region cells with the
 * branch-correct analytic continuation of the numerically-extracted
 * Lorentzian-side WKB amplitudes. Without an explicit Airy evaluator the
 * Stage-2 transition band uses a numerical leapfrog plus a soft
 * `exp(−η·√U·da)` absorber that damps decaying and growing branches by
 * the same rate, leaving a boundary-condition-agnostic mixture in the
 * match cell. Airy lets us select the correct branch per BC (HH/DeWitt
 * pure decaying, Vilenkin outgoing-wave) and bypass the absorber
 * entirely.
 *
 * ## Implementation
 *
 * Two regimes:
 *
 *  - `|z| ≤ AIRY_SERIES_RADIUS` (= 6): convergent Maclaurin series
 *    (Abramowitz–Stegun 10.4.2 / DLMF 9.4):
 *
 *        f(z) = Σ_{k≥0} z^{3k} · ∏_{j=0..k−1}(3j+1) / (3k)!
 *        g(z) = Σ_{k≥0} z^{3k+1} · ∏_{j=0..k−1}(3j+2) / (3k+1)!
 *        Ai(z) = c₁·f(z) − c₂·g(z)
 *        Bi(z) = √3·(c₁·f(z) + c₂·g(z))
 *
 *    with `c₁ = Ai(0) = 0.355028053887817…`, `c₂ = −Ai′(0) =
 *    0.258819403792807…`. The recurrence
 *
 *        a_k / a_{k−1} = 1 / [(3k−1)·(3k)]    (cancels the (3k−2) numerator)
 *        b_k / b_{k−1} = 1 / [(3k)·(3k+1)]    (cancels the (3k−1) numerator)
 *
 *    gives O(1) per-term cost. Truncated when both `|Δf|`, `|Δg|` fall
 *    below double-precision epsilon (≤ 50 terms in practice for `|z| =
 *    6`).
 *
 *  - `|z| > AIRY_SERIES_RADIUS`: leading + first-correction asymptotic
 *    expansion (DLMF 9.7). For `z > 0`:
 *
 *        Ai(z) ~ (1/(2√π)) · z^{−1/4} · exp(−ξ) · (1 − u₁/ξ + u₂/ξ² − …)
 *        Bi(z) ~ (1/√π)    · z^{−1/4} · exp(+ξ) · (1 + u₁/ξ + u₂/ξ² + …)
 *
 *    with `ξ = (2/3)·z^{3/2}`, `u_k` the Airy asymptotic coefficients
 *    (`u₁ = 5/72`, `u₂ = 385/10368`, …). For `z < 0`:
 *
 *        Ai(−x) ~ π^{−1/2}·x^{−1/4} · [sin(ξ+π/4)·P − cos(ξ+π/4)·Q]
 *        Bi(−x) ~ π^{−1/2}·x^{−1/4} · [cos(ξ+π/4)·P + sin(ξ+π/4)·Q]
 *
 *    with `P = 1 − u₂/ξ² + …`, `Q = u₁/ξ − u₃/ξ³ + …`. Two correction
 *    terms suffice for double-precision at `|z| > 6`.
 *
 * Tested against published values (Wolfram, DLMF tables) at
 * `z ∈ {−6, −2, −1, 0, 1, 2, 6}` to relative tolerance 1e-7.
 *
 * @module lib/physics/wheelerDeWitt/airy
 */

/** Crossover between Maclaurin series and asymptotic expansion. */
const AIRY_SERIES_RADIUS = 6

/** `Ai(0) = 1 / (3^{2/3} · Γ(2/3))`. Truncated to JS double precision. */
const AI_AT_ZERO = 0.3550280538878172
/** `−Ai′(0) = 1 / (3^{1/3} · Γ(1/3))`. Truncated to JS double precision. */
const NEG_AI_PRIME_AT_ZERO = 0.2588194037928068
/** `Bi(0) = 3^{1/6} / Γ(2/3) = √3 · Ai(0)`. */
const BI_AT_ZERO = AI_AT_ZERO * Math.sqrt(3)
/** `Bi′(0) = 3^{1/6} / Γ(1/3) = √3 · (−Ai′(0))`. */
const BI_PRIME_AT_ZERO = NEG_AI_PRIME_AT_ZERO * Math.sqrt(3)

/** Asymptotic coefficients `u_k` (DLMF 9.7.2). */
const U1 = 5 / 72
const U2 = 385 / 10368
const U3 = 85085 / 2239488
const U4 = 37182145 / 644972544

/**
 * Absolute magnitudes `|v_k|` of the derivative-series coefficients
 * (DLMF 9.7.6). DLMF's signed `v_k = −((6k+1)/(6k−1))·u_k` is negative
 * for every `k ≥ 1`; stashing `|v_k|` here lets the series assembly in
 * `airyAsymptoticPositive` / `airyAsymptoticNegative` spell out the sign
 * pattern explicitly. The resulting formulas (`1 + V1/ξ − V2/ξ² + V3/ξ³`
 * for `Ai′`, `1 − V1/ξ − V2/ξ² − V3/ξ³` for `Bi′`) are verified by the
 * Wronskian identity test in `airy.test.ts` to < 1e−5 at `|z| = 12`.
 */
const V1 = 7 / 72
const V2 = 455 / 10368
const V3 = 95095 / 2239488

/** Term cap for the Maclaurin series. Reached only for `|z|` near the radius. */
const AIRY_SERIES_MAX_TERMS = 80

/** Magnitude floor below which a term contributes nothing in double. */
const AIRY_SERIES_EPS = 1e-18

/**
 * Tabulate `f(z)`, `g(z)`, `f'(z)`, `g'(z)` over the Maclaurin window via
 * the simplified `1 / ((3k−1)·3k)` recurrence (the `(3k−2)` numerator
 * cancels against the same factor in the falling factorial).
 *
 * The derivative series `f'(z) = Σ_{k≥1} (3k)·a_k·z^{3k−1}` and `g'(z) =
 * b_0 + Σ_{k≥1} (3k+1)·b_k·z^{3k}` are evaluated in a SEPARATE loop with
 * its own running power of `z`, not fused into the `f`/`g` pass. The
 * separation avoids a `1/z` division at `z = 0` for the `f'` series. The
 * two loops share coefficients but have independent early-exit
 * conditions, so their term counts may differ by one or two for `|z|`
 * near the convergence boundary.
 */
function airySeriesEvaluate(z: number): {
  f: number
  g: number
  fPrime: number
  gPrime: number
} {
  const z2 = z * z
  const z3 = z * z2
  let f = 1
  let g = z
  let fPrime = 0
  let gPrime = 1

  // Running coefficients and powers.
  let aCoef = 1 // a_0
  let bCoef = 1 // b_0
  let zPow3k = 1 // z^{0}

  for (let k = 1; k < AIRY_SERIES_MAX_TERMS; k++) {
    aCoef /= (3 * k - 1) * (3 * k)
    bCoef /= 3 * k * (3 * k + 1)
    zPow3k *= z3 // now equals z^{3k}

    const dF = aCoef * zPow3k
    const dG = bCoef * zPow3k * z
    f += dF
    g += dG

    if (Math.abs(dF) < AIRY_SERIES_EPS && Math.abs(dG) < AIRY_SERIES_EPS) break
  }

  // Second pass for the derivative series. Decoupled from the f/g power
  // chain so the f' series can run without a 1/z division at z = 0. Same
  // coefficient recurrence; this loop has its own early-exit so the term
  // count may differ by one or two from the f/g pass near `|z| = 6`.
  aCoef = 1
  bCoef = 1
  let zPow3kMinus1 = 1 // start at z^{0} for k=0; for k≥1 we'll multiply by z²·z^{3(k−1)} = z^{3k−1}
  let zPow3kForG = 1 // z^{3k}, will be z³ at k=1
  for (let k = 1; k < AIRY_SERIES_MAX_TERMS; k++) {
    aCoef /= (3 * k - 1) * (3 * k)
    bCoef /= 3 * k * (3 * k + 1)
    if (k === 1) {
      zPow3kMinus1 = z2 // z^{2}
      zPow3kForG = z3 // z^{3}
    } else {
      zPow3kMinus1 *= z3
      zPow3kForG *= z3
    }

    const dFp = 3 * k * aCoef * zPow3kMinus1
    const dGp = (3 * k + 1) * bCoef * zPow3kForG
    fPrime += dFp
    gPrime += dGp
    if (Math.abs(dFp) < AIRY_SERIES_EPS && Math.abs(dGp) < AIRY_SERIES_EPS) break
  }

  return { f, g, fPrime, gPrime }
}

/**
 * Maclaurin-series evaluator for `(Ai, Bi, Ai′, Bi′)` at small-to-moderate
 * argument. Valid for any real `z`; converges quickly for `|z| ≲ 6`.
 */
function airyMaclaurin(z: number): {
  ai: number
  bi: number
  aiPrime: number
  biPrime: number
} {
  const { f, g, fPrime, gPrime } = airySeriesEvaluate(z)
  return {
    ai: AI_AT_ZERO * f - NEG_AI_PRIME_AT_ZERO * g,
    bi: BI_AT_ZERO * f + BI_PRIME_AT_ZERO * g,
    aiPrime: AI_AT_ZERO * fPrime - NEG_AI_PRIME_AT_ZERO * gPrime,
    biPrime: BI_AT_ZERO * fPrime + BI_PRIME_AT_ZERO * gPrime,
  }
}

/**
 * Asymptotic evaluator for `z > 0` (DLMF 9.7.5–8).
 */
function airyAsymptoticPositive(z: number): {
  ai: number
  bi: number
  aiPrime: number
  biPrime: number
} {
  const z14 = Math.pow(z, 0.25)
  const xi = (2 / 3) * z * Math.sqrt(z)
  const invXi = 1 / xi
  const invXi2 = invXi * invXi
  const invXi3 = invXi2 * invXi
  const invXi4 = invXi2 * invXi2
  const sqrtPi = Math.sqrt(Math.PI)

  const aiSeries = 1 - U1 * invXi + U2 * invXi2 - U3 * invXi3 + U4 * invXi4
  const biSeries = 1 + U1 * invXi + U2 * invXi2 + U3 * invXi3 + U4 * invXi4
  const aiDerivSeries = 1 + V1 * invXi - V2 * invXi2 + V3 * invXi3
  const biDerivSeries = 1 - V1 * invXi - V2 * invXi2 - V3 * invXi3

  const expNegXi = Math.exp(-xi)
  const expPosXi = Math.exp(xi)

  return {
    ai: (1 / (2 * sqrtPi)) * (1 / z14) * expNegXi * aiSeries,
    bi: (1 / sqrtPi) * (1 / z14) * expPosXi * biSeries,
    aiPrime: -(1 / (2 * sqrtPi)) * z14 * expNegXi * aiDerivSeries,
    biPrime: (1 / sqrtPi) * z14 * expPosXi * biDerivSeries,
  }
}

/**
 * Asymptotic evaluator for `z < 0` (DLMF 9.7.9–12, oscillatory regime).
 */
function airyAsymptoticNegative(z: number): {
  ai: number
  bi: number
  aiPrime: number
  biPrime: number
} {
  const x = -z
  const x14 = Math.pow(x, 0.25)
  const xi = (2 / 3) * x * Math.sqrt(x)
  const invXi = 1 / xi
  const invXi2 = invXi * invXi
  const invXi3 = invXi2 * invXi
  const invXi4 = invXi2 * invXi2
  const sqrtPi = Math.sqrt(Math.PI)

  const P = 1 - U2 * invXi2 + U4 * invXi4
  const Q = U1 * invXi - U3 * invXi3
  const Pp = 1 + V2 * invXi2
  const Qp = -V1 * invXi + V3 * invXi3

  const phi = xi + Math.PI / 4
  const sphi = Math.sin(phi)
  const cphi = Math.cos(phi)

  return {
    ai: (1 / sqrtPi) * (1 / x14) * (sphi * P - cphi * Q),
    bi: (1 / sqrtPi) * (1 / x14) * (cphi * P + sphi * Q),
    aiPrime: -(1 / sqrtPi) * x14 * (cphi * Pp + sphi * Qp),
    biPrime: (1 / sqrtPi) * x14 * (sphi * Pp - cphi * Qp),
  }
}

/**
 * Evaluate all four Airy quantities `(Ai, Bi, Ai′, Bi′)` at `z` in one
 * call. Faster than four independent calls because the underlying series
 * (Maclaurin or asymptotic) is shared.
 *
 * @param z - Real argument.
 * @returns Object with `ai`, `bi`, `aiPrime`, `biPrime`.
 */
export function airyAll(z: number): {
  ai: number
  bi: number
  aiPrime: number
  biPrime: number
} {
  if (!Number.isFinite(z)) {
    throw new RangeError(`airyAll expects a finite real argument (got ${z})`)
  }
  if (Math.abs(z) <= AIRY_SERIES_RADIUS) {
    return airyMaclaurin(z)
  }
  if (z > 0) return airyAsymptoticPositive(z)
  return airyAsymptoticNegative(z)
}

/**
 * Airy function of the first kind, `Ai(z)`. Solution of `y'' = z·y`
 * decaying for `z → +∞`, oscillating for `z → −∞`.
 *
 * @param z - Real argument.
 * @returns `Ai(z)`.
 */
export function airyAi(z: number): number {
  return airyAll(z).ai
}

/**
 * Airy function of the second kind, `Bi(z)`. Solution of `y'' = z·y`
 * growing for `z → +∞`, oscillating (π/2 out of phase with Ai) for
 * `z → −∞`.
 *
 * @param z - Real argument.
 * @returns `Bi(z)`.
 */
export function airyBi(z: number): number {
  return airyAll(z).bi
}

/**
 * Derivative of `Ai(z)` w.r.t. `z`.
 *
 * @param z - Real argument.
 * @returns `Ai'(z)`.
 */
export function airyAiPrime(z: number): number {
  return airyAll(z).aiPrime
}

/**
 * Derivative of `Bi(z)` w.r.t. `z`.
 *
 * @param z - Real argument.
 * @returns `Bi'(z)`.
 */
export function airyBiPrime(z: number): number {
  return airyAll(z).biPrime
}
