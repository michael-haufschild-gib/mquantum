# RH Theorem M P6.2 Hermite gap/right-tail kernel (2026-06-12)

GPT-owned file `formal/TheoremM/Hermite.lean` contains coefficient bridge plus first root-insertion scaffolding. Full formal build green after latest edits (`cd formal && ~/.elan/bin/lake build` -> `Build completed successfully (8486 jobs)`).

Key lemmas after `HermiteCpoly_eq_Cpoly`:

```lean
Cpoly_coeff_zero
Cpoly_coeff_top_ne_zero
Cpoly_coeff_gt_two_mul
Cpoly_natDegree
Cpoly_ne_zero
Cpoly_derivative_natDegree
Cpoly_derivative_ne_zero
exists_root_between_of_eval_mul_neg
exists_root_X_mul_sub_derivative_between_of_derivative_mul_neg
exists_root_right_of_eval_neg_of_leadingCoeff_pos
natDegree_X_mul_sub_derivative_of_monic
leadingCoeff_X_mul_sub_derivative_of_monic
exists_root_right_X_mul_sub_derivative_of_monic_of_derivative_pos
```

Meaning:
- `Cpoly d` has formal degree exactly `2*d`, nonzero top coefficient, and derivative degree `2*d-1` for `1 <= d`.
- Generic IVT lemma: if `p.eval a * p.eval b < 0` with `a < b`, then `p` has a root in `(a,b)`.
- Gap lemma: for `L(p)=X*p-derivative p`, if `a,b` are roots of `p` and `(derivative p).eval a * (derivative p).eval b < 0`, then `L(p)` has a root in `(a,b)`.
- Right-tail lemma: for monic `p`, `L(p)` has degree `p.natDegree+1`, leading coefficient `1`; if `a` is a root and `p'(a)>0`, then `L(p)` has a root strictly to the right of `a`.

Mathlib API found for next step:
- `Polynomial.Splits.eval_root_derivative`: for monic split `f`, root `x`, `f.derivative.eval x = ((f.roots.erase x).map (x - ·)).prod`.
- Use this for ordered-root derivative-sign bookkeeping; avoid proving derivative-product formula manually.

Open P6.2 pieces:
- Left-tail component.
- Ordered-root derivative-sign bookkeeping for erased-root products.
- Hermite induction assembly.
- Critical-data extraction for `Cpoly` after `HermiteCpoly_eq_Cpoly`.

Fable ownership note from mailbox F142: `TheoremM/Binet.lean` green, and Fable claims `TheoremM/CPMeasure.lean` for β3. GPT should not edit `CPMeasure.lean`.

Current runpod d=11 wall-jet job `/workspace/gpt_rh/gpt_rh_walljet_d11_20260612_175016` still running as of ~17:56 UTC: all 10 walls at ~100% CPU, no exit files, stderr empty, sampled walls 1/10 passed q^1..q^8 and started q^9. Archive/download still pending.