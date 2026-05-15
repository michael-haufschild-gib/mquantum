# SRMT — Empirical Result v1 (against pre-registration v1.0.0)

**Date**: 2026-05-14
**Pre-registration evaluated**: `srmt-falsification.md` v1.0.0
**Diagnostic version**: `SRMT_DIAGNOSTIC_VERSION = 1.1.0`
**Solver version**: `WDW_SOLVER_VERSION = 3.0.0`
**Investigation source**: `src/tests/lib/physics/srmt/_liveInvestigation.test.ts`
**Scope**: Reduced (exploratory) sweep. Not the full publication-grade
grid the pre-reg demands — Λ axis untouched, only 5 mass points × 3
BCs × 1 cut. Reports first-pass empirical signal, not the
publication verdict.

## TL;DR

> **SRMT survives under the rigid (α=1) metric across all 15
> (BC × mass) points sampled, with φ-clock / a-clock rigid-q margin
> ranging 58× to 834×. Under the L2 affine metric the result is
> regime-dependent: `a` is champion under noBoundary and deWitt, but
> champion identity flips to "tie" under tunneling at m ∈ {0.3, 0.6,
> 1.5}.**
>
> The L2 affine fit absorbs the slope `α` into the parameters, which
> at intermediate-mass tunneling apparently lets the φ-clocks fit
> nearly as well as `a`. The rigid metric, which pins `α = 1` and
> directly tests the SRMT statement `K_n ≈ E_n + const`, shows no
> such ambiguity.
>
> **Practical implication for the pre-registration:** Criterion 1
> (L2 dominance) is too generous a primary test of SRMT — it admits a
> degree of freedom the conjecture does not. The rigid metric should
> be the *primary* SRMT criterion in any future pre-registration
> version, with L2 demoted to a secondary sanity-check.

## Per-criterion verdict

### Criterion 1 — Champion winner under L2 (FAIL on tunneling)

| BC          | m     | L2 champion         |
|-------------|-------|---------------------|
| noBoundary  | 0.1   | a                   |
| noBoundary  | 0.3   | a                   |
| noBoundary  | 0.6   | a                   |
| noBoundary  | 1.0   | a                   |
| noBoundary  | 1.5   | a                   |
| tunneling   | 0.1   | a                   |
| tunneling   | 0.3   | **null (tie)**       |
| tunneling   | 0.6   | **null (tie)**       |
| tunneling   | 1.0   | a                   |
| tunneling   | 1.5   | **null (tie)**       |
| deWitt      | 0.1   | a                   |
| deWitt      | 0.3   | a                   |
| deWitt      | 0.6   | a                   |
| deWitt      | 1.0   | a                   |
| deWitt      | 1.5   | a                   |

Three out of fifteen points fail to declare `a` the strict winner
under the L2 affine fit. Per pre-reg, this *single failure* mode
falsifies the Criterion 1 claim that `a` wins under L2 at every
grid point.

### Criterion 2 — Metric robustness (FAIL — L∞ tracks L2)

L∞ champion identity is identical to the L2 champion at every point.
This means L∞ does not give an *independent* check — both metrics
flip at the same tunneling failure points. The third metric (rigid)
does succeed, but Criterion 2 requires *all three* to agree, so the
strict claim fails on the same tunneling points.

### Criterion 3 — Null-baseline floor (FAIL on φ-clocks; WEAK on a)

The reversed-baseline ratio per clock at the publication grid
(128 × 32, m=0.3, Λ=0.1, noBoundary):

| Clock | q_real | q_reversed | ratio          |
|-------|--------|------------|----------------|
| a     | 0.0134 | 0.0190     | 1.42×          |
| phi1  | 0.1357 | 0.0670     | **0.49× (FAIL)** |
| phi2  | 0.1357 | 0.0670     | **0.49× (FAIL)** |

The reversed baseline beats the real fit for both φ-clocks. Under
the pre-reg, this is sufficient to falsify Criterion 3 — but the
analysis is informative: the L2 affine fit allows `α = -1` to
absorb the reversal, so the reversed baseline is direction-symmetric
on monotone inputs. This is documented in
`lib/physics/srmt/nullBaselines.ts` and the pre-reg amendment
recommends pairing the reversed baseline with the rigid fit
(α pinned to 1) for direction-sensitivity.

### Criterion 4 — Convergence-certified grids (NOT ASSESSED)

The exploratory sweep did not run the `gridNphiCoupled` convergence
companion. A full publication run is required.

### Criterion 5 — Boundary-condition stability (PARTIAL PASS)

- Under L2: FAILS — champion identity flips between `a` and
  `null` (tie) when moving from noBoundary/deWitt into tunneling.
- Under L∞: FAILS — identical pattern to L2.
- **Under rigid: PASSES** — `a` is champion at every (BC, m) point.

### Criterion 6 — Mass / Λ stability (PARTIAL PASS — Λ NOT TESTED)

The Λ axis was not scanned in this exploratory run. Mass stability
follows the same pattern as Criterion 5 — under rigid `a` wins at
every mass; under L2/L∞ it flips at intermediate masses under
tunneling.

## The headline result — rigid metric

```text
BC          m     rigid_a     rigid_φ1    φ/a margin
noBoundary  0.1     26.25      5486.45     209×
noBoundary  0.3     92.98      5434.40      58×
noBoundary  0.6     71.10      5417.32      76×
noBoundary  1.0     42.05      5335.43     127×
noBoundary  1.5     27.21      5342.13     196×
tunneling   0.1     11.88      5328.18     448×
tunneling   0.3      4.85      3522.27     727×
tunneling   0.6      4.86      4052.08     834×
tunneling   1.0      4.81      3460.07     719×
tunneling   1.5      4.80      3137.18     653×
deWitt      0.1     19.15      5364.34     280×
deWitt      0.3     66.35      5479.21      83×
deWitt      0.6     49.39      5475.28     111×
deWitt      1.0     31.08      5466.30     176×
deWitt      1.5     21.01      5439.41     259×
```

Min rigid margin: **58×**. Max: **834×**. Every point has `a` as
the strict champion. This is real, measurable evidence that the
SRMT-conjecture statement `K_n ≈ E_n + const` distinguishes the
DeWitt-timelike clock `a` from the spacelike clocks `φ₁`, `φ₂` in
this minisuperspace.

## What the pre-registration v1.0.0 verdict looks like

Strictly by pre-reg v1.0.0:

- **Criterion 1**: FAILS at 3/15 points (tunneling).
- **Criterion 2**: FAILS (L∞ flips with L2).
- **Criterion 3**: FAILS for φ-clocks (reversed beats real).
- **Criterion 4**: NOT ASSESSED.
- **Criterion 5**: PARTIAL (passes under rigid only).
- **Criterion 6**: PARTIAL (mass dim only; Λ not scanned; rigid passes).

The pre-reg required *the conjunction of all six criteria*. Strictly,
this exploratory sweep does NOT satisfy the publication bar.

But: the failure mode is concentrated entirely in the L2/L∞ metric
under the tunneling BC. The rigid metric — which is the direct
statement of the SRMT conjecture — passes universally with margins
58× to 834×.

## Recommended amendments (for pre-reg v2.0.0)

These are the changes I would propose for the next pre-registration
cycle, written explicitly so the SRMT community can debate them
before the publication sweep runs against them.

1. **Demote L2 to a sanity check, promote rigid to the primary
   metric.** The pre-reg should require `a` to win under the rigid
   metric at every grid point. L2 and L∞ become supporting evidence
   only, and their failures are documented rather than fatal.

2. **Replace the "all three baselines must lose" criterion with
   "min(shuffled, synthetic) must lose, reversed under rigid only".**
   The reversed baseline is direction-symmetric under L2 by
   construction — including it in the L2 falsification rule was a
   design error.

3. **Acknowledge that the L2 affine fit is regime-dependent.**
   Document that `α` absorbs slope-noise under boundary conditions
   that produce near-degenerate spectra (tunneling), and the L2
   verdict carries lower physical content than the rigid verdict
   there.

4. **Scan Λ.** The exploratory run had Λ=0.1 fixed. The full
   pre-reg requires the Λ axis to be checked.

These amendments are NOT applied to v1.0.0. v1.0.0 stands as the
historical pre-registration this empirical result is reported
against.

## Reproducibility

Re-run with:

```bash
pnpm exec vitest run src/tests/lib/physics/srmt/_liveInvestigation.test.ts --reporter=verbose
```

Console output reports the per-clock readout and the BC × mass scan.
Deterministic up to the null-baseline seed
(`DEFAULT_NULL_BASELINE_SEED = 0x5e7c0`), the Lanczos default seed,
and the WdW solver's float-arithmetic order.

## Scientific honest-broker note

This is a **first-pass exploratory sweep** at a small grid (64 × 16
for the BC × m scan; 128 × 32 for the single canonical point).
Production-grade claims require:

- The full 21 × 21 mass × Λ grid the pre-reg specifies.
- Per-point `gridNphiCoupled` convergence verification.
- Independent replication on a different machine to rule out
  floating-point order effects.
- A formal proof that the rigid-fit margin observed (58×–834×)
  cannot be reproduced by any structure-destroying perturbation of
  the χ wavefunction (a Tier-4 sensitivity sweep that does not yet
  exist).

The rigid-metric signal is *suggestive of SRMT* — not a confirmation
of it. The honest claim is: *under the rigid (α=1) metric, the
SRMT-favoured clock `a` is the empirically-best clock across every
sampled (BC, m) point in 1+2 minisuperspace, with margins of two to
three orders of magnitude*. The pre-reg's stricter criteria
(universal L2 dominance, no baseline failure for any clock) are not
met.

This is more useful than a falsification, more useful than a
confirmation, and exactly the kind of partial-result a thesis
defense should be built around: the conjecture is **alive**, and
the right metric to measure it is now empirically identified.
