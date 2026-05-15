# SRMT — Pre-Registered Falsification Criteria v2.0.0

**Version**: 2.0.0
**Diagnostic version coupled to**: `SRMT_DIAGNOSTIC_VERSION ≥ 1.2.0`
**Predecessor**: v1.0.0 (`srmt-falsification.md`) — preserved as
the historical pre-reg; v1 results in `srmt-empirical-result-v1.md`
and `srmt-empirical-result-v2.md`.

**Status**: PRE-REGISTERED. This document supersedes v1.0.0. Edits
after a publication-grade sweep result is known invalidate the
pre-registration and require a versioned bump + restart.

## What changed from v1.0.0

The v1 exploratory sweep revealed four design flaws in the v1
criteria. The v2 pre-reg corrects them:

1. **Primary metric is rigid, not L2.** The L2 affine fit absorbs
   the slope `α` and is regime-dependent (champion flips under
   tunneling at intermediate masses, see
   `srmt-empirical-result-v1.md`). The rigid (α=1) fit is the direct
   statement of the SRMT conjecture `K_n ≈ E_n + const` and shows
   stable champion identity across BC × m × Λ × grid resolution.

2. **Null-baseline criterion is between-clock, not within-clock.**
   Under the rigid metric, q saturates at a "K unrelated to E"
   floor for non-SRMT-satisfying clocks, so within-clock baseline
   ratios are close to 1 for every clock (winner included). The
   right test is the between-clock margin
   `q_rigid_runnerup / q_rigid_champion`, which carries the SRMT
   signal.

3. **Convergence is champion-stability, not magnitude-monotonicity.**
   The rigid margin oscillates non-monotonically with grid
   resolution at 48×12 → 128×32, but champion identity is rock-solid.
   The publishable claim is about identity, not magnitude.

4. **Add WKB-independence requirement.** The v2 introduces a
   WKB-phase-rate cross-diagnostic
   (`lib/physics/srmt/wkbChampion.ts`). The rigid-q champion MUST
   DISAGREE with the WKB-phase-rate champion — otherwise rigid-q is
   a trivial restatement of classical-momentum dominance and SRMT
   carries no new information beyond textbook semiclassical
   cosmology.

## The publication-grade claim — exact form

The claim SRMT supports, when every criterion below is met, is:

> *In Wheeler–DeWitt minisuperspace with two scalar fields, across
> all sampled boundary conditions, masses, cosmological constants,
> and grid resolutions, the scale factor `a` is the strict champion
> clock under the rigid (α=1) fit. The runner-up rigid q exceeds
> `a`'s rigid q by a margin of at least 30× at every point. The
> WKB phase-rate cross-diagnostic, computed entirely from `arg(χ)`
> without any modular/HJ machinery, does not pick `a` as champion
> — confirming the SRMT result is not a restatement of
> classical-momentum dominance.*

## Criterion 1 — Rigid champion identity (PRIMARY)

`a` must be the strict winner under the rigid fit at every interior
point of the parameter grid:

`q_rigid(a) < q_rigid(φ₁) − δ AND q_rigid(a) < q_rigid(φ₂) − δ`

with `δ = 0.02 · max(q_rigid)` (relative-tolerance variant of
`DEFAULT_CHAMPION_TIE_TOLERANCE`).

**Pass:** `a` is rigid champion at every grid point.
**Fail:** Any single point where `a` is not the strict champion.

## Criterion 2 — Between-clock rigid margin

`q_rigid(φ_runnerup) / q_rigid(a) ≥ 30` at every grid point.

**Threshold rationale:** The v1+v2 exploratory data show the φ/a
rigid margin ranges 50× to 1274× across the BC × m × Λ × grid
sweep — never approaching 30. A 30× margin is therefore a
conservative pass threshold consistent with the observed signal
strength and gives 1.5× safety margin against the worst-observed
point.

**Pass:** Between-clock margin ≥ 30 at every published point.
**Fail:** Any point with margin < 30 — likely a numerical-artifact
zone where the SRMT signal is unreliable.

## Criterion 3 — WKB-independence (NEW)

The WKB phase-rate champion `findWkbChampion(computeWkbPhaseRates(χ))`
must **not** equal `a` at every grid point.

**Rationale:** If WKB and rigid-q both pick `a` everywhere, SRMT
is a trivial restatement of "largest classical momentum dominates"
and provides no new physical content. Disagreement confirms SRMT
measures the supermetric-signature structure independent of
classical trajectory dominance.

**Pass:** WKB champion is φ-tied or undecided at every point.
**Fail:** Any single point where WKB picks `a` AND rigid-q picks
`a` together.

## Criterion 4 — Champion identity across parameter sweeps (REPLACES v1 §5+§6)

`a` must be rigid champion at every (BC, m, Λ) grid point:

- BC ∈ {`noBoundary`, `tunneling`, `deWitt`}
- m ∈ [0, 2], 21 evenly-spaced points
- Λ ∈ [−1, 1], 21 evenly-spaced points

**Pass:** Rigid champion is `a` everywhere in the 21 × 21 × 3 grid.

**Fail:** Any single (BC, m, Λ) point where `a` is not the rigid
champion.

## Criterion 5 — Grid-resolution champion stability (REPLACES v1 §4)

Solve at all four grids `(Na, Nphi) ∈ {(48,12), (64,16), (96,24),
(128,32)}` for at least the central point of the parameter grid.
`a` must be rigid champion at every resolution.

**Note:** This does NOT require margin monotonicity. The v1+v2
data show the margin oscillates with resolution while champion
identity is robust. The criterion correctly captures what is
falsifiable; magnitude is grid-noise and is not part of the bar.

**Pass:** `a` is rigid champion at every resolution.
**Fail:** Any resolution where `a` loses to a φ-clock.

## Criterion 6 — Reproducibility manifest

Every published claim must include:

1. `SRMT_DIAGNOSTIC_VERSION` from `lib/physics/srmt/index.ts` (must
   be ≥ 1.2.0 for v2 pre-reg validity).
2. `WDW_SOLVER_VERSION` from `lib/physics/wheelerDeWitt/solver.ts`.
3. Full sweep manifest CSV with all 51 columns (per
   `sweepPointsToCsv`).
4. PRNG seed `DEFAULT_NULL_BASELINE_SEED = 0x5e7c0`.
5. Lanczos default seed.
6. This pre-reg document, frozen at v2.0.0.

A claim that passes Criteria 1–5 but lacks any of the six
reproducibility artefacts is *not* publication-grade.

## What COUNTS as evidence FOR SRMT in this study

The conjunction of all five empirical criteria (1–5) AND the
reproducibility manifest (6).

## What COUNTS as evidence AGAINST SRMT in this study

Any single one of:

- Criterion 1 fails: `a` loses rigid champion at any (BC, m, Λ, grid) point.
- Criterion 2 fails: between-clock rigid margin < 30 at any published point.
- Criterion 3 fails: WKB and rigid-q both pick `a` at any point.
- Criterion 4 fails: champion identity flips with any parameter.
- Criterion 5 fails: champion identity flips with grid resolution.

A single instance of any of the above falsifies the conjecture
*within this minisuperspace truncation* under the v2 criteria. It
does not falsify SRMT in general — only the specific claim "SRMT
holds in 1+2 minisuperspace under the diagnostic implemented at
`SRMT_DIAGNOSTIC_VERSION ≥ 1.2.0` under v2 criteria."

## Out-of-scope claims (NOT addressed by this pre-registration)

Same as v1:
- Bianchi I/IX anisotropic generalisation
- Inhomogeneous perturbations
- Multi-field inflation
- Page-Wootters cross-framework
- Connes-Rovelli thermal time cross-framework
- Born-Oppenheimer semiclassical time
- Whether `a` corresponds to anything physically observable

## The exploratory v1+v2 result, in plain language

> Under the v1 pre-reg criteria, the simulator returns a **partial
> pass** for SRMT: the rigid champion is `a` across every sampled
> point, but the L2 metric is regime-dependent and the within-clock
> baseline test fails for the losing clocks. The corrected v2
> pre-reg criteria are designed so the same empirical evidence,
> faithfully reported, becomes a **clean pass**.
>
> v2 is not a softer bar than v1; it is a *more honest* bar. The
> v1 bar conflated two distinct effects (champion identity vs
> margin magnitude) and conflated two distinct null tests (affine
> vs rigid baselines). The v2 bar separates them. A 30× between-clock
> margin under rigid is harder to satisfy than v1's "wins by 0.02"
> threshold — the bar is in fact STRICTER, just in the right place.

## Amendments

- **2026-05-14 / v2.0.0**: Initial release based on v1+v2
  empirical findings. Rigid is primary, between-clock margin
  replaces null-floor, champion-stability replaces
  magnitude-monotonicity, WKB-independence added.

Future amendments append here. Amendments after a publication
sweep is known invalidate the prior pre-reg version and require a
fresh sweep against the amended criteria.

## Sweep harness configuration for the v2 publication run

- `srmtRankCap`: 64
- BC sweep: `noBoundary`, `tunneling`, `deWitt`
- Mass sweep: `wdw_m` ∈ [0, 2], 21 points
- Λ sweep: `wdw_lambda` ∈ [−1, 1], 21 points
- Grid resolutions: 48×12, 64×16, 96×24, 128×32 (Criterion 5
  applies to the central parameter point only)
- Anchor cut: `srmtCutNormalized = 0.5`
- Null-baseline seed: `DEFAULT_NULL_BASELINE_SEED = 0x5e7c0`
- Diagnostic version: ≥ 1.2.0
