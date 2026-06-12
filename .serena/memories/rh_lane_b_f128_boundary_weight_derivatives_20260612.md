# RH Lane B F128 boundary-weight derivative formula (2026-06-12)

Added `docs/rh/kernel_norm_transport.md` section 5i. This sharpens F127's boundary-weight curvature task into exact Stieltjes-transform formulas.

For fixed Theorem-M boundary point `w`, set `z=e^theta w`, `C_d(z)=prod_m(1-z^2/rho_m^2)`, `psi_d=C_d'/C_d`, and `b_w(theta)=log |C_d(e^theta w)|`. Then
`b_w'(theta)=Re[z psi_d(z)]=Re sum_m 2z^2/(z^2-rho_m^2)` and
`b_w''(theta)=Re[z psi_d(z)+z^2 psi_d'(z)]=Re sum_m -4 rho_m^2 z^2/(z^2-rho_m^2)^2`.
Equivalently, with `X=z^2` and `G_d(X)=sum_m 1/(X-rho_m^2)`, `b_w'=Re[2XG_d(X)]`, `b_w''=Re[4XG_d(X)+4X^2G_d'(X)]`.

Thus F127's `B_{d,H}'`, `B_{d,H}''` bounds reduce to a W2''-type second Stieltjes-transform estimate. Need prove `Re sum_m -4 rho_m^2 z^2/(z^2-rho_m^2)^2 <= beta/sigma^2` on relevant walls/caps with `beta` strictly less than positive-kernel action curvature `lambda`.

Since `B_{d,H}=sup_w b_w` may be nonsmooth, also need near-active slope stability: all boundary points within `O(1)` of the supremum should have slopes within `O(eps/sigma)` of a common envelope subgradient and satisfy the same curvature bound. Then the supremum inherits the quadratic upper-envelope bound needed by F127. Tail proof splits into fixed-boundary BW2/BW3 curvature, near-active slope stability, and `beta<lambda` comparison. Conditional; RH remains open.