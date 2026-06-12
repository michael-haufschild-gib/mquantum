# RH Lane B F123 saddle-amplitude reduction (2026-06-12)

Added `docs/rh/kernel_norm_transport.md` §5d after F122. Conditional on a uniform inverse-Laplace saddle expansion for both Mellin kernels,
`h_j(theta)=exp(-I_j(theta))/sqrt(2pi A_j''(k_j(theta))) * exp(delta_j(theta))`, `2theta=A_j'(k_j(theta))`, the local density-potential mismatch decomposes exactly as
`-log h_1 + log h_0 = I_1-I_0 + (1/2)log(A_1''(k_1)/A_0''(k_0)) + delta_0-delta_1`.

F122 controls the Legendre part. The determinant ratio is controlled by residual derivatives:
`log(A_1''(k_1)/A_0''(k_0)) = log(1-R''(k_0)/A_0''(k_0)) + O(|k_1-k_0| sup |(log A_0'')'|) + O(|k_1-k_0| sup |R'''|/A_0'')`.

Thus remaining xi-specific theorem: common steepest descent contour on F65 window, `|R''|/A_0''=O_A(eps)`, `|R'''| sigma_k/A_0''=O_A(eps)`, `osc(delta_1-delta_0)=O_A(eps)`, where `eps=1/W(kappa)+kappa/d`. Then `osc Q=O_A(eps)+O_A(eps^2 A^2)` and F114 local Laplace-stability consumes it. This does not close beta; it replaces abstract density residual with explicit contour/remainder stability for true xi vs critical model.