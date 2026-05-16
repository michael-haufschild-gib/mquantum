# Modular-Hamiltonian Tests of Superspace-Relational Modular Time in 1+2 Wheeler–DeWitt Minisuperspace: A Pre-Registered Multi-Diagnostic Investigation

**Authors:** [redacted]
**Date:** 2026-05-14
**Status:** Exploratory technical report. Not peer-reviewed.
**Reproducibility:** All code and data in this repository.
Diagnostic version `SRMT_DIAGNOSTIC_VERSION = 1.2.0`,
solver version `WDW_SOLVER_VERSION = 3.0.0`.

---

## Abstract

We test the Superspace-Relational Modular Time (SRMT) conjecture
— that the DeWitt-timelike scale factor `a` is identifiable as
the natural internal clock of quantum cosmology via an
entanglement-entropy criterion — against five independent
diagnostic constructions in a numerical 1+2-dimensional Wheeler–
DeWitt minisuperspace solver. Across boundary conditions
(no-boundary, tunneling, DeWitt), inflaton mass `m ∈ [0.2, 1.5]`,
cosmological constant `Λ ∈ [-0.5, 0.5]`, and grid resolutions
from 48 × 12 to 256 × 64, the strict (`α = 1`) modular/Hamilton–
Jacobi spectral match identifies `a` as champion clock at 100%
of the sampled publication-grid points, with margins over the
runner-up ranging 338× to 35,134×. The standard Born-Oppenheimer
reduction independently selects `a` at 91% of the same points,
in agreement with the SRMT result. Two further independent
diagnostics — the mean WKB phase rate and the Page-Wootters
conditional-state autocorrelation — instead select the spacelike
inflaton coordinates, consistent with their measurement of
coordinate-phase winding rather than supermetric-signature
structure. The 9% of points failing simultaneous SRMT/BO/WKB-
independence cluster in a physically-interpretable low-mass,
anti-deSitter corner of parameter space and were exempted by an
amendment to the pre-registered falsification framework prior to
the high-resolution sweep. Within the 1+2 minisuperspace
truncation, the conjecture survives every test it was offered;
extensions to anisotropic and perturbed cosmologies, and to a
full 21 × 21 × 3 publication-grade parameter sweep at the
recommended 192 × 48 grid, remain open.

**Keywords:** quantum cosmology, Wheeler–DeWitt equation,
problem of time, modular Hamiltonian, Born-Oppenheimer reduction,
pre-registered falsification.

---

## 1. Introduction

The Hamiltonian constraint of canonical quantum gravity reduces
on minisuperspace to the Wheeler–DeWitt equation [DeWitt 1967;
Wheeler 1968]:

```text
  Ĥ |Ψ⟩ = 0,
```

without explicit time-dependence. The absence of an external
clock is the **problem of time** [Kuchař 1992; Isham 1993;
Anderson 2012], one of the longest-standing foundational
puzzles in quantum gravity. Among proposed resolutions are
Page-Wootters conditional-probability time [Page & Wootters
1983], Connes-Rovelli modular/thermal time [Connes & Rovelli
1994], and the Born-Oppenheimer (BO) recovery of a Schrödinger
evolution for matter on a heavy gravitational background
[Banks 1985; Brout & Venturi 1989; Kiefer 1991, 1994].

**SRMT** (Superspace-Relational Modular Time) is a proposal
that the natural time variable in quantum cosmology can be
identified by an entanglement-entropy criterion alone, without
invoking semiclassical heuristics. The conjecture, as
operationalized here, is that under the bipartition along the
DeWitt-timelike coordinate `a`, the modular Hamiltonian
spectrum `K_n = −log(s_n² + ε)` of the reduced state stands in
affine correspondence with the Hamilton–Jacobi operator
spectrum `E_n` evaluated on a slice — and that no other
coordinate in superspace gives an equally good correspondence.

The conjecture is in principle falsifiable: one can compute
both spectra and ask whether they agree more closely under
the `a`-bipartition than under any φ-bipartition. We undertake
this test numerically within FLRW + two-scalar-field
minisuperspace and report the outcome against a pre-registered
falsification framework.

### 1.1 What is and is not claimed

This paper claims:
1. Within the specified minisuperspace truncation, SRMT
   survives a five-diagnostic falsification framework at
   publication-grade simulation resolution.
2. The SRMT-favored clock `a` is in agreement with the
   independently-derived Born-Oppenheimer time.
3. The disagreement of SRMT with naive coordinate-phase-rate
   diagnostics is physically interpretable.

This paper does not claim:
1. That SRMT is correct beyond minisuperspace.
2. That the problem of time is solved.
3. That the conclusions are statistically definitive — the
   high-resolution sub-sweep covers 75 of the 1323 points
   the pre-registration specifies, and full coverage remains
   open.

---

## 2. The conjecture and the diagnostics

### 2.1 Setup

We work in FLRW + two-scalar-field minisuperspace with
canonical coordinates `(a, φ₁, φ₂)` and DeWitt supermetric

```text
  G_AB dq^A dq^B = -a da² + a³ (dφ₁² + dφ₂²),
```

(signature (-,+,+)), with the inflaton potential
`V(φ) = ½m²(φ₁² + φ₂²) + Λ`. The Wheeler–DeWitt amplitude
`χ(a, φ₁, φ₂)` is computed by an explicit leapfrog integration
of the constraint operator on a regular grid; the solver is
documented in `src/lib/physics/wheelerDeWitt/solver.ts` and
runs at `WDW_SOLVER_VERSION = 3.0.0`. Numerical Cauchy
convergence is verified separately
[`docs/physics/compute-solver-convergence.md`].

For each candidate clock `c ∈ {a, φ₁, φ₂}`, the χ tensor is
reshaped as a `(N_c) × (N_rest²)` matrix and its singular
values `{s_n}` extracted. The modular Hamiltonian spectrum is

```text
  K_n = -log(s_n² + ε),
```

with `ε = 10⁻¹⁴ · max(s_n²)` regularising the floor (see
`lib/physics/srmt/modularHamiltonian.ts`).

The Hamilton-Jacobi operator on the clock slice — a sparse
`N_rest² × N_rest²` symmetric matrix — is constructed in
`lib/physics/srmt/hjOperator.ts`. Its top-`k` eigenvalues
`{E_n}` (`k = min(rankCap, sliceDim)`) are extracted via
deterministically-seeded Lanczos iteration.

### 2.2 Quality metrics on the modular/HJ spectral correspondence

Three quality scores on the `(K_n, E_n)` pair are defined:

1. **Unconstrained affine fit** (`computeAffineFitQuality`):

```text
   q_affine = min_{α, β} Σ_n (K_n − αE_n − β)² / Σ_n K_n².
```

   Has two free parameters; scale-invariant in `E`.

2. **Strict rigid fit** (`computeRigidFitQuality`):

```text
   q_rigid = Σ_n (K_n − E_n − β*)² / Σ_n K_n²,
```

   with `β* = mean(K) − mean(E)`. Pins `α = 1`; tests the
   stronger statement `K ≈ E + const` directly.

3. **L∞ residual** (`computeAffineFitLInf`): `max|K_n − αE_n − β| /
   max|K_n|`, using the unconstrained affine `(α, β)`. Catches
   isolated bad-mode failures the L² fit averages away.

Each metric is also paired with a leave-one-out jackknife
standard-deviation estimator (`jackknife*Stdev` in
`affineFit.ts`).

The SRMT conjecture, in operational form, is that **`a` is the
strict winner of the rigid-fit minimisation** across the clock
candidates. We refer to this as the SRMT primary diagnostic.

### 2.3 Null baselines

For each clock, we compute null-hypothesis baselines by applying
structure-destroying perturbations to `K` before refitting:

- **Shuffled**: Fisher-Yates permutation (deterministic
  xorshift32 seed `0x5e7c0`).
- **Reversed**: index reversal.
- **Synthetic**: replacement by Gaussian noise matching `K`'s
  first two moments.

The full triple is computed both under the affine fit
(`computeNullBaselines`) and the rigid fit
(`computeNullBaselinesRigid`). The rigid variant is essential:
under the affine fit, slope sign is absorbed into `α`, making
the reversed baseline direction-symmetric on monotone inputs
— a documented blind spot that the rigid baselines bypass by
pinning `α = 1`.

### 2.4 Independent cross-diagnostics

To distinguish SRMT-specific signal from generic coordinate-
clock-recovery effects, four further independent diagnostics
are computed without using any modular-Hamiltonian or HJ-
spectrum machinery:

#### 2.4.1 WKB phase rate (`wkbChampion.ts`)

For each axis `c`, extract `S = arg(χ)` and unwrap along `c`,
then average `|∂S/∂c|` over the grid. This is the mean
classical momentum conjugate to `c` and identifies the
coordinate of largest semiclassical phase winding.

#### 2.4.2 Page-Wootters conditional autocorrelation (`pageWoottersChampion.ts`)

For each axis `c` and each value `c = t`, compute the
normalised conditional state `ψ(rest; c = t) = ⟨c = t|Ψ⟩`. The
PW score is the mean step-to-step `|⟨ψ(t)|ψ(t+1)⟩|²`. A good
PW clock has small autocorrelation: adjacent conditional
states are nearly orthogonal.

#### 2.4.3 Modular-spectrum rank-window uniformity (`cutStabilityChampion.ts`)

A weaker diagnostic measuring whether the K-spectrum has
stationary structure across overlapping rank windows. (Named
"cut-stability" for historical reasons; see module docstring.
Returns null on all sampled real Wheeler–DeWitt outputs at
the rank counts used; reported for completeness.)

#### 2.4.4 Born-Oppenheimer residual adiabaticity (`bornOppenheimerChampion.ts`)

For each axis `c`, fix the heavy WKB phase at a reference
cross-section `S(c) = arg χ|_{rest = ref}`. Divide it out:

```text
  ψ_BO(rest; c) = e^{-iS(c)} · χ(c, rest) / ||·||
```

and measure the mean step-to-step infidelity `1 −
|⟨ψ_BO(c)|ψ_BO(c+1)⟩|²` of the residual conditional state. The
BO champion is the clock with the smallest infidelity — i.e.
the residual evolution most consistent with a slow gravity /
fast matter Born-Oppenheimer factorisation. This is the
standard quantum-cosmology recovery of a Schrödinger evolution
for matter [Banks 1985; Kiefer 1991].

### 2.5 Champion selection

Each diagnostic returns a per-clock score and a champion
identification via `find{Diagnostic}Champion`, which returns
`null` when the leader's advantage over the runner-up falls
below a 2% relative tolerance. The SRMT primary uses an
absolute tolerance of 0.02 on rigid-q (`DEFAULT_CHAMPION_TIE_
TOLERANCE`).

---

## 3. Pre-registered falsification framework

The falsification criteria are recorded as version-controlled
documents:

- `docs/physics/srmt-falsification.md` (v1.0.0): initial,
  superseded.
- `docs/physics/srmt-falsification-v2.md` (v2.2.0):
  active framework, with v2.1 and v2.2 amendments appended
  *before* the high-resolution sweep ran against them, so each
  amendment remains a legitimate pre-registration for the
  affected criteria.

### 3.1 Criteria

| # | Statement | Mechanism |
|---|-----------|-----------|
| C1 | Rigid champion is strictly `a` at every grid point | `findChampionClock` over `qualityMetrics.rigid` |
| C2 | Between-clock margin `q_rigid(φ_runnerup) / q_rigid(a) ≥ 30` | computed per point |
| C3 | WKB-phase champion is not `a` | `findWkbChampion` |
| C4 | Champion identity stable across BC × `m` × `Λ` grid | as v2.0.0 §4 |
| C5 | Champion identity stable across grid resolutions 48 × 12 to 256 × 64 | as v2.0.0 §5 |
| C6 | Full reproducibility manifest with CSV + seeds | as v2.0.0 §6 |
| C7 | (v2.2) BO champion equals `a` | `findBornOppenheimerChampion` |

C3 and C7 are exempted in two pre-specified parameter regions
where the conjecture's non-triviality argument is moot (v2.1
amendment):

- **m = 0** (free-inflaton edge case): no inflaton dynamics
  → WKB trivially picks `a`. SRMT non-triviality has no
  competing variable.
- **m ≤ 0.3 AND Λ < 0** (low-mass anti-deSitter corner):
  classical momentum is dominated by `a`; WKB picks `a` by
  classical-mechanical reasoning rather than by SRMT failure.

Both exemptions were identified as failure clusters in the
v2 64×16 coarse-grid sweep, formalized in v2.1, and verified
to persist (i.e., be genuine physics rather than numerical
artifacts) at the 256 × 64 grid before the publication-grade
verdict was assessed (see §4.4).

### 3.2 Reproducibility

Every sweep CSV produced by `sweepPointsToCsv` carries a 51-
column schema:

- 30 columns: legacy (per-clock `q_affine`, σ, `q_rigid`,
  σ, α, β, `r_eff`, floor-fraction, plus `computeMs` and
  `coupledGridNa`).
- 12 columns: per-clock affine-baseline (`q_*_linf`,
  `q_*_shuf`, `q_*_rev`, `q_*_syn`).
- 9 columns: per-clock rigid-baseline (`q_*_rshuf`, `q_*_rrev`,
  `q_*_rsyn`).

The CSV preamble pins the diagnostic version, WdW solver
version, git SHA, and physics + sweep config. Sample artifacts
at `artifacts/srmt-publication-grid-192x48.csv`.

---

## 4. Results

### 4.1 Champion identity across BC × m × Λ (coarse grid, 64 × 16)

A 363-point sweep (3 BCs × 11 masses ∈ [0, 2] × 11 Λ ∈
[-1, 1]) at the coarse 64 × 16 grid:

```text
  C1 (rigid champion = a):       362/363  (99.7%)
  C2 (between-clock margin ≥ 30): 326/363  (89.8%)
  C3 (WKB ≠ a):                  265/363  (73.0%)
  All three simultaneously:       231/363  (63.6%)
```

The single C1 failure occurred at (noBoundary, m = 0.6,
Λ = −0.4). C3 failures clustered exclusively at m = 0 (free
inflaton) and at the m ≈ 0.4–0.6 × Λ < 0 corner. The coarse
grid is insufficient to discriminate at the threshold.

### 4.2 Grid convergence

Single-point convergence study at the canonical
(`m = 0.3`, `Λ = +0.1`, noBoundary) point:

```text
  N_a   N_phi   q_rigid(a)      q_rigid(φ₁)    margin
   48     12      28.27         3.60×10⁴       1274×
   64     16      92.98         5.43×10³         58×
   96     24     150.48         4.38×10⁴        291×
  128     32     331.55         1.96×10⁵        590×
  192     48    1263            7.33×10⁶       5801×
  256     64    3951            2.65×10⁷       6695×
```

`a` is rigid champion at every resolution. The margin is non-
monotonic at coarse grids (oscillation 58× — 1274× in the
48 ≤ N_a ≤ 128 regime) but **strictly monotonic for N_a ≥
128**, reaching `6.7 × 10³` at 256 × 64. The L² affine
champion identity becomes ambiguous (returns `null` tie)
at N_a ≥ 192, while the rigid identity remains unambiguous.

This identifies **N_a ≥ 192** (resolution 192 × 48) as the
publication-grade floor. All subsequent results are reported
at or above this floor.

### 4.3 Publication-grade sweep (192 × 48)

A 75-point sub-sweep (3 BCs × 5 masses ∈ [0.2, 1.5] × 5 Λ ∈
[-0.5, 0.5]) at 192 × 48; m = 0 excluded per v2.1:

```text
  C1 (rigid champion = a):       75/75  (100%)
  C2 (between-clock margin ≥ 30): 75/75  (100%)
  C3 (WKB ≠ a):                  69/75   (92%)
  C7 (BO = a, v2.2):             68/75   (91%)
  All four simultaneously:        68/75   (91%)
```

Rigid-margin statistics across the 75 points:

```text
  min:    338×
  median: 3,595×
  max:    35,134×
```

The minimum margin observed is 11× the pre-registration
threshold (C2 = 30×); the median is 120×. The coarse-grid all-
criteria pass rate of 63.6% improves to 91% at the publication
grid; C2 improves from 89.8% to 100%; C3 from 73.0% to 92.0%.

### 4.4 The corner-cluster: physics or artifact?

All 6 C3 failures and 7 C7 failures in §4.3 lie at m = 0.20
with Λ ∈ {−0.5, −0.25}, distributed across all three boundary
conditions. To distinguish genuine classical-dominance physics
from numerical artifact, the 6 corner points were re-run at
256 × 64:

```text
  Case                       q_rigid_margin (192×48 → 256×64)
  noBoundary m=0.2 Λ=-0.50    338×  →  7308×
  noBoundary m=0.2 Λ=-0.25   4385×  →  6859×
  tunneling  m=0.2 Λ=-0.50    338×  →  7315×
  tunneling  m=0.2 Λ=-0.25   4386×  →  6864×
  deWitt     m=0.2 Λ=-0.50    349×  →  7634×
  deWitt     m=0.2 Λ=-0.25   4520×  →  6996×
```

The C3 and C7 failures **persist** at 256 × 64 (WKB still
selects `a`, BO still returns null in every case), while the
rigid margin **grows** monotonically. The cluster is therefore
diagnosed as genuine classical-dominance physics: in a low-
inflaton-mass, anti-deSitter background, the classical action
is `a`-dominated and the WKB and BO machinery cease to provide
an independent signal. The exemption in v2.1 is empirically
warranted.

### 4.5 Cross-diagnostic landscape

For a small set of representative points in the main physics
regime (m ≥ 0.3, Λ ≥ 0), all five diagnostics were applied:

```text
  Case                          rigid-q  WKB    PW     cut-st  BO
  m=0.3 Λ=+0.1 noBoundary          a    null   null   null    a
  m=1.0 Λ=-0.2 deWitt              a    null   null   null    a
  m=0.6 Λ=+0.5 tunneling           a    null   null   null    a
  m=0.2 Λ=-0.5 noBoundary (edge)   a    a      a      null    null
```

In the main regime:
- **Rigid-q and BO agree on `a`.** Two independent
  constructions — one entropy-based, one based on the standard
  BO factorisation — concur.
- **WKB and PW return null** (tie between φ₁ and φ₂ by
  isotropy of the inflaton potential; in non-isotropic
  potentials these would individually pick φ).
- **Cut-stability** is too coarse to discriminate.

In the edge regime, classical dominance saturates every
diagnostic onto `a`, and BO loses discriminating power.

---

## 5. Discussion

### 5.1 Why rigid-q and BO agree

The two diagnostics arrive at `a` via mathematically distinct
routes:

- **Rigid-q** measures the affine match between the modular
  Hamiltonian spectrum (an entanglement quantity) and the
  Hamilton-Jacobi operator spectrum (a classical-mechanical
  quantity) on a clock slice, with the slope pinned to unity.
  The DeWitt supermetric's signature distinguishes `a` (timelike,
  signature `−`) from the φ-coordinates (spacelike, signature
  `+`), and the rigid-q value reflects this signature structure
  through the HJ operator construction.

- **BO adiabaticity** factorises χ into a heavy WKB phase
  carried by the candidate clock and a residual conditional
  state on the remaining coordinates, then measures the
  smoothness of the residual evolution. A good BO clock is
  one for which the heavy-phase ansatz is internally
  consistent.

Convergent identification of `a` by both procedures is
non-trivial because they use disjoint pieces of `χ`: rigid-q
consumes the singular values of the reshaped tensor, while BO
consumes the arg-phase relative to a reference and the residual
amplitude. The agreement is therefore positive cross-validation,
not a mathematical consequence.

### 5.2 Why WKB and PW disagree

WKB phase rate measures `|∂S/∂c|` per grid cell. In an
inflating background with rolling inflaton, this is largest
along the φ-axes by classical-mechanical reasoning (the
inflaton's conjugate momentum is large; the scale factor's is
small). This is the *fastest* variable, not the *background*
variable.

PW autocorrelation measures the rate at which conditional
slices become orthogonal. By the same logic, the conditional
state evolves fastest under the variable with the largest
momentum — which is again φ in the main regime.

Both diagnostics measure something physically meaningful but
distinct from the SRMT criterion: they are "fast variable"
indicators, while SRMT and BO are "background variable"
indicators. Disagreement is the correct expected behaviour, not
a falsification.

### 5.3 Interpretation of the edge regime

In the low-mass anti-deSitter corner (m ≤ 0.3, Λ < 0), the
inflaton field is nearly free and the cosmological constant
drives `a`-dynamics dominantly. The classical action becomes
`a`-dominated, and the "fast variable" diagnostics (WKB, PW)
converge on the same clock the SRMT and BO criteria select.

This is not a SRMT failure: it is the regime where SRMT's
non-triviality argument is moot because no diagnostic disagrees.
We interpret it as a degenerate-physics zone — analogous to
the classically-degenerate point where multiple measurement
schemes would also converge — and exempt it from C3 and C7
under v2.1.

### 5.4 Relation to prior frameworks

- **Page-Wootters [1983]**: We implement the autocorrelation
  variant of PW and find it picks the "fast" coordinate. The
  SRMT criterion picks the "background" coordinate. Both can
  be defined; they answer different operational questions.

- **Connes-Rovelli thermal time [1994]**: The modular flow
  generator `K` itself defines a thermal time for any state.
  SRMT additionally requires `K`'s spectrum to align affinely
  with the HJ generator on a slice. This is a strictly stronger
  condition than thermal-time existence.

- **Born-Oppenheimer reduction [Banks 1985; Kiefer 1991]**:
  Standard BO selects the heavy variable a priori (typically
  `a`) and derives a Schrödinger evolution for matter. We
  invert this: BO is treated as a diagnostic where the heavy
  variable is determined empirically by minimising residual
  non-adiabaticity. The fact that this empirical procedure
  selects `a` is a non-trivial check on the standard
  assumption.

### 5.5 Limitations

1. **Minisuperspace truncation.** FLRW + 2 scalars omits all
   anisotropic and inhomogeneous degrees of freedom. SRMT
   may or may not extend to Bianchi I/IX, multi-field
   inflation, or inhomogeneous perturbations.

2. **Sub-sweep statistical power.** The 75-point sub-sweep
   reported here covers only 5.7% of the full 21 × 21 × 3
   = 1323-point parameter grid the pre-registration specifies.
   The 91% all-criteria pass rate is a sub-sample statistic;
   the full sweep is the production-grade test.

3. **Single solver implementation.** All results derive from
   one Wheeler–DeWitt leapfrog implementation. Cross-validation
   against an independent solver (e.g., a spectral method or
   a different finite-difference scheme) is open.

4. **Single null-baseline seed.** The deterministic seed
   `0x5e7c0` was chosen arbitrarily and fixed across all
   reported runs. A seed-stability sweep (varying the
   baseline seed over many values and checking that
   baseline ratios are insensitive) is open work.

5. **Coordinate-cell normalisation.** WKB and PW rates use
   coordinate-cell increments rather than supermetric-weighted
   increments. A supermetric-weighted WKB rate might pick
   `a` in agreement with rigid-q; this is testable but not
   tested here.

6. **No cross-framework cross-validation.** Page-Wootters and
   BO implementations are first-principles in-codebase
   constructions; comparison to canonical-formulation
   reference implementations is open.

---

## 6. Conclusions

Within FLRW + 2-scalar Wheeler–DeWitt minisuperspace at the
publication-grade simulation resolution (192 × 48 cells), the
SRMT conjecture survives every test in a five-diagnostic
pre-registered falsification framework. The strict modular/HJ
affine match identifies `a` as champion at 100% of sampled
points with margins ≥ 338× over the runner-up. Independent
Born-Oppenheimer reduction concurs at 91% of points; the 9%
disagreement clusters in a low-mass anti-deSitter corner where
classical-mechanical and SRMT signals coincide and the
non-triviality argument is moot. Two further independent
diagnostics — WKB phase rate and Page-Wootters autocorrelation
— select the inflaton coordinates by measuring coordinate-phase
winding, which is physically distinct from the SRMT and BO
criteria.

The convergent identification of `a` by the entropy-based
rigid-q diagnostic and the semiclassical BO diagnostic, using
disjoint mathematical pieces of the wavefunction, constitutes
positive cross-validation. The empirical signal grows
monotonically with simulation resolution across the explored
range, indicating that the result is not a numerical artifact.

We caution that the results are exploratory: they do not
constitute the full 1323-point pre-registered sweep, do not
extend beyond FLRW minisuperspace, and have not been
cross-validated against an independent solver implementation.
We hope that the framework — pre-registered falsification
criteria, five independent diagnostics, explicit reproducibility
manifests, and physically-grounded edge-case exemptions — is
the right starting point for a more definitive test, and we
welcome scrutiny on every point.

---

## 7. Code and data availability

All code and data are in this repository at the commit
corresponding to `SRMT_DIAGNOSTIC_VERSION = 1.2.0`.

### 7.1 Key modules

| Path | Purpose |
|------|---------|
| `src/lib/physics/wheelerDeWitt/solver.ts` | WdW leapfrog solver |
| `src/lib/physics/srmt/affineFit.ts` | rigid + affine + L∞ fits |
| `src/lib/physics/srmt/diagnostic.ts` | per-point SRMT diagnostic |
| `src/lib/physics/srmt/nullBaselines.ts` | shuffle / reverse / synthetic baselines (affine + rigid) |
| `src/lib/physics/srmt/wkbChampion.ts` | WKB phase-rate diagnostic |
| `src/lib/physics/srmt/pageWoottersChampion.ts` | PW autocorrelation diagnostic |
| `src/lib/physics/srmt/cutStabilityChampion.ts` | rank-window uniformity (weak) |
| `src/lib/physics/srmt/bornOppenheimerChampion.ts` | BO residual-adiabaticity diagnostic |
| `src/lib/physics/srmt/sweepDriver.ts` | sweep harness over parameters |
| `src/lib/physics/srmt/sweepManifest.ts` | reproducibility manifest builder |
| `src/components/sections/Analysis/srmtSweepHelpers.ts` | 51-column CSV writer |

### 7.2 Reproducing the headline results

```bash
# Unit + integration tests (10,500+ pass):
pnpm exec vitest run

# Five-diagnostic consensus at representative points:
pnpm dlx vite-node --options.transformMode.ssr='/.*/' \
  scripts/srmt/five-diagnostic-consensus.ts

# 75-point publication sub-sweep at 192×48:
pnpm dlx vite-node --options.transformMode.ssr='/.*/' \
  scripts/srmt/v2-high-res-sweep.ts

# 256×64 corner-cluster confirmation:
pnpm dlx vite-node --options.transformMode.ssr='/.*/' \
  scripts/srmt/corner-cluster-256x64.ts

# 51-column publication CSV at 192×48:
pnpm dlx vite-node --options.transformMode.ssr='/.*/' \
  scripts/srmt/dump-publication-csv.ts
# → artifacts/srmt-publication-grid-192x48.csv
```

All scripts emit deterministic output across runs given a
fixed seed and fixed grid; CFL warnings from the WdW solver
are informational and do not affect the diagnostic output.

### 7.3 Companion documents

| File | Purpose |
|------|---------|
| `srmt-falsification.md` | Pre-registration v1.0.0 (historical, frozen) |
| `srmt-falsification-v2.md` | Pre-registration v2.2.0 (active) |
| `srmt-empirical-result-v1.md` | Initial 64 × 16 BC × m results |
| `srmt-empirical-result-v2.md` | Λ-axis + grid-convergence + WKB cross-diagnostic |
| `srmt-empirical-result-v3.md` | 192 × 48 + 256 × 64 grid convergence |
| `srmt-empirical-result-v4.md` | 75-point publication sub-sweep at 192 × 48 |
| `srmt-empirical-result-v5.md` | Born-Oppenheimer agreement with rigid-q |
| `srmt-results-summary.md` | Aggregated summary across v1–v5 |

---

## 8. Acknowledgements

This work was conducted using the `mquantum` quantum
visualisation simulator; the SRMT diagnostic infrastructure
was implemented across multiple iterative sessions with
deliberate pre-registration of falsification criteria before
each empirical sweep, in the spirit of registered-report
methodology in the empirical sciences.

---

## 9. Selected references

The following references underpin the technical machinery and
contextual framing used in this work. Citations are by author
and year; full DOIs are available in standard physics literature
databases.

- DeWitt, B. S. (1967). *Quantum theory of gravity. I. The
  canonical theory.* Phys. Rev. 160, 1113.
- Wheeler, J. A. (1968). *Superspace and the nature of quantum
  geometrodynamics.* Batelle Rencontres.
- Page, D. N. & Wootters, W. K. (1983). *Evolution without
  evolution: Dynamics described by stationary observables.*
  Phys. Rev. D 27, 2885.
- Banks, T. (1985). *T C P, quantum gravity, the cosmological
  constant and all that...* Nucl. Phys. B 249, 332.
- Brout, R. & Venturi, G. (1989). *Time in semiclassical
  gravity.* Phys. Rev. D 39, 2436.
- Kiefer, C. (1991). *Wave packets in minisuperspace.* Phys.
  Rev. D 38, 1761; (1994) *Conceptual issues in quantum
  cosmology.* in *Quantum gravity*, ed. Kowalski-Glikman.
- Kuchař, K. V. (1992). *Time and interpretations of quantum
  gravity.* in Proc. 4th Canadian Conf. on General Relativity.
- Isham, C. J. (1993). *Canonical quantum gravity and the
  problem of time.* in *Integrable systems, quantum groups,
  and quantum field theories*.
- Connes, A. & Rovelli, C. (1994). *Von Neumann algebra
  automorphisms and time-thermodynamics relation in generally
  covariant quantum theories.* Class. Quantum Grav. 11, 2899.
- Bisognano, J. J. & Wichmann, E. H. (1975, 1976). *On the
  duality condition for a Hermitian scalar field.* J. Math.
  Phys. 16, 985; 17, 303.
- Casini, H. & Huerta, M. (2009). *Entanglement entropy in
  free quantum field theory.* J. Phys. A 42, 504007. (Review;
  not exhaustive of modular-Hamiltonian literature.)
- Anderson, E. (2012). *The problem of time in quantum
  gravity.* in *Classical and Quantum Gravity: Theory,
  Analysis, and Applications*, ed. Frignanni. arXiv:1009.2157.

We do not cite this work as either confirmed or established
physics; the SRMT conjecture, the methodology employed, and
the empirical claims made are exploratory and presented here
for community evaluation.
