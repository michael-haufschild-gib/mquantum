# RH Lane B F126 composed beta criterion (2026-06-12)

Added `docs/rh/kernel_norm_transport.md` §5g. Let `eps(kappa,d)=1/W(kappa)+kappa/d`. Lane B beta now reduces to three xi-saddle packages:

(D) finite-order derivative package: `|R^(r)(k)| sigma_k^r <= C_{r,A} eps` for `2<=r<=R+1`, plus reference normalized-cumulant z-Lipschitz on packet.

(C) common contour package: true-xi and critical-model Bromwich contours share Gaussian domination, and `E|Rem_{1,R}(G)-Rem_{0,R}(G)| + Gaussian tails <= C_A eps`.

(T) section-weighted tails: `nu_xi(I_A^c;J,H)+nu_crit(I_A^c;J,H) <= T_A`.

Then after affine gauge, the previous lemmas compose to
`||nu_xi-nu_crit||_{J,d,H} <= exp(C_A eps + C_A eps^2 A^2)-1 + T_A`.
Chain: (D)->normalized cumulants (§5f); (D)+(C)->Bromwich remainder (§5e); (D)+§5c/§5d->local density residual Q; §5b+(T)->weighted kernel norm. Corollary T fires once RHS < 1/8. Fixed A with T_A=o(1) suffices as kappa grows; moving A needs `eps A^2 -> 0`, `T_A -> 0` (or stronger depending on Taylor remainder). Not RH proof; clean contract for remaining xi-specific saddle analysis.