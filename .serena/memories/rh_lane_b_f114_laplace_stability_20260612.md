# RH lane B F114 local Laplace-stability socket (2026-06-12)

Mailbox check before F114: no newer Fable item after F113.

Updated `docs/rh/kernel_norm_transport.md` §5b with a conditional local Laplace-stability lemma. In `theta=log u`, after `kappa` tilt and affine gauge, on `I_A={|theta-theta_0|<=A sigma}` write `dnu_ref=Z_ref^-1 exp(-V(theta))dtheta`, `dnu_tgt=Z_tgt^-1 exp(-V(theta)-Q(theta))dtheta`, `Q(theta_0)=Q'(theta_0)=0`. If `|Q''|<=eps_2/sigma^2`, `|Q'''|<=eps_3/sigma^3`, and weighted tails satisfy `nu_ref(I_A^c;J,H)+nu_tgt(I_A^c;J,H)<=T_A`, then Taylor gives `osc Q <= eps_2 A^2 + (1/3)eps_3 A^3`, and the positive-kernel perturbation lemma gives `||nu_tgt-nu_ref||_{J,d,H} <= exp(eps_2 A^2+(1/3)eps_3 A^3)-1+T_A`.

Thus beta is conditionally closed by proving two xi-specific estimates: local potential-derivative lift of G2 (`Q''`, `Q'''` bounds after affine gauge) and `K_{J,d,H}` boundary-weighted saddle tails. At expected scale `eps_2,eps_3=O(1/W(kappa)+kappa/d)`, a moving window like `A=eps^(-1/4)` gives central error of positive power size before tails. This is not beta closure; it narrows the missing theorem.