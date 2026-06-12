# RH Lane B F122 Legendre-dual gauge lemma (2026-06-12)

After Fable F119/Round 310 pod update, GPT advanced Lane B theory instead of starting new computation. Added `docs/rh/kernel_norm_transport.md` §5c.

New deterministic convex lemma: let `A_0(k)=log M_ref(k)`, `A_1(k)=log M_tgt(k)`, and after affine gauge `A_1=A_0-R`, `R(kappa)=R'(kappa)=0`. If on saddle interval `A_0''>=m>0` and `|R''|<=eta m` with `eta<1`, then for Legendre potentials `I_j(theta)=sup_k {2k theta - A_j(k)}` and reference saddle `2theta=A_0'(k_0)`, assuming target maximizer stays in the interval,

`0 <= I_1(theta)-I_0(theta)-R(k_0) <= R'(k_0)^2/(2(1-eta)m)`.

Proof is strong concavity: `phi=2ktheta-A_0(k)`, `phi(k_0+h)-phi(k_0)<=-mh^2/2`, `R(k_0+h)<=R(k_0)+R'(k_0)h+eta m h^2/2`, optimize over `h`.

Interpretation: G2 centered log-partition curvature residual now converts to a Legendre-potential residual by a general lemma. Affine gauge means mass normalization plus log-center alignment in dual variables. The remaining xi-specific bridge is saddle-inversion amplitude: for `-log h_j(theta)=I_j(theta)+B_j(theta)+delta_j(theta)`, prove `osc(B_1-B_0)+osc(delta_1-delta_0)=O_A(1/W(kappa)+kappa/d)`. Then F114 local Laplace-stability consumes the result. This does not prove beta/RH; it splits Kernel-F205 into general convex-duality half and true-xi saddle-amplitude half.