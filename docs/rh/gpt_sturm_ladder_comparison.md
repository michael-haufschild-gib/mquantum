# Sturm-Ladder Criterion for Jensen Curvature Profiles

**Status:** theorem note plus open comparison program, GPT contribution.

**Purpose:** convert Fable's monotone-healing proposal into a precise
interlacing target. This does not prove RH. It proves a local mechanism:
adjacent-shift interlacing is sufficient to propagate hyperbolicity one Jensen
degree higher. Numerics suggest this interlacing condition fails exactly one
degree before the first complex pair in the pure `alpha/j` model.

## Setup

Let `a_j > 0` be a positive coefficient sequence and define alternating
Jensen sections

```text
R_d^n(t) = sum_{k=0}^d (-1)^k binom(d,k) a_{n+k} t^k.
```

The usual Jensen polynomial

```text
J_d^n(x) = sum_{k=0}^d binom(d,k) a_{n+k} x^k
```

has only negative real roots if and only if `R_d^n` has only positive real
roots.

Pascal's identity gives the exact recurrence

```text
R_{d+1}^n(t) = R_d^n(t) - t R_d^{n+1}(t).
```

## Theorem GPT-F2

Suppose `R_d^n` and `R_d^{n+1}` each have positive simple roots

```text
0 < x_1 < ... < x_d,
0 < y_1 < ... < y_d,
```

and the adjacent shift right-interlaces:

```text
x_1 < y_1 < x_2 < y_2 < ... < x_d < y_d.
```

Then `R_{d+1}^n` has `d+1` positive simple roots.

More precisely, one root lies in each interval

```text
(0, x_1),
(y_i, x_{i+1}) for 1 <= i < d,
(y_d, infinity).
```

## Proof

Write

```text
S(t) = R_{d+1}^n(t) = A(t) - t B(t),
A(t) = R_d^n(t),
B(t) = R_d^{n+1}(t).
```

Both `A(0)` and `B(0)` are positive. Since `A` has roots
`x_1<...<x_d`, its sign on `(x_i,x_{i+1})` is `(-1)^i`, and its sign
on `(x_d,infinity)` is `(-1)^d`. Similarly for `B` with roots `y_i`.

First,

```text
S(0) = A(0) > 0,
S(x_1) = -x_1 B(x_1) < 0,
```

because `x_1 < y_1`, so `B(x_1)>0`. Hence `S` has a positive root in
`(0,x_1)`.

For `1 <= i < d`,

```text
S(y_i) = A(y_i),
S(x_{i+1}) = -x_{i+1} B(x_{i+1}).
```

The interlacing puts `y_i` inside `(x_i,x_{i+1})`, so
`A(y_i)` has sign `(-1)^i`. It also puts `x_{i+1}` inside
`(y_i,y_{i+1})`, so `B(x_{i+1})` has sign `(-1)^i`, and therefore
`S(x_{i+1})` has sign `(-1)^{i+1}`. The signs are opposite, so `S`
has a root in `(y_i,x_{i+1})`.

Finally,

```text
S(y_d) = A(y_d)
```

has sign `(-1)^d`, because `y_d > x_d`. The leading coefficient of
`S=R_{d+1}^n` is `(-1)^{d+1} a_{n+d+1}`, so `S(t)` has sign
`(-1)^{d+1}` for sufficiently large positive `t`. Thus `S` has a
root in `(y_d,infinity)`.

We have found `d+1` distinct positive roots of a degree-`d+1`
polynomial, so all roots are positive and simple.

## Theorem GPT-F3: Exact Jensen Ladder Equivalence

For genuine Jensen sections, Theorem GPT-F2 is not merely sufficient. It is
also necessary.

Let

```text
S(t) = R_{d+1}^n(t),
A(t) = R_d^n(t),
B(t) = R_d^{n+1}(t).
```

Then

```text
S(t) = A(t) - tB(t),
B(t) = -S'(t)/(d+1),
A(t) = S(t) - tS'(t)/(d+1).
```

Assume `S=R_{d+1}^n` has `d+1` simple positive roots

```text
0 < r_1 < r_2 < ... < r_{d+1}.
```

Then `B=R_d^{n+1}` has simple positive roots

```text
y_i in (r_i, r_{i+1}),        1 <= i <= d,
```

and `A=R_d^n` has simple positive roots

```text
x_i in (r_i, y_i),            1 <= i <= d.
```

Consequently,

```text
x_1 < y_1 < x_2 < y_2 < ... < x_d < y_d.
```

Combining this necessity with Theorem GPT-F2 gives the exact equivalence:

```text
R_{d+1}^n has positive simple roots

if and only if

R_d^n and R_d^{n+1} have positive simple roots and
R_d^n right-interlaces R_d^{n+1}.
```

### Proof

The derivative identity follows from

```text
k binom(d+1,k) = (d+1) binom(d,k-1).
```

Thus

```text
(R_{d+1}^n)'(t)
  = -(d+1) R_d^{n+1}(t).
```

By Rolle's theorem, `B=-S'/(d+1)` has one simple root
`y_i in (r_i,r_{i+1})`.

Since `S(0)>0`, the sign of `S` on `(r_i,r_{i+1})` is `(-1)^i`, and
`S'(r_i)` has sign `(-1)^i`. Hence

```text
B(r_i) = -S'(r_i)/(d+1)
```

has sign `(-1)^{i+1}`. At `r_i`,

```text
A(r_i) = S(r_i) + r_i B(r_i) = r_i B(r_i),
```

so `A(r_i)` has sign `(-1)^{i+1}`. At `y_i`,

```text
A(y_i) = S(y_i),
```

because `B(y_i)=0`; this has sign `(-1)^i`. Thus `A` changes sign
on every interval `(r_i,y_i)`, so it has a root `x_i` there. Since
`A` has degree `d`, these are all its roots. The displayed
right-interlacing follows immediately.

The reverse implication is exactly Theorem GPT-F2.

### Consequence

The Sturm ladder is not a heuristic diagnostic. For Jensen sections, it is the
exact degree recursion:

```text
degree d+1 hyperbolicity
  <=> degree d adjacent-shift right-interlacing.
```

Therefore the RH/Jensen curvature program can be reframed without loss:

```text
prove one-way healing of adjacent-shift right-interlacing under the WDW
curvature flow.
```

## Theorem GPT-F4: Collision Wall Is the Adjacent-Section Resultant

Keep

```text
S(t,lambda)=R_{d+1}^{n,lambda}(t),
A(t,lambda)=R_d^{n,lambda}(t),
B(t,lambda)=R_d^{n+1,lambda}(t).
```

Then

```text
S=A-tB,
S_t=-(d+1)B.
```

Therefore a positive number `tau` is a multiple root of `S` if and only if

```text
A(tau,lambda)=0,
B(tau,lambda)=0.
```

Equivalently, the degree-`d+1` discriminant wall has the same vanishing locus
as the adjacent-section resultant

```text
Res_t(R_d^{n,lambda}, R_d^{n+1,lambda}) = 0.
```

At a simple fold collision, where `A` and `B` have a simple common positive
root `tau`, the WDW fold sign can be written purely in adjacent-section data:

```text
-S_lambda(tau,lambda) / S_tt(tau,lambda)
  =
  (A_lambda(tau,lambda) - tau B_lambda(tau,lambda))
  / ((d+1) B_t(tau,lambda)).
```

The colliding roots are real on the side where this quantity times
`(lambda-lambda_0)` is positive.

### Proof

The first statement follows immediately from

```text
S(tau)=0, S_t(tau)=0
  <=> A(tau)-tau B(tau)=0, B(tau)=0
  <=> A(tau)=B(tau)=0.
```

Thus `S` and `S_t` have a common root exactly when `A` and `B` have a common
root, which is the resultant statement.

For the fold sign, differentiate `S=A-tB` with respect to `lambda` and use
`S_tt=-(d+1)B_t`. The standard double-root normal form gives

```text
t = tau +/- sqrt(
      -2 S_lambda(tau,lambda_0) / S_tt(tau,lambda_0)
      * (lambda-lambda_0)
    )
    + O(lambda-lambda_0).
```

Substitution gives the displayed adjacent-section formula.

### Consequence

The healing boundary is no longer an opaque root collision of a degree-`d+1`
polynomial. It is the common-root wall of two adjacent degree-`d` sections:

```text
R_d^{n,lambda} and R_d^{n+1,lambda} share a positive root.
```

For structured profiles, the proof target becomes:

```text
show that every positive common-root crossing of adjacent sections has the
healing fold sign, and that after crossing the right-interlacing order cannot
be lost again.
```

## Theorem GPT-F5: Fold Sign Equals Adjacent Root Gap Velocity

Keep the setup of GPT-F4. Suppose `A` and `B` have a simple common positive
root at `(tau,lambda_0)`. Let

```text
x(lambda)  be the nearby root of A,
y(lambda)  be the nearby root of B,
x(lambda_0)=y(lambda_0)=tau.
```

Then

```text
-S_lambda(tau,lambda_0) / S_tt(tau,lambda_0)
  = tau/(d+1) * (y'(lambda_0) - x'(lambda_0)).
```

Consequently, increasing `lambda` heals this local interlacing crossing exactly
when

```text
y'(lambda_0) - x'(lambda_0) > 0,
```

that is, when the `B=R_d^{n+1}` root moves to the right of the matching
`A=R_d^n` root.

### Proof

At the common root, GPT-F4 gives

```text
A_t(tau,lambda_0) = tau B_t(tau,lambda_0),
```

because

```text
A = S - tS_t/(d+1),   B = -S_t/(d+1).
```

The simple-root velocity formula gives

```text
x' = -A_lambda/A_t,
y' = -B_lambda/B_t.
```

Therefore

```text
y' - x'
  = -B_lambda/B_t + A_lambda/(tau B_t)
  = (A_lambda - tau B_lambda)/(tau B_t).
```

GPT-F4 also gives

```text
-S_lambda/S_tt
  = (A_lambda - tau B_lambda)/((d+1)B_t).
```

Combining the two identities proves the formula.

### Consequence

The fold-sign conjecture is exactly a root-order velocity statement. The
one-way healing theorem for structured profiles can be stated as:

```text
at every positive common-root event of R_d^n and R_d^{n+1},
the adjacent-shift root gap y_i(lambda)-x_i(lambda) crosses from negative
to positive as lambda increases.
```

This is the most local possible form of the WDW censorship mechanism.

## Theorem GPT-F6: Gap Velocity Is Curvature-Only

The local crossing sign from GPT-F5 is invariant under affine changes of the
log-coefficients. Therefore it depends only on the local curvature window.

For a fixed `(d,n)`, write `ell_j=log a_j` and define the affine-free local
logs

```text
eta_k = ell_{n+k} - ell_n - k(ell_{n+1}-ell_n),       0 <= k <= d+1.
```

Use the normalized variable

```text
s = exp(lambda(ell_{n+1}-ell_n)) t.
```

Define

```text
tilde A(s,lambda)
  = sum_{k=0}^d (-1)^k binom(d,k) exp(lambda eta_k) s^k,

tilde B(s,lambda)
  = sum_{k=0}^d (-1)^k binom(d,k) exp(lambda eta_{k+1}) s^k.
```

If `x(lambda)` and `y(lambda)` are matching adjacent roots in `t`, and
`tilde x(lambda)=exp(lambda(ell_{n+1}-ell_n))x(lambda)`,
`tilde y(lambda)=exp(lambda(ell_{n+1}-ell_n))y(lambda)`, then at a common-root
event

```text
sign(y'-x') = sign(tilde y'-tilde x').
```

At a normalized common root `sigma`,

```text
tilde y' - tilde x'
  =
  (tilde A_lambda(sigma) - sigma tilde B_lambda(sigma))
  / (sigma tilde B_s(sigma)).
```

Finally, the `eta_k` are determined purely by curvature. With

```text
c_j = log(a_j^2/(a_{j-1}a_{j+1})),
```

one has

```text
eta_0 = eta_1 = 0,
eta_k = - sum_{r=1}^{k-1} (k-r)c_{n+r},       k >= 2.
```

Thus every adjacent-root gap velocity is a finite, curvature-only expression
in

```text
c_{n+1}, c_{n+2}, ..., c_{n+d}.
```

### Proof

The affine decomposition

```text
ell_{n+k} = ell_n + k(ell_{n+1}-ell_n) + eta_k
```

gives

```text
R_d^{n,lambda}(t)
  = exp(lambda ell_n) tilde A(s,lambda),

R_d^{n+1,lambda}(t)
  = exp(lambda ell_n + lambda(ell_{n+1}-ell_n)) tilde B(s,lambda),
```

with `s=exp(lambda(ell_{n+1}-ell_n))t`. Therefore roots are related by
`tilde x=exp(lambda(ell_{n+1}-ell_n))x` and similarly for `y`. At a common
root `x=y`, the shared scaling drift cancels in the gap:

```text
tilde y' - tilde x'
  = exp(lambda(ell_{n+1}-ell_n))(y'-x').
```

The normalized sections still satisfy

```text
tilde S = tilde A - s tilde B,
tilde S_s = -(d+1)tilde B.
```

Hence GPT-F5 applies in the normalized variable and gives the displayed
velocity formula.

For the curvature formula, note that

```text
eta_{k+1}-2eta_k+eta_{k-1} = -c_{n+k},
eta_0=eta_1=0.
```

Solving this second-difference recurrence gives

```text
eta_k = - sum_{r=1}^{k-1}(k-r)c_{n+r}.
```

### Consequence

The local proof target no longer contains arbitrary coefficient slope or
normalization data. For `alpha/(j+b)` and xi-like profiles, one must prove
positivity of a curvature-only velocity functional at every positive
common-root event.

## Theorem GPT-F7: Explicit Curvature Kernel for the Crossing Velocity

Keep the normalized notation of GPT-F6 and set

```text
tilde S(s,lambda)=tilde A(s,lambda)-s tilde B(s,lambda).
```

Then

```text
tilde S(s,lambda)
  = sum_{j=0}^{d+1} (-1)^j binom(d+1,j)
      exp(lambda eta_j) s^j.
```

At a normalized common-root event `s=sigma`,

```text
tilde y' - tilde x'
  = tilde S_lambda(sigma,lambda)
    / (sigma tilde B_s(sigma,lambda)).
```

Moreover,

```text
tilde S_lambda(sigma,lambda)
  = sum_{r=1}^d c_{n+r} K_r(sigma,lambda),
```

where the finite curvature kernels are

```text
K_r(sigma,lambda)
  =
  - sum_{j=r+1}^{d+1}
      (j-r)(-1)^j binom(d+1,j)
      exp(lambda eta_j) sigma^j.
```

Thus the exact local crossing condition is

```text
sign(tilde y'-tilde x')
  =
  sign( sum_{r=1}^d c_{n+r}K_r )
  * sign( sigma tilde B_s ) .
```

If the common root is the `i`th positive root of `tilde B`, then

```text
sign(tilde B_s)=(-1)^i,
```

so healing at that crossing is equivalent to

```text
(-1)^i sum_{r=1}^d c_{n+r}K_r > 0.
```

### Proof

The first displayed formula follows from Pascal's identity:

```text
binom(d,j)+binom(d,j-1)=binom(d+1,j).
```

At a common root, GPT-F6 gives

```text
tilde y'-tilde x'
  = (tilde A_lambda - sigma tilde B_lambda)/(sigma tilde B_s)
  = tilde S_lambda/(sigma tilde B_s).
```

Now insert

```text
eta_j = -sum_{r=1}^{j-1}(j-r)c_{n+r}
```

into

```text
tilde S_lambda
  = sum_{j=0}^{d+1} (-1)^j binom(d+1,j)
      eta_j exp(lambda eta_j) sigma^j.
```

Interchanging the finite sums gives the kernel formula.

Finally, if

```text
tilde B(s)=prod_{m=1}^d (1-s/y_m)
```

with `0<y_1<...<y_d`, then

```text
sign(tilde B_s(y_i))=(-1)^i.
```

This proves the sign criterion.

### Consequence

The remaining sign problem has a concrete finite form. For
`c_j=alpha/(j+b)`, the numerator at any crossing is

```text
alpha sum_{r=1}^d K_r/(n+b+r).
```

The whole monotone-healing conjecture is reduced to proving the alternating
kernel inequality above at every positive common-root event.

## Theorem GPT-F8: Positive Curvature Alone Does Not Force Healing

The curvature-kernel sign condition is not automatically positive for all
positive curvature windows. Already at the first unsolved ladder level
`d=3`, there is an exact positive-curvature anti-healing common-root event.

Work in affine-normalized coordinates at `lambda=1`. Let

```text
p = exp(eta_2) = 1/50,
q = exp(eta_3) = 301/1000000,
r = exp(eta_4) = 403/100000000.
```

Define adjacent cubic sections

```text
A(s) = 1 - 3s + 3p s^2 - q s^3,
B(s) = 1 - 3p s + 3q s^2 - r s^3,
```

and the next Jensen section

```text
S(s) = A(s) - sB(s)
     = 1 - 4s + 6p s^2 - 4q s^3 + r s^4.
```

Then `A` and `B` share the positive root

```text
sigma = 100.
```

The exact factorizations are

```text
A(s) = -(s-100)(301s^2 - 29900s + 10000)/1000000,
B(s) = -(s-100)(403s^2 - 50000s + 1000000)/100000000,
S(s) = (s-100)^2(403s^2 - 39800s + 10000)/100000000.
```

All roots of `A` and `B` are positive and simple. The local curvatures are
positive:

```text
c_1 = log(50) > 0,
c_2 = log(400/301) > 0,
c_3 = log(90601/80600) > 0.
```

However, the adjacent-root gap velocity is negative. Indeed,

```text
B_s(100) = -3/10000,
S_lambda(100)
  = -1200 log 50
    +1204 log(1000000/301)
    -403 log(100000000/403)
  > 0.
```

The last inequality is exact: it is equivalent to

```text
(1000000)^1204 * 403^403
  >
301^1204 * 50^1200 * (100000000)^403,
```

whose left and right sides have bit lengths `27486` and `27396`,
respectively. Therefore

```text
y' - x' = S_lambda(100)/(100 B_s(100)) < 0.
```

So increasing `lambda` moves the `B` root left of the matching `A` root. This
is an anti-healing crossing despite strictly positive local curvature.

### Consequence

The monotone-healing theorem cannot be true for arbitrary positive curvature
windows. The remaining viable proof target must use additional structure:

```text
c_j = alpha/(j+b),
```

xi-like slow variation, PF-infinity-type constraints, or an equivalent
regularity condition. Positive curvature thickness alone is not enough.

## Theorem GPT-F9: Large-Shift `alpha/(j+b)` Degree-4 Crossing Heals

The obstruction in GPT-F8 does not occur on the large-shift `alpha/(j+b)`
curve at the first higher ladder level. There is an asymptotic common-root
branch for adjacent cubic sections, and its gap velocity is positive.

Let

```text
c_{n+r} = beta/(x+r-1),       r=1,2,3,
x = n+b+1,
h = 1/x.
```

For the adjacent cubic sections

```text
A(s)=1-3s+3p s^2-q s^3,
B(s)=1-3p s+3q s^2-r s^3,
```

with

```text
p = exp(-beta/x),
q = exp(-2beta/x - beta/(x+1)),
r = exp(-3beta/x - 2beta/(x+1) - beta/(x+2)),
```

there is a positive common-root branch of the form

```text
beta = a h + O(h^2),
sigma = 1 + z h + O(h^2),
```

where `z` is the unique real root of

```text
6z^3 - 12z^2 + 9z - 2 = 0,
```

and

```text
a = z^3/(3z-1).
```

Numerically,

```text
z = 0.373461706729200...,
a = 0.432678606330554....
```

Along this branch, the normalized adjacent-root gap velocity satisfies

```text
tilde y' - tilde x'
  = C h^2 + O(h^3),
```

where

```text
C = 2z(3z^2 - 3z + 1)/(3(3z-1))
  = 0.616382741508307... > 0.
```

Thus this large-shift `alpha/(j+b)` crossing heals.

### Proof

Set

```text
beta = a h + O(h^2),
sigma = 1 + z h + O(h^2).
```

Expanding `A(sigma)=0` and `B(sigma)=0` gives

```text
A(sigma) = h^3[a(3z-1)-z^3] + O(h^4),
B(sigma) = h^3[a(3z-1)-z^3] + O(h^4).
```

The next independent condition is the `h^4` coefficient of `B-A`, which gives

```text
a(-3a + 3z^2 - 3z + 2)=0.
```

The nonzero solution satisfies

```text
a = z^3/(3z-1),
6z^3 - 12z^2 + 9z - 2 = 0.
```

At the positive real root above, the Jacobian of the two leading equations
with respect to `(a,z)` equals

```text
1.102224811066523... != 0,
```

so the implicit-function theorem gives an actual nearby common-root branch.

On that branch, the gap velocity formula from GPT-F7 expands to

```text
tilde y' - tilde x'
  =
  [2z(3z^2 - 3z + 1)/(3(3z-1))] h^2
  + O(h^3),
```

which is positive at the same root.

### Consequence

The exact anti-healing obstruction GPT-F8 shows positive curvature is too weak.
GPT-F9 shows the structured `alpha/(j+b)` curve has the expected healing sign
in the large-shift first higher crossing. The next proof target is to remove
the large-shift restriction and then lift the argument from adjacent cubics to
all degrees.

## Theorem GPT-F10: Tail Laguerre-Polya Criterion and Laguerre Anchor

For any positive sequence `a_j`, define the tail exponential generating
function

```text
F_n(z) = sum_{k>=0} a_{n+k} z^k/k!.
```

Assume `F_n` is entire. Then the following are equivalent:

```text
all R_d^n(t) have only positive real roots, for every d >= 0,
```

and

```text
F_n belongs to the Laguerre-Polya class with all zeros on the negative real
axis.
```

This is the classical Jensen theorem applied to the shifted coefficient tail:
the degree-`d` Jensen polynomial of `F_n` is

```text
J_d^n(x) = sum_{k=0}^d binom(d,k) a_{n+k} x^k,
```

and

```text
R_d^n(t) = J_d^n(-t).
```

Thus all-degree survival of a curvature profile is exactly a tailwise
Laguerre-Polya property, not only a finite-root phenomenon.

For the Laguerre anchor

```text
a_j = 1/j!,
```

one has the exact identity

```text
R_d^n(t)
  = sum_{k=0}^d (-1)^k binom(d,k) t^k/(n+k)!
  = d!/(n+d)! * L_d^{(n)}(t),
```

where `L_d^{(n)}` is the generalized Laguerre polynomial. Hence every
`R_d^n` has positive roots. Equivalently,

```text
F_n(z) = sum_{k>=0} z^k/(k!(n+k)!)
       = z^{-n/2} I_n(2 sqrt z),
```

so `F_n(-x)=x^{-n/2}J_n(2 sqrt x)` and the zeros are negative because Bessel
`J_n` has positive real zeros.

### Consequence

Fable's proposed comparison route can now be stated sharply:

```text
prove that the alpha=1, b=0 curvature profile is tailwise Laguerre-Polya
for every n.
```

That would prove `d*(1,0)=infinity`. The hard opposite direction remains:
prove that every `alpha<1` profile eventually leaves the tailwise
Laguerre-Polya class.

## Theorem GPT-F11: Cauchy-Curvature Normal Form and Laguerre Barycenter

Normalize away affine coefficient data by setting

```text
ell_0 = ell_1 = 0,
c_j = 2ell_j - ell_{j-1} - ell_{j+1}.
```

For the structured profile

```text
c_j = alpha/(j+b),        b > -1,
```

the normalized log coefficients are exactly

```text
ell_k
  = -alpha sum_{r=1}^{k-1} (k-r)/(r+b)
  = -alpha[(k+b)(psi(k+b)-psi(1+b)) - (k-1)],
```

where `psi` is the digamma function.

### Proof

Let `delta_j=ell_j-ell_{j-1}`. Since

```text
c_j = delta_j - delta_{j+1},
```

and `delta_1=0` under the normalization,

```text
delta_k = -sum_{r=1}^{k-1} c_r,
ell_k = -sum_{r=1}^{k-1} (k-r)c_r.
```

Substituting `c_r=alpha/(r+b)` gives the first formula. The second follows
from

```text
sum_{r=1}^{k-1} 1/(r+b) = psi(k+b)-psi(1+b),
sum_{r=1}^{k-1} r/(r+b)
  = (k-1)-b(psi(k+b)-psi(1+b)).
```

For the Laguerre anchor `a_k=1/k!`,

```text
c_j^Lag = log(1+1/j).
```

But

```text
log(1+1/j) = int_0^1 db/(j+b).
```

Therefore, by linearity of the inverse curvature map,

```text
ell_k^Lag
  = int_0^1 ell_k^{alpha=1,b} db
  = -log(k!).
```

The pointwise curvature gap between the `alpha=1,b=0` profile and the
Laguerre anchor is the exact positive kernel

```text
1/j - log(1+1/j)
  = int_0^1 b/(j(j+b)) db
  > 0.
```

### Consequence

The comparison theorem must not say arbitrary pointwise curvature domination
preserves hyperbolicity; GPT-F8 disproves that. The viable sharpened target is
the specific structured deformation

```text
c_j^Lag = int_0^1 db/(j+b)
    -->  c_j^{alpha=1,b=0}=1/j,
```

or an equivalent theorem for the completely-monotone curvature gap

```text
e_j = 1/j - log(1+1/j).
```

If adding this gap to the Laguerre anchor preserves the tailwise
Laguerre-Polya property in GPT-F10, then the measured `alpha_c=1` upper edge
has a theorem-level explanation. This is much narrower than the false
"more curvature is always safer" principle and is not contradicted by the
anti-healing certificate.

## Theorem GPT-F12: Stieltjes-Transform Form of the Kernel Inequality

At a positive adjacent-section common-root event, keep the curvature kernels
from GPT-F7:

```text
N(c) = sum_{r=1}^d c_{n+r}K_r.
```

Suppose the local curvature window is a positive Stieltjes mixture of Cauchy
kernels:

```text
c_{n+r} = int_B dmu(b)/(n+r+b),        r=1,...,d,
```

where `mu` is a positive finite measure supported where all denominators are
positive. Then the crossing numerator is exactly

```text
N(c) = int_B Phi(b) dmu(b),
```

where

```text
Phi(b) = sum_{r=1}^d K_r/(n+r+b).
```

Thus the whole structured curvature problem at that crossing is reduced to
the sign of one rational Stieltjes transform `Phi`.

Equivalently, on any interval avoiding the poles, multiply by the positive
denominator

```text
D(b) = prod_{r=1}^d (n+r+b)
```

and check the degree-`d-1` polynomial

```text
Q(b) = D(b)Phi(b)
     = sum_{r=1}^d K_r prod_{m!=r}(n+m+b).
```

On `b>=0`, `D(b)>0`, so `Phi(b)` and `Q(b)` have the same sign.

### Proof

Substitute the Stieltjes representation of `c_{n+r}` into GPT-F7's kernel
formula and interchange the finite sum with the measure integral:

```text
sum_{r=1}^d K_r int_B dmu(b)/(n+r+b)
  = int_B [sum_{r=1}^d K_r/(n+r+b)] dmu(b).
```

The polynomial form follows by clearing the positive denominator `D(b)`.

### Important Specializations

For the `alpha/(j+b_0)` profile,

```text
c_{n+r}=alpha/(n+r+b_0),
N_alpha,b0 = alpha Phi(b_0).
```

For the Laguerre anchor,

```text
c_{n+r}^{Lag}=log(1+1/(n+r))
             = int_0^1 db/(n+r+b),
```

hence

```text
N_Lag = int_0^1 Phi(b) db
      = sum_{r=1}^d K_r log((n+r+1)/(n+r)).
```

For the critical head profile,

```text
c_{n+r}^{crit}=1/(n+r),
N_crit = Phi(0) = sum_{r=1}^d K_r/(n+r).
```

The exact excess from Laguerre to the critical profile is therefore

```text
N_crit - N_Lag
  = int_0^1 [Phi(0)-Phi(b)] db
  = sum_{r=1}^d K_r[
      1/(n+r) - log((n+r+1)/(n+r))
    ].
```

### Consequence

The comparison theorem can be made local and finite:

```text
if Phi(b)>0 on the support of the curvature measure at every positive
common-root event, then that event is healing.
```

For the Laguerre-to-critical route, a still sharper sufficient condition at
each event is:

```text
int_0^1 Phi(b)db > 0
and
Phi(0) >= int_0^1 Phi(b)db.
```

The first inequality is the Laguerre anchor sign; the second says the
critical endpoint is no worse than the Laguerre average for that event. A
stronger, easier-to-referee condition is monotonicity:

```text
Phi(0) >= Phi(b) for 0<=b<=1.
```

This is not claimed as proved. It is the finite rational inequality that
would turn Fable's `alpha_c=1` boundary into a theorem without invoking any
false pointwise-curvature principle.

## Theorem GPT-F13: Polynomial Certificates for the Laguerre-to-Critical Step

Continue with the notation of GPT-F12 and put

```text
a_r = n+r,
D(b) = prod_{r=1}^d (a_r+b).
```

Define three explicit polynomials:

```text
Q_0(b) = D(b)Phi(b)
       = sum_{r=1}^d K_r prod_{m!=r}(a_m+b),
```

```text
Q_1(b) = D(b) * [Phi(0)-Phi(b)]/b
       = sum_{r=1}^d (K_r/a_r) prod_{m!=r}(a_m+b),
```

with the value at `b=0` understood by continuity, and

```text
Q_der(b) = D(b)^2 * [-Phi'(b)]
         = sum_{r=1}^d K_r prod_{m!=r}(a_m+b)^2.
```

Since `D(b)>0` on `b>=0`, the following are exact:

```text
Phi(b)>0 on [0,1]
  <=> Q_0(b)>0 on [0,1],
```

```text
Phi(0)>=Phi(b) on [0,1]
  <=> Q_1(b)>=0 on [0,1],
```

and

```text
Q_der(b)>=0 on [0,1]  =>  Phi(0)>=Phi(b) on [0,1].
```

The last condition is stronger but often easier to certify, because it is
ordinary monotonicity of `Phi`.

### Proof

The first identity is GPT-F12. For the second, compute

```text
Phi(0)-Phi(b)
  = sum_r K_r[1/a_r - 1/(a_r+b)]
  = b sum_r K_r/[a_r(a_r+b)].
```

Multiplying the bracketed rational function by `D(b)` gives `Q_1(b)`. The
denominator is positive on `[0,1]`, so signs agree. Finally,

```text
-Phi'(b) = sum_r K_r/(a_r+b)^2,
```

and multiplication by `D(b)^2` gives `Q_der`. If `-Phi'(b)>=0` throughout
`[0,1]`, then `Phi` is nonincreasing there, hence `Phi(0)>=Phi(b)`.

### Consequence

The local Laguerre-to-critical comparison has a strict finite audit path:

```text
Q_0(b)>0 and Q_1(b)>=0 on 0<=b<=1
```

imply

```text
N_Lag = int_0^1 Phi(b)db > 0,
N_crit = Phi(0) >= N_Lag.
```

Thus a crossing that heals for the Laguerre average also heals for the
critical `1/j` endpoint. If Fable's referee instrument sees these polynomial
signs at all relevant structured crossings, the empirical `alpha_c=1` edge
has been reduced to a concrete Sturm-polynomial positivity theorem.

## Theorem GPT-F14: Degree-3 Critical Edge Is Healed at `lambda=1`

For the critical Cauchy profile

```text
c_j = 1/j,
```

every degree-3 Jensen window is hyperbolic at physical scale `lambda=1`.
Equivalently, for every `x>=1`, the normalized degree-3 section with

```text
c_0 = 1/x,
c_1 = 1/(x+1)
```

has three positive real roots at `lambda=1`, and the adjacent degree-2
sections right-interlace.

### Proof

This is Theorem 11 in `docs/rh/gpt_wdw_curvature_jets.md`. The core
reduction is:

```text
u = exp(-1/x),      w = exp(-1/(x+1)),
a = sqrt(1-u),      b = sqrt(1-w).
```

By the exact degree-3 Sturm wall, hyperbolicity is equivalent to

```text
a-b <= ab.
```

With

```text
q = 1/(x+1),
p = 1/x = q/(1-q),
0<q<=1/2,
```

the mean-value bound for `h(t)=sqrt(1-exp(-t))` gives

```text
a-b <= (p-q)exp(-q)/(2b).
```

The target follows from the elementary chain

```text
p-q = q^2/(1-q),
exp(q) >= 1+q,
1-exp(-q) >= q-q^2/2,
```

and the exact polynomial inequality

```text
4(1-q^2)^2(1-q/2)^3 - q >= 0,      0<=q<=1/2.
```

The last inequality is Sturm-certified over `QQ`: its derivative has no roots
on `[0,1/2]`, is negative there, and the endpoint value is `115/256`.

### Consequence

The first nontrivial `alpha_c=1` case is now theorem-level, not numerical:
the critical profile is on the healed side at degree 3 for all shifts. The
open work is precisely the higher-degree lift via GPT-F13 polynomial
certificates.

## Theorem GPT-F15: Degree-3 Safe Half-Plane `alpha>=1`

For the Cauchy curvature family

```text
c_j = alpha/(j+b),
```

all degree-3 shifted Jensen sections are hyperbolic at `lambda=1` whenever

```text
alpha>=1,       b>=0.
```

### Proof

Put

```text
x=n+b+1>=1,
c_0^*=1/x,
c_1^*=1/(x+1).
```

GPT-F14 proves the critical case `(c_0^*,c_1^*)` is healed at WDW time
`lambda=1`. The `alpha`-scaled degree-3 window at physical scale `lambda=1`
is the same normalized two-curvature jet at WDW time `lambda=alpha`.

The degree-3 wall is unique and one-way by Theorem 6 of
`docs/rh/gpt_wdw_curvature_jets.md`; once the section is healed, increasing
WDW time cannot unheal it. Since `alpha>=1`, the scaled window is on or beyond
the healed critical state.

### Consequence

At degree 3, the empirical `alpha_c=1` safe side is now proved exactly:

```text
alpha>=1, b>=0  =>  degree-3 Sturm ladder is healed for every shift.
```

The remaining conjectural content of `alpha_c=1` begins at degree 4 and above.

## Theorem GPT-F16: Exact Degree-3 Threshold Function

For

```text
c_j = alpha/(j+b),
x = n+b+1 >= 1,
```

the degree-3 shifted section at physical scale `lambda=1` has an exact
threshold

```text
alpha_3(x) = z_x * x(x+1)/(2x+1),
```

where `z_x` is the unique positive root of

```text
F_x(z)
  = 3
    - 4exp(-((x+1)/(2x+1))z)
    - 4exp(-(x/(2x+1))z)
    + 6exp(-z)
    - exp(-2z).
```

The section is hyperbolic iff

```text
alpha >= alpha_3(x).
```

Also,

```text
alpha_3(x) = 1/(4x) + O(1/x^2).
```

### Proof

This is Theorem 13 in `docs/rh/gpt_wdw_curvature_jets.md`. The reduction is
the degree-3 wall equation with

```text
s = alpha(2x+1)/(x(x+1)),
p = (x+1)/(2x+1),
z = lambda s.
```

At physical scale `lambda=1`, the unique wall is crossed exactly when

```text
alpha(2x+1)/(x(x+1)) >= z_x.
```

The asymptotic follows from the slow-variation wall formula

```text
lambda_3 = 2Delta^2/s^3 + O(Delta^4/s^5)
```

with

```text
s = (2x+1)/(x(x+1)),
Delta = 1/(x(x+1)).
```

### Consequence

Degree 3 has a receding section-wise boundary of order `1/(4x)`, far below
the observed all-degree edge `alpha_c=1`. Thus the `alpha_c=1` phenomenon is
not a cubic obstruction; it is a higher-degree accumulation effect.

## Theorem GPT-F17: Large-Shift Degree-4 Wall Constant

For

```text
c_j = alpha/(j+b),
x=n+b+1,
h=1/x,
```

the large-shift degree-4 adjacent-cubic common-root branch from GPT-F9 has

```text
alpha_4^{wall}(x) = a_4 h + O(h^2),
```

where `a_4` is the unique positive root of

```text
108a^3 - 108a^2 + 45a - 8 = 0.
```

Numerically,

```text
a_4 = 0.432678606330554....
```

The branch is healing.

### Proof

GPT-F9 gives the branch in the form

```text
alpha = a h + O(h^2),
sigma = 1 + z h + O(h^2),
```

where

```text
6z^3 - 12z^2 + 9z - 2 = 0,
a = z^3/(3z-1).
```

Eliminating `z` gives the cubic for `a_4` above. The healing sign is exactly
the positive GPT-F9 gap-velocity coefficient

```text
2z(3z^2 - 3z + 1)/(3(3z-1))
  = 0.616382741508307... > 0.
```

### Consequence

Together with GPT-F16,

```text
alpha_3(x) = 1/(4x) + O(1/x^2),
alpha_4^{wall}(x) = a_4/x + O(1/x^2),
```

so

```text
alpha_4^{wall}(x)/alpha_3(x) -> 4a_4
  = 1.73071442532221....
```

Thus the wall constants increase from degree 3 to degree 4 while both fixed
low-degree walls still retreat as `1/x`.

## Theorem GPT-F18: Fixed-Degree Cauchy Edge Normal Form

For fixed degree `d`, put

```text
x=n+b+1,
h=1/x,
alpha=A h+o(h),
c_{n+r}=alpha/(n+b+r).
```

Let `P_{d,h}^A` be the affinely normalized degree-`d` section. Then

```text
h^{-d} P_{d,h}^A(1+hX)
  -> H_d^A(X),
```

where

```text
H_d^A(X)=exp(A L_d)(-X)^d,
L_d=sum_{m=2}^d (-1)^{m-1} partial_X^m/[m(m-1)].
```

### Proof

Theorem 9 gives

```text
Delta^m ell_n
  = (-1)^{m-1} alpha(m-2)!/(x)_{m-1}.
```

With `alpha=Ah+o(h)`, this is

```text
Delta^m ell_n
  = (-1)^{m-1}A(m-2)!h^m+o(h^m).
```

The WDW generator is

```text
sum_{m=2}^d Delta^m ell_n binom(E,m).
```

Near the collapsed root, `s=1+hX`, and

```text
h^m binom(E,m) -> partial_X^m/m!.
```

Since `(1-s)^d=h^d(-X)^d`, the limit follows.

### Checks

The first two edge polynomials are

```text
H_3^A(X) = -X^3 + 3AX - A,
Disc(H_3^A)=27A^2(4A-1),
```

and

```text
H_4^A(X)=X^4-6AX^2+4AX+3A^2-2A,
Disc(H_4^A)=256A^3(108A^3-108A^2+45A-8).
```

Thus GPT-F16 and GPT-F17 are the first two cases of one edge-normal-form
mechanism.

### Consequence

For fixed `d`, the large-shift wall has the form

```text
alpha_d(x)=A_d/x+o(1/x),
```

where `A_d` is read from the hyperbolicity boundary of `H_d^A`. The all-degree
`alpha_c=1` question is now sharpened to the growth law of these constants
`A_d`.

## Theorem GPT-F19: Edge Appell Generating Function

The edge polynomials from GPT-F18 satisfy

```text
sum_{d>=0} H_d^A(X)t^d/d!
  =
  exp(-Xt - A[t+(1-t)log(1-t)]).
```

Consequently,

```text
partial_X H_d^A(X) = -d H_{d-1}^A(X).
```

### Proof

The Cauchy edge generator is

```text
L=sum_{m>=2}(-1)^{m-1}partial_X^m/[m(m-1)].
```

Its formal symbol is

```text
sum_{m>=2} (-1)^{m-1}y^m/[m(m-1)]
  = y-(1+y)log(1+y).
```

Acting on `exp(-Xt)` means substituting `y=-t`, hence

```text
L exp(-Xt)
  = [-t-(1-t)log(1-t)] exp(-Xt).
```

Applying `exp(AL)` to

```text
exp(-Xt)=sum_d (-X)^d t^d/d!
```

gives the displayed exponential generating function. The derivative identity
follows by differentiating with respect to `X`.

### Consequence

The edge problem is not an arbitrary sequence of discriminants. It is an
Appell/Sturm family. Hyperbolicity at degree `d` automatically imposes
interlacing with degree `d-1`; the hard edge problem is to control how the
roots of this Appell family move as `A` increases.

## Theorem GPT-F20: Edge Recurrence and Degree-5 Wall

Let `H_d=H_d^A`. From GPT-F19,

```text
G(X,t)=sum_{d>=0} H_d^A(X)t^d/d!
      =exp(-Xt - A[t+(1-t)log(1-t)]).
```

Differentiating in `t` gives

```text
partial_t G = [-X + A log(1-t)]G.
```

Therefore

```text
H_0=1,
H_1=-X,
H_{d+1}
  =
  -XH_d
  - A sum_{m=1}^d d!/[m(d-m)!]H_{d-m}.
```

This recurrence gives

```text
H_5^A(X)
  =
  -X^5 + 10AX^3 - 10AX^2 + 10AX - 6A
  - 15A^2X + 10A^2.
```

The discriminant is

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

The smaller root is only a partial birth wall: the real-root count changes
from one to three. The larger root is the full degree-5 wall:

```text
H_5^A has five real roots  <=>  A >= A_5.
```

Exact certificate:

```text
number of positive sextic roots = 2,
one root in (13/25,53/100),
one root in (59/100,3/5),
no other positive roots;

A=1/10:   H_5^A has 1 real root,
A=53/100: H_5^A has 3 real roots,
A=13/20:  H_5^A has 5 real roots.
```

Thus the first full edge constants are

```text
A_2=0,
A_3=1/4,
A_4=0.432678606330554...,
A_5=0.597117448450202....
```

This suggests the sharp finite-polynomial form of Fable's `alpha_c=1` law:

```text
A_d increases to 1.
```

If this is right, then Fable's divergence law for `d*(alpha,0)` measures the
approach rate of `A_d` to one.

## Theorem GPT-F21: Edge Creation-Annihilation Algebra

Define formal operators on polynomials

```text
D=-partial_X,
M=-X + A log(1+partial_X).
```

Then

```text
D H_d^A = d H_{d-1}^A,
M H_d^A = H_{d+1}^A,
[D,M]=1.
```

The parameter flow is

```text
partial_A H_d^A
  =
  [partial_X - (1+partial_X)log(1+partial_X)]H_d^A.
```

### Proof

The first identity is GPT-F19. For the raising identity, use

```text
partial_X^m H_d^A
  =
  (-1)^m d!/(d-m)! H_{d-m}^A
```

inside GPT-F20:

```text
H_{d+1}
  =
  -XH_d
  - A sum_{m=1}^d d!/[m(d-m)!]H_{d-m}
  =
  [-X + A log(1+partial_X)]H_d.
```

The commutator follows because `log(1+partial_X)` commutes with `partial_X`.
The `A`-flow follows by differentiating the generating function in `A` and
substituting `t=-partial_X` on the Appell basis.

### Consequence

The fixed edge is an exactly solvable Sturm/Appell oscillator. Every
multiple-root wall is an adjacent-Appell common-root wall:

```text
Disc_X(H_d^A) = nonzero_constant * Res_X(H_d^A,H_{d-1}^A).
```

Thus F20's degree-5 discriminant is not a standalone accident. It is one
instance of the same adjacent-pair resultant mechanism as the Jensen ladder.

## Theorem GPT-F22: Edge Walls Are Previous-Root Gap Balances

Let

```text
p(X)=H_{d-1}^A(X)
```

have simple real roots `rho_1<...<rho_{d-1}`. For `A>0`, a root `rho_i` of
`p` is also a root of `H_d^A` if and only if

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

### Proof

By GPT-F21,

```text
H_d^A=[-X+A log(1+partial_X)]H_{d-1}^A.
```

At a root `rho_i` of `p=H_{d-1}^A`, the `-Xp` term is zero. Hence, for
`A>0`,

```text
H_d^A(rho_i)=0
  <=> [log(1+partial_X)p](rho_i)=0.
```

Now

```text
log(1+partial_X)
  =
  sum_{m>=1}(-1)^{m+1}partial_X^m/m.
```

If `p(X)=(X-rho_i)q_i(X)`, then

```text
p^{(m)}(rho_i)/p'(rho_i)
  =
  m! e_{m-1}({1/(rho_i-rho_j):j != i}).
```

Dividing by `p'(rho_i)` gives the finite gap sum. The integral form follows
from `ell! = int_0^infinity e^{-s}s^ell ds`.

### Consequence

The edge wall for degree `d` can be tested using only the root gaps of
`H_{d-1}^A`. The discriminant route

```text
Disc_X(H_d^A)=0
```

is equivalent, on the hyperbolic side, to a finite list of gap equations

```text
E_i(A)=0.
```

This is the root-geometric version of the Appell/Jensen ladder.

## Corollary GPT-F23: Low-Degree Walls from the Gap Equation

GPT-F22 recovers the first edge walls without discriminants.

For `d=3`,

```text
H_2^A(X)=X^2-A.
```

At the right root `sqrt(A)`, the gap equation is

```text
1 - 1/(2sqrt(A)) = 0,
```

so

```text
A_3=1/4.
```

For `d=4`,

```text
H_3^A(X)=-X^3+3AX-A.
```

The wall operator gives

```text
log(1+partial_X)H_3^A
  =
  -3X^2 + 3X + 3A - 2.
```

At a common root `X=z`,

```text
A=z^2-z+2/3.
```

Substitution into `H_3^A(z)=0` gives

```text
6z^3 - 12z^2 + 9z - 2 = 0.
```

Thus

```text
A_4=z^2-z+2/3
   =0.432678606330554...
```

for `z=0.373461706729200...`. This is the same constant as GPT-F17, now
derived by the adjacent-Appell gap wall.

## Theorem GPT-F24: Degree-6 Edge Wall

The next edge polynomial is

```text
H_6^A(X)
  =
  X^6 - 15AX^4 + 20AX^3 - 30AX^2 + 36AX - 24A
  + 45A^2X^2 - 60A^2X + 40A^2 - 15A^3.
```

The adjacent-Appell resultant is

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

The decic has exactly two positive roots:

```text
A_{6,-}=0.74747110775875305435...,
A_6    =0.78752607887675735239....
```

The smaller root is a partial wall, changing the real-root count from two to
four. The larger root is the full degree-6 wall:

```text
H_6^A has six real roots  <=>  A >= A_6.
```

Exact certificate:

```text
P_6 has exactly two positive roots,
one in (747/1000,3/4),
one in (787/1000,79/100);

A=1/10:  H_6^A has 2 real roots,
A=3/4:   H_6^A has 4 real roots,
A=19/25: H_6^A has 4 real roots,
A=4/5:   H_6^A has 6 real roots.
```

Thus the known full edge constants are

```text
A_2=0,
A_3=1/4,
A_4=0.432678606330554...,
A_5=0.597117448450202...,
A_6=0.787526078876757....
```

This is new evidence for the finite-polynomial critical-wall conjecture
`A_d -> 1`.

## Theorem GPT-F25: Edge Generator Coefficient Tail

Let

```text
F_A(t)=exp(-A[t+(1-t)log(1-t)])
      =sum_{n>=0} gamma_n(A)t^n/n!.
```

Then, for fixed `A>0`,

```text
[t^n]F_A(t)
  =
  -A e^{-A}/[n(n-1)] + O(log n/n^3),
```

so

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

With `u=1-t`,

```text
t+(1-t)log(1-t)
  =
  1 + u(log u - 1),
```

hence

```text
F_A(t)
  =
  e^{-A} exp(Au(1-log u))
  =
  e^{-A}[1 + Au - Au log u + O(u^2log^2u)].
```

For `n>=2`,

```text
[t^n](1-t)log(1-t)=1/[n(n-1)].
```

The `u^2log^2u` term contributes `O(log n/n^3)`. The reversed Jensen formula
comes from coefficient comparison in `F_A(t)e^{-Xt}`.

### Consequence

The edge generator has a logarithmic branch point at `t=1` and factorial
coefficient tail. A proof of `A_d -> 1` cannot be a generic PF-infinity or
Laguerre-Polya argument on `F_A`; it must exploit the special reversed-Jensen
Appell ladder.

## Theorem GPT-F26: Degree-7 Edge Wall Refutes the Naive Edge Limit

The degree-7 edge polynomial is

```text
H_7^A(X)
  =
  -X^7 + 21AX^5 - 35AX^4 + 70AX^3 - 126AX^2
  + 168AX - 120A
  - 105A^2X^3 + 210A^2X^2 - 280A^2X + 196A^2
  + 105A^3X - 105A^3.
```

Its adjacent-Appell resultant is

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

The first two are partial walls. The larger root is the full degree-7 wall:

```text
H_7^A has seven real roots  <=>  A >= A_7.
```

Exact certificate:

```text
P_7 has exactly three positive roots,
one in (3/4,4/5),
one in (22/25,9/10),
one in (1,21/20);

A=1/10:  1 real root,
A=4/5:   3 real roots,
A=17/20: 3 real roots,
A=9/10:  5 real roots,
A=1:     5 real roots,
A=21/20: 7 real roots.
```

Thus `A_7>1`. This refutes the naive fixed-edge conjecture

```text
A_d < 1 and A_d -> 1 from below.
```

The fixed-degree edge family remains useful, but Fable's `alpha_c=1` cannot
be the limit of the full fixed-degree thresholds `A_d`. The next target is a
coupled `d,x` scaling, or a weaker adjacent-ladder condition, not fixed-`d`
full hyperbolicity alone.

## Theorem GPT-F27: Coupled Shift-Degree Tropical Scaling

For

```text
c_{n+r}=alpha/(n+b+r),
x=n+b+1,
```

the affine-normalized weights are

```text
w_k=exp(-alpha S_x(k)),
S_x(k)=sum_{r=1}^{k-1}(k-r)/(x+r-1),
S_x(0)=S_x(1)=0.
```

Equivalently,

```text
S_x(k)
  =
  (x+k-1)(psi(x+k-1)-psi(x)) - (k-1).
```

For the shifted Jensen section

```text
P_{d,x}(t)=sum_{k=0}^d (-1)^k binom(d,k)w_k t^k,
```

the adjacent coefficient ratios are exactly

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

The tropical root curve is strictly increasing:

```text
d/dp log T_{alpha,rho}(p)
  =
  1/p + 1/(1-p) + alpha rho/(1+rho p)
  > 0.
```

### Consequence

The coupled bulk has no coefficient-ratio collision for any `alpha>0`. Thus
Fable's `alpha_c=1` boundary, if proved through this route, must come from
subleading Sturm/interlacing corrections or from a boundary layer, not from
the leading tropical curve.

## Theorem GPT-F28: Fixed-Shift Head Boundary Layer

Keep

```text
x=n+b+1
```

fixed and let `d->infinity`. For

```text
k->infinity,
k=o(d),
```

the exact ratio from GPT-F27 satisfies

```text
tau_{d,x,k}
  =
  e^{-alpha psi(x)} k^{alpha+1}/d
  * [1+O(k/d)+O(1/k)].
```

Hence, if

```text
k = y d^{1/(alpha+1)} + o(d^{1/(alpha+1)}),
```

then

```text
tau_{d,x,k}
  ->
  e^{-alpha psi(x)} y^{alpha+1}.
```

For the head `x=1`,

```text
e^{-alpha psi(1)}=e^{alpha EulerGamma}.
```

### Consequence

The head regime has natural index scale

```text
k ~ d^{1/(alpha+1)}.
```

At `alpha=1`, this is the square-root hard edge `k~sqrt(d)`, matching the
Laguerre anchor. This is now the relevant local asymptotic target for
Fable's `alpha_c=1` boundary.

## Theorem GPT-F29: Hard-Head Entire Limit

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

Then

```text
P_{d,x}(s/d)
  =
  sum_{k=0}^d (-1)^k binom(d,k)exp(-alpha S_x(k))(s/d)^k
  ->
  Phi_{alpha,x}(s)
```

locally uniformly on compact `s`-sets.

The positive coefficient ratio in the limit is

```text
r_{alpha,x,k}
  =
  k exp(alpha[psi(x+k-1)-psi(x)])
  ~ e^{-alpha psi(x)} k^{alpha+1}.
```

The order of `Phi_{alpha,x}` is

```text
1/(alpha+1).
```

For the critical head,

```text
Phi_{1,1}(s)
  =
  sum_{k>=0} (-1)^k exp(-kH_{k-1}+k-1)s^k/k!,
```

with `H_0=0`; its order is `1/2`.

### Consequence

This is the microscopic hard-head target. By Hurwitz, a nonreal zero of
`Phi_{alpha,x}` would force nonreal zeros in large finite Jensen sections
under `t=s/d`. Conversely, proving the critical `Phi_{1,1}` and adjacent
head limits are Laguerre-Polya is the local analytic form of `alpha_c=1`.

## Theorem GPT-F30: Hard-Head Shift-Derivative Ladder

The hard-head limit functions obey

```text
partial_s Phi_{alpha,x}(s)
  =
  -Phi_{alpha,x+1}(e^{-alpha/x}s).
```

Proof: differentiating the series gives

```text
partial_s Phi_{alpha,x}(s)
  =
  -sum_{j>=0}(-1)^j exp(-alpha S_x(j+1))s^j/j!.
```

The exact shift identity

```text
S_x(j+1)=S_{x+1}(j)+j/x
```

turns this into the displayed formula.

### Consequence

The microscopic head problem has its own exact Sturm ladder:

```text
zeros(Phi_{alpha,x+1}(e^{-alpha/x}s))
  =
critical points of Phi_{alpha,x}(s).
```

Thus the local `alpha_c=1` target is:

```text
Phi_{1,x} is Laguerre-Polya for all x>=1,
with the scaled adjacent zeros interlacing by Rolle.
```

This is a sharply smaller problem than the original finite Jensen sections.

## Relation to GPT-F1

For the constant-curvature theorem, the role of the adjacent shift
`R_d^{n+1}` is played, after rescaling, by `R_d(t/q)`. The `q^2`
root-ratio invariant is exactly what makes the relevant shifted roots
interlace in the intervals used by GPT-F1. Thus GPT-F1 is a rigid,
closed-form Sturm-ladder case.

## Relation to Fable's Monotone-Healing Lemma

Fable's curvature-scaling flow is

```text
log a_j(lambda) = lambda log a_j(1).
```

For a fixed section `(d,n)`, define `lambda*(d,n)` as the first
curvature scale at which `R_d^n(lambda)` has only positive real roots,
if this threshold is well-defined.

Theorem GPT-F2 suggests the sharper target:

```text
If adjacent-shift right-interlacing holds at degree d for all relevant n,
then hyperbolicity holds at degree d+1.
```

Therefore the comparison theorem can be attacked by proving monotone healing
of the **interlacing ladder**, not only of each polynomial separately:

```text
R_d^n(lambda) right-interlaces R_d^{n+1}(lambda)
```

should become true and stay true as `lambda` increases, for the curvature
profiles in the safe region.

## Numerical Referee Evidence

Script:

```text
scripts/research/hilbertPolya/gpt_interlace_scan.py
```

Runpod path:

```text
/root/gpt_interlace_scan.py
```

Model convention matches Fable:

```text
Delta^2 log a_j = -alpha/(j+b).
```

High-precision results:

```text
alpha=0.4, b=0:
  first adjacent-shift interlacing failure: d=17, n=0
  first complex roots:                    d=18, n=0

alpha=0.5, b=0:
  first adjacent-shift interlacing failure: d=35, n=0
  first complex roots:                    d=36, n=0

alpha=0.7, b=0:
  hyperbolic + adjacent-shift interlacing through d=110, n<=1
  failure by d=120, with n=0 complex and n=1 still real

alpha=0.7, b=8.36:
  no hyperbolicity or interlacing failure through d=80, n<=1
```

This pattern supports the diagnosis: interlacing fails first; the next
Pascal step then has no Sturm bracket and complex roots can form.

## Theorem GPT-F31: Fixed-Ratio Large-Shift Limit Has No Leading Caustic

Fable's F204 drift law made the large-`b` growth of `d*(alpha,b)` the
decision-relevant theory gap. The first check is whether a linear wall can
appear in the leading large-shift asymptotic.

Set

```text
x = n+b+1,
d/x -> rho in (0,infinity),
k/d -> p in (0,1),
```

and keep the Cauchy curvature profile from GPT-F27:

```text
S_x(k)
  =
  (x+k-1)(psi(x+k-1)-psi(x))-(k-1).
```

The positive coefficient of the alternating Jensen section has logarithmic
asymptotic

```text
1/d log[binom(d,k) exp(-alpha S_x(k))]
  ->
  H(p)
  - alpha/rho * [(1+rho p)log(1+rho p)-rho p],
```

where

```text
H(p)=-p log p-(1-p)log(1-p).
```

The associated formal root-log map, equivalently the logarithm of the
tropical adjacent coefficient-ratio curve, is

```text
u_{alpha,rho}(p)
  =
  log(p/(1-p)) + alpha log(1+rho p).
```

It is strictly ordered:

```text
u'_{alpha,rho}(p)
  =
  1/p + 1/(1-p) + alpha rho/(1+rho p)
  > 0.
```

Consequently no leading fixed-ratio hydrodynamic caustic exists. A wall of
the form

```text
d*(alpha,b) ~ rho(alpha) b
```

cannot be explained by the first-order large-shift continuum theory. If such
a linear law persists at finite `b`, it is a subleading finite-shift effect,
not the asymptotic mechanism.

## GPT-F32: Large-`b` Wall Scales to Test

There are two distinct large-shift boundary layers.

For `k=o(x)`,

```text
S_x(k)
  =
  binom(k,2)/x
  - binom(k,3)/x^2
  + O(k^4/x^3).
```

The first term is the heat-line/Gaussian-binomial multiplier from GPT-F1 and
is Laguerre-Polya safe. The second term is the first non-constant Cauchy
variation. Including the finite-degree binomial correction in the hard-head
scaling gives

```text
binom(d,k)d^{-k}
  =
  1/k! * exp(-binom(k,2)/d + O(k^3/d^2)).
```

Thus the head coefficients look like

```text
(-1)^k s^k/k! *
exp[
  -(alpha/x + 1/d)binom(k,2)
  + alpha binom(k,3)/x^2
  + O(k^4/x^3 + k^3/d^2)
].
```

This separates three regimes:

```text
d/x fixed:
  leading root map strictly ordered by GPT-F31.

d ~ x^(4/3):
  first Cauchy cubic correction becomes order one at the binomial cutoff
  k ~ sqrt(d).

d ~ x^2:
  the cutoff reaches k ~ x, so the full Cauchy hard-head transition is
  visible.
```

The currently measured `(1+b/4)` law is therefore a finite-range fit, not a
settled asymptotic. The next theoretical question is whether the
`x^(4/3)` Airy correction can create an actual Sturm failure, or whether the
heat-line total-positivity protection survives until the full `x^2` Cauchy
head scale.

For Fable's F204 clearance curve this distinction is decisive:

```text
linear large-b wall:      clearance can keep falling;
x^(4/3) large-b wall:    crossing is delayed but not automatically removed;
x^2 large-b wall:        b ~ d^0.53 is already strong enough to bend the
                         clearance curve back upward asymptotically.
```

Suggested Fable referee test:

```text
Fix alpha, compute d*(alpha,b) for b = 16, 32, 64, 128.
Track d*/b, d*/b^(4/3), d*/b^2.
```

The stable column identifies the large-shift boundary layer.

## Theorem GPT-F33: Mellin-Hausdorff Form of the Kernel Certificate

GPT-F12 writes the crossing numerator for Cauchy profiles as

```text
Phi(b)=sum_{r=1}^d K_r/(n+r+b).
```

There is an equivalent moment form that may be easier to prove. Since

```text
1/(n+r+b)=int_0^1 q^{n+r+b-1} dq,
```

we have

```text
Phi(b)
  =
  int_0^1 q^b G(q)dq,

G(q)
  =
  sum_{r=1}^d K_r q^{n+r-1}.
```

If the common root is the `i`th root of the adjacent section, absorb the
Sturm sign by setting

```text
G_i(q)=(-1)^i G(q).
```

Then the structured Cauchy healing condition for every shift `b>=0` is

```text
int_0^1 q^b G_i(q)dq > 0.
```

Two elementary integral certificates follow.

**Tail certificate.** Define

```text
T(q)=int_q^1 G_i(u)du.
```

If

```text
T(q)>=0 for 0<=q<=1,
T(0)>0,
```

then `Phi_i(b)>0` for every `b>=0`. For `b>0`,

```text
int_0^1 q^b G_i(q)dq
  =
  b int_0^1 q^{b-1}T(q)dq.
```

At `b=0` the value is `T(0)`.

**Prefix certificate for Laguerre-to-critical comparison.** Define

```text
P(q)=int_0^q G_i(u)du.
```

If

```text
P(q)>=0 for 0<=q<=1,
```

then

```text
Phi_i(0) >= Phi_i(b)      for every b>=0,
```

because

```text
Phi_i(0)-Phi_i(b)
  =
  int_0^1 (1-q^b)G_i(q)dq
  =
  b int_0^1 t^{b-1}P(t)dt.
```

Thus the Cauchy-family healing theorem and the Laguerre-to-critical
comparison can be attacked without root tracking after the event is known:
compute the polynomial `G_i(q)` and prove positivity of one or both of its
first integrals on `[0,1]`.

## Literature Flags

This problem is in the neighborhood of Pólya frequency sequences, total
positivity, and Hadamard powers. Two cautions matter:

1. Log-concavity is only PF2, not PF-infinity. Thus `c_j >= 0` alone is far
   too weak for a proof.
2. General Hadamard-power monotonicity is delicate. In
   `docs/rh/gpt_monotone_healing_counterexample.md`, the positive log-concave
   quartic sequence `[998, 1125, 1245, 1322, 995]` is exactly verified to be
   real-rooted at power `m=7`, non-real-rooted at `m=8,9,10`, and real-rooted
   again at `m=11`. The monotone-healing lemma should therefore be treated as
   a special theorem for the `alpha/(j+b)`-type curvature profiles, not as a
   generic coefficientwise-power principle.

Useful references for the audit trail:

- Aissen-Schoenberg-Whitney: total positivity and generating functions.
- Craven-Csordas: multiplier sequences and Laguerre-Pólya class.
- Belton-Guillot-Khare-Putinar (2022): preservers of totally positive kernels
  and Pólya frequency functions.
- Brändén-Ferroni-Jochemko (2024): preservation and counterexamples for
  Hadamard products/powers in related log-concavity settings.

## Next Proof Target

Prove or refute:

```text
For c_j = alpha/(j+b), adjacent-shift right-interlacing has a monotone
threshold in lambda.
```

If true, Fable's `lambda*` is not just a numerical diagnostic but a
section-wise de Bruijn-Newman constant for the Jensen curvature face. RH then
becomes the variational bound

```text
sup_{d,n} lambda*_xi(d,n) <= 1,
```

with all current evidence suggesting equality at the boundary.
