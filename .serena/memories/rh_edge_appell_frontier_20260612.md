# RH edge-Appell frontier (updated after GPT-F66/R70, 2026-06-12)

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
Fable Round 257: proved Lemma A by Sonin-Pólya modulo endpoint `M_1>=1`, audited GPT F53-F56, and flagged same-IP shared-host coordination between Fable pod-2 and GPT pod.
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

F57 all-degree first transverse wall jet:

```text
B_{d,1}(s;r_j)>=0 for every d>=2, every critical square r_j, and 0<=s<=1.
```

Proof uses F56 plus monotonicity of `M_d` up to critical squares. With

```text
M_d'=A P_d^2-BP_dP_d'+C(P_d')^2,
A=1+x/(4d), B=3x/(2d)+x^2/(4d^2), C=4x+x^2/d,
```

the discriminant is

```text
B^2-4AC=x N_d(x)/(16d^4),
N_d=x^3+(12d-16d^2)x^2+(36d^2-128d^3)x-256d^4.
```

For `d>=2`, `N_d` has exactly one positive root and
`N_d(4d(4d-1))=-16d^3(12d+1)<0`, so `M_d'>0` on
`0<x<=4d(4d-1)`. Critical squares are `r_j=4d xi_j` with `xi_j` zeros of
`L_{d-1}^{1/2}`; the Jacobi row-sum bound gives `xi_j<4d-1`, hence
`r_j<4d(4d-1)`. Therefore `M_d(r_j)>=M_d(sr_j)` and `B_{d,1}>=0`.
Remaining transverse cone begins at `m>=2`.

F58 real-axis Lemma A direct energy closure:

```text
S_d(x)=P_d(x)^2+4xP_d'(x)^2,
S_d'(x)=2P_dP_d'+4P_d'^2+8xP_d'P_d''=(2x/d)P_d'^2>=0.
```

Since `S_d(0)=1` and `S_d(r)=P_d(r)^2` at every critical square `r`,

```text
P_d(sr)^2<=S_d(sr)<=S_d(r)=P_d(r)^2, 0<=s<=1.
```

Thus `D_d(s,0;r)=P_d(r)^2-P_d(sr)^2>=0` for all degrees and critical walls.
Fable's residual `M_1>=1` needs no numeric check. Current finite-lift gap:
only transverse `B_{d,m}` for `m>=2`.

F59 exact degree-9 transverse certificate:

```text
H_9=-r^8+2448r^7-2313360r^6+1082652480r^5-267956488800r^4
    +34727160948480r^3-2187811139754240r^2
    +56258000736537600r-379741504971628800.
critical squares:
10.17481133219757, 41.03545685693809, 93.65489436261706,
170.0681233510005, 273.7892267723381, 411.0185547556499,
593.9787887156094, 854.2801438536495.
Q_degrees q=18 s=17 r=7.
```

Exact CRootOf/Sturm transverse certification passed for all eight walls and
all `q^1..q^18` coefficients. Combining with F58 `q^0` gives Lemma B with
factor `1` for every critical wall through `d<=9`. Remaining all-degree gap:
`B_{d,m}(s;r_j)>=0` for arbitrary `d` and `m>=2`.

F60 true-xi head pivot:

```text
Fable pivoted from alpha/(j+b) model to actual xi head limit
Phi_{xi,n}(s)=sum_k (-1)^k exp[-S_n(k)]s^k/k!,
S_n(k)=sum_{r=1}^{k-1}(k-r)c_{n+r}.
GPT answer: no washout. The d->infinity head limit retains all future
curvatures c_{n+r}; it is not exactly Phi_{1,1}.
Using F205 c_j=(1/j)(1-2/(W(2j/pi)+1)+O(W^-2)),
S_xi(k)=S_0(k)-2k log W(2k/pi)+O(k), so
exp[-S_xi(k)]=exp[-S_0(k)]W(2k/pi)^(2k)exp[O(k)].
Therefore xi head is not a Hurwitz-small fixed-Bessel perturbation.
Fixed F211 compact cosine-atom transfer cannot be verbatim: required moments
A^k exp[-S_xi(k)](2k)!/k! eventually exceed bounded [0,1] moments for every
fixed A>0. Complete monotonicity of exp[-S(k)] alone gives an exponential
mixture E exp(-Us), not the cosine/Bessel representation needed for F211.
New target: running-Bessel LP/WKB theorem with
L(k)=exp[(S_0(k)-S_xi(k))/(2k)]~W(2k/pi) and zero-count prediction
N(w)~wL(w)/pi, equivalently s_m L(sqrt(s_m))^2/m^2 -> constant.
```

F61 xi-head diagnostic correction:

```text
Raw Hausdorff complete monotonicity of b_k=exp[-S_xi(k)] is the wrong F211
criterion. If b_k=int u^k dmu(u), then Phi_xi(s)=sum(-1)^k b_k s^k/k!
=int e^{-us}dmu(u)>0 for s>0, so it cannot explain the desired positive
hard-head zeros. F39/F211 moment-ness applies only after factoring out an
oscillatory Bessel kernel B in Phi=E B(Us).
F205 plus Stirling gives a_k=exp[-S_xi(k)]/k! with
-log a_k=2k log k-2k log W(2k/pi)+O(k): order 1/2 but infinite type.
Every fixed Bessel/cosine kernel has finite type -log a_k=2k log k+O(k), so
fixed-kernel residuals grow like W(2k/pi)^(2k)exp[O(k)] and cannot be compact
moment sequences under any fixed scaling. Correct xihead diagnostics: raw CM
failure is expected; plot zero/central-index scale against wW(w), specifically
N(w)/(wW(w)), not the fixed Phi_{1,1} ruler.
```

F62 fixed-shift Hurwitz audit:

```text
Fable reports Phi_{xi,0} has nonreal zeros and concludes frozen head is wrong.
GPT pushback: normalized fixed-shift finite sections have exact coefficient
form F_{d,n}(s)=sum_{k<=d}(-1)^k((d)_k/d^k)exp[-S_n(k)]s^k/k!, so
F_{d,n}->Phi_{xi,n} locally uniformly. If Phi_{xi,0} has a genuine simple
nonreal zero z0, then by Hurwitz/argument principle sufficiently large
F_{d,0} has a nonreal zero: possible RH falsification route. Finite
hyperbolicity through d~96 does not refute this. Live alternatives:
normalization/sign/factorial/indexing bug, truncation/precision artifact, or
genuine eventual fixed-shift Jensen nonhyperbolicity. Highest-priority audit:
post one nonreal z0 and count zeros of F_{d,0} on a small circle around z0 for
increasing d; this is higher priority than shifted Phi_{xi,n} scans.
```

F63 finite-section cutoff delay:

```text
Finite sections differ from the fixed head by ((d)_k/d^k)=
exp[-binom(k,2)/d+O(k^3/d^2)]. A fixed-head zero with central index nu is
hidden until d>>nu^2. Regimes: d<<nu^2 safe binomial Gaussian dominates;
d~nu^2 is F27/F28 boundary-layer race; d>>nu^2 gives Hurwitz transfer to the
fixed head. Thus d~96 only tests fixed-head zeros with nu well below 10.
Correct audit: stabilize nonreal z0 of Phi_{xi,0}, estimate nu(|z0|), then
count zeros of F_{d,0} around z0 for d=C nu^2 with C=1,2,4,8,16,...
```

F64 true-xi two-scale moving edge:

```text
For true xi, set C(k)=sum_{r<=k}c_r. The exact finite-section adjacent ratio is
tau_{d,k}=k exp(C(k-1))/(d-k+1), so the active hard-head index kappa_d solves
kappa_d exp(C(kappa_d))~d. F205 gives C(k)=log k-2log W(2k/pi)+O(1), hence
kappa_d=Theta(sqrt(d)W(sqrt(d))). Around this moving layer,
tau(y kappa_d)/tau(kappa_d)=y^2[W(2kappa_d/pi)/W(2y kappa_d/pi)]^2(1+o(1))
=y^2(1-2log y/W+O(W^-2)+o(1)), so the finite xi edge is a log-slow
perturbation of the critical Laguerre hard head.

For a fixed-head zero with central index nu, distinguish
d_move(nu)~nu exp(C(nu))~nu^2/W(2nu/pi)^2 from the Hurwitz scale d_H(nu)~nu^2.
At d_move the binomial cutoff is still exp[-W^2/2] and can hide fixed-head
zeros; at d_H it is negligible and a genuine simple Phi_{xi,0} nonreal zero
must transfer. Therefore Fable's drift picture is valid for the moving layer,
but cannot dismiss fixed-shift Hurwitz. Audit both scales for any posted z0.
```

F65 exact renormalized critical-edge comparison:

```text
Define C(k)=sum_{r<=k}c_r, H(k)=sum_{r<=k}1/r, L(k)=exp((H(k)-C(k))/2).
For true xi finite ratios tau_xi(d,k)=k exp(C(k-1))/(d-k+1), and critical
ratios tau_crit(D,k)=k exp(H(k-1))/(D-k+1). With D=d L(kappa-1)^2,

tau_xi(d,k)/tau_crit(D,k)= [L(kappa-1)/L(k-1)]^2 * [1-(k-1)/D]/[1-(k-1)/d]

exactly. On |k-kappa|<=A sqrt(kappa), F205 gives log-ratio error
O_A(1/(sqrt(kappa)W(kappa))+kappa/d). Thus the moving xi edge is microlocally
a vanishing diagonal perturbation of the critical Laguerre edge. Remaining
proof obligation: critical-cell stability margin beats this perturbation.
```

F66/Fable F213 accepted and trust-radius rule:

```text
Fable retracts the 'wrong fixed head' claim and provides exact xihead normalization.
Fable warns the 18/40 result straddles a Szego/Turan/Jenkins-McLaughlin trust boundary: far complex roots are likely section artifacts; onset roots require winding persistence and tail certification.
Exact xi-head ladder:
Phi'_{xi,n}(s)=-Phi_{xi,n+1}(e^{-c_{n+1}}s).
Proof: S_n(m+1)=m c_{n+1}+S_{n+1}(m). Consequences: LP is upward-closed in shift n; trusted nonreal counts cannot increase with n at polynomial-section level; scans violating this are artifacts. Under RH all heads LP, so a trusted nonreal Phi_{xi,0} zero remains an RH-falsification candidate.
```

GPT Runpod computation R69/R70:

```text
Dedicated endpoint only: ssh root@157.157.221.30 -p 12784 -i ~/.ssh/id_ed25519
Script: scripts/research/hilbertPolya/gpt_xihead_audit.py copied to
/workspace/gpt_rh/xihead_audit/gpt_xihead_audit.py.
Live workdir: /workspace/gpt_rh/xihead_audit/run_20260612_123309
Main PID: 4248, workers: 4.
Command: --jmax 170 --degree 90 --dps 320 --workers 4 --shifts 0,16,64 --samples 768.
Goal: independent xi moment/curvature computation; roots of truncated Phi_{xi,n}; if nonreal n=0 zero appears, central-index estimate and finite-section argument-principle counts at d_move and C nu^2.
Checkpoints: xihead_audit_events.jsonl and xi_log_moments.json.
Progress after F66 read: 110/171 moments at elapsed ~6:44; four workers at ~100% CPU, no stderr.
Important: current run is pilot only. Classify roots by central index/trust radius. Next pass should match Fable endpoint u<=4.5, extend K=140/240/360 as needed, use winding counts, and enforce F213 monotonicity in n.
Normalization note: GPT script Phi kernel is exactly half of Fable's; this adds a constant to log moments and cancels in c_j, so curvatures are equivalent.
```

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
first transverse closure: F57 proves `B_{d,1}>=0` for all degrees, so GPT's
remaining transverse cone is `m>=2`.
real-axis closure: F58 proves Lemma A directly with `S_d=P_d^2+4x(P_d')^2`,
so the only finite-lift gap is transverse `m>=2`.
d=9 certificate: F59 extends exact Lemma B verification through `d<=9` by
transverse CRootOf/Sturm passes on all eight walls.
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
- F57 proved the first transverse wall coefficient `B_{d,1}` is nonnegative
  for all degrees using a positive-definite `M_d'` threshold and Laguerre
  Jacobi zero bound.
- F58 proved the real-axis Lemma A term directly via the monotone Sonin energy
  `S_d=P_d^2+4x(P_d')^2`, closing Fable's endpoint residual.
- F59 extended exact Lemma B verification through `d<=9` by combining F58
  real-axis closure with d=9 transverse CRootOf/Sturm passes on all eight
  critical walls.
- F60 answered Fable's true-xi head pivot: the head limit retains true
  curvature and is not a fixed-Bessel perturbation; F205 gives the running
  scale `L(k)~W(2k/pi)` and the replacement zero test
  `s_m L(sqrt(s_m))^2/m^2 -> constant`.
- F61 corrected the xi-head diagnostic: raw Hausdorff monotonicity of
  `exp[-S_xi(k)]` gives a positive Laplace transform on `s>0`, not the
  F211 Bessel atom representation; F205 also gives order `1/2` infinite
  type, excluding any fixed compact Bessel-dilation model.
- F62 challenged Fable's self-refutation: `Phi_{xi,0}` is the locally uniform
  limit of fixed-shift normalized Jensen sections. A genuine simple nonreal
  zero is a possible eventual Jensen counterexample; finite checks to `d~96`
  do not prove the fixed head is the wrong object.
- F63 reconciled finite checks with F62: finite sections include
  `((d)_k/d^k)=exp[-binom(k,2)/d+O(k^3/d^2)]`, so a fixed-head zero with
  central index `nu` is hidden until `d>>nu^2`; `d~96` only tests
  `nu<<10`.

Latest documented files:
- docs/rh/gpt_wdw_curvature_jets.md: WDW conjectures/tests through C42/test 42.
- docs/rh/gpt_sturm_ladder_comparison.md: GPT-F20 through GPT-F63.
- logs/rh_proof_quest_20260610_204044_gpt.md: GPT Rounds through 66.
- logs/rh_agent_coordination.md: mailbox through F63 response.

GPT dedicated Runpod state: `/workspace/gpt_rh` on `157.157.221.30:12784`, venv with SymPy 1.14.0/mpmath 1.3.0. Per user instruction, use only this SSH endpoint. After F59, all GPT `rh_walljet_certifier` workers were stopped to reduce shared-host load; no active GPT pod computations remain.


Update after Fable F67-F69 / GPT R72 (2026-06-12):

```text
F213-b accepted: N(Phi_xi,n+1) <= N(Phi_xi,n) by Rolle/Hurwitz. Degree-90 pilot violates trusted monotonicity (real counts shift 0/16/64 = 10/6/0 of 90), so pilot roots are artifact calibration unless F216-certified.
F216 tail certificate: for log-concave head terms, |Phi-P_K| <= T_{K+1}(R)/(1-q), q=T_{K+2}/T_{K+1}. Applied to first K=90 shift-0 pilot zero z=60.8026350265991+1.82197907697443i, rho=0.879889173219223: min_C |P_K|=1.63339207425803e-14, tail=9.85134462573248e-14, tail/min=6.03121857941394. Candidate fails certificate; escalate K.
Corrected true-xi cosine-mixture Hankel test: m_k=exp(-S(k))(2k)!/(4^k k!). Cached moments give ordinary and shifted Hankel minors positive for all r<=20; supports but does not prove cosine-mixture route.
K-escalation audit running on dedicated GPT pod PID 4623: Xi(0)=0.49712077818831; z*(100)=393.297, z*(140)=658.775, z*(240)=1530.94, z*(360)=2923.36; K=140 root solve still running, no stderr.
F217 accepted as joint step-2 target: F65 gives epsilon_d->0 on root windows; F216 must provide uniform finite-window truncation; remaining theorem is uniform Lipschitz of Lemma-B wall functional controlled by endpoint margin, not raw degree.
```


Update after Fable F70-F71 / GPT R73-R74 (2026-06-12):

```text
F70 accepted: naive F217 value-comparison is dead beyond near cells. Coefficient majorants are cosh-scale while wall values are cos-scale, so value/Rouche routes reach only O(log d) cells. Far moving windows need F218 Prüfer/WKB phase transport.
F71 accepted: K=90 pilot zero/circle was a near-real cluster circle, not a clean F62 candidate; old d=2916.. winding table must not be used as evidence. Need adaptive recentering after K-escalation resolves clusters.
Corrected cosine-moment top support diagnostic: m_k=exp(-S(k))(2k)!/(4^k k!), with exact ratio m_{k+1}/m_k=((2k+1)/2)exp(-C(k)). F65/F205 implies ratio grows like const*W(2k/pi)^2, so if the Stieltjes/cosine representation exists, support is unbounded (tau=infinity) and no finite top atom exists. Data: r_160=31.5822853, W^2=11.5590315, ratio=2.7322605, drifting toward e. F211 compact atom transfer cannot apply to true xi; replacement is unbounded saddle x_k~e W(2k/pi)^2 / F218 phase transport.
KM applicability audit: F65 gives diagonal coefficient multiplier a_k^xi=a_k^crit exp(-E_k), not an orthogonality-preserving varying-weight Laguerre polynomial. Needed bridge: Laguerre Plancherel-Rotach/Prüfer phase stability under slow log-amplitude multipliers with osc(E_k)=o(1) and unit-step variation o(kappa^-1/2). KM supplies unperturbed critical phase/Airy model; F65 supplies slow perturbation.
K-escalation audit still running on dedicated GPT pod PID 4623 at elapsed ~19 min, no stderr, latest output unchanged after trust radii.
```


Update after Fable F72-F73 / GPT R75 (2026-06-12):

```text
F72/G5 smoothness quantified from cached moments. For model c_j~(1/j)(1-2/(W(2j/pi)+1)), residual finite differences decay: window 80-128 max|res|=1.97e-4, max|d1|=4.66e-6, max|d2|=1.65e-7, max|d3|=7.70e-9; window 120-166 max|res|=9.00e-5, max|d1|=1.44e-6, max|d2|=3.43e-8, max|d3|=1.09e-9. Phase-window sums remain below rough pi/W budget on cached range.
Corrected true-xi cosine-moment Hankel tests extended to cache limit: ordinary det[m_{i+j}] and shifted det[m_{i+j+1}] positive for all r=0..80. At r=80 after positive scaling, log10|det| ordinary=-3219.7807007003, shifted=-3251.4729191866.
F218-L audit: the draft is right shape but must separate local ratio perturbation delta_k from cumulative coefficient multiplier E_k=sum_{r<=k}delta_r. The operator factor should be exp(-E(theta_E)) after subtracting affine drift absorbed by F65 rescaling. F65 supplies centered osc_window(E_k)=O_A(1/(sqrt(kappa)W(kappa))+kappa/d). With this correction, mode concentration -> scalar drift absorption -> Prüfer residual o(1) is coherent.
F73 audit accepted: F9/F12/F13/F18 verified by Fable. Added F9 sigma h^2 correction cancellation note to docs: 3aw-12aw+9aw=0, so B-A h^4 branch equation is independent of w. F12/F13 conditionality discharged in shared ledger.
K-escalation audit still running on dedicated GPT pod PID 4623, elapsed ~26 min, no stderr; latest output remains Xi(0) gate and z* radii.
```


Update after GPT R76-R77 / Fable F74 (2026-06-12):

```text
SRMT/WDW project audit: WDW Airy/Langer transfer supplies the right analogy for F218: raw value matching fails across turning surfaces; phase/action coordinates plus uniform Airy connection are stable. SRMT adds the affine-gauge warning: free affine slope can hide physics. For F218, constant cumulative multiplier is amplitude gauge, linear multiplier is variable-rescaling gauge, and only the F65-centered residual R_k is physical.
F218-SRMT lemma drafted: if Q_E has coefficients a_k exp(-E_k), and E_k=B+A(k-kappa)+R_k on a saddle packet, the affine part gives exp(-B)exp(Akappa)Q(exp(-A)z); real-root count is unchanged by this gauge. For normalized critical Laguerre packet v_z, BO-style residual infidelity is <= Var(R)+O(||R||^3) <= osc(R)^2/4+O(osc(R)^3). With F65 osc(R)=O_A(1/(sqrt(kappa)W)+kappa/d)=o(1), Prüfer phase drift should be O(osc R) once Laguerre packet phase gap is proved.
Fable F74 read. K-escalation: K=140 re-root done after 2026s; many K=140 roots have central-index faithfulness, but first tested windings around those roots collapse at K=240 and K=360 (K=140 count=1, K=240/360 count~0), so preliminary interpretation is Szego/Turan artifacts. Job PID 4623 still running on GPT dedicated pod, no stderr.
F220 strengthened: q-damped detector Phi_q=sum(-1)^k exp[-S(k)]q^(k^2)s^k/k! is valid for every 0<q<=1, not only q<=0.309, because GPT-F1 heat-line theorem proves gamma_k=q^(k^2)=exp(-Ck^2/2) is a Polya-Schur multiplier sequence in exponential-generating normalization. Contrapositive: certified nonreal zero of Phi_q for any q implies Phi not LP. Scan q upward (0.5,0.7,0.85,0.93,0.97,...) with direct Gaussian tail certificates.
F221 downgraded/watch only: cosine transform of a measure is not generally canonical-system A-function; inverse spectral map is nonlinear, and true xi mixing support is unbounded. Useful as Hilbert-Polya vocabulary/model experiment only.
F222 accepted: Hermite criterion converts finite section hyperbolicity to PSD of Hankel matrix of Newton power sums. Interval moments -> interval c_j -> interval coefficients -> interval Newton sums -> interval Hermite PSD can make low-k arithmetic census theorem-grade without root finding.
```
