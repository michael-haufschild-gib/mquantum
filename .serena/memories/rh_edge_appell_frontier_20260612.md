# RH edge-Appell frontier (updated after GPT-F33, 2026-06-12)

Active route: WDW/Jensen curvature flow -> adjacent-section Sturm ladder -> Cauchy/Stieltjes/Mellin kernel positivity -> hard-head and large-shift asymptotics. Fixed-degree edge is useful but not identical to Fable's all-degree alpha_c boundary.

Core edge Appell EGF:

```text
sum_{d>=0} H_d^A(X)t^d/d! = exp(-Xt - A[t+(1-t)log(1-t)])
partial_X H_d^A = -d H_{d-1}^A
```

Known full fixed-degree edge constants:

```text
A_2=0
A_3=1/4
A_4=0.432678606330554...
A_5=0.5971174484502026728...
A_6=0.78752607887675735239...
A_7=1.02985121902549113375...
```

Correction from GPT-F26: naive `A_d<1` is false; degree 7 wall exceeds 1. Fable's `alpha_c=1` is not full fixed-d edge hyperbolicity.

F29/F30 hard-head entire limit:

```text
S_x(k)=sum_{r=1}^{k-1}(k-r)/(x+r-1)
Phi_{alpha,x}(s)=sum_{k>=0}(-1)^k exp(-alpha S_x(k))s^k/k!
P_{d,x}(s/d)->Phi_{alpha,x}(s) locally uniformly
partial_s Phi_{alpha,x}(s)=-Phi_{alpha,x+1}(e^{-alpha/x}s)
```

Local alpha_c proof target:

```text
Phi_{1,x} is Laguerre-Polya for all x>=1,
with scaled adjacent zeros interlacing by Rolle.
```

Latest Fable state:

```text
F202: d*(0.75,0)=180 and d*(0.8,0)=307 passed preregistered bands; free-pole fit alpha_c=0.9755 remains empirical alternative.
F203: kernel referee 22/22 HEAL+, zero anti-walls; F5/F7 exact; weak margins decay in deep windows.
F204: xi drift measured: alpha rises slowly to 1, b~j^0.53; clearance using old wall*d*(1+b/4) crosses near d~700-1000, likely calibration artifact.
Audit note: Fable read docs directly and accepted F14-F17; agrees fixed-degree wall accumulation is right lens for d*(alpha,b).
```

GPT-F31 fixed-ratio large-shift theorem:

For `x=n+b+1`, `d/x->rho`, `k/d->p`, coefficient potential is

```text
H(p)-alpha/rho*[(1+rho p)log(1+rho p)-rho p]
```

with formal root-log / tropical ratio map

```text
u_{alpha,rho}(p)=log(p/(1-p))+alpha log(1+rho p)
u' = 1/p+1/(1-p)+alpha rho/(1+rho p)>0.
```

Thus fixed-ratio large-shift asymptotics have no leading hydrodynamic caustic. A linear `d*(alpha,b)~rho(alpha)b` law is preasymptotic or subleading, not first-order large-b mechanism.

GPT-F32 large-b wall split:

For `k=o(x)`,

```text
S_x(k)=binom(k,2)/x - binom(k,3)/x^2 + O(k^4/x^3)
binom(d,k)d^{-k}=1/k!*exp(-binom(k,2)/d+O(k^3/d^2))
```

Head exponent separates as:

```text
safe thickness: (alpha/x + 1/d)binom(k,2)
variation penalty: alpha binom(k,3)/x^2 + higher Cauchy jets
```

Candidate large-shift wall layers:

```text
Airy correction: d~x^(4/3)
Full Cauchy head: d~x^2
```

Conjecture: heat-line total positivity protects the Airy layer in structured `alpha/(j+b)`, pushing true large-b wall toward full Cauchy-head scale. Since Fable measured `b~d^0.53`, quadratic large-b growth would bend F204 clearance upward and make the `(1+b/4)` crossing a calibration artifact.

Fable referee matrix requested:

```text
Fix alpha; compute d*(alpha,b) for b=16,32,64,128.
Compare d*/b, d*/b^(4/3), d*/b^2.
Stable column identifies asymptotic large-shift layer.
```

GPT-F33 Mellin-Hausdorff kernel certificate:

F12 rational transform at a common-root event:

```text
Phi(b)=sum_{r=1}^d K_r/(n+r+b)
```

Moment form:

```text
Phi(b)=int_0^1 q^b G(q)dq,
G(q)=sum_{r=1}^d K_r q^{n+r-1},
G_i(q)=(-1)^iG(q).
```

Tail certificate for all-shift Cauchy healing:

```text
T(q)=int_q^1 G_i(u)du >=0 on [0,1], T(0)>0
=> int_0^1 q^b G_i(q)dq>0 for all b>=0.
```

Prefix certificate for Laguerre-to-critical comparison:

```text
P(q)=int_0^q G_i(u)du >=0 on [0,1]
=> Phi_i(0)>=Phi_i(b) for all b>=0,
Phi_i(0)-Phi_i(b)=int_0^1(1-q^b)G_i(q)dq=b int_0^1 t^{b-1}P(t)dt.
```

Fable's kernel referee can test nested event certificates: `G_i>=0` strongest, `T>=0` all Cauchy shifts, `P>=0` Laguerre-to-critical monotonicity.

Latest documented files:
- docs/rh/gpt_wdw_curvature_jets.md: WDW theorems/conjectures through C17 and tests through 13.
- docs/rh/gpt_sturm_ladder_comparison.md: GPT-F20 through GPT-F33.
- logs/rh_proof_quest_20260610_204044_gpt.md: GPT Rounds through 41.
- logs/rh_agent_coordination.md: Fable mailbox through F33 response.

No Runpod work by GPT during this update.