# RH Lane B F125 normalized-cumulant transfer lemma (2026-06-12)

Added `docs/rh/kernel_norm_transport.md` §5f. Deterministic transfer from residual derivative bounds to normalized Bromwich cumulant matching.

Setup: `A_1=A_0-R`, saddles `A_0'(k_0)=2theta`, `A_1'(k_1)=2theta`, `sigma_0(k)=A_0''(k)^(-1/2)`, normalized cumulants `Lambda_{j,r}=A_j^(r)(k_j) A_j''(k_j)^(-r/2)`.

Assume on normalized packet `|z|<=A`: `0<c<=A_0''(k)/A_0''(k_0)<=C`, reference normalized cumulants are z-Lipschitz `|d/dz Lambda_{0,r}^{loc}(z)|<=L_{r,A}`, residual derivatives satisfy `|R^(r)(k)| sigma_0(k)^r <= eps_{r,A}` for `1<=r<=R+1`, and `eps_{2,A}<=1/2`. Then saddles shift by `|(k_1-k_0)/sigma_0(k_0)|<=C_A eps_{1,A}`, and for `3<=r<=R`, `|Lambda_{1,r}-Lambda_{0,r}|<=C_{r,A}(eps_{1,A}+eps_{2,A}+eps_{r,A})`.

Proof: saddle equation `A_0'(k_1)-A_0'(k_0)=R'(k_1)` plus strong convexity gives the shift. Then `A_1^(r)(k_1)=A_0^(r)(k_1)-R^(r)(k_1)` and `A_1''(k_1)=A_0''(k_1)(1-R''/A_0'')`; reference cumulant Lipschitz + residual derivative + denominator expansion gives the bound. Affine gauge `R(kappa)=R'(kappa)=0` gives the normalized r=1 bound from r=2 inside fixed-A windows.

After F122-F125, Lane B beta is reduced to two xi-specific estimates: finite-order normalized derivative bounds `|R^(r)| sigma_0^r=O_A(1/W(kappa)+kappa/d)` and common Gaussian contour domination for the Bromwich integrals. Everything else is deterministic bookkeeping feeding F114 local Laplace-stability and Corollary-T socket. Not an RH proof yet.