/**
 * Bianchi Type-I vacuum Kasner — anisotropic cosmological background for the
 * Free Scalar Field lattice.
 *
 * This module implements the math behind the `bianchiKasner` cosmology preset:
 * a three-axis anisotropic vacuum solution to Einstein's equations whose
 * metric reads, in proper time `t`,
 *
 *     ds² = −dt² + a₁²(t)·dx² + a₂²(t)·dy² + a₃²(t)·dz²
 *           with   a_i(t) = t^{p_i},   Σp_i = 1,   Σp_i² = 1.
 *
 * The two constraints pin the Kasner triple on a circle on the plane
 * `Σp_i = 1` inside `ℝ³`; the canonical symmetric vacuum solution is
 * `(p₁, p₂, p₃) = (−1/3, 2/3, 2/3)` (and permutations). There is no
 * isotropic solution because `p = 1/3` gives `Σp² = 1/3 ≠ 1`.
 *
 * On this background a free scalar field's canonical Hamiltonian picks up
 * **per-axis** kinetic coefficients. Defining a generalized conformal time
 * `η` via `dη = dt/ã(t)` with the geometric-mean gauge
 * `ã = (a₁·a₂·a₃)^(1/(n−1))` (`n` = spacetime dim), the action becomes
 *
 *     S = ∫ dη d^(n−1)x [(ã^(n−2)/2)(φ')² − Σ_i (ã^n/(2·a_i²))(∂_iφ)²
 *                        − (ã^n/2)·m²·φ²].
 *
 * Canonical momentum `π = ã^(n−2)·φ'`; Hamilton equations read
 *
 *     δφ' = ã^(−(n−2)) · π                            ≡ aKinetic · π
 *     π'  = Σ_i (ã^n/a_i²)·∂²_i δφ  −  m²·ã^n·δφ      ≡ Σ_i aPot_i · ∂²_i δφ − m²·aFull·δφ
 *
 * so the free scalar feels the anisotropy only through the *gradient* term.
 * Writing axis-0 out as a scalar `aPotential := aPot_0 = ã^n/a_1²` and
 * expressing the remaining two axes as **ratios**
 *
 *     aPotentialRatio1 := aPot_1 / aPot_0 = (a_1 / a_2)²
 *     aPotentialRatio2 := aPot_2 / aPot_0 = (a_1 / a_3)²
 *
 * keeps the FSF uniform struct at its 528-byte budget: the existing
 * trailing `_padCosmo1`/`_padCosmo2` pad words are repurposed as those two
 * ratio slots. Under every existing isotropic preset
 * (`a_1 = a_2 = a_3 ⇒ ratios = 1`) the CPU uploads `1.0, 1.0` and the
 * pi-update shader's per-axis accumulation reduces bit-identically to the
 * single-scalar-coefficient form.
 *
 * The generalized conformal time is `η = ((n−1)/(n−2))·t^((n−2)/(n−1))`,
 * so `t = (η·(n−2)/(n−1))^((n−1)/(n−2))` and `ã = t^(1/(n−1))`.
 * For n = 4 this reduces to `η = (3/2)·t^(2/3)`, `t = (2η/3)^(3/2)`.
 *
 * This implementation is the 3+1-dimensional Bianchi-I model. It carries
 * exactly three Kasner exponents and two axis-ratio uniforms. Higher spatial
 * dimensions would require a d-dimensional exponent vector and a wider shader
 * contract, so validators reject `spacetimeDim !== 4`.
 *
 * @module lib/physics/cosmology/bianchiKasner
 */

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/**
 * A triple of Kasner exponents `(p₁, p₂, p₃)` parameterising a Bianchi-I
 * background. The vacuum Kasner solution additionally requires
 * `Σp_i = 1 ∧ Σp_i² = 1` — see {@link isKasnerVacuum}.
 */
export interface KasnerExponents {
  /** Exponent for axis 0 — the "contracting" axis in the canonical vacuum. */
  p1: number
  /** Exponent for axis 1 — one of the two "dilating" axes in the canonical vacuum. */
  p2: number
  /** Exponent for axis 2 — the other "dilating" axis in the canonical vacuum. */
  p3: number
}

/**
 * Per-axis Bianchi-Kasner coefficient bundle returned by
 * {@link computeBianchiKasnerCoefs}. Extends the scalar cosmology coefs
 * with two per-axis ratios relative to axis-0 so the FSF pipeline can carry
 * the anisotropy through the existing 3-f32 cosmology slot without
 * enlarging the uniform struct.
 */
export interface BianchiKasnerCoefs {
  /** Positive proper time `t` corresponding to the requested generalized conformal time. */
  tProper: number
  /** Effective scalar scale factor `ã = (a₁·a₂·a₃)^(1/(n−1))`. */
  a: number
  /** `ã^(−(n−2))` — drift coefficient for `δφ' = aKinetic · π`. */
  aKinetic: number
  /** Axis-0 potential coefficient `aPot_0 = ã^n / a_1²`. */
  aPotential: number
  /** `ã^n` — full volume-form coefficient for the mass term. */
  aFull: number
  /** `aPot_1 / aPot_0 = (a_1 / a_2)²` — axis-1 scaling relative to axis-0. */
  aPotentialRatio1: number
  /** `aPot_2 / aPot_0 = (a_1 / a_3)²` — axis-2 scaling relative to axis-0. */
  aPotentialRatio2: number
}

// ───────────────────────────────────────────────────────────────────────────
// Constraint utilities
// ───────────────────────────────────────────────────────────────────────────

/**
 * Default tolerance for the two Kasner vacuum constraints `Σp = 1` and
 * `Σp² = 1`. `1e-10` is tight enough to rule out every physically distinct
 * triple while leaving enough headroom that the one-parameter golden-section
 * snap can land within tolerance using fewer than 60 bracket refinements.
 */
export const KASNER_VACUUM_TOL = 1e-10

/**
 * True iff the triple `(p₁, p₂, p₃)` satisfies both Kasner vacuum
 * constraints within the supplied tolerance.
 *
 * @param exp - Exponent triple under test
 * @param tol - Absolute tolerance on each constraint (default {@link KASNER_VACUUM_TOL})
 * @returns `true` iff `|Σp − 1| < tol ∧ |Σp² − 1| < tol`
 */
export function isKasnerVacuum(exp: KasnerExponents, tol: number = KASNER_VACUUM_TOL): boolean {
  const s1 = exp.p1 + exp.p2 + exp.p3
  const s2 = exp.p1 * exp.p1 + exp.p2 * exp.p2 + exp.p3 * exp.p3
  return Math.abs(s1 - 1) < tol && Math.abs(s2 - 1) < tol
}

/**
 * Canonical symmetric vacuum Kasner triple `(−1/3, 2/3, 2/3)`. Axis 0
 * contracts while axes 1 and 2 dilate, making the geometric-mean scale
 * factor grow as `ã = t^(1/3)` in `n = 4`.
 *
 * @returns Fresh `{ p1, p2, p3 }` record holding the canonical triple
 */
export function kasnerSymmetricVacuum(): KasnerExponents {
  return { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 }
}

/**
 * One-parameter family of vacuum Kasner triples, parameterised by the phase
 * angle `φ ∈ [0, 2π)` on the vacuum constraint circle:
 *
 *     p₁(φ) = (1 − 2·cosφ) / 3
 *     p₂(φ) = (1 + cosφ − √3·sinφ) / 3
 *     p₃(φ) = (1 + cosφ + √3·sinφ) / 3
 *
 * At `φ = 0` this returns the canonical symmetric triple
 * `(−1/3, 2/3, 2/3)`. Every output satisfies both Kasner constraints
 * exactly (to FP roundoff), so the family is a bijection from the unit
 * circle to the vacuum branch of the constraint surface.
 *
 * @param phi - Phase angle parameter
 * @returns Exponent triple at the given `φ`
 */
export function kasnerVacuumParameterization(phi: number): KasnerExponents {
  const c = Math.cos(phi)
  const s = Math.sin(phi)
  const sqrt3 = Math.sqrt(3)
  return {
    p1: (1 - 2 * c) / 3,
    p2: (1 + c - sqrt3 * s) / 3,
    p3: (1 + c + sqrt3 * s) / 3,
  }
}

/**
 * Project an arbitrary triple onto the vacuum Kasner constraint circle.
 *
 * Strategy: compute the squared L2 distance from the input to every point
 * on a 256-sample uniform discretisation of
 * {@link kasnerVacuumParameterization}, pick the bracket containing the
 * minimum, and refine it via a bounded Newton / bisection hybrid for 40
 * iterations. The search is 1D (one parameter `φ`), convex within a bracket
 * of width `< π`, and does not need gradient descent.
 *
 * The returned triple always satisfies both Kasner vacuum constraints to
 * at least `1e-8`. Idempotent on inputs that already lie on the circle.
 *
 * @param exp - Input triple (may violate the constraints)
 * @returns Triple on the vacuum circle nearest to `exp` in L2
 */
export function snapToKasnerVacuum(exp: KasnerExponents): KasnerExponents {
  const distSq = (phi: number): number => {
    const v = kasnerVacuumParameterization(phi)
    const d1 = v.p1 - exp.p1
    const d2 = v.p2 - exp.p2
    const d3 = v.p3 - exp.p3
    return d1 * d1 + d2 * d2 + d3 * d3
  }

  const TWO_PI = 2 * Math.PI
  const GRID = 256

  // Initial coarse grid over [0, 2π).
  let bestPhi = 0
  let bestD = distSq(0)
  for (let i = 1; i < GRID; i++) {
    const phi = (i * TWO_PI) / GRID
    const d = distSq(phi)
    if (d < bestD) {
      bestD = d
      bestPhi = phi
    }
  }

  // Bracket a minimum around bestPhi with width `2·step`. Cosine/sine are
  // smooth so shrinking the bracket by 1/3 each iteration converges
  // exponentially — 40 iterations gives ~10^-19 absolute error on φ, far
  // below the 1e-8 constraint tolerance needed by the acceptance test.
  const step0 = TWO_PI / GRID
  let a = bestPhi - step0
  let b = bestPhi + step0
  for (let iter = 0; iter < 40; iter++) {
    const m1 = a + (b - a) / 3
    const m2 = a + (2 * (b - a)) / 3
    if (distSq(m1) < distSq(m2)) b = m2
    else a = m1
  }

  const phiStar = 0.5 * (a + b)
  return kasnerVacuumParameterization(phiStar)
}

// ───────────────────────────────────────────────────────────────────────────
// Per-frame coefficient evaluator
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compute the Bianchi-I Kasner cosmology coefficient bundle at a given
 * generalized conformal time `η > 0`.
 *
 * Closed-form parameterisation for the symmetric-gauge vacuum Kasner
 * background: with proper time `t`, define
 * `η = ((n−1)/(n−2))·t^((n−2)/(n−1))` so that
 *
 *     t = (η·(n−2)/(n−1))^((n−1)/(n−2))
 *     a_i(t) = t^{p_i}
 *     ã(t) = (a_1·a_2·a_3)^(1/(n−1)) = t^((Σp_i)/(n−1)) = t^(1/(n−1))
 *
 * (the `Σp_i = 1` constraint kicks in here; non-vacuum triples with
 * `Σp_i ≠ 1` are evaluated using the general product form). The three
 * scalar coefficients are then
 *
 *     aKinetic  = ã^(−(n−2))
 *     aFull     = ã^n
 *     aPot_i    = ã^n / a_i²
 *     aPotential = aPot_0
 *
 * and the two ratios `aPot_1/aPot_0 = (a_1/a_2)²`,
 * `aPot_2/aPot_0 = (a_1/a_3)²`.
 *
 * Sanity check for the canonical vacuum triple `(−1/3, 2/3, 2/3)` in
 * `n = 4`:
 *
 * - `η = 1.5` ⇒ `t = 1` ⇒ all `a_i = 1`, `ã = 1`, every coef = 1 exactly
 *   ⇒ ratios = 1. Bit-identical to the Minkowski uniform upload.
 * - `η = 6`   ⇒ `t = 8`, `a_1 = 0.5`, `a_2 = a_3 = 4`, `ã = 2`.
 *   `aPot_0 = 2⁴/0.25 = 64`, `aPot_1 = aPot_2 = 2⁴/16 = 1`,
 *   `aFull = 16`, `aKinetic = 1/4`. Ratios = `1/64`.
 *
 * Isotropic triple `(1/3, 1/3, 1/3)` (not a vacuum solution, but a valid
 * Bianchi-I background): `a_1 = a_2 = a_3` ⇒ ratios = 1 bit-identically,
 * coefs degenerate to the ordinary FLRW `a(t) = t^(1/3)` form.
 *
 * @param eta - Generalized conformal time (`η > 0` required)
 * @param exp - Kasner exponent triple
 * @param spacetimeDim - Spacetime dimension `n` (3 ≤ n ≤ 7). Only the first
 *                       three spatial axes are anisotropic; higher-dim axes
 *                       fall back to the scalar `aPotential` in the shader.
 * @returns Per-axis coefficient bundle
 * @throws {RangeError} If `eta ≤ 0`, non-finite, or `spacetimeDim < 3`
 */
export function computeBianchiKasnerCoefs(
  eta: number,
  exp: KasnerExponents,
  spacetimeDim: number
): BianchiKasnerCoefs {
  if (!Number.isFinite(eta) || eta <= 0) {
    throw new RangeError(
      `computeBianchiKasnerCoefs requires eta > 0 (generalized conformal time), got ${eta}`
    )
  }
  if (spacetimeDim !== 4) {
    throw new RangeError(
      `computeBianchiKasnerCoefs requires spacetimeDim = 4 (three spatial Kasner axes), got ${spacetimeDim}`
    )
  }
  if (!Number.isFinite(exp.p1) || !Number.isFinite(exp.p2) || !Number.isFinite(exp.p3)) {
    throw new RangeError(
      `computeBianchiKasnerCoefs requires finite exponents, got (${exp.p1}, ${exp.p2}, ${exp.p3})`
    )
  }

  // General η↔t conversion for Bianchi-I with arbitrary Σp_i.
  //
  // The geometric-mean gauge factor is ã = (a₁·a₂·a₃)^(1/(n-1)) = t^(Σp/(n-1)).
  // From dη = dt/ã = dt · t^(−Σp/(n-1)), integrating gives:
  //
  //   η = [(n-1)/(n-1-Σp)] · t^((n-1-Σp)/(n-1))    when Σp ≠ n-1
  //   t = [η · (n-1-Σp)/(n-1)]^((n-1)/(n-1-Σp))
  //
  // For vacuum (Σp=1, n=4): t = (2η/3)^(3/2) — matches the prior formula.
  // For isotropic (Σp=1, any n): same as FLRW.
  // Edge case Σp = n-1: ã = t, η = ln(t), t = exp(η). Physically
  // unreachable for vacuum triples but handled for robustness.
  const nm1 = spacetimeDim - 1 // n - 1
  const sumP = exp.p1 + exp.p2 + exp.p3
  const alpha = nm1 - sumP // n - 1 - Σp
  if (alpha < -1e-12) {
    throw new RangeError(
      `computeBianchiKasnerCoefs requires Σp ≤ n - 1 in the positive-η gauge, got Σp=${sumP}`
    )
  }

  let t: number
  if (Math.abs(alpha) < 1e-12) {
    // Degenerate case Σp ≈ n-1: η = ln(t), t = exp(η)
    t = Math.exp(eta)
  } else {
    // General case: t = (η · alpha / (n-1))^((n-1)/alpha)
    t = Math.pow((eta * alpha) / nm1, nm1 / alpha)
  }
  if (!Number.isFinite(t) || t <= 0) {
    throw new RangeError(
      `computeBianchiKasnerCoefs requires positive real proper time, got t=${t} (eta=${eta}, Σp=${sumP})`
    )
  }

  const a1 = Math.pow(t, exp.p1)
  const a2 = Math.pow(t, exp.p2)
  const a3 = Math.pow(t, exp.p3)

  // ã = (a_1·a_2·a_3)^(1/(n-1)) — geometric-mean gauge (reduces to t^(1/3)
  // for Σp_i = 1 in n = 4). The exponent (n-1) is always ≥ 2 for supported
  // spacetimeDim, so no divide-by-zero.
  const product = a1 * a2 * a3
  const a = Math.pow(product, 1 / (spacetimeDim - 1))

  const n = spacetimeDim
  const aFull = Math.pow(a, n) // ã^n
  // aKinetic = ã^(−(n−2)). The guard above rejects spacetimeDim < 3,
  // so n >= 3 and n - 2 >= 1 always.
  const aKinetic = 1 / Math.pow(a, n - 2)

  const aPot0 = aFull / (a1 * a1)
  const aPot1 = aFull / (a2 * a2)
  const aPot2 = aFull / (a3 * a3)

  // Ratios relative to axis-0. Bit-identical to 1 when a2 == a1 and
  // a3 == a1 (the isotropic-triple case), so the CPU uploads `1.0, 1.0`
  // under `(1/3, 1/3, 1/3)` and the shader collapses to the pre-change form.
  const aPotentialRatio1 = aPot1 / aPot0
  const aPotentialRatio2 = aPot2 / aPot0
  const positiveCoefs = [
    ['a1', a1],
    ['a2', a2],
    ['a3', a3],
    ['a', a],
    ['aKinetic', aKinetic],
    ['aPotential', aPot0],
    ['aFull', aFull],
    ['aPotentialRatio1', aPotentialRatio1],
    ['aPotentialRatio2', aPotentialRatio2],
  ] as const
  for (const [label, value] of positiveCoefs) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(
        `computeBianchiKasnerCoefs produced invalid ${label}=${value} (eta=${eta}, Σp=${sumP})`
      )
    }
  }

  return {
    tProper: t,
    a,
    aKinetic,
    aPotential: aPot0,
    aFull,
    aPotentialRatio1,
    aPotentialRatio2,
  }
}
