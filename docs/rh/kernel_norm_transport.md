# Kernel-Norm Transport Note (Lane B)

_GPT note, 2026-06-12. Status: theorem-shaped reduction plus a named open
kernel-realization lemma. This is the beta step of the F103 transport chain._

## 1. Socket from Theorem M and Corollary T

Let `Psi_d` be the critical model lift from Theorem M, and keep `H=pi`.
Corollary T gives the absolute floor

```text
|Psi_d(w)| >= 1/8
```

on every finite Theorem-M cell boundary, and also gives the off-strip floor

```text
|Psi_d(w)| >= 0.403 |C_d(w)| >= 1/8,        |Im w| >= H.
```

Thus the beta step only has to prove, for the target finite Jensen section
`F_d`,

```text
sup_cell_boundary |F_d - Psi_d| < 1/8
```

plus the corresponding off-strip estimate. With the F107 correction, this
Rouche socket proves transport for the finite Jensen-section class:

```text
F_d even real polynomial, degree <= 2d.
```

For non-polynomial entire targets, finite cell-boundary control must be
supplemented by an independent exterior-strip no-extra-zeros statement.

## 2. Section-Kernel Norm

For a cosine kernel representation

```text
F(w) = int Phi(u) cos(wu) du,
```

the raw entire-function difference satisfies

```text
|Delta F(x+iy)| <= int |Delta Phi(u)| exp(|y|u) du.
```

For degree-`d` Jensen sections, use the induced finite-section operator
`J_d`. Define the weighted section norm

```text
||Delta Phi||_{J,d,H}
  := int |Delta Phi(u)| K_{J,d,H}(u) du,

K_{J,d,H}(u)
  := sup_{w on the relevant cell boundaries, |Im w| <= H}
     |J_d[cos(u .)](w)|.
```

Then, tautologically but usefully,

```text
sup_boundary |J_d[Delta Phi](w)| <= ||Delta Phi||_{J,d,H}.
```

Therefore the beta target is

```text
||Delta Phi||_{J,d,H} < 1/8.
```

This formulation is immune to the F217 coefficient-majorant failure only if
`||.||_{J,d,H}` is controlled as a genuine kernel norm. Replacing it by a
sum of absolute coefficient magnitudes would reintroduce the cosh/cos gap.

## 2a. Exact Section-Kernel Identity

Here the abstract weight can be made concrete. With the normalization used in
Theorem M,

```text
C_d(w)=sum_{k=0}^d (-1)^k ((d)_k/d^k) w^(2k)/(2k)!.
```

The degree-`d` Jensen operator on an even cosine transform multiplies the
`2k`-coefficient by `((d)_k/d^k)` and truncates at `k=d`. Therefore

```text
J_d[cos(u .)](w)
 = sum_{k=0}^d (-1)^k ((d)_k/d^k) (uw)^(2k)/(2k)!
 = C_d(uw).                         (JK)
```

Consequently

```text
K_{J,d,H}(u)
 = sup_{w on Theorem-M boundaries, |Im w| <= H} |C_d(uw)|.
```

This identity is useful in two directions:

1. For compact model dilations `0 <= u <= 1`, the same vertical
   monotonicity and wall/cap controls used in Theorem M bound the integrand
   by model quantities already present in the proof.
2. For the true-xi comparison, F71/F205 imply that any cosine-mixture
   representation has unbounded effective support. Thus the beta tail problem
   is not a generic coefficient tail; it is specifically the weighted
   estimate

   ```text
   int_{u outside the common saddle} |Delta Phi(u)| sup_boundary |C_d(uw)| du.
   ```

   This is exactly where the positive-kernel saddle localization must enter.
   The identity (JK) prevents hiding this issue behind coefficient
   majorants.

## 3. Positive-Kernel Perturbation Lemma

Let `nu_ref` and `nu_tgt` be positive section kernels after the affine gauge
has been removed. Suppose a central kernel region `A` and a residual function
`R` satisfy

```text
d nu_tgt = exp(-R) d nu_ref          on A,
osc_A R <= eta,
nu_ref(A^c; J,H) + nu_tgt(A^c; J,H) <= T,
```

where `nu(B; J,H)` denotes the same weighted mass used in
`||.||_{J,d,H}`. After subtracting the weighted mean of `R` on `A`,

```text
||nu_tgt - nu_ref||_{J,d,H} <= exp(eta)-1 + T.
```

For small `eta`, this is `eta + O(eta^2) + T`. Hence the Corollary-T
socket is reached once

```text
eta + T < 1/8
```

with a small safety margin.

This is the clean kernel version of affine gauge:

```text
constant part of R -> amplitude normalization,
linear part of R   -> variable rescaling,
centered R         -> physical perturbation.
```

## 4. What F65/G2 Already Supplies

F65 gives the exact adjacent-ratio comparison. With

```text
C(k)=sum_{r<=k} c_r,
H(k)=sum_{r<=k} 1/r,
L(k)=exp((H(k)-C(k))/2),
D=d L(kappa)^2,
I_A(kappa)={k: |k-kappa| <= A sqrt(kappa)},
```

the target finite coefficients compare to the critical finite hard-head
coefficients by

```text
a_k^xi(d) = a_k^crit(D) exp(-E_k).
```

After affine-gauge removal,

```text
E_k = B + A_1(k-kappa) + R_k.
```

The G2 interpolation estimate gives, uniformly on fixed-`A` moving windows,

```text
osc_{I_A} R_k
  = O_A(1/W(kappa) + kappa/d),

sup_{I_A} |Delta^2 E_k|
  = O_A(1/(kappa W(kappa)) + 1/d).
```

On the moving edge `d ~ kappa^2/L(kappa)^2`, both terms tend to zero:

```text
kappa/d ~ L(kappa)^2/kappa -> 0,
1/W(kappa) -> 0.
```

So F65/G2 supplies the required small residual size once the coefficient
residual is realized as the centered log-density residual of the positive
section kernels.

## 5. The Missing Beta Lemma

The remaining analytic statement is now precise.

**Kernel-F205 realization lemma.** After the F65 affine normalization
`D=dL(kappa)^2`, the true-xi section kernel and the critical-model section
kernel have a common central region `A=A(kappa)` such that

```text
d nu_xi = exp(-R) d nu_crit          on A,
osc_A R = O_A(1/W(kappa) + kappa/d),
nu_xi(A^c; J,H) + nu_crit(A^c; J,H) = o(1).
```

Equivalently,

```text
||Delta Phi||_{J,d,H}
  <= C_H (1/W(kappa) + kappa/d) + o(1).
```

If this lemma is proved, then for all sufficiently large moving cells the
right side is `< 1/8`, and Corollary T transports the one-real-zero-per-cell
structure from Theorem M. The remaining cells are a finite arithmetic census.

## 5a. Mellin-Cumulant Dictionary for the Missing Bridge

There is an exact positive-kernel language for the G2 coefficient estimates.
For a positive kernel `nu`, define even Mellin moments

```text
M_nu(k)=int u^(2k) dnu(u)
```

and the `k`-tilted probability measure

```text
dnu_k(u)=u^(2k)dnu(u)/M_nu(k).
```

With `theta=log u`, differentiation in continuous `k` gives the exact
identities, whenever the differentiations are justified:

```text
d/dk log M_nu(k)   = 2 E_{nu_k}[theta],
d^2/dk^2 log M_nu(k) = 4 Var_{nu_k}(theta),
d^m/dk^m log M_nu(k) = 2^m cumulant_m(theta under nu_k).
```

For finite sections, the same statements should be read as finite-difference
identities plus Euler-Maclaurin error terms on the active saddle packet.

Now write the target/reference moment ratio in the F65 convention as

```text
M_tgt(k)/M_ref(k) = exp(-E_k).
```

Formally, on the common saddle packet,

```text
E_tgt,k[theta] - E_ref,k[theta] = -1/2 E'(k),
Var_tgt,k(theta) - Var_ref,k(theta) = -1/4 E''(k),
```

and higher derivatives of `E` are the signed higher cumulant differences up
to the same powers of `2`. Thus affine gauge removal has a precise kernel
meaning:

```text
constant part of E  -> mass normalization,
linear part of E    -> log-center alignment,
Delta^2 E           -> log-variance / curvature mismatch.
```

This explains why G2 has the right shape. After matching `E` and `E'` at
`kappa`, the bound

```text
Delta^2 E_k = O_A(1/(kappa W(kappa)) + 1/d)
```

is exactly a small curvature discrepancy for the tilted `log u` laws. Higher
finite differences would control higher cumulants and Edgeworth tails.

This still does not prove beta. Cumulant control becomes the kernel norm only
after a saddle realization theorem:

**Mellin-saddle realization target.** If the tilted reference and target
`log u` laws are uniformly log-concave on the active F205 window, their first
two cumulants are matched by affine gauge, and their third/fourth cumulants
differ only at G2 scale, then on the central window

```text
dnu_tgt = exp(-R)dnu_ref,
osc R = O_A(1/W(kappa) + kappa/d),
```

while the `K_{J,d,H}`-weighted tails are `exp(-cA^2)+o(1)`.

This is the concrete next theorem behind Kernel-F205. It is stronger than a
coefficient-window estimate and weaker than a global inverse moment problem:
it only asks for local positive-kernel saddle equivalence in the window that
the section operator actually samples.

## 5b. Local Laplace-Stability Lemma

The Mellin-saddle target can be split into a general local lemma plus
xi-specific estimates.

Work in `theta=log u`. After the `kappa`-tilt and affine gauge, write the
reference and target densities on a central interval

```text
I_A={|theta-theta_0| <= A sigma}
```

as

```text
dnu_ref = Z_ref^-1 exp(-V(theta)) dtheta,
dnu_tgt = Z_tgt^-1 exp(-V(theta)-Q(theta)) dtheta,
```

with

```text
Q(theta_0)=0,        Q'(theta_0)=0.
```

Suppose that on `I_A`

```text
|Q''(theta)| <= eps_2/sigma^2,
|Q'''(theta)| <= eps_3/sigma^3,
```

and that the two weighted tails satisfy

```text
nu_ref(I_A^c; J,H)+nu_tgt(I_A^c; J,H) <= T_A.
```

Then Taylor's formula gives

```text
osc_{I_A} Q <= eps_2 A^2 + (1/3) eps_3 A^3.          (LS)
```

Indeed, with `x=(theta-theta_0)/sigma`,

```text
Q(theta_0+sigma x)
 = (1/2)Q''(theta_0)sigma^2 x^2 + O(eps_3 |x|^3/6),
```

and `|Q''(theta_0)|sigma^2 <= eps_2`; taking the difference of two values in
`|x|<=A` gives (LS).
Inserting (LS) into the positive-kernel perturbation lemma yields

```text
||nu_tgt-nu_ref||_{J,d,H}
 <= exp(eps_2 A^2 + (1/3) eps_3 A^3)-1 + T_A.         (LSTV)
```

Thus lane B is closed, conditionally, by any F205 saddle theorem that proves

```text
eps_2, eps_3 -> 0,
T_A -> 0,
eps_2 A^2 + eps_3 A^3 -> 0
```

for some moving window `A=A(kappa)->infinity`.

In the expected G2 scale

```text
eps := 1/W(kappa) + kappa/d,
eps_2, eps_3 = O(eps),
```

one may take for example `A=eps^(-1/4)` if the cubic bound is no worse than
`O(eps A^3)=O(eps^(1/4))` after the third-cumulant normalization, or a
smaller power if needed. The resulting central error is a positive power of
`eps`, and the desired beta inequality follows once it is below `1/8` and
the `K_{J,d,H}` tails have decayed.

This lemma is not the missing xi estimate. It is the socket into which that
estimate must fit. It shows that beta does not require solving a global
moment problem: a local potential-derivative lift of G2 plus
boundary-weighted saddle tails is enough.

## 5c. Legendre-Dual Gauge Lemma

The remaining obstruction can be sharpened once more. G2 controls a
coefficient-side log-partition residual. The local kernel perturbation lemma
needs a density-side potential residual. The bridge between the two is
Legendre duality, provided the active Mellin saddle is uniformly strict.

Let

```text
A_0(k)=log M_ref(k),        A_1(k)=log M_tgt(k)
```

on an interval `I`, and suppose the affine gauge has been removed so that

```text
A_1(k)=A_0(k)-R(k),         R(kappa)=R'(kappa)=0.
```

Assume `A_0''(k) >= m > 0` on `I` and, for some `0 <= eta < 1`,

```text
|R''(k)| <= eta m                 on I.                 (LD0)
```

For `theta` whose reference saddle `k_0(theta)` lies in the interior of `I`,
define

```text
2theta = A_0'(k_0),
I_j(theta)=sup_k {2k theta - A_j(k)}.
```

If the target maximizer also lies in `I`, then

```text
0 <= I_1(theta)-I_0(theta)-R(k_0)
   <= R'(k_0)^2 / (2(1-eta)m).                         (LD1)
```

Proof. Write

```text
phi(k)=2k theta - A_0(k).
```

Then `phi` is concave, maximized at `k_0`, and

```text
I_1(theta)-I_0(theta)
 = sup_{k in I} {phi(k)-phi(k_0)+R(k)}.
```

The lower bound follows by evaluating at `k=k_0`. For the upper bound, put
`h=k-k_0`. Strong concavity gives

```text
phi(k_0+h)-phi(k_0) <= -m h^2/2,
```

while (LD0) gives

```text
R(k_0+h) <= R(k_0)+R'(k_0)h+eta m h^2/2.
```

Taking the supremum over `h` yields (LD1). This is an exact deterministic
lemma; no asymptotic argument is hidden in it.

Consequences for Lane B:

1. If `R'' = O(eps A_0'')` on a saddle packet and `R(kappa)=R'(kappa)=0`,
   set the local inverse-curvature scale

   ```text
   sigma_k := A_0''(kappa)^(-1/2).
   ```

   Then on `|k-kappa| <= A sigma_k`,

   ```text
   I_1(theta)-I_0(theta)
     = R(k_0(theta)) + O(eps^2 A^2)
   ```

   after using `R'=O(eps A_0'' A sigma_k)` and
   `A_0'' sigma_k^2 = 1` in normalized saddle units.
2. The affine part of `E_k` is therefore exactly the affine coordinate
   freedom of the dual potential: constant gauge normalizes mass, linear
   gauge recenters `theta`, and the centered residual becomes the local
   potential mismatch.
3. What remains outside pure convex duality is an amplitude term. A
   Laplace-class density satisfies, uniformly on the saddle window,

   ```text
   -log h_j(theta) = I_j(theta) + B_j(theta) + delta_j(theta),
   ```

   where `B_j` is the usual determinant/amplitude correction. Thus the
   xi-specific F205 lift can be stated as

   ```text
   osc(B_1-B_0) + osc(delta_1-delta_0)
      = O_A(1/W(kappa)+kappa/d).
   ```

   Together with (LD1), this supplies the `Q''/Q'''` hypotheses of §5b.

This splits Kernel-F205 into two auditable pieces:

```text
G2 log-partition curvature  ->  Legendre potential residual     (general)
saddle inversion amplitudes ->  actual kernel-density residual  (xi-specific)
```

The first piece is now a lemma. The second is the real analytic content still
to prove from the Riemann-xi saddle.

## 5d. Saddle-Amplitude Reduction

The xi-specific amplitude term in §5c also has a standard one-dimensional
shape. This gives a sharper target for the remaining F205 saddle inversion.

Assume the two positive kernels are Laplace-class on the same saddle packet:
their densities in `theta=log u` admit the uniform inverse-Laplace expansion

```text
h_j(theta)
 = exp(-I_j(theta)) / sqrt(2pi A_j''(k_j(theta)))
   * exp(delta_j(theta)),                            (SA0)
```

where `2theta=A_j'(k_j(theta))` and `delta_j` is the steepest-descent
remainder. Then the density-potential difference is exactly

```text
-log h_1 + log h_0
 = I_1-I_0
   + (1/2)log(A_1''(k_1)/A_0''(k_0))
   + delta_0-delta_1.                               (SA1)
```

Thus §5c supplies the first term. The determinant term is controlled by the
same residual derivatives. Indeed, with `A_1=A_0-R`, `|R''|<=eta A_0''`,
and `k_1-k_0=O(R'(k_0)/A_0''(k_0))`,

```text
log(A_1''(k_1)/A_0''(k_0))
 = log(1 - R''(k_0)/A_0''(k_0))
   + O(|k_1-k_0| sup_I |(log A_0'')'|)
   + O(|k_1-k_0| sup_I |R'''|/A_0'').              (SA2)
```

Consequently, on the normalized packet `|k-kappa|<=A sigma_k`, it is enough
to prove

```text
|R''|/A_0'' = O_A(eps),
|R'''| sigma_k / A_0'' = O_A(eps),
osc_I(delta_1-delta_0)=O_A(eps),
eps := 1/W(kappa)+kappa/d.                         (SA3)
```

Then the entire local density residual obeys

```text
osc Q = O_A(eps) + O_A(eps^2 A^2),
```

which feeds directly into §5b.

This is still conditional on the inverse-Laplace expansion (SA0), but the
remaining theorem is now explicit:

```text
F205-amplitude theorem:
  the true-xi and critical-model Mellin kernels have a common steepest
  descent contour on the F65 window, with remainder difference
  osc(delta_1-delta_0)=O_A(1/W+kappa/d).
```

No coefficient majorants enter. The only operations are convex duality,
determinant comparison, and saddle-remainder control.

## 5e. Bromwich Remainder-Stability Lemma

The last term in §5d can also be made deterministic once the contour exists.
This is the exact place where the future xi proof must spend its analytic
effort.

Assume that, for each `theta` in the central window, the density has the
Bromwich representation on the vertical saddle line

```text
h_j(theta)
 = exp(A_j(k_j)-2k_j theta)/(2pi)
   int_R exp(A_j(k_j+it)-A_j(k_j)-it A_j'(k_j)) dt,
```

with `A_j'(k_j)=2theta`, `A_j''(k_j)>0`, and
`sigma_j=A_j''(k_j)^(-1/2)`. Put `t=sigma_j s` and define the normalized
non-Gaussian phase

```text
U_j(s;theta)
 = A_j(k_j+i sigma_j s)-A_j(k_j)
   - i sigma_j s A_j'(k_j) + s^2/2.
```

Then exactly

```text
h_j(theta)
 = exp(-I_j(theta)) / sqrt(2pi A_j''(k_j)) * exp(delta_j(theta)),
```

where

```text
delta_j(theta)
 = log E_G[exp(U_j(G;theta))],          G ~ N(0,1).       (BR0)
```

Thus, if on the common saddle window the Gaussian expectations exist and
there is a nonnegative Gaussian-integrable envelope `V(G;theta)` such that

```text
Re U_0(G;theta), Re U_1(G;theta) <= V(G;theta),
E_G[e^{V(G;theta)}] <= C_V,
E_G[|U_1(G;theta)-U_0(G;theta)| e^{V(G;theta)}] <= tau(theta),
E_G[e^{Re U_j(G;theta)}] >= c_V > 0        (j=0,1),
```

then

```text
|delta_1(theta)-delta_0(theta)| <= tau(theta)/c_V.            (BR1)
```

Proof: apply `|log X-log Y| <= |X-Y|/min(X,Y)` to (BR0) and use
`|e^a-e^b| <= e^{max(Re a, Re b)}|a-b|`; the stated `c_V` supplies the
denominator. In typical saddle applications `c_V=1-o(1)` because
`U_j=O(G^3 sigma)` in Gaussian mean and the quadratic term has already been
factored out.

Taylor form. On a central range `|s|<=S`, write the normalized cumulants

```text
lambda_{j,r}(theta) := A_j^(r)(k_j) sigma_j^r,       r >= 3.
```

Then

```text
U_j(s;theta)
 = sum_{r=3}^{R} i^r lambda_{j,r}(theta) s^r/r!
   + Rem_{j,R}(s;theta).
```

Consequently (BR1) is implied by

```text
sum_{r=3}^{R} |lambda_{1,r}-lambda_{0,r}| E|G|^r/r!
+ E_G|Rem_{1,R}(G)-Rem_{0,R}(G)|
+ Gaussian tails
  = O_A(eps).                                      (BR2)
```

For Lane B this gives the cleanest remaining target:

```text
normalized cumulants of the true-xi and critical-model Mellin saddles
match to O_A(1/W+kappa/d), and the common contour has uniform Gaussian
domination.
```

Together with §5c and §5d, (BR2) is enough to feed §5b. It also identifies
where a failure would have to live: either no common dominated contour exists,
or a normalized cumulant difference is larger than the G2 scale.

## 5f. Normalized-Cumulant Transfer Lemma

The cumulant condition in §5e is also mostly deterministic. It is the local
Taylor form of the same residual `R` already controlled by G2.

Let `A_1=A_0-R` on a saddle interval and let `k_0(theta)`, `k_1(theta)` solve

```text
A_0'(k_0)=2theta,        A_1'(k_1)=2theta.
```

Set

```text
sigma_0(k)=A_0''(k)^(-1/2),
z=(k-k_0)/sigma_0(k_0),
Lambda_{j,r}(theta)=A_j^(r)(k_j(theta)) A_j''(k_j(theta))^(-r/2),
Lambda_{0,r}^{loc}(z)
 = A_0^(r)(k_0+sigma_0(k_0)z) A_0''(k_0+sigma_0(k_0)z)^(-r/2).
```

Assume on the normalized packet `|z|<=A`:

```text
0 < c <= A_0''(k)/A_0''(k_0) <= C,
|d/dz Lambda_{0,r}^{loc}(z)| <= L_{r,A},       2 <= r <= R+1,
|R^(r)(k)| sigma_0(k)^r <= eps_{r,A},          1 <= r <= R+1,
eps_{2,A} <= 1/2.
```

Then, for all `theta` whose two saddles remain in the packet,

```text
|(k_1-k_0)/sigma_0(k_0)| <= C_A eps_{1,A},       (NC0)
```

and for every `3 <= r <= R`,

```text
|Lambda_{1,r}(theta)-Lambda_{0,r}(theta)|
 <= C_{r,A} (eps_{1,A}+eps_{2,A}+eps_{r,A}).      (NC1)
```

Proof sketch. The saddle equation is

```text
A_0'(k_1)-A_0'(k_0)=R'(k_1).
```

Strong convexity on the packet gives
`|k_1-k_0|/sigma_0(k_0) <= C_A |R'(k_1)|sigma_0(k_1)`, proving (NC0).
For (NC1), write

```text
A_1^(r)(k_1)=A_0^(r)(k_1)-R^(r)(k_1),
A_1''(k_1)=A_0''(k_1)(1-R''(k_1)/A_0''(k_1)).
```

The shift `k_1-k_0` changes the reference normalized cumulant by the
`z`-Lipschitz bound, `R^(r)` contributes `eps_{r,A}`, and the denominator
change contributes `eps_{2,A}` through
`(1-x)^(-r/2)=1+O_r(x)` for `|x|<=1/2`.

Thus §5e's normalized-cumulant matching follows once the residual derivative
package

```text
|R^(r)(k)| sigma_0(k)^r = O_A(1/W(kappa)+kappa/d),       r=1,...,R+1,
```

is available on the F65 window. Since affine gauge enforces
`R(kappa)=R'(kappa)=0`, the `r=1` bound follows from the `r=2` bound inside
fixed `A` windows:

```text
|R'(k)| sigma_0(k) <= A sup |R''| sigma_0^2 = O_A(eps).
```

This leaves only two genuinely xi-specific estimates:

```text
1. normalized derivative bounds for R up to finite order R+1;
2. common Gaussian contour domination for the Bromwich integrals.
```

If both hold, then the chain

```text
G2 derivatives -> normalized cumulants -> Bromwich remainders
-> local density residual -> kernel norm -> Corollary-T transport
```

is formal.

## 5g. Two-Estimate Beta Criterion

Combining §5b-§5f gives a compact criterion for the remaining beta step.
This is now the cleanest statement of what must be proved from the xi saddle.

Fix a central window `|k-kappa|<=A sigma_k` and put

```text
eps(kappa,d)=1/W(kappa)+kappa/d.
```

Assume:

**(D) finite-order derivative package.** For some fixed truncation order `R`
large enough for the Gaussian Taylor remainder,

```text
|R^(r)(k)| sigma_k^r <= C_{r,A} eps(kappa,d),       2 <= r <= R+1,
```

and the reference critical-model normalized cumulants are uniformly
`z`-Lipschitz on the same packet.

**(C) common contour package.** The true-xi and critical-model Bromwich
representations have a common Gaussian domination envelope in the sense of
§5e, and their Taylor remainders obey

```text
E_G|Rem_{1,R}(G)-Rem_{0,R}(G)| + Gaussian tails
  <= C_A eps(kappa,d).
```

**(T) section-weighted tails.** Outside the central window,

```text
nu_xi(I_A^c;J,H)+nu_crit(I_A^c;J,H) <= T_A(kappa,d).
```

Then after affine gauge,

```text
||nu_xi-nu_crit||_{J,d,H}
 <= exp(C_A eps(kappa,d) + C_A eps(kappa,d)^2 A^2)-1
    + T_A(kappa,d).                                  (BETA)
```

Indeed:

```text
(D) -> normalized cumulant matching        by §5f,
(D)+(C) -> osc(delta_1-delta_0)=O_A(eps)   by §5e,
(D)+§5c+§5d -> osc Q=O_A(eps+eps^2 A^2),
§5b + (T) -> (BETA).
```

Thus Corollary T is reached once the right side of (BETA) is `<1/8`.
For example, if `(D)` and `(C)` hold with fixed `A` and
`T_A=o(1)`, beta closes for all sufficiently large `kappa` in the moving
edge regime. If tails require `A=A(kappa)->infinity`, the needed condition is

```text
eps A^2 -> 0,       T_A -> 0,
```

or the corresponding stronger condition dictated by the chosen Taylor
remainder order.

This criterion is deliberately narrow. It neither asserts RH nor hides the
hard analysis: all remaining work is now concentrated in proving `(D)`,
`(C)`, and `(T)` from the Riemann-xi saddle.

## 5h. Section-Weighted Tail Criterion

The tail package `(T)` should not remain a black box. The weighted norm has a
specific growth source, namely

```text
B_{d,H}(theta) := log K_{J,d,H}(e^theta),
K_{J,d,H}(u)=sup_boundary |C_d(uw)|.
```

Thus the relevant tail saddle is not the unweighted kernel density alone, but
the weighted action obtained after subtracting `B_{d,H}`.

For `j=0,1`, write the critical and true-xi positive kernels in
`theta=log u` as

```text
dnu_j(theta)=Z_j^-1 exp(-V_j(theta)) dtheta,
P_j(theta)=V_j(theta)-B_{d,H}(theta).
```

Then the section-weighted mass is exactly

```text
nu_j(E;J,H)
 = Z_j^-1 int_E exp(-P_j(theta)) dtheta.             (WT0)
```

Let `theta_j` be a weighted saddle,

```text
P_j'(theta_j)=0,       sigma_j^2=P_j''(theta_j)^-1,
```

and suppose that, for some `A>=A_0`, the following deterministic estimates
hold:

```text
P_j(theta_j+sigma_j x)-P_j(theta_j) >= q_j(x),   |x|>=A,
N_j:=Z_j^-1 exp(-P_j(theta_j)) sigma_j <= C_N,
```

where `q_j` is increasing on both tails. Then

```text
nu_j({|theta-theta_j|>A sigma_j};J,H)
 <= C_N int_{|x|>A} exp(-q_j(x)) dx.                (WT1)
```

In particular, if `q_j(x)>=c x^2` for `|x|>=A`, then

```text
nu_j({|theta-theta_j|>A sigma_j};J,H)
 <= (2C_N/(cA)) exp(-cA^2).                         (WT2)
```

If the two weighted saddles are close,

```text
|theta_1-theta_0| <= b sigma_0,       sigma_1/sigma_0 in [c_s,C_s],
```

then the common window `I_A={|theta-theta_0|<=A sigma_0}` satisfies the same
bound with `A` replaced by `(A-b)/C_s`. Hence `(T)` follows once both weighted
actions have a common quadratic tail barrier and bounded saddle
normalization.

A convenient derivative check is the following. If at the weighted saddle
`V_j'(theta_j)=B_{d,H}'(theta_j)` and, in saddle units,

```text
V_j(theta_j+sigma_j x)-V_j(theta_j)-V_j'(theta_j)sigma_j x
  >= (lambda/2)x^2,

B_{d,H}(theta_j+sigma_j x)-B_{d,H}(theta_j)
 -B_{d,H}'(theta_j)sigma_j x
  <= (beta/2)x^2,
```

with `0<=beta<lambda`, then `P_j` has the quadratic barrier

```text
P_j(theta_j+sigma_j x)-P_j(theta_j)
  >= ((lambda-beta)/2)x^2,
```

and (WT2) gives

```text
T_A <= C exp(-cA^2)/A.
```

This is the usable form of `(T)`: prove that the boundary section weight
`K_{J,d,H}` consumes strictly less saddle curvature than the positive
Riemann-xi and critical kernels provide, and prove that the weighted saddle
normalizations stay `O(1)`. It is a positive-kernel saddle-localization
statement, not a coefficient-majorant estimate.

The remaining xi-specific tail tasks are therefore:

```text
1. asymptotics or bounds for B_{d,H}', B_{d,H}'' on Theorem-M walls/caps;
2. weighted saddle equations P_j'(theta_j)=0 and theta_1-theta_0=O(eps sigma);
3. weighted normalizations N_j=O(1);
4. a tail curvature gap lambda-beta >= c>0 on the chosen moving window.
```

With these four estimates, §5g's tail assumption becomes

```text
T_A = O(exp(-cA^2)/A),
```

so fixed `A` can make the tail arbitrarily small, and moving `A` is governed
only by the local-error condition `eps A^2 -> 0` from (BETA).

## 6. Why This Is Not Yet a Proof

G2 is a coefficient-window theorem. It controls the centered cumulative
multiplier `R_k` on saddle packets. By itself it does not imply weighted
total-variation closeness of positive section kernels. Finite moment control
or small coefficient residuals on a window do not determine a global kernel
in `L1`.

Thus lane B has one real missing bridge, not a bookkeeping gap:

```text
coefficient residual R_k  ->  positive section-kernel residual R(u)
```

through the F205 saddle. This bridge must use positivity and saddle
localization of the Riemann xi kernel. If it instead uses absolute
coefficient sums, it collapses back to the F217 no-go.

## 7. Practical Next Tests

The proof should now attack the missing lemma directly.

1. Prove boundary-weighted saddle tails for `C_d(uw)` on Theorem-M
   boundaries, uniformly in the moving edge scale.
2. Prove the local potential-derivative lift: after affine gauge, obtain
   `|Q''|<=eps_2/sigma^2`, `|Q'''|<=eps_3/sigma^3` on the F205 saddle window,
   with `eps_j` small enough for (LSTV).
3. Use §5c to convert the centered G2 log-partition residual into a
   Legendre-potential residual. This part is now general; the xi-specific
   work is the saddle-inversion amplitude bound
   `osc(B_1-B_0)+osc(delta_1-delta_0)=O_A(1/W+kappa/d)`.
4. Use §5d to reduce that amplitude bound to determinant comparison
   `R''/A_0''`, `R'''sigma_k/A_0''` and steepest-descent remainder
   comparison.
5. Use §5e to reduce the steepest-descent remainder comparison to normalized
   cumulant differences plus a common Gaussian domination contour.
6. Use §5f to reduce normalized cumulant differences to finite-order
   normalized derivative bounds on `R`.
7. Prove the two-estimate beta criterion's packages `(D)`, `(C)`, `(T)` from
   the Riemann-xi saddle.
8. Prove the Mellin-saddle realization target: log-concavity, affine-gauge
   matching, G2-scale cumulant residual, and central-window oscillation.
9. Compare centered log-densities after the F65 gauge. The F205 saddle gives
   the curvature scale; the F228 telescope fixes the affine constant but is
   not needed for `o(1)`.
10. Only after these kernel tails are established should the `1/8` Corollary-T
   threshold be invoked.

This is the current beta front: a positive-kernel saddle-localization theorem
with an explicit `1/8` target.
