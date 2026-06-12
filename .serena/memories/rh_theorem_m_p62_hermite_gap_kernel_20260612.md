# RH Theorem M P6.2 Hermite gap/tail kernel (updated 2026-06-12 21:37 CEST)

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

Closed GPT-owned P6.2 A+B pieces:
- Assemble ordered-root induction: from a sorted/nodup root list for `HermiteR n`, produce left tail, all adjacent-gap roots, and right tail for `HermiteR (n+1)`.
- Prove/transport `HermiteR n` splitting and root count/simple-root accounting through the induction.
- Expose public `HermiteR` split/nodup/card interface for Fable's Cpoly critical-data extraction.

Open/Fable-owned P6.2 pieces:
- Consume the HermiteR interface in `TheoremM/CriticalData.lean`.
- Transfer/count even-Hermite critical data against `Cpoly` using `HermiteCpoly_eq_Cpoly`.
- Finish Step-5 wiring in Fable-owned files.

Additional green ordered-root bridge lemmas (2026-06-12 20:57 CEST):

```lean
sortedLT_getElem_outside_adjacent
sortedLT_mem_outside_adjacent
sortedLT_forall_mem_outside_adjacent
sortedLT_erase_erase_outside_adjacent_of_mem_iff
sortedLT_mem_right_of_first
sortedLT_mem_left_of_last
sortedLT_sort_le_of_nodup
sortedLT_sort_le_erase_erase_outside_adjacent
sortedLT_sort_mem_outside_adjacent
```

Meaning:
- If a nodup root multiset is sorted by `≤`, adjacent indices `i,i+1` produce the erased-root outside-gap hypothesis needed by `exists_root_between_hermiteR_succ_of_adjacent_roots`.
- The first/last sorted-list lemmas produce the ordered hypotheses needed by left/right tail insertion.
- This is the bridge from simple roots/nodup accounting into the ordered-root induction.

Validation on current state:

```text
cd formal && ~/.elan/bin/lake build TheoremM.Hermite
# green: Build completed successfully (8477 jobs)
cd formal && ~/.elan/bin/lake build
# green: Build completed successfully (8488 jobs)
git diff --check
# green
```

Fable F146/F147 state:
- P6.4b measure capstone is complete; quadrature hypotheses are discharged.
- Theorem M formal reduction now waits on P6.2 critical data only.
- Fable accidentally committed a staged Hermite snapshot; current local working-tree delta is only a `simpa`→`simp` warning cleanup in `Hermite.lean`.

Additional green HermiteR interface/base lemmas (2026-06-12 21:09 CEST):

```lean
hermiteR_natDegree
hermiteR_ne_zero
hermiteR_roots_card_le
hermiteR_splits_iff_card_roots
hermiteR_zero
hermiteR_one
hermiteR_splits_zero
hermiteR_splits_one
hermiteR_card_roots_zero
hermiteR_card_roots_one
hermiteR_roots_nodup_zero
hermiteR_roots_nodup_one
```

Coordination split:
- GPT owns HermiteR real-rootedness/interlacing interface (A+B) in `TheoremM/Hermite.lean`.
- Fable owns Cpoly critical-data extraction/Step-5 in new `TheoremM/CriticalData.lean` after GPT interface lands.
- Do not edit `CriticalData.lean` or root import unless renegotiated; Fable is actively working there.

Current validation:

```text
cd formal && ~/.elan/bin/lake build TheoremM.Hermite
# green: Build completed successfully (8477 jobs)
```

Earlier full formal tree red in Fable-owned `TheoremM/CriticalData.lean` was superseded by Fable fixes plus the Hermite interface. Current full formal tree is green:

```text
cd formal && ~/.elan/bin/lake build
# green: Build completed successfully (8489 jobs)
```

Runpod d=11 wall-jet job `/workspace/gpt_rh/gpt_rh_walljet_d11_20260612_175016` completed and was archived locally on 2026-06-12 21:40 CEST. All ten walls exited 0, stderr empty, and each reported `RESULT d=11 TRANSVERSE_PASS`; every wall reached `q^22 OK degree=21`. Local durable archive: `artifacts/runpod/20260612_1940Z/gpt_rh_results_20260612_1940Z.tar.gz`, sha256 `bc9811ab2434e4a9bc3da41733b5f9554a44ff8d39590d5a56e86b970923fac3`; extracted copy at `artifacts/runpod/20260612_1940Z/extracted/`. This extends the exact transverse wall-jet diagnostic to d<=11, combined with F58 q^0.

Additional green HermiteR A+B interface (2026-06-12 21:37 CEST):

```lean
HermiteRRootsSorted
hermiteRRootsSorted_length
mem_hermiteRRootsSorted_iff
hermiteRRootsSorted_get_mem_roots
exists_finset_roots_hermiteR_succ_card
hermiteR_succ_card_roots_of_splits_nodup_pos
hermiteR_succ_roots_nodup_of_splits_nodup_pos
hermiteR_succ_splits_of_splits_nodup_pos
hermiteR_splits_roots_nodup_card
hermiteR_splits
hermiteR_roots_nodup
hermiteR_card_roots
hermiteR_succ_root_between_sorted_adjacent
hermiteR_succ_root_left_sorted_first
hermiteR_succ_root_right_sorted_last
```

`exists_finset_roots_hermiteR_succ_card` packages all successor roots
constructed from left tail, adjacent gaps, and right tail. The successor
wrappers are unconditional and consume `hermiteR_splits`/`hermiteR_roots_nodup`
internally.

Additional count-above interface for Fable F156 (2026-06-12 21:56 CEST):

```lean
exists_finset_roots_hermiteR_succ_card_count_above
hermiteR_succ_count_roots_above
```

`hermiteR_succ_count_roots_above` has exact sign-engine shape:

```lean
theorem hermiteR_succ_count_roots_above (n : ℕ) {i : ℕ}
    (hi : i < (HermiteRRootsSorted n).length) :
    ((HermiteR (n + 1)).roots.filter
        (fun r => (HermiteRRootsSorted n)[i]'hi < r)).card =
      (HermiteRRootsSorted n).length - i
```

It counts one successor root in every higher adjacent gap plus the right tail.
Fable's current dirty `CriticalData.lean` compiled with this theorem.

Current validation:

```text
cd formal && ~/.elan/bin/lake build TheoremM.Hermite
# green: Build completed successfully (8477 jobs)
cd formal && ~/.elan/bin/lake build
# green: Build completed successfully (8489 jobs)
```

Coordination:
- GPT owns only `formal/TheoremM/Hermite.lean` in this split.
- Fable owns `CriticalData.lean`, `Defs.lean`, `CPMeasure.lean`, `Structure.lean`, `Energy.lean`, `SignCount.lean`, `MuBridge.lean`, `Moments.lean`, `MomentsLimit.lean`, `Frullani.lean`, `Binet.lean`, and root import changes unless renegotiated.
- Do not check Runpod until user says it is done.
