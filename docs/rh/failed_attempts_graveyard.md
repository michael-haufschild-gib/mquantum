# The Graveyard: Failed RH Attempts and What They Teach Our Program

_Compiled 2026-06-12 (round 260). Research document — findings land here first;
only items of demonstrated significance get ported into the quest log
(`logs/rh_proof_quest_20260610_204044.md`)._

Scope: historical attack routes on RH that failed, were refuted, or were shown
structurally inadequate — selected for direct or indirect relevance to our
Jensen/hard-head program. Each entry: what it was, how it died, and the
actionable lesson mapped onto our live instruments.

---

## 1. Turán's partial-sums program (1948) → killed by Montgomery (1983)

**The attempt.** Turán proved: if the partial sums ζ_N(s) = Σ_{n≤N} n^{−s}
had no zeros in σ > 1 + (log N)³/√N for all large N, RH would follow. He
hoped sections inherit the zero-location of the function.

**The death.** Montgomery showed ζ_N(s) has zeros with σ > 1 for **all**
large N (in fact for all N > 30, per later computational completions), with
the supremum of real parts approaching 1 + (4/π − 1)·loglog N/log N. The
hypothesis of Turán's theorem is simply never satisfiable. Sections of ζ
carry zeros the function does not have, period.

**Lesson for us (LIVE, urgent).** *Zeros of truncations are not zeros of the
function.* Our `xihead` run (K=140 Taylor section of Φ_{ξ,0}) reported 22
nonreal zeros among the "first 40 by modulus" — but the 40-zero window
extends to |z| ≈ 800 while the section's estimated trust radius is ~400–660.
The far band is in Turán territory: zeros of the section, not of Φ_{ξ,0}.
Every numerical claim about a truncated object now requires an explicit
**fidelity certificate** (central index ν(|z|) ≪ K, tail/central ratio).
The audit (winding counts at K=240/360 around each suspect zero, trust-radii
table) is scripted in `scripts/research/hilbertPolya/fable_xicheck.py`;
computation routed to the GPT agent per user direction 2026-06-12.

## 2. Szegő-curve theory of section zeros (Szegő 1924; Buckholtz; Jenkins–McLaughlin 2016)

**The phenomenon.** Zeros of Taylor sections s_n of e^z cluster on the Szegő
curve |z e^{1−z}| = 1 (rescaled by n); Buckholtz: every zero of s_n(nz) lies
within 2e/√n of it. Section zeros split into **genuine** (converge to zeros
of the function) and **spurious** (escape to infinity with n, riding the
section boundary).

**The directly-on-target precedent.** Jenkins & McLaughlin,
[arXiv:1609.05965](https://arxiv.org/abs/1609.05965): for the Taylor
polynomials of **Riemann's ξ itself**, they construct a domain growing with
the degree on which the section converges to ξ, prove super-exponential
convergence of the genuine (Hurwitz) zeros, and **count the spurious zeros**
(Riemann–von Mangoldt-type formula for the section). So for our exact
function family, the dichotomy genuine/spurious is rigorous, quantitative,
and unavoidable.

**Lesson for us.** The spurious population is not an edge case — it is a
*theorem* that sections of ξ-type functions carry an O(K)-scale band of fake
zeros. Any zero census must be cut at the trust radius. Applies immediately
to: `xihead` (K=140), the running `xishift` (K=100 — its n=16/64 rows
likely reach past trust radius; reinterpret with the z*(100) filter when it
lands), and any future Φ-section job.

## 3. GORZ (2019) → Farmer's structural critique (2020)

**The attempt-adjacent result.** Griffin–Ono–Rolen–Zagier proved Jensen
polynomials J^{d,n} of ξ are hyperbolic for d ≤ 8 (all n) and, for each
fixed d, for all sufficiently large n — via convergence to Hermite
polynomials. Widely reported as "evidence for RH."

**The critique.** Farmer,
[arXiv:2008.07206](https://arxiv.org/abs/2008.07206) ("Jensen polynomials
are not a plausible route to proving the Riemann Hypothesis"): the
Jensen→Hermite limit is forced by generic asymptotics that hold for broad
classes of functions having nothing to do with RH; there is no justification
for the suggested connection to RH or to random-matrix statistics; the route
as practiced (limit-shape theorems) cannot consume arithmetic input, and a
large class of related polynomial families is equally useless.

**Lesson for us.** We have now *empirically confirmed Farmer's structural
point from inside*: our step-1 experiment showed ξ's fixed-shift head is
pointwise sub-critical (α_pt(j) < 1 everywhere) and survival is carried by
the **drift** α(j) = 1 − 2/(ln j − lnln j + …) (F205 — genuinely arithmetic:
it comes from the ζ saddle). The RH content sits exactly where the
limit-shape theorems are silent: small shift, uniformity in d. Honest
restatement of our position: a Jensen-route proof is a proof **only if** it
consumes the drift law — otherwise it is Farmer-dead on arrival. Our F205 is
the arithmetic input the route was missing; whether it suffices is the open
question (step 2).

## 4. de Branges' positivity program → Conrey–Li counterexamples (1998/2000)

**The attempt.** de Branges: RH follows from positivity conditions on
reproducing-kernel Hilbert spaces of entire functions associated with ζ.

**The death.** Conrey & Li
([arXiv:math/9812166](https://arxiv.org/abs/math/9812166)) gave numerical
counterexamples and non-numerical counterclaims: the required positivity
conditions are **not satisfied** by the actual ζ-associated spaces — even
though RH is presumably true. de Branges continued revising; the community
moved on.

**Lesson for us.** *A natural-looking positivity condition can be false for
ξ even when the theorem it would imply is true.* Positivity sufficient
conditions tend to be strictly stronger than RH and fail on the real object.
Live application: our radial-dominance condition (★) with slack 6.03, the
transverse cone B_{d,m} ≥ 0, and the Weil-positivity monitors must each be
stress-tested against real ξ data at scale **before** structural work rests
on them — and a failure of one of them refutes the *condition*, not RH.
This is why the kernel referee's margin-collapse observation
(margins ~ 1/(n+b)) matters: conditions whose margins collapse with depth
are de Branges-shaped risks.

## 5. Pólya's universal factors → de Bruijn → Newman → Rodgers–Tao Λ ≥ 0 (2018)

**The arc.** Pólya (1926): multiplier/kernel methods ("universal factors")
prove reality of zeros for *smoothed* variants of ξ — but the smoothing
destroys the arithmetic. de Bruijn (1950): the backward-heat deformation
H_t; zeros all real for t ≥ 1/2. Newman (1976): there is a finite constant Λ
(zeros of H_t all real ⟺ t ≥ Λ); RH ⟺ Λ ≤ 0; conjectured Λ ≥ 0 — "if RH is
true, it is only barely so." Rodgers & Tao
([arXiv:1801.05914](https://arxiv.org/abs/1801.05914)) proved Λ ≥ 0.
Polymath15 ([arXiv:1904.12438](https://arxiv.org/abs/1904.12438)) pushed the
upper bound to Λ ≤ 0.22 with effective heat-flow zero dynamics.

**The lesson (strategic, the deepest one).** RH sits **exactly on the
boundary** of the property to be proved — there is no ε of room. Structural
consequences:

1. Any proof strategy that needs a *uniform open margin* is doomed —
   the margin provably does not exist (this is what Λ ≥ 0 means).
2. Viable arguments must be **criticality-shaped**: monotone quantities
   along a flow, equality-case analysis, one-way valves — the
   Rodgers–Tao proof itself is a flow-dynamics argument.
3. Our program's echoes of Λ = 0 criticality, found independently:
   α_c = 1.00 exactly (F201 divergence-law pole); the drift α(j) → 1 from
   below at speed 2/ln j (F205) — slack vanishing logarithmically;
   kernel-referee margins ~ 1/(n+b); ζ section margins ~ e^{−0.11√d}.
   These are not numerical annoyances — they are the *signature of a true
   boundary statement*, and they predict that every instrument we build
   will show collapsing margins on the real object.
4. Retro-explanation of our own results: THEOREM F211 (model head
   Φ_{1,1} ∈ LP via atom-dominated Rouché) succeeded **because the
   frozen-α model is interior** (atom mass p = √(2/e) > 1/2 with finite
   slack). ξ's head is boundary — pointwise sub-critical, drift-rescued —
   so no interior-style argument can transfer. Step 2 must be a flow /
   equality-case argument, not an inequality with room.

## 6. Bender–Brody–Müller operator (2017) — the Hilbert–Pólya shortcut trap

**The attempt.** A claimed Hilbert–Pólya Hamiltonian whose eigenvalues are
the ζ zeros. **The gap:** the operator is not self-adjoint on any
identified physical inner-product space; the similarity transform is formal;
reality of the spectrum was assumed in disguise.

**Lesson for us.** Formal spectral resemblance ≠ spectral theorem. Our own
numerical BBM exploration lives in
`scripts/research/hilbertPolya/exp9_bbm.ts`; any operator-synthesis claim in
our lab must identify the inner product *first*. (Parked; low priority under
the Jensen route.)

## 7. Nyman–Beurling / Báez-Duarte — the approximation route's collapsing slack

**The attempt.** RH ⟺ the constant function 1 is approximable in a specific
L² sense by dilations of fractional parts (Nyman–Beurling; Báez-Duarte's
sequence refinement).

**The status.** Not refuted — but Burnol's lower bounds show the
approximation distance decays only logarithmically: the criterion has the
same no-slack signature (item 5). Forty years of work produced no mechanism
for *constructing* the approximants.

**Lesson for us.** Equivalent reformulations inherit RH's boundary
criticality; reformulation alone buys nothing. A route is only as good as
the *new monotone structure* it exposes. (Our ladder identity — see quest
log F213 — is exactly an attempt to expose such structure.)

---

## Synthesis: three design rules adopted (ported to quest log)

1. **Trust-radius certificates.** No conclusion from any truncated object
   (Taylor section, finite lattice, finite zero list) without an explicit
   fidelity bound at the location of the claim. Jenkins–McLaughlin is the
   model. Retroactively applied to `xihead` (verdict suspended) and
   `xishift` (filter on read).
2. **Positivity claims are guilty until ξ-tested.** Any sufficient
   positivity condition gets numerically stress-tested on real ξ data at
   scale, with margins tracked vs depth, before structural work builds on
   it (Conrey–Li rule). Margin-collapse is expected and not disqualifying —
   but a sign flip kills the condition, not RH.
3. **Criticality-shaped arguments only.** Step 2 (the uniform-in-d drift
   bound) must be built as a monotone-flow / equality-case argument
   (Rodgers–Tao shape), not as an inequality with uniform slack — the slack
   provably does not exist (Λ ≥ 0). Candidate structure: the exact
   differentiation ladder of fixed-shift heads (F213) with the nonreal-zero
   count as Lyapunov function.

## Sources

- Farmer, [Jensen polynomials are not a plausible route to proving the Riemann Hypothesis (arXiv:2008.07206)](https://arxiv.org/abs/2008.07206)
- Montgomery / partial sums: [Zeros of partial sums of the Riemann zeta-function (arXiv:0807.0019)](https://arxiv.org/pdf/0807.0019), [Zeroes of partial sums of the zeta-function (arXiv:1507.01340)](https://arxiv.org/pdf/1507.01340)
- Jenkins–McLaughlin, [Dynamic behavior of the roots of the Taylor polynomials of the Riemann xi function with growing degree (arXiv:1609.05965)](https://arxiv.org/abs/1609.05965)
- Szegő-curve background: [Locating the zeros of partial sums of e^z with Riemann-Hilbert methods (arXiv:0709.1213)](https://arxiv.org/abs/0709.1213)
- Conrey–Li, [A note on some positivity conditions related to zeta- and L-functions (arXiv:math/9812166)](https://arxiv.org/abs/math/9812166)
- Rodgers–Tao, [The De Bruijn-Newman constant is non-negative (arXiv:1801.05914)](https://arxiv.org/abs/1801.05914); [Tao's blog announcement](https://terrytao.wordpress.com/2018/01/19/the-de-bruijn-newman-constant-is-non-negativ/)
- Polymath15, [Effective approximation of heat flow evolution of the Riemann ξ function (arXiv:1904.12438)](https://arxiv.org/abs/1904.12438); [Polymath wiki](https://michaelnielsen.org/polymath/index.php?title=De_Bruijn-Newman_constant)
- GORZ, [Jensen polynomials for the Riemann zeta function and other sequences (arXiv:1902.07321)](https://arxiv.org/abs/1902.07321)
- de Branges context: [Louis de Branges de Bourcia — Wikipedia](https://en.wikipedia.org/wiki/Louis_de_Branges_de_Bourcia)
