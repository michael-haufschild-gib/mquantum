/**
 * Shared Wheeler–DeWitt physics constants and the operator `U(a, φ)`.
 *
 * This is the normative source of truth for the minisuperspace numerical
 * model. The solver, the boundary-condition builders, the Hamilton–Jacobi
 * operator, the density grid packer, and the residual check all consult
 * this module so a change to a physical constant propagates everywhere
 * without silent divergence between files.
 *
 * ## Units and conventions
 *
 * All quantities use `G = ℏ = c = 1` natural units.
 *
 * The solver works with the reduced wavefunction `χ = a^{3/2} Ψ` where
 * `Ψ(a, φ₁, φ₂)` is the physical Wheeler–DeWitt amplitude. The `a^{3/2}`
 * Jacobian is the standard conformal-minimal ordering — it removes the
 * first-derivative in `a` from the WdW equation so the leapfrog integrator
 * sees a pure second-order hyperbolic/elliptic operator.
 *
 * Reduced Wheeler–DeWitt equation:
 *
 *     [ −∂²_a + (1/a²)(∂²_{φ₁} + ∂²_{φ₂}) + U(a, φ) ] χ = 0
 *
 * with
 *
 *     U(a, φ) = −c_U·a²·(1 − (8πG/3)·a²·V(φ))
 *     V(φ)   = ½m²(φ₁²+φ₂²) + Λ
 *     c_U    = 36 π²
 *
 * The sign convention is: `U < 0` defines the Lorentzian (classically
 * allowed) region of minisuperspace; `U > 0` defines the Euclidean
 * (classically forbidden) region. The Hartle–Hawking, Vilenkin, and DeWitt
 * proposals all agree on this sign convention.
 *
 * ## Deep-Euclidean analytic tail
 *
 * Inside the forbidden region the reduced WdW equation admits an
 * exponentially-growing WKB branch that the explicit leapfrog cannot
 * cleanly suppress. The solver therefore splits the Euclidean region at
 * a per-column phase threshold (see `WDW_WKB_MATCH_PHASE_THRESHOLD` in
 * `./solver`) into a transition band (numerical leapfrog + soft
 * absorber) and a deep band (analytic 1D WKB propagator).
 *
 * Helpers on the deep-band side:
 *
 *  - {@link wdwTurningA} returns the scale-factor turning surface
 *    `a_turn(φ)` where `U(a, φ) = 0`, or `null` if `V(φ) ≤ 0`.
 *  - {@link wdwEuclideanWkbAction} returns the 1D WKB eikonal action
 *    `S_Euc(a, φ) = ∫_{a_turn}^{a} √U(a', φ) da'` in closed form for
 *    `a > a_turn`, vanishing at the turning surface.
 *
 * @module lib/physics/wheelerDeWitt/constants
 */

/** `8 π G / 3` with `G = 1`. Appears in both `U(a, φ)` and the
 * Hartle–Hawking WKB derivative used by the no-boundary initial slab. */
export const WDW_G_PREFACTOR = (8 * Math.PI) / 3

/** Potential prefactor `c_U = 36 π²` in `U(a, φ) = −c_U·a²·(…)`. */
export const WDW_C_U = 36 * Math.PI * Math.PI

/**
 * Inflaton potential `V(φ₁, φ₂) = ½m²(φ₁²+φ₂²) + Λ`. Real scalar.
 *
 * @param phi1 - First inflaton coordinate.
 * @param phi2 - Second inflaton coordinate.
 * @param m - Inflaton mass `m`.
 * @param lambda - Cosmological constant `Λ`.
 * @returns Potential value in natural units.
 */
export function wdwPotential(phi1: number, phi2: number, m: number, lambda: number): number {
  return 0.5 * m * m * (phi1 * phi1 + phi2 * phi2) + lambda
}

/**
 * Operator potential `U(a, φ) = −c_U·a²·(1 − (8πG/3)·a²·V(φ))`.
 * Lorentzian (classically allowed) region corresponds to `U < 0`.
 *
 * This is the ONE `U` implementation in the codebase; both the solver's
 * leapfrog and the HJ operator builders call into it so the two numerical
 * models can never disagree by accident.
 *
 * @param a - Scale factor.
 * @param phi1 - First inflaton coordinate.
 * @param phi2 - Second inflaton coordinate.
 * @param m - Inflaton mass.
 * @param lambda - Cosmological constant.
 * @returns `U(a, φ)` in natural units.
 */
export function wdwU(a: number, phi1: number, phi2: number, m: number, lambda: number): number {
  const V = wdwPotential(phi1, phi2, m, lambda)
  const a2 = a * a
  return -WDW_C_U * a2 * (1 - WDW_G_PREFACTOR * a2 * V)
}

/**
 * Scale-factor turning surface `a_turn(φ)` where `U(a_turn, φ) = 0`.
 *
 * Solving `−c_U·a²·(1 − K·V·a²) = 0` for `a > 0` with `K = 8πG/3`:
 * non-trivial root is `a_turn = 1/√(K·V(φ))`, which exists only when
 * `V(φ) > 0`. For `V(φ) ≤ 0` the column has `U < 0` everywhere (pure
 * Lorentzian) and no turning surface exists; callers should fall back to
 * the numerical leapfrog.
 *
 * @param phi1 - First inflaton coordinate.
 * @param phi2 - Second inflaton coordinate.
 * @param m - Inflaton mass.
 * @param lambda - Cosmological constant.
 * @returns `a_turn(φ)` or `null` if the column has no turning surface.
 */
export function wdwTurningA(phi1: number, phi2: number, m: number, lambda: number): number | null {
  const V = wdwPotential(phi1, phi2, m, lambda)
  if (V <= 0) return null
  return 1 / Math.sqrt(WDW_G_PREFACTOR * V)
}

/**
 * One-dimensional WKB eikonal action in the Euclidean region of a
 * φ-column, `S_Euc(a, φ) = ∫_{a_turn}^{a} √U(a', φ) da'`.
 *
 * Closed-form derivation:
 *
 *   √U = √c_U · a · √(K·V·a² − 1)           (U > 0 in Euclidean region)
 *   ⇒  ∫ √U da = √c_U / (3·K·V) · (K·V·a² − 1)^{3/2}
 *              = (3 / (4·V)) · (K·V·a² − 1)^{3/2}           (since √c_U = 6π, K = 8π/3)
 *
 * Returns `0` at or below the turning surface, which is the natural
 * boundary for the integral. The caller is responsible for restricting
 * use to cells with `U(a, φ) > 0`.
 *
 * This is the 1D eikonal action (from the pure-`a` WKB ansatz with the
 * `φ`-Laplacian treated as a subleading perturbation). It is **not** the
 * minisuperspace instanton action used by the Hartle-Hawking boundary
 * generator at `a = a_min`; those are different quantities valid in
 * different regions of the problem.
 *
 * @param a - Scale factor at which to evaluate the action.
 * @param phi1 - First inflaton coordinate.
 * @param phi2 - Second inflaton coordinate.
 * @param m - Inflaton mass.
 * @param lambda - Cosmological constant.
 * @returns `S_Euc(a, φ) ≥ 0` in natural units.
 */
export function wdwEuclideanWkbAction(
  a: number,
  phi1: number,
  phi2: number,
  m: number,
  lambda: number
): number {
  const V = wdwPotential(phi1, phi2, m, lambda)
  if (V <= 0) return 0
  const KVa2 = WDW_G_PREFACTOR * V * a * a
  if (KVa2 <= 1) return 0
  return (3 / (4 * V)) * Math.pow(KVa2 - 1, 1.5)
}

/**
 * Lorentzian-side counterpart of {@link wdwEuclideanWkbAction}:
 * `S_L(a, φ) = ∫_a^{a_turn} √|U(a', φ)| da'` evaluated in closed form on
 * the side `a < a_turn` where `U < 0` (the classically-allowed region).
 *
 * Derivation parallels the Euclidean case but with `(1 − KVa²)` in place
 * of `(KVa² − 1)`:
 *
 *   √|U| = √c_U · a · √(1 − KVa²)            (Lorentzian, a < a_turn)
 *   ⇒  S_L(a) = (3 / (4·V)) · (1 − KVa²)^{3/2}
 *
 * Returns `0` at or above the turning surface (the natural integration
 * boundary). For columns with `V ≤ 0` the integral has no turning point
 * and the function returns `0` — callers should treat such columns as
 * pure-Lorentzian (no Airy connection).
 *
 * Together with {@link wdwEuclideanWkbAction}, this is the input to the
 * signed Langer variable used by the Airy uniform asymptotic
 * (`{@link ./airyConnection}`).
 *
 * Note: this function returns the action *measured from the turning
 * surface*, the convention required by the Langer connection. The
 * "integrated phase from `a = 0`" convention used by analytic-fixture
 * comparisons (Λ ≤ 0 included) is exposed separately as
 * {@link wdwLorentzianWkbPhase} so the two consumers cannot drift.
 *
 * @param a - Scale factor at which to evaluate the action.
 * @param phi1 - First inflaton coordinate.
 * @param phi2 - Second inflaton coordinate.
 * @param m - Inflaton mass.
 * @param lambda - Cosmological constant.
 * @returns `S_L(a, φ) ≥ 0` in natural units.
 */
export function wdwLorentzianWkbAction(
  a: number,
  phi1: number,
  phi2: number,
  m: number,
  lambda: number
): number {
  const V = wdwPotential(phi1, phi2, m, lambda)
  if (V <= 0) return 0
  const KVa2 = WDW_G_PREFACTOR * V * a * a
  if (KVa2 >= 1) return 0
  return (3 / (4 * V)) * Math.pow(1 - KVa2, 1.5)
}

/**
 * Integrated Lorentzian-side WKB phase `Φ_L(a, φ) = ∫_0^a √|U(a', φ)|
 * da'` valid across all three minisuperspace regimes (`V > 0`, `V = 0`,
 * `V < 0`). Unlike {@link wdwLorentzianWkbAction} (which is
 * Langer-anchored at the turning surface), this function is anchored at
 * `a = 0` — the natural reference point for comparing the solver's
 * `arg(χ(a))` against the analytic Bessel/Hankel asymptotic phase
 * (see {@link ./analyticFixtures}).
 *
 * Closed forms by `V` sign:
 *
 *  - **dS (V > 0)**: `√|U| = 6π·a·√(1 − KVa²)` for `a < a_turn`. Then
 *    `Φ_L(a) = (3/(4V))·(1 − (1 − KVa²)^{3/2})`. For `a ≥ a_turn` the
 *    Lorentzian phase saturates at `Φ_L(a_turn) = 3/(4V)`.
 *  - **Free (V = 0)**: `√|U| = 6π·a`, so `Φ_L(a) = 3π·a²`. This pins
 *    the leading WKB phase of the Weber-equation Bessel asymptotic
 *    `χ ∝ √a · H_{1/4}^{(1)}(3π·a²)` ⇒ phase ≈ 3π·a² − π/4·(2·1/4+1)
 *    at large `a`.
 *  - **AdS (V < 0)**: `√|U| = 6π·a·√(1 + K|V|·a²)` everywhere. Then
 *    `Φ_L(a) = (3/(4|V|))·((1 + K|V|·a²)^{3/2} − 1)`.
 *
 * @param a - Scale factor at which to evaluate the phase.
 * @param phi1 - First inflaton coordinate.
 * @param phi2 - Second inflaton coordinate.
 * @param m - Inflaton mass.
 * @param lambda - Cosmological constant.
 * @returns `Φ_L(a, φ) ≥ 0` in natural units.
 */
export function wdwLorentzianWkbPhase(
  a: number,
  phi1: number,
  phi2: number,
  m: number,
  lambda: number
): number {
  const V = wdwPotential(phi1, phi2, m, lambda)
  if (V > 0) {
    const KVa2 = WDW_G_PREFACTOR * V * a * a
    if (KVa2 >= 1) return 3 / (4 * V)
    return (3 / (4 * V)) * (1 - Math.pow(1 - KVa2, 1.5))
  }
  if (V === 0) {
    return 3 * Math.PI * a * a
  }
  const absV = -V
  const KabsVa2 = WDW_G_PREFACTOR * absV * a * a
  return (3 / (4 * absV)) * (Math.pow(1 + KabsVa2, 1.5) - 1)
}

/**
 * Signed Langer variable `ζ(a, φ)` for the uniform Airy asymptotic. Encoded
 * so that the standard Langer formula
 *
 *   χ(a) = (ζ / U)^{1/4} · [c₁ · Ai(ζ) + c₂ · Bi(ζ)]
 *
 * gives a real prefactor `(ζ / U)^{1/4}` and reduces to the leading-WKB
 * form as `|ζ| → ∞`:
 *
 *   ζ < 0 in the Lorentzian region (`a < a_turn`):
 *     `ζ = −((3/2) · S_L(a, φ))^{2/3}`,
 *     so that `(2/3)·|ζ|^{3/2} = S_L`.
 *   ζ > 0 in the Euclidean region (`a > a_turn`):
 *     `ζ = +((3/2) · S_E(a, φ))^{2/3}`,
 *     so that `(2/3)·|ζ|^{3/2} = S_E`.
 *
 * For columns with `V ≤ 0` (no turning surface) the function returns `0`;
 * callers should not use the Langer formula in that case.
 *
 * @param a - Scale factor.
 * @param phi1 - First inflaton coordinate.
 * @param phi2 - Second inflaton coordinate.
 * @param m - Inflaton mass.
 * @param lambda - Cosmological constant.
 * @returns Signed Langer variable `ζ`.
 */
export function wdwLangerVariable(
  a: number,
  phi1: number,
  phi2: number,
  m: number,
  lambda: number
): number {
  const V = wdwPotential(phi1, phi2, m, lambda)
  if (V <= 0) return 0
  const KVa2 = WDW_G_PREFACTOR * V * a * a
  if (KVa2 >= 1) {
    const SE = (3 / (4 * V)) * Math.pow(KVa2 - 1, 1.5)
    return Math.pow(1.5 * SE, 2 / 3)
  }
  const SL = (3 / (4 * V)) * Math.pow(1 - KVa2, 1.5)
  return -Math.pow(1.5 * SL, 2 / 3)
}
