# The Heat-Line Theorem for Gauss-Weighted Binomial Sections

**Status:** THEOREM. Conjectured by the Anthropic agent (rounds 238–240); proved by the GPT-5.5 agent (Theorem GPT-F1, `logs/rh_proof_quest_20260610_204044_gpt.md`, GPT Rounds 1–2, 2026-06-11); proof independently verified line-by-line by the Anthropic agent (round 241). See §4.0 below for the proof.
**Provenance:** the Hilbert–Pólya numerical research program in this repository (quest log `logs/rh_proof_quest_20260610_204044.md`, rounds 238–241, June 2026).
**Honesty note.** Novelty is asserted only *to the best of the authors' knowledge as of June 2026*; no systematic literature search has been performed beyond the authors' training knowledge. The conjecture arose from a numerical research program, not from prior literature. Before any external use, a literature search (Laguerre–Pólya class, multiplier sequences, heat-flow zero dynamics, partial theta functions) is required.

---

## Abstract

For $C > 0$ and $d \ge 1$ consider the Gauss-weighted binomial polynomial
$$G_d^C(t) \;=\; \sum_{j=0}^{d} \binom{d}{j}\, e^{-C j^2/2}\, t^j .$$
We prove that $G_d^C$ is hyperbolic (all zeros real, necessarily negative) for every $C>0$ and every $d$ — equivalently, a statement of Lee–Yang type for the heat flow acting on a degenerate zero: every zero of the heat evolution $e^{\lambda\partial_y^2}\,(2\cos(y/2))^d$ lies on the vertical lines $\operatorname{Re} y \equiv \pi \pmod{2\pi}$. The proof (Theorem GPT-F1, §4.0; found by the GPT-5.5 agent, verified independently) is a root-separation induction on a $q$-deformed Pascal recurrence, and yields more: consecutive root ratios exceed $q^2 = e^{2\lambda}$, and by Pólya–Schur the sequence $\{e^{-Cj^2/2}\}$ is a full multiplier sequence. Earlier partial results ($d \le 2$; $C \ge \ln 4$ via Kurtz; the $\lambda \to 0^+$ Hermite scaling limit) are retained as cross-checks, with numerical verification at 80–650 decimal digits for $d \le 64$, $C \le 2$. The naive approach — "forward heat flow preserves real-rootedness" — is *false* for degenerate zeros, and the counterexample is instructive: heat ejects a multiplicity-$d$ real zero off the real axis; the conjecture asserts the ejecta land exactly on a vertical line.

---

## 1. Motivation

The Riemann Hypothesis is equivalent (Pólya; Csordas–Norfolk–Varga; see also Griffin–Ono–Rolen–Zagier 2019) to the hyperbolicity of all Jensen polynomials
$$J^{d,n}(X) = \sum_{j=0}^{d} \binom{d}{j}\,\gamma_{n+j}\,X^j$$
of the Riemann $\xi$-function's Taylor coefficients $\gamma_j$. Numerically (this program), the local geometry of $\ln\gamma_j$ is governed by its second difference ("Turán curvature"), which for $\xi$ decays like $\alpha(j)/j$ with $\alpha(j) \in (0.4, 0.75)$. The polynomial $G_d^C$ is the *constant-curvature model* of this situation: $\ln$-coefficients with second difference exactly $-C$. Understanding which curvature profiles preserve hyperbolicity, and with what margins, isolates the analytic ("kinematic") part of the Jensen-face story from the arithmetic part. The constant-curvature model is the base case, and its hyperbolicity is — to our knowledge — not in the literature in this form.

## 2. Notation

- $\binom{d}{j}$: ordinary binomial coefficients (not $q$-binomials).
- $\operatorname{He}_d$: probabilists' Hermite polynomial, $\operatorname{He}_d = e^{-\partial_x^2/2}\, x^d$; all zeros real and simple.
- Heat semigroup: $e^{\lambda \partial_y^2}$ acts on $e^{iky}$ as multiplication by $e^{-\lambda k^2}$.
- *Hyperbolic*: a polynomial with all zeros real.

## 3. The conjecture, in two equivalent forms

**Theorem (Form 1 — Gauss-binomial hyperbolicity).**
For every $C > 0$ and every integer $d \ge 1$, all zeros of $G_d^C(t) = \sum_{j=0}^{d}\binom{d}{j} e^{-Cj^2/2} t^j$ are real and negative.

**Theorem (Form 2 — heat-line / Lee–Yang form).**
For every $\lambda > 0$ and every $d \ge 1$, every zero $y \in \mathbb{C}$ of
$$\Psi_\lambda(y) \;=\; e^{\lambda\,\partial_y^2}\left[(2\cos(y/2))^d\right]$$
satisfies $\operatorname{Re} y \equiv \pi \pmod{2\pi}$. (Correspondence: $\lambda = C/2$.)

*Both forms are proved by Theorem GPT-F1 below (§4.0). The partial results of §4 (Propositions 1–6) predate the full proof and are retained as independent cross-checks.*

### 3.1 Proof of equivalence

*Step (a) — centering.* From $j^2 = (j - d/2)^2 + dj - d^2/4$,
$$e^{-Cj^2/2} = e^{Cd^2/8}\; e^{-Cdj/2}\; e^{-C(j-d/2)^2/2},$$
hence $G_d^C(t) = e^{Cd^2/8}\,\tilde G_d(u)$ with $u = t\,e^{-Cd/2}$ and
$$\tilde G_d(u) = \sum_{j=0}^{d} \binom{d}{j}\, e^{-C(j-d/2)^2/2}\, u^j .$$
A positive dilation $t \mapsto u$ preserves reality and sign of zeros, so Form 1 holds for $G_d^C$ iff it holds for $\tilde G_d$.

*Step (b) — Fourier side.* Define
$$\Psi(y) := e^{-i d y/2}\,\tilde G_d(e^{iy}) = \sum_{j=0}^{d} \binom{d}{j}\, e^{-C(j-d/2)^2/2}\, e^{i(j-d/2)y}.$$
Under $j \mapsto d-j$ both the binomial coefficient and the centered Gaussian weight are invariant while $(j-d/2) \mapsto -(j-d/2)$; pairing terms shows $\Psi$ is real-valued and even on $\mathbb{R}$, and entire of exponential type $d/2$.

*Step (c) — the $C=0$ case.* $\Psi_0(y) = \sum_j \binom{d}{j} e^{i(j-d/2)y} = \big(e^{iy/2} + e^{-iy/2}\big)^d = (2\cos(y/2))^d$ by the binomial theorem.

*Step (d) — heat representation.* The mode $e^{iky}$, $k = j - d/2$, carries weight $e^{-Ck^2/2} = e^{-(C/2)k^2}$, exactly the Fourier multiplier of $e^{(C/2)\partial_y^2}$. Hence $\Psi = e^{(C/2)\partial_y^2}\,(2\cos(y/2))^d = \Psi_{C/2}$.

*Step (e) — zero correspondence.* Every zero $u_0 \neq 0$ of $\tilde G_d$ corresponds to zeros $y$ of $\Psi$ through $u_0 = e^{iy}$ (and $\tilde G_d(0) = e^{-Cd^2/8} \neq 0$, while $\Psi$ has no zeros "at $u = \infty$" since the top coefficient is nonzero). Writing $y = a + ib$: $e^{iy} = e^{-b}e^{ia}$ is real and negative iff $a \equiv \pi \pmod{2\pi}$, with $|u_0| = e^{-b}$ arbitrary in $(0,\infty)$. Thus *all zeros of $\tilde G_d$ real negative* $\iff$ *all zeros of $\Psi$ on the lines $\operatorname{Re} y \equiv \pi$*. $\blacksquare$

## 4. Proof and partial results

### 4.0 Theorem GPT-F1 (the full proof; GPT-5.5 agent, verified by the Anthropic agent)

*Reduction.* With $\lambda = C/2$ and $k(d-k) = -(k-d/2)^2 + d^2/4$, the centered polynomial of §3.1 equals, up to a positive prefactor and dilation,
$$P_d(z; q) \;=\; \sum_{k=0}^{d} \binom{d}{k}\, q^{k(d-k)}\, z^k, \qquad q = e^{\lambda} \ge 1 .$$
Both theorem forms are equivalent to: $P_d(\cdot\,; q)$ has only real negative zeros for $q \ge 1$ ($q = 1$ is $(1+z)^d$, trivial).

*Recurrence (from Pascal's identity; verified by direct reindexing):*
$$P_{d+1}(z; q) \;=\; P_d(qz; q) \;+\; q^{d}\, z\, P_d(z/q;\, q).$$

*Separation induction.* Let $R_d(t) = P_d(-t; q)$. Claim: for $q > 1$, $R_d$ has $d$ simple positive roots $0 < a_1 < \cdots < a_d$ with $a_{j+1}/a_j > q^2$. Base $d = 1$: $R_1 = 1 - t$. Inductive step: with $S = R_{d+1}(t) = R_d(qt) - q^d\, t\, R_d(t/q)$, evaluate at the bracket points:
- $S(0) = 1 > 0$ and $S(a_1/q) = -q^{d-1} a_1 R_d(a_1/q^2) < 0$ (since $a_1/q^2 < a_1$ and $R_d > 0$ before its first root): a root in $(0, a_1/q)$.
- For $1 \le j < d$: $S(q a_j) = R_d(q^2 a_j)$ and $S(a_{j+1}/q) = -q^{d-1} a_{j+1} R_d(a_{j+1}/q^2)$; by the separation hypothesis both $q^2 a_j$ and $a_{j+1}/q^2$ lie strictly between $a_j$ and $a_{j+1}$, where $R_d$ has sign $(-1)^j$ — so the two evaluations have opposite signs, giving a root in $(q a_j,\, a_{j+1}/q)$, an interval nonempty exactly because $a_{j+1}/a_j > q^2$.
- $S(q a_d) = R_d(q^2 a_d)$ has sign $(-1)^d$, while $S(t) \sim (-1)^{d+1} t^{d+1}$ as $t \to \infty$: a root in $(q a_d, \infty)$.

That is $d+1$ positive roots of the degree-$(d+1)$ polynomial — all of them. The new roots $b_j$ satisfy $b_j < a_j/q$ and $b_{j+1} > q a_j$, hence $b_{j+1}/b_j > q^2$, closing the induction. $\blacksquare$

*Corollary (Pólya–Schur; closes §6/§7 problem 1).* Since $T[(1+x)^d]$ is hyperbolic with same-sign zeros for every $d$, the algebraic characterization of multiplier sequences (Pólya–Schur 1914; Craven–Csordas survey, composition theorems) gives: $\{e^{-Cj^2/2}\}_{j\ge0}$ **is a multiplier sequence**, and $\Phi_C(x) = \sum_j e^{-Cj^2/2} x^j / j!$ belongs to the Laguerre–Pólya class.

*Verification note (Anthropic agent, round 241).* Every step above was re-derived independently: the $q^{k(d-k)}$ reduction, both halves of the recurrence by reindexing, each endpoint sign (including interval non-emptiness from the $q^2$ separation), the leading-term sign at infinity, and the closing bound $b_{j+1}/b_j > q a_j / (a_j/q) = q^2$. The numerical bracket check on the shared pod ($q \in \{1.1, 2, 10\}$, $d \le 32$) observed minimum separation-ratio $/q^2 \ge 1.11$.

### 4.1 Partial results predating the proof (retained as cross-checks)

**Proposition 1 ($d = 1$).** $\Psi(y) = 2 e^{-C/8} \cos(y/2)$; zeros at $y = \pi + 2\pi m$, on the lines. Equivalently $G_1^C(t) = 1 + e^{-C/2}t$ has the single real negative root $-e^{C/2}$. $\blacksquare$

**Proposition 2 ($d = 2$).** Weights: $j \in \{0, 2\}$ give $e^{-C/2}$ (since $(j-1)^2 = 1$), $j = 1$ gives $\binom{2}{1} = 2$ with weight $1$. So
$$\Psi(y) = 2 + 2e^{-C/2}\cos y, \qquad \text{zeros: } \cos y = -e^{C/2} < -1,$$
i.e. $y = \pi + 2\pi m \pm i\,\operatorname{arccosh}(e^{C/2})$ — all on the lines. Cross-check in Form 1: $G_2^C(t) = 1 + 2e^{-C/2}t + e^{-2C}t^2$ has discriminant $4e^{-C} - 4e^{-2C} = 4e^{-C}(1 - e^{-C}) > 0$ and positive coefficients, hence two distinct negative real roots. $\blacksquare$

**Proposition 3 (Kurtz band: $C \ge \ln 4$, every $d$).** The coefficients $a_j = \binom{d}{j}e^{-Cj^2/2}$ are positive with
$$\frac{a_j^2}{a_{j-1}a_{j+1}} \;=\; \frac{j+1}{j}\cdot\frac{d-j+1}{d-j}\cdot e^{C} \;>\; e^{C} \quad (1 \le j \le d-1),$$
using $\binom{d}{j}^2/\big(\binom{d}{j-1}\binom{d}{j+1}\big) = \frac{(j+1)(d-j+1)}{j(d-j)} > 1$ and $e^{-Cj^2}\,e^{C(j-1)^2/2}\,e^{C(j+1)^2/2} = e^{C}$. By Kurtz's theorem (D. C. Kurtz, *A sufficient condition for all the roots of a polynomial to be real*, Amer. Math. Monthly **99** (1992) 259–263: positive coefficients with $a_j^2 > 4\,a_{j-1}a_{j+1}$ for all interior $j$ imply all roots real and distinct) [statement recalled from training; verify before external use], $C \ge \ln 4$ gives hyperbolicity for every $d$. $\blacksquare$

**Lemma 4 (heat flow on a monomial — exact).**
$$e^{\lambda \partial_x^2}\, x^d \;=\; \big(i\sqrt{2\lambda}\big)^{d}\; \operatorname{He}_d\!\Big(\frac{x}{i\sqrt{2\lambda}}\Big),$$
and consequently all zeros of $e^{\lambda\partial_x^2} x^d$ are purely imaginary: $x = i\sqrt{2\lambda}\,h_{d,k}$ with $h_{d,k}$ the real zeros of $\operatorname{He}_d$.

*Proof.* $e^{\lambda\partial^2} x^d = \sum_{m \le d/2} \frac{\lambda^m}{m!}\,\frac{d!}{(d-2m)!}\, x^{d-2m}$ directly. On the other side, $\operatorname{He}_d(z) = \sum_{m \le d/2} (-\tfrac12)^m \frac{d!}{m!\,(d-2m)!} z^{d-2m}$, so
$$\big(i\sqrt{2\lambda}\big)^{d} \operatorname{He}_d\!\Big(\frac{x}{i\sqrt{2\lambda}}\Big) = \sum_m \Big(-\tfrac12\Big)^m \frac{d!}{m!(d-2m)!}\, (i\sqrt{2\lambda})^{2m} x^{d-2m} = \sum_m \frac{\lambda^m\, d!}{m!\,(d-2m)!} x^{d-2m},$$
since $(-\tfrac12)^m (i\sqrt{2\lambda})^{2m} = (-\tfrac12)^m(-2\lambda)^m = \lambda^m$. $\blacksquare$

**Proposition 5 (local scaling limit $\lambda \to 0^+$).** Fix $d$. Near $y = \pi$ write $y = \pi + s$; then $2\cos(y/2) = 2\cos(\pi/2 + s/2) = -2\sin(s/2) = -s\,(1 + O(s^2))$, so $(2\cos(y/2))^d = (-s)^d\,g(s)$ with $g$ analytic, even, $g(0)=1$. Rescale $s = \sqrt{\lambda}\,\xi$. Then
$$\lambda^{-d/2}\,\Psi_\lambda(\pi + \sqrt{\lambda}\,\xi) \;\longrightarrow\; e^{\partial_\xi^2}\,\xi^d \qquad (\lambda \to 0^+),$$
uniformly on compact $\xi$-sets, because the heat evolution of the $O(s^{d+2})$ remainder contributes $O(\lambda)$ relative after rescaling. By Lemma 4 the limit has zeros exactly at $\xi = i\sqrt{2}\,h_{d,k}$, all on the imaginary axis; by Hurwitz's theorem the $d$ zeros of $\Psi_\lambda$ near $\pi$ satisfy
$$y_k = \pi + i\,\sqrt{2\lambda}\,\big(h_{d,k} + o(1)\big), \qquad \lambda \to 0^+ ,$$
i.e. they leave the real axis *along the vertical line* with the Hermite pattern. (This proves the conjecture "to leading order" for small $\lambda$; it does not control $o(1)$ corrections off the line, so it is a consistency theorem, not a proof of Form 2 for any fixed $\lambda > 0$.) $\blacksquare$

**Proposition 6 (large $\lambda$, $d$ even — sketch, flagged).** For $d$ even the modes are integers $k$; keeping $k \in \{0, \pm 1\}$,
$$\Psi(y) = \binom{d}{d/2} + 2\binom{d}{d/2+1} e^{-C/2}\cos y + (\text{modes } |k|\ge 2),$$
and the two-mode truncation has zeros exactly on the lines, at height $\operatorname{arccosh}$ of the (large) mode ratio. The neglected modes are suppressed by $e^{-C(k^2-1)/2} \le e^{-3C/2}$; a Rouché argument on rectangles centered on the lines closes the claim for $C$ larger than an explicit $C_0(d)$. We have verified the two-mode computation but have **not** written the Rouché contour estimate in full; this proposition is a *sketch*. For $d$ odd the dominant modes are $k = \pm\tfrac12$ and the truncation $2\binom{d}{(d-1)/2}e^{-C/8}\cos(y/2)$ already has zeros on the lines; the same caveat applies.

**Remark 7 (why the naive argument fails — instructive).** One is tempted to argue: "$(2\cos(y/2))^d$ is in the Laguerre–Pólya class; forward heat preserves real-rootedness; done." This is **false** for degenerate zeros: already $e^{\lambda\partial^2}(1 + \cos y) = 1 + e^{-\lambda}\cos y$ has *no real zeros at all* ($d=2$ above). Forward heat ejects a multiplicity-$d$ real zero off the real axis immediately (locally, Lemma 4: the ejecta are the Hermite pattern rotated by $90°$). The classical heat-flow results (de Bruijn; Csordas–Smith–Varga; the de Bruijn–Newman constant and Rodgers–Tao) concern simple zeros and strip dynamics and do not decide this conjecture. What the conjecture asserts is a *Lee–Yang line phenomenon for the heat flow on degenerate zeros*: reality is lost, but only into the vertical line through the original zero.

## 5. Numerical evidence

Method: arbitrary-precision computation (Python/mpmath + gmpy2), working precision $\approx 80 + 0.55\,C d^2/8$ decimal digits (up to ~650); roots via `polyroots` with doubled internal precision; for every configuration below the maximal relative imaginary part of any computed root was $0$ at working precision. "Margin" $=$ (minimal gap between consecutive roots) / (root spread).

| $d$ | $C$ | margin |
|----:|----:|--------|
| 16 | 0.1 | 5.541e-3 |
| 16 | 0.3 | 2.051e-4 |
| 16 | 0.7 | 5.624e-7 |
| 16 | 1.0 | 7.767e-9 |
| 16 | 1.386 | 3.318e-11 |
| 16 | 2.0 | 5.921e-15 |
| 32 | 0.1 | 3.331e-4 |
| 32 | 0.3 | 4.36e-7 |
| 32 | 0.7 | 1.893e-12 |
| 32 | 1.0 | 2.133e-16 |
| 32 | 1.386 | 1.886e-21 |
| 32 | 2.0 | 1.817e-29 |
| 64 | 0.1 | 3.781e-6 |
| 64 | 0.3 | 7.506e-12 |
| 64 | 0.7 | 8.781e-23 |
| 64 | 1.0 | 6.672e-31 |

Observed: hyperbolic in every case; margins collapse roughly exponentially in $C d$ while remaining strictly positive — the conjecture is "tight at infinity": there is no uniform-in-$(C,d)$ lower bound on the margin, so no compactness argument can settle it.

## 6. Relation to known results

- **Rogers–Szegő polynomials** $\sum_j \binom{d}{j}_q t^j$ ($q$-binomial coefficients) are real-rooted; *different object* — ours has ordinary binomials with external Gaussian weights, and does not transform into a Rogers–Szegő polynomial under any substitution known to us.
- **Partial theta function** $\sum_{j\ge0} q^{j^2} t^j$ has a *finite* real-rootedness threshold in $q$ (Katkova–Lobova–Vishnyakova, ca. 2003) [citation to be verified]; *different object* — entire series without binomial damping. No contradiction: the binomial factor is what our conjecture claims rescues hyperbolicity for all $q = e^{-C/2} \in (0,1)$.
- **Pólya–Schur multiplier sequences.** Our conjecture asserts only that $\{e^{-Cj^2/2}\}_j$ acts hyperbolically on the *specific* family $(1+t)^d$. The stronger statement — that it is a full multiplier sequence — is, by the Pólya–Schur characterization, equivalent to $\sum_j e^{-Cj^2/2}\, x^j/j!$ belonging to the Laguerre–Pólya class. We do not claim this and leave it as the key structural question; an affirmative answer would prove the conjecture wholesale. We are not aware of a classical theorem deciding it [if $\{q^{j^2}\}$ is classically known to be a multiplier sequence, this entire note collapses to a corollary — *the* first thing a literature search must check].
- **Heat polynomials** (Rosenbloom–Widder) and heat-flow zero dynamics (de Bruijn 1950; Csordas–Smith–Varga; Rodgers–Tao 2020): simple-zero/strip results; see Remark 7.

## 7. Open problems

1. ~~The conjecture itself~~ **SOLVED** (Theorem GPT-F1, §4.0): $\{e^{-Cj^2/2}\}$ is a multiplier sequence.
2. **Quantitative margins.** Prove the observed $\exp(-c\,Cd)$-type margin law in the safe band. (Note: GPT-F1's $q^2$-separation gives a lower bound structure on root ratios; converting it into the margin law is plausibly within reach.)
3. **Variable curvature (where RH lives).** For coefficient sequences with $\Delta^2 \ln \gamma_j = -\alpha/(j+1)$, hyperbolicity of the binomial sections *fails* at a finite degree $d^*(\alpha)$: measured $d^*(0.4) = 18$, $d^*(0.5) = 36$, $d^*(0.6) = 60$, $d^*(0.7) \in (110, 128]$, $d^*(0.8) > 160$. A first cubic guess $d^* \approx 280\alpha^3$ was refuted by its own pre-registered predictions at $\alpha = 0.7, 0.8$; the law grows faster, possibly diverging at a finite $\alpha_c \le 1$. The offending complex pair forms in the *bulk* of the root configuration (rank 0.50–0.75), not at the edge. By contrast, the profile $\Delta^2\ln\gamma_j = -0.7/(j+8.36)$ — a smooth fit to the *measured* Turán curvature of the Riemann $\xi$ coefficients — stays hyperbolic to $d = 192$ (the largest degree tested). Characterizing the hyperbolicity domain in profile space, and locating $\xi$'s profile relative to its boundary, is in our view the sharpest analytic question this program has produced: the Riemann Hypothesis requires $\xi$'s profile (with its arithmetic fine structure) to remain on the hyperbolic side for *all* $(d, n)$.

## References

(Conservative citations; details to be verified before external use.)

- G. Pólya, *Über die algebraisch-funktionentheoretischen Untersuchungen von J. L. W. V. Jensen*, 1927.
- D. C. Kurtz, *A sufficient condition for all the roots of a polynomial to be real*, Amer. Math. Monthly 99 (1992).
- T. Craven, G. Csordas, several works on multiplier sequences and the Laguerre–Pólya class.
- G. Csordas, T. S. Norfolk, R. S. Varga, *The Riemann hypothesis and the Turán inequalities*, Trans. AMS (1986) [details to verify].
- M. Griffin, K. Ono, L. Rolen, D. Zagier, *Jensen polynomials for the Riemann zeta function and other sequences*, PNAS 116 (2019).
- O. Katkova, T. Lobova, A. Vishnyakova, on the partial theta function, ca. 2003 [to verify].
- P. C. Rosenbloom, D. V. Widder, *Expansions in terms of heat polynomials and associated functions*, Trans. AMS (1959).
- B. Rodgers, T. Tao, *The de Bruijn–Newman constant is non-negative*, Forum Math. Pi (2020).
