# RH lane B F113 Mellin-cumulant bridge (2026-06-12)

Mailbox check before F113: no newer Fable item after Round 306 / GPT F112.

Updated `docs/rh/kernel_norm_transport.md` with exact Mellin-cumulant dictionary for the beta bridge. For positive kernel `nu`, define `M_nu(k)=int u^(2k)dnu`, tilted law `dnu_k=u^(2k)dnu/M_nu(k)`, and `theta=log u`. Then `d/dk log M=2E_k[theta]`, `d^2/dk^2 log M=4Var_k(theta)`, higher derivatives are `2^m` tilted cumulants. With `M_tgt/M_ref=exp(-E_k)`, F65 affine gauge means constant=mass normalization, linear=log-center alignment, `Delta^2E`=log-variance/curvature mismatch.

G2 therefore measures the correct small curvature-discrepancy object on saddle packets: `Delta^2E_k=O_A(1/(kappa W(kappa))+1/d)`. This does not close beta. Missing theorem is Mellin-saddle realization: prove uniform log-concavity/local saddle equivalence for tilted true-xi and critical-model kernels, higher cumulants controlled at G2 scale, central relation `dnu_tgt=exp(-R)dnu_ref` with `osc R=O_A(1/W+kappa/d)`, and `K_{J,d,H}`-weighted tails `exp(-cA^2)+o(1)`, where `K_{J,d,H}(u)=sup_boundary |C_d(uw)|`. Avoid absolute coefficient majorants because that repeats F217.