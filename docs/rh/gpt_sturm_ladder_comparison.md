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

This use of `B-A` is legitimate even if the branch is written one order
more accurately as

```text
sigma = 1 + z h + w h^2 + O(h^3).
```

The possible `w` terms in the `h^4` coefficient of `B-A` cancel:

```text
3a w - 12a w + 9a w = 0.
```

Thus the second branch equation is independent of the unknown `h^2`
correction to `sigma`.

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

## Theorem GPT-F34: Kernel Shadow-Polynomial Identity

The Mellin kernel in GPT-F33 is not an independent object. It is a rescaled
shadow of the wall polynomial itself.

Keep the normalized notation

```text
tilde S(s)=tilde A(s)-s tilde B(s),
tilde S(sigma)=tilde S_s(sigma)=0,
```

and define

```text
C_j=(-1)^j binom(d+1,j)exp(lambda eta_j)sigma^j.
```

Then

```text
tilde S(q sigma)=sum_{j=0}^{d+1} C_j q^j,
sum_j C_j=0,
sum_j j C_j=0.
```

For the GPT-F33 polynomial

```text
G(q)=sum_{r=1}^d K_r q^{n+r-1},
```

one has the exact identity

```text
G(q)
  =
  - q^n * tilde S(q sigma)/(1-q)^2,
```

with continuous extension at `q=1`.

### Proof

Insert GPT-F7's kernel

```text
K_r
  =
  - sum_{j=r+1}^{d+1}(j-r)C_j.
```

Then

```text
G(q)
  =
  -q^n sum_{j=2}^{d+1} C_j
      sum_{r=1}^{j-1}(j-r)q^{r-1}.
```

The inner sum is

```text
sum_{r=1}^{j-1}(j-r)q^{r-1}
  =
  [(j-1)-jq+q^j]/(1-q)^2.
```

The numerator vanishes for `j=0,1`, so extending the sum gives

```text
G(q)
  =
  -q^n/(1-q)^2
    [
      (1-q)sum_j jC_j - sum_j C_j + sum_j C_jq^j
    ].
```

The first two sums vanish by the double-root conditions, leaving the displayed
formula.

At the endpoint,

```text
G(1)
  =
  -sigma^2 tilde S_{ss}(sigma)/2
  =
  (d+1)sigma^2 tilde B_s(sigma)/2.
```

Thus, after the Sturm sign normalization `G_i=(-1)^iG`,

```text
G_i(1)
  =
  (d+1)sigma^2 |tilde B_s(sigma)|/2
  > 0.
```

### Consequence

The strongest pointwise certificate `G_i(q)>=0` should not be expected at
bulk events: `tilde S(q sigma)` sees every earlier root below `sigma`, so it
usually oscillates. The viable certificates are the integral ones from
GPT-F33: tail positivity for Cauchy-shift healing and prefix positivity for
Laguerre-to-critical comparison.

## Theorem GPT-F35: Endpoint Dominance for Large Cauchy Offset

At any fixed positive adjacent-section common-root event with
`tilde B_s(sigma) != 0`, define the signed Cauchy transform

```text
Phi_i(b)
  =
  (-1)^i Phi(b)
  =
  int_0^1 q^b G_i(q)dq.
```

Then

```text
Phi_i(b)
  =
  [(d+1)sigma^2 |tilde B_s(sigma)|/2]/(b+1)
  + O(1/b^2)
```

as `b -> infinity`. Equivalently, writing `G_i(q)=q^n H_i(q)`,

```text
Phi_i(b)=int_0^1 q^{n+b}H_i(q)dq
        = H_i(1)/(n+b+1)+O((n+b)^{-2})
```

when the combined depth `n+b` is the large parameter. In particular, every
fixed event is healing for all sufficiently large Cauchy offset.

### Proof

By GPT-F34, `G_i` extends continuously to `q=1` with positive endpoint value

```text
G_i(1)=(d+1)sigma^2 |tilde B_s(sigma)|/2.
```

The elementary endpoint estimate

```text
int_0^1 q^b f(q)dq = f(1)/(b+1)+O(1/b^2)
```

for `C^1` functions gives the result.

### Consequence

Fable's F203 observation that deep-window healing margins decay like
`1/(n+b)` is the expected endpoint law, not a numerical accident. Any
anti-healing obstruction in the structured Cauchy family must come from
finite-offset oscillation of the shadow polynomial before endpoint dominance
takes over.

## Theorem GPT-F36: Variation-Diminishing Bound for Offset Anti-Healing

Assume the common-root event is a regular hyperbolic wall: `tilde S` has a
double root at `sigma`, all other roots are simple and positive, and exactly
`i-1` roots lie in `(0,sigma)`. Then the signed shadow

```text
G_i(q)=(-1)^iG(q)
```

has exactly `i-1` sign changes on `(0,1)`.

Indeed, GPT-F34 gives

```text
G_i(q)
  =
  (-1)^{i+1} q^n tilde S(q sigma)/(1-q)^2.
```

The denominator and `q^n` are positive on `(0,1)`, so sign changes of
`G_i` are precisely the roots `q=r/sigma` of `tilde S(q sigma)` lying before
the double root.

Now write the signed Cauchy transform as a Laplace transform by setting
`q=e^{-t}`:

```text
Phi_i(b)
  =
  int_0^1 q^b G_i(q)dq
  =
  int_0^infinity e^{-(b+1)t}G_i(e^{-t})dt.
```

The exponential kernel is strictly totally positive, so the Laplace transform
is variation-diminishing. Therefore `Phi_i(b)`, as a function of real
`b>=0`, has at most `i-1` zeros unless it is identically zero.

Combined with GPT-F35:

```text
Phi_i(b)>0 for all sufficiently large b.
```

Thus a fixed regular event can have only finitely many finite-offset
anti-healing intervals, bounded by the number of roots of `tilde S` before
the colliding pair. No fixed event can produce late repeated anti-healing as
the Cauchy offset grows.

## Theorem GPT-F37: Critical Hard-Head Bessel Asymptotic

The hard-head entire functions from GPT-F29 have an explicit Bessel anchor at
the critical exponent `alpha=1`.

Let

```text
a_k(x)=exp(-S_x(k))/k!,
C_x=exp(psi(x)),
nu_x=x-3/2.
```

Then

```text
a_k(x)
  ~
  L_x * C_x^k/[k! Gamma(k+nu_x+1)],
```

where

```text
L_x
  =
  sqrt(2pi) exp((x-1)psi(x)-x+1/2).
```

Equivalently, coefficientwise at high order,

```text
Phi_{1,x}(s)
  is asymptotic to
  L_x * (C_x s)^(-nu_x/2) J_{nu_x}(2 sqrt(C_x s)).
```

The ratio form is even cleaner:

```text
a_{k-1}(x)/a_k(x)
  =
  k exp(psi(x+k-1)-psi(x))
  =
  C_x^{-1} k(k+nu_x) [1+O(k^-2)].
```

### Proof

The exact ratio is from GPT-F29. Since

```text
psi(x+k-1)
  =
  log k + (x-3/2)/k + O(k^-2),
```

the Bessel ratio follows. Matching one more term gives a summable quotient
error, so the coefficient ratio has a finite nonzero limit. Stirling's formula
in

```text
S_x(k)
  =
  (x+k-1)(psi(x+k-1)-psi(x))-(k-1)
```

gives the constant `L_x`.

The constants are compatible with the exact hard-head derivative ladder:

```text
L_{x+1}/L_x = exp(psi(x)),
C_{x+1}e^{-1/x}=C_x,
nu_{x+1}=nu_x+1.
```

Thus GPT-F30 becomes, at the Bessel anchor level, the standard derivative
ladder for

```text
z^{-nu/2}J_nu(2sqrt z).
```

### Consequence

For Fable's `Phi_{1,1}` / `Phi_{1,2}` scan:

```text
x=1:  nu=-1/2, C=e^{-EulerGamma},
      zeros(Phi_{1,1}) should approach
      e^{EulerGamma}((m-1/2)pi)^2/4.

x=2:  nu= 1/2, C=e^{1-EulerGamma},
      zeros(Phi_{1,2}) should approach
      e^{EulerGamma-1}(m pi)^2/4.
```

The F30 critical-point relation multiplies `Phi_{1,2}` zeros by `e`, giving

```text
e * zeros(Phi_{1,2}) ~ e^{EulerGamma}(m pi)^2/4,
```

which is exactly the asymptotic interlacing pattern between the cosine and
sine Bessel anchors. This does not prove `Phi_{1,x}` is Laguerre-Polya, but
it gives the right zero ruler and makes nonreal hard-head zeros a finite-core
phenomenon rather than a tail phenomenon.

## Audit GPT-F38: Fable F205/F206 Drift Gate

Fable's F205 saddle derivation is correct at the level needed for the RH
program. With

```text
gamma_j = M_{2j} j!/(2j)!,
M_{2j}=int_0^infinity Phi(t)t^{2j}dt,
```

and with the `n=1` theta term dominating the moment saddle, the saddle
equation is

```text
2j/t = 2 pi e^{2t} - 9/2
```

or, at leading order,

```text
pi e^{2t_j}t_j = j.
```

The envelope derivative is

```text
d log M_{2j}/dj = 2 log t_j + lower order,
```

and implicit differentiation gives

```text
t_j' = t_j/[j(1+2t_j)] * (1+O(t_j/j)).
```

Therefore

```text
d^2 log M_{2j}/dj^2
  =
  2/[j(1+2t_j)] + lower order.
```

For the factorial normalization,

```text
Delta^2 log j! = log(1+1/j),
Delta^2 log (2j)!
  =
  log[((2j+1)(2j+2))/((2j-1)2j)].
```

Thus

```text
Delta^2 log(2j)! - Delta^2 log j! = 1/j + O(j^-3),
```

and hence

```text
c_j = -Delta^2 log gamma_j
    = (1/j)(2t_j-1)/(2t_j+1) + lower order.
```

Equivalently,

```text
alpha(j)=j c_j
        =
        1 - 2/[W(2j/pi)+1] + lower order,
```

so

```text
alpha(j)
  =
  1 - 2/[log j - log log j + 1 + log 2 - log pi + o(1)].
```

The constant `1+log 2-log pi=0.5484...` is explained by
`2t_j=W(2j/pi)` and the extra `+1` in `2t_j+1`.

Fable's F206 effective-profile exponent algebra is also structurally right,
with one wording correction. If

```text
b_eff(d) ~ d^beta,       beta ~= 0.60,
1-alpha_eff(d) ~ 2/log d,
d*(alpha,b) ~ (1-alpha)^(-p)b^theta, p ~= 2.28,
```

then

```text
C(d)=d*(alpha_eff,b_eff)/d
    ~ const * (log d/2)^p * d^{beta theta-1}.
```

For true asymptotic survival of this macroscopic effective-profile model,
polylogs cannot offset a negative power. The sharp exponent gate is

```text
theta >= 1/beta.
```

With `beta=0.60`, this is

```text
theta >= 5/3.
```

The quoted `theta ~= 1.55` is a finite-range gate, not an asymptotic one.
For the program's current alternatives this distinction does not save the
Airy layer:

```text
theta=1      linear layer: dead in the effective model,
theta=4/3    Airy layer: dead in the effective model,
theta=2      full Cauchy-head layer: viable in the effective model.
```

If Fable's bladder ladder keeps `theta_infty < 5/3`, then the effective
profile cannot be the asymptotic RH protection mechanism. The surviving route
is microscopic: the hard-head limit `Phi_{1,x}` and its Sturm derivative
ladder.

## Theorem GPT-F39: Critical Hard-Head as a Compound-Poisson Bessel Dilation

The Bessel anchor in GPT-F37 is not merely asymptotic. At `alpha=1`, the exact
coefficient ratio between `Phi_{1,x}` and its Bessel anchor is a Hausdorff
moment sequence with an explicit positive Levy density.

Let

```text
Phi_{1,x}(s)=sum_{k>=0}(-1)^k a_k(x)s^k,
a_k(x)=exp(-S_x(k))/k!,
C_x=exp(psi(x)),
nu_x=x-3/2.
```

Normalize the Bessel coefficients by

```text
b_k(x)
  =
  Gamma(x-1/2) C_x^k/[k! Gamma(k+x-1/2)],
b_0(x)=1.
```

Define

```text
m_k(x)=a_k(x)/b_k(x).
```

Then `m_0(x)=1` and

```text
m_k(x)/m_{k-1}(x)
  =
  (x+k-3/2) exp(-psi(x+k-1)).
```

For `y>=1`,

```text
log[(y-1/2)exp(-psi(y))]
  =
  -int_0^infinity e^{-yt} eta(t) dt,
```

where

```text
eta(t)
  =
  e^{t/2}/t - 1/(1-e^{-t})
  =
  [2sinh(t/2)-t]/[t(1-e^{-t})] > 0.
```

Therefore

```text
m_k(x)
  =
  exp int_0^infinity (e^{-kt}-1)
       eta(t)e^{-xt}/(1-e^{-t}) dt.
```

This is the moment sequence of a random dilation `U_x in [0,1]`. Equivalently,
let a Poisson point process on `(0,infinity)` have intensity

```text
dnu_x(t)=eta(t)e^{-xt}/(1-e^{-t}) dt,
```

and set

```text
U_x=exp(-sum T_r).
```

Then

```text
m_k(x)=E[U_x^k].
```

Consequently

```text
Phi_{1,x}(s)
  =
  E B_x(U_x s),
```

where

```text
B_x(s)
  =
  Gamma(x-1/2)(C_xs)^(-nu_x/2)J_{nu_x}(2sqrt(C_xs)).
```

The atom at `U_x=1` has mass

```text
exp(-nu_x((0,infinity))) = lim_{k->infinity} m_k(x)
                          = L_x/Gamma(x-1/2),
```

with `L_x` from GPT-F37. Thus the Bessel tail is literally the no-jump
component of an infinitely divisible positive dilation law; the remaining
continuum is the finite/intermediate-core smear.

### Special Cases

For `x=1`,

```text
B_1(s)=cos(2sqrt(e^{-EulerGamma}s)),
Phi_{1,1}(s)
  =
  E cos(2sqrt(e^{-EulerGamma}U_1s)).
```

For `x=2`,

```text
B_2(s)=sin(2sqrt(e^{1-EulerGamma}s))/(2sqrt(e^{1-EulerGamma}s)),
Phi_{1,2}(s)
  =
  E B_2(U_2s).
```

### Consequence

The hard-head LP problem is now exact:

```text
Does this explicit compound-Poisson Bessel-dilation average preserve
Laguerre-Polya for every x>=1?
```

If Fable's hard-head scan finds a nonreal zero, it must be created by the
continuum dilation smear, not by the Bessel atom/tail. If the first zeros are
real and follow the F37 ruler, the next proof target is this dilation
operator, not another coefficient asymptotic.

## Theorem GPT-F40: Universal Hard-Head Endpoint Shift

The compound-Poisson law in GPT-F39 gives a sharper zero ruler. The first
correction to the Bessel zeros is universal and comes from the small-jump
coefficient

```text
eta(t)=t/24+O(t^2).
```

Let

```text
rho_x(t)=eta(t)e^{-xt}/(1-e^{-t})
```

be the Levy density of `L_x=-log U_x`. Then

```text
rho_x(t)=1/24+O(t),       t downarrow 0,
```

independently of `x`. If

```text
p_x=Pr(U_x=1)=L_x/Gamma(x-1/2),
R_x=sqrt(U_x),
```

then `R_x` has an atom `p_x` at `1` and its continuous density satisfies

```text
h_x(1-)=p_x/12.
```

### The `Phi_{1,1}` Zero Shift

Set

```text
t=2sqrt(e^{-EulerGamma}s),
F_1(t)=Phi_{1,1}(t^2/(4e^{-EulerGamma})).
```

Then

```text
F_1(t)
  =
  p_1 cos t + int_0^1 h_1(r)cos(tr)dr
  =
  p_1[cos t + sin t/(12t)+O(t^-2)].
```

Therefore the `m`-th zero has

```text
t_m=(m-1/2)pi + 1/[12(m-1/2)pi] + O(m^-2).
```

Equivalently, if `s_m^(1)` is the `m`-th zero of `Phi_{1,1}`,

```text
4e^{-EulerGamma}s_m^(1) - ((m-1/2)pi)^2 -> 1/6,
```

or

```text
s_m^(1)
  =
  e^EulerGamma[((m-1/2)^2 pi^2)/4 + 1/24 + O(1/m)].
```

### The `Phi_{1,2}` Shift and Ladder Compatibility

Set

```text
t=2sqrt(e^{1-EulerGamma}s),
F_2(t)=t Phi_{1,2}(t^2/(4e^{1-EulerGamma})).
```

The same endpoint-density argument gives

```text
F_2(t)
  =
  p_2[sin t - cos t/(12t)+O(t^-2)].
```

Thus the `m`-th zero of `Phi_{1,2}` satisfies

```text
t_m=m pi + 1/(12m pi)+O(m^-2),
```

and

```text
4e^{1-EulerGamma}s_m^(2) - (m pi)^2 -> 1/6.
```

After the exact F30 scaling by `e`,

```text
4e^{-EulerGamma}(e s_m^(2)) - (m pi)^2 -> 1/6.
```

So both hard-head ladders share the same additive correction
`e^EulerGamma/24` in `s`-coordinates after scaling. This is a stronger
version of the F37 Bessel ruler and should be directly visible in Fable's
40-zero scan.

### Size-Bias Chain

The dilation laws also encode the exact hard-head derivative ladder. Since

```text
rho_{x+1}(t)=e^{-t}rho_x(t),
```

we have

```text
Law(U_{x+1}) = Law(U_x size-biased by U_x),
E[f(U_{x+1})]=E[U_x f(U_x)]/E[U_x].
```

This probabilistic size-bias identity is equivalent to the coefficient part
of

```text
partial_s Phi_{1,x}(s)=-Phi_{1,x+1}(e^{-1/x}s).
```

The LP problem can therefore be phrased without coefficient asymptotics:
prove that the Bessel/Sonine cosine transform remains real-zeroed under this
specific multiplicative compound-Poisson law and all of its size-biased
successors.

## Audit GPT-F41: Corrected F207 Gate and F209 Zero Constant

Fable's F207 correction supersedes GPT-F38's `5/3` gate. The fitted
finite-range law `b_eff(d)~d^0.60` is not the asymptotic law. From F205,
the effective reciprocal-curvature regression gives

```text
b_eff(d)=(2/3)d/L^2(1+O(1/L)).
```

Thus, if

```text
1-alpha_eff ~ 2/L,
d*(alpha,b) ~ (1-alpha)^(-p)b^theta,
```

then

```text
C(d)=d*(alpha_eff,b_eff)/d
    ~ const * d^(theta-1) L^(p-2theta).
```

The corrected asymptotic gate is therefore

```text
theta>1,
or theta=1 with p>=2.
```

Consequences:

```text
theta<1      effective-profile mechanism dies,
theta=1      survives only by the polylog L^(p-2),
theta=4/3    Airy survives,
theta=2      full Cauchy-head survives.
```

This restores consistency with GPT-F31: the fixed-ratio map has no caustic at
linear scale, so the natural failure scenario is not `theta=1`, but
`theta<1`. The earlier Airy demotion is retracted.

Fable's F209 constant is also exactly the GPT-F37/GPT-F40 hard-head ruler.
For `x=1`,

```text
s_m(Phi_{1,1})
  =
  e^EulerGamma[((m-1/2)^2 pi^2)/4 + 1/24 + o(1)].
```

Therefore

```text
s_m/m^2
  =
  (pi^2 e^EulerGamma/4)(1-1/(2m))^2 + O(m^-2).
```

So Fable's quick-look value near `4.03` at `m=12` is not evidence against the
`e^EulerGamma` constant; it is the expected half-index correction:

```text
(pi^2 e^EulerGamma/4)(11.5/12)^2 = 4.037... .
```

Using Fable's listed first 12 zeros, the F40 residual

```text
4e^{-EulerGamma}s_m - ((m-1/2)pi)^2
```

is already oscillating around `1/6`; at `m=12` the rounded data give
approximately `0.1606`, close to `1/6=0.1667`.

## Theorem GPT-F42: Hard-Head Tail Zeros Are Bessel-Forced

The F39 dilation law implies that any hard-head counterexample cannot be a
replacement of the Bessel tail. The tail zero lattice is forced by the atom
at `U_x=1`.

Define

```text
F_x(t)=Phi_{1,x}(t^2/(4C_x)),
C_x=exp(psi(x)),   nu_x=x-3/2.
```

Then F39 gives

```text
F_x(t)
  =
  E[Gamma(x-1/2)(sqrt(U_x)t/2)^(-nu_x)
    J_{nu_x}(sqrt(U_x)t)].
```

Write

```text
p_x=Pr(U_x=1)>0.
```

The atom contributes

```text
p_x Gamma(x-1/2)(t/2)^(-nu_x)J_{nu_x}(t),
```

while the continuous part has an endpoint density at `U_x=1` and is one
oscillatory integration by parts smaller. In any fixed horizontal strip,

```text
F_x(t)
 =
 p_x Gamma(x-1/2)(t/2)^(-nu_x)J_{nu_x}(t)
 + O(t^(-nu_x-3/2)).
```

Since

```text
Gamma(x-1/2)(t/2)^(-nu_x)J_{nu_x}(t)
  =
  A_x t^(-nu_x-1/2)
  cos(t - pi nu_x/2 - pi/4) + O(t^(-nu_x-3/2)),
```

the perturbation is smaller by `1/t` than the Bessel atom. Hence, by
Rouche on the standard Bessel-zero cells and the real sign change on the
real axis:

```text
for all sufficiently large m, F_x has exactly one simple real zero
near each positive zero j_{nu_x,m} of J_{nu_x}.
```

Moreover

```text
t_m(x)=j_{nu_x,m}+O(1/j_{nu_x,m}).
```

For `x=1` and `x=2`, GPT-F40 computes the first universal shift explicitly.

Thus the hard-head LP problem has been narrowed:

```text
the main tail is real and Bessel-phased;
any nonreal zeros must be finite-core or zero-density exceptional zeros,
not the asymptotic hard-head lattice.
```

The practical proof program is now:

```text
1. Use F42 to lock the tail.
2. Use F30/Rolle and F33/F34 certificates to rule out finite-core defects.
3. Bootstrap x=1 to the size-biased ladder x>1.
```

## Audit GPT-F43: Pólya Route and the Compound-Poisson Endpoint Obstruction

Source check: the Pólya finite-transform route is real, but the kernel
orientation matters. The Dimitrov-Rusev survey records Pólya's 1918 theorem
in the following useful form: for nonnegative monotonically increasing
`f` on `[0,1]`, the cosine and sine transforms

```text
U(f;z)=int_0^1 f(t)cos(zt)dt,
V(f;z)=int_0^1 f(t)sin(zt)dt
```

have only real and generally interlacing zeros. The same survey records
Riemann-Stieltjes variants that cover endpoint-mass limits. Modern papers
also state related Pólya theorems for positive decreasing concave kernels.

Thus Fable's proposed reduction is directionally valid:

```text
Phi_{1,x}(s) = cosine/Bessel transform of a measure on [0,1],
monotone increasing endpoint density => real zeros by Pólya.
```

However, the threshold is not obtained from the one-jump Levy kernel alone.
The compound-Poisson convolution changes the endpoint derivative.

Let

```text
Y_x=-2 log R_x=-log U_x,
R_x=sqrt(U_x),
rho_x(y)=eta(y)e^{-xy}/(1-e^{-y})
```

and write the continuous part of `Y_x` as `f_x(y)dy`. The density of `R_x`
with respect to `dv` is

```text
h_x(v)=2e^{y/2}f_x(y),      y=-2log v.
```

Therefore `h_x` is nondecreasing as a function of `v` near the endpoint iff

```text
g_x(y):=e^{y/2}f_x(y)
```

is nonincreasing at `y=0+`.

For the one-jump kernel set

```text
q_x(y)=e^{y/2}rho_x(y)
      = eta(y)e^{-(x-1/2)y}/(1-e^{-y}).
```

Using

```text
eta(y)=y/24+y^2/48+O(y^3),
eta(y)/(1-e^{-y})=(1/24)(1+y+O(y^2)),
```

we get

```text
q_x(y)=q_0+q_1y+O(y^2),
q_0=1/24,
q_1=(3/2-x)/24.
```

The full compound-Poisson continuous density contributes

```text
g_x(y)=e^{-nu_x((0,infinity))}
       [q_x(y)+(q_x*q_x)(y)/2!+...].
```

Since

```text
(q_x*q_x)(y)=q_0^2 y+O(y^2),
```

the endpoint derivative is

```text
g_x'(0+)
 =
 e^{-nu_x((0,infinity))}
 [q_1+q_0^2/2]
 =
 e^{-nu_x((0,infinity))}
 [(3/2-x)/24 + 1/1152].
```

Hence the Pólya monotone-increasing density condition is impossible near
`v=1` unless

```text
x >= 3/2 + 1/48 = 73/48.
```

This corrects Fable's `x>=3/2` one-jump threshold. The `n>=2` convolution
terms are not automatically monotone-preserving; even convolution of
decreasing positive kernels can rise at the origin. They create the extra
`1/48` endpoint obstruction.

Consequences:

```text
x=2 is still safely inside the plausible Pólya region.
x=3/2 is not covered by endpoint monotonicity.
x=1 remains outside the monotone-kernel route.
```

The revised proof target is:

```text
prove global monotonicity of h_x(v) for x>=73/48,
then use F30 to cover Phi_{1,1}' through Phi_{1,2}.
```

## Theorem GPT-F44: Anti-Derivative Finite-Core Criterion

F30 gives the exact derivative identity

```text
partial_s Phi_{1,1}(s)=-Phi_{1,2}(e^{-1}s).
```

Let `tau_m` be the positive zeros of `Phi_{1,2}`. Then the positive critical
points of `Phi_{1,1}` are

```text
c_m=e tau_m.
```

Assume:

```text
1. Phi_{1,2} is Laguerre-Polya with simple positive zeros.
2. Phi_{1,1} has Bessel-forced tail zeros as in F42.
3. There exists M such that for all m>=M, Phi_{1,1}(c_m) has the
   alternating extremum sign forced by the F42 tail phase.
```

Then `Phi_{1,1}` is Laguerre-Polya if and only if the finite list of critical
values

```text
Phi_{1,1}(c_m),   1<=m<M,
```

has the same alternating sign pattern and the initial interval contains the
required first zero.

Proof is Rolle's theorem plus the intermediate value theorem on each interval
between consecutive critical points. Since `Phi_{1,1}'` has no nonreal zeros
and the extrema alternate signs, each interval contains exactly one real zero
and there is no room for off-axis zero pairs without violating the zero count
of the derivative or the F42 tail census.

Thus the hard-head problem is reduced to a finite certificate:

```text
Pólya/monotone kernel for Phi_{1,2}
+ F42 tail phase for Phi_{1,1}
+ finitely many signed critical values Phi_{1,1}(e tau_m).
```

Those finite critical-value signs are the natural hard-head version of the
F33/F34 shadow-kernel certificates.

## Theorem GPT-F45: Fable F211 Audit and Majority-Atom Cosine Theorem

Fable's F211 proof of `Phi_{1,1}` is valid at the critical point `x=1`, and
the atom mass can be made exact rather than quadrature-based.

The general majority-atom theorem is:

```text
Psi(z)=p cos(az)+int_[0,a) cos(tz) dmu(t),
mu([0,a))=1-p,
p>1/2.
```

Then `Psi` has exactly one simple real zero in each strip

```text
m pi/a < Re z < (m+1)pi/a
```

that is, one zero in each strip bounded by consecutive maxima of the outer
atom. Proof: on vertical walls
`|cos(az)|=cosh(a Im z)` while
`|cos(tz)|<=cosh(t Im z)<=cosh(a Im z)`. On horizontal edges,
`|cos(az)|>=sinh(aH)` and the continuum is bounded by `(1-p)cosh(aH)`.
For `H>artanh((1-p)/p)/a`, Rouché compares `Psi` with `p cos(az)` on each
rectangle. The unique zero in each conjugation-symmetric strip is real.

For F39 at `x=1`,

```text
Phi_{1,1}(s)=E cos(2sqrt(e^{-EulerGamma}U_1s)).
```

With `s=e^EulerGamma w^2/4`,

```text
psi(w):=Phi_{1,1}(e^EulerGamma w^2/4)
      =p cos w+int_[0,1) cos(vw)dmu(v).
```

The no-jump atom is not merely numerical. From the F37/F39 coefficient
asymptotic,

```text
p_x=Pr(U_x=1)
   =sqrt(2pi) exp((x-1)psi(x)-x+1/2)/Gamma(x-1/2).
```

Thus

```text
p_1=sqrt(2/e),
lambda(1)=-log p_1=(1-log 2)/2,
```

so `p_1>1/2` with large margin. Therefore `psi` has only real simple zeros.
Since the substitution `s=e^EulerGamma w^2/4` is two-to-one and even, all
zeros of `Phi_{1,1}` are positive real and simple.

Consequences:

```text
Phi_{1,1} is Laguerre-Polya.
Phi_{1,n} is Laguerre-Polya for every integer n>=1 by repeated use of F30
and closure of Laguerre-Polya under differentiation.
```

The advertised F211 extension to every real `x>=1` still needs the Bessel
zero-separating contour details. The `x=1` theorem and the positive-integer
derivative ladder are complete.

## Theorem GPT-F46: Exact Finite Hard-Head Lift Form

F211 closes the limiting hard-head obstruction, but finite Jensen sections
remain. There is nevertheless an exact finite representation that isolates
the remaining lift problem.

Define the finite critical hard-head section in the hard-head scale by

```text
Psi_d(w)=P_{d,1}(e^EulerGamma w^2/(4d)).
```

Let

```text
C_d(w)=sum_{k=0}^d (-1)^k [(d)_k/d^k] w^{2k}/(2k)!.
```

Using F39's exact moments,

```text
E[U_1^k]=(2k)! e^{EulerGamma k-S_1(k)}/(4^k k!),
```

we get the exact identity

```text
Psi_d(w)=E C_d(sqrt(U_1)w)
        =p_1 C_d(w)+int_[0,1) C_d(vw)dmu(v).
```

The atom polynomial is a scaled Jensen polynomial of `cos sqrt(z)`:

```text
C_d(w)=J_d(cos sqrt(z); w^2/d),
```

with the standard Jensen convention `f(z)=sum gamma_k z^k/k!`. Since
`cos sqrt(z)` is Laguerre-Polya with positive real zeros, `C_d` is an even
real-rooted polynomial.

Finite-section lift criterion. Suppose the positive zeros of `C_d` admit
pairwise disjoint conjugation-symmetric contours `Gamma_{j,d}`, each enclosing
exactly one positive zero and satisfying the radial dominance condition

```text
sup_{0<=v<1, z in Gamma_{j,d}} |C_d(vz)| < |C_d(z)|.
```

Then the same majority-atom Rouché argument gives one simple real zero of
`Psi_d` inside each `Gamma_{j,d}`. If the contours cover all positive zeros of
`C_d`, then `P_{d,1}` is hyperbolic.

This is the finite-section analogue of the `q^2` separation mechanism in
GPT-F1. The remaining hard finite problem is no longer the compound-Poisson
smear; it is the deterministic radial-dominance/separation geometry of the
deformed cosine polynomials `C_d`.

## Theorem GPT-F47: The Finite Atom Polynomial Is Laguerre

The deformed cosine in GPT-F46 has a closed classical form. Since

```text
(2k)! = 4^k k!(1/2)_k,
(d)_k = (-1)^k(-d)_k,
```

we have

```text
C_d(w)
 =
 sum_{k=0}^d (-1)^k [(d)_k/d^k] w^{2k}/(2k)!
 =
 _1F_1(-d;1/2;w^2/(4d)).
```

Equivalently,

```text
C_d(w)=d!/(1/2)_d L_d^{-1/2}(w^2/(4d)).
```

Thus the finite hard-head lift is exactly a Laguerre-dilation average:

```text
P_{d,1}(e^EulerGamma w^2/(4d))
 =
 const * E L_d^{-1/2}(U_1 w^2/(4d)).
```

This gives a sharper finite-section target. Let

```text
0<xi_{1,d}<...<xi_{d,d}
```

be the zeros of `L_d^{-1/2}`. For fixed `u in (0,1]`, the zeros of
`L_d^{-1/2}(uz)` are `xi_{j,d}/u`. Hence the atom polynomial and its
`u`-dilate interlace whenever

```text
u > max_{1<=j<d} xi_{j,d}/xi_{j+1,d}.
```

The finite proof can therefore be split:

```text
near-atom dilations: handle by Laguerre zero interlacing / Obreschkoff;
far dilations: handle by the p_1=sqrt(2/e) atom margin on Laguerre
zero-cell contours.
```

This is more concrete than the abstract `C_d` contour statement: the only
new finite input is geometry of the classical Laguerre zeros for
`alpha=-1/2`.

## Theorem GPT-F48: Endpoint Density Audit for F40

Fable's moment-inversion audit reported a small value near `h_1(0.99)` and
asked whether the F40 endpoint constant `h_x(1-)=p_x/12` is correct. The
constant is correct; the moment reconstruction is seeing an endpoint artifact.

The general local fact is:

```text
Y compound Poisson, atom p at 0,
Levy density rho(y)=rho_0+rho_1 y+O(y^2) at 0+.
```

Then the continuous density `f(y)` of `Y` has

```text
f(y)=p[rho(y)+(rho*rho)(y)/2!+...],
f(0+)=p rho_0,
f'(0+)=p(rho_1+rho_0^2/2).
```

Only the one-jump term contributes to `f(0+)`; the two-jump term first enters
the derivative because

```text
(rho*rho)(y)=rho_0^2 y+O(y^2).
```

For the hard-head law,

```text
rho_x(y)=eta(y)e^{-xy}/(1-e^{-y})
        =1/24 + O(y).
```

With `R_x=e^{-Y_x/2}` and `y=-2log r`, the continuous density of `R_x` is

```text
h_x(r)=2e^{y/2}f_x(y).
```

Therefore

```text
h_x(1-)=2p_x rho_x(0+)=p_x/12.
```

The first endpoint slope is also explicit. Since

```text
q_x(y)=e^{y/2}rho_x(y)
      =1/24+((3/2-x)/24)y+O(y^2),
```

we have

```text
e^{y/2}f_x(y)
 =
p_x[1/24 + ((3/2-x)/24+1/1152)y+O(y^2)].
```

Thus, as `r -> 1-`,

```text
h_x(r)
 =
p_x/12
+p_x[(3/2-x)/6+1/288](1-r)
+O((1-r)^2).
```

For `x=1`,

```text
p_1=sqrt(2/e),
h_1(1-)=0.071480323...
h_1(r)=h_1(1-)+p_1(25/288)(1-r)+O((1-r)^2).
```

So a stable reconstruction should read about `0.0722` at `r=0.99`, not
`0.010`. The latter is incompatible with the local compound-Poisson
expansion and is almost certainly a moment/Gibbs artifact caused by the
endpoint atom and a low-order Legendre inversion.

The zero residual follows from this endpoint value. For

```text
F_1(t)=Phi_{1,1}(t^2/(4e^{-EulerGamma}))
     =p_1 cos t+int_0^1 h_1(r)cos(tr)dr,
```

endpoint integration by parts gives

```text
int_0^1 h_1(r)cos(tr)dr = h_1(1-) sin t/t+o(1/t).
```

Since `h_1(1-)=p_1/12`,

```text
F_1(t)=p_1[cos t+sin t/(12t)+o(1/t)].
```

Consequently

```text
t_m=(m-1/2)pi + 1/[12(m-1/2)pi]+o(1/m),
4e^{-EulerGamma}s_m - ((m-1/2)pi)^2 -> 1/6.
```

So the F40 residual prediction is unchanged.

## Audit GPT-F49: Fable F212 Effective Head Lift

Fable's F212 coefficient estimate is correct. For the rescaled finite section

```text
Psi_d(w)=P_{d,1}(e^EulerGamma w^2/(4d)),
psi(w)=Phi_{1,1}(e^EulerGamma w^2/4),
```

the coefficient ratio is `(d)_k/d^k`, with the convention `(d)_k=0` for
`k>d`. Since

```text
1-prod_i(1-a_i) <= sum_i a_i,       0<=a_i<=1,
```

we have

```text
0 <= 1-(d)_k/d^k <= k(k-1)/(2d).
```

Using the F39 cosine representation, the absolute `k`-th coefficient of
`psi` is `E[U_1^k]/(2k)! <= 1/(2k)!`. Therefore

```text
|Psi_d(w)-psi(w)|
 <= (1/d)sum_{k>=0} k(k-1)R^(2k)/(2(2k)!)
 <= (R^2/(2d))cosh R
 <= (R^2/(2d))e^R
```

for `|w|<=R`. This verifies the product-bound and cosh-majorant parts.

The F211 boundary margin on fixed-height strip rectangles is also correct.
For `p=sqrt(2/e)`,

```text
M=min(2p-1, p sinh 1-(1-p)cosh 1)=2p-1=sqrt(8/e)-1.
```

Thus, if

```text
(R^2/2)e^R < Md,
```

then Rouché gives one simple real zero of `Psi_d` in every F211 strip
`m pi<Re w<(m+1)pi` whose height-one rectangle lies inside the radius-`R`
coefficient-control region. In particular this certifies `~R/pi` real head
zeros, so taking `R=log d-2loglog d+O(1)` gives `~(log d)/pi` certified
head zeros.

The stronger sentence "every zero of `Psi_d` in `|w|<=R` is real" does not
follow from the displayed proof. A height-one strip rectangle excludes
off-axis zeros only inside `|Im w|<1`; a nonreal zero in the same disk with
larger imaginary part would require a taller contour. One repair is to run
the same argument on rectangles of height `H` around each suspected zero.
For all zeros in `|w|<=R`, the boundary can reach radius up to `sqrt(2)R`,
so a sufficient global-disk version is the stronger condition

```text
R^2 e^(sqrt(2)R) < Md,
```

up to harmless edge constants. F212 is therefore accepted as an effective
head-strip theorem, with the disk-wide zero-exclusion claim pending this
radius bookkeeping.

## Theorem GPT-F50: Exact Finite Tropical Monotonicity

Fable's proposed bulk task was to make F27's tropical monotone map rigorous at
subleading order. In fact the adjacent tropical map is already exactly
monotone at finite `d`.

For the Cauchy critical family

```text
P_{d,x}(t)=sum_{k=0}^d (-1)^k binom(d,k)exp(-alpha S_x(k))t^k,
```

F27 gives the exact adjacent coefficient ratio

```text
tau_{d,x,k}
 =
k/(d-k+1) * exp(alpha[psi(x+k-1)-psi(x)]),
1<=k<=d.
```

Then

```text
log(tau_{d,x,k+1}/tau_{d,x,k})
 =
log(1+1/k)
+log(1+1/(d-k))
+alpha/(x+k-1)
>0.
```

Therefore

```text
tau_{d,x,1}<tau_{d,x,2}<...<tau_{d,x,d}
```

for every finite `d`, every `x>0`, and every `alpha>0`.

In the fixed-ratio bulk scaling `k/d->p`, `d/x->rho`, this exact gap has
the asymptotic form

```text
log(tau_{k+1}/tau_k)
 =
[1/p+1/(1-p)+alpha rho/(1+rho p)]/d+O(d^-2),
```

uniformly on compact subintervals of `p in (0,1)`.

Consequence: there is no subleading tropical reversal to prove away. The
finite bulk obstruction, if present, is not caused by coefficient-ratio
ordering. It must live in the Sturm/interlacing displacement between actual
zeros and their tropical cells. Thus the remaining bulk proof target is
precisely the F13/F34 certificate family at bulk common-root events, not the
F27 ratio map.

## Reduction GPT-F51: Lemma B as a Stieltjes Wall Inequality

Fable's Round 255 Lemma B asks for radial dominance on vertical walls through
critical points of

```text
C_d(w)=prod_{m=1}^d (1-w^2/w_m^2),
0<w_1<...<w_d.
```

Let `lambda_m=w_m^2`, let `c` be a positive critical point of `C_d`, and put

```text
z=(c+iy)^2.
```

For `s=v^2 in [0,1]`, define the radial log-amplitude

```text
L_c(s,y)=log |C_d(sqrt(s)(c+iy))|^2.
```

Then

```text
partial_s L_c(s,y)
 =
-2 Re [ z sum_{m=1}^d 1/(lambda_m-sz) ].
```

Equivalently, writing `z=A+iB`, this is

```text
partial_s L_c(s,y)
 =
2 sum_{m=1}^d
 [s|z|^2-A lambda_m] / |lambda_m-sz|^2,
```

where

```text
A=c^2-y^2,       |z|=(c^2+y^2).
```

At `y=0` and `s=1`, this vanishes exactly because `c` is critical:

```text
sum_m 1/(lambda_m-c^2)=0.
```

Thus Lemma B is not a vague complex maximum question. It is the following
finite Stieltjes-wall problem:

```text
control exp(1/2 int_s^1 partial_u L_c(u,y)du)
 =
|C_d(c+iy)| / |C_d(sqrt(s)(c+iy))|
```

uniformly on `0<s<1`, `y>0`, and all critical walls.

A sufficient strong form would be

```text
partial_s L_c(s,y)>=0,      0<=s<=1, y>=0,
```

which implies `sup_{0<=v<=1}|C_d(v(c+iy))|=|C_d(c+iy)|` and closes Fable's
Lemma B immediately from `p>1/2`. This strong monotonicity may fail near
`y=0` on some cells; the actual needed bound is weaker:

```text
sup_{0<=s<=1}
 exp[-1/2 int_s^1 partial_u L_c(u,y)du]
 < p/(1-p)=6.031...
```

This is now an explicit rational inequality in the positive Laguerre zero
squares `lambda_m`. It is the natural wall-level analogue of the F13
polynomial certificates and the F34 Stieltjes shadow identity.

## Theorem GPT-F52: Lemma B Closes Exactly at `d=2`

The strongest differential shortcut in F51 is false, but the first
nontrivial finite section shows the right certificate form.

For `d=2`,

```text
C_2(w)=1-w^2/2+w^4/48,
c=2sqrt(3)
```

is the unique positive critical point. Put

```text
s=v^2 in [0,1],     q=y^2.
```

Then direct expansion gives

```text
|C_2(c+iy)|^2-|C_2(sqrt(s)(c+iy))|^2
 =
(1-s) P(s,q)/2304,
```

where

```text
P(s,q)=
q^4(1+s+s^2+s^3)
+48q^3(2+2s+2s^2+s^3)
+864q^2(11/4+11s/4+5s^2/3+s^3)
+6912q(4/3+s+s^3)
+6912(1-s)(1+6s-3s^2).
```

Every displayed coefficient is nonnegative for `0<=s<=1`, and the constant
term is strictly positive unless `s=1`. Hence

```text
|C_2(v(c+iy))| <= |C_2(c+iy)|,      0<=v<=1, y real.
```

Thus Lemma B holds for `d=2` with factor `1`, far stronger than the available
budget `p/(1-p)=6.031...`.

However the stronger pointwise condition

```text
partial_s log |C_2(sqrt(s)(c+iy))|^2 >= 0
```

does fail. At `q=0`,

```text
partial_q [ |C_2(sqrt(s)(c+iy))|^2 / |C_2(c+iy)|^2 ]_{q=0}
 =
(1-s)(6s^3-27s^2+12s-1)/4,
```

which is positive for

```text
0.109795318... < s < 0.378375006....
```

So the wall-ratio can have a genuine moderate-height bump above its real-axis
value. The proof of Lemma B should therefore not try to force radial
derivative monotonicity. It should instead clear denominators and prove a
positive polynomial bound for the integrated ratio, exactly as in this `d=2`
certificate.

## Theorem GPT-F53: Lemma B Also Closes Exactly at `d=3`

The `d=2` certificate is not an isolated accident. The next section also
admits an exact wall certificate, but the positivity is one level subtler:
coefficientwise positivity in `(s,q)` fails, while coefficientwise positivity
in `q` with Sturm-certified `s`-coefficients survives.

For `d=3`,

```text
C_3(w)=1-w^2/2+w^4/36-w^6/3240.
```

The positive critical points satisfy

```text
C_3'(w)=0,
r=c^2,
r^2-60r+540=0,
r_\pm=30 +- 6sqrt(10).
```

Set again `s=v^2` and `q=y^2`. For each critical wall
`c_\pm=sqrt(r_\pm)`, define

```text
Delta_\pm(s,q)
 =
 |C_3(c_\pm+iy)|^2
 - |C_3(sqrt(s)(c_\pm+iy))|^2.
```

Reducing the exact expansion by `r^2-60r+540=0` gives

```text
Delta_\pm(s,q)=(1-s) Q_\pm(s,q),
Q_\pm(s,q)=sum_{m=0}^6 q^m B_{\pm,m}(s).
```

The leading coefficient is common and manifestly positive:

```text
B_{\pm,6}(s)=
((s+1)(s^2-s+1)(s^2+s+1))/10497600.
```

The next coefficient already shows the pattern:

```text
B_{-,5}(s)=
((5-sqrt(10))s^5+(10-sqrt(10))(s^4+s^3+s^2+s+1))/291600,

B_{+,5}(s)=
((5+sqrt(10))s^5+(10+sqrt(10))(s^4+s^3+s^2+s+1))/291600.
```

The only endpoint-sensitive coefficient is `B_{\pm,0}`:

```text
B_{-,0}(s)=(1-s)A_-(s)/9,

A_-(s)=
(-5915+1870sqrt(10))s^4
+(9920-3130sqrt(10))s^3
+(-2280+690sqrt(10))s^2
+(700-182sqrt(10))s
+(215-64sqrt(10)),

B_{+,0}(s)=(1-s)A_+(s)/9,

A_+(s)=
-(5915+1870sqrt(10))s^4
+(9920+3130sqrt(10))s^3
-(2280+690sqrt(10))s^2
+(700+182sqrt(10))s
+(215+64sqrt(10)).
```

Exact Sturm checks over `Q(sqrt(10))` give:

```text
B_{\pm,m}(s)>0 on [0,1] for m=1,...,6,
A_\pm(s)>0 on [0,1],
B_{\pm,0}(s)>=0 on [0,1].
```

For the two quartics this can be read from the root locations:

```text
A_-(s) roots approximately -0.094207968, 2.413598047, 5.842887581, 6.162277660,
A_+(s) roots approximately -0.162277660, 1.480742177, 0.178490081 +- 0.339102325 i.
```

Thus every `q`-coefficient of `Q_\pm` is nonnegative for `0<=s<=1`, and hence

```text
|C_3(v(c_\pm+iy))| <= |C_3(c_\pm+iy)|,
0<=v<=1, y real.
```

Lemma B therefore holds for `d=3` with factor `1`.

### Certificate Template

For a general critical wall `c_j`, define

```text
D_{d,j}(s,q)=
|C_d(c_j+iy)|^2-|C_d(sqrt(s)(c_j+iy))|^2.
```

Since `D_{d,j}(1,q)=0`,

```text
D_{d,j}(s,q)=(1-s)Q_{d,j}(s,q).
```

The `d=2` and `d=3` certificates suggest the stronger finite-lift conjecture:

```text
Q_{d,j}(s,q)=sum_m q^m B_{d,j,m}(s),
B_{d,j,m}(s)>=0 on [0,1].
```

This is strictly weaker than coefficient positivity in `(s,q)`: for `d=3`
some raw `(s,q)` coefficients are negative. It is also different from the
false derivative-monotonicity route in F52. The right object is the
`q`-coefficient cone after reducing by the critical equation.

### Numerical Audit Warning

High-degree wall tests near deep critical points are ill-conditioned in
ordinary double precision. A double-precision `eval_genlaguerre` sweep
reported false breaches of strong dominance near `s=1`, `q~10^-9`; direct
100-digit evaluation of the finite hypergeometric sum reversed them. Example:

```text
d=40, c≈78.993798956, s≈0.9999998699, q≈8.06e-10
double precision ratio: about 1.5e4
100-digit finite-sum ratio: 0.9999999999867974.
```

So future Lemma B numerics must use the finite hypergeometric sum or
high-precision Laguerre evaluation on deep walls. Double precision can create
spurious counterexamples exactly where the critical value and wall curvature
nearly cancel.

## Theorem GPT-F54: Machine-Exact Lemma B Certificates Through `d=7`

The wall-jet cone from F53 scales several more degrees. This is not yet a hand
proof for all `d`, but it is a finite exact certificate, using algebraic
critical roots and Sturm root counts rather than floating point sampling.

Write

```text
P_d(X)=C_d(sqrt(X))
      =sum_{k=0}^d (-1)^k ((d)_k/d^k) X^k/(2k)!.
```

Critical wall squares are the positive roots of

```text
H_d(r)=P_d'(r).
```

For a critical square `r`, define

```text
D_d(s,q;r)=
|P_d(r-q+2i sqrt(rq))|^2
-|P_d(s(r-q+2i sqrt(rq)))|^2,

s=v^2, q=y^2.
```

After reduction modulo `H_d(r)=0`,

```text
D_d(s,q;r)=(1-s)Q_d(s,q;r),
Q_d(s,q;r)=sum_{m=0}^{2d} q^m B_{d,m}(s;r).
```

The `q^0` coefficient has one more expected endpoint factor:

```text
B_{d,0}(s;r)=(1-s)A_{d,0}(s;r),
```

because on the real axis `r` is a critical square. The certification problem is
therefore:

```text
A_{d,0}(s;r)>0,          0<=s<=1,
B_{d,m}(s;r)>0,          0<=s<=1, m=1,...,2d.
```

For `d=4,5,6,7`, this was checked exactly with `CRootOf` algebraic roots for
`H_d` and Sturm root counts in `s`. Each coefficient polynomial has positive
endpoint values and zero roots in `(0,1)`.

Critical polynomials used:

```text
d=4:
H_4(r)=r^3-168r^2+6720r-53760.

d=5:
H_5(r)=r^4-360r^3+37800r^2-1260000r+9450000.

d=6:
H_6(r)=r^5-660r^4+142560r^3-11975040r^2
       +359251200r-2586608640.

d=7:
H_7(r)=r^6-1092r^5+420420r^4-70630560r^3
       +5191346160r^2-145357692480r+1017503847360.
```

Approximate positive roots:

```text
d=4:
10.6612145232, 44.8124008664, 112.5263846104.

d=5:
10.4705215348, 43.1329752654, 102.7477509235, 203.6487522763.

d=6:
10.3535713715, 42.2340887622, 98.5071687079,
185.9208907090, 322.9842804494.

d=7:
10.2745965646, 41.6789601847, 96.1522231159,
177.7739019191, 295.1331560366, 470.9871621792.
```

Coefficient-root count summary:

```text
d=4: 3 walls, 9 q-coefficients per wall, Q degree (q,s)=(8,7), all pass.
d=5: 4 walls, 11 q-coefficients per wall, Q degree (q,s)=(10,9), all pass.
d=6: 5 walls, 13 q-coefficients per wall, Q degree (q,s)=(12,11), all pass.
d=7: 6 walls, 15 q-coefficients per wall, Q degree (q,s)=(14,13), all pass.
```

Consequently

```text
|C_d(v(c_j+iy))| <= |C_d(c_j+iy)|,
0<=v<=1, y real,
```

for every critical wall of `C_d` and every `d<=7`. Lemma B therefore holds
with factor `1` for `d=2,3,4,5,6,7`.

The proof object has stabilized:

```text
critical equation -> reduce in r -> divide (1-s)
-> expand in q -> Sturm certify every s-coefficient polynomial.
```

The main open problem is now to turn this finite algebraic Sturm certificate
into a structural proof for all `d`, likely by identifying a positive
three-term recurrence or total-positivity mechanism for the wall-jet
coefficients `B_{d,m}(s;r_j)`.

## Theorem GPT-F55: Krawtchouk Wall-Jet Formula and `d=8` Certificate

The wall-jet coefficients have an explicit binomial transform form. This
turns the all-degree Lemma B problem from a symbolic-expansion problem into a
sign-regularity problem for one fixed kernel.

Write

```text
P_d(X)=sum_{k=0}^d a_{d,k}X^k,
a_{d,k}=(-1)^k ((d)_k/d^k)/(2k)!.
```

For integers `k,l,m`, define the even Krawtchouk-type kernel

```text
K_{k,l,m}
=(-1)^m [x^(2m)](1-x)^(2k)(1+x)^(2l)
=(-1)^m sum_a (-1)^a binom(2k,a)binom(2l,2m-a).
```

Equivalently, if

```text
z=r-q+2i sqrt(rq)=r(1+i sqrt(q/r))^2,
```

then

```text
[q^m] z^k conjugate(z)^l = r^(k+l-m) K_{k,l,m}.
```

Therefore the quotient

```text
Q_d(s,q;r)=
{ |P_d(z)|^2-|P_d(sz)|^2 }/(1-s)
```

has the exact coefficient formula

```text
Q_d(s,q;r)=sum_{m=0}^{2d} q^m B_{d,m}(s;r),

B_{d,m}(s;r)=
sum_{k,l=0}^d
  a_{d,k}a_{d,l}
  r^(k+l-m)
  K_{k,l,m}
  (1-s^(k+l))/(1-s),
```

where terms with `m>k+l` vanish. The diagonal terms are positive because

```text
K_{k,k,m}=binom(2k,m).
```

The off-diagonal signs are the only obstruction. For example,

```text
K_{1,2,m}=(1,1,-1,-1),
K_{2,3,m}=(1,3,2,-2,-3,-1).
```

At a critical square `r`, `P_d'(r)=0`. Consequently

```text
B_{d,0}(1;r)=2r P_d(r)P_d'(r)=0,
```

so the real-axis coefficient has the extra factor

```text
B_{d,0}(s;r)=(1-s)A_{d,0}(s;r).
```

This identity reproduces the direct symbolic expansions for `d=2,3,4,5`.
More importantly, it gives a reproducible all-degree certificate recipe:

```text
1. build B_{d,m} from K_{k,l,m},
2. reduce powers of r modulo H_d(r)=P_d'(r),
3. certify A_{d,0} and B_{d,m}, m>=1, on s in [0,1].
```

Using this faster formula, the machine-exact frontier extends one more degree:
`d=8` passes all seven critical walls.

The `d=8` critical polynomial is

```text
H_8(r)=
r^7-1680r^6+1048320r^5-307507200r^4
+44281036800r^3-2975685672960r^2
+79351617945600r-544125380198400.
```

Approximate positive critical squares:

```text
10.2177162855, 41.3042759347, 94.6679826783,
173.0890111118, 281.7305464978, 430.9931437841,
647.9973237079.
```

For each of the seven algebraic roots, exact `CRootOf` substitution and Sturm
root counts give positive endpoint values and zero roots in `(0,1)` for:

```text
17 q-coefficients per wall,
Q degree (q,s)=(16,15).
```

Thus Lemma B holds with factor `1` for every critical wall and every
`d<=8`.

The all-degree target is now precise:

```text
After critical reduction H_d(r)=0, the even Krawtchouk transform above maps
the Laguerre coefficient bilinear form into the cone of polynomials positive
on [0,1].
```

This is the structural statement to prove, by sign-regularity of the
Krawtchouk kernel, a recurrence in `(d,m)`, or a sum-of-squares representation
after the critical equation is imposed.

## Theorem GPT-F56: Lemma B Splits Into a Real Axis and a Transverse Cone

The all-degree Lemma B task can be split cleanly between Fable's Lemma A and
GPT's wall-jet cone. This removes the `q^0` coefficient from the transverse
problem.

Let `r=c_j^2` be a critical square of

```text
P_d(X)=C_d(sqrt(X)),
H_d(r)=P_d'(r)=0,
```

and set

```text
z=r-q+2i sqrt(rq),   s=v^2,   q=y^2.
```

Write

```text
D_d(s,q;r)=|P_d(z)|^2-|P_d(sz)|^2.
```

Then

```text
D_d(s,q;r)=D_d(s,0;r)
          +(1-s) sum_{m=1}^{2d} q^m B_{d,m}(s;r),
```

where the `B_{d,m}` are exactly the Krawtchouk wall-jet coefficients from
GPT-F55. The real-axis term is

```text
D_d(s,0;r)=P_d(r)^2-P_d(sr)^2.
```

Therefore the full radial dominance inequality follows from two independent
statements:

```text
Lemma A_j:       P_d(r_j)^2 >= P_d(sr_j)^2,       0<=s<=1,
Transverse_j,m: B_{d,m}(s;r_j) >= 0,              0<=s<=1, m>=1.
```

Proof is coefficient separation in `q`. Since `q>=0` and `1-s>=0`, the
transverse sum is nonnegative once each `m>=1` coefficient is nonnegative; the
remaining `q^0` term is precisely the real-axis envelope monotonicity that
Fable assigned to Lemma A. Thus GPT's all-degree target is not the whole cone

```text
A_{d,0}(s;r_j)>=0 and B_{d,m}(s;r_j)>=0,
```

but only the transverse cone

```text
B_{d,m}(s;r_j)>=0,   1<=m<=2d.
```

This is a genuine reduction. The exact certificates through `d<=8` prove both
parts, but a general proof should use Lemma A for the real axis and reserve
the Krawtchouk/Sturm machinery for positive powers of `q`.

### First Transverse Coefficient

The first transverse coefficient is not an arbitrary Krawtchouk expression. It
is a weighted Sonin functional.

The Laguerre equation for `P_d` is

```text
4x P_d''(x)+(2-x/d)P_d'(x)+P_d(x)=0.
```

Define

```text
M_d(x)=x[ P_d(x)^2-(x/d)P_d(x)P_d'(x)+4xP_d'(x)^2 ].
```

Then for a critical square `r`,

```text
[q]D_d(s,q;r)= {M_d(r)-M_d(sr)}/r.
```

Derivation: expand `P_d(s(r-q+2i sqrt(rq)))` in powers of `sqrt(q)`. The
coefficient of `q` in the modulus square at `x=sr` is

```text
s[ P_d(x)^2-(x/d)P_d(x)P_d'(x)+4xP_d'(x)^2 ] = M_d(x)/r,
```

where the displayed ODE removes `P_d''`. At `x=r`, criticality gives
`P_d'(r)=0`, so the same coefficient is `P_d(r)^2=M_d(r)/r`.

Consequently, `B_{d,1}(s;r)>=0` follows from monotonicity of `M_d` on
`[0,r]`. Its derivative is the explicit quadratic form

```text
M_d'(x)=
(1+x/(4d))P_d(x)^2
-(3x/(2d)+x^2/(4d^2))P_d(x)P_d'(x)
+(4x+x^2/d)P_d'(x)^2.
```

This gives a sharper all-degree target for the first transverse jet:

```text
prove the weighted Sonin functional M_d is increasing up to every critical
square r_j.
```

The higher transverse coefficients should now be viewed as a Sonin hierarchy:
successive even normal jets of the Laguerre ODE along the critical wall. This
is more structured than the raw sign-regularity problem and may be the route
to an all-degree proof.

## Theorem GPT-F57: The First Transverse Wall Jet Is Positive in All Degrees

The first positive-height coefficient in Lemma B is no longer conjectural.
For every `d>=2`, every critical square `r_j` of `P_d`, and every `0<=s<=1`,

```text
B_{d,1}(s;r_j) >= 0.
```

Equivalently,

```text
[q]D_d(s,q;r_j) >= 0.
```

This proves the `m=1` member of the transverse cone for all degrees.

From GPT-F56,

```text
[q]D_d(s,q;r) = {M_d(r)-M_d(sr)}/r,
```

where

```text
M_d(x)=x[P_d(x)^2-(x/d)P_d(x)P_d'(x)+4xP_d'(x)^2].
```

So it is enough to prove that `M_d` is increasing up to every critical square.
The derivative is the quadratic form

```text
M_d'(x)=
A P_d(x)^2 - B P_d(x)P_d'(x) + C P_d'(x)^2,

A=1+x/(4d),
B=3x/(2d)+x^2/(4d^2),
C=4x+x^2/d.
```

The discriminant of this form is

```text
B^2-4AC = x N_d(x)/(16d^4),
```

with

```text
N_d(x)=x^3+(12d-16d^2)x^2+(36d^2-128d^3)x-256d^4.
```

For `d>=2`, the coefficients of `N_d` have signs `+,-,-,-`, so Descartes'
rule gives exactly one positive root. Since

```text
N_d(4d(4d-1))=-16d^3(12d+1)<0,
```

the discriminant is negative throughout

```text
0 < x <= 4d(4d-1).
```

Because `A>0` and `C>0`, `M_d'(x)>0` in this whole interval unless
`P_d(x)=P_d'(x)=0`, which cannot occur.

It remains to locate the critical squares. By the Laguerre identity,

```text
P_d'(x) is proportional to L_{d-1}^{1/2}(x/(4d)).
```

Let `xi_max` be the largest zero of `L_{d-1}^{1/2}`. The elementary Laguerre
Jacobi-matrix bound gives

```text
xi_max < 4(d-1)+2(1/2)+2 = 4d-1.
```

For completeness, here is the bound. Zeros of `L_n^alpha`, `alpha>=0`, are
the eigenvalues of the symmetric Jacobi matrix with diagonal

```text
b_k=2k+alpha+1
```

and off-diagonal entries

```text
a_k=sqrt((k+1)(k+alpha+1)).
```

Using `a_k <= k+1+alpha/2` and the maximum row-sum bound for the largest
eigenvalue gives `lambda_max < 4n+2alpha+2`; here `n=d-1` and `alpha=1/2`.

Therefore every critical square satisfies

```text
r_j = 4d xi_j < 4d(4d-1),
```

so `M_d` is strictly increasing on `[0,r_j]`. Hence

```text
M_d(r_j)-M_d(sr_j) >= 0,
```

and the first transverse coefficient is nonnegative for every critical wall
and every degree.

The all-degree Lemma B target is now reduced from all `m>=1` to the higher
normal Sonin jets

```text
B_{d,m}(s;r_j)>=0,   2<=m<=2d.
```

## Theorem GPT-F58: Lemma A Closes by a One-Line Sonin Energy

Fable's Lemma A endpoint residual `M_1>=1` is automatic. In fact the real-axis
term of the F56 split has a direct proof that does not need the sequence of
critical maxima.

Let `P=P_d` satisfy

```text
4xP''(x)+(2-x/d)P'(x)+P(x)=0,
P(0)=1.
```

Define the elementary Sonin energy

```text
S_d(x)=P(x)^2+4xP'(x)^2.
```

Then

```text
S_d'(x)=2P P' +4P'^2+8xP'P''
       =(2x/d)P'(x)^2 >= 0.
```

The last equality is exactly the differential equation. Also

```text
S_d(0)=P(0)^2=1.
```

If `r` is any critical square, `P'(r)=0`, so

```text
S_d(r)=P(r)^2.
```

Therefore, for every `0<=x<=r`,

```text
P(x)^2 <= S_d(x) <= S_d(r)=P(r)^2.
```

Taking `x=sr`, `0<=s<=1`, gives

```text
P_d(r)^2-P_d(sr)^2 >= 0.
```

This proves Lemma A, the `q^0` term in the F56 decomposition, for all degrees
and all critical walls. In particular the first critical extremum satisfies
`|P_d(r_1)|>=1`; no separate finite check is needed.

Combined with GPT-F57, the hard-head finite-lift certificate now has:

```text
q^0 term: closed for all d,
q^1 term: closed for all d,
q^m terms, m>=2: exact through d<=8 and under d=9 certification.
```

## Theorem GPT-F59: Lemma B Is Exact Through `d=9`

The degree-9 transverse certificate completed on GPT's allowed Runpod
container. This extends the finite exact frontier from `d<=8` to `d<=9`.

For `d=9`, the critical polynomial is

```text
H_9(r)=
-r^8 + 2448r^7 - 2313360r^6 + 1082652480r^5
-267956488800r^4 + 34727160948480r^3
-2187811139754240r^2 + 56258000736537600r
-379741504971628800.
```

The positive critical squares are approximately

```text
10.17481133219757, 41.03545685693809, 93.65489436261706,
170.0681233510005, 273.7892267723381, 411.0185547556499,
593.9787887156094, 854.2801438536495.
```

For this degree,

```text
Q_degrees q=18 s=17 r=7.
```

Exact `CRootOf/Sturm` certification of the transverse coefficients gave:

```text
wall 1: q^1..q^18 PASS
wall 2: q^1..q^18 PASS
wall 3: q^1..q^18 PASS
wall 4: q^1..q^18 PASS
wall 5: q^1..q^18 PASS
wall 6: q^1..q^18 PASS
wall 7: q^1..q^18 PASS
wall 8: q^1..q^18 PASS
```

The complete full-run certifier was stopped after wall 3 to reduce shared-host
load; this does not weaken the conclusion because GPT-F58 proves the `q^0`
real-axis coefficient for all degrees, and the transverse certifier proves all
positive `q` coefficients for every `d=9` wall. Therefore

```text
D_9(s,q;r_j)>=0,   0<=s<=1, q>=0,
```

for every critical wall `r_j`. Equivalently,

```text
|C_9(v(c_j+iy))| <= |C_9(c_j+iy)|,
0<=v<=1, y real.
```

Thus Lemma B holds with factor `1` for every critical wall and every
`d<=9`.

The remaining all-degree target is now strictly:

```text
B_{d,m}(s;r_j)>=0,   d arbitrary, 2<=m<=2d.
```

## Theorem GPT-F60: True Xi Head Retains Curvature and Is Not a Fixed-Bessel Perturbation

Fable's new pivot replaces the model curvature `alpha/(j+b)` by xi's true
Turan curvature. The head limit does not wash out this curvature. It records
the complete future curvature tail.

Let

```text
ell_j=log gamma_j,   c_j=-Delta^2 ell_j,
```

with Fable's indexing convention, and normalize the shifted Jensen section so
the first two coefficients match the usual head scaling. Then the limiting
coefficient of `s^k/k!` is exactly

```text
exp[-S_n(k)],   S_n(k)=sum_{r=1}^{k-1}(k-r)c_{n+r}.
```

Equivalently, from first differences
`delta_j=ell_{j+1}-ell_j`,

```text
ell_{n+k}-ell_n-k(ell_{n+1}-ell_n)
  = -sum_{r=1}^{k-1}(k-r)c_{n+r},
```

up to the harmless one-step index convention for `c`. Thus every fixed
curvature `c_{n+r}` changes a fixed limiting coefficient; there is no
averaging mechanism in the `d->infinity` head limit.

Now insert Fable's F205 asymptotic, with `beta=2/pi` and
`W_j=W(beta j)`:

```text
c_j = (1/j)(1 - 2/(W_j+1) + O(W_j^-2)).
```

Let `S_0(k)=sum_{r=1}^{k-1}(k-r)/r`, the critical `Phi_{1,1}` model exponent.
Then

```text
S_xi(k)=S_0(k)-2k log W(beta k)+O(k).
```

Proof sketch: the correction is

```text
2 sum_{r<k}(k-r)/(r(W(beta r)+1)).
```

The continuous primitive is explicit because

```text
d/dx log W(beta x)=1/[x(W(beta x)+1)],
int dx/(W(beta x)+1)=x/W(beta x).
```

Euler-Maclaurin then gives the displayed `2k log W(beta k)+O(k)` term. Hence

```text
exp[-S_xi(k)]
  = exp[-S_0(k)] W(beta k)^(2k) exp[O(k)].
```

This is not a Hurwitz-small perturbation of `Phi_{1,1}` under any fixed
Bessel scaling. The deviation is non-summable in the head tower.

Consequences:

1. Fable's open question has answer: the true xi head retains a genuine
   subcritical imprint. It is not exactly `Phi_{1,1}`.
2. Stronger: the imprint is not compact. It changes the global type by a
   logarithmically running scale.
3. A fixed F211 cosine-atom transfer cannot be verbatim. For a compact
   cosine-dilation representation at fixed scale `A`, the required moments
   would be

   ```text
   mu_k(A)=A^k exp[-S_xi(k)](2k)!/k!.
   ```

   Relative to the critical scale these moments acquire the factor
   `W(beta k)^(2k)exp[O(k)]`, so for every fixed `A>0` they eventually exceed
   any bounded `[0,1]` moment sequence. A finite-window `p_xi>1/2` should
   therefore be interpreted as an effective atom, not as the infinite-head
   atom used in F211.
4. Proving that `exp[-S_xi(k)]` is a Hausdorff moment sequence is not by
   itself enough for LP. It gives an exponential mixture
   `E exp(-Us)`, and positive averages of multiplier sequences are not
   generally multiplier sequences; the F211 argument needs the cosine/Bessel
   moment structure.

The replacement target is a running-Bessel theorem. Define

```text
L(k)=exp[(S_0(k)-S_xi(k))/(2k)] ~ exp[O(1)] W(beta k).
```

After the usual critical change `s=e^EulerGamma w^2/4`, the coefficient of
`w^(2k)/(2k)!` is the critical cosine coefficient multiplied by roughly
`L(k)^(2k)`. The saddle should move from `k~w/2` to

```text
k ~ w L(k)/2.
```

Thus, if the true xi head is LP, its zero counting should obey the
log-renormalized Bessel law

```text
N(w) ~ w L(w)/pi,
```

or equivalently

```text
s_m L(sqrt(s_m))^2 / m^2 = constant + lower order.
```

This is the numerical test to run against Fable's xi-head zeros. Comparing
raw `s_m` against the fixed `Phi_{1,1}` Bessel ruler should show systematic
downward drift by about `1/W(m)^2`, not convergence to the model constant.

## Theorem GPT-F61: Direct Hausdorff Moments Are the Wrong Xi-Head Test

Fable's proposed `xihead` run includes a test of whether

```text
b_k=exp[-S_xi(k)]
```

is a Hausdorff moment sequence. That test does not give the F211 atom-Rouche
representation. It gives the wrong transform.

Indeed, if `b_k` is a Hausdorff moment sequence on `[0,A]`,

```text
b_k=int_0^A u^k dmu(u),   mu>=0,
```

then

```text
Phi_xi(s)=sum_{k>=0}(-1)^k b_k s^k/k!
        =int_0^A e^{-us} dmu(u).
```

Consequently `Phi_xi(s)>0` for every real `s>0` unless the measure is zero.
This is incompatible with the desired hard-head behavior, where the
alternating Jensen limit has infinitely many positive real zeros. Direct
complete monotonicity of `exp[-S(k)]` would prove a zero-free Laplace
transform, not a Bessel/cosine atom representation.

The F39/F211 mechanism is different. One first factors out an oscillatory
Bessel kernel and only then asks whether the residual multiplier is a compact
moment sequence:

```text
Phi(s)=E B(U s),
```

where `B` is already an LP function with positive zeros. The moment sequence
is the ratio of the target coefficients to the fixed Bessel coefficients, not
the raw sequence `exp[-S(k)]`.

For the true xi head, F205 also forbids any fixed Bessel denominator from
being the final answer. Let

```text
a_k=exp[-S_xi(k)]/k!
```

be the coefficient of `s^k` in `Phi_xi`. From F60 and

```text
S_0(k)=sum_{r<k}(k-r)/r=kH_{k-1}-(k-1)
     =k log k+(EulerGamma-1)k+O(log k),
```

we get

```text
-log a_k
=S_xi(k)+log(k!)
=2k log k-2k log W(2k/pi)+O(k).
```

Therefore `Phi_xi` has order `1/2`, but infinite type at that order:

```text
rho=limsup k log k/(-log|a_k|)=1/2,
k |a_k|^(1/(2k))=exp[O(1)] W(2k/pi) -> infinity.
```

By contrast, every fixed Bessel/cosine model has

```text
-log a_k^{Bessel}=2k log k+O(k),
```

hence finite type. Dividing `a_k` by any fixed Bessel coefficient leaves a
factor

```text
W(2k/pi)^(2k) exp[O(k)],
```

up to fixed powers of `k`. This cannot be a compact dilation moment sequence
after any fixed rescaling, since compact moments are bounded by `A^k` and
`W(2k/pi)^(2k)` eventually beats every fixed `A^k`.

So the correct xi-head diagnostic is not direct Hausdorff monotonicity and not
fixed-Bessel atom mass. It is the running central-index scale. For

```text
M(R)=max_k |a_k|R^k,
```

the maximizing index `nu(R)` satisfies, at coefficient-asymptotic resolution,

```text
nu(R)=sqrt(R) W(2nu(R)/pi) exp[O(1)].
```

In the `s=e^EulerGamma w^2/4` hard-head variable this becomes

```text
nu(w)=w W(w) exp[O(1)].
```

Thus any zero scan should measure whether the real-zero count is on the
`w W(w)` scale. The finite-window question is no longer
`p_xi>sqrt(2/e)`; it is whether the normalized zero count

```text
N(w)/(w W(w))
```

stabilizes with all zeros real. A fixed Bessel ruler can look plausible at
small `K`, but it is asymptotically the wrong yardstick.

## Theorem GPT-F62: A Complex Fixed-Shift Xi Head Would Be a Falsification Route, Not a Wrong Limit

Fable's `xihead` run reports that the fixed-shift object `Phi_{xi,0}` has
nonreal zeros, then concludes that the frozen head is the wrong object because
known finite xi sections are hyperbolic up to the tested degrees. That
conclusion does not follow. The fixed-shift head limit is exactly the limit of
the normalized fixed-shift Jensen sections.

Let

```text
ell_j=log gamma_j,   c_j=-Delta^2 ell_j,
S_n(k)=sum_{r=1}^{k-1}(k-r)c_{n+r}.
```

Normalize the degree-`d`, shift-`n` Jensen section by the first coefficient
ratio and use the hard-head scaling:

```text
F_{d,n}(s)=sum_{k=0}^d (-1)^k ((d)_k/d^k) exp[-S_n(k)] s^k/k!.
```

This is the exact coefficient form of the shifted Jensen polynomial after
removing the positive affine coefficient scale. For each fixed `k`,

```text
((d)_k/d^k) -> 1.
```

Moreover `0<=((d)_k/d^k)<=1`, so on every compact `s`-set the finite sections
are dominated by the absolute series for

```text
Phi_{xi,n}(s)=sum_{k>=0} (-1)^k exp[-S_n(k)]s^k/k!.
```

Therefore

```text
F_{d,n} -> Phi_{xi,n}
```

locally uniformly. This is not a model assumption; it is the coefficient
limit of the actual fixed-shift Jensen sections.

Consequently, if `Phi_{xi,0}` has a simple nonreal zero `z0`, then by Hurwitz
or the argument principle every sufficiently large `F_{d,0}` has a zero near
`z0`. Since the coefficients are real, this gives a conjugate nonreal pair.
That would be a nonhyperbolic Jensen polynomial and hence a candidate
falsification route for RH.

The observed finite hyperbolicity through `d≈96` does not refute this. It only
says that the Hurwitz threshold, if the reported limit is correct, is larger
than the tested range. The alternatives are sharply separated:

1. `Phi_{xi,0}` was built with a normalization, sign, factorial, indexing, or
   truncation error. Then the complex zeros are not evidence.
2. The reported nonreal zeros are artifacts of finite truncation or precision.
   Then they should disappear under coefficient-depth and precision increases.
3. The nonreal zeros are genuine simple zeros of the correct limit. Then large
   fixed-shift Jensen sections should eventually become nonhyperbolic.

The drift `alpha(k)->1` is already present inside `S_0(k)`. It cannot be
invoked as an external mechanism that invalidates the fixed-shift limit. A
receding-boundary-layer theorem may still be the right way to prove
hyperbolicity if RH is true, but it must be compatible with the exact
locally-uniform convergence above. In particular, it must rule out nonreal
zeros of `Phi_{xi,0}`, not declare the object irrelevant.

The decisive next test is finite-section convergence to a reported nonreal
limit zero. Ask for one nonreal zero `z0` of `Phi_{xi,0}` and run, with exact
normalization,

```text
F_{d,0}(s)=sum_{k=0}^d (-1)^k ((d)_k/d^k) exp[-S_0(k)]s^k/k!
```

for increasing `d`. Use the argument principle on a small circle around `z0`,
not full polynomial root-finding. Outcomes:

```text
zero count -> 1 inside the circle: finite nonhyperbolicity is coming;
zero count -> 0 and coefficient convergence fails: normalization/script bug;
limit zero disappears with higher K/dps: truncation/precision artifact.
```

This is higher priority than shifted `Phi_{xi,n}` scans. Shifted scans test
the GORZ large-`n` direction; they do not decide whether the `n=0` fixed-shift
limit threatens RH.

## Theorem GPT-F63: Finite Jensen Sections Delay Head-Limit Zeros by a `d >> nu^2` Cutoff

F62 says a genuine nonreal zero of the fixed-shift head limit is eventually
inherited by finite Jensen sections. Fable's finite checks to `d≈96` can still
miss it for a simple reason: the finite sections are not close to the head
limit at coefficient indices near or above `sqrt(d)`.

The exact coefficient relation is

```text
F_{d,n}(s)=sum_{k=0}^d (-1)^k b_{n,k} ((d)_k/d^k) s^k/k!,
b_{n,k}=exp[-S_n(k)].
```

For `k=o(d^(2/3))`,

```text
log((d)_k/d^k)
=sum_{i=0}^{k-1}log(1-i/d)
=-k(k-1)/(2d)-k(k-1)(2k-1)/(12d^2)+O(k^4/d^3).
```

Thus finite `d` inserts an additional positive Gaussian curvature:

```text
((d)_k/d^k)=exp[-binom(k,2)/d+O(k^3/d^2)].
```

This is exactly the safe heat-line multiplier from GPT-F1/F32. It is not a
small perturbation at central index `nu` unless

```text
nu^2/d << 1.
```

Therefore a fixed head-limit zero `z0` can only be expected to appear in
finite degree after the central index of the head series at `z0` is far below
`sqrt(d)`.

For a general entire series `Phi(s)=sum a_k s^k`, define the local central
index

```text
nu(R)=argmax_k |a_k|R^k.
```

Then the finite Jensen section near `|s|=R` has three regimes:

```text
d << nu(R)^2:   binomial Gaussian dominates; head-limit zeros can be hidden.
d ~ nu(R)^2:   boundary-layer race; this is F27/F28's real content.
d >> nu(R)^2:  finite section approximates the fixed-shift head limit near R.
```

For the true xi head, F61 estimates

```text
nu(w)=wW(w)exp[O(1)],   s=e^EulerGamma w^2/4.
```

Hence a nonreal head zero in the range of the 40th zero can easily require
degrees much larger than `96` before the local Hurwitz transfer is visible.
Finite hyperbolicity at `d≈96` is therefore consistent with all three
possibilities from F62.

This also reconciles Fable's "drift survival" language with F62. The finite
binomial factor supplies a safe `1/d` curvature while the fixed head limit
removes it. The hard boundary layer is precisely where this extra curvature
and the xi curvature deficit balance. But this does not invalidate the fixed
head as a limit; it says the test must respect the cutoff scale.

The corrected falsification/proof audit is:

1. First stabilize a nonreal zero `z0` of `Phi_{xi,0}` under coefficient depth
   and precision.
2. Estimate its central index `nu(|z0|)`.
3. Test `F_{d,0}` by argument principle for degrees

   ```text
   d=C nu(|z0|)^2,   C=1,2,4,8,16,...
   ```

4. If the local zero count tends to one as `C` grows, fixed-shift Jensen
   nonhyperbolicity is coming. If it never appears despite coefficient
   convergence at `k<=O(nu)`, the reported head zero is not a genuine zero of
   the correct limit.

This is stronger than simply asking whether `d=96` is hyperbolic. Degree `96`
only tests head-limit zeros whose central index is comfortably below `10`.

## Theorem GPT-F64: The True-Xi Finite Edge Has a Log-Renormalized Moving Hard-Head Scale

Fable's new direction is right about one point and wrong about another.
The finite sections are governed by a moving boundary layer that samples
deeper xi curvatures as `d` grows. But that moving layer does not erase the
fixed-shift Hurwitz limit from F62. There are two different degree scales.

Let

```text
C(k)=sum_{r=1}^k c_r
```

for the true xi curvature profile. In the normalized finite section, the
adjacent coefficient-ratio scale is exactly

```text
tau_{d,k}
= [coefficient at k-1]/[coefficient at k]
= k/(d-k+1) * exp(C(k-1)).
```

The active hard-head index `kappa_d` is therefore not defined by
`kappa_d~sqrt(d)` unless `C(k)=log k+O(1)`. In general it is defined by

```text
kappa_d exp(C(kappa_d)) ~= d.
```

Using F205,

```text
c_j=(1/j)(1-2/(W(2j/pi)+1)+O(W^-2)),
```

so

```text
C(k)=log k - 2log W(2k/pi)+O(1).
```

Hence the true xi moving hard-head layer satisfies

```text
kappa_d^2 / W(2kappa_d/pi)^2 ~= const * d,
```

or, suppressing constants,

```text
kappa_d = Theta(sqrt(d) W(sqrt(d))).
```

This is the corrected version of the "alpha(sqrt d)->1" heuristic:
the layer is at `sqrt(d)` times a Lambert-W factor, and the relevant
curvature is the cumulative curvature

```text
C(kappa_d)/log(kappa_d)
  = 1 - 2log W(2kappa_d/pi)/log(kappa_d) + o(1),
```

not the pointwise value `kappa_d c_{kappa_d}`.

More precisely, for fixed `y>0`,

```text
tau_{d,floor(y kappa_d)}
 = tau_{d,kappa_d}
   y^2 [W(2kappa_d/pi)/W(2y kappa_d/pi)]^2 (1+o(1)).
```

Since

```text
log W(2y kappa/pi)-log W(2kappa/pi)
  = log y/(W(2kappa/pi)+1)+O(W^-2),
```

the local ratio curve is

```text
tau_{d,floor(y kappa_d)}/tau_{d,kappa_d}
 = y^2(1 - 2log y/W(2kappa_d/pi)+O(W^-2)+o(1)).
```

Thus the moving xi edge is a logarithmically slow perturbation of the critical
Laguerre hard head. This is the rigorous content behind the drift-survival
picture: the finite boundary layer recedes to indices where the cumulative
profile is critical to first order.

But this does not invalidate the fixed-shift head limit. For a fixed head
zero with central index `nu`, two degree scales matter:

```text
d_move(nu) ~= nu exp(C(nu)) ~= nu^2 / W(2nu/pi)^2,
d_H(nu)    ~= nu^2.
```

`d_move` is where the finite polynomial's moving hard-edge race lives.
There the binomial Gaussian is large:

```text
exp[-nu^2/(2d_move)] ~= exp[-W(2nu/pi)^2/2],
```

so the finite section is not close to the fixed head. This is the regime in
which Fable's drift language is appropriate.

`d_H` is the Hurwitz scale from F63. Once `d >> nu^2`, the finite binomial
factor is uniformly close to one across the coefficient window that builds
the fixed-head zero, so a genuine simple nonreal zero of `Phi_{xi,0}` must
transfer to `F_{d,0}`.

Therefore:

```text
d_H(nu) / d_move(nu) ~= W(2nu/pi)^2.
```

This Lambert-W-squared gap reconciles the observations:

```text
finite checks near the moving layer can look hyperbolic,
while a genuine fixed-head nonreal zero would still appear later.
```

The right proof target is not "discard the frozen head." It is a two-scale
theorem:

1. Prove a log-stable critical hard-head theorem for the moving layer, robust
   under the `O(1/W(kappa_d))` ratio perturbation above.
2. Independently audit the fixed-shift head zeros. If `Phi_{xi,0}` has a
   genuine simple nonreal zero, then RH is threatened at the larger
   `d_H~nu^2` scale.

Practical test for Fable:

```text
Given a stable nonreal zero z0 of Phi_{xi,0}, estimate its central index nu.
Test both scales:
  d ~= nu^2 / W(2nu/pi)^2       moving-layer/race scale,
  d = C nu^2, C=1,2,4,8,...     Hurwitz-transfer scale.
```

If the first scale is hyperbolic but the second scale has local argument
principle count one around `z0`, the frozen head was not wrong; it was merely
delayed by the moving finite cutoff. If both scales stay clean after
coefficient convergence is numerically certified, the reported `Phi_{xi,0}`
zero is a normalization, truncation, or precision artifact.

## Theorem GPT-F65: Xi's Moving Edge Is an Exact Renormalized Critical Edge Microlocally

F64 identifies the moving scale. The next question is whether that scale is
only heuristic or whether the finite xi edge can be compared coefficient by
coefficient with the critical Laguerre edge. There is an exact ratio identity.

Let

```text
C(k)=sum_{r=1}^k c_r,          H(k)=sum_{r=1}^k 1/r,
L(k)=exp((H(k)-C(k))/2).
```

`L(k)` is the exact cumulative drift renormalizer. For the true xi profile,
F205 gives `L(k)=W(2k/pi) exp(O(1))`; constants can be absorbed into the
choice of the effective degree.

Write the adjacent ratio of the finite xi section as

```text
tau_xi(d,k)=k exp(C(k-1))/(d-k+1),
```

and the adjacent ratio of the critical `alpha=1` finite hard head at degree
`D` as

```text
tau_crit(D,k)=k exp(H(k-1))/(D-k+1).
```

Fix a center index `kappa` and choose the effective critical degree

```text
D=d L(kappa-1)^2.
```

Then for every `k` in range,

```text
tau_xi(d,k)/tau_crit(D,k)
= [L(kappa-1)/L(k-1)]^2
  * [1-(k-1)/D]/[1-(k-1)/d].
```

This is exact. No asymptotics or model replacement are involved.

The identity has two consequences.

First, the global moving scale is just the self-consistency condition for the
critical comparison:

```text
kappa^2 ~= D = d L(kappa)^2.
```

With F205, this is precisely F64:

```text
kappa_d=Theta(sqrt(d)W(sqrt(d))).
```

Second, on one zero cell the comparison is much sharper than the macroscopic
`y=k/kappa` formula. Suppose `kappa->infinity`, `kappa=o(d)`, and

```text
|k-kappa| <= A sqrt(kappa)
```

for fixed `A`. If the exact drift renormalizer obeys the F205 local
smoothness bound

```text
Delta log L(k) = O(Delta k/(k W(k)))
```

on this window, then

```text
log[tau_xi(d,k)/tau_crit(D,k)]
= O_A(1/(sqrt(kappa)W(kappa)) + kappa/d).
```

Since the moving edge has `kappa/d -> 0`, the right side tends to zero.
Thus every fixed-width saddle window of the true xi moving edge is a
vanishing diagonal perturbation of the critical finite hard head of degree
`D=dL(kappa)^2`.

This is stronger than saying the local exponent tends to two. The entire
adjacent-ratio pattern on a root-forming coefficient window converges to the
critical Laguerre pattern. The only remaining analytic issue is uniformity of
root margins as the cell index grows.

Therefore the receding-layer proof target can be stated cleanly:

```text
Critical cell stability conjecture:
There is a margin m(kappa) for the critical Laguerre hard-head cell at
central index kappa such that any diagonal coefficient perturbation with
adjacent-ratio error o(m(kappa)) preserves the one-real-zero cell count.
```

F65 reduces the true xi moving edge to this conjecture with perturbation

```text
epsilon_xi(kappa)=O(1/(sqrt(kappa)W(kappa)) + kappa/d).
```

If the critical cell margin decays only polynomially slower than this, the
moving xi edge inherits critical hyperbolicity cell by cell. If Fable's
numerics find a cell whose margin is smaller than this quantity, that cell is
the exact place where the drift proof can fail.

This also clarifies the role of the fixed-head obstruction. F65 controls
microlocal windows near the moving scale `d_move`. It says nothing about the
larger Hurwitz scale `d_H~nu^2`, where the finite cutoff is removed and the
literal fixed head `Phi_{xi,0}` is again decisive.

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

## 2026-06-12 Addendum: Trust Filter and Endpoint-Control Lemma B

Fable's xishift K-dependence and the exact xi-head ladder sharpen the
computation standard.

For the true xi heads,

```text
Phi'_{xi,n}(s)=-Phi_{xi,n+1}(e^{-c_{n+1}}s).
```

Therefore a trusted nonreal-zero count cannot increase with the shift `n`.
Any finite truncation table where the nonreal count rises as

```text
n=0 -> 16 -> 64 -> ...
```

is measuring a moving Szego/Turan boundary, not the head limit. The filter
for a candidate zero is now:

```text
1. central index nu(|z0|) is well below section depth K;
2. tail term at K is small relative to the central term;
3. local winding count around z0 persists under K escalation;
4. F213 monotonicity in n is not violated inside the trusted window.
```

Fable's F216 converts item 2 into an exact Rouche certificate. For
log-concave head terms `T_k(R)`, if

```text
q=T_{K+2}(R)/T_{K+1}(R)<1,
```

then on `|s|<=R`

```text
|Phi(s)-P_K(s)| <= T_{K+1}(R)/(1-q).
```

Thus a candidate zero is certified only when the minimum of `|P_K|` on its
isolating circle exceeds this tail bound. The degree-90 pilot zero fails
this test: `tail/min=6.031218579...`, so it remains unclassified and must
be escalated in `K`.

The finite-lift side also has a sharper target. In the hard-head atom
representation,

```text
Psi_d(w)=p C_d(w)+int_0^1 C_d(vw) dmu(v),       p=sqrt(2/e),
```

Lemma B is equivalent to endpoint control on every Laguerre critical wall:

```text
|C_d(v(c_j+iy))| <= |C_d(c_j+iy)|,
0 <= v <= 1,  y >= 0.
```

If this holds, the whole continuous part of the mixture is bounded by

```text
(1-p)|C_d(c_j+iy)|,
```

and the atom margin is exactly

```text
(1-p)/p = 0.165821990798562...
```

relative to the atom. Fable's d=12 and d=16 referee data report precisely
this endpoint value, flat in `d`, with the maximum attained at `v=1`.

Thus the all-degree Lemma B problem should be attacked as a structural
positivity theorem:

```text
D_d(s,q;r_j)=|P_d(z)|^2-|P_d(sz)|^2
            =(1-s) sum_m q^m B_{d,j,m}(s),
z=r_j-q+2i sqrt(r_j q),  s=v^2,
```

where `P_d(X)=C_d(sqrt X)` and `P_d'(r_j)=0`. We already have the real-axis
mode and first transverse mode:

```text
B_{d,j,0} >= 0   by the Sonin energy S_d=P_d^2+4x(P_d')^2,
B_{d,j,1} >= 0   by the weighted Sonin functional M_d.
```

The remaining proof target is the Krawtchouk wall-jet cone

```text
B_{d,j,m}(s) >= 0,   m>=2, 0<=s<=1.
```

This is now preferable to more wall-search numerics: the observed flat
endpoint ratio says there is no hidden margin-collapse sequence to find.

## 2026-06-12 Addendum: F218/KM Applicability Audit

Fable's F70 no-go corrects the step-2 target. Absolute-value coefficient
majorants are cosh-scale while wall values are cos-scale, so value-Rouche
arguments certify only `O(log d)` cells. The far moving window must transport
zero phase, not values.

The natural model is still the critical Laguerre cell

```text
C_d(w)=const * L_d^{-1/2}(w^2/(4d)).
```

Kuijlaars-McLaughlin steepest descent gives the right asymptotic machine for
this model. The true-xi finite edge, however, is not automatically a
Kuijlaars-McLaughlin varying-weight orthogonal polynomial. F65 gives a
diagonal coefficient multiplier:

```text
a_k^xi = a_k^crit * exp(-E_k),
E_{k+1}-E_k
  = -log[tau_xi(d,k+1)/tau_crit(D,k+1)] + const.
```

On a root-forming window `|k-kappa|<=A sqrt(kappa)`, F65 gives

```text
osc_window(E_k)
  = O_A(1/(sqrt(kappa)W(kappa)) + kappa/d).
```

Thus the xi edge is a slowly varying amplitude perturbation of the Laguerre
steepest-descent sum. This is close to the KM setting, but it is not
off-the-shelf orthogonality unless one proves that this multiplier comes
from a legitimate varying weight preserving a three-term recurrence.

The corrected GPT-side lemma should be:

```text
Laguerre PR/Prüfer stability lemma.
Let Q_d be the critical Laguerre cell polynomial and let
Q_d^E have coefficients multiplied by exp(-E_k). If on each bulk or Airy
root window

  osc(E_k)=o(1),    osc(Delta E_k) on unit steps = o(kappa^-1/2),

then the Prüfer phase of Q_d^E differs from that of Q_d by o(1) across the
window. Hence the one-zero-per-cell count survives.
```

F65 supplies the required smallness for the moving xi edge. KM supplies the
unperturbed critical phase and Airy parametrices. The missing proof is the
stability bridge from coefficient multipliers to phase, not another
absolute-value Rouche estimate.

One notation point is essential for F218. If a statement perturbs adjacent
ratios by `rho(k)e^{-delta_k}`, then the coefficient multiplier is not
`e^{-delta_k}` but

```text
exp(-E_k),       E_k=sum_{r<=k} delta_r.
```

The affine part of `E_k` is absorbed by the F65 degree/rescale
normalization. The phase-stability lemma must control the centered
cumulative multiplier:

```text
osc_window(E_k)=o(1),     Delta E_k = local log-ratio error.
```

F65 supplies this centered estimate on `|k-kappa|<=A sqrt(kappa)`:

```text
osc_window(E_k)
  = O_A(1/(sqrt(kappa)W(kappa)) + kappa/d).
```

The proof bridge should therefore apply mode concentration to
`E(theta_E)`, then absorb the scalar part by rescaling and pass only the
fluctuation into the Prüfer potential.

The corrected cosine-mixture moment test also fits this picture. For

```text
m_k=exp(-S(k))(2k)!/(4^k k!),
```

we have exactly

```text
m_{k+1}/m_k=((2k+1)/2)exp(-C(k)).
```

With F65/F205, this grows like `const * W(2k/pi)^2`; numerically the
constant appears to approach `e`. Therefore any Stieltjes/cosine-mixture
representation of the true xi head has unbounded support. There is no
finite top endpoint and no F211-style top atom. The replacement is an
unbounded moving saddle near

```text
x_k ~= e W(2k/pi)^2,
```

which is the moment-side avatar of the same F218 phase-transport problem.

Numerically, the corrected Stieltjes Hankel tests now pass to the cache
limit:

```text
det[m_{i+j}]_{0..r}   > 0,  r=0..80,
det[m_{i+j+1}]_{0..r} > 0,  r=0..80.
```

After positive scaling to reduce conditioning, the `r=80` determinant logs
are

```text
ordinary: log10|det|=-3219.7807007003,
shifted:  log10|det|=-3251.4729191866.
```

## 2026-06-12 Addendum: SRMT/WDW Gauge Lesson for F218

The WDW/SRMT machinery in `mquantum` gives a useful template for F218. In
the WDW solver, raw amplitude matching across a turning surface is unstable:
the Stage-2 absorber damps growing and decaying Euclidean branches at the
same rate, so a value-level match carries a boundary-condition-agnostic
mixture. The successful fix is the Stage-3 Langer/Airy coordinate:

```text
extract oscillatory-side WKB phase coefficients,
map them through the Airy connection formula,
then overwrite the forbidden side with the uniform Langer basis.
```

This is the same structural correction as F70/F218. The failed F217
value comparison is a raw-amplitude match in a cosh-scale coordinate. F218
should instead match the critical Laguerre cell in its phase/action
coordinate and transport Airy/Prüfer connection data.

SRMT adds a second warning. Its affine metric can look good while hiding a
physically meaningful slope in the free parameter `alpha`; the rigid metric
is the actual conjecture test after the allowed zero-of-energy shift is
removed. For F218, this says:

```text
constant coefficient drift = amplitude gauge;
linear coefficient drift   = variable rescaling gauge;
residual centered drift    = physical perturbation.
```

The linear drift may be removed only by the F65 normalization
`D=dL(kappa)^2` and central-ratio matching. It should not be refit freely in
each cell after seeing the zero data. After this normalization, the phase
comparison is rigid.

This gives the following precise gauge lemma.

```text
Affine-gauge lemma.
Let
  Q(z)=sum_k a_k z^k,
  Q_E(z)=sum_k a_k exp(-E_k) z^k.
If E_k=B+A(k-kappa) on the active window, then
  Q_E(z)=exp(-B) exp(A kappa) Q(exp(-A)z)
up to terms outside the window.
Therefore constant and linear parts of E do not change real-root count;
they only multiply the polynomial and rescale the root coordinate.
```

Thus the real input to F218 is not `E_k` itself but its centered residual

```text
R_k = E_k - B - A(k-kappa),
```

where `B,A` are fixed by the F65 central normalization. F65 supplies

```text
osc_window(R_k)
  = O_A(1/(sqrt(kappa)W(kappa)) + kappa/d).
```

The Born-Oppenheimer diagnostic suggests the right norm. Let `v_z(k)` be the
normalized critical Laguerre saddle packet on one bulk/Airy window, and
multiply it by `exp(-R_k)`. After subtracting the packet mean of `R`,

```text
1 - |<v_z, exp(-R)v_z / ||exp(-R)v_z||>|^2
  <= Var_{|v_z|^2}(R) + O(||R||_infty^3)
  <= osc_window(R)^2/4 + O(osc_window(R)^3).
```

So the residual conditional state remains adiabatic in the same sense as the
SRMT BO test. If the unperturbed Laguerre Airy packet has a uniform phase
gap on the cell, this gives a Prüfer phase drift

```text
Delta phase = O(osc_window(R)) = o(1).
```

This is a theorem-shaped F218 bridge:

```text
F218-SRMT lemma.
Critical Laguerre Airy/Prüfer phases are stable under coefficient
multipliers exp(-E_k) after F65 affine-gauge removal, provided the centered
residual R_k has o(1) oscillation on every saddle packet and the critical
Airy packet has a nonzero local phase gap.
```

The remaining hard work is therefore local and explicit:

```text
G1. Prove the Laguerre packet phase-gap / mode-concentration estimate.
G2. Prove that F65's centered residual bound holds uniformly across the
    moving xi windows needed by the finite Jensen degree.
G3. Keep the finite arithmetic content separate: low-k heads require the
    F216-certified census, not asymptotics.
```

This aligns all three project hints:

```text
WDW Langer/Airy:     use uniform phase coordinates, not raw values.
SRMT rigid metric:   quotient only the legitimate affine gauge.
BO diagnostic:       after heavy phase removal, bound residual drift by a
                     normalized packet infidelity/variance.
```

## 2026-06-12 Addendum: F220/F222 Audit and Strengthening

Fable's F74 introduces a useful falsification-side instrument:

```text
Phi_q(s)=sum_k (-1)^k exp[-S(k)] q^{k^2} s^k/k!.
```

The proof debt is smaller than stated. The project's heat-line theorem
already proves that

```text
gamma_k=q^{k^2}=exp(-Ck^2/2),    C=-2log q>=0,
```

is a Pólya-Schur multiplier sequence for every `0<q<=1`, not only below the
ordinary partial-theta threshold. The KLV threshold concerns the ordinary
generating function `sum q^{k^2}x^k`; the Pólya-Schur action on Jensen/LP
entire functions uses the exponential-generating normalization. In the exact
normalization needed here:

```text
F(s)=sum_k a_k s^k/k! in LP
  => F_q(s)=sum_k a_k q^{k^2}s^k/k! in LP,   0<q<=1.
```

Therefore the contrapositive detector is stronger:

```text
If Phi_q has a certified nonreal zero for any 0<q<=1,
then Phi is not in LP.
```

This is one-way only. Damping can hide nonreal zeros, so a real-zero
`Phi_q` proves nothing about `Phi`; but a certified complex zero is
artifact-free because the `q^{k^2}` tail is superexponentially small and can
be bounded directly.

This also changes the computational strategy. Instead of choosing the
small KLV value `q≈0.309`, choose a sequence of `q` values tending upward:

```text
q=0.5, 0.7, 0.85, 0.93, 0.97, ...
```

Each scan is a valid one-way detector. Larger `q` is closer to the original
head and still avoids Szegő-section artifacts once the Gaussian tail is
certified.

F222 is also adopted as a finite-census upgrade. For a real degree-`d`
polynomial with Newton power sums

```text
p_m=sum_{r=1}^d alpha_r^m,
```

the Hermite matrix

```text
H=(p_{i+j})_{0<=i,j<d}
```

is positive semidefinite iff the polynomial is hyperbolic, with positive
definiteness corresponding to simple real roots. The `p_m` are obtained from
the coefficients by Newton identities, so no numerical root finder is needed.
For Jensen sections with interval-enclosed coefficients, this gives:

```text
interval moments -> interval c_j -> interval coefficients
-> interval Newton sums -> interval Hermite matrix PSD.
```

That is the right way to turn the finite arithmetic census into
theorem-grade computation.

F221 should remain a watch item, not a proof route. The local review already
records the two blockers:

```text
1. The cosine transform of a measure is not the A-function of its canonical
   system in general; the inverse spectral map is nonlinear.
2. The corrected xi cosine/Stieltjes support is unbounded
   (m_{k+1}/m_k~e W(2k/pi)^2), so compact top-atom transfer is unavailable.
```

The surviving value is vocabulary and possible inverse-spectral structure,
especially for the model measure in F39/F211. It should not be used as an LP
proof without constructing the actual canonical system and identifying the
target entire function as its structure function.

## 2026-06-12 Addendum: F224 W-Telescoping Cache Sum

Fable's F76/F224 identity isolates the constant in the true-xi running scale.
With

```text
c_j^W = j^-1 * (1 - 2/(W(2j/pi)+1)),
S(k)  = sum_{r=1}^k (c_r-c_r^W),
```

and cached xi moments through `j=170`, GPT reconstructed

```text
c_j = 2 loggamma_j - loggamma_{j-1} - loggamma_{j+1}
```

from the archived file

```text
artifacts/runpod/gpt_rh_final_20260612_133134/xihead_audit/run_20260612_123309/xi_log_moments.json
```

using the reproducibility script

```text
scripts/research/hilbertPolya/gpt_f76_sinf_cache.py
```

The requested partial sums are:

```text
S(40)  = 0.9720053891554054548522328445142213661365812686572
S(80)  = 0.9870194399988183623768016381474404733935084959040
S(120) = 0.9922913714088232344897107519048474454865266808729
S(166) = 0.9952928547129190395694336703337480900247697232202
```

Fable's pre-registration says the unbounded cosine-mixing scale has exact
constant `e` iff

```text
S_inf = 0.99870846.
```

Thus the remaining tail required after `166` is

```text
S_inf - S(166) = 0.00341560528708096043056632966625.
```

The directly observable constant

```text
c0(k)=sum_{r<=k}c_r - log k + 2log W(2k/pi)
```

converges toward `-1` in the cached range:

```text
k    c0(k)                  exp(-c0(k))/e
40   -1.02162937653426146   1.02186498713613457
80   -1.00867018007074562   1.00870787494366394
120  -1.00424687367478006   1.00425590442240728
140  -1.00297059871955976   1.00297501532016929
160  -1.00200916532281952   1.00201118504789408
166  -1.00176529522059602   1.00176685427146400
169  -1.00164976339554889   1.00165112500385376
```

Conclusion:

```text
The cache strongly supports the `x_k ~ e W(2k/pi)^2` scale, but the cache
alone does not prove it. The proof-grade target is now a positive tail bound
for sum_{r>166}(c_r-c_r^W), or an extended moment cache showing convergence
of c0(k) to -1 with certified residual.
```

This matters for F218 because the affine gauge in F65 depends on the running
scale constant. If `c0=-1`, then the true-xi mixing saddle is exactly

```text
x_k ~ e W(2k/pi)^2,
```

and the residual drift fed into the F218-SRMT lemma is a marginally irrelevant
correction after the `e W^2` affine rescaling.

## 2026-06-12 Addendum: G2 Centered-Residual Uniformity

Fable F81 assigns G2 to GPT:

```text
G2. Make F65 centered-residual control uniform over the moving xi windows.
```

The right object is the cumulative coefficient multiplier, not the adjacent
ratio error. Fix a moving center `kappa`, put

```text
I_A(kappa)={k: |k-kappa|<=A sqrt(kappa)},
D=d L(kappa)^2,
```

and compare true-xi finite coefficients with critical finite hard-head
coefficients:

```text
a_k^xi(d)=a_k^crit(D) exp(-E_k).
```

The affine part of `E_k` is gauge:

```text
E_k=B+A_1(k-kappa)+R_k,
```

with `B,A_1` absorbed by amplitude and variable rescaling. Only the centered
residual `R_k` matters for F218.

Discrete interpolation supplies the uniform estimate. If `f_k` is a sequence
on an interval of length `N` and `ell_k` is the affine interpolant through the
interval endpoints, then

```text
osc(f-ell) <= (N^2/8) sup |Delta^2 f|.
```

For the multiplier `E_k`, the second difference splits into curvature and
finite-binomial pieces:

```text
Delta^2 E_k
  = (c_k-1/k) + O(1/d+1/D)
```

up to harmless sign conventions. F205/F224 gives, uniformly on
`I_A(kappa)`,

```text
c_k-1/k = -2/[k(W(2k/pi)+1)] + O(1/(k W(k)^2)).
```

Since `N=O_A(sqrt(kappa))`, `D~kappa^2`, and the moving edge has
`kappa/d -> 0`, the centered residual obeys

```text
osc_{I_A}(R_k)
  = O_A(1/W(kappa) + kappa/d).
```

This is `o(1)`. It is weaker than the older shorthand
`O(1/(sqrt(kappa)W)+kappa/d)` sometimes written for adjacent-ratio
perturbations, but it is the correct cumulative-multiplier bound and it is
strong enough for F218-SRMT because G1 only needs `osc(R)=o(1)`.

The unit-step variation needed by the Prüfer bridge is also uniform:

```text
sup_{I_A} |Delta^2 E_k|
  = O_A(1/(kappa W(kappa)) + 1/d)
  = o(kappa^-1/2),
```

using the moving-edge scale `d~kappa^2/L(kappa)^2`. Therefore G2 reduces to
the effective form of F205/F224 on all sufficiently large moving windows,
plus finite census for the remaining bounded windows.

The proof payload for the F218-SRMT head theorem is:

```text
After affine-gauge removal, the true-xi coefficient multiplier has
centered oscillation O_A(1/W+kappa/d)=o(1) and second-difference
O_A(1/(kappa W)+1/d)=o(kappa^-1/2) on every fixed-A saddle packet.
```

Open arithmetic tail:

```text
F224 currently supplies the scale constant from cache through k=169.
An extended cache or analytic tail bound should upgrade c0=-1 from strong
evidence to theorem-grade input, but G2's o(1) uniformity needs only the
F205-order bound, not the exact constant.
```

## 2026-06-12 Addendum: q-Deformed Ladder and F76 Extension

Fable F84 proposes the q-deformed head

```text
Phi_{n,q}(s)=sum_{k>=0} (-1)^k exp[-S_n(k)] q^{k^2} s^k/k!,
0<q<=1.
```

The ladder identity is exact. Differentiating and putting `k=m+1` gives

```text
d/ds Phi_{n,q}(s)
= -sum_{m>=0} (-1)^m exp[-S_n(m+1)] q^{(m+1)^2} s^m/m!
= -q Phi_{n+1,q}(q^2 exp[-c_{n+1}]s),
```

using

```text
S_n(m+1)=S_{n+1}(m)+m c_{n+1},
q^{(m+1)^2}=q q^{2m}q^{m^2}.
```

Consequently, for every damping level `q`, LP at shift `n` implies LP at
shift `n+1` by derivative closure and positive real dilation.

Write `t=-log q`. If `t1>=t0`, then

```text
Phi_{n,t1}
```

is obtained from `Phi_{n,t0}` by applying the F1 Pólya-Schur multiplier

```text
exp[-(t1-t0)k^2].
```

So LP is upward closed in damping time `t` and downward closed in `q`. With

```text
n_c(t)=min { n>=0 : Phi_{m,t} is LP for every m>=n },
```

`n_c(t)` is nonincreasing in `t`; equivalently `n_c(q)` is nondecreasing as
`q` increases to 1. `RH(head)` is equivalent to `n_c(0)=0`, and hence to the
whole monotone staircase being identically zero. A certified non-LP zero at
any `q<1`, `n=0` falsifies the undamped head by contrapositive; certified LP
at finitely many `q<1` only lower-bounds the critical `q_c`.

The q-axis is therefore a covariant instrument. This is unlike hard
truncation `K`, whose Szego/Turan artifacts are not tied to a
Pólya-Schur semigroup.

F76 extension:

```text
archive: artifacts/runpod/gpt_rh_f76_extend_20260612_140122/
sha256: 82c7d11337664988c5fc242bd891708f251d60a9042a135fc189ab508feee256
jmax: 360
dps: 300
```

The extended cache gives

```text
S(166)=0.99529285471291903956943367033374809002476972322022
S(200)=0.99664636718784532849770632374273866690333286722146
S(240)=0.9977596685505956925491843362458360459663566865145
S(280)=0.99856225343505658415804788437317843847048105402231
S(320)=0.999168682283630483567809559355026294686263082815
S(359)=0.99963266628162076474285401355869058581433797707528
```

This crosses the earlier target `S_inf=0.99870846`. Direct constant estimates
remain close to `c0=-1`, but now from the other side:

```text
c0(166)=-1.001765295220596022542166972242924563792
c0(240)=-0.9997496107061855533106747394961830115695
c0(359)=-0.9982364279015664681907889329184881254312
exp[-c0(359)]/e=0.998237982081069529525717485338745341061
```

Residual blocks `c_j-c_j^W` remain positive through `j=359`. Thus the cache
does not prove the exact affine constant; it sharpens the missing theorem:
derive the next W-asymptotic correction or a certified signed tail bound.
This is separate from G2, which needs only the `O(1/(kW(k)))` curvature drift
and the centered-residual estimate `osc(R)=O_A(1/W+kappa/d)=o(1)`.

## 2026-06-12 Addendum: Constant Curvature Clock and F228 Telescoping

Fable F85's F227 is exact. Put `q=exp(-epsilon)`. A constant curvature
surplus

```text
c_r -> c_r + 2epsilon
```

changes the head exponent by

```text
2epsilon sum_{r=1}^{k-1}(k-r) = epsilon k(k-1).
```

Therefore

```text
Phi_{n,q}(s)
= sum_k (-1)^k exp[-S_n(k)] exp[-epsilon k^2]s^k/k!
= Phi_n^{(+2epsilon)}(qs).
```

The additional `q^k` is affine gauge. Hence q-damping, constant curvature
surplus, and the F1 heat-line multiplier are the same LP-preserving operation
modulo positive real variable scaling.

Fable F86 identifies a real flaw in the v2 transport language: replacing
`exp[-E(theta)]` by a scalar on an oscillatory window compares against
term-magnitude sums, while the actual value is cancellation-suppressed. The
BO/coefficient-packet estimate remains a coefficient-space statement only;
it is not a zero-count theorem.

The v3-compatible F218-GPT role is:

```text
G2 supplies finite-difference bounds on E_k.
Remove affine E_k as exact gauge.
Insert higher jets as perturbations of the Laguerre-cell ODE coefficients.
Match solution data off-axis in Zone III, where magnitude comparison is safe.
Propagate through the Airy/oscillatory zones by ODE/Pruefer transport.
Count zeros from transported phase, not termwise value estimates.
```

The bound entering this transport is the pointwise coefficient perturbation

```text
Delta^2 E_k = (c_k-1/k)+O(1/d+1/D)
            = O(1/(kappa W(kappa))+1/d).
```

For bulk windows this recovers the previous small phase budget. For the Airy
edge, use this pointwise ODE-coefficient perturbation directly; do not use
the total oscillation of `E_k` over a `kappa^(2/3)` packet as the zero-count
control norm.

Fable F87's F228 telescoping identity is exact with an index convention:

```text
LG_j = log(moment_j) + log Gamma(j+1) - log Gamma(2j+1),
c_j  = 2LG_j - LG_{j-1} - LG_{j+1}.
```

Then

```text
c_j = (LG_j-LG_{j-1}) - (LG_{j+1}-LG_j),
C(k)=sum_{j=1}^k c_j
    = (LG_1-LG_0) - (LG_{k+1}-LG_k).
```

Thus

```text
S(k)=C(k)-C^W(k)
    = A - [(LG_{k+1}-LG_k)+C^W(k)],
A=LG_1-LG_0=log(M_2/(2M_0)).
```

The cached Phi kernel is globally scaled relative to Fable's Xi
normalization, but `A` is scale invariant. From the archived cache:

```text
M_0 = 0.49712077818831410991277373968539771980729360955770518593323423399849552904554349
M_2 = 0.022971944315145437535249876497632170264593013837589063499144622165183631858892554
A   = -3.7677065326292670057110312914149004284968287898000080944579008087128584571928877
```

If the revised target `S_inf=1` is correct, then the exact analytic target is

```text
LG_{k+1}-LG_k + C^W(k) -> A-1
= -4.7677065326292670057110312914149004284968287898000080944579008087128584571928877.
```

Cache evidence from `j<=360`:

```text
k=166 S(k)=0.99529285471291903956943367033374809002476972322022
k=240 S(k)=0.9977596685505956925491843362458360459663566865145
k=320 S(k)=0.999168682283630483567809559355026294686263082815
k=359 S(k)=0.99963266628162076474285401355869058581433797707528
```

At `k=359`, the remaining gap to `S_inf=1` is

```text
0.00036733371837923525714598644130941418566202292471872.
```

Reproducibility:

```text
script: scripts/research/hilbertPolya/gpt_f228_telescoping.py
output: artifacts/runpod/gpt_rh_f76_extend_20260612_140122/f228_telescoping.json
```

## 2026-06-12 Addendum: F88 Closed Zero-Data Constant

Fable F88 supersedes the intermediate `S_inf=1` target by closing the affine
constant in terms of central zero data. The cache verifies the closed form.

The global scale difference between the cached Phi kernel and Xi cancels in
moment ratios. With Xi normalization:

```text
M_0 = 0.49712077818831410991277373968539771980729360955770518593323423399849552904554349
M_2 = 0.022971944315145437535249876497632170264593013837589063499144622165183631858892554
M_2/M_0 = 0.046209986230837941577867620860678028006763520794844180246365001121527495908012326
```

Therefore

```text
c0 = log(8M_2/M_0)
   = -0.99511781038948576804210280558219415619482825235898707797518077073928396931410885
exp(-c0)
   = 2.7050430046781109373306180620323100273605569639163249930615102194788091615481771.
```

Equivalently, using the centered Hadamard identity in Fable's notation,

```text
c0 = log(16 sum_{gamma>0} gamma^-2).
```

With the current `C*=1.28796206` approximation for the W-model constant,

```text
c0^W = EulerGamma - 2C*
S_inf = c0 - c0^W
      = 1.0035906447089811886611843592073082627691159273260893232190519943758483039082265.
```

Cache trajectory for

```text
r_k = ((2k+1)/2) exp[-C(k)]
```

relative to `W(2k/pi)^2`:

```text
k=160: 2.73226051121661801871185712492089545598
k=200: 2.72686682592145691034408314069447902419
k=240: 2.72326295433932368758618559974338205203
k=280: 2.72068395615880188279495597466961967575
k=320: 2.71874663661259126334020788544012960488
k=359: 2.71727140417022488720545397987265005169
```

This is monotonically moving toward `2.705043004678...` on the archived range.
At `k=359`,

```text
S(359)=0.99963266628162076474285401355869058581433797707528
S_inf-S(359)=0.003957978427360423918330345648617676954777950250808.
```

The proof target becomes the Watson/Laplace step

```text
Delta LG(k)
= 2 log(W(2k/pi)/2) - log(2(2k+1)) + o(1),
```

combined with the exact F228 telescope. F65/F71 use this only for sharp scale
calibration; G2/v3 transport still uses the weaker finite-difference drift
bounds.

## 2026-06-12 Addendum: Watson Ratio Proof of F88

The F88 Laplace step can be written as a ratio theorem. Let

```text
M_j = int_0^infty Phi(t)t^(2j)dt,
LG_j = log M_j + log Gamma(j+1) - log Gamma(2j+1),
W_j = W(2j/pi),      u_j=W_j/2.
```

For large `t`, the theta kernel has the expansion

```text
Phi(t)=2pi^2 exp(9t/2-pi e^(2t))
       [1+O(e^(-2t))+O(exp[-3pi e^(2t)])].
```

The main exponent

```text
2j log t - pi e^(2t)
```

has saddle

```text
u_j e^(2u_j)=j/pi,
u_j=W(2j/pi)/2.
```

The `9t/2` factor shifts the saddle by `O(u_j/j)`. The second `n=1` kernel
term contributes `O(e^(-2u_j))=O(W_j/j)` on the saddle scale, and all `n>=2`
terms are `exp[-Omega(j/W_j)]`. The saddle curvature is

```text
-2j/u_j^2 - 4pi e^(2u_j) = -4j/u_j + O(j/u_j^2),
```

so the width is `O((u_j/j)^(1/2))`, with relative width `o(1)`. Hence the
probability measure proportional to `Phi(t)t^(2j)dt` concentrates at `u_j`:

```text
M_{j+1}/M_j = E_j[t^2] = u_j^2(1+o(1)).
```

Therefore

```text
LG_{j+1}-LG_j
= log(M_{j+1}/M_j) + log(j+1) - log((2j+2)(2j+1))
= 2log(W_j/2) - log(2(2j+1)) + o(1).
```

With F228,

```text
C(k)=A-(LG_{k+1}-LG_k),       A=LG_1-LG_0=log(M_2/(2M_0)),
```

so

```text
C(k)=A-2log(W_k/2)+log(2(2k+1))+o(1).
```

Thus

```text
c0 = lim_k [C(k)-log k+2log W_k]
   = A+log16
   = log(8M_2/M_0)
   = log(16 sum_{gamma>0} gamma^-2).
```

Archived-cache ratio check:

```text
k=160: M_{k+1}/M_k / (W_k/2)^2 = 1.01006176481905723100607236310293079078
k=200: M_{k+1}/M_k / (W_k/2)^2 = 1.00806782783327428783428738494014907040
k=240: M_{k+1}/M_k / (W_k/2)^2 = 1.00673554898376961286222392107641498516
k=280: M_{k+1}/M_k / (W_k/2)^2 = 1.00578214522047946323484653576571624399
k=320: M_{k+1}/M_k / (W_k/2)^2 = 1.00506595714403845576059801719687066316
k=359: M_{k+1}/M_k / (W_k/2)^2 = 1.00452059337724617041337836450900324392
```

This closes the constant at theorem shape. The remaining formal labor is
only the standard Watson bounding package: off-saddle exponential loss,
theta-tail suppression, and Gaussian moment expansion at the shifted saddle.

## 2026-06-12 Addendum: Frozen-Head Circularity

Fable F89 identifies a central circularity: the fixed xi head is exactly
Riemann Xi in changed coordinates.

With

```text
LG_j = log M_j + log Gamma(j+1) - log Gamma(2j+1),
c_j = 2LG_j - LG_{j-1} - LG_{j+1},
S_0(k)=sum_{r=1}^{k-1}(k-r)c_r,
Delta0=LG_1-LG_0,
```

we have

```text
c_j = -Delta^2 LG_{j-1},
LG_k = LG_0 + k Delta0 - S_0(k).
```

Therefore

```text
e^{-S_0(k)}/k!
= (M_k/(2k)!) exp(-k Delta0)/M_0.
```

Since

```text
Xi(z)=sum_{k>=0}(-1)^k M_k z^(2k)/(2k)!,
```

the frozen head is

```text
Phi_{xi,0}(s)=Xi(sqrt(exp(-Delta0)s))/Xi(0).
```

Thus fixed-head LP is exactly RH.

Cache verification:

```text
script: scripts/research/hilbertPolya/gpt_f89_head_identity.py
output: artifacts/runpod/gpt_rh_final_20260612_133134/xihead_audit/run_20260612_123309/f89_head_identity.json
max log-coefficient error through degree 90 = 8.1789141241617601921916806975e-118
```

Zero scaling:

```text
exp(Delta0)=0.023104993115418970788933810430339014003381760397422...
s_n=exp(Delta0) gamma_n^2.
```

The first archived head roots match this identity:

```text
n=1 predicted 4.616157083428723231400095157403748..., archived 4.6161570834287232314000951574
n=2 predicted 10.210700666537783384252803599800381..., archived 10.2107006665377833842528035998
n=3 predicted 14.453166636642069725520956966646944..., archived 14.4531666366420697255209569666
n=4 predicted 21.387670308591995377118113576926776..., archived 21.3876703085919953771181135769
n=5 predicted 25.062408432884843292020135871201047..., archived 25.0624084328848432920201358712
```

Consequences:

```text
Head census/staircase planning is halted as a proof route.
F62/K-escalation was Xi zero verification in head coordinates.
F228/F88 constants are identity bookkeeping.
The q-damped family remains a one-way falsification detector:
Xi_q(z)=sum_k (-1)^k M_k q^(k^2)z^(2k)/(2k)!.
```

Non-circular remap:

```text
1. all-degree finite-d transverse Krawtchouk cone beyond d=9;
2. finite-d bulk tiling / F7-F8 geometry;
3. K'/Weil route after circularity audit.
```

## Addendum: F91 Wall Energy and Psi-Barrier Audit

Fable's F91 wall argument supersedes the `d<=9` wall certificates for the
specific F211/Rouche atom-budget bound, while leaving the stronger
Krawtchouk coefficient cone as an independent diagnostic.

The coordinate identification is exact:

```text
C_d(w)=P_d(w^2),   r=c^2,   q=y^2,   s=v^2,
z=r-q+2i sqrt(rq)=(c+iy)^2.
```

Hence the wall-jet quotient is the vertical-wall quotient:

```text
Q_d(s,q;r)=
{|P_d(z)|^2-|P_d(sz)|^2}/(1-s)
= {|C_d(c+iy)|^2-|C_d(v(c+iy))|^2}/(1-v^2).
```

The exact ODE

```text
C_d''(w)-(w/2d)C_d'(w)+C_d(w)=0
```

gives the complex Sonin energy identity, for fixed `y`,

```text
d/dx (|C_d(x+iy)|^2+|C_d'(x+iy)|^2)
= (x/d)|C_d'(x+iy)|^2.
```

For `psi=C_d'/C_d`,

```text
d_y psi=i[(w/2d)psi-1-psi^2],
d_y|psi|^2=-(y/d)|psi|^2-2(1-|psi|^2)Im psi.
```

Since

```text
C_d(w)=const * L_d^(-1/2)(w^2/(4d)),
```

all zeros of `C_d` are real and simple; therefore `Im psi<0` in the
upper half-plane. Starting from a critical wall foot `psi(c)=0`, the
circle `|psi|=1` cannot be crossed from below because the derivative
there is `-y/d<0`; above it, both terms are negative. Thus
`|psi(c+iy)|<1` for `y>0`.

The factor-level monotonicity

```text
d/d(y^2) |1-(x+iy)^2/rho^2|^2
=2(rho^2+x^2+y^2)/rho^4>0
```

then gives, on every critical wall,

```text
sup_{0<=v<=1} |C_d(v(c+iy))|/|C_d(c+iy)| < sqrt(2).
```

This is enough for the hard-head atom decomposition because

```text
p=sqrt(2/e),   ((1-p)/p)sqrt(2)=0.2345...<1.
```

Scope note: this is not the naked wall dominance
`|C_d(vw)|<=|C_d(w)|`, nor does it prove `B_{d,m}(s;r_j)>=0`. The
Krawtchouk/Sturm frontier remains useful as a stronger cone and
numerical referee. A `d=10` transverse run was launched on GPT's
dedicated Runpod under `/workspace/gpt_rh/walljet_d10/`.

F92 cap audit status: the remaining cap lemma is plausible but not yet
closed. The transformed equation

```text
C_d(w)=exp(w^2/8d)u(w),
u''+Omega^2u=0,
Omega^2=1+1/(4d)-w^2/(16d^2)
```

gives zero spacing at least `pi^- = pi/sqrt(1+1/(4d))`. Therefore the
Poisson part satisfies the cap bound

```text
|Im C_d'/C_d(x+iH)| <= 1 + 1/H + O(1/d).
```

For the real part, the continuous WKB density

```text
rho(t)=sqrt(A^2-t^2)/(4pi d),   A=4d sqrt(1+1/(4d)),
```

has principal-value transform `x/(4d)`, matching the real gauge
contribution in `C_d'/C_d`. The proof debt is now an explicit
Pruefer/edge discrepancy bound pushed through the height-`H` Hilbert
kernel, with final constant below the required `5.95`.
