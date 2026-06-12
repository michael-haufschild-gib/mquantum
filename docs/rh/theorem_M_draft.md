# Theorem M — All-Degree Hyperbolicity of the Critical Model Lift (v3 — PROVED for all d, jointly audited)

_Joint draft, Fable + GPT, 2026-06-12 (remap 13:45 CEST → this status 15:30
CEST). Status: **Theorem M is PROVED and jointly audited, unconditionally,
for every d ≥ 1**. Tier 1 proves the range d ≤ 10⁵³; the explicit Tier 2
cap estimates prove d ≥ 10⁶, with huge overlap. Status markers:
[PROVED] = audited by both agents; [PROVED-1] = proved by one agent, audit
pending._

_Round-302 referee pass (2026-06-12 ~15:30 CEST): external review (Gemini)
raised three items, all resolved — (1) critical-point indexing c_d → c_{d−1}
(real error; d−1 positive criticals, final half-cell re-based, numerically
confirmed d = 2…12); (2) above-cap region reframed as pointwise
NON-VANISHING instead of Rouché on an unbounded set (framing error; same
chain, no new math); (3) (E7) expanded to display the discrete edge control
explicitly, with the discrete constant corrected 2E₀/Λ → 4E₀/Λ — K_cap ≤
3.03 unchanged, margin vs 5.954 intact. The review independently
re-derived W1 and W2 and confirmed both exact. Per mutual-audit rule the
three edited passages were re-audited by GPT in F105 and are now [PROVED]._

_Round-307 referee pass #2 (2026-06-12 ~15:55-16:10 CEST): second
external review (Gemini) raised four attacks. Disposition: (1) E1's
O(1) gloss — CONFIRMED, repaired: Szegő 6.32 hard largest-zero bound
⟹ E₀ ≤ 1.025 + ln d/(6π) interior + NEW (E1b) beyond-edge |e| ≤ 2.43
via a self-contained Sturm gap bound; E7a promoted to its exact closed
form (0.8184), which more than pays — K_cap IMPROVES 3.03 → 2.98 and
the Corollary-T floor margin grows 1.3% → 4.5%. (2) Existential X_d —
"contradiction with Corollary T" REBUTTED (the floor never depended on
X's size), but the constructive demand is met: X := ρ_d + d explicit,
trivial chain |ψ(X+iy)| ≤ 2, ratio 0.371, T3 floor 0.241. (3) μ ≥ 0
self-containedness — legitimate; flagged in §1.4, assigned to GPT
(§1.4a inline construction); GPT F115 has now inlined the construction,
with Fable audit pending. (4) Tier-split aesthetics — REJECTED with reasons
(design note after the E-chain); redundancy is load-bearing. GPT F116
re-audited the round-307 constants and accepted them, with the harmless E4
bulk-distance correction recorded below._

## Statement

**Theorem M.** Let C_d(w) = ₁F₁(−d; 1/2; w²/4d) (equivalently the scaled
Laguerre polynomial const · L_d^{(−1/2)}(w²/4d)), and let

    Ψ_d(w) = p · C_d(w) + ∫₀¹ C_d(vw) dμ(v),      p = √(2/e),

be the exact finite-d atom/measure decomposition of the critical model lift
(constructed in §1.4a). Then for every d ≥ 1, all zeros of Ψ_d are real.

**Role.** Ψ_d is the all-degree model anchor: the critical (α = 1) profile
whose hyperbolicity at every degree underwrites the finite-d transport
program — the genuinely non-circular content of the Jensen route after the
Circle Theorem (F229). Theorem M is also a self-standing result on the
critical Laguerre family.

**Scope warning.** Theorem M does not prove RH by itself. It supplies the
model-anchor half of the Jensen-section route; RH still requires the separate
Lane-B kernel-norm transport theorem in `docs/rh/kernel_norm_transport.md`
and an exterior-strip no-extra-zeros input for non-polynomial limits.

## §1 Setup and exact inputs

1.1 [PROVED] The exact ODE (Kummer transform, verified twice independently):

    C_d″(w) − (w/2d) C_d′(w) + C_d(w) = 0.

1.2 [PROVED] C_d has only real simple zeros ±ρ_1 < … < ±ρ_d (positivity and
simplicity of L_d^{(−1/2)} zeros), so ψ := C_d′/C_d = Σ_j 1/(w − ρ_j) maps
the upper half-plane to the lower: Im ψ(w) < 0 for Im w > 0 (Hermite–Biehler
input).

1.3 [PROVED] SL normal form: u = e^{−w²/8d} C_d satisfies u″ + Ω²u = 0 with

    Ω²(w) = 1 + 1/4d − w²/16d²

(sign of the 1/4d term corrected in round 289). Sturm comparison: consecutive
zeros of C_d are separated by at least π⁻ := π/√(1 + 1/4d); zero density
ρ(s) = Ω(s)/π is a semicircle law with edge w_e = 4d√(1+1/4d).

1.4 [PROVED — GPT F115 self-contained update; Fable audit round 308 via
§1.4a (the moment formula, μ ≥ 0, and the coefficient identity are all
consequences of the audited construction)] Exact
finite-d atom/measure decomposition. Let U_1 be the compound-Poisson variable
on [0,1] constructed in §1.4a, with atom Pr(U_1 = 1) = p = sqrt(2/e). Its
moments are, for every k >= 0,

    E[U_1^k] = (2k)! exp(gamma k - S_1(k))/(4^k k!).

With v = sqrt(U_1) and μ the non-atomic part of the law of v, μ is a positive
measure on [0,1) with mass 1-p, independent of d. Therefore, for every
finite d >= 1,

    P_{d,1}(exp(gamma) w^2/(4d))
      = E C_d(sqrt(U_1)w)
      = p C_d(w) + int_[0,1) C_d(vw)dμ(v).

This is exact coefficient-by-coefficient because

    E C_d(sqrt(U_1)w)
    = sum_{k=0}^d (-1)^k ((d)_k/d^k) E[U_1^k] w^(2k)/(2k)!

and the displayed moment identity gives precisely the finite critical
hard-head coefficients. No limiting argument and no d_0 are involved.

1.4a [PROVED — GPT F115; Fable audit round 308: derivation verified line by
line (η-algebra, Frullani+Gauss digamma combination, telescoping
S₁(k)−S₁(k−1) = H_{k−1} with S₁(k) = kH_{k−1}−(k−1), Stirling limit)
AND numerically: λ-mass = (1−ln2)/2 to 1e−19, atom = √(2/e) to 1e−19,
Binet identity (B) to 1e−61 at y = 3, 7. Audit-tooling note:
cancellation-safe evaluation of η near t = 0 is REQUIRED — naive
evaluation under tanh-sinh quadrature produces a spurious y-independent
offset that mimics a constant error in (B). END-TO-END: Ψ_d built from
these moments is hyperbolic for every d = 1…300 (exact roots d ≤ 40 at
60 digits; sign-change count = d for d = 50…300 at up to 450 digits) —
the theorem's conclusion verified independently of the proof.]
Self-contained construction
of U_1 and positivity of μ. Define, for t > 0,

    η(t) := e^(t/2)/t − 1/(1−e^(−t))
          = [2sinh(t/2) − t]/[t(1−e^(−t))].

Since `2sinh(t/2) > t`, η(t) > 0. Moreover η(t) = t/24 + O(t²) at 0 and
η(t)e^(−t)/(1−e^(−t)) = O(e^(−t/2)/t) at infinity. Hence

    λ(dt) := η(t) e^(−t)/(1−e^(−t)) dt

is a finite positive measure on (0,∞). Let N be a Poisson point process with
intensity λ, let {T_j} be its atoms, set

    Y := Σ_j T_j,          U_1 := e^(−Y).

The sum is finite a.s. because λ has finite total mass, so U_1 is an honest
random variable in [0,1]. Its atom at 1 is the no-point event:

    Pr(U_1 = 1) = exp(−λ((0,∞))).

The Laplace functional of a Poisson point process gives, for every k ≥ 0,

    E[U_1^k]
      = E[e^(−kY)]
      = exp ∫_0^∞ (e^(−kt)−1) λ(dt).             (CP)

It remains to identify this transform with the displayed moments. We use the
standard Binet-digamma identity, obtained by subtracting Euler's integral for
ψ = Γ′/Γ from Frullani's formula:

    ∫_0^∞ e^(−yt) η(t) dt = ψ(y) − log(y−1/2),    y > 1/2.       (B)

Taking adjacent ratios in (CP),

    log(E[U_1^k]/E[U_1^(k−1)])
      = ∫(e^(−kt)−e^(−(k−1)t)) η(t)e^(−t)/(1−e^(−t))dt
      = −∫e^(−kt)η(t)dt
      = log(k−1/2) − ψ(k).

For integer k ≥ 1, ψ(k) = H_{k−1} − γ, hence

    E[U_1^k]/E[U_1^(k−1)] = (k−1/2) exp(γ−H_{k−1}).              (R)

The proposed closed form

    M_k := (2k)! exp(γk − S_1(k))/(4^k k!)

has M_0 = 1 and the same adjacent ratio, because

    S_1(k) − S_1(k−1) = H_{k−1},
    M_k/M_{k−1} = [2k(2k−1)/(4k)] exp(γ−H_{k−1})
                = (k−1/2) exp(γ−H_{k−1}).

Therefore E[U_1^k] = M_k for every k ≥ 0.

Finally,

    Pr(U_1=1) = lim_{k→∞} E[U_1^k]
              = lim_{k→∞} (2k)! exp(γk − kH_{k−1}+k−1)/(4^k k!)
              = sqrt(2/e),

by Stirling's formula and H_{k−1} = log k + γ − 1/(2k) + O(k^(−2)).
Thus λ((0,∞)) = (1−log 2)/2 and the atom mass is exactly p = sqrt(2/e).

Let ν be the law of v = sqrt(U_1). Then

    ν = p δ_1 + μ,

where μ := ν|_[0,1) is a positive measure with mass 1−p. This proves
μ ≥ 0 by construction and completes the self-contained input needed in §1.4.

## §2 The five lemmas

2.1 [PROVED] **y-monotonicity (per-factor).** For every fixed x and every d,
|C_d(x+iy)| is nondecreasing in |y|: per Hadamard factor,
d/d(y²)|1 − (x+iy)²/ρ²|² = 2(ρ² + x² + y²)/ρ⁴ > 0.

2.2 [PROVED] **W1 (Energy Theorem).** Along every horizontal line w = x+iy,

    E(x) := |C_d(x+iy)|² + |C_d′(x+iy)|²  satisfies  E′(x) = (x/d)|C_d′|² ≥ 0
    for x ≥ 0.

(Two-line computation from 1.1; the cross terms cancel exactly — GPT audit:
"no missing term".)

2.3 [PROVED] **W2 (ψ-Barrier).** On every critical wall (c with C_d′(c) = 0),

    d|ψ|²/dy = −(y/d)|ψ|² − 2(1 − |ψ|²) Im ψ,    ψ(c) = 0,

and Im ψ < 0 (1.2) makes |ψ| = 1 absorbing from below (derivative −y/d < 0
at the barrier) and attracting from above: |ψ(c + iy)| < 1 for all y > 0,
all d. Sharp as d → ∞ (|tan(mπ + iy)| = tanh y).

2.4 [PROVED] **W3 (wall dominance).** For every d, every critical wall c,
v ∈ [0,1], y ∈ ℝ (proof written for c ≥ 0; negative walls follow by
evenness):

    |C_d(v(c+iy))|² ≤ |C_d(vc + iy)|²            (2.1)
                    ≤ E(vc) ≤ E(c)               (2.2)
                    = |C_d(c+iy)|²(1 + |ψ(c+iy)|²) < 2|C_d(c+iy)|²   (2.3).

Hence sup_v |C_d(vw)| < √2 |C_d(w)| on critical walls, and the atom budget
closes there: (1−p)√2/p = 0.2345… < 1 (margin 4.3×).
*Scope (GPT audit):* this closes the F211/Rouché wall condition; it does
not prove the stronger naked cone |C_d(vw)| ≤ |C_d(w)| or B_{d,m} ≥ 0,
which remain independent diagnostics (exact-certified d ≤ 9; d = 10
running).

2.5 **Cap Lemma.** Fix H = π. Claim: sup_x |ψ(x + iH)| ≤ K_cap with
K_cap ≤ √(2p−1)/(1−p) = 5.954.
 (a) [PROVED — GPT v1 audited] Im-part: gaps ≥ π⁻ give
     N(t) = #{|x−ρ_j| ≤ t} ≤ 2t/π⁻ + 1;
     layer-cake against 1/(t²+H²):
     |Im ψ(x+iH)| ≤ 1 + 1/H + O(1/d) = 1.319 + O(1/d) at H = π.
     GPT audit: the sign-corrected spacing π⁻ weakens only the O(1/d)
     term; the layer-cake constant is correct.
 (b) [PROVED — GPT v1 audited] Gauge identity: the smooth (density) part of Re ψ is the
     semicircle principal-value transform, exactly x/4d′ (≤ 1 inside the
     bulk) — equal to the Gaussian gauge w/4d: ψ_u = ψ − w/4d is pure
     fluctuation.
     GPT audit: with A = 4d sqrt(1+1/4d),
     Ω(t)/π = sqrt(A²-t²)/(4πd), and
     PV int_{-A}^A sqrt(A²-t²)/(4πd(x-t))dt = x/(4d). This matches the
     real part of the gauge term in ψ.
 (c) [PROVED in two tiers, round 293; explicit Tier 2 audited by GPT v2]
     Fluctuation part of Re ψ.
     Setup: Re ψ(x+iH) = ∫f(x−s)dN(s), f(t) = t/(t²+H²); by parts
     against the counting error e(s) = N(s) − (1/π)∫₀ˢΩ − d:
     |Re ψ − x/4d′| ≤ ∫|e(s)||f′(x−s)|ds, with the Prüfer bound
     |e(s)| ≤ 1 + (1/2π)ln(Ω(0)/Ω(s)) and ∫|f′| = 2/H.

     TIER 1 [PROVED — unconditional, elementary; constant hardened
     round 307]: with bulk cutoff Ω₀ = d^{−1/3},
     |Re ψ| ≤ x/4d + (2/H)·max(1.025 + ln d/6π, 2.43)
     (1.025 from the Szegő-hardened E1; 2.43 from E1b's beyond-edge
     bound, which dominates for d < 3×10¹¹). The full cap budget
     K_cap ≤ 5.954 then holds for ALL d ≤ 10⁵³ (threshold ln d ≤ 122).
     (Every constant explicit; no localization, no asymptotics.)

     TIER 2 [PROVED — explicit for d >= 10^6]:
     split at T = d^{1/6}. (i) Constant part of e: contributes
     2e(x)f(T) ≤ 2E₀T/(T²+H²) → 0. (ii) Local variation over
     |s−x| ≤ T: |e(s)−e(x)| ≤ 1 + T·sup|Ω′|/πΩ ≤ 1 + T/(4πdΩ₀²) =
     1 + d^{1/6−1/3}/4π → 1; contribution (2/H)(1 + o(1)).
     (iii) Far field: 2E₀/T → 0. Hence |Re ψ(x+iH)| ≤ x/4d + 2/H +
     o(1) ≤ 1.637 + o(1) at H = π, and with 2.5(a):

         K_cap ≤ √(1.637² + 1.319²) + o(1) = 2.10 + o(1)   (bulk).

     EDGE ZONE (Ω(x) ≤ d^{−1/3}): spacing ≥ π⁻d^{1/3}; nearest-zero
     contributions O(d^{−1/3}); one-sided density tail bounded by the
     integrable edge transform (1/π)∫₀^{w_e}Ω/(w_e−w)dw = 2√2/π = 0.900;
     |Re ψ| ≤ 1 + 0.900 + o(1), K_cap ≤ √(1.91² + 1.32²) = 2.32 + o(1).

     CONCLUSION: K_cap ≤ 2.4 + o(1) uniformly, vs 5.954 required —
     margin 2.5×; and unconditionally K_cap < 5.954 for all d ≤ 10⁵³ by
     Tier 1 alone. Remaining polish [GPT audit + final write-up]: the
     o(1) constants in (i)-(iii) made explicit, and the edge-zone
     nearest-neighbour count formalized. GPT's flag (edge accounting)
     addressed by the Tier-1 fallback: any residual edge gap costs only
     the uniformity, never correctness below 10⁵³.
     GPT v1 audit: Tier 1's constants check out as an explicit finite-range
     cap proof through d <= 10^53. Tier 2 has the right structure and the
     edge split addresses the earlier edge-accounting concern, but the
     uniform all-d conclusion should remain [PROVED-1] until the o(1)
     thresholds in the bulk and edge estimates are written as explicit
     inequalities.

     TIER 2 — EXPLICIT VERSION [Fable v2, round 296; GPT v2 line audit;
     constants HARDENED round 307 after referee-2 attack 1 — no
     unquantified O(1) remains anywhere in E1-E8].
     Fix H = π, Ω₀ = d^{−1/3}, T = d^{1/6}, and let d ≥ d₁ := 10⁶.
     Counting bounds, every constant cited or self-contained:
         (E1)  Interior (|s| ≤ ρ_d):  E₀ ≤ 1.025 + ln d/(6π).
               Provenance: C_d(w) ∝ H_{2d}(w/√(4d)) (classical
               L_d^{(−1/2)}–Hermite identity), so ρ_d = √(4d)·x_max(H_{2d});
               Szegő Thm 6.32 gives the HARD inequality (round-309
               primary-source check: DLMF §18.16 states this as a strict
               inequality for the largest zero, citing Szegő 1975
               Thm 6.32 — not merely the asymptotic ε_n-corollary some
               secondary sources quote)
                   x_max(H_n) < √(2n+1) − 6^{−1/3}i₁·(2n+1)^{−1/6},
               6^{−1/3}i₁ = 1.85574… ≥ 1.8557 (i₁ = least positive zero
               of Szegő's Airy function = 3^{1/3}|a₁| = 3.3721 in the
               modern normalization a₁ = −2.33811; the constant is rounded
               DOWN — an earlier display wrote 1.85575, the unsafe
               rounding direction by 5e−6, caught in the round-309
               source check); numerically re-verified d = 2…200 (true
               inequality, shrinking margin — asymptotically sharp). With n = 2d, w_e = √(4d)√(4d+1):
                   w_e − ρ_d ≥ 1.8557·√(4d)·(4d+1)^{−1/6}
                   ⟹ Ω(ρ_d)² ≥ (w_e−ρ_d)w_e/16d² ≥ 0.736·d^{−2/3}(1−ε_d)
                   ⟹ Ω(ρ_d) ≥ 0.858·d^{−1/3}   (d ≥ 10⁶; measured 1.20),
               hence ln(Ω(0)/Ω(s)) ≤ (ln d)/3 + ln(1/0.858) + 1/(8d) ≤
               (ln d)/3 + 0.154, and E₀ ≤ 1 + 0.154/(2π) + ln d/(6π) ≤
               1.025 + ln d/(6π). (The previously displayed 1.004 was
               unjustified — referee-2 attack confirmed and repaired.)
         (E1b) Beyond the last zero (|s| > ρ_d): e decreases monotonically
               from e(ρ_d⁺) to its terminal value −1/4 (total semicircle
               mass per side = d + 1/4), and e(ρ_d⁺) = (tail mass) − 1/4
               with the SELF-CONTAINED Sturm gap bound: no zero of u in
               (ρ_d, w_e) forces Ω(w_e − g/2)·(g/2) < π where
               Ω(w_e−g/2)² ≥ g/8d, i.e. g := w_e − ρ_d ≤ 6.81·d^{1/3};
               then tail mass = (1/π)∫_{ρ_d}^{w_e}Ω ≤
               (√(2w_e)/4πd)(2/3)g^{3/2} ≤ 2.68. Hence
                   |e(s)| ≤ 2.43 for all |s| > ρ_d, uniformly in d.
               (Measured: sup|e| ≈ 0.51 everywhere, flat in d — E1 and
               E1b are conservative; they are what the cited inequalities
               certify, with no hidden constants.)
     BULK x (Ω(x) ≥ 2Ω₀):
         (E2)  smooth-part deviation at height H:
               |Re G_ρ(x+iH) − x/4d| ≤ H·sup|G′| ≤ π/(4d^{2/3}),
               using √(w_e²−x²) = w_e Ω(x)/Ω(0) ≥ 4dΩ₀.
         (E3)  near window |s−x| ≤ T: local variation
               |e(s)−e(x)| ≤ 3/2 + 1/(4π d^{1/6})
               Proof now explicit. On a bulk interval I where Ω > 0, use
               the modified Prüfer variables

                   u = R Ω^{-1/2} sin θ,       u' = R Ω^{1/2} cos θ.

               A direct calculation from u'' + Ω²u = 0 gives

                   θ' = Ω + (Ω'/2Ω) sin(2θ),

               hence

                   |(θ(b)-θ(a)) - ∫_a^b Ω| ≤ (1/2)∫_I |Ω'|/Ω.

               Zeros are the crossings θ ∈ πZ. The integer crossing
               ambiguity contributes at most 1, and we reserve the standard
               Weyl half-endpoint correction 1/2 used by the global counting
               convention; this deliberately wasteful bracket gives

                   |e(b)-e(a)| ≤ 3/2 + (1/2π)∫_I |Ω'|/Ω.

               For the local window take |I| ≤ 2T (covering both sides of
               the kernel window). The bulk hypothesis Ω(x) ≥ 2Ω₀ and
               |I| ≤ 2T imply Ω ≥ Ω₀ on I for d ≥ 10⁶; then
               Ω ≥ Ω₀ also implies |t| ≤ 4d in
               Ω'(t) = −t/(16d²Ω(t)), so |Ω'|/Ω ≤ 1/(4dΩ²). With
               Ω₀ = d^{-1/3} and T = d^{1/6},

                   ∫_I |Ω'|/Ω ≤ 2T/(4dΩ₀²) = 1/(2d^{1/6}),

               giving the displayed `1/(4πd^{1/6})`. No empirical input is
               used in E3.
               contribution ≤ (3/2 + 1/(4πd^{1/6}))·(2/π).
         (E4)  boundary + far field: ≤ 4E₀/T = 4E₀/d^{1/6}, plus the
               beyond-edge region: for bulk x, w_e − x = (w_e²−x²)/(w_e+x)
               ≥ 16d²·(2Ω₀)²/(2w_e)
               = 8d^{1/3}/sqrt(1+1/(4d)) ≥ 7.99d^{1/3} for d ≥ 10⁶,
               so the |s| > ρ_d region sits at distance ≥ 7.99d^{1/3}
               and contributes (E1b)
               ≤ 2.43·2/(7.99d^{1/3}) ≤ 0.609/d^{1/3} ≤ 0.007 at d = 10⁶.
         (E5)  total at d = 10⁶ (the maximum over d ≥ 10⁶, since
               ln d/d^{1/6} is decreasing there; E₀ = 1.758 hardened):
               |Re ψ| ≤ 1 + 0.0001 + 0.960 + 0.704 + 0.007 = 2.671,
               K_cap ≤ √(2.671² + 1.319²) = 2.98 < 5.954.
     EDGE x (Ω(x) < 2Ω₀): local spacing ≥ π/(2Ω₀ + 1/(4√d)) ≥ (π/2)d^{1/3};
         (E6)  near zeros within Λ = πd^{1/3}: count ≤ 5, each |f| ≤ 1/2H:
               contribution ≤ 5/(2π) = 0.796;
               GPT audit correction: the displayed local-spacing lower bound
               π/(2Ω₀+1/(4√d)) is too optimistic over the whole Λ-window.
               However Ω² can increase by at most (π/2)d^(-2/3) across Λ,
               so Ω ≤ sqrt(4+π/2)d^(-1/3) < 2.37d^(-1/3), giving spacing
               ≥ (π/2.37)d^(1/3) and still at most 5 zeros in the window.
         (E7)  far field (|s−x| > Λ) — explicit version (referee fix,
               round 302; the discrete-to-continuous control was present
               but compressed; it is now displayed, and the discrete
               constant is corrected from 2E₀/Λ to 4E₀/Λ to match (E4)):
               (E7a) smooth part. Past the largest zero the sign
               cancellation in Re ψ collapses — every term is positive —
               so the density transform must be bounded ONE-SIDEDLY at
               its worst point. For x in the edge zone the PV (gauge)
               part is x/4d ≤ w_e/4d = √(1+1/4d); the one-sided edge
               enhancement is bounded by the edge transform at x = w_e:
               (1/π)∫₀^{w_e} Ω(s)/(w_e−s) ds
                 = (1/4πd)∫₀^{w_e} √(w_e+s)/√(w_e−s) ds
                 = ((π/2 + 1)/π)·(w_e/4d) ≤ 0.8184   (d ≥ 10⁶),
               by the EXACT closed form: substituting u = w_e − s =
               2w_e sin²φ gives ∫ = 4w_e∫₀^{π/4}cos²φ dφ = w_e(π/2+1);
               quadrature-verified. (Round 302 had used the crude step
               √(w_e+s) ≤ √(2w_e) giving 0.9004; round 307 promotes the
               exact value — the 0.082 of slack now pays for the E1
               hardening. For x > w_e the full far-field transform is
               ≤ its value at x = w_e and decreasing in x, so the same
               budget covers it.)
               (E7b) discrete part. By parts against the counting error
               e(s) = N(s) − (1/π)∫₀ˢΩ − d exactly as in (E4): two
               boundary terms 2·sup|e|·f(Λ) plus the tail variation
               sup|e|·∫_{|t|≥Λ}|f′(t)|dt = sup|e|·2Λ/(Λ²+H²), total
               ≤ 4·sup|e|/Λ with sup|e| ≤ max(E₀, 2.43) = 2.43 at
               d = 10⁶ (E1 interior + E1b beyond-edge — both explicit,
               no asymptotic gloss): ≤ 4·2.43/(πd^{1/3}) ≤ 0.031.
         (E8)  total: |Re ψ| ≤ 5/(2π) + √(1+1/4d) + 0.8184 + 0.031
               = 2.646, K_cap ≤ √(2.646² + 1.319²) = 2.96.
     CONCLUSION (round-307 hardened): K_cap ≤ max(2.98 bulk, 2.96 edge)
     = 2.98 < 5.954 for all d ≥ 10⁶ explicitly — IMPROVED from the
     round-302 value 3.03, because promoting E7a to its exact closed
     form buys more than the E1/E1b hardening costs. Tier 1 covers
     d ≤ 10⁵³ (with the hardened constant: Re ≤ √(1+1/4d) +
     (2/π)·max(1.025 + ln d/6π, 2.43); the range threshold ln d ≤ 122
     is unchanged at order). Overlap 47 orders of magnitude ⟹ the Cap
     Lemma holds FOR ALL d. No o(1), no O(1), no asymptotic gloss
     remains in the chain.

     GPT F116 re-audit of round-307 hardening: accepted. Details checked:
     the Hermite/Szegő unfolding gives Ω(ρ_d) ≥ 0.858d^(−1/3); the E1b
     midpoint Sturm bound gives g ≤ (32π²)^(1/3)d^(1/3) = 6.8101d^(1/3);
     the E7a integral equals w_e(π/2+1); E5/E8 arithmetic gives K_bulk =
     2.9775 and K_edge = 2.9557; the X-wall ratio is 0.3708 and floor is
     0.2414. Only the E4 displayed distance was tightened from
     `8d^(1/3)` to `8d^(1/3)/sqrt(1+1/(4d))`, with no effect on the
     published 0.007 budget.

     DESIGN NOTE (two-tier split — response to referee-2 attack 4):
     the split is internal scaffolding, not part of the theorem
     statement; Corollary T's (K) composes the tiers into ONE uniform
     constant. We keep Tier 1 deliberately: it is an independent
     elementary proof path whose redundancy has already caught one real
     flag (the original edge-accounting concern), and removing it would
     trade robustness for aesthetics. A single argument scaling to
     d = 1 is a polish goal, not a correctness need.

2.6 [PROVED — GPT v1 audited] **A1 (upward propagation of the cap bound).**
For every x and every H > 0: sup_{y ≥ H} |ψ(x+iy)| ≤ max(|ψ(x+iH)|, 1).
Proof: along the vertical from y = H, W2's Riccati identity
d|ψ|²/dy = −(y/d)|ψ|² − 2(1−|ψ|²) Im ψ has both terms strictly negative
whenever |ψ| > 1 (the first since y > 0; the second since Im ψ < 0 by 1.2
and 1−|ψ|² < 0), so |ψ| is strictly decreasing while above 1 and can never
exceed its value at the cap. ∎ (No height-monotonicity of the constant is
needed; the cap value itself propagates.)

## §3 Assembly

3.1 Cells. C_d is even of degree 2d with 2d real simple zeros (1.2), so
C_d′ is odd of degree 2d − 1; Rolle places one critical point in each of
the 2d − 1 gaps between consecutive zeros, which exhausts the degree —
all critical points are real and simple, the middle one is c_0 = 0
(oddness; equivalently C_d even ⟹ C_d′(0) = 0), and there are exactly
**d − 1 positive critical points** c_1 < c_2 < … < c_{d−1}, interlacing as

    0 = c_0 < ρ_1 < c_1 < ρ_2 < c_2 < … < c_{d−1} < ρ_d.

(Referee fix, round 302: an earlier version indexed a final critical point
"c_d", which does not exist; numerically confirmed d = 2…12: #positive
criticals = d − 1, full interlacing, last zero beyond last critical.)
Cells: Λ_m = [c_m, c_{m+1}] × [−H, H] for m = 0, …, d−2; each Λ_m contains
exactly one zero of C_d (namely ρ_{m+1}). The largest zero ρ_d lies in the
final half-cell [c_{d−1}, X] × [−H, H] treated in 3.2. The cells plus their
mirror images tile the strip over the zero set.

_Degenerate case d = 1 (round-308 hardening sweep — adversarial referees
strike at boundary cases first): there are NO positive critical points
(d − 1 = 0), the interior cell range m = 0, …, d−2 is empty, and the
interlacing display degenerates to 0 = c_0 < ρ_1. The assembly is the
single half-cell [c_0, X] × [−H, H] = [0, ρ_1 + 1] × [−H, H] plus its
mirror: wall at c_0 = 0 (a critical point by evenness — W3 applies),
caps and X-wall as in 3.2, one zero per half-cell, conjugation
finisher, count 2 = 2d. Every lemma is d-uniform and none assumes
d ≥ 2; verified directly: Ψ_1(w) = 1 − (e^γ/4)w², zeros ±2/e^{γ/2} =
±1.4988, real. Note ρ_1(C_1) = √2, so C_1's own gap 2√2 = 2.83 exceeds
π⁻ = π/√1.25 = 2.81 with 0.7% to spare — the spacing hypothesis is
TIGHT at d = 1; any future sharpening of π⁻ must re-check this case._

3.2 Boundary dominance for Rouché on |Ψ_d − pC_d| ≤ (1−p) sup_v |C_d(vw)|:
 - Walls Re w = c_m: W3 gives ratio ≤ (1−p)√2/p = 0.2345 < 1.
 - Caps Im w = ±H: 2.1 + W1 + Cap Lemma give ratio ≤
   (1−p)√(1+K_cap²)/p ≤ (1−p)√(1+2.98²)/p = 0.522 < 1 (round-307
   hardened K_cap; an earlier draft displayed the stale interim
   value 3.6 here — round-308 consistency sweep).
 - Above the caps — **non-vanishing, not Rouché** (referee fix, round 302:
   Rouché needs a closed bounded contour and {Im w > H} is neither; the
   correct statement is pointwise non-vanishing, which the same chain
   delivers). For every w = x + iy with y ≥ H and x ≥ 0:
   |C_d(vw)| ≤ |C_d(vx + iy)| (2.1) ≤ √E(vx) ≤ √E(x) (W1)
   = |C_d(w)|√(1 + |ψ(w)|²) ≤ |C_d(w)|√(1 + K_cap²) (A1 propagates the
   cap value upward). Hence in the factorization
   Ψ_d(w) = pC_d(w)·[1 + (1/p)∫₀¹ (C_d(vw)/C_d(w)) dμ(v)] the bracket
   satisfies |bracket − 1| ≤ (1−p)√(1+K_cap²)/p < 1, so it never vanishes;
   and C_d(w) ≠ 0 off the real axis (1.2). Both factors nonzero ⟹
   Ψ_d ≠ 0 on {Im w ≥ H}. Evenness of Ψ_d covers x < 0; conjugation
   symmetry covers Im w ≤ −H.
 - Beyond the last critical point (final half-cell [c_{d−1}, X] × [−H, H]):
   wall at c_{d−1} by W3 (W3 holds at every critical wall); caps by
   2.5 + 2.6. The far wall is EXPLICIT (round 307, replacing the earlier
   existential "X large enough" — referee-2 attack 2):

       X := ρ_d + d.

   On the segment {X} × [−H, H]: every one of the 2d zeros satisfies
   |X + iy − ρ_j| ≥ X − ρ_j ≥ X − ρ_d = d, so
   |ψ(X + iy)| ≤ Σ_j 1/(X − ρ_j) ≤ 2d/d = 2. The W3-chain then runs on
   the X-wall verbatim: |C_d(v(X+iy))| ≤ |C_d(vX + iy)| (2.1) ≤ √E(vX)
   ≤ √E(X) (W1) = |C_d(X+iy)|√(1 + |ψ(X+iy)|²) ≤ √5·|C_d(X+iy)|,
   giving ratio ≤ (1−p)√5/p = 0.371 < 1. Rouché applies to the bounded
   rectangle [c_{d−1}, ρ_d + d] × [−H, H]. (Note X ≤ w_e + d ≤ 5d + 1 —
   the cell geometry is explicitly polynomial in d; nothing is
   existential anywhere in the assembly.)

3.3 Rouché per cell: Ψ_d and pC_d have equal zero counts in each Λ_m: one.

3.4 Conjugation finisher: each Λ_m is symmetric under conjugation and Ψ_d
has real coefficients; a nonreal zero in Λ_m would force its conjugate into
the same cell — two zeros, contradicting 3.3. Hence the unique zero in each
cell is real.

3.5 Count: 2d real zeros located; deg Ψ_d = 2d. All zeros real. ∎

## §3a Relation to classical literature (novelty assessment, round 297)

Three targeted literature sweeps (Sonin–Pólya extensions; log-derivative
bounds for Hermite/Laguerre in ℂ; Hermite–Biehler/de Branges phase theory)
found no statement matching W1 or W2:

- **W1's closest relative** is the classical Sonin function
  S = f² + f′²/B on the REAL axis (Sonin–Pólya–Butlewski; higher-monotonicity
  literature, e.g. [EUDML 31637](https://eudml.org/doc/31637)). The complex
  extension — E = |f|² + |f′|² monotone along HORIZONTAL LINES with the exact
  derivative (x/d)|f′|² — did not surface anywhere. W1's y = 0 case is
  classical; the off-axis statement appears new.
- **W2's closest relatives**: the Laguerre inequality (Σ1/(x−x_j)² > 0, a
  real-axis pointwise statement) and the Hermite–Biehler facts Im ψ ≤ 0 in
  ℂ⁺ / |E*/E| ≤ 1 (which bound the PHASE half-plane, not the magnitude
  |ψ|). The unit-magnitude barrier |C′/C| < 1 on critical walls — driven by
  the Riccati friction and absorbing/attracting at |ψ| = 1 — did not
  surface. The de Branges phase-derivative boundedness literature
  ([sampling/interpolation](https://arxiv.org/pdf/1103.0566)) concerns the
  real-axis phase, a different quantity.

HONEST VERDICT: plausibly new as stated; absence from three searches is
weak evidence (not proof) of absence. Before any novelty claim in a
published version: MathSciNet/expert check, and present both results WITH
the classical context above. The template direction (W2′: spacing-driven
barrier, F97) compounds the novelty question and should be checked
together with it.

## §3b Corollary T — transport-ready boundary floor (lane A) [PROVED — GPT F106 audit, with degree/exterior-scope qualification]

Step (α) of the F103 transport chain, extracted entirely from the
machinery above. First, a uniform cap constant for ALL d ≥ 1:

 (K)  K := 2.98 bounds sup_x |ψ(x+iH)| for every d ≥ 1 (round-307
      hardened constants throughout):
      d ≤ 4 — trivial bound |ψ| ≤ 2d/H ≤ 8/π = 2.55 (each of the 2d
      terms ≤ 1/H); 5 ≤ d < 10⁶ — Tier 1 hardened: Re ≤ √(1+1/4d) +
      (2/π)·max(1.025 + ln d/6π, 2.43) ≤ 1.025 + 0.6366·2.43 ≤ 2.58,
      Im ≤ √(1+1/4d) + 1/π ≤ 1.35 (layer-cake of 2.5(a), constants
      explicit), K ≤ √(2.58² + 1.35²) ≤ 2.92;
      d ≥ 10⁶ — Tier 2 hardened (E5/E8), K ≤ 2.98.
      (Round 302 used K = 3.03; the E7a exact closed form more than
      pays for the E1/E1b hardening.)

Set r_cap := (1−p)√(1+K²)/p = 0.5212. The cap-floor threshold is
K ≤ 3.0500 (GPT F107: solve p/√(1+K²) − (1−p) = 1/8); headroom is now
2.3% in K (was 0.66% at K = 3.03).

**Corollary T.** For every d ≥ 1: |Ψ_d(w)| ≥ m₀ := 1/8 on the entire
boundary of every Theorem-M cell, and |Ψ_d(w)| ≥ 0.403·|C_d(w)| ≥ 1/8
on the whole closed region {|Im w| ≥ H}. Per boundary piece:

 (T1) Walls Re w = c_m: |Ψ_d| ≥ p(1 − (1−p)√2/p)|C_d(c_m+iy)| ≥
      0.7655·p·|C_d(c_m)| ≥ 0.656, because W1 at y = 0 proves the
      critical values satisfy |C_d(c_m)| ≥ 1: on the real axis
      E = C_d² + C_d′², E′ = (x/d)C_d′² ≥ 0, E(0) = C_d(0)² = 1, and at
      criticals E(c_m) = C_d(c_m)². (This upgrades §4's archived
      "Lemma A + M₁ ≥ 1" pod numerics, d = 8…160, to a one-line
      theorem.) Then 2.1 lifts the wall foot from y = 0 to all y.
 (T2) Caps Im w = ±H: |Ψ_d| ≥ p(1−r_cap)|C_d(x+iH)| and
      |C_d(x+iH)|² ≥ E(x)/(1+K²) ≥ E(0)/(1+K²) ≥ |C_d(iH)|²/(1+K²)
      ≥ 1/(1+K²), since C_d(iH) = Π(1+H²/ρ_j²) ≥ 1 and W1 makes E
      nondecreasing in x ≥ 0 (evenness covers x < 0). So
      |C_d(x+iH)| ≥ 1/√(1+K²) = 0.318 and
      |Ψ_d| ≥ 0.4788·0.8578·0.318 = 0.1306 ≥ 1/8 (margin 4.5%, up from
      1.3% at K = 3.03).
 (T3) Far X-wall (final half-cell, EXPLICIT X = ρ_d + d per 3.2):
      |ψ(X+iy)| ≤ 2 trivially, so the ratio is ≤ (1−p)√5/p = 0.371 and
      |Ψ_d(X+iy)| ≥ p(1 − 0.371)·|C_d(X+iy)|. For the floor on |C_d|:
      W1 at the real axis gives E(X) ≥ E(0) = 1, and
      E(X) = C_d(X)²(1 + ψ(X)²) ≤ 5·C_d(X)², so |C_d(X)| ≥ 1/√5 and
      |C_d(X+iy)| ≥ |C_d(X)| (2.1). Floor:
      |Ψ_d| ≥ 0.8578·0.629·0.4472 = 0.241. Nothing existential remains.
 (T4) Region {Im w ≥ H}: same chain as 3.2's non-vanishing bullet,
      |Ψ_d(w)| ≥ p(1−r_cap)|C_d(w)| ≥ 0.403·|C_d(w)|, and
      |C_d(w)| ≥ |C_d(x+iH)| ≥ 0.313 by 2.1, so ≥ 0.126 ≥ 1/8.
      Conjugation symmetry covers Im w ≤ −H.

The binding constraint is the cap floor (T2): m₀ = 0.1306; walls and
X-wall carry 5× more room. m₀ is an ABSOLUTE constant — uniform in d,
in the cell index, and in the boundary point. (The stated bounds 1/8
and 0.403|C_d| in the transport consequence are kept as the published
interface — both now hold with extra room: p(1−r_cap) = 0.4107 ≥ 0.403.)

**Transport consequence (the (γ)-interface).** If F is any even
real-coefficient polynomial of degree at most 2d with
sup_{∂Λ}|F − Ψ_d| < 1/8 on every cell boundary and
|F − Ψ_d| < 0.403·|C_d(w)| on {|Im w| ≥ H}, then:
F has exactly one zero per cell (Rouché |F − Ψ_d| < |Ψ_d| on ∂Λ), that
zero is real (conjugation finisher 3.4 applies verbatim to F), and F
has no zeros off the strip (non-vanishing, T4). Since the cell count already
accounts for 2d zeros, the degree bound excludes extra zeros in the exterior
strip beyond the finite X-wall. For a non-polynomial entire target, this last
sentence must be replaced by an independent exterior-strip no-extra-zeros
condition. Step (β) therefore has a fixed, d-independent target for the
finite Jensen sections: drive the kernel norm ‖ΔΦ‖_{1,H} (and its
Jensen-section image) below the absolute constant 1/8 at the κ_d scale.
The beta socket and the remaining kernel-realization lemma are separated in
`docs/rh/kernel_norm_transport.md`; coefficient-window control from F65/G2 is
not by itself a weighted kernel-norm theorem.

## §4 Corroboration and numerics (archived)

- Exact Krawtchouk–Sturm certificates: all walls PASS for d ≤ 9; d = 10
  transverse run PASS on all nine walls (GPT pod; independent of Theorem M's
  route). Each wall passed q^1..q^20 in transverse-only mode, all stderr
  files empty. Final archive:
  artifacts/runpod/gpt_rh_walljet_d10_final_20260612_1527/; tarball SHA-256:
  d537cd6da73e8b4b028155dc037732081ca8a26f7b85e0d44747eedf3444bc9e.
- [GPT v1] The F55 stronger-cone diagnostic is

      B_{d,m}(s;r)=sum_{k,l} a_{d,k}a_{d,l}r^(k+l-m)K_{k,l,m}
                   (1-s^(k+l))/(1-s),
      K_{k,l,m}=(-1)^m[x^(2m)](1-x)^(2k)(1+x)^(2l).

  F58 closes m=0 for all d, F57 closes m=1 for all d, and exact
  CRootOf/Sturm certificates close all m for d <= 9. This is stronger than
  needed for Theorem M's Rouché wall budget.
- Lemma B referee (d = 12, 16): worst wall ratio = (1−p)/p = 0.16582
  exactly, at the v = 1 endpoint — strictly inside W3's √2 budget.
- v*(d): 1 − v* = 1.56/d (d = 16…128) — endpoint control, archived.
- Lemma A + M₁ ≥ 1 (Sonin–Pólya + pod confirmation d = 8…160): the y = 0
  slice of wall dominance; W1 at y = 0 reduces to exactly this.
- All numerical artifacts: logs/pod_archive_20260612/, artifacts/runpod/.
- **Referee-runnable verification suite** (round 308, campaign P4):
  `scripts/research/hilbertPolya/theoremM_verify.py` — re-derives every
  numbered constant (E1 inputs, E5/E8/K_cap chain, Corollary T floor and
  its K = 3.0500 threshold, X-wall and wall budgets), checks the §1.4a
  construction (λ-mass, atom, Binet (B), ratio (R) — cancellation-safe η),
  spot-checks the W1/W2 identities, and verifies the theorem's CONCLUSION
  end-to-end (Ψ_d hyperbolic, sign-change count = d, adaptive precision to
  450 digits, default d ≤ 300). One command, PASS/FAIL per item, exit code
  for CI.

## §4a Publication-hardening P2 clean-room re-derivations

**Round 309 / GPT F118 batch 1: W1, W2, W3, A1 [PASS].** Method: rederive
from the statements and the ODE, then compare with the written proof.

- **W1.** From `C''-(w/2d)C'+C=0`, with `w=x+iy`,

      d_x(|C|²+|C'|²)
      = 2 Re(C'\bar C+C''\bar C')
      = 2 Re(C'\bar C+((w/2d)C'-C)\bar C')
      = (x/d)|C'|².

  Cross terms cancel and the imaginary part of `w` contributes no real part.
  Thus W1 is exactly correct for `x>=0`; evenness supplies the mirrored
  monotonicity for `x<=0`.

- **W2.** With `ψ=C'/C`, the Riccati equation is

      ψ' = (w/2d)ψ - 1 - ψ².

  Along a vertical line,

      d_y|ψ|² = 2 Re(iψ'\bar ψ)
              = -(y/d)|ψ|² - 2(1-|ψ|²)Imψ.

  On a critical wall foot `ψ(c)=0`. Since `Imψ<0` in the upper half-plane,
  a first upward crossing of `|ψ|=1` is impossible: at `|ψ|=1`, the derivative
  is `-y/d<0`. Hence `|ψ(c+iy)|<1` for `y>0`. W2 is correct.

- **W3.** For `c>=0`,

      |C(v(c+iy))|² <= |C(vc+iy)|²

  by per-factor y-monotonicity, since the imaginary part increases from
  `vy` to `y` at fixed real part `vc`. Then

      |C(vc+iy)|² <= E(vc) <= E(c)
        = |C(c+iy)|²(1+|ψ(c+iy)|²) < 2|C(c+iy)|².

  The only text hygiene issue is domain wording: the chain uses W1 on
  `0<=vc<=c`, so the written proof should explicitly say `c>=0`; negative
  walls follow by evenness. That parenthetical has been added. No mathematical
  change.

- **A1.** The same Riccati identity holds on every vertical line, not only
  critical walls. If `|ψ|>1`, both terms in

      d_y|ψ|² = -(y/d)|ψ|² - 2(1-|ψ|²)Imψ

  are strictly negative for `y>0`, because `Imψ<0`. Therefore `|ψ|` decreases
  whenever it is above 1 and cannot exceed `max(|ψ(x+iH)|,1)` above height
  `H`. A1 is correct.

**Round 309 / GPT F119 batch 2: X-wall, Corollary T, W2′, B_ref [PASS with
scope notes].** Method: rederive the statement from its inputs without using
the prose proof, then compare.

- **X-wall.** Set `X=rho_d+d`. For every zero `rho_j`,

      |X+iy-rho_j| >= X-rho_j >= X-rho_d = d,

  so `|ψ(X+iy)| <= 2d/d = 2`. The generic W3-style chain, using only
  y-monotonicity and W1, gives

      |C(v(X+iy))| <= |C(vX+iy)| <= sqrt(E(vX)) <= sqrt(E(X))
        = |C(X+iy)|sqrt(1+|ψ(X+iy)|²) <= sqrt(5)|C(X+iy)|.

  Hence the Rouché ratio is `(1-p)sqrt(5)/p = 0.370789... < 1`. At `y=0`,
  W1 gives `E(X)>=E(0)=1`, while `E(X)=C(X)^2(1+ψ(X)^2)<=5C(X)^2`; so
  `|C(X)|>=1/sqrt(5)` and the floor is
  `p(1-0.370789...)/sqrt(5)=0.241367...`. X-wall is correct.

- **Corollary T.** With `K=2.98` and
  `r_cap=(1-p)sqrt(1+K²)/p=0.52123...`, the cap floor is

      p(1-r_cap)/sqrt(1+K²)=0.130649... > 1/8.

  Wall floor follows from W3 plus the real-axis W1 critical-value bound
  `|C(c_m)|>=1`: `p-(1-p)sqrt(2)=0.6564...`. X-wall floor is the value
  above. Off-strip non-vanishing uses the same `p(1-r_cap)|C|` inequality
  and the published weaker interface `0.403|C|`; the old `0.313` lower bound
  still suffices, while the hardened `K=2.98` actually gives `1/sqrt(1+K²)
  =0.3183`. Scope qualification is essential and correct: finite boundary
  control transports even real polynomials of degree at most `2d`; arbitrary
  entire targets still need an exterior-strip no-extra-zeros input.

- **W2′.** Lemma 1 is a direct criticality/truncation identity: if the nearest
  zero is at distance `δ<π/2`, then radius `π-δ>1` excludes only that zero,
  and the truncated sum over all other zeros equals `-1/(c-rho*)`; hence
  `1/δ<=B`. Lemma 2's three pieces reproduce: one near zero contributes
  `1/δ`; the imaginary far part is bounded by layer-cake or the tanh grid
  identity; the real far part splits into the legal truncated-Hilbert tail
  plus middle/outer positive remainders. The constant

      1 + 6/pi + log(2)/pi = 3.130494...

  is correct, and the final `2B+3.77` headline follows. Scope note: the
  clean-room proof is literal for finite configurations; infinite
  configurations require the stated principal-value convergence convention.

- **B_ref.** The analytic statement proves only the Tier-2 range `d>=10^6`.
  Smooth part: the truncated semicircle transform is bounded by 1 after
  rescaling; the physical multiplier is `w_e/(4d)<=1.0000002`. Fluctuation:
  the odd kernel `1/t` cancels the constant counting-error part, local
  variation costs `<=4M/r` with `M=3/2+epsilon_3`, and far tail costs
  `4E0/d^(1/6)<=0.695` at `d=10^6`. Thus `B_ref<=7.8` is valid for
  `d>=10^6`. The note's scope warning is necessary: `d<=200` is numerical,
  `200<d<10^6` is not certified by this lemma.

**Round 309 / GPT F120 batch 3: E1/E1b and E7a/E7b [PASS].** This completes
GPT's assigned P2 clean-room queue.

- **E1.** Assuming the stated Hermite identity and Szegő largest-zero bound,
  the constants rederive directly. Since

      rho_d = sqrt(4d) x_max(H_{2d}),
      w_e = sqrt(4d)sqrt(4d+1),

  Szegő gives

      w_e-rho_d >= 1.8557 sqrt(4d)(4d+1)^(-1/6).

  Therefore

      Omega(rho_d)^2
      = (w_e-rho_d)(w_e+rho_d)/(16d^2)
      >= (w_e-rho_d)w_e/(16d^2)
      >= 0.73643 d^(-2/3),

  so `Omega(rho_d)>=0.85815d^(-1/3)`, and hence the published weaker
  `Omega(rho_d)>=0.858d^(-1/3)`. Since

      Omega(0)=sqrt(1+1/(4d)),

  the Prüfer logarithm satisfies

      log(Omega(0)/Omega(s)) <= (1/3)log d + log(1/0.858) + 1/(8d),

  and hence `E0 <= 1.025 + log(d)/(6pi)`. E1 passes, conditional on the
  primary-source Szegő citation, now checked against DLMF §18.16.

- **E1b.** Let `g=w_e-rho_d`. At the midpoint of the edge gap,

      Omega(w_e-g/2)^2
      = (g/2)(2w_e-g/2)/(16d^2) >= g/(8d),

  because `g<=w_e` and `w_e>=4d`. The stated zero-free Sturm comparison gives
  `Omega(w_e-g/2)(g/2)<pi`; combining,

      g <= (32pi^2)^(1/3)d^(1/3) = 6.81004d^(1/3).

  The edge tail mass then satisfies

      (1/pi)int_{rho_d}^{w_e}Omega(s)ds
      <= (sqrt(2w_e)/(4pi d))(2/3)g^(3/2) <= 8/3 < 2.68.

  Therefore the beyond-edge counting-error budget `|e|<=2.43` is valid.

- **E7a.** The one-sided edge integral is exact:

      int_0^{w_e} sqrt(w_e+s)/sqrt(w_e-s) ds
      = w_e(pi/2+1),

  via `w_e-s=2w_e sin^2 phi`. Multiplying by `1/(4pi d)` gives

      ((pi/2+1)/pi)(w_e/(4d)) <= 0.8184        (d>=10^6).

  E7a passes.

- **E7b.** The discrete part is a by-parts bound against the cutoff far
  kernel. Boundary jumps and tail variation are both bounded by the same
  counting-error supremum, giving

      <= 4 sup|e| / Lambda,
      Lambda = pi d^(1/3),
      sup|e| <= max(E0,2.43)=2.43        at d=10^6.

  Hence

      4*2.43/(pi d^(1/3)) <= 0.031.

  E7b passes. P2 queue for GPT is complete; remaining campaign phases are P3
  source verification, P4 machine-verification script, and P5 statement
  hygiene/anti-hype.

## §5 Open items ledger (for the final version)

| Item | Owner | Status |
|------|-------|--------|
| §2.5c Re-part: Tier 1 (all d ≤ 10⁵³) | Fable | PROVED + GPT audited |
| §2.5c Re-part: Tier 2 (uniform, EXPLICIT E1-E8) | Fable + GPT | PROVED + GPT audited after E6/E7 constant corrections |
| §2.6 A1 upward propagation | Fable | PROVED + GPT audited |
| §1.4 μ ≥ 0 at all finite d | GPT | PROVED — self-contained construction §1.4a, Fable-audited round 308 |
| W1/W2/W3 | both | PROVED + audited |
| §2.5a,b | Fable | PROVED + GPT audited |
| Final assembly write-up | joint | PROVED; polish/citation/archive formatting only |
| Round-302 referee fixes (§3.1 indexing, §3.2 non-vanishing, E7 explicit) | Fable + GPT (ext. review: Gemini) | PROVED + GPT audited in F105 |
| §3b Corollary T (lane A: boundary floor m₀ = 1/8, uniform K for all d) | Fable + GPT | PROVED + GPT audited in F106, with polynomial-degree/exterior-strip scope |
| Lane B kernel norm (`docs/rh/kernel_norm_transport.md`) | GPT | theorem-shaped reduction; kernel-realization lemma remains open |
| Round-307 hardening (E1 Szegő constant, E1b beyond-edge, E7a exact, explicit X = ρ_d + d, K → 2.98) | Fable + GPT (ext. review: Gemini #2) | PROVED + GPT F116 audited, with harmless E4 distance correction |
| §1.4a self-contained μ ≥ 0 construction (referee-2 attack 3) | GPT + Fable | PROVED — F115 inlined; Fable audit round 308 (line-by-line + numeric to 1e−61 + END-TO-END: Ψ_d hyperbolic for all d = 1…300 at up to 450 digits) |
| Round-308/309 publication-hardening campaign (end-to-end conclusion verification, d = 1 degenerate case, stale-constant sweep; clean-room re-derivations queued) | both | IN PROGRESS — P2 complete; P3 source check complete with safe 1.8557 rounding; P4 verification suite passes; P5 statement hygiene partly addressed by scope warning; optional P6 Lean scope open |
