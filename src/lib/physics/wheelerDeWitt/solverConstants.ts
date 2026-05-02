/**
 * Magic-number constants and the rate-limited CFL-warning budget for the
 * Wheeler–DeWitt leapfrog solver.
 *
 * Extracted from `./solver.ts` so the orchestrator file is dominated by
 * physics rather than constant declarations. See `./solver.ts` for the
 * contract that links these constants to the leapfrog discretization;
 * the JSDoc on each symbol below documents the physical / numerical
 * justification.
 *
 * @module lib/physics/wheelerDeWitt/solverConstants
 */

/**
 * Advisory CFL threshold for the Lorentzian bulk `da²·(1/aMin²)·8/dphi²`.
 *
 * **Phase 3 note**: the bulk is now propagated with semi-implicit
 * Crank–Nicolson (via ADI, see `./implicitBulk`), which is
 * unconditionally stable — the CFL number no longer bounds a stability
 * envelope. The warning is retained as an **accuracy** hint: at high
 * CFL the trapezoidal scheme is still second-order but resolves high-k
 * dynamics less faithfully (numerical dispersion grows as `(κ·|λ_k|)²`).
 * The threshold `4` is kept for backwards compatibility with the pre-Phase-3
 * diagnostic and as an order-of-magnitude indicator; exceeding it does
 * not imply instability.
 */
export const WDW_CFL_BUDGET = 4

/**
 * Rate-limit the CFL warning so interactive parameter sweeps do not spam
 * the console. Each call to `solveWheelerDeWitt` consults + mutates this
 * counter through the {@link WDW_CFL_WARN_BUDGET} object so tests can
 * reset it via {@link resetCflWarningBudget} and assert behaviour
 * deterministically.
 */
interface CflWarningBudget {
  remaining: number
}

export const WDW_CFL_WARN_DEFAULT = 3
export const WDW_CFL_WARN_BUDGET: CflWarningBudget = { remaining: WDW_CFL_WARN_DEFAULT }

/**
 * Test helper: reset the CFL-warning budget to the initial value so
 * subsequent solves can observe the warning again. Safe to call from
 * production code — the default budget is small and exhausting it is
 * benign. Exported so the shared module state does not leak between
 * tests.
 */
export function resetCflWarningBudget(budget: number = WDW_CFL_WARN_DEFAULT): void {
  WDW_CFL_WARN_BUDGET.remaining = Math.max(0, Math.floor(budget))
}

/**
 * Soft absorber strength for the transition-band Euclidean cells (cells
 * with `0 < U` and WKB phase since turning below
 * {@link WDW_WKB_MATCH_PHASE_THRESHOLD}). At each leapfrog step, those
 * cells are multiplied by `exp(−η·√U·da)` to suppress the numerical
 * growing branch that the explicit scheme inherits from any boundary
 * data imperfectly projected onto the decaying branch.
 *
 * `η = 1.0` cancels the 1D WKB growth rate of the growing branch
 * exactly. The absorber is NOT branch-selective: it damps both branches
 * equally. In the transition band this is acceptable because it is a
 * narrow region near the turning surface; the physical amplitude there
 * is O(1) and the exp(−√U·da) damping is weak since √U is small near
 * `U = 0`. Deep-band cells bypass the absorber entirely — they receive
 * the analytic WKB propagator output instead.
 */
export const WDW_EUCLIDEAN_ABSORBER_ETA = 1.0

/**
 * Width (in grid cells) of the φ-boundary absorbing sponge layer.
 * Waves reaching the outer φ-cells are damped by a quadratic-profile
 * exponential `exp(−γ_max · d²)` per leapfrog step, where
 * `d = (cells from sponge inner edge) / spongeWidth ∈ [0, 1]`.
 *
 * **Phase 3 retune** (docs/physics/wdw-bulk-stability.md): dropped from
 * 5 to 3. The semi-implicit CN bulk propagator damps high-k noise in
 * the interior on its own (factor `1/(1 + κ̂·|λ_k|)` per step with
 * `κ̂·|λ_k| ~ O(1)` at `k = N/2`), so the sponge no longer needs to
 * double as a noise filter — it only has to absorb legitimately
 * outgoing bulk modes at the domain boundary. A narrower layer leaves
 * more cells in the unity-factor interior for the symmetry-preservation
 * test. The sponge is NOT applied to the initial slabs (`ia = 0, 1`):
 * they carry the physical boundary condition exactly, and damping them
 * would re-introduce the φ-translation-symmetry-breaking perturbation
 * the Phase 3 rewrite removed.
 */
export const WDW_PHI_SPONGE_WIDTH = 3

/**
 * Per-step peak damping rate at the outermost φ-cell. The effective
 * damping at cell `k` from the grid edge (k=0 at the edge) is
 * `exp(−γ_max · ((spongeWidth − k) / spongeWidth)²)`.
 *
 * **Phase 3 retune**: raised from 0.15 to 0.45 — heavier absorption to
 * compensate for the narrower layer. Total damping over `N_a = 128`
 * steps at the outermost cell is `exp(−0.45 · 128) ≈ 10⁻²⁵`; the
 * innermost sponge cell (depth = W-1 out of W=3) sees
 * `exp(−0.45 · (1/3)² · 128) = exp(−6.4) ≈ 10⁻³` per full march —
 * enough one-sided attenuation to damp outgoing waves without creating
 * a texture-visible boundary.
 */
export const WDW_PHI_SPONGE_GAMMA = 0.45

/**
 * WKB-phase threshold past the Lorentzian-Euclidean turning surface at
 * which the analytic decaying-branch propagator takes over from the
 * numerical leapfrog.
 *
 * Threshold is expressed as the dimensionless WKB phase change since
 * the turning point:
 *
 *   phase_since_turning(a, φ) = (2/3) · √α(φ) · (a − a_turn(φ))^{3/2}
 *
 * where `α(φ) = ∂_a U|_{a_turn(φ)} = 2 · c_U · a_turn(φ)`. At
 * `phase = 2.0` the Airy asymptotic form is good to within ~1% of the
 * next-to-leading WKB correction, which is well below the amplitude
 * scale of the rendered density. Cells below this threshold receive the
 * numerical leapfrog + absorber (transition band); cells at or above
 * receive the analytic exp(−S_Euc) propagator from the per-column match
 * coefficient captured at the first threshold crossing.
 *
 * Raising the threshold widens the transition band and improves
 * near-turning fidelity at the cost of admitting more numerical
 * residual. Lowering it narrows the band and hands more of the march to
 * the analytic propagator at the cost of WKB-breakdown near the
 * turning surface (prefactor `U^{−1/4}` diverges as `U → 0`).
 */
export const WDW_WKB_MATCH_PHASE_THRESHOLD = 2.0
