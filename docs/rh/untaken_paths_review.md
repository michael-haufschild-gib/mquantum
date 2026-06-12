# Untaken Paths Review — What We Skipped, and What It's Worth

_Compiled 2026-06-12 (round 269). Findings document — significant items are
ported to the quest log. Companion to `failed_attempts_graveyard.md` (failed
routes); this file reviews routes NOT yet taken by our program and extracts
value where it exists._

## 1. Li's criterion (λ_n ≥ 0 ⟺ RH) — partial adoption

λ_n = Σ_ρ [1 − (1 − 1/ρ)^n]; positivity for all n ⟺ RH
([Li 1997; effective computation arXiv:math/0402168](https://arxiv.org/pdf/math/0402168);
[saddle-point asymptotics arXiv:1506.01755](https://arxiv.org/pdf/1506.01755)).
Known: λ_n ~ (n/2)ln n under RH; numerically positive far out. **Assessment:**
as a route it has the no-slack signature (positivity margins are the
fluctuation term; the arithmetic content hides in oscillations around the
smooth part — the same "content at finite index" structure we found in the
head). No mechanism known to force positivity. **Value extracted:** the
saddle-point machinery for λ_n is the zero-side mirror of our F205 coefficient
saddle; if the head program ever needs zero-side cross-checks of c_j data,
Li-coefficient pipelines are the calibrated tool. NOT adopted as a route.

## 2. Hermite's Hankel criterion — ADOPTED as instrument (F222)

Classical Hermite: a real polynomial is hyperbolic ⟺ the Hankel matrix of its
Newton power sums is positive semidefinite. Power sums come from coefficients
by Newton's identities — **no root-finding at all**. For our finite sections
J^{d,n} (coefficients = explicit in the c_j), hyperbolicity becomes a PSD
check that can be run in interval/rational arithmetic: interval bounds on the
moment integrals → interval c_j → interval Hankel → verified PSD = a PROOF of
hyperbolicity for that (d, n). **This upgrades the finite head census from
"numerics" to "verified computation" (Polymath15-grade)** — exactly what the
(G5) conclusion demands, since the census carries the arithmetic content of
the route. Ported to quest log as F222.

## 3. Matiyasevich-style machine/determinant reformulations — not adopted

Register-machine and δ(x)-inequality reformulations (Davis–Matiyasevich–
Robinson) are logically exact but expose no analytic structure we can use.
Riesz-type criteria ([arXiv:2202.00637](https://arxiv.org/pdf/2202.00637))
share the no-slack signature. Skipped.

## 4. Speiser's theorem (RH ⟺ ζ′ has no zeros in 0 < σ < 1/2) — watch item

Derivative-zero geometry is the zero-side shadow of our differentiation
ladder (F213). If the ladder program ever stalls, Speiser-side literature
(zeros of ζ′, "Speiser equivalent" refinements) is the place to look for the
zero-coordinate version of the count-Lyapunov argument. Not active.

## 5. Nyman–Beurling / Báez-Duarte — stays in the graveyard

Reviewed again in light of F216 (certificates): the NB distance d_N² decays
~C/ln N (Burnol lower bounds), so any finite-N certificate certifies nothing
about the limit — there is no analog of our trust-radius cutoff. The
criterion is criticality-shaped but offers no monotone structure. Skipped.

## 6. Krein strings / canonical systems — DIRECTION DOWNGRADED (two corrections, same day)

**Correction 1 (mine, structural):** the naive identification "Φ = A-function
of the string built from ν" is wrong in principle: regular strings (finite
interval, finite mass) have purely ATOMIC spectral measures, and for singular
systems the A-function is not the cosine transform of the spectral measure —
ψ = ∫cos(wt)dρ and A_ρ are different objects (else every cosine mixture
would be LP, which is false). **Correction 2 (GPT, empirical+exact):** the
exact ratio identity m_{k+1}/m_k = ((2k+1)/2)e^{−C(k)} grows like W(2k/π)²
(data: r_k/W² ≈ 2.84 → 2.73, drifting toward e), so τ = sup supp(ν_ξ) = ∞ —
the true-ξ mixing measure is UNBOUNDED, there is no top atom, and the F211
compact-atom transfer cannot prove the ξ head. What survives below is the
original framing only.

### Original entry (superseded as stated; kept for the record)

Krein–de Branges theory: every positive measure with the right integrability
is the spectral measure of a canonical system
([survey arXiv:1309.1991](https://arxiv.org/pdf/1309.1991);
[Poltoratski slides](https://web.ma.utexas.edu/users/tc/TeXAMP/TeXAMP-2013/Slides/APoltoratski.pdf)).
Under F214 (Hankel pass r ≤ 20 supports: m_k are Stieltjes moments of a
compactly supported positive ν_ξ), ν_ξ is trivially a valid Krein-string
spectral measure, so a string exists with that spectral data. The structure
functions of canonical systems are Hermite–Biehler: their A-functions have
only real zeros **by construction**. The question becomes: is Φ_{ξ,0} the
A-function of the string built from ν_ξ? CAUTION (de Branges trap,
graveyard §4): the map ν → A-function is nonlinear (inverse spectral); a
cosine transform of ν is NOT automatically the A-function, else every cosine
mixture would be LP (false — two-atom counterexamples). The honest framing:
**the head problem = the classical Pólya question "which positive measures
have LP cosine transforms", and Krein-string theory is the structural
classification tool for it.** First test: the model — Φ_{1,1} has known
mixing measure (atom p = √(2/e) at e^{−γ} + density h with h(1−) = p/12) and
PROVEN real zeros (F211); construct its string explicitly and see whether
Φ_{1,1} is its A-function. If yes, the identification mechanism exists and
the ξ version becomes a concrete inverse-spectral problem with the drift law
as input. Ported to quest log as F221.

## 7. Theta-damped sections — NEW INSTRUMENT (F220)

From the project's Matsubara/thermal features (the θ-axis lift in the
hilbertPolya mode): replace the hard truncation K (source of all Szegő
artifacts) by Gaussian-in-index damping γ_k = q^{k²}. By
Katkova–Lobova–Vishnyakova, Σ q^{k²}x^k has only real (negative) zeros iff
1/q ≥ q_∞ = 3.23363666…, i.e. q ≤ q* ≈ 0.309249
([partial theta literature](https://arxiv.org/pdf/1106.6262),
[KLV-constant papers](https://arxiv.org/pdf/2001.06302)). Via the classical
Malo–Schur–Szegő composition theorems, coefficient-wise multiplication by
such an LP⁺ damper maps LP → LP. Therefore, for q ≤ q*:

    Φ_q(s) := Σ (−1)^k e^{−S(k)} q^{k²} s^k / k!   satisfies
    Φ ∈ LP  ⟹  Φ_q ∈ LP.

Contrapositive: **a certified complex zero of Φ_q at any q ≤ q* implies
Φ ∉ LP** — and Φ_q has q^{k²} coefficient decay, so its sections converge
ferociously and the trust radius is effectively unbounded: a ONE-WAY,
artifact-free falsification detector that settles the kind of ambiguity the
xihead/xicheck saga produced. Chains of dampers (steps of factor ≤ q*)
extend the certified implication toward q → 1. Composition-theorem
bookkeeping (which Malo/Schur variant, factorial normalization) flagged as
the one proof-debt item. Ported to quest log as F220.

## 8. de Bruijn flow in coefficient coordinates — NEW RESULT (F219)

Computed this round: under the de Bruijn deformation (kernel × e^{tu²}),
∂_t ln M_{2j} = M_{2j+2}/M_{2j} = ⟨u²⟩_j exactly, and by the F205 saddle
⟨u²⟩_j ≈ u_j² with u_j ≈ ½ ln j, giving

    c_j(t) = c_j(0) + t · (ln j)/(2j²) · (1 + o(1)),
    α(j,t) − α(j,0) = t · (ln j)/(2j) · (1 + o(1)) → 0.

**The asymptotic drift law is de Bruijn-flow-rigid.** Since Λ-criticality
(Rodgers–Tao) must show up SOMEWHERE under t < 0, and it cannot show up in
the asymptotic drift, it must be decided at the finite head — the third
independent triangulation of the (G5) conclusion (after moment smoothness
and the trust-radius census logic). Sign check: t > 0 raises α at finite j
(toward safety) — consistent with heat flow improving reality. Also yields a
computational handle on collision dynamics: the t-deformed head family uses
the SAME pipeline (one extra factor in the moment integrand), so a future
pod job can watch complex pairs be born as t goes negative — Polymath15's
dictionary made computational at the head. Ported to quest log as F219.

## Sources

- [Li coefficients, effective computation (math/0402168)](https://arxiv.org/pdf/math/0402168); [saddle-point Li (1506.01755)](https://arxiv.org/pdf/1506.01755); [Li's criterion — Wikipedia](https://en.wikipedia.org/wiki/Li%27s_criterion)
- [Hardy–Petrovitch–Hutchinson & partial theta (1106.6262)](https://arxiv.org/pdf/1106.6262); [KLV constant / closest-to-zero roots (2001.06302)](https://arxiv.org/pdf/2001.06302); [LP-I sections (2107.13061)](https://arxiv.org/pdf/2107.13061)
- [de Branges spaces & Krein entire operators (1309.1991)](https://arxiv.org/pdf/1309.1991); [Krein–de Branges spectral analysis (Poltoratski)](https://web.ma.utexas.edu/users/tc/TeXAMP/TeXAMP-2013/Slides/APoltoratski.pdf); [canonical systems problems (2603.13586)](https://arxiv.org/pdf/2603.13586)
- [Riesz-type criteria (2202.00637)](https://arxiv.org/pdf/2202.00637); [Jensen polynomials PNAS (GORZ)](https://www.pnas.org/doi/10.1073/pnas.1902572116)
