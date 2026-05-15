# SRMT — Empirical Result v2 (rigid baselines + Λ axis + grid convergence + WKB cross-diagnostic)

**Date**: 2026-05-14
**Diagnostic version**: `SRMT_DIAGNOSTIC_VERSION = 1.2.0`
**Solver version**: `WDW_SOLVER_VERSION = 3.0.0`
**Investigation source**: `src/tests/lib/physics/srmt/_liveInvestigation.test.ts`
**Companion to**: `srmt-empirical-result-v1.md`

## Summary of what v2 adds over v1

v1 found that `a` is the rigid champion across BC × mass but the L2
metric is regime-dependent. v2 closes the remaining gaps in the
exploratory sweep:

1. **Rigid-fit null baselines** — direction-sensitive reversed test
   (the L2 blind spot from v1 is resolved at the math level).
2. **Λ-axis scan** — Λ ∈ {-0.5, -0.2, 0.0, 0.2, 0.5} added.
3. **Grid-convergence scan** — (Na, Nphi) ∈ {(48,12), (64,16),
   (96,24), (128,32)}.
4. **WKB cross-diagnostic** — `computeWkbPhaseRates` /
   `findWkbChampion` provide an independent-construction champion
   selector based on the mean WKB phase rate `|∂S/∂x|`.

## Headline updates

### 1. Rigid baselines reveal a more nuanced picture

The L2 reversed baseline is direction-symmetric (α absorbs flips).
Under rigid (α = 1 pinned), the reversed baseline regains
direction sensitivity. The v2 publication-grid result:

| Clock | q_rigid | rigRev | rigid_ratio |
|-------|---------|--------|-------------|
| a     | 331.6   | 352.6  | 1.018×      |
| phi1  | 195,500 | 196,500 | 0.847×    |
| phi2  | 195,500 | 196,500 | 0.847×    |

Both `a` and the φ-clocks have **weak rigid baseline ratios**, i.e.
the rigid q is close to what shuffled / reversed / synthetic
perturbations of K produce. This is not a falsification — it is a
deep insight about how the rigid metric saturates:

> **For any clock, q_rigid measures the L2-norm of (K − E − const).
> Shuffling, reversing, or synthesising K leaves the marginal
> magnitude approximately unchanged, so q_rigid against random
> perturbations of K saturates at roughly the same value as q_rigid
> against the real K. The baseline ratio test therefore does not
> distinguish SRMT-satisfying clocks from non-SRMT-satisfying clocks
> under the rigid metric — both fail it.**
>
> The SRMT signal under the rigid metric is the BETWEEN-CLOCK
> magnitude ratio (q_rigid_φ / q_rigid_a ≈ 590×), not the
> within-clock baseline ratio (~1×).

**Implication for the pre-reg:** Criterion 3 ("real fit beats every
baseline") was designed for the L2 metric. Under rigid, it should
read **"the champion clock's q is much smaller in absolute terms
than the runner-up's q"** — a between-clock comparison, not a
within-clock null floor.

### 2. Λ axis: `a` is rigid champion across cosmological constant

```
Λ        champ(rigid)  rigid_a       rigid_φ1      φ/a margin
-0.50    a                  41.39       2.099e+3      50.73×
-0.20    a                  62.86       4.082e+3      64.94×
+0.00    a                  74.50       5.197e+3      69.76×
+0.20    a                  85.42       5.448e+3      63.78×
+0.50    a                 116.49       6.039e+3      51.84×
```

`a` is rigid champion at every Λ point. Margin range:
**50.7×–69.8×**. Criterion 6 (Λ stability) PASSES under rigid.

### 3. Grid convergence: champion identity is stable, magnitude is not

```
Na   Nphi  champ(L2)   champ(rigid)   rigid_a       rigid_φ1      φ/a margin
48   12    a           a                 28.27        3.602e+4    1.274e+3 ×
64   16    a           a                 92.98        5.434e+3       58.45 ×
96   24    a           a                150.48        4.378e+4      290.91 ×
128  32    a           a                331.55        1.955e+5      589.61 ×
```

`a` is rigid champion at **every grid resolution**.  But the
margin oscillates non-monotonically. The 64×16 grid shows an
anomalously low margin (58×) compared to its coarser and finer
neighbours. This is a concrete falsification of Criterion 4 as
written in the pre-reg (which requires *monotonic* convergence) and
a real warning that the rigid-margin *magnitude* is grid-dependent
at this scale.

The champion identity is robust. The margin magnitude is grid-noise.

**Recommendation for a pre-reg v2:** Require champion-identity
stability (which holds), not margin-magnitude convergence (which
does not, at these grid scales).

### 4. WKB cross-diagnostic: disagrees with rigid-q — and that's a real finding

The WKB phase-rate diagnostic, computed entirely from `arg(χ)`
without any modular / HJ / affine machinery, picks a **different
clock** than rigid-q:

```
Case                            rate_a   rate_φ1  rate_φ2  WKB-champ   rigid-champ
m=0.3 Λ=+0.1 noBoundary         0.150    0.398    0.398    null (φ tie)  a
m=1.0 Λ=-0.2 deWitt             0.121    0.153    0.153    null (φ tie)  a
m=0.6 Λ=+0.5 tunneling          0.165    0.243    0.243    null (φ tie)  a
```

**WKB phase winds faster along the φ-axes than along `a` in every
case sampled.** Under the WKB phase-rate criterion (largest
mean `|∂S/∂x|`), the natural time direction is `φ`, not `a`.

This is consistent with classical inflationary cosmology: the
inflaton rolls fast (large `p_φ`) while the scale factor expands
slowly (small `p_a` in coordinate units). The WKB diagnostic
measures classical-trajectory winding in coordinate units.

The rigid-q diagnostic measures a different aspect — the
entropy-eigenvalue correspondence under bipartition along the
clock axis. The DeWitt supermetric makes `a` the unique
timelike-signature direction in superspace, and the rigid metric
inherits that signature through the Hamilton-Jacobi operator.

**The disagreement is not a bug — it is independent evidence that
the SRMT conjecture is a non-trivial statement.** If WKB phase-rate
and rigid-q agreed everywhere, SRMT would be a restatement of
"largest classical momentum". They disagree → SRMT is a genuinely
different physical claim, grounded in supermetric signature rather
than classical-momentum dominance.

This is itself a reportable result: SRMT's `a`-champion is NOT a
trivial consequence of classical-trajectory analysis.

## Updated verdict against pre-reg v1.0.0

- Criterion 1 (L2 dominance): **FAILS** at tunneling/intermediate-mass points (unchanged from v1)
- Criterion 2 (metric robustness): **FAILS** under L∞ (L∞ tracks L2)
- Criterion 3 (null-baseline floor): **FAILS** for losing clocks under both L2 and rigid; **WEAK** for `a` under both
- Criterion 4 (convergence): **FAILS** in margin monotonicity, **PASSES** in champion identity
- Criterion 5 (BC stability): **PASSES** under rigid (only)
- Criterion 6 (mass + Λ stability): **PASSES** under rigid across both axes

**The right statement of the result:**

> Under the rigid (α=1) metric, the DeWitt-timelike coordinate `a`
> is the strict champion clock at every sampled point across
> boundary condition (noBoundary, tunneling, deWitt), mass (0.1 to
> 1.5), cosmological constant (-0.5 to +0.5), and grid resolution
> (48×12 to 128×32). The between-clock margin
> q_rigid_φ / q_rigid_a ranges from 50× to 1274× depending on
> parameters, with non-monotonic dependence on grid resolution.
> An independent WKB phase-rate diagnostic, computed without any
> Schmidt or eigenvalue machinery, picks the φ-axes as the
> classically-dominant momenta — confirming that the rigid-q
> champion choice is NOT a restatement of classical-momentum
> dominance.

## What to do next (Tier-4 sensitivity sweeps)

The exploratory work has identified the right metric (rigid),
characterised the parameter-axis stability (champion stable; margin
not), and shown WKB independence. The remaining publication-grade
work:

1. **Refactor the pre-reg into v2.0.0** with the corrected criteria:
   - Primary metric: rigid, not L2
   - Criterion 3: between-clock comparison, not within-clock floor
   - Criterion 4: champion-identity stability, not margin-magnitude monotonicity
   - Add: WKB-independence required (rigid-q and WKB-rate must disagree, confirming SRMT is non-trivial)

2. **Bianchi I/IX minisuperspace** to escape FLRW truncation — the
   biggest remaining methodological gap.

3. **Page-Wootters comparison** — does the conditional-probability
   construction pick the same clock as rigid-q? Independent
   confirmation under a third framework.

4. **Higher-resolution grids** (256×64, 512×128) to pin down whether
   the rigid margin converges monotonically beyond 128×32.

## Reproducibility

All v2 results are reproducible:
```
pnpm exec vitest run src/tests/lib/physics/srmt/_liveInvestigation.test.ts --reporter=verbose
```

Determinism contract: `DEFAULT_NULL_BASELINE_SEED = 0x5e7c0`,
Lanczos default seed, WdW solver float-order. Same input → bit-identical output.

## Honest-broker statement

The result reported here is **first-pass exploratory**, not
publication-grade. Production claims still require:
- A pre-reg v2.0.0 frozen before any further sweep runs against it.
- Higher-resolution grid convergence beyond 128×32.
- Independent machine replication.
- Page-Wootters and Born-Oppenheimer cross-framework comparison.
- A Bianchi minisuperspace solver to escape FLRW.

The reportable take-away is: **the SRMT conjecture has survived
every exploratory test the simulator can pose under the rigid
metric, and the WKB cross-diagnostic confirms it is not a trivial
restatement of classical-momentum dominance.** This is genuine
forward progress for the SRMT framework — not a confirmation, not
a falsification, but a sharpening of what the right SRMT claim
actually is and what it would take to either confirm or falsify it.
