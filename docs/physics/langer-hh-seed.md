# Langer-Uniform Hartle–Hawking Boundary Seed

**Status**: Normative derivation for Phase 2 of the Wheeler–DeWitt solver physics-correctness overhaul (`docs/plans/wdw-solver-physics-correctness.md`).
**Audience**: Implementers of `boundaryConditions.ts` and `exactColumnSolution.ts`, and future reviewers who need to re-derive the seed from first principles.
**Scope**: The one-dimensional ODE solved per `(φ₁, φ₂)` column at `a = a_min`. The multidimensional bulk evolution is a separate concern (`docs/physics/wdw-bulk-stability.md`).

The derivation here is the single source of truth for the three regime-specific forms implemented in `src/lib/physics/wheelerDeWitt/exactColumnSolution.ts`. If the code and this document disagree, one of them is wrong; fix whichever is inconsistent with the analytic content below.

## 1. Reduction of the full WdW equation to a 1D ODE per column

The two-inflaton minisuperspace Wheeler–DeWitt equation in `G = ℏ = c = 1` natural units reads

```
[ −∂²_a + (1/a²) · (∂²_{φ₁} + ∂²_{φ₂}) + U(a, φ) ] · χ(a, φ₁, φ₂) = 0
```

with

```
U(a, φ)    = −c_U · a² · (1 − K · V(φ) · a²)
V(φ)       = ½ · m² · φ₁² + ½ · (m·α)² · φ₂² + Λ
c_U        = 36 π²
K          = 8πG/3 = 8π/3
χ(a, φ)    = a^{3/2} · Ψ(a, φ)
```

See `src/lib/physics/wheelerDeWitt/constants.ts:25-128` for the definitions. The `a^{3/2}` reduction is the conformal-minimal factor ordering: its effect is to clear the first-derivative in `a` from the original WdW equation for `Ψ`, yielding the pure second-order hyperbolic/elliptic form above for `χ`.

**Why 1D at `a = a_min`.** The seed is imposed on the single slice `a = a_min`. At that slice `(1/a²)·∇²_φ · χ` is a known function of `φ` if we fix a smooth `φ`-profile for the seed, but the physics of the seed is a statement about the `a`-direction: which branch of the `a`-ODE the solution selects. For each column `(φ₁, φ₂)` the equation reduces to

```
−χ''(a) + U(a, φ) · χ(a) = (1/a²) · ∇²_φ · χ
```

The right-hand side is sub-leading compared to `U·χ` whenever the seed's `φ`-profile is smooth on the scale of `a_min`. At `a = a_min` the physical selection rule (HH = no-boundary, Vilenkin = tunneling, DeWitt = vanishing at the classical singularity) is a statement about the solution of the **pure 1D ODE**

```
−χ''(a) + U(a, φ) · χ(a) = 0         (at fixed φ)
```

Column by column. The 1D `c₁`, `c₂` (or complex `A`, `B`) encode the physical branch; the φ-dependence is absorbed into `N_HH(φ)`, the Gaussian classical prefactor from the Euclidean instanton. This is why the HH seed is specified one column at a time, with a φ-smooth envelope threaded on top.

## 2. Three regimes by sign of V(φ)

The operator `U(a, φ)` is a quartic polynomial in `a` with zero at the turning surface `a_turn(φ) = 1/√(K·V)` when `V(φ) > 0`; no real zero when `V(φ) ≤ 0`. The 1D ODE's character changes accordingly:

| Regime      | `V(φ)` | Turning surface       | Reference form                                                                |
| ----------- | ------ | --------------------- | ----------------------------------------------------------------------------- |
| dS cell     | `> 0`  | `a_turn = 1/√(K·V)`   | Langer-uniform Airy: `(ζ/U)^{1/4}·[c₁·Ai(ζ) + c₂·Bi(ζ)]`                      |
| Free cell   | `= 0`  | None                  | Exact Bessel-¼: `√a·[A·J_{1/4}(3π·a²) + B·Y_{1/4}(3π·a²)]`                    |
| AdS cell    | `< 0`  | None                  | Leading-WKB `|U|^{−1/4}·[A·cos Φ_L + B·sin Φ_L]` (asymptotic only; see §4)     |

The V>0 Langer-Airy form is uniform-asymptotic across the turning surface, the V=0 Bessel form is pointwise-exact, and the V<0 form is accurate only in the leading-WKB regime `Φ_L ≫ 1` — there is no closed-form exact solution of the quartic-in-`a` ODE on the Lorentzian-everywhere AdS branch (see §4 for the error bound and why the agreement test tolerates `O(1/Φ_L)` for V<0). These are the references used by `exactColumnSolution.ts` (see table at lines 14–24 of that file) and by the validation harness `exactSolutionAgreement.test.ts` introduced in Phase 1.

## 3. V > 0: Langer-uniform Airy form

### 3.1 Derivation

For `V > 0` the potential `U(a)` crosses zero once at `a_turn`. A plain leading-WKB ansatz `χ ∼ |U|^{−1/4}·exp(±∫√|U|·da)` is singular at the turning surface and drops sub-leading corrections that are `O(1)` inside `|ζ| ≲ 1` (where ζ is the Langer variable, defined below). The **Langer transformation** replaces the WKB ansatz with a uniformly-valid form that regularises the turning surface exactly.

Define the signed Langer variable

```
ζ(a, φ) = −((3/2)·S_L(a, φ))^{2/3}    for  a < a_turn   (Lorentzian, U < 0)
ζ(a, φ) = +((3/2)·S_E(a, φ))^{2/3}    for  a > a_turn   (Euclidean, U > 0)
```

where

```
S_L(a, φ) = ∫_a^{a_turn} √|U(a', φ)| da' = (3/(4V))·(1 − KVa²)^{3/2}
S_E(a, φ) = ∫_{a_turn}^a √U(a', φ) da'  = (3/(4V))·(KVa² − 1)^{3/2}
```

(closed forms; see `constants.ts:158-246`). By construction `(2/3)·|ζ|^{3/2} = S_L` or `S_E` on the appropriate side, with `ζ` passing smoothly through zero at the turning surface. The signed convention (negative in Lorentzian, positive in Euclidean) is chosen so the standard identity `Ai(ζ)` solves `Ai''(z) = z·Ai(z)` reproduces the correct oscillatory-decaying asymptotics on the two sides without further sign flips. See `constants.ts:298-341` for the implementation.

Writing `χ(a) = (ζ/U)^{1/4}·W(ζ(a))` and computing

```
χ'(a)  = (ζ/U)^{1/4} · [(1/4)·(ζ'/ζ − U'/U)·W(ζ) + W'(ζ)·ζ'(a)]
χ''(a) = ... (algebra)
```

and substituting into `−χ'' + U·χ = 0` gives, after the Langer change of variable, an equation for `W`:

```
W''(ζ) = ζ · W(ζ) + O(Langer-subleading)
```

The Airy equation. Its two independent solutions are `Ai(ζ)` and `Bi(ζ)` (DLMF 9.2), so the uniformly-valid reference form is

> **`χ(a) = (ζ(a) / U(a))^{1/4} · [c₁·Ai(ζ(a)) + c₂·Bi(ζ(a))]`**

The Langer "correction" — the `(ζ/U)^{1/4}` prefactor — resums exactly the subleading WKB terms that a plain `|U|^{−1/4}` amplitude misses near the turning surface.

### 3.2 Signed-ζ sanity check

The ratio `ζ/U` is always positive because `ζ` and `U` change sign simultaneously at the same `a = a_turn`:

- `a < a_turn`: `U < 0`, `ζ < 0`, ratio `> 0`.
- `a > a_turn`: `U > 0`, `ζ > 0`, ratio `> 0`.

At `a = a_turn` both vanish at the same linear rate in `(a − a_turn)`, so `ζ/U` limits to a finite positive number (the ratio of the two Taylor slopes). The fourth root `(ζ/U)^{1/4}` is therefore real and regular through the turning surface, as required for a physical wavefunction. `langerPrefactor` in `exactColumnSolution.ts:108-115` implements exactly this.

### 3.3 Emergence of leading WKB as |ζ| → ∞

For large positive `ζ` (deep Euclidean), DLMF 9.7.5–6 gives

```
Ai(ζ) ~ (1/(2√π)) · ζ^{−1/4} · exp(−(2/3)·ζ^{3/2}) · [1 − u₁/ξ + ...]
Bi(ζ) ~ (1/√π)    · ζ^{−1/4} · exp(+(2/3)·ζ^{3/2}) · [1 + u₁/ξ + ...]
```

with `ξ = (2/3)·ζ^{3/2} = S_E`. Substituting into the Langer form with `c₂ = 0` (HH; see §3.4):

```
χ_HH(a) = (ζ/U)^{1/4} · (1/(2√π)) · ζ^{−1/4} · exp(−S_E) · [1 + O(1/S_E)]
        = (1/(2√π)) · |U|^{−1/4} · exp(−S_E) · [1 + O(1/S_E)]
```

This is the standard Euclidean WKB decaying branch. For large negative `ζ` (deep Lorentzian) DLMF 9.7.9–10 gives

```
Ai(−x) ~ π^{−1/2} · x^{−1/4} · sin(ξ + π/4)
Bi(−x) ~ π^{−1/2} · x^{−1/4} · cos(ξ + π/4)
```

with `x = |ζ|`, `ξ = (2/3)·x^{3/2} = S_L`. Then

```
χ_HH(a) = (ζ/U)^{1/4} · π^{−1/2} · |ζ|^{−1/4} · sin(S_L + π/4)
        = π^{−1/2} · |U|^{−1/4} · sin(S_L + π/4)
```

The standard Lorentzian WKB oscillating branch, with the Airy-connection phase shift `+π/4` between the Euclidean decaying branch and the Lorentzian standing wave baked in. This `π/4` phase is the exact content that the leading-WKB seed (`boundaryConditions.ts:150-158`) gets wrong at finite ζ — it treats the oscillation as purely `exp(−|S_E|)` with no connection-phase bookkeeping.

**Key point**: at `|ζ| → ∞` the Langer-uniform form reduces to the buggy leading-WKB form, but at the operative `a_min = 0.1` where `|ζ(a_min)| ≈ 1.6` (O(1), not asymptotic) the Langer form differs from leading-WKB by `O(1)` correction factors — which is the origin of the 53% `Bi`-branch contamination in Finding 1 of the plan (`|c₂/c₁| = 0.53`, see plan §"Finding 1 — HH seed projects onto Ai+Bi, not pure Ai").

### 3.4 HH proposal selects c₂ = 0 (pure Ai)

The Hartle–Hawking no-boundary proposal defines the wavefunction of the universe as a Euclidean path integral over **compact geometries that close smoothly at `a = 0`**. In the semiclassical limit this integral is dominated by the Euclidean instanton action `S_E^HH`, and the wavefunction in the forbidden (Euclidean) region is

```
Ψ_HH(a) ∝ exp(−S_E^HH(a))   for  a > a_turn
```

— the **decaying-at-Euclidean-infinity** branch. In the Langer-uniform basis `{Ai, Bi}` this is pure `Ai`: from §3.3, `Ai(ζ)` is the branch that decays as `exp(−S_E)` for large positive ζ, while `Bi(ζ)` grows as `exp(+S_E)`. Admixing any amount of `Bi` corresponds to including the non-physical Euclidean-growing branch, which dominates over the HH instanton as `a → ∞` and is physically excluded.

Therefore

> **HH: `c₁ = N_HH(φ)`, `c₂ = 0`.**

The real normalisation `N_HH(φ)` is set by the Gaussian classical prefactor at `a → 0⁺` — see §5 — or equivalently by matching to the legacy `exp(−|S_E^HH|)` amplitude at the seed's `a_min`.

### 3.5 Closed-form derivative ∂_a χ_HH

The Langer form is a product of the prefactor `(ζ/U)^{1/4}` and the Airy combination `W(ζ) = c₁·Ai(ζ) + c₂·Bi(ζ)`. Chain rule:

```
∂_a χ = ∂_a [(ζ/U)^{1/4}] · W(ζ) + (ζ/U)^{1/4} · W'(ζ) · ζ'(a)
     = (ζ/U)^{1/4} · [(1/4) · (ζ'/ζ − U'/U) · W(ζ) + W'(ζ) · ζ'(a)]
```

with the Langer prefactor's logarithmic derivative simplified by `d/da[(ζ/U)^{1/4}] = (1/4)·(ζ/U)^{1/4}·(ζ'/ζ − U'/U)`. The individual factors:

```
U'(a)   = 2·c_U·a·(2·K·V·a² − 1)     (from  U = −c_U·a²·(1 − K·V·a²))
ζ'(a)   = √|U(a)| / √|ζ(a)|          (from  (2/3)·|ζ|^{3/2} = S,  dS/da = √|U|)
W'(ζ)   = c₁·Ai'(ζ) + c₂·Bi'(ζ)      (from  airy.ts)
```

The derivative formula is implemented line-for-line in `exactColumnSolution.ts:170-195`, using `dUdaAnalytic` (line 81) and `dZetaDaAnalytic` (line 93). The sign of `ζ'` is `+1` always (ζ is monotone-increasing through the turning surface in our sign convention), justifying the explicit `+` in `dZetaDaAnalytic`.

### 3.6 Taylor expansion near ζ = 0 (turning surface)

The expression `(1/4)·(ζ'/ζ − U'/U)` is a `0/0` indeterminate form at `ζ = 0`: both `ζ` and `U` vanish linearly in `(a − a_turn)`, so both `ζ'/ζ` and `U'/U` diverge as `1/(a − a_turn)`, but their difference is finite. Evaluating the limit requires the next Taylor coefficient in either numerator.

The `exactColumnSolution.ts` implementation chooses a different route: it detects `|ζ| < 1e-3` and evaluates `∂_a χ` by a symmetric finite difference of `langerChiReal`:

```ts
const h = max(1e-6 · a_turn, 1e-8)
dChiReal = (langerChiReal(a + h) − langerChiReal(a − h)) / (2h)
```

(lines 182-188). This is acceptable because:

1. The value `langerChiReal(a)` itself is regular through `ζ = 0` — the prefactor `(ζ/U)^{1/4}` limits to `(dζ/da)^{1/4} · (dU/da)^{−1/4}|_{a_turn}` which is O(1), and `Ai(0) ≈ 0.3550` is a finite constant. So the symmetric finite difference commits no cancellation error.
2. The truncation error of symmetric FD is `O(h²·χ''')`. With `h ∼ 1e-6·a_turn` and `χ'''` bounded by the Airy equation `χ''' = (a·...)`, the FD error is `O(1e-12)`, well below f32 mantissa (`2⁻²³ ≈ 1.2e-7`) and sufficient for physics purposes.
3. The analytical alternative — tabulating the Taylor coefficient of `(ζ'/ζ − U'/U)` at `a_turn` — is algebraically messy (requires second Taylor coefficients of both `ζ(a)` and `U(a)` at `a_turn`) and offers no precision advantage given that the Airy-value-dominated path already costs a call to `airyAll`.

At the turning surface itself `ζ(a_turn) = 0`, `U(a_turn) = 0`, and

```
χ_HH(a_turn) = (dζ/da / dU/da)^{1/4}|_{a_turn} · Ai(0)
             = (1 / (2·c_U·a_turn·(2·K·V·a_turn² − 1)))^{1/4} · |U|^{−1/4}_{next-order} · 0.3550...
```

The `dU/da` denominator at `a = a_turn` is `2·c_U·a_turn·(2·K·V·a_turn² − 1) = 2·c_U·a_turn·(2 − 1) = 2·c_U·a_turn` (since `K·V·a_turn² = 1` at the turning surface), so

```
χ_HH(a_turn) = Ai(0) · (1 / (2·c_U·a_turn · dU/da))^{1/4} · (regular factor)
```

— a positive real number of order unity. Numerically, for the default preset (`m=0, Λ=0.5, a_turn ≈ 0.489`), `χ_HH(a_turn) ≈ 0.2`.

## 4. V < 0: Hankel form (no turning surface)

### 4.1 Derivation

For `V(φ) < 0` the combination `(1 − K·V·a²) = (1 + K·|V|·a²) > 1` everywhere, so `U(a, φ) = −c_U·a²·(...) < 0` for all `a > 0`. There is no turning surface; the ODE is purely Lorentzian-oscillatory on the entire `a`-axis, with an `a`-dependent frequency `√|U(a)|`.

The Langer transformation is not applicable (no zero of `U` to regularise around). For constant-`V` columns the ODE is

```
−χ''(a) − c_U · a² · (1 + K·|V|·a²) · χ(a) = 0
```

a quartic-in-`a` linear ODE with no known closed-form solution in elementary functions. However, using the substitution `u = a²`, `χ = a^{1/2}·w(u)` reduces the ODE to a linear ODE in `u` whose leading form for large `|V|`-dominated `a` is Bessel-like — this is the heuristic that motivates the

> **Hankel reference form**: `χ(a) = a^{3/2} · [α·H_{1/4}^{(1)}(Φ_L(a)) + β·H_{1/4}^{(2)}(Φ_L(a))]`

with `Φ_L(a, φ) = ∫_0^a √|U(a', φ)| da' = (3/(4|V|))·((1 + K·|V|·a²)^{3/2} − 1)` from `constants.ts:276-296`. The Hankel functions are defined in terms of Bessel J and Y:

```
H_{ν}^{(1)}(z) = J_ν(z) + i·Y_ν(z)
H_{ν}^{(2)}(z) = J_ν(z) − i·Y_ν(z)
```

`H^{(1)}` is outgoing (Sommerfeld's convention: `exp(+iz)/√z` for large `z`), `H^{(2)}` is incoming.

### 4.2 Why the code uses leading-WKB as a drop-in

The full Hankel form is pointwise-exact only for constant V; for the quartic-in-`a` potential it carries a residual `O(1/Φ_L)` error from the same WKB-subleading origin as the `V > 0` Airy form. `exactColumnSolution.ts:234-299` implements the leading-WKB replacement

> `χ(a) = |U(a)|^{−1/4} · [A·cos Φ_L(a) + B·sin Φ_L(a)]`

which has the same `O(1/Φ_L)` accuracy as the Hankel form for the quartic-in-`a` potential (the two forms agree to leading order via the Hankel asymptotic `H_{1/4}^{(1)}(Φ) ∼ √(2/(π·Φ))·exp(i·Φ − iπ·3/8)` for large `Φ`). The two real coefficients `(A, B)` encode the same two-dimensional solution space as the complex `(α, β)` in the Hankel form, with conversion rules:

```
cos Φ = (H^{(1)} + H^{(2)}) · (π·Φ/2)^{1/2} · exp(+iπ·3/8) / 2   (schematically; check signs per use)
sin Φ = (H^{(1)} − H^{(2)}) · ...
```

The agreement test tolerates `O(1/Φ_L)` relative error on the `V < 0` branch accordingly (tight `1%` bound elsewhere, `O(1/Φ_L)` here; see plan §2.3).

### 4.3 HH in V < 0 regime = standing wave = real χ

There is no Euclidean region for `V < 0`, so the no-boundary proposal's "decay into Euclidean infinity" requirement has no content. The natural HH choice is instead a **real standing wave** — the combination `α = β⋆` (complex conjugate), which gives real `χ`. In the leading-WKB parametrisation this is

```
A ∈ ℝ,  B ∈ ℝ,  Im(A) = Im(B) = 0
```

and both coefficients are fixed up to an overall real normalisation by the smooth matching to the `V → 0⁻` limit (see §6).

### 4.4 Vilenkin in V < 0 regime

The Vilenkin tunneling proposal selects the **outgoing** wave — `H_{1/4}^{(1)}` alone in the Hankel parametrisation, or equivalently `B = i·A` in the leading-WKB parametrisation (so `χ = |U|^{−1/4}·A·(cos Φ_L + i·sin Φ_L) = |U|^{−1/4}·A·exp(+i·Φ_L)`). The sign of the phase is fixed by the convention `+a = expanding universe → outgoing = +phase rate`.

## 5. V = 0: Weber / Bessel-¼ exact solution

For `V(φ) = 0` the potential reduces to `U(a) = −c_U · a² = −36π²·a²`. The 1D ODE is

```
−χ''(a) − 36π²·a² · χ(a) = 0
⇔  χ''(a) = −36π²·a² · χ(a)
```

the **Weber equation** in the variable `a`. Standard substitution `t = 3π·a²`, `w(t) = χ(a)/√a` converts it to Bessel's equation of order `1/4`:

```
t² · w''(t) + t · w'(t) + (t² − 1/16) · w(t) = 0
```

(derivation: `χ = √a · w(t)`, `dχ/da = w/(2√a) + √a · w'(t) · dt/da = w/(2√a) + √a·w'(t)·6π·a`; compute `χ''` and substitute; the first-order term in `w` cancels against the `a²·χ` coefficient after collecting). The general solution is

> **`χ(a) = √a · [A · J_{1/4}(3π·a²) + B · Y_{1/4}(3π·a²)]`**

with `A, B ∈ ℂ`. Closed form, exact (no asymptotic approximation). The derivative follows from the Bessel chain rule:

```
∂_a χ = (1/(2√a)) · [A·J_{1/4}(z) + B·Y_{1/4}(z)]
      + √a · 6π·a · [A·J_{1/4}'(z) + B·Y_{1/4}'(z)]     with  z = 3π·a²
```

`exactColumnSolution.ts:214-232` implements exactly this, using the `besselJQuarter`/`besselYQuarter` helpers.

This form is the bridge between the dS (V > 0) and AdS (V < 0) regimes: as `V → 0⁺` the Langer-Airy form limits to the Bessel-¼ form (via the connection between Airy and Bessel of order ±1/3 which in turn connects to Bessel of order ±1/4 through the `a²` substitution), and as `V → 0⁻` the Hankel-¼ form limits to the same Bessel-¼ form (via `H_ν^{(1,2)} = J_ν ± i·Y_ν`).

## 6. Matching the classical instanton at a → 0⁺ (V > 0)

At small `a` with `V > 0`, `K·V·a² ≪ 1`, so `U(a) ≈ −c_U·a² → 0⁻` and the Lorentzian region extends down to `a = 0`. The Langer variable at `a = 0`:

```
S_L(0) = (3/(4V))·(1 − 0)^{3/2} = 3/(4V)   (finite, > 0)
ζ(0)   = −((3/2) · 3/(4V))^{2/3} = −(9/(8V))^{2/3}
```

— negative and finite, not asymptotically large. The prefactor `(ζ/U)^{1/4}` at `a = 0`:

```
U(0)    = 0
ζ(0)    = −(9/(8V))^{2/3}      (nonzero)
ζ(0)/U(0) = ±∞   (formally)
```

So `(ζ/U)^{1/4} → ∞` at `a = 0` — but this is expected, because `χ = a^{3/2}·Ψ` means `χ(0) = 0` for any regular `Ψ`, and the seed's job is to select the right rate of approach to zero. Specifically:

```
U(a)    = −c_U·a² · (1 + O(a²))     for small a
ζ(0)/U(a) = ζ(0) · (−1/(c_U·a²)) · (1 + O(a²))
(ζ/U)^{1/4}(a) = (|ζ(0)|/(c_U·a²))^{1/4} · (1 + O(a²))
                ∝ a^{−1/2}
```

So `χ_HH(a) ∝ a^{−1/2}·Ai(ζ(0))` at small `a`, and the physical `Ψ = χ·a^{−3/2} ∝ a^{−2}·Ai(ζ(0))` — which is **not** regular at `a = 0`. The apparent singularity is an artefact of evaluating the Langer form at a point where its first Taylor coefficient in `a` is insufficient; the exact solution `Ψ` must match the classical instanton `Ψ_HH^{cl}(a) = exp(−S_E^HH)` at `a → 0⁺` via the Euclidean path integral.

The correct matching at `a → 0⁺`: set the amplitude `N_HH(φ)` so that

```
|χ_HH(a_min, φ)|  =  exp(−|S_E^HH(a_min, φ)|)
```

where `S_E^HH = (1/(3V))·((1 − KVa²)^{3/2} − 1)` is the classical instanton action continued to the Lorentzian side. This matches the amplitude convention that `boundaryConditions.ts:150-154` already uses — the Gaussian-in-φ classical prefactor `exp(−S_E^HH)` at small `a` (with `|S_E^HH(a_min)| → K·a_min²/2 + O(V)`, giving the `exp(−K·a_min²/2)` envelope at the origin cell). The bug in the current code is that this amplitude is used **in place of** the Ai-branch selection, not as a normalisation of the Ai branch. The new seed uses this exact amplitude for `N_HH(φ)` and **multiplies it by the Ai-branch column solution** normalised to unity at `a = a_min`:

```ts
const ai0 = airyAi(zeta(aMin, phi))
const U0 = wdwU(aMin, phi, m, lambda, asymmetry)
const prefactor = Math.pow(Math.abs(zeta(aMin, phi) / U0), 0.25)
const chi_unnormalised = prefactor * ai0
const N_HH = Math.exp(−absSEHH) / chi_unnormalised
// Then χ_HH(aMin, φ) = N_HH · chi_unnormalised ≡ exp(−|S_E^HH|), by construction.
```

At `a > a_min` the same `N_HH(φ)` and the Ai column solution combine to produce the physically correct interior, with the classical instanton's amplitude preserved and the Ai branch's asymptotic decay threaded through the turning surface.

## 7. Matching the leading-WKB seed at |ζ| → ∞

At large `|ζ|` (large `a − a_turn`), the Langer-uniform HH seed reduces to the leading-WKB seed of `boundaryConditions.ts:150-158`:

**Lorentzian large-|ζ| (ζ → −∞)**:

```
χ_HH(a) = (ζ/U)^{1/4}·Ai(ζ)
        → |U|^{−1/4} · (1/√π) · sin(S_L + π/4)
```

(from the `Ai(−x)` asymptotic, §3.3). Contrast this with the buggy leading-WKB seed, which produces a decaying-exponential amplitude `exp(−|S_E|)` with no connection-phase `+π/4` and no factor-of-√π normalisation. The two forms agree only in the deep Euclidean (`ζ → +∞`) limit and diverge as `|ζ|` decreases toward the turning surface.

**Euclidean large-ζ (ζ → +∞)**:

```
χ_HH(a) = (ζ/U)^{1/4}·Ai(ζ)
        → |U|^{−1/4} · (1/(2√π)) · exp(−S_E)
```

Identical in functional form to the buggy `exp(−|S_E|)` seed up to the `|U|^{−1/4}` amplitude prefactor and the factor `1/(2√π)`. This is why the current solver's output **agrees** with the Airy-branch reference in the deep Euclidean (far above `a_turn`) but deviates by 53% `Bi`-contamination in the near-turning-surface band (Finding 1 of the plan).

**Takeaway**: the Langer-uniform seed is the correct generalisation of the leading-WKB seed to finite `ζ`. It reduces to the old seed in the appropriate limit, and corrects it by O(1) factors precisely in the regime where the solver actually operates (`a_min ≈ 0.2·a_turn`, `|ζ(a_min)| ≈ 1.6`).

## 8. Vilenkin boundary: sign of the outgoing wave

The Vilenkin tunneling proposal selects the **outgoing** branch in the Lorentzian region: a wave travelling in the `+a` direction (expanding universe). In the Airy-function basis, outgoing corresponds to the Hankel-like combination `Ai(ζ) + i·Bi(ζ)`:

```
Ai(ζ) + i·Bi(ζ) →  π^{−1/2}·x^{−1/4} · [sin(S_L + π/4) + i·cos(S_L + π/4)]    (ζ → −∞)
                 = i · π^{−1/2}·x^{−1/4} · exp(−i·(S_L + π/4))
                 ∝ exp(−i·S_L)           (up to constant phase)
```

`exp(−i·S_L)` has phase decreasing in `a` (since `S_L` decreases as `a` increases toward the turning surface — `S_L(a_turn) = 0`, `S_L(0) = 3/(4V)`, monotone decreasing). This is actually **ingoing** under the convention `∂_a S_L > 0 = outgoing`.

The correct outgoing form for `+a = expanding` is `exp(+i·S_L^{+})` where `S_L^{+}(a) = ∫_0^a √|U(a')|·da' = Φ_L(a)` — the phase **increasing** in `a`, matched to `constants.ts:wdwLorentzianWkbPhase`. The Langer variable is anchored at the turning surface in the opposite sense, so the Vilenkin combination in the Langer basis is

> **Vilenkin: `c₁ = 1`, `c₂ = +i`** in the Airy basis, giving `W(ζ) = Ai(ζ) + i·Bi(ζ)`.

Verification via asymptotic. Large `|ζ|`, ζ < 0:

```
Ai(ζ) + i·Bi(ζ) = π^{−1/2}·|ζ|^{−1/4} · [sin(S_L + π/4) + i·cos(S_L + π/4)]
                = i·π^{−1/2}·|ζ|^{−1/4} · [cos(S_L + π/4) − i·sin(S_L + π/4)]
                = i·π^{−1/2}·|ζ|^{−1/4} · exp(−i·(S_L + π/4))
```

The Langer variable `S_L` runs from `S_L(0) = 3/(4V) > 0` at `a = 0` down to `S_L(a_turn) = 0` at the turning surface. So `−S_L` runs from a negative value up to 0 — i.e., the phase `−S_L` **increases** with `a`, which is the +a outgoing direction. The sign `c₂ = +i` is therefore correct for the expanding-universe outgoing-wave convention.

The existing `vilenkinBoundary` (`boundaryConditions.ts:215-259`) has the right sign in its leading-WKB ansatz (phase rate `+i·√|U|`, line 245–249) but, like HH, drops the Langer correction and contaminates the outgoing branch with the ingoing branch at finite ζ. The fix is the same: replace the leading-WKB expression with the Langer-uniform form using `(c₁, c₂) = (1, +i)`.

## 9. Summary table: three regimes side-by-side

| Property                | V > 0 (dS)                                                      | V = 0 (free)                                                                       | V < 0 (AdS)                                                        |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Turning surface         | `a_turn = 1/√(K·V)`                                             | None                                                                               | None                                                               |
| Exact form              | `(ζ/U)^{1/4}·[c₁·Ai(ζ) + c₂·Bi(ζ)]`                             | `√a·[A·J_{1/4}(3πa²) + B·Y_{1/4}(3πa²)]`                                           | `a^{3/2}·[α·H_{1/4}^{(1)}(Φ_L) + β·H_{1/4}^{(2)}(Φ_L)]` (exact const-V)    |
| Code reference form     | Same as exact                                                   | Same as exact                                                                      | `|U|^{−1/4}·[A·cos Φ_L + B·sin Φ_L]` (drop-in, O(1/Φ_L) accurate) |
| Asymptotic limit        | Leading WKB: `|U|^{−1/4}·exp(±S)` Euclidean, `cos(S±π/4)` Lorentzian | Pointwise exact                                                                  | Leading WKB: `|U|^{−1/4}·cos/sin Φ_L`                              |
| HH coefficient          | `c₁ = N_HH(φ)`, `c₂ = 0`                                        | `A, B` fixed by smooth match to V > 0 and V < 0 limits                             | Real standing wave: `α = β⋆`  (equivalently real A, B)             |
| Vilenkin coefficient    | `c₁ = 1`, `c₂ = +i`                                             | Complex A, B matched to outgoing Hankel H^(1)_{1/4}                                | `α = 1`, `β = 0` (pure outgoing H^(1)); or `B = i·A` in WKB form   |
| Derivative (HH)         | `(ζ/U)^{1/4}·[(1/4)·(ζ'/ζ − U'/U)·Ai(ζ) + ζ'(a)·Ai'(ζ)]`        | Bessel chain rule on `√a·(A·J + B·Y)`; closed form                                 | Chain rule on `|U|^{−1/4}·(A·cos + B·sin)`; closed form            |
| FD fallback             | `|ζ| < 1e-3`: symmetric FD of `langerChiReal` at `h = 1e-6·a_turn` | N/A (no turning surface)                                                         | N/A (no turning surface)                                           |
| Used by test            | `exactSolutionAgreement.test.ts` V>0 band, `1%` tolerance        | V=0 band, `1%` tolerance                                                           | V<0 band, `O(1/Φ_L)` (~`5-20%`) tolerance                          |

## 10. Error analysis

### 10.1 New HH seed

The Langer-uniform HH seed's residual error at `a_min` is bounded by the sum of:

1. **Langer-subleading terms**: the uniform asymptotic is exact to all orders of the WKB expansion in principle; the `W'' = ζ·W + O(subleading)` form drops corrections of order `(d²U/da²)/U²` which for the quartic-in-`a` potential give `O(1/Φ_L²)` in the deep-WKB region and `O((a_min/a_turn)⁴)` near the turning surface. At `a_min = 0.1`, `a_turn = 0.489`, this is `O((0.2)⁴) ≈ 1.6e-3`. Safely below the `1%` tolerance target.

2. **Airy-function evaluation error**: `airy.ts` achieves `1e-7` relative accuracy (tested against DLMF tables, `airy.test.ts`). Negligible.

3. **f32 downcast at the solver interface**: `boundaryConditions.ts` writes `Float32Array` buffers consumed by the WebGPU solver. The f32 mantissa is `2⁻²³ ≈ 1.19e-7` relative. Dominant at the seed once the Langer-subleading term is resolved.

**Total new HH seed error**: `O(1e-3)` at `a_min = 0.1, a_turn = 0.489`, dominated by the Langer-subleading term. Well within the 1% agreement-test tolerance and >100× smaller than the old seed's 53% `Bi` contamination (Finding 1 of the plan: `|c₂/c₁| = 0.53`, i.e. the old seed projects 53% onto the non-physical Euclidean-growing branch).

### 10.2 Old leading-WKB seed (for comparison)

The old `boundaryConditions.ts:150-158` seed computes

```
amp  = exp(−|S_E(a_min)|)   // leading-WKB magnitude, no |U|^{−1/4} prefactor
dChi = −K·a_min·√(1 − K·V·a_min²)·amp   // leading-WKB derivative, no Airy corrections
```

Interpreted in the `(Ai, Bi)` basis this is a superposition with `|c₂/c₁| ∼ 0.53` at `a_min = 0.1, Λ = 0.5, m = 0`. The 53% `Bi` branch grows exponentially past the turning surface and contaminates the Euclidean-deep tail by a factor `exp(2·S_E(a_max))` — for the deSitterLargeLambda preset this is `∼ 10²³` in amplitude, which is why the Euclidean corner frame in the `wdw-preset-algo-matrix.spec.ts` screenshots appears so bright relative to the Lorentzian bulk.

### 10.3 Symmetry preservation

Independent of amplitude error, the new seed preserves φ-translation symmetry exactly in the `m = 0` limit: `V(φ) = Λ = const`, so `ζ`, `U`, `Ai(ζ)`, `(ζ/U)^{1/4}` are all φ-independent, and the seed is rigorously constant in φ. The current solver's `sliceVarMax = 12.7` (1270 %) symmetry-breaking (Finding 2 of the plan) does **not** originate in the seed — it is a bulk-evolution instability fixed in Phase 3. But the new seed eliminates one potential confounding source; post-Phase 2, the residual `sliceVarMax` is purely Phase-3's responsibility.

## 11. Implementation checklist for Phase 2

A future implementer of `boundaryConditions.ts` should:

1. **Import** `columnSolutionPositiveV` from `exactColumnSolution.ts`.
2. **For each column `(φ₁, φ₂)`** in the HH seed:
   - Compute `V = wdwPotential(φ₁, φ₂, m, Λ, α)`.
   - If `V > 0`: compute `S_E^HH = (1/(3V))·((1 − K·V·a_min²)^{3/2} − 1)` (or the small-V Taylor form for `|V| ≤ 1e-6`). Call `columnSolutionPositiveV({a: a_min, φ₁, φ₂, m, Λ, α}, 1, 0)` to get `{chi: χ_col, dChi: dχ_col}`. Compute `N_HH = exp(−|S_E^HH|) / χ_col.re` (with safety floor on `|χ_col.re|`). Write `(N_HH·χ_col.re, 0)` to `chi[idx]` and `(N_HH·dχ_col.re, 0)` to `chiDeriv[idx]`.
   - If `V = 0` exactly (or `|V| < 1e-12`): call `columnSolutionZeroV` with coefficients matched to the `V → 0⁺` limit of the V>0 branch. This is the only correct form — nudging `V → 1e-6` and re-entering `columnSolutionPositiveV` is **not** a valid shortcut: the V=0 and V>0 regimes have different asymptotic structure (Bessel-¼ vs Langer-Airy), and `columnSolution` now actively rejects a `kind: 'positive'` tag at a `V = 0` column (see `exactColumnSolution.ts`). The shipped code already dispatches by the exact sign of `V(φ)` — do not re-introduce the small-V bypass.
   - If `V < 0`: call `columnSolutionNegativeV` with real `(A, B)` matched to the V→0⁻ limit of the V=0 form (real standing wave); write the result to `chi[idx]` and `chiDeriv[idx]`.
3. **Vilenkin**: same structure, but with `(c₁, c₂) = (1, +i)` in the V>0 branch (requires a complex variant of `columnSolutionPositiveV`, or two calls: `(1, 0)` and `(0, 1)` combined with `+i`). Write complex `(re, im)` pairs.
4. **Update** `boundaryConditionsVerification.test.ts` with:
   - Continuity at `V → 0⁺` (the V>0 and V=0 seeds must agree to 1e-4 at the matching cells).
   - Continuity at `V → 0⁻` (the V=0 and V<0 seeds must agree to 1e-4).
   - HH small-`a` match to `exp(−|S_E^HH|)` classical amplitude.
   - HH large-`a` decay to `(1/(2√π))·|U|^{−1/4}·exp(−S_E)` leading-WKB form.
   - Vilenkin large-`a` outgoing-phase check: `arg(χ(a)) → Φ_L(a) − π/4` at `a ≫ a_turn`'s Lorentzian side.

## 12. References

- DLMF chapter 9 (Airy functions and related), §9.6 (uniform asymptotics), §9.7 (asymptotic expansions).
- Hartle & Hawking, "Wave function of the Universe", Phys. Rev. D 28, 2960 (1983).
- Vilenkin, "Creation of universes from nothing", Phys. Lett. B 117, 25 (1982); "Quantum creation of universes", Phys. Rev. D 30, 509 (1984).
- Langer, "On the connection formulas and the solutions of the wave equation", Phys. Rev. 51, 669 (1937).
- Bender & Orszag, "Advanced Mathematical Methods for Scientists and Engineers", §10.7 (Langer's method for turning-point problems).
- `src/lib/physics/wheelerDeWitt/constants.ts` — `wdwU`, `wdwTurningA`, `wdwEuclideanWkbAction`, `wdwLorentzianWkbPhase`, `wdwLangerVariable` definitions.
- `src/lib/physics/wheelerDeWitt/airy.ts` — `airyAll`, `airyAi`, `airyBi`, `airyAiPrime`, `airyBiPrime` implementations; series + asymptotic crossover at `|z| = 6`.
- `src/lib/physics/wheelerDeWitt/exactColumnSolution.ts` — `columnSolutionPositiveV`, `columnSolutionZeroV`, `columnSolutionNegativeV` reference implementations.
- `docs/plans/wdw-solver-physics-correctness.md` — parent plan, §2.1 (this doc's scope), Findings 1–4.
