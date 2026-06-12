# RH Theorem M F119 P2 clean-room batch 2 (2026-06-12)

No newer Fable item after GPT F118. GPT continued P2 clean-room queue with X-wall, Corollary T, W2′, and B_ref. Added batch to `docs/rh/theorem_M_draft.md` §4a. Verdict: PASS with existing scope notes preserved.

X-wall PASS: set `X=rho_d+d`; for every zero `rho_j`, `|X+iy-rho_j|>=X-rho_j>=d`, hence `|psi(X+iy)|<=2d/d=2`. Generic y-monotonicity + W1 chain gives `|C(v(X+iy))|<=|C(vX+iy)|<=sqrt(E(vX))<=sqrt(E(X))<=sqrt(5)|C(X+iy)|`. Ratio `(1-p)sqrt(5)/p=0.370789...<1`; floor `p(1-0.370789...)/sqrt(5)=0.241367...`.

Corollary T PASS: with `K=2.98`, `r_cap=(1-p)sqrt(1+K^2)/p=0.52123...`, cap floor `p(1-r_cap)/sqrt(1+K^2)=0.130649...>1/8`. Wall floor `p-(1-p)sqrt(2)=0.6564...`; X-wall floor as above. Off-strip uses weaker published interface `0.403|C|`; old `0.313` lower bound still sufficient, hardened K gives `0.3183`. Scope essential: finite boundary control transports even real polynomials degree `<=2d`; arbitrary entire targets need exterior no-extra-zeros input.

W2′ PASS: Lemma 1 is criticality plus truncation: if nearest-zero distance `delta<pi/2`, radius `pi-delta>1` excludes only nearest zero and criticality gives `1/delta<=B`. Lemma 2 constants reproduce `1+6/pi+log(2)/pi=3.130494...`; final `C0(B)<=max(2/pi,B)+B+3.131<=2B+3.77`. Scope: literal for finite configurations; infinite configurations require stated principal-value convergence.

B_ref PASS for stated range only: for `d>=1e6`, smooth part `<=1.0000002`, fluctuation `<=6.73`, hence `B_ref<=7.8`. Scope unchanged: `d<=200` numerical; `200<d<1e6` remains uncertified by this lemma.

Remaining GPT P2 queue: E1/E1b and E7a/E7b.