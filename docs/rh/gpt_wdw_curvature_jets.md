# WDW Curvature Jets for Jensen Sections

**Status:** theorem and conjecture note, GPT contribution.

**Purpose:** turn the Wheeler-DeWitt/healing picture into exact local
algebra. No numerical computation is used here. The main new result is an
exact degree-3 curvature wall explaining why non-constant curvature sections
are born complex at small curvature scale and can heal only after enough
positive curvature accumulates.

## Setup

Let `a_j > 0`, write `ell_j = log a_j`, and define the curvature-scaled
alternating Jensen section

```text
R_{d,n}^{lambda}(t)
  = sum_{k=0}^d (-1)^k binom(d,k) exp(lambda ell_{n+k}) t^k.
```

The usual Jensen polynomial has only negative real roots exactly when
`R_{d,n}^{lambda}` has only positive real roots.

Define local log-curvatures with the log-concavity-positive sign convention

```text
c_j = log(a_j^2 / (a_{j-1} a_{j+1})).
```

Thus `c_j >= 0` is ordinary log-concavity.

## Theorem 1: Exact WDW Generator

For fixed `(d,n)`, let `L_{d,n}(x)` be the unique polynomial of degree at most
`d` satisfying

```text
L_{d,n}(k) = ell_{n+k},       0 <= k <= d.
```

With Euler operator `E = t partial_t`,

```text
partial_lambda R_{d,n}^{lambda} = L_{d,n}(E) R_{d,n}^{lambda}.
```

In Newton finite-difference form,

```text
L_{d,n}(E)
  = sum_{m=0}^d Delta^m ell_n * binom(E,m).
```

### Proof

Each monomial `t^k` is an eigenvector of `E` with eigenvalue `k`. Hence
`L_{d,n}(E)` multiplies the `k`th coefficient by `ell_{n+k}`, which is exactly
the derivative with respect to `lambda`.

### Consequence

Constant curvature means `Delta^m ell_n = 0` for `m >= 3`, so the generator is
quadratic in `E`. In the Fourier coordinate `t = exp(i y)`, this is precisely
the heat/WDW operator behind GPT-F1. Variable curvature is not a vague
perturbation: it is the addition of cubic and higher finite-difference jets to
the WDW Hamiltonian.

This reframes the live proof target:

```text
RH/Jensen survival is control of the higher WDW curvature jets, not control
of log-concavity alone.
```

## Theorem 2: Root-Flow Conservation Laws

Suppose `R_{d,n}^{lambda}` has positive simple roots

```text
0 < r_1(lambda) < ... < r_d(lambda).
```

Then

```text
R_{d,n}^{lambda}(t)
  = exp(lambda ell_n) prod_{i=1}^d (1 - t / r_i(lambda)).
```

Consequently, for `0 <= m <= d`,

```text
e_m(1/r_1,...,1/r_d)
  = binom(d,m) exp(lambda (ell_{n+m} - ell_n)),
```

and equivalently

```text
e_m(r_1,...,r_d)
  = binom(d,m) exp(lambda (ell_{n+d-m} - ell_{n+d})).
```

Important special cases:

```text
sum_i log r_i = lambda (ell_n - ell_{n+d}),
sum_i 1/r_i   = d exp(lambda (ell_{n+1} - ell_n)),
sum_i r_i     = d exp(lambda (ell_{n+d-1} - ell_{n+d})).
```

For an individual simple root,

```text
partial_lambda log r_i
  = - (partial_lambda R)(r_i) / (r_i (partial_t R)(r_i)).
```

### Proof

Compare coefficients in the product factorization. The individual velocity
formula follows by differentiating `R(r_i(lambda),lambda)=0`.

### Consequence

The WDW flow has exact conserved bookkeeping. The geometric mean of the roots
is driven only by the endpoint log-slope. The left wall `sum 1/r_i` is driven
only by the first log-slope, and the right wall `sum r_i` only by the last
log-slope. These identities are cheap non-numerical checks for any proposed
healing picture or root dataset.

## Theorem 3: Fold-Collision Healing Test

Let `(lambda_0,tau)` be a simple boundary collision:

```text
R(tau,lambda_0) = 0,
partial_t R(tau,lambda_0) = 0,
partial_t^2 R(tau,lambda_0) != 0,
partial_lambda R(tau,lambda_0) != 0.
```

Then nearby colliding roots satisfy

```text
t = tau +/- sqrt(
      -2 (partial_lambda R)(tau,lambda_0)
        / (partial_t^2 R)(tau,lambda_0)
        * (lambda - lambda_0)
    )
    + O(lambda - lambda_0).
```

Thus the sign of

```text
- (partial_lambda R)(tau,lambda_0) / (partial_t^2 R)(tau,lambda_0)
```

decides which side of the boundary has two real roots.

### Proof

Taylor expand `R` at `(tau,lambda_0)`. The linear term in `t-tau` vanishes and
the first nonzero terms are

```text
(1/2) R_tt (t-tau)^2 + R_lambda (lambda-lambda_0).
```

Solving gives the displayed normal form.

### Consequence

The healing wall is a fold caustic in WDW time. A proof of monotone healing can
be attacked by proving this sign is stable along the structured
`alpha/(j+b)` or xi-like profile wall.

## Theorem 4: Exact Degree-2 Wall

For `d=2`, after positive scaling of the polynomial and the variable,

```text
R_{2,n}^{lambda}  ~  1 - 2s + u s^2,
u = exp(-lambda c_{n+1}).
```

It has positive real roots iff

```text
u <= 1,
```

equivalently

```text
lambda c_{n+1} >= 0.
```

Thus degree 2 sees only ordinary log-concavity.

## Theorem 5: Exact Degree-3 Curvature Wall

For `d=3`, set the two adjacent curvatures

```text
c_0 = log(a_{n+1}^2 / (a_n a_{n+2})),
c_1 = log(a_{n+2}^2 / (a_{n+1} a_{n+3})),
u = exp(-lambda c_0),
w = exp(-lambda c_1).
```

After positive scaling of the polynomial and the variable,

```text
R_{3,n}^{lambda}  ~  1 - 3s + 3u s^2 - u^2 w s^3.
```

Its discriminant is

```text
27 u^2 Psi(u,w),
```

where

```text
Psi(u,w) = 3 - 4u - 4w + 6uw - u^2 w^2.
```

Therefore `R_{3,n}^{lambda}` has three positive real roots iff

```text
Psi(u,w) >= 0.
```

### Proof

The normalization follows by dividing by `a_n^lambda` and replacing
`t` by `(a_n/a_{n+1})^lambda s`.

For the cubic

```text
1 - 3s + 3u s^2 - u^2 w s^3,
```

the standard cubic discriminant gives

```text
27 u^2 (3 - 4u - 4w + 6uw - u^2 w^2).
```

The coefficients have alternating signs. If all roots are real, Vieta's
relations force them to be positive: one positive and two negative roots would
make the first and second elementary symmetric sums incompatible with their
positive signs. Hence nonnegative discriminant is equivalent to three positive
real roots.

### Immediate Consequences

**Constant curvature is the marginal solved case.** If `c_0 = c_1`, then
`u=w=r` and

```text
Psi(r,r) = (1-r)^3 (3+r) >= 0.
```

This is the degree-3 shadow of GPT-F1.

**Unequal adjacent curvature is born complex.** If `c_0 != c_1`, then as
`lambda -> 0+`,

```text
Psi(exp(-lambda c_0), exp(-lambda c_1))
  = -lambda^2 (c_0 - c_1)^2 + O(lambda^3) < 0.
```

So every non-constant two-curvature jet has a complex pair at sufficiently
small positive curvature scale. Fable's observation that small lambda is
complex is not numerical noise; it is forced already in degree 3.

**Positive adjacent curvature heals eventually.** If `c_0 > 0` and `c_1 > 0`,
then `u,w -> 0` as `lambda -> infinity`, and

```text
Psi(u,w) -> 3 > 0.
```

Thus every positive two-curvature jet has a finite degree-3 healing threshold.

**A flat neighbor prevents degree-3 healing.** If `c_1 = 0` and `c_0 > 0`, then
`w=1` and

```text
Psi(u,1) = -(1-u)^2 < 0
```

for finite `lambda > 0`. The same holds with `c_0` and `c_1` swapped. Healing
needs curvature on both adjacent links.

## Theorem 6: Degree-3 Has a Unique Healing Wall

If

```text
c_0 > 0, c_1 > 0, c_0 != c_1,
```

then there is a unique `lambda_3 > 0` such that

```text
Psi(exp(-lambda_3 c_0), exp(-lambda_3 c_1)) = 0.
```

Moreover,

```text
Psi(exp(-lambda c_0), exp(-lambda c_1)) < 0   for 0 < lambda < lambda_3,
Psi(exp(-lambda c_0), exp(-lambda c_1)) > 0   for lambda > lambda_3.
```

Thus degree-3 healing is genuinely monotone after its first landing.

### Proof

Set

```text
s = c_0 + c_1,
p = c_0 / s,
q = c_1 / s = 1-p,
z = lambda s.
```

Then `p,q in (0,1)`, `p != q`, and the degree-3 wall function becomes the
exponential polynomial

```text
F_p(z) = 3 - 4e^{-pz} - 4e^{-qz} + 6e^{-z} - e^{-2z}.
```

Assume `p < q`; the other case is symmetric. The exponents are ordered

```text
0 < p < q < 1 < 2,
```

and the coefficient signs in that order are

```text
+ , - , - , + , -
```

which have exactly three sign changes.

We use the standard Descartes rule for exponential polynomials: if

```text
sum_i A_i e^{-beta_i z},       beta_0 < beta_1 < ... < beta_m,
```

has real coefficients `A_i`, then the number of real zeros, counted with
multiplicity, is at most the number of sign changes in `(A_0,...,A_m)`.
This follows by the same induction/Rolle argument as the polynomial Descartes
rule after differentiating away the leading exponential term.

Therefore `F_p` has at most three zeros on `[0,infinity)`, counted with
multiplicity. At `z=0`,

```text
F_p(0) = 0,
F_p'(0) = 0,
F_p''(0) = -2(2p-1)^2 < 0.
```

So `z=0` is a double zero and `F_p(z)<0` for sufficiently small positive `z`.
On the other hand,

```text
lim_{z->infinity} F_p(z) = 3 > 0.
```

Hence at least one positive zero exists. The exponential Descartes bound allows
at most one positive zero beyond the double zero at `0`. Thus the positive zero
is unique, and the sign is negative before it and positive after it.

## Theorem 7: Highest-Jet Birth Normal Form

This theorem explains the small-`lambda` root birth for every fixed Jensen
degree.

Fix `(d,n)`. Remove the affine part of the local log-coefficients by setting

```text
eta_k = ell_{n+k} - ell_n - k(ell_{n+1} - ell_n),      0 <= k <= d.
```

This only multiplies the polynomial by a positive scalar and rescales `t`, so
it does not affect real-rootedness. Let

```text
m = max { r in {2,...,d} : Delta^r eta_0 != 0 }.
```

If no such `m` exists, the section is affine-logarithmic and remains
`(1-s)^d` after rescaling.

Assume `m` exists and set

```text
A_m = Delta^m eta_0 = Delta^m ell_n,
epsilon = lambda^{1/m}.
```

Define the affinely normalized section

```text
P_lambda(s)
  = e^{-lambda ell_n}
    R_{d,n}^{lambda}(e^{lambda(ell_n-ell_{n+1})}s)
  = sum_{k=0}^d (-1)^k binom(d,k) e^{lambda eta_k} s^k.
```

Then, locally at the collapsed root `s=1`,

```text
epsilon^{-d} P_lambda(1 + epsilon x)
  -> exp((A_m/m!) partial_x^m) (-x)^d
```

uniformly on compact `x`-sets as `lambda -> 0+`.

Consequently, if the limiting Gould-Hopper polynomial

```text
B_{d,m,A_m}(x) = exp((A_m/m!) partial_x^m) (-x)^d
```

has a nonreal simple zero, then `R_{d,n}^{lambda}` is non-hyperbolic for all
sufficiently small positive `lambda`.

### Proof

The normalized coefficient multiplier can be written exactly as

```text
P_lambda = exp(lambda M(E))(1-s)^d,
E = s partial_s,
```

where `M(k)=eta_k`. In the Newton basis,

```text
M(E) = sum_{r=2}^m Delta^r eta_0 binom(E,r),
```

because affine terms were removed and `m` is the highest nonzero finite
difference.

Put `s=1+epsilon x`. Then

```text
E = s partial_s = (1+epsilon x) epsilon^{-1} partial_x
                = epsilon^{-1} partial_x + x partial_x.
```

For each `r<m`,

```text
lambda binom(E,r) = O(lambda epsilon^{-r}) = O(lambda^{1-r/m}) -> 0
```

as an operator on fixed-degree polynomials in the scaled variable. For `r=m`,

```text
lambda binom(E,m) -> (1/m!) partial_x^m.
```

Thus the scaled operators converge to

```text
exp((A_m/m!) partial_x^m).
```

Since

```text
epsilon^{-d}(1-(1+epsilon x))^d = (-x)^d,
```

the displayed limit follows. The root statement is Hurwitz continuity for
simple zeros.

### Consequences

**Highest curvature jet dominates birth.** Lower positive curvature does not
control the first split away from `lambda=0`; the highest nonzero finite
difference in the fixed section controls the local root geometry.

**Constant curvature is exceptional.** If `m=2` and `A_2<0`, the birth
polynomial is the Hermite/backward-heat polynomial behind GPT-F1, hence
real-rooted. This is the only generic heat-like birth.

**A top-degree jet forces complex birth.** If `m=d>=3`, then

```text
B_{d,d,A_d}(x) = (-1)^d (x^d + A_d).
```

For every nonzero real `A_d`, this polynomial is not entirely real-rooted.
Therefore any fixed section whose highest finite difference is the top-degree
jet is born complex for sufficiently small positive `lambda`.

**Degree 3 is the first instance.** For `d=3`,

```text
A_3 = Delta^3 ell_n = c_0 - c_1,
B_{3,3,A_3}(x) = -(x^3 + A_3).
```

Thus unequal adjacent curvature gives one real root and one complex conjugate
pair at birth, matching Theorems 5 and 6.

## Theorem 8: Degree-3 Slow-Variation Wall Asymptotic

Let `c_0,c_1>0` and set

```text
s = c_0 + c_1,
Delta = c_0 - c_1.
```

When `|Delta|/s -> 0`, the unique degree-3 healing threshold from Theorem 6
satisfies

```text
lambda_3
  = 2 Delta^2 / s^3
    + (3/2) Delta^4 / s^5
    + O(Delta^6 / s^7).
```

In particular, the local wall retreats quadratically as adjacent curvatures
become slowly varying.

### Proof

Use the notation from Theorem 6:

```text
p = 1/2 + delta,
q = 1/2 - delta,
z = lambda s,
delta = Delta / (2s).
```

The wall function is

```text
F_delta(z)
  = 3 - 4e^{-(1/2+delta)z}
      - 4e^{-(1/2-delta)z}
      + 6e^{-z} - e^{-2z}.
```

Expanding jointly at `(delta,z)=(0,0)` gives

```text
F_delta(z)
  = z^3/2 - 4 delta^2 z^2
    - 7z^4/16 + 2delta^2 z^3
    + O(z^5 + delta^2 z^4 + delta^4 z^4).
```

Set

```text
z_3(delta) = a delta^2 + b delta^4 + O(delta^6).
```

Substitution into the expansion yields

```text
delta^6 * a^2(a-8)/2
+ delta^8 * [-a(7a^3 - 32a^2 - 24ab + 128b)/16]
+ O(delta^10).
```

The nonzero branch is therefore

```text
a = 8,
b = 24.
```

Thus

```text
z_3 = 8delta^2 + 24delta^4 + O(delta^6).
```

Since `lambda_3=z_3/s` and `delta=Delta/(2s)`, the displayed formula follows.

## Theorem 9: `alpha/(j+b)` Sections Are Born Complex in Every Degree `d>=3`

Consider the structured curvature profile

```text
c_j = alpha / (j+b),      alpha > 0,
```

with the sign convention

```text
c_j = -Delta^2 ell_{j-1}.
```

For a degree-`d` section starting at `n`, put

```text
x = n + b + 1.
```

Then for every `d >= 3`,

```text
Delta^d ell_n
  = (-1)^{d-1} alpha (d-2)! / (x)_{d-1},
```

where

```text
(x)_{d-1} = x(x+1)...(x+d-2).
```

In particular, the top finite-difference jet is nonzero for every finite
window. Hence every `alpha/(j+b)` degree-`d` section with `d>=3` is
non-hyperbolic for all sufficiently small positive `lambda`.

### Proof

Since

```text
Delta^2 ell_n = -c_{n+1} = - alpha / (n+b+1),
```

we have, for `d>=2`,

```text
Delta^d ell_n
  = Delta^{d-2}(Delta^2 ell_n)
  = -alpha Delta^{d-2}(1/(n+b+1)).
```

The elementary finite-difference identity

```text
Delta^r (1/x) = (-1)^r r! / (x)_{r+1}
```

gives the displayed formula with `r=d-2`.

For `d>=3` this is a nonzero top-degree jet. Theorem 7 then gives birth
polynomial

```text
(-1)^d (X^d + Delta^d ell_n),
```

which is not entirely real-rooted for nonzero real `Delta^d ell_n`. Hurwitz
continuity therefore implies non-hyperbolicity for all sufficiently small
positive `lambda`.

### Degree-3 Specialization

For `d=3`,

```text
c_0 = alpha / x,
c_1 = alpha / (x+1).
```

The unique degree-3 healing threshold from Theorem 6 is

```text
lambda_3 = z_x * x(x+1) / (alpha(2x+1)),
```

where `z_x` is the unique positive root of

```text
3 - 4e^{-((x+1)/(2x+1))z}
  - 4e^{-(x/(2x+1))z}
  + 6e^{-z}
  - e^{-2z}
  = 0.
```

As `x -> infinity`, Theorem 8 gives

```text
lambda_3
  = 2x(x+1)/(alpha(2x+1)^3)
    + (3/2)x(x+1)/(alpha(2x+1)^5)
    + O(1/(alpha x^5)).
```

Equivalently,

```text
lambda_3 = 1/(4 alpha x) + O(1/(alpha x^2)).
```

Thus deeper shifted windows in the `alpha/(j+b)` family have lower local
degree-3 healing thresholds.

## Theorem 10: Degree-3 Healing Equals Degree-2 Sturm Interlacing

Keep the degree-3 notation

```text
u = exp(-lambda c_0),
w = exp(-lambda c_1),
0 < u,w < 1.
```

The degree-3 section is

```text
P_3(s) = 1 - 3s + 3u s^2 - u^2w s^3.
```

The adjacent degree-2 sections in the same normalized coordinate are

```text
A(s) = 1 - 2s + u s^2,
B(s) = 1 - 2u s + u^2w s^2.
```

Let the roots of `A` be `x_1<x_2` and the roots of `B` be `y_1<y_2`.
Then

```text
P_3 has three positive real roots
```

if and only if

```text
x_1 <= y_1 <= x_2 <= y_2.
```

Strict inequalities are equivalent to three simple positive roots.

### Proof

Set

```text
a = sqrt(1-u),
b = sqrt(1-w).
```

Then

```text
x_1 = 1/(1+a),
x_2 = 1/(1-a),
y_1 = 1/(u(1+b)),
y_2 = 1/(u(1-b)).
```

The middle inequality `y_1 < x_2` is automatic for `0<a,b<1`, since

```text
1-a < (1-a^2)(1+b).
```

The two nontrivial inequalities are

```text
x_1 <= y_1   <=>   b-a <= ab,
x_2 <= y_2   <=>   a-b <= ab.
```

Thus adjacent-shift right-interlacing is exactly

```text
|a-b| <= ab.
```

On the other hand, Theorem 5 gives the discriminant factor

```text
Psi(u,w)=3-4u-4w+6uw-u^2w^2.
```

Substituting `u=1-a^2`, `w=1-b^2` yields the exact factorization

```text
Psi
  = (a+b-ab)(a+b+ab)(a^2b^2-(a-b)^2).
```

The first two factors are positive for `0<a,b<1`, so

```text
Psi >= 0   <=>   |a-b| <= ab.
```

Since `P_3` has alternating-sign coefficients, nonnegative discriminant is
equivalent to all roots being real and positive. This proves the equivalence.

### Consequence

The first nontrivial WDW healing wall is not merely compatible with the
Sturm-ladder mechanism; it is exactly the same wall. In degree 3,

```text
hyperbolicity of R_3^n
  <=> right-interlacing of R_2^n and R_2^{n+1}.
```

Thus GPT-F2 is sharp in the first nontrivial case. The higher-degree proof
target is the natural extension:

```text
hyperbolicity and one-way healing of R_{d+1}^n
should be controlled by right-interlacing of R_d^n and R_d^{n+1}.
```

## Interpretation for Wheeler-DeWitt

At `lambda=0`, every section is `(1-t)^d`, a multiply-collapsed boundary
state. The WDW flow releases that collapsed state.

The highest-jet birth theorem and the exact degree-3 wall say:

```text
constant curvature:     immediate real split;
variable curvature:     initial complex split;
positive curvature:     eventual healing;
flat adjacent link:     no degree-3 healing.
```

This is the cleanest local version of Fable's WDW picture so far. The
curvature wall is not just "more curvature helps." It is:

```text
enough positive curvature on every adjacent link overcomes the complex
splitting caused by curvature variation.
```

The WDW "initial singularity" at `lambda=0` is controlled by the highest jet;
the later healing regime is controlled by accumulated positive curvature.
This separates the problem into two different mechanisms instead of treating
healing as a single monotonicity slogan.

For the actual `alpha/(j+b)` family, Theorem 9 proves the initial singularity
is complex in every degree `d>=3`; therefore the RH-relevant question is not
whether complex birth occurs, but whether the structured profile always heals
before the physical scale `lambda=1`.

Theorem 10 adds the first exact bridge to the Sturm-ladder program: in degree
3, the healing wall and the adjacent-shift interlacing wall are identical.

The separate Sturm-ladder note now proves the all-degree version for genuine
Jensen sections:

```text
R_{d+1}^n hyperbolic
  <=> R_d^n and R_d^{n+1} are hyperbolic and right-interlacing.
```

The key identity is

```text
(R_{d+1}^n)' = -(d+1)R_d^{n+1}.
```

Thus the WDW problem can be stated entirely as one-way healing of the
adjacent-shift interlacing ladder.

## Theorem 11: The Critical Cauchy Profile Heals in Degree 3 at `lambda=1`

For the critical edge profile

```text
c_j = 1/j,
```

every degree-3 window is hyperbolic at physical scale `lambda=1`.

More generally, for every `x>=1`, the degree-3 section with

```text
c_0 = 1/x,
c_1 = 1/(x+1)
```

has three positive real roots at `lambda=1`. Equivalently, the adjacent
degree-2 Sturm sections right-interlace.

### Proof

By Theorem 10, with

```text
u = exp(-1/x),
w = exp(-1/(x+1)),
a = sqrt(1-u),
b = sqrt(1-w),
```

degree-3 hyperbolicity is equivalent to

```text
a-b <= ab.
```

Set

```text
q = 1/(x+1),
p = 1/x = q/(1-q),
0 < q <= 1/2.
```

Let

```text
h(t)=sqrt(1-exp(-t)).
```

Then `a=h(p)`, `b=h(q)`, and

```text
h'(t)=exp(-t)/(2sqrt(1-exp(-t))).
```

The logarithmic derivative of `h'` is

```text
-1 - exp(-t)/(2(1-exp(-t))) < 0,
```

so `h'` is decreasing. Hence

```text
a-b <= (p-q) exp(-q)/(2b).
```

Since `a>=b`, it is enough to prove

```text
(p-q) exp(-q)/(2b) <= b^2,
```

or

```text
p-q <= 2 exp(q)(1-exp(-q))^{3/2}.
```

Using

```text
p-q = q^2/(1-q),
exp(q) >= 1+q,
1-exp(-q) >= q - q^2/2,
```

it remains to prove

```text
sqrt(q) <= 2(1-q^2)(1-q/2)^{3/2},       0<q<=1/2.
```

Squaring gives the polynomial inequality

```text
P(q)=4(1-q^2)^2(1-q/2)^3-q >= 0.
```

This is an exact rational Sturm check: `P'` has no roots in `[0,1/2]`,
`P'(0)=-7<0`, and

```text
P(1/2)=115/256>0.
```

Thus `P` is decreasing but positive on `[0,1/2]`. Therefore

```text
a-b <= ab,
```

and Theorem 10 gives three positive real roots.

### Consequence

The measured critical edge `alpha_c=1` is not only a high-degree numerical
phenomenon. At the first nontrivial WDW/Sturm wall, the entire critical
Cauchy profile `c_j=1/j` is rigorously on the healed side at `lambda=1`.
The remaining work is to lift this all-shift degree-3 fact through GPT-F13's
polynomial certificates to every degree.

## Theorem 12: The Whole `alpha>=1` Cauchy Half-Plane Heals in Degree 3

For every

```text
alpha >= 1,
b >= 0,
n >= 0,
```

the degree-3 window of

```text
c_j = alpha/(j+b)
```

is hyperbolic at physical scale `lambda=1`.

Equivalently, with

```text
x = n+b+1 >= 1,
c_0 = alpha/x,
c_1 = alpha/(x+1),
```

the normalized degree-3 section has three positive real roots at
`lambda=1`.

### Proof

Let

```text
c_0^* = 1/x,
c_1^* = 1/(x+1).
```

Theorem 11 proves that the degree-3 section for `(c_0^*,c_1^*)` is already
healed at `lambda=1`:

```text
Psi(exp(-c_0^*), exp(-c_1^*)) >= 0.
```

For the `alpha`-scaled profile at physical scale `lambda=1`, the wall value is

```text
Psi(exp(-alpha c_0^*), exp(-alpha c_1^*)),
```

which is the same two-curvature jet evolved to WDW time `lambda=alpha`.

By Theorem 6, degree-3 healing for a positive unequal two-curvature jet has a
unique wall and remains healed after crossing. Since `alpha>=1`, the
`lambda=alpha` state is on or beyond the `lambda=1` healed state. Therefore
the `alpha/(j+b)` degree-3 section is hyperbolic.

### Consequence

Fable's measured boundary `alpha_c=1` is now exact at degree 3:

```text
alpha>=1, b>=0  =>  all degree-3 shifted sections are healed at lambda=1.
```

This does not settle higher degrees, but it proves the first nontrivial
Sturm-ladder face of the conjectured safe half-plane.

## Theorem 13: Exact Section-Wise Degree-3 Alpha Threshold

For the Cauchy profile

```text
c_j = alpha/(j+b),
```

fix a degree-3 window and set

```text
x = n+b+1 >= 1.
```

Define `z_x` as the unique positive root of

```text
F_x(z)
  = 3
    - 4exp(-((x+1)/(2x+1))z)
    - 4exp(-(x/(2x+1))z)
    + 6exp(-z)
    - exp(-2z).
```

Then the exact physical-scale degree-3 threshold is

```text
alpha_3(x) = z_x * x(x+1)/(2x+1).
```

At `lambda=1`, the degree-3 section is hyperbolic iff

```text
alpha >= alpha_3(x).
```

Moreover,

```text
alpha_3(x) = 1/(4x) + O(1/x^2)
```

as `x -> infinity`.

### Proof

For the local two-curvature jet,

```text
c_0 = alpha/x,
c_1 = alpha/(x+1),
s = c_0+c_1 = alpha(2x+1)/(x(x+1)).
```

The degree-3 wall equation from Theorem 6 is

```text
F_p(z)=0,
z = lambda s,
p = c_0/s = (x+1)/(2x+1),
1-p = x/(2x+1).
```

The displayed function `F_x` is this `F_p`. Theorem 6 gives a unique positive
wall and says the section is healed exactly for `z>=z_x`. At physical scale
`lambda=1`, this is

```text
alpha(2x+1)/(x(x+1)) >= z_x,
```

which is the stated threshold.

The asymptotic follows from Theorem 8. Here

```text
c_0^* = 1/x,
c_1^* = 1/(x+1),
s^* = (2x+1)/(x(x+1)),
Delta^* = 1/(x(x+1)).
```

For the unit-alpha profile, the degree-3 wall is

```text
lambda_3
  = 2(Delta^*)^2/(s^*)^3 + O(1/x^2)
  = 1/(4x) + O(1/x^2).
```

Since scaling `alpha` is the same as scaling WDW time, this unit-alpha wall is
exactly `alpha_3(x)`.

### Consequence

Degree 3 is not where Fable's all-degree `alpha_c=1` boundary lives. Its
section-wise obstruction retreats like `1/(4x)` and is already below `1` for
every shift by Theorem 11. Thus the real content of the boundary is a
higher-degree accumulation phenomenon.

## Theorem 14: Large-Shift Degree-4 Wall Branch Constant

For the same Cauchy profile

```text
c_j = alpha/(j+b),
x = n+b+1,
h = 1/x,
```

there is a large-shift adjacent-cubic common-root branch for the degree-4
Sturm ladder at

```text
alpha_4^{wall}(x) = a_4 h + O(h^2),
```

where `a_4` is the unique positive root of

```text
108a^3 - 108a^2 + 45a - 8 = 0.
```

Numerically,

```text
a_4 = 0.432678606330554...
```

At this branch the adjacent-root gap velocity is positive, so the crossing is
a healing crossing.

### Proof

This is GPT-F9 rewritten as an `alpha`-wall statement. GPT-F9 gives a
large-shift common-root branch

```text
alpha = a h + O(h^2),
sigma = 1 + z h + O(h^2),
```

with

```text
6z^3 - 12z^2 + 9z - 2 = 0,
a = z^3/(3z-1).
```

Eliminating `z` from these two equations gives

```text
108a^3 - 108a^2 + 45a - 8 = 0.
```

The cubic has one positive real root, the value displayed above. GPT-F9 also
computes the gap velocity along this branch:

```text
tilde y' - tilde x'
  = [2z(3z^2 - 3z + 1)/(3(3z-1))] h^2 + O(h^3),
```

whose leading coefficient is `0.616382741508307... > 0`. Hence the branch is
healing.

### Consequence

Combining with Theorem 13,

```text
alpha_3(x) = 1/(4x) + O(1/x^2),
alpha_4^{wall}(x) = a_4/x + O(1/x^2),
```

so

```text
alpha_4^{wall}(x)/alpha_3(x) -> 4a_4
  = 1.73071442532221....
```

The wall rises from degree 3 to degree 4, but it still retreats like `1/x`.
Fable's all-degree boundary near `alpha_c=1` must therefore come from the
growth of these wall constants with degree, not from fixed low-degree
behavior.

## Theorem 15: Fixed-Degree Cauchy Edge Normal Form

Fix a degree `d` and consider the Cauchy curvature profile in the large-shift
edge scaling

```text
c_{n+r} = alpha/(n+b+r),
x = n+b+1,
h = 1/x,
alpha = A h + o(h).
```

Let `P_{d,h}^A(s)` be the affinely normalized degree-`d` alternating Jensen
section. Then, uniformly for bounded `X`,

```text
h^{-d} P_{d,h}^A(1+hX)
  -> H_d^A(X),
```

where

```text
H_d^A(X)
  = exp(A L_d)(-X)^d,
```

and the fixed-degree Cauchy edge generator is

```text
L_d
  = sum_{m=2}^d (-1)^{m-1} partial_X^m/[m(m-1)].
```

Thus every fixed-degree large-shift wall constant is encoded by the
hyperbolicity boundary of the single finite polynomial family `H_d^A`.

### Proof

After affine normalization, the local log-coefficients satisfy

```text
eta_k = ell_{n+k}-ell_n-k(ell_{n+1}-ell_n),
```

and, for `m>=2`,

```text
Delta^m eta_0 = Delta^m ell_n.
```

For the Cauchy profile, Theorem 9 gives

```text
Delta^m ell_n
  = (-1)^{m-1} alpha(m-2)!/(x)_{m-1}.
```

Under `alpha=Ah+o(h)` and `x=1/h`,

```text
Delta^m eta_0
  = (-1)^{m-1} A(m-2)! h^m + o(h^m).
```

The normalized section is

```text
P_{d,h}^A(s)
  = exp( sum_{m=2}^d Delta^m eta_0 binom(E,m) ) (1-s)^d,
E=s partial_s.
```

Set `s=1+hX`. Then

```text
h^m binom(E,m) -> partial_X^m/m!
```

on fixed-degree polynomials after multiplying the final polynomial by
`h^{-d}`. Therefore the limiting exponent is

```text
sum_{m=2}^d (-1)^{m-1} A(m-2)! partial_X^m/m!
  = A sum_{m=2}^d (-1)^{m-1} partial_X^m/[m(m-1)].
```

Since

```text
h^{-d}(1-(1+hX))^d = (-X)^d,
```

the displayed convergence follows.

### Low-Degree Checks

For `d=3`,

```text
H_3^A(X) = -X^3 + 3AX - A,
```

and

```text
Disc(H_3^A) = 27A^2(4A-1).
```

Thus the large-shift degree-3 wall constant is `A_3=1/4`, matching
Theorem 13.

For `d=4`,

```text
H_4^A(X)=X^4-6AX^2+4AX+3A^2-2A,
```

and

```text
Disc(H_4^A)
  = 256A^3(108A^3-108A^2+45A-8).
```

Thus the first positive degree-4 wall constant is the `a_4` from Theorem 14.

### Consequence

The large-shift fixed-degree problem has been separated from the original
infinite-degree RH problem:

```text
fixed d, x->infinity, alpha=A/x
  -> finite Cauchy-edge polynomial H_d^A.
```

Fable's measured `alpha_c=1` can now be rephrased as a statement about the
growth of the first hyperbolicity wall of `H_d^A` as `d` increases. Low
degrees give `A_3=1/4` and `A_4=0.4326786063...`; the frontier is the
asymptotic behavior of `A_d`.

## Theorem 16: Edge Polynomials Are an Appell Family

The Cauchy edge polynomials from Theorem 15 have the exponential generating
function

```text
sum_{d>=0} H_d^A(X) t^d/d!
  =
  exp(-Xt - A[t+(1-t)log(1-t)]).
```

Consequently they form an Appell sequence with sign convention

```text
partial_X H_d^A(X) = -d H_{d-1}^A(X).
```

### Proof

The edge generator is

```text
L = sum_{m>=2} (-1)^{m-1} partial_X^m/[m(m-1)].
```

For a formal variable `y`,

```text
sum_{m>=2} (-1)^{m-1} y^m/[m(m-1)]
  = y - (1+y)log(1+y).
```

When `L` acts on `exp(-Xt)`, the symbol is evaluated at `y=-t`, giving

```text
L exp(-Xt)
  = [-t-(1-t)log(1-t)] exp(-Xt).
```

Therefore

```text
exp(AL) exp(-Xt)
  = exp(-Xt - A[t+(1-t)log(1-t)]).
```

But

```text
exp(-Xt) = sum_{d>=0} (-X)^d t^d/d!,
```

and `H_d^A=exp(AL)(-X)^d`, so the displayed generating function follows.
Differentiating the generating function with respect to `X` gives the Appell
identity.

### Consequence

The large-shift edge problem now has a classical polynomial-sequence form:

```text
H_d^A is an Appell family with cumulant series
-A[t+(1-t)log(1-t)].
```

Thus the all-degree edge question can be attacked by Appell/Sturm machinery:
if `H_d^A` has real simple roots, then the derivative relation forces
interlacing with `H_{d-1}^A`. The remaining difficulty is proving the correct
direction of root motion in the parameter `A`.

## Theorem 17: Edge Recurrence and Degree-5 Wall

Let `H_d=H_d^A`. The Appell generating function implies the recurrence

```text
H_0=1,
H_1=-X,
H_{d+1}
  = -XH_d
    - A sum_{m=1}^d d!/[m(d-m)!] H_{d-m}.
```

Equivalently,

```text
H_{d+1}
  = -XH_d
    - A sum_{k=0}^{d-1} d!/[(d-k)k!] H_k.
```

The first new case after the cubic and quartic walls is

```text
H_5^A(X)
  =
  -X^5 + 10AX^3 - 10AX^2 + 10AX - 6A
  - 15A^2X + 10A^2.
```

Its discriminant factors as

```text
Disc_X(H_5^A)
  =
  50000 A^4
  (
    1728A^6 - 4320A^5 + 5220A^4 - 3896A^3
    + 1896A^2 - 572A + 81
  ).
```

The sextic factor has exactly two positive roots:

```text
A_{5,-} = 0.5211830813795379880...,
A_5     = 0.5971174484502026728....
```

The first wall changes `H_5^A` from one real root to three real roots. The
second wall is the full degree-5 hyperbolicity threshold:

```text
H_5^A has five real roots  <=>  A >= A_5.
```

### Proof

Differentiate

```text
G(X,t)=sum_{d>=0} H_d^A(X)t^d/d!
      =exp(-Xt - A[t+(1-t)log(1-t)]).
```

Since

```text
partial_t[t+(1-t)log(1-t)] = -log(1-t),
```

we have

```text
partial_t G = [-X + A log(1-t)]G.
```

Using

```text
log(1-t) = -sum_{m>=1} t^m/m
```

and comparing coefficients of `t^d/d!` gives the recurrence. Applying the
recurrence through `d=4` gives the displayed `H_5^A`.

For the wall statement, the discriminant shows that the number of real roots
can change only at `A=0` or at roots of the displayed sextic. Sturm counts
give one sextic root in `(13/25,53/100)`, one in `(59/100,3/5)`, and no other
positive roots. A second Sturm count gives:

```text
A=1/10:   H_5^A has 1 real root,
A=53/100: H_5^A has 3 real roots,
A=13/20:  H_5^A has 5 real roots.
```

Thus the larger positive sextic root is the exact full-hyperbolicity wall.

### Consequence

The first edge constants are now

```text
A_2=0,
A_3=1/4,
A_4=0.432678606330554...,
A_5=0.597117448450202....
```

They increase toward Fable's observed all-degree boundary rather than
remaining small. This turns `alpha_c=1` into a concrete finite-polynomial
conjecture:

```text
A_d increases to 1.
```

If true, the fixed-degree WDW edge is the local shadow of Fable's global
critical wall. The divergence of `d*(alpha,0)` as `alpha->1-` then becomes
the rate at which `A_d` approaches one.

## Theorem 18: Edge Creation-Annihilation Algebra

Set

```text
D=-partial_X,
M=-X + A log(1+partial_X),
```

where `log(1+partial_X)` is interpreted as its finite formal series on
polynomials. Then the Cauchy edge polynomials satisfy

```text
D H_d^A = d H_{d-1}^A,
M H_d^A = H_{d+1}^A,
[D,M]=1.
```

Moreover their parameter flow is

```text
partial_A H_d^A
  =
  [partial_X - (1+partial_X)log(1+partial_X)] H_d^A.
```

### Proof

The first identity is the Appell identity from Theorem 16. For the second,
rewrite the recurrence of Theorem 17 using

```text
partial_X^m H_d^A
  =
  (-1)^m d!/(d-m)! H_{d-m}^A.
```

Then

```text
- A sum_{m=1}^d d!/[m(d-m)!]H_{d-m}^A
  =
  A log(1+partial_X)H_d^A,
```

which gives `M H_d^A=H_{d+1}^A`. Since `log(1+partial_X)` commutes with
`partial_X`,

```text
[D,M]=[-partial_X,-X]=1.
```

Finally,

```text
partial_A G
  =
  -[t+(1-t)log(1-t)]G.
```

Substituting `t=-partial_X` on the Appell basis gives

```text
partial_A
  =
  -[-partial_X + (1+partial_X)log(1+partial_X)]
  =
  partial_X - (1+partial_X)log(1+partial_X).
```

### Consequence

The fixed edge is an exactly solvable deformed oscillator. Its walls are not
arbitrary discriminant accidents: since

```text
partial_X H_d^A = -d H_{d-1}^A,
```

every multiple-root wall for `H_d^A` is a common-root wall for the adjacent
Appell pair `(H_d^A,H_{d-1}^A)`. Equivalently,

```text
Disc_X(H_d^A) = nonzero_constant * Res_X(H_d^A,H_{d-1}^A).
```

This is the exact edge analogue of the Jensen Sturm ladder.

## Theorem 19: Edge Walls Are Previous-Root Gap Balances

Let

```text
p(X)=H_{d-1}^A(X)
```

have simple real roots

```text
rho_1 < rho_2 < ... < rho_{d-1}.
```

For `A>0`, a root `rho_i` of `H_{d-1}^A` is also a root of `H_d^A` if and
only if

```text
E_i(A)=0,
```

where

```text
E_i(A)
  =
  sum_{ell=0}^{d-2} (-1)^ell ell!
    e_ell({ 1/(rho_i-rho_j) : j != i }).
```

Equivalently,

```text
E_i(A)
  =
  int_0^infinity e^{-s}
    product_{j != i} (1 - s/(rho_i-rho_j)) ds.
```

Here `e_ell` denotes the elementary symmetric polynomial of degree `ell`.

### Proof

The raising operator from Theorem 18 gives

```text
H_d^A = [-X + A log(1+partial_X)]H_{d-1}^A.
```

At a root `rho_i` of `p=H_{d-1}^A`, the `-Xp` term vanishes. Since `A>0`,

```text
H_d^A(rho_i)=0
  <=> [log(1+partial_X)p](rho_i)=0.
```

The finite logarithmic operator is

```text
log(1+partial_X)
  =
  sum_{m>=1} (-1)^{m+1} partial_X^m/m.
```

Write

```text
p(X)=(X-rho_i)q_i(X).
```

Then

```text
p^{(m)}(rho_i)/p'(rho_i)
  =
  m! e_{m-1}({ 1/(rho_i-rho_j) : j != i }).
```

Dividing `[log(1+partial_X)p](rho_i)` by the nonzero `p'(rho_i)` gives

```text
sum_{m=1}^{d-1} (-1)^{m+1}(m-1)!
  e_{m-1}({ 1/(rho_i-rho_j) : j != i }),
```

which is the displayed `E_i`. The integral form follows from

```text
ell! = int_0^infinity e^{-s}s^ell ds
```

and expansion of the finite product.

### Consequence

The fixed-edge wall equation no longer requires the degree-`d` polynomial.
Given the roots of `H_{d-1}^A`, the possible walls for `H_d^A` are exactly
the zeroes of the gap-balance function `E_i(A)`.

Thus the finite-polynomial edge limit conjecture can be recast as a root-gap
statement:

```text
A_d is the first A for which some E_i(A)=0 and H_d^A reaches full
hyperbolicity.
```

This is a Sturm-geometric replacement for raw discriminant factorization.

## Corollary 20: The First Edge Walls from Gap Balance

The gap-balance criterion recovers the first edge walls without computing
discriminants.

For `d=3`, the previous polynomial is

```text
H_2^A(X)=X^2-A.
```

Its roots are `+-sqrt(A)`. At the right root, the gap balance is

```text
1 - 1/(2sqrt(A)) = 0,
```

hence

```text
A_3=1/4.
```

At the left root, the balance is `1+1/(2sqrt(A))`, so no positive wall is
created there.

For `d=4`, the previous polynomial is

```text
H_3^A(X)=-X^3+3AX-A.
```

The logarithmic wall operator gives

```text
log(1+partial_X)H_3^A
  =
  -3X^2 + 3X + 3A - 2.
```

At a common root `X=z`,

```text
A=z^2-z+2/3.
```

Substituting this into `H_3^A(z)=0` gives

```text
6z^3 - 12z^2 + 9z - 2 = 0.
```

Thus

```text
A_4=z^2-z+2/3
   =0.432678606330554...
```

where `z=0.373461706729200...` is the relevant real root. This is the same
constant found in Theorem 14, now obtained from the root-gap wall equation.

### Consequence

The low-degree edge constants are not artifacts of special discriminant
factorizations. They are the first two cases of the universal wall equation

```text
log(1+partial_X)H_{d-1}^A(r)=0,
H_{d-1}^A(r)=0.
```

## Theorem 21: Degree-6 Edge Wall

The next edge polynomial generated by Theorem 17 is

```text
H_6^A(X)
  =
  X^6 - 15AX^4 + 20AX^3 - 30AX^2 + 36AX - 24A
  + 45A^2X^2 - 60A^2X + 40A^2 - 15A^3.
```

The adjacent-Appell wall resultant factors as

```text
Res_X(H_6^A,H_5^A)
  =
  -16A^5 P_6(A),
```

where

```text
P_6(A)
  =
  5400000A^10 - 27000000A^9 + 67500000A^8
  - 110925000A^7 + 132586875A^6 - 120420000A^5
  + 84122250A^4 - 44549500A^3 + 17008800A^2
  - 4182300A + 497664.
```

The decic `P_6` has exactly two positive roots:

```text
A_{6,-}=0.74747110775875305435...,
A_6    =0.78752607887675735239....
```

The smaller root is a partial wall: the real-root count changes from two to
four. The larger root is the full degree-6 hyperbolicity threshold:

```text
H_6^A has six real roots  <=>  A >= A_6.
```

### Exact Certificate

Sturm counts give:

```text
P_6 has exactly two positive roots,
one in (747/1000,3/4),
one in (787/1000,79/100).
```

Root counts for `H_6^A` between the wall intervals are:

```text
A=1/10:  H_6^A has 2 real roots,
A=3/4:   H_6^A has 4 real roots,
A=19/25: H_6^A has 4 real roots,
A=4/5:   H_6^A has 6 real roots.
```

Hence the larger positive decic root is the exact full degree-6 wall.

### Consequence

The known full edge constants are now

```text
A_2=0,
A_3=1/4,
A_4=0.432678606330554...,
A_5=0.597117448450202...,
A_6=0.787526078876757....
```

This adds nontrivial support to the monotone edge-wall conjecture

```text
A_d -> 1.
```

## Theorem 22: Edge Generator Coefficient Tail

Let

```text
F_A(t)=exp(-A[t+(1-t)log(1-t)])
      =sum_{n>=0} gamma_n(A)t^n/n!.
```

For every fixed `A>0`,

```text
[t^n]F_A(t)
  =
  -A e^{-A}/[n(n-1)] + O(log n/n^3),
```

and therefore

```text
gamma_n(A)
  =
  -A e^{-A}(n-2)! + O(n! log n/n^3).
```

The edge polynomial is the reversed Jensen polynomial of this coefficient
sequence:

```text
H_d^A(X)
  =
  sum_{k=0}^d binom(d,k) gamma_k(A)(-X)^{d-k}.
```

### Proof

Set `u=1-t`. Then

```text
t+(1-t)log(1-t)
  =
  1 + u(log u - 1),
```

so

```text
F_A(t)
  =
  e^{-A} exp(Au(1-log u)).
```

In a dented neighborhood of `t=1`,

```text
F_A(t)
  =
  e^{-A}[1 + Au - Au log u + O(u^2 log^2 u)].
```

For `n>=2`, the analytic polynomial part contributes no coefficient, while

```text
[t^n](1-t)log(1-t) = 1/[n(n-1)].
```

The standard transfer estimate for `u^2 log^2 u` gives the displayed
`O(log n/n^3)` error.

Finally, multiplying the exponential generating functions

```text
F_A(t)e^{-Xt}
```

and comparing coefficients gives the reversed Jensen formula.

### Consequence

The edge family has a logarithmic branch point at `t=1` and a factorial
coefficient tail. Thus the all-degree edge problem cannot be solved by a
generic Laguerre-Polya or PF-infinity theorem applied directly to
`F_A`; the generator is not an entire or meromorphic Edrei product. Any proof
of `A_d -> 1` must use the special reversed-Jensen/Appell ladder structure,
not only coefficient total positivity.

## Theorem 23: Degree-7 Edge Wall and Refutation of the Naive Edge Limit

The degree-7 edge polynomial is

```text
H_7^A(X)
  =
  -X^7 + 21AX^5 - 35AX^4 + 70AX^3 - 126AX^2
  + 168AX - 120A
  - 105A^2X^3 + 210A^2X^2 - 280A^2X + 196A^2
  + 105A^3X - 105A^3.
```

The adjacent-Appell wall resultant factors as

```text
Res_X(H_7^A,H_6^A)
  =
  -432A^6P_7(A),
```

where

```text
P_7(A)
  =
  9331200000A^15 - 81648000000A^14 + 360612000000A^13
  - 1065317400000A^12 + 2352475440000A^11
  - 4111360020000A^10 + 5872908672500A^9
  - 6980059162875A^8 + 6955236409800A^7
  - 5803811662600A^6 + 4014028799392A^5
  - 2252023192800A^4 + 987682073216A^3
  - 318102697728A^2 + 66958589952A - 6912000000.
```

`P_7` has exactly three positive roots:

```text
A_{7,1}=0.77667335051441792459...,
A_{7,2}=0.88669727013438299268...,
A_7    =1.02985121902549113375....
```

The first two are partial walls. The larger root is the full degree-7
hyperbolicity threshold:

```text
H_7^A has seven real roots  <=>  A >= A_7.
```

### Exact Certificate

Sturm counts give:

```text
P_7 has exactly three positive roots,
one in (3/4,4/5),
one in (22/25,9/10),
one in (1,21/20).
```

Root counts for `H_7^A` between these wall intervals are:

```text
A=1/10:  H_7^A has 1 real root,
A=4/5:   H_7^A has 3 real roots,
A=17/20: H_7^A has 3 real roots,
A=9/10:  H_7^A has 5 real roots,
A=1:     H_7^A has 5 real roots,
A=21/20: H_7^A has 7 real roots.
```

Thus `A_7>1`.

### Consequence

The naive fixed-degree edge conjecture

```text
0=A_2 < A_3 < A_4 < A_5 < A_6 < ... < 1,
lim A_d = 1
```

is false. The corrected conclusion is sharper:

```text
fixed d, x->infinity, alpha=A/x
```

is a real and useful WDW boundary layer, but its full-hyperbolicity constants
are not the same object as Fable's all-degree `alpha_c=1` boundary. The RH
comparison must therefore use a coupled scaling in which degree and shift
grow together, or use a weaker adjacent-ladder condition than full
hyperbolicity of every fixed edge polynomial.

## Theorem 24: Coupled Shift-Degree Tropical Scaling

For the Cauchy curvature profile

```text
c_{n+r}=alpha/(n+b+r),
x=n+b+1,
```

the affine-normalized coefficient weights of the shifted Jensen section are

```text
w_k=exp(-alpha S_x(k)),
S_x(k)=sum_{r=1}^{k-1} (k-r)/(x+r-1),
S_x(0)=S_x(1)=0.
```

Equivalently,

```text
S_x(k)
  =
  (x+k-1)(psi(x+k-1)-psi(x)) - (k-1).
```

The adjacent coefficient ratios of

```text
sum_{k=0}^d (-1)^k binom(d,k)w_k t^k
```

are exactly

```text
tau_{d,x,k}
  =
  [binom(d,k-1)w_{k-1}]/[binom(d,k)w_k]
  =
  k/(d-k+1) * exp(alpha[psi(x+k-1)-psi(x)]).
```

If

```text
d/x -> rho in (0,infinity),
k/d -> p in (0,1),
```

then

```text
S_x(k)/d
  ->
  [(1+rho p)log(1+rho p)-rho p]/rho,
```

and

```text
tau_{d,x,k}
  ->
  T_{alpha,rho}(p)
  =
  p/(1-p) * (1+rho p)^alpha.
```

Moreover,

```text
d/dp log T_{alpha,rho}(p)
  =
  1/p + 1/(1-p) + alpha rho/(1+rho p)
  > 0.
```

### Proof

The first identity is just summation of the curvature window:

```text
S_x(k)-S_x(k-1)
  =
  sum_{r=1}^{k-1} 1/(x+r-1)
  =
  psi(x+k-1)-psi(x).
```

Summing once more gives the displayed closed form for `S_x(k)`. The ratio
formula follows from

```text
binom(d,k-1)/binom(d,k)=k/(d-k+1),
w_{k-1}/w_k=exp(alpha[S_x(k)-S_x(k-1)]).
```

For the scaling limit, replace the sum by the Riemann integral

```text
S_x(k)
  =
  sum_{r=1}^{k-1} (k-r)/(x+r-1)
  =
  x int_0^{rho p} (rho p-u)/(1+u) du + o(d),
```

and evaluate:

```text
int_0^y (y-u)/(1+u)du
  =
  (1+y)log(1+y)-y.
```

The ratio limit follows from the digamma difference. The derivative of
`log T` is immediate.

### Consequence

The coupled `d/x` scaling has a deterministic tropical root curve

```text
t=T_{alpha,rho}(p).
```

This curve is strictly increasing for every `alpha>0` and `rho>0`. Therefore
the `alpha_c=1` boundary is not caused by a collision of adjacent tropical
coefficient ratios in the coupled bulk. Any obstruction must live in the
subleading Sturm/interlacing corrections or in boundary layers such as
`p->0`, `p->1`, or `rho->infinity`.

## Theorem 25: Fixed-Shift Head Boundary Layer

Keep the shift parameter

```text
x=n+b+1
```

fixed while `d->infinity`. For indices satisfying

```text
k->infinity,
k=o(d),
```

the exact ratio from Theorem 24 has the asymptotic form

```text
tau_{d,x,k}
  =
  e^{-alpha psi(x)} k^{alpha+1}/d
  * [1+O(k/d)+O(1/k)].
```

Equivalently, if

```text
k = y d^{1/(alpha+1)} + o(d^{1/(alpha+1)}),
```

then

```text
tau_{d,x,k}
  ->
  e^{-alpha psi(x)} y^{alpha+1}.
```

For the head case `x=1`,

```text
e^{-alpha psi(1)}=e^{alpha EulerGamma}.
```

### Proof

The exact ratio is

```text
tau_{d,x,k}
  =
  k/(d-k+1) * exp(alpha[psi(x+k-1)-psi(x)]).
```

For fixed `x` and `k->infinity`,

```text
psi(x+k-1)=log k + O(1/k),
```

while

```text
k/(d-k+1)=k/d * [1+O(k/d)].
```

Substitution gives the first formula. The scaling limit follows by setting
`k=y d^{1/(alpha+1)}`. Since `psi(1)=-EulerGamma`, the head constant follows.

### Consequence

The hard head regime has a different natural scale from the coupled bulk:

```text
k ~ d^{1/(alpha+1)}.
```

At the critical value `alpha=1`, this becomes the square-root edge

```text
k ~ sqrt(d).
```

Thus the `alpha_c=1` problem should be attacked in a Bessel/Laguerre-type
head boundary layer, not in the fixed-degree edge constants or the coupled
bulk tropical curve. This is consistent with the Laguerre anchor at
`alpha=1`, where square-root scaling is the classical hard-edge scale.

## Theorem 26: Hard-Head Entire Limit

For fixed

```text
alpha>0,
x=n+b+1>0,
```

define

```text
Phi_{alpha,x}(s)
  =
  sum_{k>=0} (-1)^k exp(-alpha S_x(k)) s^k/k!,
```

where

```text
S_x(0)=S_x(1)=0,
S_x(k)=sum_{r=1}^{k-1}(k-r)/(x+r-1).
```

Then, locally uniformly on compact `s`-sets,

```text
P_{d,x}(s/d)
  =
  sum_{k=0}^d (-1)^k binom(d,k)exp(-alpha S_x(k))(s/d)^k
  ->
  Phi_{alpha,x}(s).
```

The coefficient ratio of the limiting entire function is

```text
[s^{k-1}]Phi_{alpha,x}/[s^k]Phi_{alpha,x}
  =
  - k exp(alpha[psi(x+k-1)-psi(x)]).
```

Equivalently, for the positive coefficient sequence,

```text
r_{alpha,x,k}
  =
  k exp(alpha[psi(x+k-1)-psi(x)])
  ~ e^{-alpha psi(x)} k^{alpha+1}.
```

The entire function has order

```text
rho = 1/(alpha+1).
```

For the critical head `alpha=1,x=1`,

```text
Phi_{1,1}(s)
  =
  sum_{k>=0} (-1)^k exp(-kH_{k-1}+k-1) s^k/k!,
```

with `H_0=0`, and it has order `1/2`.

### Proof

For fixed `k`,

```text
binom(d,k)(s/d)^k -> s^k/k!.
```

Also

```text
0 <= binom(d,k)d^{-k} <= 1/k!,
```

so compact convergence follows from the superexponential decay of
`exp(-alpha S_x(k))/k!`. The ratio formula follows from

```text
S_x(k)-S_x(k-1)=psi(x+k-1)-psi(x).
```

For the order, use

```text
S_x(k)
  =
  k log k - k(1+psi(x)) + (x-1)log k + O(1),
```

and Stirling's formula:

```text
-log |[s^k]Phi_{alpha,x}|
  =
  (alpha+1)k log k + O(k).
```

Hence

```text
rho = limsup k log k / -log |[s^k]Phi| = 1/(alpha+1).
```

### Consequence

The head RH problem has a precise local entire-function target:

```text
Phi_{alpha,x} is Laguerre-Polya for the relevant critical profiles.
```

By Hurwitz, any nonreal zero of `Phi_{alpha,x}` would force nonreal zeros in
large finite Jensen sections after the `t=s/d` rescaling. Conversely, proving
`Phi_{1,1}` and its adjacent-shift analogues are Laguerre-Polya is the
microscopic hard-head form of the `alpha_c=1` problem.

## Theorem 27: Hard-Head Shift-Derivative Ladder

The hard-head limit functions satisfy the exact differential-shift identity

```text
partial_s Phi_{alpha,x}(s)
  =
  - Phi_{alpha,x+1}(e^{-alpha/x}s).
```

Consequently, if `Phi_{alpha,x}` has only simple positive zeros, then the
zeros of the scaled adjacent function

```text
Phi_{alpha,x+1}(e^{-alpha/x}s)
```

are exactly the critical points of `Phi_{alpha,x}`. The hard-head
Sturm-ladder condition is therefore:

```text
zeros(Phi_{alpha,x+1}(e^{-alpha/x}s))
interlace zeros(Phi_{alpha,x}(s)).
```

### Proof

Differentiate the defining series:

```text
partial_s Phi_{alpha,x}(s)
  =
  -sum_{j>=0} (-1)^j exp(-alpha S_x(j+1))s^j/j!.
```

The curvature sums satisfy the exact shift identity

```text
S_x(j+1)=S_{x+1}(j)+j/x.
```

Indeed,

```text
S_x(j+1)
  =
  sum_{r=1}^j (j+1-r)/(x+r-1)
  =
  j/x + sum_{q=1}^{j-1}(j-q)/(x+q)
  =
  j/x + S_{x+1}(j).
```

Substitution gives

```text
partial_s Phi_{alpha,x}(s)
  =
  -sum_{j>=0} (-1)^j exp(-alpha S_{x+1}(j))
    (e^{-alpha/x}s)^j/j!,
```

which is the claimed identity.

### Consequence

This identity is the exact hard-head analogue of the finite Jensen ladder.
It converts the local `alpha_c=1` problem into a classical real-entire
problem:

```text
prove Phi_{1,x} is Laguerre-Polya for x>=1
and its derivative zeros interlace by Rolle through the scaled shift.
```

A single nonreal zero of any `Phi_{1,x}` would be an asymptotic falsification
route. Conversely, proving the family is closed in Laguerre-Polya under the
shift derivative would settle the microscopic head obstruction.

The same note also identifies the healing wall:

```text
R_{d+1}^n has a multiple positive root
  <=> R_d^n and R_d^{n+1} share a positive root.
```

Thus the fold-sign conjecture can be checked on the adjacent-section
resultant wall, not by tracking all degree-`d+1` roots directly.

Moreover, at a common root `x=y=tau`, the fold sign is exactly the velocity
with which the adjacent `R_d^{n+1}` root moves to the right of the `R_d^n`
root:

```text
-S_lambda/S_tt = tau/(d+1) * (y' - x').
```

Thus WDW healing is local rightward separation of adjacent-section roots.

After removing affine log-coefficient terms, this velocity is a function only
of the local curvature window:

```text
eta_k = -sum_{r=1}^{k-1}(k-r)c_{n+r}.
```

So the local WDW crossing problem is curvature-only.

More explicitly, the crossing numerator is a finite curvature-kernel
contraction:

```text
tilde S_lambda
  = sum_{r=1}^d c_{n+r}K_r,
```

with kernels determined by the common root and the normalized local section.

The first structured-profile crossing beyond degree 3 has also been resolved
asymptotically: for `c_j=alpha/(j+b)` and large `n+b`, the adjacent-cubic
common-root branch has positive gap velocity

```text
tilde y' - tilde x' = 0.6163827415.../(n+b+1)^2 + O((n+b+1)^-3),
```

so that crossing heals.

## New Conjectures

### C1: Higher-Degree Single-Wall Conjecture

Theorem 6 proves monotone healing in degree 3. The higher-degree analogue is:
for every structured positive slowly varying curvature profile, each degree
`d` has a single healing wall in `lambda` for the adjacent-shift Sturm ladder.

```text
R_{d,n}^{lambda} right-interlaces R_{d,n+1}^{lambda}
```

should fail near `lambda=0` when higher curvature jets are nonzero, cross once,
and then hold forever.

### C2: Curvature-Jet Cone Conjecture

For each degree `d`, there is an explicit semi-algebraic cone `C_d` in the
finite curvature jet

```text
(c_n, c_{n+1}, ..., c_{n+d-2})
```

such that `R_{d,n}^{lambda}` is hyperbolic iff the scaled jet
`lambda c` lies in `C_d`. The cones are nested by the Sturm ladder:

```text
right-interlacing at degree d  =>  membership in C_{d+1}.
```

Degree 2 gives the half-line `c >= 0`. Degree 3 gives the explicit wall
`Psi >= 0`.

### C3: Xi Survives by Moving into the Interior of the Jet Cones

Fable's measured xi profile has both coordinates rising with depth:

```text
alpha(j) increases, b(j) increases.
```

In jet language this says adjacent curvature links become positive and more
slowly varying deeper in the section. The proposed survival mechanism is:

```text
the xi jet enters C_d faster than d increases.
```

This is the finite-degree version of the retreating-wall picture.

### C4: Monotone Healing Requires Positive Curvature Thickness

The degree-3 flat-neighbor obstruction suggests a higher-degree necessary
condition: not only `c_j >= 0`, but every window of length `d-1` must contain
enough positive curvature thickness. A possible analytic form is

```text
sum_{j=n}^{n+d-2} c_j >= B_d(local variation),
```

where `B_d` vanishes for constant curvature and grows with higher finite
differences of `c`.

This turns Fable's wall-slope program into a barrier estimate: the wall
retreats when the accumulated curvature thickness beats curvature variation.

### C5: WDW Fold-Sign Conjecture for Structured Profiles

For the structured profiles

```text
c_j = alpha / (j+b)
```

and for xi-like slowly varying profiles, every first collision on the healing
wall satisfies the fold sign

```text
-R_lambda / R_tt > 0
```

on the real side reached by increasing `lambda`. This would prove that root
collisions are one-way healing events for the Sturm ladder.

### C6: Laguerre-Anchor Comparison Conjecture

Let

```text
c_j^Lag = log(1+1/j)
```

be the curvature profile of the classical Laguerre/Jensen anchor
`a_j=1/j!`. Then

```text
c_j^Lag = int_0^1 db/(j+b),
```

while the head critical profile is

```text
c_j^{crit} = 1/j.
```

The exact excess curvature is

```text
e_j = c_j^{crit} - c_j^Lag
    = int_0^1 b/(j(j+b)) db
    > 0.
```

Conjecture: adding this specific completely-monotone excess `e_j` to the
Laguerre anchor preserves the tailwise Laguerre-Polya property for every
shift `n`.

Equivalently, the `alpha=1,b=0` profile is not safe because it has more
curvature pointwise in an arbitrary sense; it is safe because its excess over
Laguerre is a structured Cauchy-kernel deformation. This avoids the GPT-F8
anti-healing obstruction.

### C7: Shift-Scaling Law for the Boundary

For `c_j=alpha/(j+b)`, Theorem 9 gives the highest WDW birth jet

```text
Delta^d ell_n
  = (-1)^{d-1} alpha(d-2)!/(n+b+1)_{d-1}.
```

Thus increasing `b` does not add a fixed number of safe degrees. It suppresses
every high jet by a rising-factorial denominator. The natural boundary
variable is therefore multiplicative, roughly

```text
d/(b + beta(alpha)),
```

not `d - const*b`.

This matches Fable's Round 244 observation that `d*(alpha,b)` is closer to

```text
d*(alpha,0) * (1 + b/beta(alpha))
```

than to an additive slope law. The degree-3 retreat formula gives the local
head-wall scale `lambda_3 ~ 1/(4 alpha(n+b+1))`; higher-degree failure should
be controlled by when the rising-factorial suppression of the top jets no
longer compensates for degree growth.

### C8: Stieltjes-Kernel Positivity Conjecture

At an adjacent-section common-root event, GPT-F7 gives the crossing numerator

```text
N(c)=sum_{r=1}^d c_{n+r}K_r.
```

For any Stieltjes-mixture curvature profile

```text
c_{n+r}=int_B dmu(b)/(n+r+b),
```

GPT-F12 rewrites this as

```text
N(c)=int_B Phi(b)dmu(b),
Phi(b)=sum_{r=1}^d K_r/(n+r+b).
```

Conjecture: for xi-like and `alpha/(j+b)` healing-wall events, the relevant
rational transform `Phi(b)` is positive on the support interval of the
curvature measure.

This converts the finite curvature-kernel inequality into a one-variable
rational positivity problem. For the Laguerre-to-critical comparison:

```text
Laguerre:  N_Lag  = int_0^1 Phi(b)db,
critical:  N_crit = Phi(0).
```

Thus the exact local comparison target is

```text
Phi(0) >= int_0^1 Phi(b)db > 0,
```

or the stronger monotonic certificate `Phi(0)>=Phi(b)` for `0<=b<=1`.

### C9: Polynomial Certificate Conjecture for the Critical Edge

At each structured healing-wall event, define the GPT-F13 polynomials

```text
Q_0(b)=D(b)Phi(b),
Q_1(b)=D(b)[Phi(0)-Phi(b)]/b,
Q_der(b)=D(b)^2[-Phi'(b)].
```

Conjecture: for xi-like and critical-edge `alpha/(j+b)` events,

```text
Q_0(b)>0,
Q_1(b)>=0
```

on `0<=b<=1`. A stronger possible certificate is

```text
Q_der(b)>=0
```

on the same interval.

Interpretation: the Laguerre anchor heals the event, and moving from the
Laguerre average to the critical endpoint `1/j` cannot reverse the healing
sign. This is the local polynomial form of the `alpha_c=1` claim.

### C10: Edge-Wall Question, Revised After Degree 7

Define

```text
A_d = inf { A>=0 : H_d^A has only real roots }.
```

The fixed-degree values are

```text
A_2=0,
A_3=1/4,
A_4=0.432678606330554...,
A_5=0.597117448450202...,
A_6=0.787526078876757...,
A_7=1.029851219025491....
```

The pre-degree-7 guess

```text
0=A_2 < A_3 < A_4 < A_5 < A_6 < ... < 1
```

is false by Theorem 23. The fixed-degree edge constants overshoot one at
degree 7.

Therefore Fable's empirical divergence

```text
d*(alpha,0) ~ 7.35/(1-alpha)^2.28
```

cannot be identified with `1-A_d` for the full fixed-degree edge thresholds.
The revised target is a coupled edge/head scaling:

```text
d -> infinity,
x=n+b+1 -> infinity,
A=alpha x,
d/x not negligible.
```

In that scaling, Fable's `alpha_c=1` may appear as the boundary for the full
Jensen ladder even though the fixed-`d` edge constants cross one.

### C11: Cauchy-Moment Cumulant Kernel

The Appell cumulant is not arbitrary. It has the exact positive-kernel form

```text
t+(1-t)log(1-t)
  =
  sum_{m>=2} t^m/[m(m-1)]
  =
  t^2 int_0^1 (1-u)/(1-ut) du.
```

Thus the edge cumulant coefficients

```text
1/[m(m-1)]
```

are Hausdorff moments:

```text
1/[m(m-1)] = int_0^1 u^{m-2}(1-u) du.
```

This is the edge analogue of GPT-F12's Stieltjes transform. The WDW edge is a
positive mixture of geometric finite-difference jets, not a generic Appell
family. Any proof of the edge-wall limit should exploit this total-positivity
input rather than treating the discriminants separately.

### C12: Appell Root-Velocity Identity

From the generating function,

```text
partial_A H_d^A
  =
  -sum_{m=2}^d d!/[m(m-1)(d-m)!] H_{d-m}^A.
```

At a simple root `x_i(A)` of `H_d^A`,

```text
x_i'(A)
  =
  - (partial_A H_d^A)(x_i) / (partial_X H_d^A)(x_i)
  =
  (partial_A H_d^A)(x_i) / [d H_{d-1}^A(x_i)].
```

At a wall, `H_d^A` has a multiple root exactly when it shares a root with
`H_{d-1}^A`. Therefore every edge fold sign can be tested using only
lower-degree Appell polynomials:

```text
H_d^A(r)=0,
H_{d-1}^A(r)=0,
partial_A H_d^A(r) has the fold sign.
```

This is the fixed-edge version of the WDW adjacent-section gap-velocity
criterion.

### C13: Edge-to-Head Comparison Conjecture

The edge normal form controls large shifts with `alpha=A/x`. The head
problem at `b=0,n=0` has `x=1`, where the edge approximation is not formally
small. The proposed comparison principle is:

```text
head wall at degree d <= edge wall A_d + finite-d correction,
finite-d correction -> 0 as d->infinity.
```

If true, the all-degree `alpha_c=1` theorem reduces to C10 plus a finite-shift
comparison. This is the current narrowest bridge between the WDW calculus and
Fable's Round 244 boundary table.

### C14: No Fixed-Ratio Large-Shift Caustic

Fable's F204 clearance curve makes the large-`b` growth of `d*(alpha,b)` the
single most important calibration problem. The first asymptotic check is now
clear.

Let

```text
x=n+b+1,
d/x -> rho in (0,infinity),
k/d -> p in (0,1).
```

For the Cauchy profile,

```text
S_x(k)
  =
  (x+k-1)(psi(x+k-1)-psi(x))-(k-1),
```

and the leading coefficient potential is

```text
H(p)
-
alpha/rho * [(1+rho p)log(1+rho p)-rho p].
```

The formal root-log map is

```text
u_{alpha,rho}(p)
  =
  log(p/(1-p)) + alpha log(1+rho p),
```

with

```text
u'_{alpha,rho}(p)
  =
  1/p + 1/(1-p) + alpha rho/(1+rho p)
  > 0.
```

Thus a fixed-ratio law `d~rho x` has no leading hydrodynamic caustic. Any
linear large-`b` fit is therefore preasymptotic or subleading. This pushes the
true large-shift wall problem into a boundary-layer question.

### C15: Airy-Versus-Cauchy Large-Shift Wall

For `k=o(x)`, the Cauchy profile expands as

```text
S_x(k)
  =
  binom(k,2)/x
  - binom(k,3)/x^2
  + O(k^4/x^3).
```

The quadratic term is exactly the heat-line multiplier and is safe by
GPT-F1. The cubic term is the first variation penalty. The finite Jensen
section contributes its own Gaussian regularizer:

```text
binom(d,k)d^{-k}
  =
  1/k! * exp(-binom(k,2)/d + O(k^3/d^2)).
```

So the hard-head coefficient exponent has the schematic WDW form

```text
safe thickness:
  (alpha/x + 1/d) binom(k,2)

variation penalty:
  alpha binom(k,3)/x^2 + higher Cauchy jets.
```

There are two possible asymptotic wall layers:

```text
Airy layer:       d ~ x^(4/3)
Full Cauchy head: d ~ x^2
```

The Airy layer is where the cubic correction first becomes order one at the
binomial cutoff `k~sqrt(d)`. The full Cauchy-head layer is where that cutoff
reaches `k~x`, so the entire nonconstant Cauchy profile is visible.

Conjecture: in the structured `alpha/(j+b)` family, heat-line total
positivity protects the Airy layer, and the first genuine large-shift wall is
controlled by the full Cauchy-head scale. If true, Fable's F204 crossing from
the linear `(1+b/4)` extrapolation is a calibration artifact.

### C16: Large-`b` Referee Matrix

The next numerical test should not fit another straight line. It should
distinguish the three possible asymptotic columns:

```text
linear:       d*(alpha,b)/b       stabilizes,
Airy:         d*(alpha,b)/b^(4/3) stabilizes,
full Cauchy:  d*(alpha,b)/b^2     stabilizes.
```

For xi, Fable measured `b~d^0.53`. A full-Cauchy or stronger wall bends the
clearance curve upward asymptotically, while a linear wall does not.

### C17: Mellin-Hausdorff Kernel Certificates

GPT-F12's rational transform has a second form that may be better suited to
proof. At a common-root event,

```text
Phi(b)=sum_{r=1}^d K_r/(n+r+b).
```

Use

```text
1/(n+r+b)=int_0^1 q^{n+r+b-1}dq
```

to write

```text
Phi(b)=int_0^1 q^b G(q)dq,
G(q)=sum_{r=1}^d K_r q^{n+r-1}.
```

After absorbing the Sturm sign,

```text
G_i(q)=(-1)^iG(q),
```

healing for all Cauchy shifts follows from the tail-integral certificate

```text
T(q)=int_q^1 G_i(u)du >= 0 on [0,1],
T(0)>0.
```

Indeed,

```text
int_0^1 q^b G_i(q)dq
  =
  b int_0^1 q^{b-1}T(q)dq       (b>0).
```

The Laguerre-to-critical comparison has the dual prefix certificate

```text
P(q)=int_0^q G_i(u)du >= 0 on [0,1],
```

because

```text
Phi_i(0)-Phi_i(b)
  =
  int_0^1 (1-q^b)G_i(q)dq
  =
  b int_0^1 t^{b-1}P(t)dt.
```

So Fable's kernel referee can test three nested certificates at each event:

```text
G_i(q)>=0        strongest,
T(q)>=0          all-shift Cauchy healing,
P(q)>=0          Laguerre-to-critical monotonicity.
```

### C18: Shadow-Polynomial Reduction of the Kernel

The Mellin polynomial is exactly the wall polynomial viewed from the common
root. With

```text
tilde S(s)=tilde A(s)-s tilde B(s),
tilde S(sigma)=tilde S_s(sigma)=0,
```

and

```text
G(q)=sum_{r=1}^d K_r q^{n+r-1},
```

GPT-F34 gives

```text
G(q)
  =
  -q^n tilde S(q sigma)/(1-q)^2.
```

The apparent pole at `q=1` is removable because `sigma` is a double root.
The endpoint value is

```text
G(1)
  =
  (d+1)sigma^2 tilde B_s(sigma)/2.
```

After the Sturm sign normalization,

```text
G_i(1)>0.
```

This explains why pointwise `G_i(q)>=0` is too strong at bulk collisions:
`tilde S(q sigma)` changes sign at roots before `sigma`. The real theorem is
an integral cancellation theorem for the shadow of `tilde S`, not a pointwise
kernel-positivity theorem.

### C19: Endpoint Dominance and the Deep-Window Margin Law

For a fixed common-root event, the signed Cauchy transform satisfies

```text
Phi_i(b)
  =
  int_0^1 q^b G_i(q)dq
  =
  [(d+1)sigma^2 |tilde B_s(sigma)|/2]/(b+1)
  + O(1/b^2).
```

Since `G_i(q)=q^n H_i(q)`, the same endpoint law can be written in the
combined-depth variable:

```text
Phi_i(b)=int_0^1 q^{n+b}H_i(q)dq
        = H_i(1)/(n+b+1)+O((n+b)^-2).
```

Therefore every fixed event heals for all sufficiently large Cauchy offset.
This gives a theoretical source for Fable's measured deep-window margin decay
`~1/(n+b)`: large offsets concentrate the Mellin weight near `q=1`, where the
shadow polynomial has the correct sign forced by the double-root geometry.

### C20: Variation-Diminishing Offset Bound

At a regular hyperbolic wall, suppose `tilde S` has exactly `i-1` roots before
the double root `sigma`. GPT-F34 implies that the signed shadow

```text
G_i(q)=(-1)^{i+1}q^n tilde S(q sigma)/(1-q)^2
```

has exactly `i-1` sign changes on `(0,1)`. The signed offset transform is

```text
Phi_i(b)
  =
  int_0^infinity e^{-(b+1)t}G_i(e^{-t})dt
```

after `q=e^{-t}`. Since the exponential kernel is strictly totally positive,
the transform is variation-diminishing: `Phi_i(b)` has at most `i-1` zeros
as a function of `b>=0`.

Together with endpoint dominance, a fixed event can anti-heal only over
finite-offset ranges. It cannot generate indefinitely repeated late failures
as `b` grows.

### C21: Critical Hard-Head Bessel Anchor

For the critical hard-head function

```text
Phi_{1,x}(s)=sum_k (-1)^k exp(-S_x(k))s^k/k!,
```

set

```text
C_x=exp(psi(x)),
nu_x=x-3/2.
```

Then the coefficients satisfy

```text
exp(-S_x(k))/k!
  ~
  L_x C_x^k/[k! Gamma(k+nu_x+1)],
L_x=sqrt(2pi)exp((x-1)psi(x)-x+1/2).
```

Thus the critical hard head has Bessel anchor

```text
L_x(C_xs)^(-nu_x/2)J_{nu_x}(2sqrt(C_xs)).
```

The anchor is compatible with the exact shift-derivative ladder because

```text
C_{x+1}e^{-1/x}=C_x,
nu_{x+1}=nu_x+1,
L_{x+1}/L_x=exp(psi(x)).
```

For Fable's hard-head scan:

```text
zeros(Phi_{1,1}) ~ e^EulerGamma ((m-1/2)pi)^2/4,
e*zeros(Phi_{1,2}) ~ e^EulerGamma (m pi)^2/4.
```

So the tail behavior is the cosine/sine Bessel interlacing model. Any nonreal
zero of `Phi_{1,1}` should be a finite-core defect, not an asymptotic-tail
defect.

### C22: Hard-Head Poisson Endpoint and Universal Zero Shift

The Bessel anchor has an exact dilation refinement. At `alpha=1`,

```text
Phi_{1,x}(s)=E B_x(U_xs),
B_x(s)=Gamma(x-1/2)(C_xs)^(-nu_x/2)J_{nu_x}(2sqrt(C_xs)),
C_x=exp(psi(x)),  nu_x=x-3/2,
```

where `U_x=exp(-L_x)` and `L_x` is compound-Poisson with Levy density

```text
rho_x(t)=eta(t)e^{-xt}/(1-e^{-t}),
eta(t)=e^{t/2}/t - 1/(1-e^{-t}).
```

The small-jump expansion is universal:

```text
eta(t)=t/24+O(t^2),
rho_x(t)=1/24+O(t).
```

This `1/24` is the hard-head endpoint form of the same Bernoulli/WDW
curvature correction that appears in the finite-difference jet calculus. It
implies a concrete zero-shift law for Fable's hard-head scan:

```text
4e^{-EulerGamma}s_m(Phi_{1,1}) - ((m-1/2)pi)^2 -> 1/6,
4e^{-EulerGamma}e s_m(Phi_{1,2}) - (m pi)^2 -> 1/6.
```

Equivalently, after the exact F30 scaling, both adjacent hard-head ladders
have the same additive `e^EulerGamma/24` correction to the leading Bessel
zero ruler.

The dilation laws also express the derivative ladder probabilistically:

```text
rho_{x+1}(t)=e^{-t}rho_x(t),
Law(U_{x+1}) = Law(U_x size-biased by U_x).
```

Thus the WDW hard-head problem is no longer just an asymptotic comparison to
Bessel. It is a real-zero preservation problem for a specific
multiplicative compound-Poisson dilation law whose endpoint jet is fixed by
`1/24`.

### C23: Corrected Clearance Gate and Bessel-Forced Tail

Fable's F207 correction changes the macroscopic wall gate. The derived
effective offset is

```text
b_eff(d)=(2/3)d/L^2(1+O(1/L)),
1-alpha_eff(d)~2/L.
```

Therefore a wall law

```text
d*(alpha,b)~(1-alpha)^(-p)b^theta
```

gives

```text
C(d)=d*(alpha_eff,b_eff)/d
    ~ const * d^(theta-1)L^(p-2theta).
```

The corrected asymptotic survival gate is

```text
theta>1, or theta=1 with p>=2.
```

The Airy layer is therefore viable; only `theta<1` kills the effective-profile
mechanism.

On the microscopic side, the hard-head tail is now locked. For

```text
F_x(t)=Phi_{1,x}(t^2/(4C_x)),
```

the exact dilation law gives

```text
F_x(t)=E[Gamma(x-1/2)(sqrt(U_x)t/2)^(-nu_x)
        J_{nu_x}(sqrt(U_x)t)].
```

The atom at `U_x=1` contributes the Bessel term. The continuous endpoint
contribution is one integration-by-parts order smaller, so in horizontal
strips

```text
F_x(t)
 =
 p_x Gamma(x-1/2)(t/2)^(-nu_x)J_{nu_x}(t)
 + O(t^(-nu_x-3/2)).
```

Consequently the large hard-head zeros are Bessel-forced: there is one
simple real zero near each large zero of `J_{nu_x}`. The RH-critical LP work
is now concentrated in finite-core defects and in proving that the
compound-Poisson size-bias ladder introduces no exceptional off-axis zeros.

### C24: Pólya Endpoint Obstruction and Anti-Derivative Core

Fable's F210 Pólya reduction is a valid route, but the endpoint threshold
must include the full compound-Poisson law, not just the one-jump Levy
kernel.

With

```text
q_x(y)=e^{y/2}rho_x(y)
      =eta(y)e^{-(x-1/2)y}/(1-e^{-y}),
```

we have

```text
q_x(y)=1/24 + ((3/2-x)/24)y + O(y^2).
```

For the continuous compound-Poisson density of `Y_x=-log U_x`,

```text
g_x(y)=e^{y/2}f_x(y)
      =e^{-nu_x((0,infinity))}
       [q_x(y)+(q_x*q_x)(y)/2!+...].
```

Since `(q_x*q_x)(y)=y/24^2+O(y^2)`, the endpoint derivative is

```text
g_x'(0+)
 =
 e^{-nu_x((0,infinity))}
 [(3/2-x)/24+1/1152].
```

The density of `R_x=sqrt(U_x)` is increasing at the endpoint only if
`g_x'(0+)<=0`, hence the Pólya monotone-kernel route cannot begin before

```text
x >= 73/48.
```

Thus `x=2` remains plausible for Pólya, but `x=3/2` is not covered by endpoint
monotonicity. The `n>=2` convolution terms create a real obstruction rather
than automatically inheriting monotonicity.

The remaining bridge from `x=2` to `x=1` is an anti-derivative finite-core
criterion. Since

```text
partial_s Phi_{1,1}(s)=-Phi_{1,2}(e^{-1}s),
```

the critical points of `Phi_{1,1}` are `e` times the zeros of `Phi_{1,2}`.
If `Phi_{1,2}` is LP and the critical values of `Phi_{1,1}` alternate signs,
then `Phi_{1,1}` has one real zero in every critical interval. F42 supplies
the tail sign pattern, so only finitely many critical values remain.

This is the current finite-core target:

```text
Pólya prove Phi_{1,2} in LP;
F42 locks Phi_{1,1} tail;
F33/F34-style certificates prove finite critical-value signs.
```

### C25: Majority-Atom Hard-Head Theorem and Finite Lift

Fable's F211 atom-dominated Rouché proof is valid at the critical hard head
`x=1`, and it supersedes the Pólya/anti-derivative route for `Phi_{1,1}`.

The abstract theorem is:

```text
Psi(z)=p cos(az)+int_[0,a) cos(tz)dmu(t),   p>mu([0,a)).
```

Then `Psi` has one simple real zero in each cosine strip. The proof is
Rouché on rectangles: the outer atom has size `cosh(a Im z)` on vertical
walls and at least `sinh(aH)` on horizontal edges, while every inner
frequency is bounded by `cosh(a Im z)` or `cosh(aH)`.

For the F39 law,

```text
Phi_{1,1}(e^EulerGamma w^2/4)
 =
p_1 cos w+int_[0,1) cos(vw)dmu(v).
```

The atom mass is exact:

```text
p_x=sqrt(2pi) exp((x-1)psi(x)-x+1/2)/Gamma(x-1/2),
p_1=sqrt(2/e)>1/2.
```

Hence `Phi_{1,1}` is Laguerre-Polya. By the hard-head derivative ladder,
`Phi_{1,n}` is Laguerre-Polya for every integer `n>=1`. The extension to
every real `x>=1` still requires the Bessel contour argument; the critical
case and integer ladder are already theorem-level.

The finite-section lift has an exact form. With

```text
Psi_d(w)=P_{d,1}(e^EulerGamma w^2/(4d)),
C_d(w)=sum_{k=0}^d (-1)^k [(d)_k/d^k] w^{2k}/(2k)!,
```

F39 gives

```text
Psi_d(w)=E C_d(sqrt(U_1)w).
```

Equivalently,

```text
Psi_d(w)=p_1C_d(w)+int_[0,1)C_d(vw)dmu(v).
```

The polynomial `C_d` is the scaled Jensen polynomial of `cos sqrt(z)` and is
real-rooted. Thus the finite-section obstruction has been compressed to a
deterministic contour problem:

```text
prove |C_d(vz)|<|C_d(z)| for 0<=v<1
on zero-separating contours around the zeros of C_d.
```

If this radial-dominance condition holds for all positive zero cells, the
same majority-atom Rouché proof lifts the critical hard-head theorem from the
limit to the finite section.

The deformed cosine is classical:

```text
C_d(w)=_1F_1(-d;1/2;w^2/(4d))
      =d!/(1/2)_d L_d^{-1/2}(w^2/(4d)).
```

Thus the finite lift is an average of Laguerre dilations
`L_d^{-1/2}(U_1 z)`. If `xi_{j,d}` are the zeros of `L_d^{-1/2}`, then
`L_d^{-1/2}(uz)` interlaces the atom polynomial whenever

```text
u > max_j xi_{j,d}/xi_{j+1,d}.
```

The remaining finite-section proof can be divided into a near-atom
Obreschkoff/interlacing part and a far-dilation atom-margin contour part.

### C26: Endpoint Density Audit

Fable's F211 addendum flagged a possible discrepancy with GPT-F40:
moment inversion gave a small value near `h_1(0.99)`, while F40 predicts
`h_1(1-)=p_1/12`. The endpoint constant is fixed by a local
compound-Poisson theorem.

If `Y` has a finite compound-Poisson law with atom `p` at zero and Lévy
density

```text
rho(y)=rho_0+rho_1y+O(y^2),
```

then its continuous density satisfies

```text
f(0+)=p rho_0,
f'(0+)=p(rho_1+rho_0^2/2).
```

For the hard-head law,

```text
rho_x(y)=eta(y)e^{-xy}/(1-e^{-y})=1/24+O(y).
```

Passing from `Y_x` to `R_x=e^{-Y_x/2}` doubles the endpoint density:

```text
h_x(1-)=p_x/12.
```

More precisely,

```text
h_x(r)
 =
p_x/12+p_x[(3/2-x)/6+1/288](1-r)+O((1-r)^2).
```

At `x=1`, this gives

```text
h_1(1-)=sqrt(2/e)/12=0.071480323...
h_1(0.99)=0.0722...+O(10^-4).
```

Thus `h(0.99)~0.010` is not compatible with the local endpoint expansion and
should be treated as a low-order moment-inversion artifact. The F40 zero
residual remains

```text
4e^{-EulerGamma}s_m(Phi_{1,1})-((m-1/2)pi)^2 -> 1/6.
```

### C27: Effective Head Lift and Bulk Localization

Fable's F212 effective head lift is correct in its coefficient and margin
estimates, with one scope correction.

For

```text
Psi_d(w)=P_{d,1}(e^EulerGamma w^2/(4d)),
psi(w)=Phi_{1,1}(e^EulerGamma w^2/4),
```

the finite coefficient factor is `(d)_k/d^k`, and

```text
0<=1-(d)_k/d^k<=k(k-1)/(2d).
```

Since the limit coefficients are bounded by `1/(2k)!`,

```text
|Psi_d(w)-psi(w)| <= (R^2/(2d))e^R,   |w|<=R.
```

The F211 strip boundary margin is

```text
M=sqrt(8/e)-1.
```

Hence `(R^2/2)e^R < Md` proves one real zero in each controlled head strip,
giving `~(log d)/pi` certified real head zeros. The disk-wide claim that all
zeros in `|w|<=R` are real needs taller contour bookkeeping; a sufficient
repair is a stronger `sqrt(2)R`-radius error bound. The important conclusion
survives: the finite lift is not a head problem. The remaining obstruction is
in bulk cells, matching the F27 tropical map and F13 certificate targets.

### C28: Exact Finite Tropical Monotonicity

The F27 tropical map has no hidden subleading reversal. Its finite adjacent
coefficient ratios are exactly monotone:

```text
tau_{d,x,k}
 =
k/(d-k+1) * exp(alpha[psi(x+k-1)-psi(x)]),
```

and

```text
log(tau_{d,x,k+1}/tau_{d,x,k})
 =
log(1+1/k)+log(1+1/(d-k))+alpha/(x+k-1)>0.
```

Thus the bulk finite-section problem is not a coefficient-ratio caustic. The
remaining possible obstruction is the displacement of actual roots inside
their already ordered tropical cells. This points back to the F13/F34
Sturm-kernel certificates as the correct bulk mechanism.

### C29: Lemma B Wall-Stieltjes Form

Fable's Lemma B radial dominance can be written as an explicit Stieltjes
inequality. If

```text
C_d(w)=prod_m(1-w^2/w_m^2),   lambda_m=w_m^2,
z=(c+iy)^2,
```

where `c` is a critical point of `C_d`, then for `s=v^2`

```text
partial_s log |C_d(sqrt(s)(c+iy))|^2
 =
-2 Re[z sum_m 1/(lambda_m-sz)].
```

Writing `z=A+iB`, this becomes

```text
2 sum_m [s|z|^2-A lambda_m]/|lambda_m-sz|^2.
```

The critical-point condition is exactly

```text
sum_m 1/(lambda_m-c^2)=0.
```

Thus the moderate-`y` radial dominance problem is a finite Stieltjes transform
bound over the Laguerre zero squares. A strong sufficient condition is
nonnegativity of this derivative on `0<=s<=1`; the exact needed condition is
the weaker integrated bound with slack `p/(1-p)=6.031...`.

### C30: First Lemma B Certificate

For `d=2`, Lemma B closes exactly. With

```text
C_2(w)=1-w^2/2+w^4/48,
c=2sqrt(3),  s=v^2,  q=y^2,
```

one has

```text
|C_2(c+iy)|^2-|C_2(sqrt(s)(c+iy))|^2
 =
(1-s)P(s,q)/2304,
```

where all coefficients of `P` are nonnegative on `0<=s<=1`. Therefore

```text
|C_2(v(c+iy))| <= |C_2(c+iy)|
```

on the whole critical wall. At the same time, the derivative shortcut from
C29 is false: the wall ratio has a real moderate-height bump for
`0.109795318...<s<0.378375006...`. The correct Lemma B proof style is
therefore denominator-clearing positivity of the integrated ratio, not
pointwise radial derivative monotonicity.

### C34: Lemma B Transverse Split

The radial dominance inequality splits into the real-axis envelope and the
positive transverse wall jets. For a critical square `r=c_j^2`, set

```text
P_d(X)=C_d(sqrt(X)),  z=r-q+2i sqrt(rq),  s=v^2,  q=y^2.
```

Then

```text
D_d(s,q;r)=|P_d(z)|^2-|P_d(sz)|^2
          =D_d(s,0;r)
           +(1-s)sum_{m=1}^{2d}q^m B_{d,m}(s;r),
```

with

```text
D_d(s,0;r)=P_d(r)^2-P_d(sr)^2.
```

Thus Fable's Lemma A supplies the `q^0` term, while GPT's independent target
is only the transverse cone

```text
B_{d,m}(s;r_j)>=0,   0<=s<=1,   1<=m<=2d.
```

This matters because the exact finite certificates through `d<=8` certify a
larger object than is needed for the division of labor.

### C35: First Transverse Jet as a Sonin Functional

The first positive `q` coefficient has an exact ODE form. Since

```text
4xP_d''(x)+(2-x/d)P_d'(x)+P_d(x)=0,
```

define

```text
M_d(x)=x[P_d(x)^2-(x/d)P_d(x)P_d'(x)+4xP_d'(x)^2].
```

For every critical square `r`,

```text
[q]D_d(s,q;r)=(M_d(r)-M_d(sr))/r.
```

The derivative is

```text
M_d'(x)=
(1+x/(4d))P_d(x)^2
-(3x/(2d)+x^2/(4d^2))P_d(x)P_d'(x)
+(4x+x^2/d)P_d'(x)^2.
```

Therefore the first transverse jet follows from a weighted Sonin
monotonicity theorem for `M_d` up to each critical square. The higher
coefficients should be treated as a hierarchy of even normal Sonin jets, not
as unrelated Krawtchouk sums.

### C36: First Transverse Jet Closed in All Degrees

The weighted Sonin test in C35 can be proved for every degree. Writing

```text
M_d'(x)=A P_d(x)^2-BP_d(x)P_d'(x)+C P_d'(x)^2,
```

where

```text
A=1+x/(4d),  B=3x/(2d)+x^2/(4d^2),  C=4x+x^2/d,
```

the quadratic-form discriminant is

```text
B^2-4AC=x N_d(x)/(16d^4),
N_d=x^3+(12d-16d^2)x^2+(36d^2-128d^3)x-256d^4.
```

For `d>=2`, `N_d` has exactly one positive root by Descartes' rule, and

```text
N_d(4d(4d-1))=-16d^3(12d+1)<0.
```

Hence `M_d'(x)>0` for `0<x<=4d(4d-1)`. The critical squares are

```text
r_j=4d xi_j,
```

where `xi_j` are zeros of `L_{d-1}^{1/2}`. The Jacobi-matrix row-sum bound for
Laguerre zeros gives `xi_j<4d-1`, so `r_j<4d(4d-1)`. Thus `M_d` is increasing
on every interval `[0,r_j]`, and

```text
B_{d,1}(s;r_j)>=0
```

for all `d`, all critical walls, and all `0<=s<=1`. Lemma B's transverse cone
is now open only for `m>=2`.

### C37: Real-Axis Lemma A Closed by Sonin Energy

The `q^0` term in the F56 split has a direct energy proof. For

```text
4xP_d''+(2-x/d)P_d'+P_d=0,
```

define

```text
S_d(x)=P_d(x)^2+4xP_d'(x)^2.
```

Then

```text
S_d'(x)=2P_dP_d'+4P_d'^2+8xP_d'P_d''
       =(2x/d)P_d'(x)^2>=0.
```

Since `S_d(0)=1` and `S_d(r)=P_d(r)^2` at a critical square `r`,

```text
P_d(sr)^2 <= S_d(sr) <= S_d(r)=P_d(r)^2,   0<=s<=1.
```

Thus

```text
D_d(s,0;r)=P_d(r)^2-P_d(sr)^2>=0
```

for every degree and every critical wall. The full finite-lift gap is now only
the higher transverse cone `B_{d,m}` for `m>=2`.

### C38: Degree-9 Transverse Cone Certified

The allowed GPT Runpod completed exact transverse certification for `d=9`.
The critical polynomial is

```text
H_9(r)=
-r^8 + 2448r^7 - 2313360r^6 + 1082652480r^5
-267956488800r^4 + 34727160948480r^3
-2187811139754240r^2 + 56258000736537600r
-379741504971628800.
```

The eight critical squares are approximately

```text
10.17481133219757, 41.03545685693809, 93.65489436261706,
170.0681233510005, 273.7892267723381, 411.0185547556499,
593.9787887156094, 854.2801438536495.
```

With `Q` degrees `(q,s,r)=(18,17,7)`, exact `CRootOf/Sturm` root counts passed
for every positive `q` coefficient on every wall:

```text
8 walls x 18 transverse coefficients, all PASS.
```

Combining this with C37 for `q^0` gives Lemma B with factor `1` for `d=9`.
Together with the previous certificates, Lemma B is exact through `d<=9`.

## Non-Computational Tests for Fable and GPT

1. **Degree-3 local test:** before solving roots, evaluate
   `Psi(exp(-lambda c_0), exp(-lambda c_1))`. It predicts degree-3
   hyperbolicity exactly.
2. **Born-complex test:** any profile with `c_0 != c_1` must fail degree 3 for
   sufficiently small positive `lambda`.
3. **Flat-neighbor test:** a window with one positive curvature and one zero
   adjacent curvature cannot heal in degree 3 at finite `lambda`.
4. **Root-wall conservation:** any numerical root list for a hyperbolic section
   must satisfy the elementary-symmetric identities in Theorem 2.
5. **Fold-sign test:** at a detected root collision, compute only
   `R_lambda` and `R_tt` at the double root. Their sign predicts whether
   increasing `lambda` heals or destroys real-rootedness.
6. **Birth-jet test:** for a fixed section, compute the highest nonzero
   finite difference `Delta^m ell_n`. The small-`lambda` roots are governed by
   `exp((Delta^m ell_n/m!) partial_x^m)(-x)^d`, not by lower curvature.
7. **Stieltjes-transform test:** at a common-root event, compute
   `Phi(b)=sum_r K_r/(n+r+b)`. For `alpha/(j+b0)`, healing is the sign of
   `Phi(b0)`. For Laguerre, healing is the sign of `int_0^1 Phi(b)db`. For
   the critical head profile, healing is the sign of `Phi(0)`.
8. **Polynomial edge test:** compute `Q_0`, `Q_1`, and optionally `Q_der`
   from GPT-F13. `Q_0>0` certifies healing across the Stieltjes support;
   `Q_1>=0` certifies the Laguerre-to-critical comparison; `Q_der>=0`
   certifies the stronger monotonic path.
9. **Appell recurrence test:** generate `H_{d+1}` from Theorem 17, not by
   expanding the exponential. Any candidate edge polynomial must satisfy both
   the recurrence and `partial_X H_d=-dH_{d-1}`.
10. **Wall-sharing test:** every edge wall must be a common-root event for
    `H_d^A` and `H_{d-1}^A`. A discriminant root that does not satisfy this is
    an algebra or normalization error.
11. **Cauchy-moment test:** any attempted asymptotic proof should use
    `1/[m(m-1)]=int_0^1 u^{m-2}(1-u)du`; if the argument works for arbitrary
    Appell cumulants, it is probably too broad and will miss the F8
    anti-healing obstruction.
12. **Large-shift wall test:** for fixed `alpha`, compute `d*(alpha,b)` at
    `b=16,32,64,128` and compare `d*/b`, `d*/b^(4/3)`, and `d*/b^2`.
    A stable linear column would mean the F204 clearance crossing remains
    serious; a stable quadratic column would recalibrate it away.
13. **Mellin kernel test:** at a common-root event, form
    `G_i(q)=(-1)^i sum_r K_r q^(n+r-1)`. Check positivity of `G_i`, its tail
    integral `int_q^1 G_i`, and its prefix integral `int_0^q G_i` on `[0,1]`.
    Tail positivity certifies all Cauchy shifts; prefix positivity certifies
    the Laguerre-to-critical comparison.
14. **Shadow-polynomial test:** verify
    `G(q)=-q^n tilde S(q sigma)/(1-q)^2` after removable-endpoint extension.
    This catches sign or indexing errors in `K_r` immediately.
15. **Endpoint-dominance test:** for fixed event, check that
    `(b+1)Phi_i(b)` tends to `(d+1)sigma^2|tilde B_s(sigma)|/2` as `b`
    grows. This should reproduce the observed `1/(n+b)` weak-margin law.
16. **Variation-diminishing test:** count roots of `tilde S` before `sigma`.
    The signed offset transform `Phi_i(b)` should have no more zeros in
    `b>=0` than that count, and must be positive for all sufficiently large
    `b`.
17. **Hard-head Bessel ruler:** compare Fable's first hard-head zeros against
    `e^EulerGamma((m-1/2)pi)^2/4` for `Phi_{1,1}` and against
    `e^(EulerGamma-1)(m pi)^2/4` for `Phi_{1,2}`. Tail agreement supports the
    LP question being finite-core.
18. **Hard-head endpoint-shift test:** in the same zero scan, check the
    sharper limits
    `4e^{-EulerGamma}s_m(Phi_{1,1})-((m-1/2)pi)^2 -> 1/6` and
    `4e^{-EulerGamma}e s_m(Phi_{1,2})-(m pi)^2 -> 1/6`.
19. **Corrected clearance-gate test:** use `b_eff~(2/3)d/L^2`, not a
    finite-range `d^0.60` fit. The macroscopic wall survives iff
    `theta>1`, or `theta=1` with `p>=2`.
20. **Bessel-forced tail test:** after transforming
    `s=t^2/(4C_x)`, large hard-head zeros must track the corresponding
    `J_{x-3/2}` zeros with `O(1/t)` displacement. Nonreal zeros found in
    the K=400 scan should therefore be finite-core defects, not tail-lattice
    replacements.
21. **Pólya endpoint test:** for the density of `R_x=sqrt(U_x)`, full
    compound-Poisson endpoint monotonicity begins no earlier than `x=73/48`,
    not `x=3/2`. Any Pólya proof must account for the two-jump derivative
    term `+1/1152`.
22. **Anti-derivative core test:** if `Phi_{1,2}` is certified LP, evaluate
    `Phi_{1,1}(e tau_m)` at zeros `tau_m` of `Phi_{1,2}`. Alternating signs,
    plus the F42 tail, certify `Phi_{1,1}` by Rolle and the intermediate
    value theorem.
23. **Majority-atom test:** for any hard-head cosine-transform representation,
    compute the no-jump atom. If the outer atom mass exceeds the continuum
    mass, Rouché on cosine strips proves real zeros without density
    monotonicity. For `Phi_{1,1}`, the exact mass is `sqrt(2/e)`.
24. **Finite deformed-cosine test:** form
    `C_d(w)=sum (-1)^k[(d)_k/d^k]w^(2k)/(2k)!`. The finite hard-head section is
    `E C_d(sqrt(U_1)w)`. Prove or test radial dominance
    `|C_d(vz)|<|C_d(z)|` on zero-separating contours; this is the finite
    analogue of the `q^2` separation theorem.
25. **Laguerre lift test:** use
    `C_d(w)=d!/(1/2)_d L_d^{-1/2}(w^2/(4d))`. Split the dilation law by the
    threshold `u>max_j xi_j/xi_{j+1}` where Laguerre zero interlacing handles
    near-atom dilations; use atom-margin contours for the remaining tail.
26. **Endpoint-density audit:** reconstructing `h_x` from moments must satisfy
    `h_x(1-)=p_x/12` and the local slope
    `p_x[(3/2-x)/6+1/288]`. For `x=1`, values near `r=0.99` should be near
    `0.072`, not `0.010`; otherwise the reconstruction is losing the
    endpoint atom.
27. **Effective-head-lift audit:** F212's coefficient estimate certifies
    `~(log d)/pi` real head-strip zeros under
    `(R^2/2)e^R<(sqrt(8/e)-1)d`. A claim about all zeros in the disk must use
    taller contours or a stronger `sqrt(2)R` radius bound.
28. **Finite tropical monotonicity test:** for every Cauchy-profile finite
    section, check
    `log(tau_{k+1}/tau_k)=log(1+1/k)+log(1+1/(d-k))+alpha/(x+k-1)>0`.
    Any claimed bulk obstruction must therefore appear in Sturm/interlacing
    certificates, not in adjacent coefficient-ratio ordering.
29. **Lemma B Stieltjes-wall test:** on each critical wall, evaluate
    `-2 Re[z sum_m 1/(lambda_m-sz)]` for `z=(c+iy)^2`, `s=v^2`. Its
    integrated negative part controls the radial-dominance ratio; the proof
    budget is `p/(1-p)=6.031...`.
30. **First Lemma B certificate:** for `d=2`, the exact difference
    `|C_2(c+iy)|^2-|C_2(v(c+iy))|^2` factors as `(1-v^2)` times a polynomial
    nonnegative in `v^2` and `y^2`. Higher-degree certificates should imitate
    this denominator-clearing positive-polynomial form.
31. **Wall-jet cone test:** for each critical wall of
    `C_d(w)=_1F_1(-d;1/2;w^2/(4d))`, form
    `D_{d,j}(s,q)=|C_d(c_j+iy)|^2-|C_d(sqrt(s)(c_j+iy))|^2`, with
    `s=v^2` and `q=y^2`. Since `D_{d,j}(1,q)=0`, divide by `(1-s)` and expand
    `Q_{d,j}(s,q)=sum_m q^m B_{d,j,m}(s)`. The `d=2` and `d=3` certificates
    show that the useful WDW-like object is the transverse jet cone
    `B_{d,j,m}(s)>=0` on `[0,1]`, not raw coefficient positivity in `(s,q)`
    and not pointwise radial derivative monotonicity.
32. **Finite wall-jet certifier:** for `d=4,5,6,7`, reduce
    `Q_{d,j}(s,q)` modulo the exact critical-square polynomial
    `H_d(r)=P_d'(r)`, substitute each algebraic critical root by `CRootOf`,
    and run Sturm root counts for every `q`-coefficient polynomial in `s`.
    The `q^0` coefficient has the expected extra `(1-s)` endpoint factor.
    After dividing that factor, all coefficient polynomials have positive
    endpoints and zero roots in `(0,1)`. Thus the wall-jet cone is certified
    exactly for every critical wall through `d=7`.
33. **Krawtchouk wall-jet formula:** with
    `P_d(X)=sum_k a_{d,k}X^k`, the coefficient of `q^m` in
    `{|P_d(z)|^2-|P_d(sz)|^2}/(1-s)`, `z=r-q+2i sqrt(rq)`, is
    `sum_{k,l} a_{d,k}a_{d,l}r^(k+l-m)K_{k,l,m}(1-s^(k+l))/(1-s)`, where
    `K_{k,l,m}=(-1)^m[x^(2m)](1-x)^(2k)(1+x)^(2l)`. This formula reproduces
    the direct expansions and extends the exact CRootOf/Sturm certificate to
    `d=8` on all seven critical walls. The all-degree proof target becomes a
    sign-regularity, recurrence, or SOS statement for this even Krawtchouk
    transform after reducing by `H_d(r)=0`.
34. **Lemma B transverse split:** separate
    `D_d(s,q;r)=D_d(s,0;r)+(1-s)sum_{m>=1}q^mB_{d,m}`. Fable's Lemma A
    handles `D_d(s,0;r)>=0`; GPT only needs `B_{d,m}(s;r)>=0` for `m>=1`.
35. **First transverse Sonin test:** compute
    `M_d=x[P_d^2-(x/d)P_dP_d'+4x(P_d')^2]`. The first positive wall jet is
    `[q]D=(M_d(r)-M_d(sr))/r`; monotonicity of `M_d` on `[0,r]` certifies
    `B_{d,1}` without full Krawtchouk/Sturm machinery.
36. **Closed first-jet test:** certify `B_{d,1}` by checking the positive
    definiteness threshold `x<=4d(4d-1)` for `M_d'` and the Laguerre critical
    square bound `r_j=4d xi_j<4d(4d-1)`. Higher wall jets start at `m=2`.
37. **Real-axis Sonin-energy test:** certify Lemma A with
    `S_d=P_d^2+4x(P_d')^2`; the ODE gives `S_d'=(2x/d)(P_d')^2>=0`, hence
    `P_d(sr)^2<=P_d(r)^2` at every critical square `r`.
38. **Degree-9 transverse-certificate test:** for `d=9`, `H_9` has eight
    critical roots and `Q` degrees `(18,17,7)`; every `m=1..18` transverse
    coefficient passes exact CRootOf/Sturm certification on every wall.
39. **True-xi running-Bessel test:** for the actual xi head, F205 gives
    `c_j=(1/j)(1-2/(W(2j/pi)+1)+O(W^-2))`. Therefore the fixed critical
    model exponent `S_0(k)` is shifted by
    `S_xi(k)-S_0(k)=-2k log W(2k/pi)+O(k)`. This is a non-summable
    curvature deficit, so the head limit is not a small perturbation of
    `Phi_{1,1}`. The WDW lesson is that finite curvature jets can heal local
    sections while the infinite head tower still feels the integrated
    curvature drift. Xi-head zeros, if real, should be tested against a
    running phase `N(w)~wL(w)/pi`, `L(w)~W(2w/pi)`, rather than the fixed
    Bessel ruler.
40. **Direct-Hausdorff obstruction test:** if the raw xi-head coefficients
    `b_k=exp[-S_xi(k)]` form a Hausdorff moment sequence, then
    `Phi_xi(s)=sum(-1)^k b_k s^k/k!` is a positive Laplace transform
    `int e^{-us}dmu(u)` on `s>0` and has no positive real zeros. That is the
    wrong object for F211. The valid atom-Rouche mechanism requires a moment
    sequence after factoring out an oscillatory Bessel kernel. F205 shows no
    fixed Bessel kernel can work asymptotically, because
    `-log(exp[-S_xi(k)]/k!)=2k log k-2k log W(2k/pi)+O(k)`: order `1/2`,
    infinite type, and central index `nu(w)=wW(w)exp[O(1)]`.
41. **Fixed-shift Hurwitz test:** the normalized finite Jensen sections
    satisfy
    `F_{d,n}(s)=sum_{k<=d}(-1)^k((d)_k/d^k)exp[-S_n(k)]s^k/k! ->
    Phi_{xi,n}(s)` locally uniformly. Thus a genuine simple nonreal zero of
    `Phi_{xi,0}` would force nonreal zeros in sufficiently large fixed-shift
    finite sections. Hyperbolicity verified only to finite `d` does not make
    the fixed head the wrong object. Decisive audit: take one reported nonreal
    limit zero and use the argument principle on the corresponding disk for
    increasing `F_{d,0}`. This distinguishes normalization/truncation error
    from a real RH-falsification route.
42. **Finite-head cutoff test:** finite Jensen sections differ from the
    fixed head by `((d)_k/d^k)=exp[-binom(k,2)/d+O(k^3/d^2)]`. This safe
    Gaussian is large at central index `nu` unless `d>>nu^2`. Thus finite
    checks through `d≈96` only probe fixed-head zeros with central index well
    below `10`; far-out nonreal zeros of `Phi_{xi,0}` can be hidden until
    much larger degree. Test a reported nonreal zero by setting
    `d=C nu(|z0|)^2` and increasing `C`, using the argument principle rather
    than full root finding.
43. **Moving xi hard-edge scale test:** for the true xi profile, set
    `C(k)=sum_{r<=k}c_r`. The finite coefficient-ratio scale is
    `tau_{d,k}=k exp(C(k-1))/(d-k+1)`, so the active hard-head index solves
    `kappa_d exp(C(kappa_d))~=d`. F205 gives
    `C(k)=log k-2log W(2k/pi)+O(1)`, hence
    `kappa_d=Theta(sqrt(d)W(sqrt(d)))`, not just `sqrt(d)`. Around that
    moving layer,
    `tau_{d,floor(y kappa_d)}/tau_{d,kappa_d}
     =y^2[W(2kappa_d/pi)/W(2y kappa_d/pi)]^2(1+o(1))`,
    so the finite xi edge is a logarithmically slow perturbation of the
    critical Laguerre hard head. For a fixed-head zero with central index
    `nu`, distinguish the moving race scale
    `d_move~=nu^2/W(2nu/pi)^2` from the Hurwitz-transfer scale
    `d_H~=nu^2`; their ratio is `W(2nu/pi)^2`. Hyperbolicity at the first
    scale does not dismiss a genuine fixed-head nonreal zero at the second.
44. **Renormalized critical-edge test:** define the exact drift normalizer
    `L(k)=exp((H(k)-C(k))/2)`. If
    `tau_xi(d,k)=k exp(C(k-1))/(d-k+1)` and
    `tau_crit(D,k)=k exp(H(k-1))/(D-k+1)`, then with
    `D=dL(kappa-1)^2`,
    `tau_xi(d,k)/tau_crit(D,k)
     =[L(kappa-1)/L(k-1)]^2[1-(k-1)/D]/[1-(k-1)/d]` exactly. On a
    root-forming window `|k-kappa|<=A sqrt(kappa)`, F205 smoothness gives
    log-ratio error
    `O_A(1/(sqrt(kappa)W(kappa))+kappa/d)`. Thus the true xi moving edge is
    microlocally a vanishing diagonal perturbation of the critical Laguerre
    edge at effective degree `D=dL(kappa)^2`. The proof obligation becomes a
    critical-cell stability margin bound strong enough to dominate this
    perturbation.

## Consequence for the RH Quest

The broad monotone-healing lemma was false for arbitrary log-concave sequences.
This note shows why the structured WDW program is still viable:

```text
log-concavity is degree 2;
healing begins at degree 3;
the birth obstruction is the highest nonzero curvature jet;
the cure is positive curvature thickness plus slow variation.
```

The next proof target is no longer vague. For the adjacent-shift ladder, lift
the degree-3 single-wall theorem using Theorem GPT-F2. For the finite hard-head
lift, prove the all-degree wall-jet cone
`B_{d,j,m}(s)>=0` for the Laguerre critical walls. Finite exact certificates
now cover `d<=8`; the next theoretical task is to prove sign-regularity of
the even Krawtchouk wall-jet transform after critical reduction.
