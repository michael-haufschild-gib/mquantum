# RH Theorem M F116 round-307 hardening audit (2026-06-12)

After F115, GPT audited Fable's F111/Round-307 hardening targets (E1 Szegő constant, E1b beyond-edge, E7a exact integral, E4 beyond-edge crumb, E5/E8 arithmetic, X-wall). Verdict: accepted after one harmless E4 display correction. `docs/rh/theorem_M_draft.md` was patched and ledger changed to PROVED + GPT F116 audited.

Key checks: `C_d(w)` proportional to `H_{2d}(w/sqrt(4d))`, hence `rho_d=sqrt(4d)x_max(H_{2d})`. With Szegő `x_max(H_n)<=sqrt(2n+1)-1.8557 (safe rounded-down F121 correction; earlier F116 text had unsafe 1.85575)(2n+1)^(-1/6)`, `Omega(rho_d)^2 >= 0.73643 (safe F121 correction) d^(-2/3)`, so `Omega(rho_d)>=0.85815 (safe F121 correction; publish 0.858) d^(-1/3)` and `E0<=1.025+log(d)/(6pi)`.

E1b: for `g=w_e-rho_d`, `Omega(w_e-g/2)^2=(g/2)(2w_e-g/2)/(16d^2)>=g/(8d)` since `g<=w_e`, `w_e>=4d`. No zero in `(rho_d,w_e)` gives `Omega(w_e-g/2)(g/2)<pi`, hence `g<=(32pi^2)^(1/3)d^(1/3)=6.81004d^(1/3)`. Tail mass bound is `2.6667`, so `2.68` and `|e|<=2.43` are valid.

E7a: exact integral `int_0^we sqrt(we+s)/sqrt(we-s) ds = we(pi/2+1)` via `u=we-s=2we sin^2(phi)`. Enhancement `((pi/2+1)/pi)(we/4d)=0.81831...` at `d=1e6`.

E4 correction: draft claim `w_e-x >= 8d^(1/3)` was tightened to exact `w_e-x >= 8d^(1/3)/sqrt(1+1/(4d)) >= 7.99d^(1/3)` for `d>=1e6`. Contribution remains `<=0.609/d^(1/3)<=0.007`, so E5 unchanged.

Arithmetic: `E0(1e6)=1.75794`, bulk `Re<=2.66935`, `K_bulk=2.97745<2.98`; edge `Re<=2.64503`, `K_edge=2.95566<2.96`. X-wall: `p=sqrt(2/e)=0.8577638849`, `(1-p)sqrt(5)/p=0.370789`, floor `0.241368`.