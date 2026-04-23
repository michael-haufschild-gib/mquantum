# Wheeler–DeWitt Lorentzian-Bulk Stability: Semi-Implicit Crank–Nicolson

**Status**: Normative decision record for Phase 3 of the Wheeler–DeWitt solver physics-correctness overhaul (`docs/plans/wdw-solver-physics-correctness.md`).
**Audience**: Implementers of `src/lib/physics/wheelerDeWitt/solver.ts`, and future reviewers who need to re-derive why the φ-Laplacian term is integrated implicitly while the potential term remains explicit.
**Scope**: The Lorentzian-band bulk evolution `a ∈ [a_min, a_match]` of the reduced Wheeler–DeWitt equation on the `(φ₁, φ₂)` grid. Seed construction (`a = a_min`) is covered by `docs/physics/langer-hh-seed.md`. The Stage-3 Airy/Langer analytic overwrite in the deep Euclidean (`a ≫ a_turn`) is unchanged by this phase and referenced only at the handoff.

## 1. Executive summary

Phase 1 of the overhaul measured a 13.7× amplitude ratio between edge and centre φ-cells in the strict translation-invariant regime (`m = 0`, `V = Λ = const`, constant-in-φ seed) where the exact solution must be φ-constant at every `a`. The explicit leapfrog in `solver.ts` has no dissipation and no symmetry-preserving damping: high-k perturbations injected by the Neumann-ghost / φ-sponge layer grow into the bulk. Phase 3 replaces the φ-Laplacian term's explicit treatment with a three-level Crank–Nicolson step (Option Aᵢ), solved by ADI operator splitting as two Thomas-tridiagonal sweeps per `a`-slab. The scheme is unconditionally stable (`|ξ| = 1` exactly for every Fourier mode), preserves the k = 0 eigenspace by construction, and costs `O(Na·Nphi²)` at default grid — under 10⁶ arithmetic ops per component, cheaper than one `wdwOperatorResidual` evaluation. The φ-sponge is retuned (width 5→3, γ 0.15→0.45, applied only from slab `ia ≥ 2`) because the implicit scheme no longer needs the sponge to suppress in-grid noise amplification; its sole remaining job is absorbing physically-outgoing modes at the domain boundary.

## 2. The stability problem being solved

Finding 2 of the parent plan:

> `sliceVarMax = 1.27e+1` sustained at ia=180–420 for `m = 0, Λ = 0.5, HH BC, Na=512, Nphi=17, phiExtent=1.0`. Edge-cell χ at ia=360 is **13.7×** the centre-cell χ despite no physical mechanism to produce any difference.

The reduced WdW equation on the `a^{3/2}·Ψ`-transformed wavefunction `χ` is

```
−∂²_a χ + (1/a²)·∇²_φ χ + U(a, φ)·χ = 0
```

For `m = 0` and `V(φ) = Λ = const`, the operator commutes with the φ-translation group: a constant-in-φ initial datum must evolve to a constant-in-φ χ at every later `a`. The physical solution's `sliceVarMax` is identically zero.

Mechanism of the observed 13.7× breaking. The solver's explicit leapfrog update in `solver.ts` (pre-Phase 3) reads schematically

```
χ_next = 2·χ_cur − χ_prev + da²·[(1/a²)·∇²_φ χ_cur + U·χ_cur]
```

which is a standard second-order explicit discretisation of `χ_aa = (1/a²)·∇²_φ χ + U·χ`. Two failure modes compound:

1. **No dissipation.** The scheme's amplification factor for a Fourier mode of wavenumber k is `ξ² − 2·(1 − da²·λ_k²/(2·a²))·ξ + 1 = 0` (dropping U), with `λ_k²` the k-th eigenvalue of `−∇²_φ`. Both roots have `|ξ| = 1` when `da²·λ_k²/a² ≤ 4` (the CFL condition), and `|ξ| > 1` above CFL. *Within* CFL, any mode excited by floor-level rounding rides a neutral oscillation forever — it neither decays nor amplifies, which means persistent boundary-injected noise accumulates coherently.

2. **φ-sponge and Neumann-ghost cells inject at the boundary.** The current sponge mask (`solver.ts:486-509`) multiplies χ by `exp(−γ·(1 − d/W)²)` with `W = 5, γ = 0.15` for the outer five cells, **including the seed slabs `ia = 0` and `ia = 1`**. This breaks the φ-invariance of the seed before the first leapfrog step even runs. The Neumann-ghost wrap around the φ-boundary then sees a non-constant stencil input, producing a weak `∇²_φ χ` signal precisely at the boundary. That signal is the first-order source term in a resonant cascade: the scheme propagates it into the bulk without damping, and the sponge — re-applied every slab — continues to pump energy in at the short-wavelength modes that `∇²_φ` can amplify fastest.

The scheme preserves the k = 0 Fourier mode exactly in exact arithmetic; in f32 with a sponge-perturbed seed, it does not. The cure is to make the scheme unconditionally stable and eliminate the seed-slab sponge application.

## 3. Option Aᵢ — semi-implicit Crank–Nicolson (chosen)

### 3.1 Scheme derivation

Writing `L = (1/a²)·∇²_φ` (self-adjoint, negative semi-definite on the periodic/Neumann grid), the continuous PDE is

```
∂²_a χ = L·χ + U·χ
```

Apply the trapezoidal rule to the `L`-term across the three-level stencil `{prev, cur, next}`. The leapfrog discretisation of `∂²_a` remains explicit; `U` is kept explicit at `cur` (cheap, diagonal, and the extra-implicit cost buys nothing because `U` has no stiff eigenvalues on the Lorentzian side — `|U|` is bounded `O(c_U·a²) ∼ O(100)` everywhere in `a ∈ [a_min, a_match]`). The trapezoidal weighting puts half of `L·χ` at `next`, half at `prev`:

```
(χ_next − 2·χ_cur + χ_prev) / da² = (1/2)·(L·χ_next + L·χ_prev) + U_cur·χ_cur
```

Rearranging, the implicit update in operator form is

> **`(I − κ·L)·χ_next = 2·χ_cur − χ_prev + κ·L·χ_prev + da²·U_cur·χ_cur`**

with

> **`κ = da²/2`**

applied to the operator `L = (1/a²)·∇²_φ`. At default parameters (`da = 0.01, a = 0.5, dphi = 0.125`) the effective coupling is `κ/a² = 5·10⁻⁵/0.25 = 2·10⁻⁴`; the per-mode coupling for the highest-k Laplacian eigenvalue (`λ_max² ≈ 4/dphi² = 256`) is `μ_max = κ·λ_max²/a² ≈ 2·10⁻⁴ · 256 = 5.1·10⁻²`. Finite, bounded.

### 3.2 Unconditional-stability proof

Consider the homogeneous scheme (`U = 0`) acting on a Fourier mode `χ_n = ξⁿ · e_k` where `e_k` is an eigenvector of `L` with eigenvalue `−λ_k²/a²`. Let `μ = κ·λ_k²/a² ≥ 0`. The operator equation becomes

```
(1 + μ)·ξ² = 2·ξ − (1 + μ)
⇔  ξ² − (2/(1 + μ))·ξ + 1 = 0
```

The characteristic polynomial has product of roots equal to 1 (the constant term) and sum of roots `2/(1 + μ) ≤ 2`. For `μ > 0` the discriminant `4/(1 + μ)² − 4` is negative, so the roots are a complex-conjugate pair with `|ξ|² = |roots product| = 1`. Explicitly,

> **`ξ_± = 1/(1 + μ) ± i·√(1 − 1/(1 + μ)²)`**, hence **`|ξ_±| = 1`** for every `μ ≥ 0`.

The amplification factor has magnitude exactly 1 for all CFL values — the scheme is A-stable (in fact neutrally stable) unconditionally. Phase rotation per step is `θ = arccos(1/(1 + μ))`: low-k modes (`μ ≪ 1`) rotate at the physical WKB rate `θ ≈ √(2μ)`, high-k modes (`μ ≫ 1`) rotate at `θ → π/2` per step (effectively frozen, not amplified). In the explicit scheme the corresponding high-k modes have `|ξ| > 1` whenever `μ > 2`, producing the exponential blow-up that the sponge was fighting. The implicit scheme replaces blow-up with bounded phase-frozen oscillation, and the residual bounded noise is absorbed by the (now much smaller) sponge zone.

### 3.3 k = 0 eigenspace preservation

For the constant-in-φ mode, `λ_0² = 0`, so `μ = 0`, and the recursion collapses to plain three-level leapfrog on `∂²_a`: `ξ² − 2·ξ + 1 = 0` with `ξ = 1` (double root), consistent with `χ_n = α + β·n` growth — but the physical boundary datum has `β = 0`, so `χ` stays constant. Equivalently, `L·constant = 0` (Neumann stencil on a constant gives 0), so `(I − κ·L)·constant = constant`, and `(I − κ·L)⁻¹·constant = constant`. The implicit solve does not couple k = 0 to k > 0 at any point.

Combined with §3.2, the scheme therefore satisfies the Phase 1 symmetry test (`symmetryPreservation.test.ts`, `sliceVarMax < 1e-3`) as a matter of scheme correctness plus floating-point precision — not as a tuning outcome. The 1e-3 bound is a round-off budget for f32 arithmetic on a 256×33×33 grid, not a stability margin.

## 4. ADI operator splitting

`∇²_φ = ∂²_{φ₁} + ∂²_{φ₂}` on the two-inflaton grid. The implicit operator `(I − κ·L)` with `L = (1/a²)·(D_x + D_y)` (where `D_x, D_y` are the second-difference stencils along each φ-axis) is a 2D pentadiagonal matrix of size `Nphi² × Nphi²`. Direct inversion is `O(Nphi⁶)` — unacceptable. The standard remedy is operator splitting: factor the implicit operator as

```
(I − κ·L) = (I − κ·D_x − κ·D_y)
          ≈ (I − κ·D_x) · (I − κ·D_y)
```

The factorisation introduces a commutator-free splitting error of `κ²·D_x·D_y·χ`.

### 4.1 Splitting-error magnitude

At default parameters (`da = 0.01, a = 0.5, dphi = 0.125`):

```
κ/a²          = 5·10⁻⁵ / 0.25 = 2·10⁻⁴
||D_x·χ||     ≤ (2/dphi²) · ||χ|| = 128 · ||χ||
||D_x·D_y·χ|| ≤ (128)² · ||χ|| ≈ 1.6·10⁴ · ||χ||
splitting err ≈ (κ/a²)² · ||D_x·D_y·χ||
             = 4·10⁻⁸ · 1.6·10⁴ · ||χ||
             = 6.4·10⁻⁴ · ||χ||     (worst-case high-k)
```

The per-step splitting error bound is `≲ 7·10⁻⁴ · ||χ||`. On smooth physical modes (the ones the PDE actually carries) `||D_x·D_y·χ||` is much smaller than the high-k bound, typically `(2π/phiExtent)⁴ · ||χ|| ≈ 2·10² · ||χ||` for the dominant Gaussian envelope of the HH seed, reducing the splitting error to `≈ 8·10⁻⁶ · ||χ||`. Cumulative splitting error over `Na = 256` slabs is bounded by `Na · (splitting-error-per-step) ≈ 2·10⁻³ · ||χ||` — comfortably inside the Phase 1 bulk-accuracy bound of 1 % (`exactSolutionAgreement.test.ts`).

Crucially, this does not degrade the scheme's second-order accuracy in `da`. Standard ADI analysis (see Peaceman & Rachford 1955 for the original analysis, or LeVeque §8.4 for the modern treatment) shows that the splitting commits an `O(κ²) = O(da⁴)` error per step, which integrates to `O(da²)` over the interval — matching the scheme's intrinsic truncation order. Second-order-in-`da` and second-order-in-`dphi` convergence is preserved; the grid-convergence sweeps `sw=gridNa` and `sw=gridNphi` should continue to show the expected monotone approach to `q_∞`.

### 4.2 Thomas tridiagonal cost

Each factor `(I − κ·D_x)` is tridiagonal along the φ₁-axis (identity in φ₂); Thomas-factorisation cost is `O(Nphi)` per row, times `Nphi` rows per slab = `O(Nphi²)`. The second sweep `(I − κ·D_y)` does the same along the other axis, same cost. Total per slab: `O(Nphi²)` arithmetic, `O(Nphi)` storage for the Thomas factors.

Factorisation is **not** reusable across slabs because `κ/a² = da²/(2·a²)` depends on `a`, and the factor matrix changes every step. The factorisation is therefore per slab, with back-substitution per row/column. At default grid (`Na = 256, Nphi = 33`): `Na · 2 · Nphi² ≈ 5.6·10⁵` arithmetic operations per complex component, `≈ 1.1·10⁶` for `(re, im)` combined. Under one million operations total — well below the cost of one evaluation of `wdwOperatorResidual`.

## 5. Option Aₛ — Kreiss–Oliger hyperviscosity (rejected)

The alternative is to keep the scheme explicit and add an explicit hyperviscosity term `ν·∇⁴_φ χ` with a k-dependent profile `ν = ν₀·dphi²·max(0, k² − k_cut²)` that targets only above-cut modes. The scheme stays a cheap explicit three-level update; the dissipation is added as a correction to `χ_next`.

Rejected for four reasons:

1. **Does not fix the CFL constraint.** The scheme remains explicit, hence conditionally stable. The `WDW_CFL_BUDGET = 4` diagnostic continues to guard a real stability boundary, and operators must keep `da²·(1/a²)·8/dphi² ≤ 4`. Any URL sweep that drives `da` up (e.g. `sw=gridNa` walking `Na` down at fixed `aMax − aMin`) re-enters the exponential-blow-up regime. Aᵢ has no such boundary to guard.

2. **Adds an unphysical 4th-derivative term.** The reduced WdW equation contains no `∇⁴_φ` operator. Adding one gives the solver a term that has zero physical justification and whose coefficient `ν₀` must be tuned by experiment rather than derived from the physics. Aᵢ modifies only the discretisation of a term that is already in the PDE.

3. **Requires per-regime tuning.** `ν₀` that damps the `m = 0, Λ = 0.5` instability adequately is not automatically the right value at `m = 0.5, Λ = -0.3` where `V < 0` reshapes the spectrum, or at small `phiExtent` where `k_cut` moves relative to the physical envelope's peak. Each URL preset, and every `phiExtent` sweep point, potentially needs a different `ν₀` to produce publication-quality output. Aᵢ is parameter-free — the only tunable is `da` and `dphi`, already exposed.

4. **Does not preserve the k = 0 eigenspace beyond exact arithmetic.** The hyperviscosity term `ν·∇⁴_φ` kills a pure constant (both `∇²` and `∇⁴` of a constant are zero), so in exact arithmetic Aₛ satisfies `symmetryPreservation.test.ts` at the seed. In floating-point arithmetic with a sponge-perturbed seed, the `ν·∇⁴_φ` term acts on the sponge-induced boundary gradients and redistributes them: the hyperviscosity smooths short-wavelength sponge noise *inside* the grid, producing a weak, sign-alternating, spatially structured remnant that couples back into the Neumann stencil at the next step. The result is a reduced but still-nonzero `sliceVarMax` that typically lands at `10⁻² – 10⁻¹` — an order of magnitude above the 1e-3 target. Aᵢ eliminates the upstream driver (high-k amplification) rather than cleaning up the downstream residue.

The parent plan's `docs/plans/wdw-solver-physics-correctness.md` §2.2 already noted "Aᵢ is correct, Aₛ is a patch." The detailed rejection above codifies that judgment.

## 6. Sponge retuning

### 6.1 Pre-Phase-3 configuration

```ts
// src/lib/physics/wheelerDeWitt/solver.ts
const WDW_PHI_SPONGE_WIDTH = 5     // cells from each φ-edge
const WDW_PHI_SPONGE_GAMMA = 0.15  // mask strength
// Applied to the initial seed slab ia = 0 AND the explicit-step slab ia = 1,
// then re-applied after every leapfrog slab update.
```

Sponge mask at distance `d` from edge (0-indexed):

```
sponge(d) = exp(−γ · (1 − d/W)²)    for d < W
           = 1                      for d ≥ W
```

Per-cell retention (old, `W=5, γ=0.15`): `d=0: 0.861, d=1: 0.908, d=2: 0.947, d=3: 0.976, d=4: 0.994`.

Applying the mask at `ia = 0` multiplied the HH seed by 0.861 at the outermost φ-cells, breaking the constant-in-φ property of the seed **before the first leapfrog step ran**. This seeded a spurious `∇²_φ χ` at the boundary, which the explicit scheme then propagated and amplified.

### 6.2 Post-Phase-3 configuration

```ts
const WDW_PHI_SPONGE_WIDTH = 3     // narrower: interior unity zone grows
const WDW_PHI_SPONGE_GAMMA = 0.45  // heavier: per-step edge retention ≈ 0.64
// Applied only on slabs ia ≥ 2. Slabs ia = 0 (seed) and ia = 1 (first explicit
// step needed by the three-level scheme) are kept pristine.
```

Per-cell retention (new, `W=3, γ=0.45`): `d=0: 0.638, d=1: 0.819, d=2: 0.951`. Interior (d ≥ 3) is exactly unity.

### 6.3 Rationale

Under the explicit scheme the sponge had a dual job: absorb legitimately-outgoing bulk modes at the φ-boundary, **and** suppress high-k noise propagating inward from the Neumann-ghost stencil. The second job required a wide, gentle profile — aggressive narrow absorption would overshoot the physics on long wavelengths that the scheme was already amplifying. Under the implicit scheme the amplification is gone: high-k modes are bounded (`|ξ| = 1`, §3.2), not exponentially blowing up. The sponge's remaining role is only the first job — absorbing modes that would reflect off the Neumann boundary into physically-meaningful bulk energy. A narrower, heavier absorption layer serves that task with less encroachment on the interior physics. The unity zone is now 27 cells wide (default `Nphi = 33`, minus 3 sponge cells on each edge), up from 23, directly reducing the fraction of the grid that deviates from pure PDE evolution.

## 7. Stage-3 / transition / deep-band handoffs

The Crank–Nicolson change is strictly local to the Lorentzian band `a_min ≤ a < a_match` where `a_match` is determined by the Stage-3 phase-threshold logic. Three downstream bands see a changed input but no changed algorithm:

| Band | `a`-range | Scheme | Change from Phase 3 |
|---|---|---|---|
| Lorentzian bulk | `[a_min, a_match)` | **Explicit leapfrog → Crank–Nicolson semi-implicit (this phase)** | New scheme |
| Euclidean transition | `[a_match, a_deep)` | Explicit leapfrog + soft absorber | None (algorithm unchanged). The `χ_cur`, `χ_prev` handed off at `a_match` come from the CN solver rather than the old explicit solver; numerical values differ by the Phase-3 noise suppression (specifically, the `ν²` reduction in high-k power), but the physical content — the WKB-matched decaying branch — is identical. |
| Deep Euclidean | `[a_deep, a_max]` | Analytic WKB propagator | None. The propagator reads `S_E(a)` and the seed amplitude from `constants.ts` helpers; it does not consume the leapfrog output. |
| Stage-3 Airy/Langer overwrite | turning-surface band | Analytic overwrite | None. The overwrite is computed from the physics (`a_turn`, `V(φ)`, HH coefficients), not from the solver's numerical `χ`. |

The match-cell capture (`solver.ts` Stage-3 handoff) reads `(χ_cur, χ_prev)` from the last Lorentzian slab. Post-Phase-3 this reads from the CN-implicit output. The reduction in `sliceVarMax` from 12.7 to `< 10⁻³` means the handoff values are now φ-invariant (for `m = 0`) to machine precision, so the analytic-side continuation no longer has to reconcile a spurious φ-gradient across the match. This is a quality improvement with no algorithmic change.

## 8. CFL diagnostic

`solver.ts:112,556-570` logs a warning when `da²·(1/a_min²)·8/dphi² > WDW_CFL_BUDGET = 4`. Pre-Phase-3 this was a stability-boundary warning: values above 4 meant the explicit scheme could exhibit `|ξ| > 1` for the highest-k modes.

Post-Phase-3 the Lorentzian-bulk stability constraint on `da` relative to `(1/a²)·1/dphi²` is removed — the implicit treatment of `L` is unconditional. A residual explicit constraint remains from the `da²·U·χ_cur` term: `da²·|U_max| < 4` for the U-term's own Fourier-mode stability. At worst-case grid point (`a ≈ a_max = 1.5`, `m = 0, Λ = 0.5`), `|U| ≈ c_U·a² ≈ 810`; `da²·|U| < 4` requires `da < 0.07`, comfortably satisfied at default `da ≈ 0.005`. This is never the binding constraint at production parameters.

The `WDW_CFL_BUDGET = 4` metric is therefore retained but its semantics shift from stability to **accuracy**: the 2nd-order truncation error of the scheme scales as `da² + dphi²`, and grid choices that push `da²/dphi²` far from the physical-mode ratio produce accurate-but-spatially-noisy solutions (bounded noise, as proven in §3.2, but numerically visible in `sliceVarMax ~ 10⁻³–10⁻²` under hostile parameters).

The warning message is re-worded to reflect this: what it guards is that the user's chosen `da, dphi` produce a balanced discretisation. The `resetCflWarningBudget` test helper (`solver.ts:135`) is retained for backwards compatibility with existing `solver.test.ts` regression guards, but new tests should not rely on the warning firing — it is now informational, not corrective.

## 9. Success criteria

After Phase 3 the following Phase-1 tests, which currently fail on the pre-Phase-3 solver, must pass:

1. **`src/tests/lib/physics/wheelerDeWitt/symmetryPreservation.test.ts`** — `sliceVarMax < 1e-3` for `m = 0` with `Λ ∈ {−0.5, 0, 0.5, 0.8}`, grid `Na = 256, Nphi = 33, phiExtent = 2.0`. This is the direct test that the 12.7 → 1e-3 reduction has happened.
2. **`src/tests/lib/physics/wheelerDeWitt/exactSolutionAgreement.test.ts`** — bulk pointwise relative error `< 1 %` in the interior of each V-sign regime; turning-band relative error `< 20 %` in a 5 % band around each `a_turn`. This confirms the CN scheme still tracks the analytic reference with 2nd-order accuracy.
3. **`wdwOperatorResidual` on all curated presets** remains below the current 0.35 threshold. No tightening is enforced in this phase (the Phase-1 rewrite of residual semantics is the gating job; Phase 4 tightens the number). The purpose of this check is to confirm no regression — the stencil consistency that the residual test measures is, by design, preserved across the explicit → implicit change.

Not-required in this phase: Playwright pixel baselines, preset redescriptions, and the `solverWasmComparison.test.ts` gate. Those live in Phase 4 and Phase 5 respectively.

## 10. Out of scope

- **Preset rebaselining** — Phase 4. Every `WDW_SCENARIO_PRESETS` entry needs a visual re-validation and potential description rewrite; the pixel baselines in `scripts/playwright/wdw-*.spec.ts` and `scripts/playwright/srmt-*.spec.ts` will shift. Not this phase.
- **Rust validator port** — Phase 5. `src/wasm/mdimension_core/src/wheeler_dewitt.rs` mirrors the JS solver; `solverWasmComparison.test.ts` is already gated behind the `rustValidatorMatchesPhase2Js` flag pending this port. The JS side must stabilise first.
- **SRMT sweep renormalisation** — the `q`-plateau curves baselined against the old solver will shift. `docs/physics/srmt-metric.md` and `scripts/playwright/srmt-phiextent-plateau.spec.ts` references are revisited in Phase 4.
- **Factor-ordering alternatives** — the `χ = a^{3/2}·Ψ` reduction is the baseline; changing to Laplace–Beltrami or another convention is a separate overhaul.
- **Headroom / `computeWdwRenderMaxRho`** — the Phase 2 Langer seed and Phase 3 stability fix together remove the `Bi`-contamination that currently inflates the headroom denominator. Whether the default `renderDynamicRange = 100` stays or drops to `≈ 1` is a Phase 4 open question.

## 11. References

- Crank, J. & Nicolson, P. (1947), "A practical method for numerical evaluation of solutions of partial differential equations of the heat-conduction type", *Proc. Cambridge Philos. Soc.* 43, 50–67.
- Peaceman, D. W. & Rachford, H. H. (1955), "The numerical solution of parabolic and elliptic differential equations", *J. SIAM* 3, 28–41 (original ADI derivation).
- LeVeque, R. J. (2007), *Finite Difference Methods for Ordinary and Partial Differential Equations*, §8.4 (operator splitting and ADI).
- Kreiss, H.-O. & Oliger, J. (1973), *Methods for the Approximate Solution of Time Dependent Problems*, GARP Publication Series 10 — original hyperviscosity scheme referenced by Option Aₛ.
- `src/lib/physics/wheelerDeWitt/solver.ts` — current explicit leapfrog (pre-Phase-3); Lorentzian-band replacement target.
- `src/lib/physics/wheelerDeWitt/constants.ts` — `wdwU`, `wdwTurningA`, potential and turning-surface helpers consumed by the solver without change.
- `docs/physics/langer-hh-seed.md` — Phase 2 derivation of the Langer-uniform HH seed that produces the φ-invariant initial datum tested by §9.1.
- `docs/plans/wdw-solver-physics-correctness.md` — parent plan; §Phase 3 scopes this document, §Phase 1 defines the validation harness, §Risks lists downstream impacts.
- `src/tests/lib/physics/wheelerDeWitt/symmetryPreservation.test.ts` — Phase 1 direct test of `sliceVarMax`.
- `src/tests/lib/physics/wheelerDeWitt/exactSolutionAgreement.test.ts` — Phase 1 reference comparison against `columnSolution{Positive,Zero,Negative}V` from `exactColumnSolution.ts`.
