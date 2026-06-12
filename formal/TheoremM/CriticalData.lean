/-
Theorem M formalization, P6.2(C): critical-data extraction for `Cpoly` —
the interface-independent layer.

Per the F148/F149 split: GPT owns (A) the `HermiteR` counting induction
and (B) the interlacing interface in `Hermite.lean`; this file owns (C),
the extraction of the critical-data quadruple
(`hc0`/`hmono`/`hcrit`/`hCsign`) consumed by
`theorem_M_of_critical_data_measure` (`Capstone.lean`).

This layer needs nothing from (A)/(B): evenness of `C_d`, the critical
point at `0` with `C_d(0) = 1 > 0`, the leading-coefficient sign
`(−1)^d`, root symmetry, and the generic sign-from-root-counting tool —
the sign of a split polynomial at a non-root is the leading sign times
the parity of the number of roots above the point (the non-root twin of
mathlib's `Splits.eval_root_derivative` technique).

File owned by Fable (F149 protocol).
-/
import TheoremM.Capstone
import TheoremM.Hermite

namespace TheoremM

open Polynomial Finset

/-! ## Evenness of `C_d` and the critical point at `0` -/

/-- `C_d` is even: `C_d(−x) = C_d(x)`. -/
lemma Cpoly_eval_neg (d : ℕ) (x : ℝ) :
    (Cpoly d).eval (-x) = (Cpoly d).eval x := by
  rw [eval_eq_sum_range, eval_eq_sum_range]
  apply Finset.sum_congr rfl
  intro k _
  rcases Nat.even_or_odd k with he | ho
  · rw [he.neg_pow]
  · rw [Cpoly_coeff_odd d k ho]
    ring

/-- `C_d(0) = 1`. -/
lemma Cpoly_eval_zero (d : ℕ) : (Cpoly d).eval 0 = 1 := by
  rw [← coeff_zero_eq_eval_zero]
  exact Cpoly_coeff_zero d

/-- `0` is not a root of `C_d`. -/
lemma Cpoly_zero_not_root (d : ℕ) : ¬ (Cpoly d).IsRoot 0 := by
  simp [IsRoot, Cpoly_eval_zero]

/-- Root symmetry of the even polynomial `C_d`:
`−x` is a root iff `x` is. -/
lemma Cpoly_isRoot_neg_iff (d : ℕ) {x : ℝ} :
    (Cpoly d).IsRoot (-x) ↔ (Cpoly d).IsRoot x := by
  simp only [IsRoot, Cpoly_eval_neg]

/-- The derivative of `C_d` vanishes at `0`: the first critical point of
the quadruple is `c₀ = 0`. -/
lemma derivative_Cpoly_eval_zero (d : ℕ) :
    (derivative (Cpoly d)).eval 0 = 0 := by
  rw [← coeff_zero_eq_eval_zero, coeff_derivative,
    Cpoly_coeff_odd d 1 odd_one]
  ring

/-- The sign of the quadruple at `c₀ = 0`: `0 < (−1)^0 · C_d(0)`. -/
lemma Cpoly_sign_at_zero (d : ℕ) :
    0 < (-1 : ℝ) ^ 0 * (Cpoly d).eval 0 := by
  rw [Cpoly_eval_zero]
  norm_num

/-- The leading coefficient of `C_d` times `(−1)^d` is positive
(mirror of `Psi_leadingCoeff_sign`, without the `M d` factor). -/
lemma Cpoly_leadingCoeff_sign (d : ℕ) (hd : 1 ≤ d) :
    0 < (-1 : ℝ) ^ d * (Cpoly d).leadingCoeff := by
  have hdeg := Cpoly_natDegree d hd
  rw [leadingCoeff, hdeg, Cpoly_coeff_even, Nat.descFactorial_self]
  have hden : (0 : ℝ) < (d : ℝ) ^ d * (2 * d).factorial := by positivity
  have hfac : (0 : ℝ) < (d.factorial : ℝ) := by positivity
  have hsq : ((-1 : ℝ) ^ d) ^ 2 = 1 := by
    rcases Nat.even_or_odd d with he | ho
    · rw [he.neg_one_pow]; norm_num
    · rw [ho.neg_one_pow]; norm_num
  have hre : (-1 : ℝ) ^ d * ((-1) ^ d * (d.factorial : ℝ) /
      ((d : ℝ) ^ d * (2 * d).factorial))
      = ((-1 : ℝ) ^ d) ^ 2 * ((d.factorial : ℝ) /
        ((d : ℝ) ^ d * (2 * d).factorial)) := by
    ring
  rw [hre, hsq, one_mul]
  positivity

/-! ## The sign-from-root-counting tool -/

/-- **Sign from root counting.** For a nonzero split real polynomial `p`
and a point `x` that is not a root, the sign of `p(x)` is the sign of
the leading coefficient times the parity of the number of roots above
`x`:  `0 < (−1)^{#{r ∈ roots(p) | x < r}} · leadingCoeff(p) · p(x)`.

This is the non-root twin of `Splits.eval_root_derivative`: evaluate the
split product, pair the `(−1)` of the count against the factors from
roots above `x` (via `neg_one_pow_card_mul_prod_left_sub_eq_prod_sub_left`),
and observe everything else is positive. -/
lemma neg_one_pow_roots_above_mul_leadingCoeff_mul_eval_pos
    {p : ℝ[X]} (hp : p ≠ 0) (hsplits : p.Splits)
    {x : ℝ} (hx : ∀ r ∈ p.roots, x ≠ r) :
    0 < (-1 : ℝ) ^ (p.roots.filter (fun r => x < r)).card
        * p.leadingCoeff * p.eval x := by
  rw [hsplits.eval_eq_prod_roots]
  have hsplitprod : (p.roots.map (fun r => x - r)).prod
      = ((p.roots.filter (fun r => x < r)).map (fun r => x - r)).prod
        * ((p.roots.filter (fun r => ¬ x < r)).map
            (fun r => x - r)).prod := by
    conv_lhs => rw [← Multiset.filter_add_not (fun r => x < r) p.roots]
    rw [Multiset.map_add, Multiset.prod_add]
  rw [hsplitprod]
  have hA : 0 < (-1 : ℝ) ^ (p.roots.filter (fun r => x < r)).card
      * ((p.roots.filter (fun r => x < r)).map (fun r => x - r)).prod := by
    rw [neg_one_pow_card_mul_prod_left_sub_eq_prod_sub_left]
    refine Multiset.prod_pos ?_
    intro y hy
    obtain ⟨r, hr, rfl⟩ := Multiset.mem_map.mp hy
    have := Multiset.of_mem_filter hr
    linarith
  have hB : 0 < ((p.roots.filter (fun r => ¬ x < r)).map
      (fun r => x - r)).prod := by
    refine Multiset.prod_pos ?_
    intro y hy
    obtain ⟨r, hr, rfl⟩ := Multiset.mem_map.mp hy
    have h1 : ¬ x < r := (Multiset.mem_filter.mp hr).2
    have h2 : x ≠ r := hx r (Multiset.mem_filter.mp hr).1
    have h3 : r < x := lt_of_le_of_ne (not_lt.mp h1) fun h => h2 h.symm
    linarith
  have hlead : (0 : ℝ) < p.leadingCoeff ^ 2 :=
    pow_two_pos_of_ne_zero (leadingCoeff_ne_zero.mpr hp)
  calc (0 : ℝ)
      < p.leadingCoeff ^ 2
        * ((-1 : ℝ) ^ (p.roots.filter (fun r => x < r)).card
          * ((p.roots.filter (fun r => x < r)).map
              (fun r => x - r)).prod)
        * ((p.roots.filter (fun r => ¬ x < r)).map
            (fun r => x - r)).prod :=
      mul_pos (mul_pos hlead hA) hB
    _ = (-1 : ℝ) ^ (p.roots.filter (fun r => x < r)).card
        * p.leadingCoeff
        * (p.leadingCoeff
          * (((p.roots.filter (fun r => x < r)).map
                (fun r => x - r)).prod
            * ((p.roots.filter (fun r => ¬ x < r)).map
                (fun r => x - r)).prod)) := by
      ring

end TheoremM
