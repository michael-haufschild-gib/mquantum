# Wheeler–DeWitt Minisuperspace Analytic Fixtures

Closed-form / leading-WKB analytic reference solutions for validating
numerical Wheeler–DeWitt minisuperspace solvers. **Reusable** by anyone
implementing a 3D minisuperspace `(a × φ₁ × φ₂)` solver — copy
`src/lib/physics/wheelerDeWitt/analyticFixtures.ts` and the
corresponding test suite verbatim.

## Setting

The reduced Wheeler–DeWitt equation on minisuperspace
`(a, φ₁, φ₂) ∈ ℝ⁺ × ℝ²` is

```text
  [ −∂²_a + (1/a²)·(∂²_{φ₁} + ∂²_{φ₂}) + U(a, φ) ] χ(a, φ) = 0
  U(a, φ) = −c_U · a² · (1 − K · a² · V(φ))
  V(φ)    = ½ · m² · (φ₁² + φ₂²) + Λ
  c_U     = 36π²
  K       = 8πG/3
```

with `χ = a^{3/2}·Ψ` (conformal-minimal ordering). Sign convention:
`U < 0` is Lorentzian, `U > 0` is Euclidean.

For analytic-fixture purposes we set `m = 0` so `V(φ) = Λ` is φ-constant.
With a constant-in-φ initial slab, the φ-Laplacian term vanishes (a
constant is an eigenfunction of `∇²_φ` with eigenvalue 0) and the
solver reduces to the 1D problem

```text
  −χ''(a) + U(a) · χ(a) = 0,    U(a) = −c_U · a² · (1 − K·Λ·a²).
```

Three regimes — `Λ = 0`, `Λ < 0`, `Λ > 0` — are pinned by the fixtures
in `analyticFixtures.ts`.

## Regime 1: free / massless / `Λ = 0`

`U(a) = −36π²·a²` everywhere — pure Lorentzian. The reduced WdW
equation is the **Weber equation**:

```text
  χ''(a) + 36π² · a² · χ(a) = 0.
```

Substitute `t = 3π·a²`, `χ(a) = √a · w(t)`. The chain-rule reduction:

```text
  dt/da   = 6π·a
  dw/da   = (dw/dt)·(dt/da) = 6π·a · w'
  d²w/da² = 6π·w' + (6π·a)²·w'' = 6π·w' + 36π²·a²·w''
```

Together with `χ = √a·w`, `χ' = (1/(2√a))·w + √a·dw/da`, and a
careful expansion, the equation becomes Bessel's equation of order
`ν = 1/4`:

```text
  t²·w''(t) + t·w'(t) + (t² − (1/4)²)·w(t) = 0.
```

**Exact closed form**:

```text
  χ(a) = √a · [ A · J_{1/4}(3π·a²) + B · Y_{1/4}(3π·a²) ]    (free, exact)
```

Two boundary-condition correspondences:

| BC choice                    | Coefficients         | Asymptotic phase |
|------------------------------|----------------------|------------------|
| Vilenkin outgoing-wave       | `A = 1, B = i`       | `+3π·a²`         |
| Vilenkin incoming-wave       | `A = 1, B = -i`      | `-3π·a²`         |
| DeWitt (`χ(0) = 0`)          | `A = 1, B = 0`       | standing         |
| Pure-`Y` (`χ(0)` divergent)  | `A = 0, B = 1`       | standing         |

The Vilenkin outgoing-wave selection corresponds to the **Hankel
function of the first kind**:

```text
  H_{1/4}^{(1)}(z) = J_{1/4}(z) + i · Y_{1/4}(z)
  χ_outgoing(a) = √a · H_{1/4}^{(1)}(3π·a²)
```

Asymptotic form at large `a`:

```text
  χ_outgoing(a) ~ √a · √(2/(π·3π·a²)) · exp(i·(3π·a² − π/4·(2·1/4 + 1)))
              ~ (1/√(3π²·a)) · exp(i·(3π·a² − 3π/8))
```

— pure outgoing wave with logarithmic-derivative

```text
  χ'/χ ~ −1/(2a) + i·6π·a    (free, leading-WKB, valid as 3π·a² ≫ 1)
```

matching the Vilenkin BC formula in `boundaryConditions.ts:170-184`
for `V = 0`.

### Caveat: leading-WKB BC ≠ exact Hankel BC at small `a`

For `3π·a² ≲ 1` (i.e. `a ≲ 0.33`), the leading-WKB Vilenkin BC has
`O(1/(3π·a²))` deviations from the exact Hankel logarithmic derivative.
Using the leading-WKB BC seeds a small admixture of the
counter-propagating branch (J ↔ Y) that grows during propagation. The
solver-validation tests use the **exact Hankel derivative** as the BC
to avoid this — see `freeHankelDerivativeExact` in
`solverAnalytic.test.ts`.

## Regime 2: pure anti-de Sitter / `Λ < 0`

`U(a) = −36π²·a²·(1 + K·|Λ|·a²)` — pure Lorentzian everywhere (no
turning surface; `V = Λ < 0` so `wdwTurningA` returns `null`). No
global closed-form solution: the additional `c_U·K·|Λ|·a⁴` term
reduces the substitution to a non-Bessel ODE.

**Leading WKB** is closed-form:

```text
  χ_WKB(a) = |U(a)|^{-1/4} · [ A · cos Φ_L^{AdS}(a) + B · sin Φ_L^{AdS}(a) ]
  Φ_L^{AdS}(a) = ∫_0^a √|U(a')| da' = (3/(4·|Λ|)) · ((1 + K·|Λ|·a²)^{3/2} − 1)
```

Accuracy: `O(1/Φ_L)` on the deep tail (`Φ_L ≫ 1`). For typical
`|Λ| = 0.5, a ∈ [0.5, 1.5]`, `Φ_L` reaches ~10 — leading-WKB phase
gradient is accurate to ~10%.

**Outgoing-wave Hankel-like analog**: `A = 1, B = ±i`, giving
`χ ∝ |U|^{-1/4}·exp(±i·Φ_L^{AdS})`.

Provided as `wdwLeadingWkbLorentzian` in `analyticFixtures.ts`. Closed
form for `Φ_L` is `wdwLorentzianWkbPhase` in `constants.ts`.

## Regime 3: pure de Sitter / `Λ > 0`

`U(a) = −36π²·a²·(1 − K·Λ·a²)`. Has a turning surface at
`a_turn = 1/√(K·Λ)`. No global closed-form solution.

**Two analytic regimes**:

- **Lorentzian (`a < a_turn`)**: leading-WKB
  `χ ≈ |U|^{-1/4}·[A·cos Φ_L + B·sin Φ_L]` with closed-form
  `Φ_L^{dS}(a) = (3/(4·Λ))·(1 − (1 − K·Λ·a²)^{3/2})`.

- **Euclidean (`a > a_turn`)** with **Hartle–Hawking BC** (decaying
  branch): `χ_HH(a) ≈ N·|U|^{-1/4}·exp(−S_E^{dS}(a))` with closed-form
  `S_E^{dS}(a) = (3/(4·Λ))·(K·Λ·a² − 1)^{3/2}` (`wdwEuclideanWkbAction`).

**Defining HH signature**: the **renormalised tail**

```text
  T(a) = |χ(a)| · |U(a)|^{1/4} · exp(+S_E(a))    (a > a_turn)
```

should equal `|N|` (constant) on the deep Euclidean band. This is the
decaying-branch selection rule — the Vilenkin BC produces a different
(complex, non-decaying) tail.

Provided as `wdwHartleHawkingDecayingTail` in `analyticFixtures.ts`.

## Bessel implementation (`J_{1/4}`, `Y_{1/4}`)

Standard hybrid implementation:

- **Series for `|z| ≤ 6`** — Maclaurin (DLMF 10.2.2):
  ```text
    J_ν(z) = Σ_{k≥0} (−1)^k · (z/2)^{ν+2k} / (k! · Γ(ν+k+1))
    Y_ν(z) = (J_ν(z)·cos(νπ) − J_{−ν}(z)) / sin(νπ)
  ```
- **DLMF 10.17.3 asymptotic for `|z| > 6`** — three-term Hankel
  expansion in `χ = 8z`. Reaches `≲ 1e-9` Wronskian residual at the
  series/asymptotic boundary `z = 6`, improving rapidly.

Derivatives via the standard recurrence (DLMF 10.6.2):

```text
  J_ν'(z) = J_{ν−1}(z) − (ν/z)·J_ν(z)
  Y_ν'(z) = Y_{ν−1}(z) − (ν/z)·Y_ν(z)
```

For `ν = 1/4`, `J_{−3/4}` and `Y_{−3/4}` are available via the same
series/asymptotic machinery.

## Reference values

`J_{1/4}(z)` and `Y_{1/4}(z)` at sample `z`, pinned to ≥ 12 decimal
digits in `analyticFixtures.test.ts`:

| `z`   | `J_{1/4}(z)`           | `Y_{1/4}(z)`            |
|-------|------------------------|-------------------------|
| 0.1   | `0.520_657_875_630_46` | `-1.911_768_321_207_18` |
| 0.5   | `0.741_656_570_157_15` | `-0.756_843_545_694_50` |
| 1.0   | `0.752_231_333_340_79` | `-0.194_421_753_677_16` |
| 2.0   | `0.397_811_064_338_18` | `0.392_738_399_615_38`  |
| 4.0   | `-0.374_760_630_804_25`| `0.133_613_005_459_08`  |
| 6.0   | `0.030_566_899_049_91` | `-0.323_888_576_496_29` |
| 8.0   | `0.243_633_140_969_29` | `0.141_797_543_030_85`  |
| 12.0  | `-0.041_552_446_531_77`| `-0.226_474_904_732_43` |
| 20.0  | `0.178_298_338_500_80` | `-0.005_767_228_373_92` |

These values are cross-validated by:

- **Wronskian identity** `J·Y' − J'·Y = 2/(πz)` — pure consequence
  of the Bessel ODE (DLMF 10.5.2). Holds to `≲ 1e-12` in series
  regime, `≲ 5e-8` at the asymptotic boundary.
- **Hankel asymptotic envelope** `|J + i·Y| → √(2/(πz))` at large
  `z` — independent algebraic identity.
- **Hand-derived series truncation** at low `z` (e.g.
  `J_{1/4}(1) ≈ 0.7522` from k=0..3 series sum).

## Solver-vs-fixture pinning strategy

Three test classes catch three independent failure modes:

### 1. Fixture self-tests (`analyticFixtures.test.ts`)

Catches: **Bessel evaluator regressions, derivative-recurrence typos,
ODE-claim conceptual errors.**

- Pointwise pin against published table to 1e-10 relative.
- Wronskian identity to 1e-12 (series) / 5e-8 (asymptotic).
- Free-case ODE residual: 4th-order central-difference second
  derivative of `freeMinisuperspaceChi` matches `−U·χ` to 1e-5.

### 2. Solver-vs-fixture (`solverAnalytic.test.ts` — extended block)

Catches: **leapfrog dispersion, BC-injection-path bugs,
Stage-2/Stage-3 connection drift.**

- **Free case (`Λ = 0`)**: pointwise comparison against
  `√a · H_{1/4}^{(1)}(3π·a²)` with constant-φ Vilenkin-style BC
  using **exact** Hankel derivative. Tolerance: 5e-3 amplitude,
  5e-3 phase across ~3 oscillations on a 1024-cell grid.
- **AdS (`Λ < 0`)**: per-cell phase-advance over 8-cell chunks
  matches `ΔΦ_L^{AdS}` to 1e-2 rad. Phase-rate metric is
  insensitive to BC-mismatch branch admixture.
- **dS (`Λ > 0`) Lorentzian-side**: same chunked-phase pin against
  `ΔΦ_L^{dS}` for `a < a_turn`, tolerance 5e-3 rad.

### 3. Solver smoke pins (legacy block)

Catches: **gross sign/constant errors, NaN explosion.**

- Zero-crossing count matches WKB prediction within ±3.
- HH Euclidean tail constancy (renormalised tail σ-spread < 0.3).

## Tolerance notes

- **1e-3 pointwise amplitude** is achievable on the free case at
  `Na = 1024` because the BC is exact-Hankel and the operator is
  the bare Weber equation (no φ-coupling, no Stage-3 overwrite).
- **1e-3 cumulative phase** across many oscillations is **NOT**
  achievable without much finer grids — leapfrog dispersion
  accumulates as `O(da²·Φ_L)`. Per-cell-chunk phase advance is the
  correct precision tier for solver validation.
- The dS HH Euclidean tail tolerance is set by Stage-3 Langer
  connection accuracy (Airy function evaluation + affine
  Lorentzian fit + per-BC c1/c2 selection), not by leapfrog
  dispersion.

## Test-only solver entry point (`customBoundary`)

`WheelerDeWittSolverInput.customBoundary` is the test-only override
that bypasses `buildWdwBoundary(boundaryCondition, …)` and consumes
caller-supplied `(χ(a_min, ·), ∂_a χ(a_min, ·))` buffers directly.
This isolates the 1D problem at the centre of a constant-in-φ slab.

**Buffer contract**: each entry interleaved `(re, im)` pair indexed by
`i = i_phi1 * Nphi + i_phi2`. Length `2·Nphi·Nphi` per buffer.

**Stage-3 Airy selection caveat**: the BC enum is still consulted by
`extractColumnAiry` for per-BC c1/c2 weighting. For pure-Lorentzian
regimes (free, AdS — both have `V ≤ 0` so no turning surface), the
enum is a no-op label. For dS the enum should be set to whatever BC the
custom slab represents.

## Files

```text
src/lib/physics/wheelerDeWitt/
├── constants.ts                 wdwU, wdwLorentzianWkbPhase (new),
│                                wdwEuclideanWkbAction
├── analyticFixtures.ts          besselJQuarter, besselYQuarter,
│                                hankelQuarterFirstKind,
│                                freeMinisuperspaceChi(Hankel),
│                                wdwLeadingWkbLorentzian,
│                                wdwHartleHawkingDecayingTail
└── solver.ts                    WheelerDeWittSolverInput.customBoundary

src/tests/lib/physics/wheelerDeWitt/
├── analyticFixtures.test.ts     Fixture self-tests (Wronskian + table)
└── solverAnalytic.test.ts       Solver-vs-fixture pinning
```

## References

- DLMF 10.17.3 — Hankel asymptotic for J_ν, Y_ν.
- DLMF 10.5.2 — Wronskian `W{J_ν, Y_ν}(z) = 2/(πz)`.
- DLMF 10.2.2 / 10.2.3 — Bessel series.
- DLMF 9.4.x — Airy function series and asymptotic.
- Hartle, Hawking, *Wave Function of the Universe*, PRD 28 (1983).
- Vilenkin, *Boundary Conditions in Quantum Cosmology*, PRD 33
  (1986) — outgoing-wave selection rule.
