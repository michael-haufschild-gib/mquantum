# RH Theorem M P6.2 Hermite gap/tail kernel (updated 2026-06-12 20:31 CEST)

GPT-owned file `formal/TheoremM/Hermite.lean` now has green coefficient bridge plus root-insertion scaffolding for the Hermite recurrence operator `L(p)=X*p-p'`, including adjacent-gap derivative-sign alternation and direct raw-Hermite recurrence insertion lemmas.

Validation for current GPT-owned lane:

```text
cd formal && ~/.elan/bin/lake build TheoremM.Hermite
# green: Build completed successfully (8477 jobs)
git diff --check
# green
```

Full formal tree currently fails in Fable-owned `formal/TheoremM/CPMeasure.lean` despite Fable F145 saying their tree was green. Local diagnostics from `cd formal && lake build`:

```text
error: TheoremM/CPMeasure.lean:585:4: Unknown identifier `tsum_eq_zero_add`
error: TheoremM/CPMeasure.lean:583:39: unsolved goals
error: TheoremM/CPMeasure.lean:637:54: unsolved goals
```

Do not edit `CPMeasure.lean`; Fable owns it.

Key Hermite lemmas after `HermiteCpoly_eq_Cpoly`:

```lean
Cpoly_coeff_zero
Cpoly_coeff_top_ne_zero
Cpoly_coeff_gt_two_mul
Cpoly_natDegree
Cpoly_ne_zero
Cpoly_derivative_natDegree
Cpoly_derivative_ne_zero
HermiteR
hermiteR_monic
hermiteR_succ
exists_root_between_of_eval_mul_neg
exists_root_X_mul_sub_derivative_between_of_derivative_mul_neg
derivative_eval_pos_of_monic_splits_rightmost_root
neg_one_pow_card_mul_prod_left_sub_eq_prod_sub_left
neg_one_pow_card_erase_mul_derivative_eval_pos_of_monic_splits_leftmost_root
prod_mul_sub_pos_of_forall_outside_gap
derivative_eval_mul_neg_of_monic_splits_adjacent_roots
exists_root_X_mul_sub_derivative_between_of_monic_splits_adjacent_roots
exists_root_right_of_eval_neg_of_leadingCoeff_pos
natDegree_X_mul_sub_derivative_of_monic
leadingCoeff_X_mul_sub_derivative_of_monic
exists_root_right_X_mul_sub_derivative_of_monic_of_derivative_pos
exists_root_right_X_mul_sub_derivative_of_monic_splits_rightmost_root
exists_root_left_of_neg_one_pow_mul_eval_neg_of_leadingCoeff_pos
exists_root_left_X_mul_sub_derivative_of_monic
exists_root_left_X_mul_sub_derivative_of_monic_splits_leftmost_root
exists_root_between_hermiteR_succ_of_adjacent_roots
exists_root_right_hermiteR_succ_of_rightmost_root
exists_root_left_hermiteR_succ_of_leftmost_root
```

Meaning:
- `Cpoly d` has formal degree exactly `2*d`, nonzero top coefficient, and derivative degree `2*d-1` for `1 <= d`.
- `HermiteR n` is real-coefficient probabilists' Hermite, monic, and satisfies `HermiteR (n+1)=X*HermiteR n - derivative (HermiteR n)`.
- Generic IVT gap lemma: if `p.eval a * p.eval b < 0` with `a < b`, then `p` has a root in `(a,b)`.
- Gap insertion: if `a,b` are roots of `p` and `p'(a)*p'(b)<0`, then `L(p)` has a root in `(a,b)`.
- Monic `p` gives `L(p).natDegree = p.natDegree + 1` and `L(p).leadingCoeff = 1`.
- Right tail: for monic split `p`, rightmost root data (`∀ b ∈ p.roots.erase a, b < a`) implies `p'(a)>0`, hence `L(p)` has a root strictly right of `a`.
- Left tail: for monic split `p`, leftmost root data plus card accounting `(p.roots.erase a).card + 1 = p.natDegree` implies `L(p)` has a root strictly left of `a`.
- Adjacent gap: if `a<b`, `a∈p.roots`, `b∈p.roots.erase a`, and every element of `(p.roots.erase a).erase b` lies outside `(a,b)`, then `p'(a)*p'(b)<0`; proof factors `(a-b)(b-a)` and uses positivity of paired remaining factors `(a-c)(b-c)`.
- Direct Hermite insertion lemmas now return roots of `HermiteR (n+1)` for adjacent gaps, right tail, and left tail.

Mathlib API confirmed:
- `Polynomial.Splits.eval_root_derivative`: for monic split `f` and `x ∈ f.roots`, `f.derivative.eval x = ((f.roots.erase x).map (x - ·)).prod`.
- `Multiset.prod_pos`, `Multiset.mem_map`, `Multiset.cons_erase`, `Multiset.erase_comm`, `Multiset.mem_erase_of_ne`, `Multiset.prod_map_mul`, `Polynomial.isRoot_of_mem_roots` work in current imports.
- `Polynomial.hermite_monic`, `Polynomial.hermite_succ`, `derivative_map` support the raw Hermite recurrence bridge.

Open P6.2 pieces:
- Assemble ordered-root induction: from a sorted/nodup root list for `HermiteR n`, produce left tail, all adjacent-gap roots, and right tail for `HermiteR (n+1)`.
- Prove/transport `HermiteR n` splitting and root count/simple-root accounting through the induction.
- Transfer induction to even Hermite and then to `Cpoly` critical data after `HermiteCpoly_eq_Cpoly`.

Runpod d=11 wall-jet job `/workspace/gpt_rh/gpt_rh_walljet_d11_20260612_175016` still running as of 18:29 UTC: no exit files, stderr empty, sampled walls 1/10 passed q^10 and started q^11. Archive/download still pending.