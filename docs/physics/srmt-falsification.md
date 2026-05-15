# SRMT — Pre-Registered Falsification Criteria

**Version**: 1.0.0
**Diagnostic version coupled to**: `SRMT_DIAGNOSTIC_VERSION = 1.1.0`
**Status**: PRE-REGISTERED. This document fixes the falsification bar
*before* the publication sweep runs. Editing this document AFTER a
publication sweep result is known invalidates the pre-registration and
requires a versioned bump + restart of the sweep.

## Purpose

The Superspace-Relational Modular Time (SRMT) conjecture predicts that
the DeWitt-timelike clock `a` yields a modular-Hamiltonian spectrum
`K_n` that affinely tracks the Hamilton–Jacobi spectrum `E_n`:

> `K_n ≈ α · E_n + β`

with substantially better fit than either spacelike inflaton clock
`φ₁`, `φ₂`. The sweep harness scores this with the affine-fit residual

> `q = Σ (K_n − (α E_n + β))² / Σ K_n²`

Without an explicit falsification bar, any sweep outcome can be
narrated as "interesting evidence" — which is confirmation-biased
hindsight, not physics. This document fixes the bar before the
publication sweep produces results, so the verdict is deterministic
once the data is in.

## The publication-grade claim — exact form

The claim SRMT supports, when every criterion below is met, is:

> *In Wheeler–DeWitt minisuperspace with two scalar fields, across
> {three boundary conditions: noBoundary, tunneling, deWitt} × {mass
> range m ∈ [0, 2]} × {Λ range Λ ∈ [−1, 1]} × {three robustness
> metrics: L2, L∞, rigid} × {three null baselines: shuffled, reversed,
> synthetic} × {convergence-certified grids via gridNphiCoupled}, the
> scale factor `a` is the affine-best internal clock under the SRMT
> criterion.*

The claim does **not** assert the problem of time is solved. It does
not assert SRMT is correct beyond minisuperspace. It asserts the
conjecture has survived every test the simulator can pose.

## Criterion 1 — Champion winner under L2

`a` must beat the runner-up by a margin exceeding the
`DEFAULT_CHAMPION_TIE_TOLERANCE = 0.02` at every interior point of the
parameter grid.

**Pass:** `min(q(phi1), q(phi2)) − q(a) > 0.02` at every grid point.
**Fail:** At any single point, `a` is not the strict winner. That
single failure invalidates the claim — SRMT does not get to cherry-pick
parameter regions.

## Criterion 2 — Metric robustness

`a` must remain the winner under all three quality metrics:

- `q_L2` — least-squares affine residual (`affineMatchQuality`).
- `q_L∞` — `max |K_n − (α E_n + β)| / max|K_n|`
  (`computeAffineFitLInf`).
- `q_rigid` — strict α = 1 residual (`computeRigidFitQuality`).

**Pass:** `a` wins under all three. Margins may differ across metrics;
the conjecture is about *which clock* wins, not about the exact gap.

**Fail:** `a` wins under L2 but loses under L∞ or rigid at any grid
point. This is the "win by averaging out a bad mode" failure mode and
explicitly does *not* count as supporting evidence.

## Criterion 3 — Null-baseline floor

For every grid point and every clock, the real q must beat the
**best** of the three null baselines:

- `q_shuffled` — `K` randomly permuted (deterministic seed).
- `q_reversed` — `K` reversed.
- `q_synthetic` — `K` replaced by Gaussian noise matching its first
  two moments.

**Pass:** `min(q_shuffled, q_reversed, q_synthetic) > q_real` at every
grid point under examination. Concretely, `bestBaselineRatio > 1`.

**Caveat — reversed baseline direction-symmetry:** the L2 affine fit
absorbs sign flips into `α`, so `q_reversed` is direction-symmetric on
strictly-monotone inputs. Real SRMT `K` carries curvature that breaks
this symmetry, but reviewers should pair the reversed-baseline check
with **`q_rigid` reversed** (where `α = 1` is pinned and the sign flip
becomes detectable). See the module docstring of
`lib/physics/srmt/nullBaselines.ts` for the derivation.

**Fail:** A null baseline beats the real fit. The UI flags this with
the `data-falsified="true"` attribute on `SrmtNullBaselineStrip`. A
single occurrence at a converged grid point is sufficient to falsify
the claim — random shuffles of `K` should not, by hypothesis, give a
better affine fit than the structured `K`.

## Criterion 4 — Convergence-certified grids

Every claim point must come from a grid that passes the
`gridNphiCoupled` convergence sweep at its `(Nφ, Nₐ)` setting. A
publication grid whose `q(N)` does not approach `q(N_max)`
monotonically as `N` grows is **unfit to publish** (cf. CLAUDE.md
SRMT section).

**Pass:** `gridNphiCoupled` sweep at each parameter point shows
monotone convergence of `q(a)` to the `Nφ = 64` value within the
solver's warn budget.

**Fail:** Any non-monotone convergence pattern, or `q` continuing to
trend with `Nφ` beyond `Nφ = 64`. Re-run with higher cap or revise
the discretisation before claiming.

## Criterion 5 — Boundary-condition stability

The champion clock must be `a` under all three boundary conditions:
`noBoundary`, `tunneling`, `deWitt`. If `a` wins under one BC and
`phi1` wins under another, the diagnostic is measuring BC choice, not
clock geometry — and the conjecture is not BC-invariant in this
truncation.

**Pass:** `a` is champion at every grid point under every BC tested.

**Fail:** Champion identity flips with BC.

## Criterion 6 — Mass / Λ stability

The champion clock must be `a` across the full sampled mass and Λ
ranges. Sub-region wins (e.g. `a` wins only for `m < 0.5`) are
*interesting* but they do not satisfy the publication bar — they
constitute a partial result that should be reported separately, not
folded into the main claim.

**Pass:** `a` wins across the entire `m ∈ [0, 2]` × `Λ ∈ [−1, 1]`
plane at the publication grid.

**Fail:** Champion identity depends on `m` or `Λ`.

## What COUNTS as evidence FOR SRMT in this study

Only the *conjunction* of all six criteria. Anything less is a partial
result, reported as such.

## What COUNTS as evidence AGAINST SRMT in this study

Any one of:

1. `a` loses to `phi1` or `phi2` at any converged grid point under
   any metric (Criteria 1, 2).
2. A null baseline beats the real fit at any converged grid point
   (Criterion 3).
3. Champion identity flips with boundary condition, mass, or Λ
   (Criteria 5, 6).
4. The result fails to converge at the publication grid (Criterion 4).

A single instance of any of the above falsifies the conjecture
*within this minisuperspace truncation*. It does not falsify SRMT
in general — only the specific claim "SRMT holds in 1+2 minisuperspace
under the diagnostic implemented at `SRMT_DIAGNOSTIC_VERSION = 1.1.0`".

## Out-of-scope claims (NOT addressed by this pre-registration)

- Whether SRMT holds beyond minisuperspace (Bianchi I/IX, inhomogeneous
  perturbations, multi-field inflation). These require separate
  pre-registrations once the necessary solver work lands.
- Whether SRMT agrees with Page–Wootters, Connes–Rovelli thermal time,
  or Born–Oppenheimer semiclassical time. Cross-framework comparison
  is a separate study with its own pre-reg.
- Whether the `a` clock corresponds to anything physically observable.
  The conjecture is about formal diagnostic structure, not about
  observable cosmological time as measured by a clock-on-the-wall.

## Sweep harness configuration for the publication run

This is the configuration the harness must be set to *exactly* to
satisfy this pre-registration. Any deviation (different rankCap,
different sweep grid) downgrades the result to "exploratory" status
and forfeits the publication-grade claim.

- `srmtRankCap`: 64 (the diagnostic's default).
- BC sweep: `noBoundary`, `tunneling`, `deWitt` (all three).
- Mass sweep: `wdw_m` ∈ `[0, 2]`, 21 points.
- Λ sweep: `wdw_lambda` ∈ `[−1, 1]`, 21 points.
- Grid convergence: `gridNphiCoupled` per point, `[32, 64]` for Nφ,
  coupled `Nₐ` ceiling 1024.
- Anchor cut: `srmtCutNormalized = 0.5` (midpoint of the clock axis).
- Null-baseline seed: `DEFAULT_NULL_BASELINE_SEED = 0x5e7c0` (fixed
  for reproducibility).
- Diagnostic version: `1.1.0` (any bump requires a new pre-reg).

## Reproducibility — what to publish alongside the result

1. The exact value of `SRMT_DIAGNOSTIC_VERSION` from
   `lib/physics/srmt/index.ts`.
2. The full sweep manifest CSV (already produced by
   `sweepManifest.ts`).
3. This document, frozen at the version corresponding to the run.
4. Per-point baseline ratios (so reviewers can verify Criterion 3).
5. The PRNG seed used for the null baselines.
6. Convergence plots from the `gridNphiCoupled` sweep.

A claim that passes every criterion but lacks any of the six artefacts
above is *not* publication-grade. The artefacts are part of the bar,
not addenda to it.

## Amendments

- **2026-05-14 / v1.0.0**: Initial pre-registration. Six criteria,
  three null baselines, three metrics, BC × mass × Λ grid.

Future amendments append here with date + version bump. Amendments
*after* a publication sweep result is known invalidate any claim based
on the prior version and require a fresh sweep against the amended
criteria.
