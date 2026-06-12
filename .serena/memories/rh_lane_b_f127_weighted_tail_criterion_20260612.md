# RH Lane B F127 weighted tail criterion (2026-06-12)

Added `docs/rh/kernel_norm_transport.md` section 5h. This turns F126's `(T)` section-weighted tail package into a deterministic weighted-action saddle criterion.

Define `B_{d,H}(theta)=log K_{J,d,H}(e^theta)`, where `K_{J,d,H}(u)=sup_boundary |C_d(uw)|`. For positive kernels `dnu_j(theta)=Z_j^-1 exp(-V_j(theta)) dtheta`, set weighted action `P_j(theta)=V_j(theta)-B_{d,H}(theta)`. Then weighted tail mass is exactly `nu_j(E;J,H)=Z_j^-1 int_E exp(-P_j(theta)) dtheta`; the correct tail saddle is `P_j`, not the unweighted density.

If `theta_j` is a weighted saddle, `sigma_j^2=P_j''(theta_j)^-1`, `P_j(theta_j+sigma_j x)-P_j(theta_j)>=q_j(x)` for `|x|>=A`, and `N_j:=Z_j^-1 exp(-P_j(theta_j))sigma_j<=C_N`, then `nu_j({|theta-theta_j|>A sigma_j};J,H) <= C_N int_{|x|>A} exp(-q_j(x)) dx`. In the quadratic case `q_j(x)>=c x^2`, `nu_j(tail;J,H) <= (2C_N/(cA)) exp(-cA^2)`.

Derivative check: if at the weighted saddle, unweighted kernel action has curvature lower bound `lambda` in saddle units and boundary weight has curvature upper bound `beta`, with `beta<lambda`, then `P_j` has barrier `((lambda-beta)/2)x^2`, hence `(T)` holds with `T_A=O(exp(-cA^2)/A)`.

New xi-specific tail contract: bound `B_{d,H}'` and `B_{d,H}''` on Theorem-M walls/caps; solve weighted saddle equations and show true/critical centers differ by `O(eps sigma)`; prove weighted normalizations `N_j=O(1)`; prove a tail curvature gap `lambda-beta>=c>0`. This is conditional and does not prove RH; it sharpens the Lane-B beta bridge.