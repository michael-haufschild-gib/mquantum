# RH edge-Appell frontier (updated after GPT-F56, 2026-06-12)

Active route: WDW/Jensen curvature flow -> adjacent-section Sturm ladder -> Cauchy/Stieltjes/Mellin kernel positivity -> shadow-polynomial integral cancellation -> hard-head Bessel/dilation/Pólya finite-core theory. Fixed-degree edge is useful but not identical to Fable's all-degree alpha_c boundary.

Latest Fable state read from mailbox/main log:

```text
F202: d*(0.75,0)=180 and d*(0.8,0)=307 passed preregistered bands; free-pole fit alpha_c=0.9755 remains empirical alternative.
F203: kernel referee 22/22 HEAL+, zero anti-walls; F5/F7 exact; weak margins decay in deep windows.
F204: xi drift measured: alpha rises slowly to 1, b~j^0.53; clearance using old wall*d*(1+b/4) crosses near d~700-1000, likely calibration artifact.
Fable Round 248: launched d*(0.5,32), hard-head zero scan Phi_{1,1}/Phi_{1,2}, and zmargin d=128/192/256.
Fable interim: d*(0.5,32)<320, below linear/Airy/quadratic forecasts at x=33; zeta d=128 margin min/Hermite=0.4068 vs law 0.2881, relIm=0.
Fable Round 249: F205 zeta drift theorem; F206 initial effective-profile theta gate.
Fable Round 250/F207: corrected b_eff asymptotic to (2/3)d/L^2 and corrected gate to theta>1, or theta=1 with p>=2. Airy viable again; theta<1 fatal.
Fable Round 250/F208: Phi_{1,1} first 12 zeros all real/simple/positive (K=140 quick look).
Fable Round 251/F209: zero constant B=(pi^2/4)e^EulerGamma derived; Hutchinson coefficient criterion fails.
Fable Round 252/F210: proposed Pólya monotone-kernel reduction; one-jump threshold x>=3/2; asked GPT to source-check and find anti-derivative bridge.
Fable Round 253/F211: claimed Phi_{1,1} in LP via atom-dominated Rouche using GPT-F39; GPT audit accepts x=1 proof, but not yet all real x>=1 Bessel extension.
Fable Round 254/F212: accepted GPT F211 audit, proposed effective head lift certifying ~log(d)/pi real head zeros; GPT audit accepts head-strip theorem but not full disk-wide zero exclusion without taller contours.
Fable Round 255: proposed full finite lift by cell-Rouche on critical walls of C_d; proved vertical wall minimum and large-y closure; reduced y=0 to Lemma A (critical-value envelope) and assigned GPT Lemma B (moderate-y radial dominance).
```

Hard-head entire limit:

```text
S_x(k)=sum_{r=1}^{k-1}(k-r)/(x+r-1)
Phi_{alpha,x}(s)=sum_{k>=0}(-1)^k exp(-alpha S_x(k))s^k/k!
P_{d,x}(s/d)->Phi_{alpha,x}(s) locally uniformly
partial_s Phi_{alpha,x}(s)=-Phi_{alpha,x+1}(e^{-alpha/x}s)
```

Local alpha_c target:

```text
Phi_{1,x} is Laguerre-Polya for all x>=1,
with scaled adjacent zeros interlacing by Rolle.
```

Large-b wall split:

```text
S_x(k)=binom(k,2)/x - binom(k,3)/x^2 + O(k^4/x^3)
binom(d,k)d^{-k}=1/k!*exp(-binom(k,2)/d+O(k^3/d^2))
safe thickness: (alpha/x + 1/d)binom(k,2)
variation penalty: alpha binom(k,3)/x^2 + higher Cauchy jets
```

F31 fixed-ratio theorem:

```text
u_{alpha,rho}(p)=log(p/(1-p))+alpha log(1+rho p)
u' = 1/p+1/(1-p)+alpha rho/(1+rho p)>0.
```

F31 supports no caustic at linear fixed-ratio scale, aligning with corrected F207 gate: fatal macroscopic scenario is theta<1, not theta=1.

F34 shadow-polynomial identity:

At normalized common-root event,

```text
tilde S(s)=tilde A(s)-s tilde B(s), tilde S(sigma)=tilde S_s(sigma)=0
C_j=(-1)^j binom(d+1,j)exp(lambda eta_j)sigma^j
G(q)=sum_r K_r q^{n+r-1}
G(q)=-q^n tilde S(q sigma)/(1-q)^2
```

with endpoint

```text
G_i(1)=(d+1)sigma^2|tilde B_s(sigma)|/2>0.
```

F35 endpoint dominance:

```text
Phi_i(b)=int_0^1 q^b G_i(q)dq
        = [(d+1)sigma^2|tilde B_s(sigma)|/2]/(b+1)+O(b^-2).
```

Thus every fixed event heals for sufficiently large Cauchy offset; deep-window margin ~1/(n+b) is endpoint geometry.

F36 variation-diminishing bound:

```text
Phi_i(b)=int_0^infinity e^{-(b+1)t}G_i(e^{-t})dt.
```

The exponential kernel is strictly totally positive, so `Phi_i(b)` has at most `i-1` zeros for `b>=0`; combined with F35, no fixed event has repeated late anti-healing.

F37 critical hard-head Bessel anchor:

For `alpha=1`, set

```text
a_k(x)=exp(-S_x(k))/k!, C_x=exp(psi(x)), nu_x=x-3/2.
```

Then

```text
a_k(x) ~ L_x C_x^k/[k! Gamma(k+nu_x+1)]
L_x=sqrt(2pi)exp((x-1)psi(x)-x+1/2)
a_{k-1}/a_k=C_x^-1 k(k+nu_x)[1+O(k^-2)].
```

F38 audit of Fable F205/F206 (superseded in part by F41):

```text
F205 accepted: alpha(j)=1-2/[W(2j/pi)+1]+lower order
=1-2/[log j-loglog j+1+log2-logpi+o(1)].
```

F39 exact compound-Poisson Bessel dilation:

Define normalized Bessel coefficients

```text
b_k(x)=Gamma(x-1/2)C_x^k/[k!Gamma(k+x-1/2)],
m_k=a_k/b_k.
```

Then

```text
m_k/m_{k-1}=(x+k-3/2)exp(-psi(x+k-1)).
```

For `y>=1`,

```text
log[(y-1/2)exp(-psi(y))]
  = -int_0^infinity e^{-yt} eta(t)dt,
eta(t)=e^{t/2}/t - 1/(1-e^{-t})
      =[2sinh(t/2)-t]/[t(1-e^{-t})]>0.
```

Thus

```text
m_k(x)=exp int_0^infinity (e^{-kt}-1) eta(t)e^{-xt}/(1-e^{-t}) dt.
```

Equivalently, if a Poisson point process has intensity `dnu_x(t)=eta(t)e^{-xt}/(1-e^{-t})dt` and `U_x=exp(-sum T_r)`, then `m_k=E[U_x^k]` and

```text
Phi_{1,x}(s)=E B_x(U_xs),
B_x(s)=Gamma(x-1/2)(C_xs)^(-nu_x/2)J_{nu_x}(2sqrt(C_xs)).
```

Special cases:

```text
Phi_{1,1}(s)=E cos(2sqrt(e^{-EulerGamma}U_1s))
Phi_{1,2}(s)=E sin(2sqrt(e^{1-EulerGamma}U_2s))/(2sqrt(e^{1-EulerGamma}U_2s))
```

The atom at `U_x=1` has mass `L_x/Gamma(x-1/2)`. Nonreal hard-head zeros, if any, come from the continuum dilation smear; if scans stay real, prove this explicit Bessel-dilation operator preserves LP for x>=1.

F40 universal endpoint shift:

For `L_x=-log U_x`, Levy density

```text
rho_x(t)=eta(t)e^{-xt}/(1-e^{-t})
```

satisfies

```text
eta(t)=t/24+O(t^2), rho_x(t)=1/24+O(t).
```

If `R_x=sqrt(U_x)`, its continuous density has endpoint `h_x(1-)=Pr(U_x=1)/12`. Therefore

```text
Phi_{1,1}(t^2/(4e^{-EulerGamma}))
  = p_1[cos t + sin t/(12t)+O(t^-2)]

t Phi_{1,2}(t^2/(4e^{1-EulerGamma}))
  = p_2[sin t - cos t/(12t)+O(t^-2)].
```

Zero residual tests:

```text
4e^{-EulerGamma}s_m(Phi_{1,1}) - ((m-1/2)pi)^2 -> 1/6
4e^{-EulerGamma}e s_m(Phi_{1,2}) - (m pi)^2 -> 1/6
```

Fable's rounded m=12 zero gives residual ~0.1606 vs target 1/6.

F41 corrected F207/F209 audit:

```text
b_eff(d)=(2/3)d/L^2(1+O(1/L))
C(d)~const*d^(theta-1)L^(p-2theta)
correct gate: theta>1, or theta=1 with p>=2.
```

Airy is viable; linear is marginal with polylog whisker `L^(p-2)`; theta<1 fatal.

F209 constant is exactly F37/F40:

```text
s_m(Phi_{1,1})=e^EulerGamma[((m-1/2)^2pi^2)/4+1/24+o(1)].
```

Thus `s_m/m^2` near 4.03 at m=12 is expected from half-index correction.

F42 hard-head tail zeros are Bessel-forced:

For

```text
F_x(t)=Phi_{1,x}(t^2/(4C_x))
```

F39 gives

```text
F_x(t)=E[Gamma(x-1/2)(sqrt(U_x)t/2)^(-nu_x)J_{nu_x}(sqrt(U_x)t)].
```

The atom at `U_x=1` contributes the Bessel term and the continuous endpoint is one oscillatory integration-by-parts order smaller:

```text
F_x(t)=p_x Gamma(x-1/2)(t/2)^(-nu_x)J_{nu_x}(t)+O(t^(-nu_x-3/2)).
```

Therefore for all sufficiently large m there is one simple real zero near each Bessel zero `j_{nu_x,m}`:

```text
t_m(x)=j_{nu_x,m}+O(1/j_{nu_x,m}).
```

The main hard-head tail cannot be the source of LP failure; nonreal zeros must be finite-core or zero-density exceptional defects. Proof route: F42 tail lock + F30 Rolle/size-bias ladder + F33/F34 finite-core certificates.

F43 Pólya audit and endpoint obstruction:

Pólya finite-transform route source-check: Dimitrov-Rusev survey records Pólya 1918 theorem: nonnegative monotonically increasing kernel on `[0,1]` gives cosine/sine transforms with real generally interlacing zeros. Endpoint atoms are approachable by approximation/Stieltjes variants.

For the hard-head law, with `Y_x=-log U_x=-2log R_x`, define

```text
q_x(y)=e^{y/2}rho_x(y)=eta(y)e^{-(x-1/2)y}/(1-e^{-y}).
```

Endpoint expansion:

```text
q_x(y)=1/24+((3/2-x)/24)y+O(y^2).
```

For continuous compound-Poisson density `f_x`, set `g_x=e^{y/2}f_x`; then

```text
g_x(y)=e^{-nu_x((0,infinity))}[q_x(y)+(q_x*q_x)(y)/2!+...]
(q_x*q_x)(y)=y/24^2+O(y^2)
g_x'(0+)=e^{-nu_x((0,infinity))}[(3/2-x)/24+1/1152].
```

The density of `R_x` is increasing at endpoint only if `g_x'(0+)<=0`, so the full compound-Poisson endpoint monotonicity threshold is

```text
x>=3/2+1/48=73/48.
```

Thus x=2 remains plausible for Pólya; x=3/2 is not covered; x=1 remains outside. The n>=2 convolution terms create a real endpoint obstruction.

F44 anti-derivative finite-core criterion:

```text
partial_s Phi_{1,1}(s)=-Phi_{1,2}(e^{-1}s).
```

If `tau_m` are zeros of `Phi_{1,2}`, critical points of `Phi_{1,1}` are `c_m=e tau_m`. If `Phi_{1,2}` is LP and `Phi_{1,1}(c_m)` alternates signs, then `Phi_{1,1}` has one real zero in every critical interval. F42 gives the tail sign pattern, so only finitely many early critical values need certification. This is the hard-head finite-core bridge requested by Fable.

F45 Fable-F211 audit and majority-atom theorem:

For

```text
Psi(z)=p cos(az)+int_[0,a) cos(tz)dmu(t),   p>1/2,
```

Rouche on cosine-strip rectangles gives exactly one simple real zero per strip.
For F39,

```text
Phi_{1,1}(e^EulerGamma w^2/4)
 = p_1 cos w + int_[0,1) cos(vw)dmu(v).
```

The no-jump atom is exact:

```text
p_x=L_x/Gamma(x-1/2)
   =sqrt(2pi)exp((x-1)psi(x)-x+1/2)/Gamma(x-1/2),
p_1=sqrt(2/e),   lambda(1)=(1-log 2)/2.
```

Thus `Phi_{1,1}` is LP. By F30 and LP closure under differentiation,
`Phi_{1,n}` is LP for every integer `n>=1`. The claimed extension to every
real `x>=1` still needs Bessel zero-separating contour details.

F46 exact finite hard-head lift form:

For the finite section

```text
Psi_d(w)=P_{d,1}(e^EulerGamma w^2/(4d)),
C_d(w)=sum_{k=0}^d (-1)^k[(d)_k/d^k]w^(2k)/(2k)!,
```

F39 gives

```text
Psi_d(w)=E C_d(sqrt(U_1)w)
        =p_1C_d(w)+int_[0,1)C_d(vw)dmu(v).
```

`C_d` is the scaled Jensen polynomial of `cos sqrt(z)`, hence real-rooted.
Finite-section hyperbolicity follows if one proves radial dominance

```text
|C_d(vz)|<|C_d(z)|,   0<=v<1,
```

on zero-separating contours around every positive zero of `C_d`. This is the
finite analogue of GPT-F1's `q^2` separation mechanism.

F47 Laguerre identity for the finite atom polynomial:

```text
C_d(w)=_1F_1(-d;1/2;w^2/(4d))
      =d!/(1/2)_d L_d^{-1/2}(w^2/(4d)).
```

Thus

```text
P_{d,1}(e^EulerGamma w^2/(4d))
 =
 const * E L_d^{-1/2}(U_1 w^2/(4d)).
```

If `xi_{j,d}` are zeros of `L_d^{-1/2}`, then the atom polynomial and its
`u`-dilate interlace whenever

```text
u > max_j xi_{j,d}/xi_{j+1,d}.
```

Finite lift can split into near-atom Laguerre interlacing / Obreschkoff and
far-dilation atom-margin Rouche contours.

F48 endpoint-density audit for F40:

General compound-Poisson endpoint lemma:

```text
Y has atom p at 0, Levy density rho(y)=rho_0+rho_1y+O(y^2)
continuous density f(0+)=p rho_0
f'(0+)=p(rho_1+rho_0^2/2)
```

For hard-head

```text
rho_x(y)=eta(y)e^{-xy}/(1-e^{-y})=1/24+O(y).
```

With `R_x=e^{-Y_x/2}`, `h_x(r)=2e^{y/2}f_x(y)`, `y=-2log r`, hence

```text
h_x(1-)=p_x/12
h_x(r)=p_x/12+p_x[(3/2-x)/6+1/288](1-r)+O((1-r)^2).
```

At `x=1`, `h_1(1-)=sqrt(2/e)/12=0.071480323...` and `h_1(0.99)` should be
near `0.0722`, not `0.010`; Fable's moment-inversion value is an endpoint
artifact. F40 residual target `1/6` stands.

F49 audit of Fable F212:

For `Psi_d=P_{d,1}(e^gamma w^2/(4d))`, `psi=Phi_{1,1}(e^gamma w^2/4)`,

```text
0<=1-(d)_k/d^k<=k(k-1)/(2d)
|Psi_d(w)-psi(w)| <= (R^2/(2d))e^R, |w|<=R.
```

F211 margin on height-one strip rectangles:

```text
M=min(2p-1, p sinh1-(1-p)cosh1)=sqrt(8/e)-1.
```

Thus `(R^2/2)e^R<Md` certifies one simple real zero in each controlled
head strip, yielding `~log(d)/pi` real head zeros. It does not by itself prove
every zero in disk `|w|<=R` is real; disk-wide exclusion needs taller contours
or a sufficient stronger bound roughly `R^2 e^(sqrt(2)R)<Md`. Main conclusion:
remaining finite lift is bulk-cell/F13-F27 territory.

F50 exact finite tropical monotonicity:

For Cauchy finite section ratios

```text
tau_{d,x,k}=k/(d-k+1)*exp(alpha[psi(x+k-1)-psi(x)])
```

we have the exact finite gap

```text
log(tau_{k+1}/tau_k)
=log(1+1/k)+log(1+1/(d-k))+alpha/(x+k-1)>0.
```

So no finite or subleading tropical ratio reversal exists; the bulk issue is
Sturm displacement/certificates inside already ordered tropical cells.

F51 Lemma B Stieltjes-wall reduction:

For

```text
C_d(w)=prod_m(1-w^2/w_m^2), lambda_m=w_m^2,
z=(c+iy)^2, s=v^2,
```

on a critical wall `c`,

```text
partial_s log |C_d(sqrt(s)(c+iy))|^2
=-2 Re[z sum_m 1/(lambda_m-sz)]
=2 sum_m [s|z|^2-A lambda_m]/|lambda_m-sz|^2.
```

Criticality gives `sum_m 1/(lambda_m-c^2)=0`. Strong sufficient Lemma B:
nonnegative derivative on `0<=s<=1`, `y>=0`; actual needed bound is integrated
negative part less than `log(p/(1-p))` with `p/(1-p)=6.031...`.

F52 first Lemma B certificate:

For `d=2`,

```text
C_2(w)=1-w^2/2+w^4/48, c=2sqrt(3), s=v^2, q=y^2.
```

Direct expansion:

```text
|C_2(c+iy)|^2-|C_2(sqrt(s)(c+iy))|^2=(1-s)P(s,q)/2304,
```

with all coefficients of `P` nonnegative on `0<=s<=1`; hence Lemma B holds
for `d=2` with factor `1`. But derivative monotonicity is false: at `q=0`,

```text
partial_q ratio=(1-s)(6s^3-27s^2+12s-1)/4>0
```

for `0.109795318...<s<0.378375006...`. General Lemma B should use
denominator-clearing positive-polynomial/integrated-ratio certificates, not
pointwise radial derivative monotonicity.

F53 second Lemma B certificate and wall-jet cone:

For `d=3`,

```text
C_3(w)=1-w^2/2+w^4/36-w^6/3240,
c_\pm^2=r_\pm=30+-6sqrt(10).
```

With `s=v^2`, `q=y^2`,

```text
Delta_\pm(s,q)
=|C_3(c_\pm+iy)|^2-|C_3(sqrt(s)(c_\pm+iy))|^2
=(1-s)Q_\pm(s,q),
Q_\pm=sum_{m=0}^6 q^m B_{\pm,m}(s).
```

Raw `(s,q)` coefficient positivity fails, but exact Sturm checks over
`Q(sqrt(10))` give

```text
B_{\pm,m}(s)>0 on [0,1] for m=1,...,6,
B_{\pm,0}(s)>=0 on [0,1].
```

The endpoint coefficient is `(1-s)A_\pm(s)/9`; `A_-` roots are approximately
`-0.094207968, 2.413598047, 5.842887581, 6.162277660`, and `A_+` roots are
approximately `-0.162277660, 1.480742177, 0.178490081 +- 0.339102325i`, so
both are positive on `[0,1]`. Hence

```text
|C_3(v(c_\pm+iy))| <= |C_3(c_\pm+iy)|, 0<=v<=1.
```

Lemma B holds for `d=3` with factor `1`. General proof object:

```text
D_{d,j}(s,q)=(1-s)Q_{d,j}(s,q),
Q_{d,j}=\sum_m q^m B_{d,j,m}(s),
B_{d,j,m}(s)>=0 on [0,1].
```

This wall-jet cone is weaker than raw coefficient positivity and avoids the
false derivative-monotonicity route. Numerical warning: double precision
Laguerre evaluation gives fake deep-wall violations near `s=1`, `q~10^-9`;
100-digit finite hypergeometric evaluation of the reported `d=40` breach gave
ratio `0.9999999999867974`.

F54 machine-exact Lemma B certificates through `d=7`:

Let

```text
P_d(X)=C_d(sqrt(X))
=sum_{k=0}^d (-1)^k ((d)_k/d^k)X^k/(2k)!,
H_d(r)=P_d'(r).
```

For a critical square `r`, with `s=v^2`, `q=y^2`,

```text
D_d(s,q;r)=
|P_d(r-q+2i sqrt(rq))|^2
-|P_d(s(r-q+2i sqrt(rq)))|^2.
```

Modulo `H_d(r)=0`,

```text
D_d=(1-s)Q_d,
Q_d=sum_{m=0}^{2d}q^m B_{d,m}(s;r).
```

`B_{d,0}` has the expected extra `(1-s)` factor from the real critical point.
After dividing it, exact `CRootOf(H_d)` substitution plus Sturm root counts in
`s` gave positive endpoints and zero roots in `(0,1)` for all coefficient
polynomials in:

```text
d=4: 3 walls, 9 q-coefficients per wall.
d=5: 4 walls, 11 q-coefficients per wall.
d=6: 5 walls, 13 q-coefficients per wall.
d=7: 6 walls, 15 q-coefficients per wall.
```

Therefore

```text
|C_d(v(c_j+iy))| <= |C_d(c_j+iy)|, 0<=v<=1,
```

for every critical wall and every `d<=7`. Lemma B is machine-exact through
`d=7` with factor `1`. Next theoretical target: explain the positive
wall-jet coefficients by recurrence, total positivity, or sum-of-squares
identity.

F55 Krawtchouk wall-jet formula and `d=8` certificate:

With

```text
P_d(X)=sum_k a_{d,k}X^k,
a_{d,k}=(-1)^k((d)_k/d^k)/(2k)!,
z=r-q+2i sqrt(rq),
```

define

```text
K_{k,l,m}=(-1)^m[x^(2m)](1-x)^(2k)(1+x)^(2l)
=(-1)^m sum_a (-1)^a binom(2k,a)binom(2l,2m-a).
```

Then

```text
[q^m] z^k conjugate(z)^l = r^(k+l-m)K_{k,l,m},
Q_d={|P_d(z)|^2-|P_d(sz)|^2}/(1-s)
=sum_m q^m B_{d,m}(s;r),
B_{d,m}=sum_{k,l}a_{d,k}a_{d,l}r^(k+l-m)K_{k,l,m}
        (1-s^(k+l))/(1-s).
```

Direct expansion matches this formula for `d=2,3,4,5`. At critical squares
`P_d'(r)=0`, the extra factor in `B_{d,0}` is automatic:
`B_{d,0}(1;r)=2rP_d(r)P_d'(r)=0`.

Using this formula, exact `CRootOf/Sturm` certification completed for `d=8`
on all seven walls. `H_8`:

```text
r^7-1680r^6+1048320r^5-307507200r^4
+44281036800r^3-2975685672960r^2
+79351617945600r-544125380198400.
```

Positive critical squares:

```text
10.2177162855, 41.3042759347, 94.6679826783,
173.0890111118, 281.7305464978, 430.9931437841,
647.9973237079.
```

All seven walls pass: 17 q-coefficients per wall, `Q` degree `(q,s)=(16,15)`,
positive endpoints and zero roots in `(0,1)`. Thus Lemma B holds with factor
`1` for all critical walls and all `d<=8`. All-degree target: prove
sign-regularity/recurrence/SOS for the even Krawtchouk transform after
critical reduction `H_d(r)=0`.

F56 Lemma B transverse split and first Sonin jet:

```text
D_d(s,q;r)=|P_d(r-q+2i sqrt(rq))|^2-|P_d(s(r-q+2i sqrt(rq)))|^2
          =D_d(s,0;r)+(1-s)sum_{m=1}^{2d}q^mB_{d,m}(s;r)
D_d(s,0;r)=P_d(r)^2-P_d(sr)^2.
```

Thus Fable Lemma A is exactly the `q^0` real-axis term, while GPT only needs
the transverse cone `B_{d,m}(s;r_j)>=0` for `m>=1`. The first transverse
coefficient is a weighted Sonin functional. With

```text
4xP_d''+(2-x/d)P_d'+P_d=0,
M_d=x[P_d^2-(x/d)P_dP_d'+4x(P_d')^2],
```

at a critical square `r`,

```text
[q]D_d(s,q;r)=(M_d(r)-M_d(sr))/r.
```

So `B_{d,1}` follows from monotonicity of `M_d` on `[0,r]`. Its derivative is

```text
M_d'=(1+x/(4d))P_d^2
     -(3x/(2d)+x^2/(4d^2))P_dP_d'
     +(4x+x^2/d)(P_d')^2.
```

Interpret higher transverse coefficients as a hierarchy of even normal Sonin
jets of the Laguerre ODE.

Current requested Fable referee checks:

```text
large-b wall: finish d*(0.5,32), b=64; estimate theta trend relative to 1.
shadow identity: G(q) ?= -q^n tilde S(q sigma)/(1-q)^2.
endpoint law: (b+1)Phi_i(b) ?-> (d+1)sigma^2|tilde B_s(sigma)|/2.
variation bound: zeros of Phi_i(b) <= roots of tilde S before sigma.
hard-head theorem check: F211 x=1 is accepted; K=400/F40 residual is verification, not search.
Bessel extension: fill missing contours for real x>1, or restrict theorem to x=1 plus integer ladder.
finite lift: prove radial dominance for Laguerre `L_d^{-1/2}` zero cells; split by near-atom interlacing threshold.
endpoint density: F40 `h_x(1-)=p_x/12` and residual `1/6` stand; moment inversion near endpoint must preserve atom.
effective head lift: use F212 as head-strip theorem; use F13/F27 for bulk cells.
full finite lift: attack Lemma B via the F51 Stieltjes-wall derivative; Fable works Lemma A via Sonin-Polya envelope.
d=2 certificate: use F52 as template for higher-degree denominator-clearing Lemma B certificates.
d=3 certificate: use F53 as evidence for the stronger q-coefficient wall-jet
cone; prove `B_{d,j,m}(s)>=0` generally or find first wall where only the
factor-6.031 budget remains.
d<=7 certificates: F54 verifies the wall-jet cone exactly with CRootOf/Sturm
certificates. Generalize the certifier into a recurrence/TP/SOS proof.
d=8 certificate and formula: F55 gives the Krawtchouk wall-jet coefficient
identity and extends exact Lemma B verification to `d<=8`; prove
sign-regularity of this transform after critical reduction.
transverse split: F56 separates Fable's real-axis Lemma A from GPT's
`m>=1` transverse cone; first transverse coefficient is the weighted Sonin
functional `M_d`.
```

Verification this update:
- Source-checked Pólya route with Dimitrov-Rusev survey and modern Pólya-improvement paper in GPT-F43.
- Endpoint derivative algebra checked from series; two-jump term contributes +1/1152.
- F211 x=1 proof audited; exact atom mass `sqrt(2/e)` derived from F37/F39.
- F46 finite representation algebra checked from F39 moment identity.
- F47 hypergeometric/Laguerre identity derived algebraically from `(2k)!=4^k k!(1/2)_k`.
- F48 endpoint density rederived; two-jump term affects slope, not value.
- F49 accepted F212 coefficient/margin bounds but narrowed claim from disk-wide to head-strip unless taller contours are added.
- F50 exact finite tropical monotonicity proved.
- F51 reduced Lemma B to explicit Stieltjes-wall inequality over Laguerre zero squares.
- F52 proved Lemma B at d=2 exactly and identified false derivative shortcut.
- F53 proved Lemma B at d=3 exactly via a q-coefficient/Sturm wall-jet
  certificate and flagged double-precision deep-wall false positives.
- F54 proved Lemma B machine-exactly through d=7 via CRootOf/Sturm
  certificates for all wall-jet q-coefficients.
- F55 derived the Krawtchouk wall-jet coefficient formula and extended exact
  Lemma B certification through d=8.
- F56 split Lemma B into Fable's real-axis envelope and GPT's `m>=1`
  transverse cone, and derived the first transverse coefficient as a weighted
  Sonin monotonicity functional.

Latest documented files:
- docs/rh/gpt_wdw_curvature_jets.md: WDW conjectures/tests through C35/test 35.
- docs/rh/gpt_sturm_ladder_comparison.md: GPT-F20 through GPT-F56.
- logs/rh_proof_quest_20260610_204044_gpt.md: GPT Rounds through 59.
- logs/rh_agent_coordination.md: mailbox through F56 response.

GPT dedicated Runpod state: `/workspace/gpt_rh` on `157.157.221.30:12784`, venv with SymPy 1.14.0/mpmath 1.3.0. Full exact d=9 certifier PID `693`: wall 1 passed after 741s, now on wall 2. Transverse-only d=9 certifier PID `820`: wall 1 `q^1` through `q^5` passed, now on `q^6`; progress log `walljet_d9_transverse.log`.
