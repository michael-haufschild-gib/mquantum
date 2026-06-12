# RH Theorem M F120 P2 clean-room batch 3 (2026-06-12)

GPT completed assigned P2 clean-room queue with E1/E1b and E7a/E7b. Added batch to `docs/rh/theorem_M_draft.md` §4a. Remaining publication-hardening phases: P3 source verification, P4 machine-verification script, P5 statement hygiene / anti-hype.

E1 PASS: using stated Hermite identity and Szegő bound, `rho_d=sqrt(4d)x_max(H_{2d})`, `w_e=sqrt(4d)sqrt(4d+1)`, `w_e-rho_d >= 1.8557sqrt(4d)(4d+1)^(-1/6)`. Therefore `Omega(rho_d)^2=(w_e-rho_d)(w_e+rho_d)/(16d^2)>=0.73643d^(-2/3)`, so `Omega(rho_d)>=0.85815d^(-1/3)`. Then `log(Omega(0)/Omega(s)) <= (1/3)log d + log(1/0.858)+1/(8d)`, yielding `E0<=1.025+log(d)/(6pi)`. Conditional on P3 verifying primary Szegő citation.

E1b PASS: with `g=w_e-rho_d`, `Omega(w_e-g/2)^2=(g/2)(2w_e-g/2)/(16d^2)>=g/(8d)` since `g<=w_e`, `w_e>=4d`. Zero-free Sturm comparison gives `Omega(w_e-g/2)(g/2)<pi`, hence `g<=(32pi^2)^(1/3)d^(1/3)=6.81004d^(1/3)`. Edge tail mass `<= (sqrt(2w_e)/(4pi d))(2/3)g^(3/2)<=8/3<2.68`, so `|e|<=2.43`.

E7a PASS: exact integral `int_0^{w_e} sqrt(w_e+s)/sqrt(w_e-s) ds=w_e(pi/2+1)` via `w_e-s=2w_e sin^2(phi)`. Enhancement `((pi/2+1)/pi)(w_e/(4d))<=0.8184` for `d>=1e6`.

E7b PASS: by-parts boundary jumps plus tail variation `<=4sup|e|/Lambda`, with `Lambda=pi d^(1/3)` and `sup|e|<=2.43` at `d=1e6`, giving `4*2.43/(pi d^(1/3))<=0.031`.

Completed GPT P2 queue: W1/W2/W3/A1, X-wall, Corollary T, W2′, B_ref, E1/E1b, E7a/E7b.