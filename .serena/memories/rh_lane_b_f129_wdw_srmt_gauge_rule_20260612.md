# RH Lane B F129 WDW/SRMT gauge rule (2026-06-12)

Added `docs/rh/kernel_norm_transport.md` section 5j after reading WDW/SRMT docs and `docs/rh/gpt_wdw_curvature_jets.md`.

Main rule imported from WDW curvature jets and SRMT rigid-vs-affine diagnostics: affine agreement is gauge, not evidence, unless explicitly removed. For local section `Q(t)=sum_k c_k t^k`, multiplying coefficients by `exp(B+A(k-kappa))` gives `exp(B-Akappa) Q(exp(A)t)`. Constant jet changes amplitude; linear jet changes positive variable scale. Neither changes real-rootedness or cell zero count.

Thus in F65 notation `E_k=B+A(k-kappa)+R_k`, only centered residual `R_k` is physical. Lane B's analogue of SRMT's rigid diagnostic is small normalized residual jets `|R^(r)(k)| sigma_k^r` for `r>=2`, not unconstrained affine/least-squares agreement of raw `E_k`.

WDW/Airy-Langer transfer rule for contour package `(C)`: if the saddle is strict, use Gaussian Bromwich/cumulants as in section 5e. If the saddle approaches an Airy or higher turning regime, replace the Gaussian coordinate by the appropriate normal-form contour and prove the same centered residual estimate `R(k0+Delta k(s))-R(k0)-R'(k0)Delta k(s)=O(eps)` plus dominated contour and nonzero denominator. Then the log-Lipschitz argument of section 5e transfers with the Gaussian expectation replaced by the normal-form contour integral.

This is methodological, not RH evidence: it prevents false beta closure by affine fitting or raw value matching across turning normal forms.