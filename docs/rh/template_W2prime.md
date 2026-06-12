# W2′ — The Spacing-Driven Wall Barrier (template lemma, refined)

_Fable, round 304, 2026-06-12 (~16:1x CEST). Status: [PROVED] after GPT
audit F109, with one decimal-constant correction. This is the template-program replacement for
Theorem M's W2 when no ODE is available: the dictionary's repulsion
hypotheses consume exactly this lemma._

## Context and necessity

- **W2 (Theorem M)** proves the wall barrier |ψ| < 1 via the Riccati
  closure ψ′ = (w/2d)ψ − 1 − ψ², which exists only because C_d solves
  an ODE. General zero configurations (displaced model zeros — the
  dictionary's zero side) have no ODE; the dynamics route is closed.
- **W2′-naive is FALSE** (round 298 / F101): spacing alone does not
  bound walls. The one-sided pile-up {0, π, 2π, …, dense tail to R}
  drags the first-gap critical point to δ ~ π/ln R from a zero and the
  wall value grows like ln(R)/π. The breaking mechanism is an unbounded
  one-sided Hilbert transform — so hypothesis (iii) below is NECESSARY,
  and the hypothesis list of the refined lemma is minimal.

## Hypotheses

Let Z = {ρ_j} ⊂ ℝ be a zero configuration and ψ(w) = Σ_j 1/(w − ρ_j)
(finite configuration, or principal-value convergent):

 (i)   real and simple;
 (ii)  gaps: ρ_{j+1} − ρ_j ≥ π;
 (iii) uniform truncated-Hilbert bound: for every x ∈ ℝ and every
       radius r ≥ 1,  |Σ_{|x−ρ_j| ≥ r} 1/(x − ρ_j)| ≤ B.

(For gap parameter g ≠ π rescale w ↦ πw/g; the constants below are
stated at g = π. Theorem M's C_d has gaps ≥ π⁻ = π/√(1+1/4d); the
rescaling cost is O(1/d).)

## Lemma 1 (zero–critical repulsion; improves round 299)

Every critical point c (ψ(c) = 0, c ∉ Z) satisfies

    dist(c, Z) ≥ δ_min := min(π/2, 1/B).

_Proof._ Let ρ* be a nearest zero, δ = |c − ρ*|. If δ ≥ π/2, done. If
δ < π/2: every other zero ρ has |c − ρ| ≥ π − δ — on ρ*'s side because
it is at least π beyond ρ*, on the opposite side because a flanking
zero at distance δ′ has δ + δ′ ≥ π. Since π − δ > π/2 > 1, hypothesis
(iii) with r = π − δ covers exactly the set Z \ {ρ*} (ρ* is excluded
because δ < π − δ). The criticality condition pull-balances:

    1/δ = |1/(c−ρ*)| = |Σ_{ρ≠ρ*} 1/(c−ρ)| ≤ B   ⟹   δ ≥ 1/B.  ∎

_Note:_ this strictly improves round 299's δ_min ≥ 1/(B + 4/π); the
gain comes from using the truncation radius π − δ instead of radius 1
(the near annulus [1, π − δ) contains no zeros at all, so its
contribution need not be budgeted).

_Sharpness (and honest scope)._ Lemma 1 is EXACT, and almost
tautologically so: at a critical point, (iii) with any radius
r ∈ (δ, π−δ] ∩ [1, ∞) truncates away exactly the nearest zero, and
criticality makes that truncated sum equal −1/(c−ρ*) — so the
(iii)-constant at basepoint c always satisfies B ≥ 1/δ. Lemma 1 is
therefore a one-line bookkeeping consequence of (iii), not an
independent estimate; its role is to license δ = 1/B in Lemma 2 when B
is supplied GLOBALLY (e.g. reference configuration + displacement
budget), without knowing where the critical points sit. Adversarial
test (100 random gap-π configs × 40 critical points, exact
piecewise-constant evaluation of the truncated-Hilbert sup): worst
dist/guarantee = 1.0000, with ≈ 11% of critical points at exact
equality — the bound binds precisely when the truncated-Hilbert sup is
attained at the near-exclusion level. (First-pass testing with a
gridded r-scan UNDERESTIMATES B — the truncated sum is piecewise
constant in r and the sup lives at jump radii; evaluate at the sorted
distance levels, never on a grid.)

## Lemma 2 (off-axis bound at controlled distance)

For every x with dist(x, Z) ≥ δ > 0 and every y ∈ ℝ:

    |ψ(x + iy)| ≤ 1/δ + B + c_geo,      c_geo := c_im + c_mid + c_out ≤ 3.131,

with every constant explicit (breakdown below). On the extremal π-grid
the numerically observed worst-case is c_geo = 2.31 (c_im = 1.000,
c_mid = 0.633, c_out = 0.678 — scan /tmp/w2prime_constants.py), so the
rigorous total carries ≈ 0.8 of slack.

_Proof._ Near zone {|x−ρ| < π/2}: by (ii) at most ONE zero (two would
be < π apart); its term is ≤ 1/|x−ρ+iy| ≤ 1/δ. All other zeros lie at
distances t ≥ π/2; per side the k-th far distance satisfies
t_k ≥ π(k − 1/2) (gaps), and the counting function obeys
N_x(t) := #{j: |x−ρ_j| ≤ t} ≤ 2t/π + 1.

**Far imaginary part** (kernel |y|/(t²+y²), all terms one sign):
- |y| ≥ π/2: layer-cake over ALL zeros (far ≤ all, same sign):
  Σ_j |y|/((x−ρ_j)²+y²) = ∫₀^∞ N_x(t)·2|y|t/(t²+y²)² dt
  ≤ (2/π)·2|y|·(π/4|y|) + 2|y|·(1/2y²) = 1 + 1/|y| ≤ 1 + 2/π.
- |y| < π/2: every far t ≥ π/2 > |y|, the kernel is decreasing there,
  so term-wise grid domination applies:
  Σ ≤ Σ_{k≥1} 2|y|/(y² + π²(k−1/2)²) = tanh|y| ≤ tanh(π/2) = 0.917
  (the classical partial-fraction identity for tanh).
  c_im := max(0.917, 1 + 2/π) = 1 + 2/π = 1.637; sharp value 1.000.

**Far real part** (kernel t/(t²+y²), signed): write
t/(t²+y²) = 1/t − y²/(t(t²+y²)) and split at R = max(π/2, |y|) ≥ 1:
- Outer |t| ≥ R: |Σ 1/t| ≤ B by (iii) with r = R (legal: R ≥ 1).
  Remainder kernel y²/(|t|(t²+y²)) is decreasing in |t|; per side
  ≤ edge + density integral = y²/(R(R²+y²)) + (1/π)·(1/2)ln(1+y²/R²)
  ≤ 1/(2R) + ln2/(2π) ≤ 1/π + 0.111 (R ≥ |y| and R ≥ π/2);
  two sides c_out ≤ 2/π + 0.221 = 0.858; sharp 0.678.
- Middle π/2 ≤ |t| < R (nonempty only for |y| > π/2): by AM–GM
  t² + y² ≥ 2t|y|, so the kernel obeys t/(t²+y²) ≤ 1/(2|y|) for ALL t;
  per-side count ≤ (R−π/2)/π + 1 ≤ |y|/π + 1/2, so per side
  ≤ 1/(2π) + 1/(4|y|); two sides c_mid ≤ 1/π + 1/(2|y|) ≤ 2/π = 0.637
  (|y| ≥ π/2); sharp 0.633 — the AM–GM step is essentially exact here.

Total:

    c_geo ≤ 1 + 6/π + (log 2)/π = 3.130494... < 3.131,

so |ψ| ≤ 1/δ + B + 3.131. ∎

## Theorem W2′ (refined wall barrier)

Under (i) + (ii) + (iii): every critical wall c of the configuration
satisfies

    sup_{y∈ℝ} |ψ(c + iy)| ≤ C₀(B) := max(2/π, B) + B + 3.131
                            ≤ 2B + 3.77   (all B; = 2B + 3.131 for B ≥ 2/π).

_Proof._ Lemma 1 gives dist(c, Z) ≥ min(π/2, 1/B), so 1/δ ≤
max(2/π, B); apply Lemma 2 along the wall. ∎

**GPT audit note (F109).** Lemma 1 is accepted. Lemma 2's layer-cake,
tanh-grid, middle AM-GM, and outer by-parts constants check out after keeping
the exact decimal `3.130494...`; the earlier `3.13` display rounded downward
by about `4.95e-4`. The final headline `C₀(B) ≤ 2B + 3.77` remains valid
because `2/π + 3.130494... = 3.767114... < 3.77`.

**Order-sharpness.** C₀(B) = Θ(B): the F101 pile-up family has
truncated-Hilbert size ~ ln R and wall values ~ ln(R)/π, so a bound
o(B) is impossible. Linear is the truth.

**Consistency check (Theorem M as a member).** C_d's walls satisfy
|ψ| < 1 (W2). The template, fed C_d's own data, gives C₀ = O(1) —
coarser than W2's sharp 1, as a general-position bound must be.
B_ref(d) := the exact uniform truncated-Hilbert constant of C_d's zero
set, computed by jump-radius enumeration (round 305 numerics,
/tmp/bref_model.py):

    d:      2      5      10     20     50     100    200
    B_ref:  1.476  1.681  1.786  1.859  1.920  1.948  1.967

Monotone ↗ with limit 2, and the worst basepoint is ALWAYS
x = ρ_max + 1 (just past the edge at the minimal legal radius): there
the sum is one-sided with zero cancellation and decomposes as
(nearest zero at distance 1 ⟹ contributes 1) + (one-sided density
transform at the edge ⟹ → 1). Analytic target: B_ref ≤ 2.1 for
d ≥ 10⁶ by the SAME E7a/E7b machinery as the Cap Lemma with kernel
1/t in place of t/(t²+H²) (odd kernel kills the constant part of the
counting error exactly; jump terms ≤ 2E₀/r; one-sided edge transform
≤ 0.9004 + gauge ≤ 1) — queued as its own pass. Template barrier for
the model: C₀(2) ≤ 7.8 — ~8× coarser than W2's 1, the honest price of
dropping the ODE.

## Lemma B_ref (analytic, Tier-2 range) [PROVED for d ≥ 10⁶ — GPT F111 audit]

For every d ≥ 10⁶, the zero set of C_d satisfies hypothesis (iii) with

    B_ref ≤ 7.8        (measured truth ≈ 2 — see table above; the 3.9×
                        headroom is in the fluctuation constants).

_Proof._ S(x,r) = Σ_{|x−ρ_j|≥r} 1/(x−ρ_j) = smooth + fluctuation
against dN = (Ω/π)ds + de(s).

**Smooth part ≤ 1.** After rescaling s = Aσ, x = Aξ (A = w_e), the
truncated semicircle transform is the pure-number function
T(ξ, ϱ) = (1/π)∫_{|σ|≤1, |ξ−σ|≥ϱ} √(1−σ²)/(ξ−σ) dσ, whose full-PV
value is ξ on [−1,1] and ξ − √(ξ²−1) outside. |T| ≤ 1 uniformly:
for 0 ≤ ξ ≤ 1 the window-PV is nonnegative (density decreasing), so
T ≤ ξ ≤ 1; for ξ > 1 all terms are positive and truncation only
removes mass, so T ≤ ξ − √(ξ²−1) ≤ 1; the negative branch is the
ξ ↔ −ξ reflection. (Numeric scan over (ξ, ϱ): sup = 0.980, attained
at the edge with ϱ → 0, limiting value exactly 1.) Physical units
multiply by w_e/4d = √(1+1/4d) ≤ 1.0000002 at d ≥ 10⁶.

**Fluctuation ≤ 6.8 at d = 10⁶, decreasing in d.** By parts against
the odd kernel f_r(t) = 1_{|t|≥r}/t: the CONSTANT part e(x) of the
counting error contributes exactly zero (∫df_r = f_r(∞) − f_r(−∞) = 0
— cleaner than the cap kernel, which needed E4's boundary terms).
Remaining pieces, with the local variation bound |e(s)−e(x)| ≤
3/2 + ε₃ for |s−x| ≤ T = d^{1/6} (bulk: E3 verbatim; edge: spacing
≳ d^{1/3} ≫ T means at most ONE crossing in the window, giving the
better bound 1 + TΩ_edge/π ≤ 1 + 3/(πd^{1/6})):
- jump terms at |t| = r: ≤ 2(3/2 + ε₃)/r ≤ 3 + 2ε₃ (r ≥ 1);
- local tail r ≤ |t| ≤ T: ≤ (3/2 + ε₃)·2/r ≤ 3 + 2ε₃;
- far tail |t| > T: ≤ 2E₀·(2/T) = 4E₀/d^{1/6} ≤ 0.695 at d = 10⁶
  (E1), decreasing;
- the case r > T separately: all pieces ≤ 8E₀/d^{1/6} ≤ 1.4 — smaller.
With ε₃ = 1/(4πd^{1/6}) ≤ 0.008: fluctuation ≤ 6.03 + 0.695 = 6.73.

Total: B_ref ≤ 1.0000002 + 6.73 ≤ 7.8. ∎

**GPT audit note (F111, 2026-06-12 15:46 CEST).** The displayed table matches
an independent SciPy `roots_genlaguerre(d,-1/2)` check at the claimed point
`x=rho_max+1`, `r=1` for d = 2, 5, 10, 20, 50, 100, 200. The Tier-2 proof is
accepted as a coarse bound: the smooth semicircle transform has absolute
value ≤ 1 after truncation; the odd kernel cancels the constant counting-error
piece; jump plus local-tail variation costs at most `4M/r` with
`M=3/2+epsilon_3`; and the far tail is bounded by `4E0/d^(1/6)`. This proves
only the stated `d ≥ 10^6` range. The midrange `200 < d < 10^6` remains
uncertified as noted below.

_Scope note (honest)._ d ≤ 200 is certified numerically (exact
jump-radius enumeration, table above, all values < 2). The midrange
200 < d < 10⁶ is currently UNCERTIFIED — closable by either extending
the per-d certificates (cheap, ~minutes per decade) or a Tier-1-style
elementary split; the monotone trend B_ref(d) ↗ 2 strongly suggests
B_ref ≤ 2 everywhere, but that is a conjecture, not a bound. For the
dictionary's structural purposes any explicit O(1) suffices:
C₀(7.8) ≤ 2·7.8 + 3.131 = 18.731 — absolute.

## Where this plugs into the dictionary

The displacement dictionary's zero side hands us a DISPLACED model
configuration ρ_j^tgt = ρ_j^ref + ε_j with weighted-ℓ¹ control
Σ|ε_j|/(1+|j|) ≤ η. Then:
- (ii) for the target: gaps ≥ π⁻ − 2sup|ε_j| (or the weighted version
  keeps gaps ≥ π⁻(1 − o(1)) for η small);
- (iii) for the target: B_tgt ≤ B_ref + Σ|ε_j|·(spacing-decay sum) =
  B_ref + O(η) — displacing zeros perturbs truncated-Hilbert sums by
  an η-weighted absolutely convergent series;
- W2′ then yields the wall barrier C₀(B_tgt) for the TARGET — the
  W2-replacement that the template program was missing (F101's honest
  flag), with no ODE used anywhere.

Together with Corollary T (cell floors for the model) and lane B's
kernel-norm estimate, this closes the analytic surface of the
moving-layer program except for the single arithmetic input (β).
