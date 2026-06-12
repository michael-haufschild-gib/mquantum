# RH Lane B F124 Bromwich remainder-stability lemma (2026-06-12)

Added `docs/rh/kernel_norm_transport.md` §5e. Conditional on vertical saddle/Bromwich representation
`h_j(theta)=exp(A_j(k_j)-2k_j theta)/(2pi) int_R exp(A_j(k_j+it)-A_j(k_j)-it A_j'(k_j)) dt`, with `A_j'(k_j)=2theta`, `sigma_j=A_j''(k_j)^(-1/2)`, define normalized non-Gaussian phase
`U_j(s;theta)=A_j(k_j+i sigma_j s)-A_j(k_j)-i sigma_j s A_j'(k_j)+s^2/2`.

Then exactly `delta_j(theta)=log E_G exp(U_j(G;theta))`, `G~N(0,1)`, and `h_j=exp(-I_j)/sqrt(2pi A_j''(k_j))*exp(delta_j)`.

Deterministic stability: if a Gaussian-integrable envelope `V` satisfies `Re U_0, Re U_1 <= V`, `E exp(V)<=C_V`, `E[|U_1-U_0| exp(V)]<=tau`, and `E exp(Re U_j)>=c_V>0`, then `|delta_1-delta_0|<=tau/c_V` by log-Lipschitz plus `|e^a-e^b|` bound.

Taylor/cumulant consequence: with normalized cumulants `lambda_{j,r}=A_j^(r)(k_j)sigma_j^r`, `U_j=sum_{r=3}^R i^r lambda_{j,r}s^r/r!+Rem`, it is enough to prove `sum |lambda_{1,r}-lambda_{0,r}|E|G|^r/r! + E|Rem_1-Rem_0| + tails = O_A(eps)`, `eps=1/W(kappa)+kappa/d`.

Remaining Lane-B debt after F122-F124: normalized cumulants of true-xi and critical-model Mellin saddles match at G2 scale, and their Bromwich contours have a common dominated Gaussian envelope. If true, F122/F123/F124 feed F114 local Laplace-stability and Corollary-T beta socket. This is not RH proof yet.