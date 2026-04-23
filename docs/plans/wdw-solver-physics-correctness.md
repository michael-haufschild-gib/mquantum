# Wheeler–DeWitt Solver — Physics Correctness Overhaul

**Status**: Proposed
**Effort estimate**: 40–80 hours, multiple sessions. Re-architects the solver's boundary seeding, Lorentzian-bulk stability, and validation harness.
**Expected impact**: All rendered Wheeler–DeWitt scenes become genuine physical solutions rather than stencil-consistent noise patterns. Every preset in `WDW_SCENARIO_PRESETS` will need revalidation; some numerical thresholds in downstream tests will need re-tuning. The rendered density, streamlines, SRMT overlays, URL sweeps, and presetEndToEnd assertions all sit downstream of this solver — any of them may shift measurably once the solver produces the right χ.

## Executive Summary

The Wheeler–DeWitt minisuperspace solver (`src/lib/physics/wheelerDeWitt/solver.ts` + `boundaryConditions.ts`) produces output that is *stencil-consistent* with its claimed PDE but *not physically accurate*: the solver's χ does not correspond to a solution of the stated PDE with the stated initial conditions. Two independent mechanisms contribute:

1. **The Hartle–Hawking boundary seed uses a leading-WKB approximation that is invalid near the classical turning surface.** At the default `a_min = 0.1` with `Λ = 0.5`, the turning surface sits at `a_turn = 0.489`, so `a_min ≈ 0.2 · a_turn` — well inside the regime where the leading-WKB seed is quantitatively wrong. A linear-least-squares fit of the solver's χ(a, φ=0) against the Airy-branch basis `{Ai(ζ), Bi(ζ)}` in the pure-Lorentzian interior (m=0, Λ=0.5) gives **|c₂/c₁| = 0.53** — a 53 % contamination by the exponentially-growing `Bi` branch where the Hartle–Hawking proposal requires pure `Ai`.

2. **The Lorentzian bulk has no dissipation, so numerical noise coupled through the Neumann-ghost φ-boundaries and the sponge absorber amplifies into large-scale spurious φ-structure.** In the strict translation-invariant limit (m=0, V=Λ=const, constant-in-φ HH seed), the solver's χ develops **13.7× amplitude ratio between edge and center φ-cells** by mid-a (sliceVarMax = 12.7 at ia=360, grid Nphi=17). The physics cannot produce this: V is constant in φ, the HH seed is constant in φ, the PDE commutes with φ-translations, therefore χ must remain constant in φ. The emerging structure is purely numerical.

Both bugs are masked by the existing `wdwOperatorResidual` test (`solver.ts:945`), which computes `−χ″ + (1/a²)·∇²_φ χ + U·χ` on the solver's own output and demands its norm be small — a **self-consistency** check that passes at 2.9–4.1 % across all presets *because the spurious `∇²_φ χ` term cancels against the spurious `χ″` term mathematically*. The test validates that χ satisfies the PDE with *some* initial condition, not the one the physics specified. Three more tests amplify the blind spot: `analyticFixtures.ts` tests restrict to a custom constant-in-φ boundary (bypassing the HH seed), the JS↔Rust cross-validator is a line-for-line port of the same JS solver (shares the same bugs), and `presetEndToEnd.ts` asserts bulk observables (max density, streamline counts) that are insensitive to the symmetry-breaking noise.

**Visible symptom.** Both screenshots attached to the investigation session (AdS and dS presets) show a 6×6 lattice of warm-yellow streamline-seed dots over a dim haze of the Lorentzian density and a bright Euclidean corner frame. The lattice is the WKB streamline seed grid projected along the a-axis (confirmed independently; the streamlines themselves are correct, they just collapse to dots when φ-motion is slow). The dim haze, and the reason the Lorentzian bulk oscillations are barely visible under typical `renderDynamicRange = 100`, is the combined effect of (a) the Bi-branch contamination inflating the headroom denominator, and (b) the spurious φ-structure distorting the actual oscillatory signal.

Fixing this is not a preset tweak. It requires replacing the HH seed with the Langer-uniform form, adding dissipation in the Lorentzian bulk that kills noise without killing physics, and replacing the self-referential residual test with a cross-validation against closed-form exact solutions. The remainder of this document specifies the full program.

## Evidence Record

This section preserves the diagnostic output from the 2026-04-22 investigation session so future work does not have to re-derive the measurements.

### Finding 1 — HH seed projects onto Ai+Bi, not pure Ai

Diagnostic: `adsPdeCheck2.diag.test.ts` (throw-away, deleted). Regime: `m=0, Λ=0.5, HH BC, aMin=0.1, aMax=1.5, Na=256, Nphi=33, phiExtent=2.0`. Fit range: pure-Lorentzian interior `0.127 ≤ a < 0.92·a_turn` (59 samples), excluding the Stage-3 analytic-overwrite region.

```
Best-fit: c1=2.52539  c2=-1.33065  |c2/c1|=5.269e-1
Shape fit residual: rel_rms=6.380e-2  max_rel_err=1.56e+0
```

Interpretation. The HH proposal for pure-Λ minisuperspace selects the regular-at-the-classical-singularity solution, which is `χ ∝ (ζ/U)^{1/4}·Ai(ζ)` to all orders of the Langer-uniform expansion. `|c₂/c₁| = 0.53` is the fraction of the growing `Bi` branch present in the solver's output. Physically correct would be `|c₂/c₁| < 0.01` (residual `Bi` only from finite-precision arithmetic).

Mechanism. At `a = a_min`, `boundaryConditions.ts:151` sets

```ts
const Se = (1.0 / (3.0 * V)) * (Math.pow(arg, 1.5) - 1.0)   // arg = 1 − K V a²
amp    = Math.exp(-Math.abs(Se))
dChi   = -WDW_G_PREFACTOR * aMin * Math.sqrt(arg) * amp
```

This is the **classical instanton action** of the Hartle–Hawking path integral, continued analytically from Euclidean to Lorentzian. It matches the leading-WKB form `(|U|)^{-1/4}·exp(−S_E)` in the limit `|ζ| → ∞`, but the solver seeds at `a_min = 0.1` where `|ζ(a_min)| ≈ 1.6` — O(1), not asymptotic. The subleading corrections to the WKB form are non-negligible at |ζ| ~ 1; the Langer-uniform formula `χ = (ζ/U)^{1/4}·[c₁·Ai(ζ) + c₂·Bi(ζ)]` resums them exactly. Seeding with just the leading-WKB amplitude projects onto a superposition of Ai and Bi whose coefficients satisfy `c₁/c₂ ≠ ∞`.

### Finding 2 — Spontaneous φ-translation symmetry breaking

Diagnostic: `adsPdeCheck4.diag.test.ts` (throw-away, deleted). Regime: `m=0, Λ=0.5, HH BC, Na=512, Nphi=17, phiExtent=1.0`. The `m = 0` case is the cleanest test bed: `V(φ) = Λ = const`, so the HH seed generator produces χ(a_min, φ) exactly constant in φ, and the full PDE commutes with φ-translations. The exact physical solution must remain constant in φ at every a.

Observation table — maximum relative amplitude variation across the φ-slice at each a:

```
ia=  0 (a=0.100)  centerVal=9.59e-1  sliceVarMax=0.00e+0   ← seed correct
ia= 30 (a=0.182)  centerVal=8.73e-1  sliceVarMax=2.54e+0   ← 254 % variation
ia= 60 (a=0.264)  centerVal=-8.95e-1 sliceVarMax=1.76e+0
ia= 90 (a=0.347)  centerVal=-6.48e+0 sliceVarMax=1.02e+0
ia=120 (a=0.429)  centerVal=-2.27e+0 sliceVarMax=1.09e+0
ia=150 (a=0.511)  centerVal=4.12e-1  sliceVarMax=1.27e+1   ← 1270 % variation
ia=180-420       sliceVarMax=1.27e+1 sustained
ia=450+          sliceVarMax drops — Stage-3 analytic overwrite region
```

At ia=360 (a ≈ 1.09), edge-cell χ is **13.7×** the center-cell χ despite no physical mechanism to produce any difference. Repeating with `m = 0.3, Λ = 0.5` (standard preset regime) still produces `sliceVarMax = 9.0` — the Gaussian HH envelope does not prevent the instability; it merely provides a nonzero ∇²_φ χ that partially masks the noise-generated structure in a downstream residual check.

### Finding 3 — Project's residual test is self-referential

`wdwOperatorResidual` (`solver.ts:945`) computes

```ts
resRe = -d2aRe + invAsq * lap.re + U * cre   // -∂²_a χ + (1/a²)·∇²_φ χ + U·χ
resNorm += resRe²;  ucNorm += (U·cre)²
return sqrt(resNorm / ucNorm)
```

on the solver's output. On the m=0, Λ=0.5 regime above, this returns **2.9 %** — passes the 35 % threshold at `presetEndToEnd.ts:408`. But computing the **same** residual omitting the `invAsq * lap.re` term (the reduction one gets when the physics requires ∇²_φ χ ≡ 0 for a constant-in-φ slab) returns **rms = 573×** (57,300 %). The three terms add to ≈ 0, but each term is hundreds of times larger than the U·χ normalization — meaning χ″ and ∇²_φχ are both enormous and nearly cancel. The solver found a PDE solution, just not the one specified by the initial data.

This is the **test failure mode** that let both bugs ship simultaneously. A residual test on solver output can never falsify the solver because the solver is specifically constructed to minimize that residual. Validating the solver requires comparing against a *reference* obtained without running the solver.

### Finding 4 — Existing cross-validations don't catch either bug

- `analyticFixtures.ts` + `solverAnalytic.test.ts`: use `customBoundary` to inject a constant-in-φ slab. Bypasses HH seed → bug 1 hidden. Constant-φ slab plus f32 noise → bug 2 masked by the reference being equally noisy in limiting cases.
- `solverWasmComparison.test.ts`: compares JS leapfrog against Rust validator. Both implement the same scheme with the same BC generator → both share the same two bugs, they agree with each other.
- `presetEndToEnd.ts`: asserts `maxR > 0.1` in packed R-channel, `PDE residual < 0.35`, `HH/DeWitt presets keep Im(χ) small`. Bug 1 doesn't trip the first (max is unchanged by Bi admixture at most grid points), passes the second (self-referential), trivially passes the third (Im(χ) is structural to the BC, not the bulk dynamics). Bug 2 doesn't trip any because all curated presets use `m > 0`, giving the symmetry-breaking noise a physical-looking Gaussian envelope to hide behind.

## Required New Physics — Derivations

Before coding, the correct forms must be derived in a single place so the four implementation phases can consult them.

### 2.1 Langer-uniform Hartle–Hawking seed

For the pure-Λ minisuperspace (`m=0, V(φ) = Λ`), the Hartle–Hawking wavefunction is exactly

> `χ_HH(a) = N_HH · (ζ(a) / U(a))^{1/4} · Ai(ζ(a))`

with `ζ(a)` the signed Langer variable defined in `constants.ts:324` and `N_HH` a normalization constant. For inflaton-inclusive potentials `V(φ) = ½m²|φ|² + Λ`, this holds column-by-column: each `(φ₁, φ₂)` column independently picks up its own `ζ_col(a)` and `U_col(a)`, and the seed at `a_min` is

> `χ_HH(a_min, φ) = N_HH(φ) · (ζ(a_min, φ) / U(a_min, φ))^{1/4} · Ai(ζ(a_min, φ))`
> `∂_a χ_HH(a_min, φ) = N_HH(φ) · d/da [ (ζ/U)^{1/4} · Ai(ζ) ] |_{a_min}`

The φ-dependence of `N_HH(φ)` is the Gaussian classical prefactor that the current code captures correctly via the `exp(-S_E^HH)` amplitude at `a → 0`. Keep that envelope; replace the in-column normalisation with the Ai form.

For columns with `V(φ) ≤ 0` (no turning surface, the AdS-cell branch), the Langer variable is undefined. The correct replacement there is the 1D `V < 0` exact solution, which for `V = const < 0` is a Hankel function in the scale factor:

> `χ(a, φ) = a^{3/2} · [α·H_{1/4}^{(1)}(Φ_L(a, φ)) + β·H_{1/4}^{(2)}(Φ_L(a, φ))]`

with `Φ_L` from `constants.ts:276` (`wdwLorentzianWkbPhase`). Hartle–Hawking in this regime selects `α = β` (real χ, standing wave). The existing code uses a pure Gaussian-in-φ envelope here; that is valid as a *smooth gauge* but loses the amplitude `|U|^{-1/4}` scaling required for the Langer form to match in the V → 0⁺ limit. The correct small-V limit handler must interpolate these two regimes continuously.

The derivative `∂_a [(ζ/U)^{1/4} · Ai(ζ)]` is evaluable in closed form. Using `dζ/da = (3/(2ζ^{1/2})) · dS/da = (3/(2ζ^{1/2})) · √|U|`:

> `∂_a χ_HH(a) = (1/4) · (ζ/U)^{-3/4} · (ζ'U − ζU')/U² · Ai(ζ) + (ζ/U)^{1/4} · Ai'(ζ) · ζ'(a)`

Every term has an analytic closed form via the existing `airyAiPrime` (`airy.ts:308`), `wdwU`, and a new exported helper `wdwLangerDerivatives(a, φ, m, Λ, α) → { zeta, U, dZetaDa, dUDa }`. Floating-point stability near `ζ → 0` (turning surface) requires a Taylor expansion of the Ai form since both numerator and denominator vanish there; the Taylor coefficient is known from the Airy ODE `Ai''(z) = z·Ai(z)` and can be tabulated in a helper like `chiAiLangerNearTurn(a, φ, …)`.

### 2.2 Lorentzian-bulk dissipation

The explicit leapfrog on `−∂²_a χ + (1/a²)∇²_φ χ + Uχ = 0` is conditionally stable for `da ≤ a·dphi/√D` where D is the spatial dimension (2 here), but **unconditionally allows the growth of high-spatial-frequency modes** because the PDE has no dissipation term. Any noise injected by the φ-boundary stencil (Neumann ghost + sponge) at short wavelengths can persist and grow coherently into the bulk.

Two physically defensible ways to damp noise without altering the physics:

**Option Aₛ — Artificial viscosity at high spatial frequencies.** Add a fourth-order hyperviscosity term `ν · ∇⁴_φ χ` to the leapfrog update, with `ν = ν₀ · dphi² · max(0, k² − k_cut²)` so only short-wavelength modes (k > k_cut) are damped. Convention in numerical relativity (Kreiss–Oliger dissipation): `ν₀ ≈ 0.01–0.1` * scheme-consistent scaling. Physical long-wavelength modes (the Gaussian envelope, the bulk oscillations at k ~ 1/phiExtent) pass through untouched. This preserves the PDE's dispersion relation for resolved modes and damps only grid-scale noise. The natural reference is Kreiss–Oliger; this needs a mini-derivation to pin down the exact weighting that keeps the scheme second-order-accurate in `da`.

**Option Aᵢ — Semi-implicit leapfrog.** Treat the `(1/a²)∇²_φ χ` term implicitly. The resulting scheme is unconditionally stable and preserves symmetry (∇² is self-adjoint on a symmetric grid with matching boundaries). Cost: one tridiagonal or pentadiagonal solve per a-step per φ-line, ~6× more expensive than the current explicit scheme but still cheap for Na = 256 × Nphi² = 40² = 256·1600 = 400k cells per march.

Both are standard techniques from computational cosmology; both are derivable and testable. Preference order: **Aᵢ is correct, Aₛ is a patch.** Go implicit unless implicit proves intractable (e.g., awkward interaction with the Airy/Langer Stage-3 splice in deep Euclidean), in which case Aₛ with carefully-chosen ν₀ is acceptable.

### 2.3 Real-physics validation harness

Replace `wdwOperatorResidual` with a **reference-comparison** test that is not self-referential. The cleanest reference is the column-wise 1D exact solution, available in closed form for three regimes:

| Regime | Exact χ-column | Notes |
|---|---|---|
| V > 0 (dS cell) | `(ζ/U)^{1/4}·[c₁·Ai(ζ) + c₂·Bi(ζ)]` | Langer-uniform Airy combination |
| V = 0 (free cell) | `a^{3/2}·[α·J_{1/4}(3πa²) + β·Y_{1/4}(3πa²)]` | Bessel of order 1/4 |
| V < 0 (AdS cell) | `a^{3/2}·[α·H_{1/4}^{(1)}(Φ_L(a)) + β·H_{1/4}^{(2)}(Φ_L(a))]` | Hankel, imaginary-mass dS |

`constants.ts` already exports `wdwLorentzianWkbPhase` covering all three regimes (lines 276–296). The validator test:

1. Runs the solver with constant-in-φ `customBoundary` that matches one of the three exact forms exactly at `a_min`.
2. Extracts χ(a, φ=0) for each a.
3. Compares against the exact `χ_exact(a)` using the same BC constants (c₁, c₂ or α, β determined from the seed).
4. Asserts `max |χ_solver(a) − χ_exact(a)| / |χ_exact(a)| < ε(a)`, with `ε` loose near turning surface (where WKB breaks down) and tight elsewhere.
5. Runs the same test with `m = 0`, all three Λ signs — so the solver is cross-validated against a reference it did not produce.

### 2.4 Symmetry-preservation test

Independent of exact-solution comparison, a **symmetry test** can falsify any deviation: for the strict invariance regime (`m = 0` → V(φ) = Λ = const, constant-in-φ seed), the solver output must satisfy

> `max_{(φ₁,φ₂), ia}  |χ(a_ia, φ₁, φ₂) − χ(a_ia, 0, 0)| / |χ(a_ia, 0, 0)|  <  ε`

with ε = 1e-3 on a 256 × 33 × 33 grid. The current solver fails this at 12.7 (1270 %). This test catches any symmetry-breaking instability independent of what the reference solution should be.

## Implementation Phases

### Phase 1 — New validation harness (must come first)

Rationale. Cannot safely modify a solver without a test harness that can detect regressions. The existing harness cannot.

Deliverables:

1. **`src/tests/lib/physics/wheelerDeWitt/exactSolutionAgreement.test.ts`** — runs the solver with known-exact-solution initial conditions in the three V-sign regimes, asserts per-slice `|χ_solver − χ_exact| / max(|χ_exact|, 1e-6)` pointwise bound. Bound loose (~20 %) in a 5 % band around each turning surface, tight (~1 %) elsewhere.
2. **`src/tests/lib/physics/wheelerDeWitt/symmetryPreservation.test.ts`** — runs with `m=0, Λ ∈ {-0.5, 0, 0.5, 0.8}`, asserts sliceVarMax < 1e-3. Documents the exact current failure mode (captured in the evidence record above).
3. **`src/lib/physics/wheelerDeWitt/exactColumnSolution.ts`** — new module exposing `columnSolutionAt(a, a_min, m, Λ, c1, c2)` and `columnSolutionDerivativeAt(a, a_min, m, Λ, c1, c2)` for each V-sign branch. Uses existing `airyAi`, `airyBi`, `wdwLangerVariable`, `wdwLorentzianWkbPhase`. Adds Bessel `J_{1/4}, Y_{1/4}` helpers and Hankel `H_{1/4}^{(1,2)}` helpers (new implementations; no sharp runtime requirement, can use series + asymptotics).

Scope note. These tests are expected to FAIL on the current solver. That's the point. They stay red through Phases 2 and 3; they turn green after Phase 4.

Phase 1 also includes **migrating** `wdwOperatorResidual`-based assertions in existing test files to explicit comments tagging them "self-referential, replaced by exactSolutionAgreement"; the old assertion can remain in place as a coarse sanity check but no longer blocks the build.

### Phase 2 — Langer-uniform HH boundary seed

Deliverables:

1. **Derivation document** `docs/physics/langer-hh-seed.md`. Full derivation from `χ = a^{3/2}·Ψ` reduced WdW to the Langer-uniform HH form, column-by-column. Includes:
   - Matching to the Euclidean classical instanton for `a → 0, V > 0`
   - Matching to the Hankel form for `V < 0`
   - The V → 0 Taylor expansion continuous with both
   - Near-turning-surface Taylor expansion of `(ζ/U)^{1/4}·Ai(ζ)` for numerical stability
   - Derivation of `∂_a χ_HH` in each regime
2. **`boundaryConditions.ts` rewrite of `hartleHawkingBoundary`** to consume the new exact-column solution. Replace `Se`, `amp`, `dChi` block with:
   ```ts
   const { chi0, dChi0 } = hhLangerSeed(aMin, phi1, phi2, mass, lambda, asymmetry)
   ```
   where `hhLangerSeed` returns the exact column solution at `a_min` with the HH-proposal amplitude normalisation.
3. Update `boundaryConditionsVerification.test.ts` with continuity assertions across the three regimes (V small → 0, V → 0⁺, V → 0⁻) and against the classical instanton action at small-a.
4. Update `analyticFixtures.ts` and `solverAnalytic.test.ts` — these currently construct their own BCs; verify the new HH BC reduces to the same constant-slab they currently inject in limiting cases.
5. Update `vilenkinBoundary` with the same Langer-uniform treatment for consistency. Current Vilenkin BC has the same class of bug (leading-WKB seed); the physical selection is just `+iS` instead of `cos(S)`.

### Phase 3 — Lorentzian-bulk stability

Deliverables:

1. **Decision document** `docs/physics/wdw-bulk-stability.md` — compares the semi-implicit option Aᵢ and the Kreiss–Oliger option Aₛ with numerical experiments on both. Records the chosen option with a pinned rationale.
2. If Aᵢ is chosen: `src/lib/physics/wheelerDeWitt/implicitSolver.ts` — implements a two-step Crank–Nicolson-style scheme for `(1/a²)·∇²_φ` with an LU-decomposed banded solve. The existing explicit leapfrog code in `solver.ts` is replaced wholesale for the Lorentzian region; the Stage-3 Euclidean-deep analytic propagator is reused unchanged.
3. If Aₛ is chosen: add a `kreissOligerDissipation(chi, k_cut, nu0)` helper, apply after each explicit step with `k_cut` chosen to preserve modes up to the physically meaningful wavelength (conservatively `k_cut = π/(4·dphi)`), `nu0` tuned by the convergence sweep.
4. Update every Stage-3 match-cell handoff. The current code assumes the leapfrog's χ and χ′ at the phase-threshold cell are the natural continuation; under implicit or dissipative schemes the handoff logic may need a small consistency correction (the implicit step gives different numerical values at the same a but a solution to the same continuous PDE, so the physical match is unchanged; the numerical match may need to read from `chi_prev` instead of `chi_cur` to account for the implicit-step lag).
5. Retune CFL diagnostic warning at `solver.ts:~150` — the budget formula changes (becomes unconditional for Aᵢ; becomes `da²·(1/a²)·8/dphi² < ∞` with the dissipation term absorbing the marginal cases for Aₛ).
6. Retune the φ-sponge to a narrower, heavier absorption profile — the bulk dissipation now handles propagation-in-noise, so the sponge only needs to absorb legitimately-outgoing bulk modes at the domain boundary. `WDW_PHI_SPONGE_WIDTH` likely drops from 5 to 2–3 cells; `WDW_PHI_SPONGE_GAMMA` likely triples. Rerun the symmetry-preservation test at each adjustment.

### Phase 4 — Re-validate every preset

Deliverables:

1. Run each of the six `WDW_SCENARIO_PRESETS` under the new solver, compare rendered density and streamlines against the screenshots in `scripts/playwright/wdw-preset-algo-matrix.spec.ts`. Update the pixel-statistics baseline in that test to the new values.
2. Update `presetEndToEnd.ts` residual threshold — the new solver should be accurate to at least 1e-3 RMS in the Lorentzian interior; relax the 0.35 to 1e-2 as a loose ceiling, and add a *tight* 1e-3 floor in the interior-cell-only subset.
3. Run `srmt-*.spec.ts` Wheeler–DeWitt tests — the SRMT diagnostic reads the solver's χ; its spectrum may shift measurably. Document the shift, verify the modular-Hamiltonian eigenvalues still satisfy the published SRMT identity.
4. Run `wdw-density-contrast-sweep.spec.ts`, `wdw-srmt-overlay-visibility.spec.ts`, `wdw-phase-worldline-animation.spec.ts` — collect any pixel-diff baseline changes needed.
5. Re-audit preset descriptions. Several presets' descriptions were written against the buggy output (e.g., `vilenkinTunneling` at Λ=0.3 "complex oscillating initial data favouring expansion" — verify the new solver shows the same-signed outgoing direction). Rewrite descriptions that don't match the new physics.
6. Specifically: **`deSitterLargeLambda`** is the preset whose screenshot triggered this investigation's second phase. After Phase 2+3, verify the rendered χ shows:
   - Clear Lorentzian oscillations in the interior for a < a_turn
   - Smooth Airy-tail decay past a_turn
   - No spurious φ-lattice structure
   - WKB streamlines flowing from small-a to the turning surface and beyond
   - Euclidean Bi-free deep tail (a factor ~100 weaker than current)

   If any of these fail, Phase 1's exactSolutionAgreement test will flag it.

### Phase 5 — Cross-validator synchronisation (Rust side)

The Rust wasm validator (`src/wasm/mdimension_core/src/wheeler_dewitt.rs`) mirrors the JS solver. After Phase 2+3 stabilise, port the same changes to the Rust solver and re-enable `solverWasmComparison.test.ts`. The cross-validator's utility was diminished by shared bugs; after Phase 4 the cross-validator again provides independent verification of the JS implementation at f32 precision.

## Risks and Open Questions

### Risk 1 — Implicit scheme breaks CFL-based diagnostics

The current solver warns when `da²·(1/a_min²)·8/dphi² > 4` (approximately). With an implicit step this constraint disappears. Existing e2e tests that probe "tight CFL" regimes (`srmt-joint-grid-convergence.spec.ts`) need their physics interpretation revisited — they are currently checking that the numerical scheme stays within its stability envelope; under an unconditionally-stable scheme, they should instead check that convergence is *second-order* in `da` and `dphi` separately (standard manufactured-solution test).

### Risk 2 — Existing SRMT-sweep results change

The SRMT diagnostic's `q`-convergence curves in `scripts/playwright/srmt-phiextent-plateau.spec.ts` and related are baselined against the current buggy solver. Once fixed, the modular-Hamiltonian spectrum may shift. Need to decide: re-baseline with the correct solver and acknowledge the published q-plateaus change, OR keep the old baselines as "historical" and add new ones.

The published SRMT identity (q → 0 as rank → ∞, monotonicity in `phiExtent`, etc.) is a theoretical prediction that does not depend on the solver's bugs; the plateau values are numerical. The right call is probably "re-baseline with the correct solver, annotate the change in commit message and in the relevant test file".

### Risk 3 — User-visible behaviour change

Every rendered Wheeler–DeWitt scene will look different after this work. The lattice will disappear from the AdS and dS presets; the purple bulk will show visible oscillations; the Euclidean corner frame will be much dimmer (no Bi contamination inflating the Euclidean-side amplitude). Playwright pixel baselines for all WdW specs need updating in one coordinated batch at the end of Phase 4.

### Risk 4 — WASM cross-validator port

If the Rust solver is not updated in step, `solverWasmComparison.test.ts` fails. Phase 5 has to ship in the same release as Phase 2+3 or the test gets disabled in the interim. Prefer: ship Phase 2+3 and Phase 5 together, skip Phase 5 test until after.

### Open question — Normalisation convention for rendered density

The current `renderDynamicRange = 100` default was chosen against the buggy solver's Bi-contaminated Euclidean corners. Post-fix, the Lorentzian/Euclidean amplitude ratio will be ~O(1) instead of ~O(10²³). The headroom mechanism (`computeWdwRenderMaxRho`) may become unnecessary, or the default may need to drop to `renderDynamicRange ≈ 1` for the same visual result. Decide during Phase 4.

### Open question — Vilenkin BC for Λ<0

The original `antiDeSitterContracting` preset used Vilenkin/tunneling BC at Λ=-0.5. I changed it to HH in an earlier session (commit `8a3e345c`) because Vilenkin is ill-motivated physically for Λ<0. After Phase 2's Langer-uniform Vilenkin rewrite, revisit this: does Vilenkin produce a clean contracting classical branch via the exact Hankel form with `α ≠ β`? If yes, restore a Vilenkin-AdS preset as a physically meaningful option (the old one's name was right; the implementation was the problem).

## Success Criteria

A correct implementation satisfies all of the following, verifiable by a single test run at the end of Phase 4:

1. **`exactSolutionAgreement.test.ts` passes** at 1 % relative accuracy in the bulk, 20 % in a 5 % band around each turning surface.
2. **`symmetryPreservation.test.ts` passes** at 1e-3 sliceVarMax for `m=0, Λ ∈ {-0.5, 0, 0.5, 0.8}`.
3. **`wdwOperatorResidual` < 1e-2** across all curated presets (tightened from 0.35).
4. **`solverWasmComparison.test.ts` passes** after the Rust port.
5. **All six preset screenshots** visually match the claims in their `description` fields as judged by the session-author operator (ambient visual inspection; no automated check suffices for "looks like AdS cosmology").
6. **No new `test.fixme` or `test.skip` in the WdW test tree.** Regression of any existing test must be investigated and either fixed or explicitly re-baselined with commit-message rationale.

## What This Plan Does Not Cover

- **The WKB streamline integrator** — separate concern. The current integrator produces physically correct trajectories; it just projects to dots for slow-roll-inflaton configurations because the φ-direction motion is negligible. If the screenshots still show dot patterns after Phase 4 (they likely will, because slow-roll-inflaton is the physics), that's acceptable and the streamlines themselves need no further work.
- **The density normalisation / headroom mechanism** — probably obsolete post-fix (the `Bi`-contamination it compensates for disappears). Evaluated in Phase 4's open question #1, not part of the solver correctness proper.
- **Alternative factor-ordering conventions** — the code's `χ = a^{3/2}·Ψ` substitution with `p = 3` is standard; re-deriving with Laplace–Beltrami `p = 1` or other orderings is a scope creep beyond this plan.

## Files Touched (Provisional Inventory)

Read + heavily modify:
- `src/lib/physics/wheelerDeWitt/solver.ts` — Lorentzian bulk scheme swap
- `src/lib/physics/wheelerDeWitt/boundaryConditions.ts` — Langer-uniform HH + Vilenkin seeds
- `src/lib/physics/wheelerDeWitt/constants.ts` — add derivative helpers if not already present

New files:
- `src/lib/physics/wheelerDeWitt/exactColumnSolution.ts`
- `src/lib/physics/wheelerDeWitt/hhLangerSeed.ts` (extract from boundaryConditions for clarity)
- `src/tests/lib/physics/wheelerDeWitt/exactSolutionAgreement.test.ts`
- `src/tests/lib/physics/wheelerDeWitt/symmetryPreservation.test.ts`
- `docs/physics/langer-hh-seed.md`
- `docs/physics/wdw-bulk-stability.md`

Revisit / re-baseline:
- `src/tests/lib/physics/wheelerDeWitt/presetEndToEnd.test.ts`
- `src/tests/lib/physics/wheelerDeWitt/solver.test.ts`
- `src/tests/lib/physics/wheelerDeWitt/solverAnalytic.test.ts`
- `src/tests/lib/physics/wheelerDeWitt/boundaryConditionsVerification.test.ts`
- `src/lib/physics/wheelerDeWitt/presets.ts` (descriptions)
- Every `scripts/playwright/wdw-*.spec.ts` and `scripts/playwright/srmt-*.spec.ts` pixel baseline

Rust port (Phase 5):
- `src/wasm/mdimension_core/src/wheeler_dewitt.rs` — mirror JS changes

## Commit Discipline for This Work

Phase boundaries must be commit boundaries. Do not mix a new HH seed with a new bulk-dissipation scheme in one commit — each phase's test suite is the evidence that that phase is correct. The commit graph should read: *validation harness → HH seed → bulk stability → preset rebaselining → Rust port*. Each commit passes the tests added *in that commit* plus all earlier phases' tests. The final commit is either green across the entire WdW tree or the feature ships nothing.
