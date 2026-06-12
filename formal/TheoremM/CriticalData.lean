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

/-! ## The eval-scaling bridge (C2a)

`C_d(x)·H_{2d}(0) = H_{2d}(x/√(2d))`, its derivative, and the
criticality correspondence: criticals of `C_d` are the `√(2d)`-scaled
roots of `H_{2d−1}`. -/

/-- `H_{2d}` as its even-coefficient sum (odd coefficients vanish and
the degree is `2d`). -/
lemma hermiteEvenR_eq_even_sum (d : ℕ) :
    HermiteEvenR d = ∑ k ∈ Finset.range (d + 1),
      Polynomial.C ((HermiteEvenR d).coeff (2 * k)) * X ^ (2 * k) := by
  ext m
  rw [finsetSum_coeff]
  rcases Nat.even_or_odd m with he | ho
  · obtain ⟨j, hj⟩ := he
    rcases Nat.lt_or_ge j (d + 1) with hjd | hjd
    · rw [Finset.sum_eq_single j]
      · simp only [coeff_C_mul, coeff_X_pow]
        rw [if_pos (by omega)]
        rw [show m = 2 * j by omega]
        ring
      · intro k _ hkj
        simp only [coeff_C_mul, coeff_X_pow]
        rw [if_neg (by omega)]
        ring
      · intro hj'
        exact absurd (Finset.mem_range.mpr hjd) hj'
    · have hdeg : (HermiteEvenR d).natDegree < m := by
        have hnd : (HermiteEvenR d).natDegree = 2 * d :=
          hermiteR_natDegree (2 * d)
        omega
      rw [coeff_eq_zero_of_natDegree_lt hdeg]
      apply (Finset.sum_eq_zero fun k hk => ?_).symm
      simp only [coeff_C_mul, coeff_X_pow]
      rw [if_neg (by
        have := Finset.mem_range.mp hk
        omega)]
      ring
  · obtain ⟨j, hj⟩ := ho
    rw [hj, hermiteEvenR_coeff_odd d j]
    apply (Finset.sum_eq_zero fun k _ => ?_).symm
    simp only [coeff_C_mul, coeff_X_pow]
    rw [if_neg (by omega)]
    ring

/-- **The scaling bridge** (the manuscript's
`C_d(w) = H_{2d}(w/√(2d))/H_{2d}(0)`, denominator-cleared):
`C_d(x)·H_{2d}(0) = H_{2d}(x/√(2d))`. -/
lemma Cpoly_eval_mul_coeff_zero (d : ℕ) (hd : 1 ≤ d) (x : ℝ) :
    (Cpoly d).eval x * (HermiteEvenR d).coeff 0
      = (HermiteEvenR d).eval (x / Real.sqrt (((2 * d : ℕ) : ℝ))) := by
  have h2d : (0 : ℝ) < ((2 * d : ℕ) : ℝ) := by
    have : 0 < 2 * d := by omega
    exact_mod_cast this
  have hs : (0 : ℝ) < Real.sqrt (((2 * d : ℕ) : ℝ)) := Real.sqrt_pos.mpr h2d
  have hH0 := hermiteEvenR_coeff_zero_ne_zero d
  rw [← HermiteCpoly_eq_Cpoly d hd]
  conv_rhs => rw [hermiteEvenR_eq_even_sum d]
  unfold HermiteCpoly
  rw [eval_finsetSum, eval_finsetSum, Finset.sum_mul]
  refine Finset.sum_congr rfl fun k _ => ?_
  simp only [eval_mul, eval_C, eval_pow, eval_X]
  have hpow : (x / Real.sqrt (((2 * d : ℕ) : ℝ))) ^ (2 * k)
      = x ^ (2 * k) / ((2 * d : ℕ) : ℝ) ^ k := by
    rw [div_pow, pow_mul, pow_mul, Real.sq_sqrt h2d.le]
  rw [hpow]
  have h2dk : ((2 * d : ℕ) : ℝ) ^ k ≠ 0 := by positivity
  field_simp

/-- Derivative of the bridge, by uniqueness of the real derivative:
`C_d′(x)·H_{2d}(0) = (2d/√(2d))·H_{2d−1}(x/√(2d))`. -/
lemma derivative_Cpoly_eval_mul_coeff_zero (d : ℕ) (hd : 1 ≤ d) (x : ℝ) :
    (derivative (Cpoly d)).eval x * (HermiteEvenR d).coeff 0
      = ((2 * d : ℕ) : ℝ) / Real.sqrt (((2 * d : ℕ) : ℝ))
        * (HermiteR (2 * d - 1)).eval
            (x / Real.sqrt (((2 * d : ℕ) : ℝ))) := by
  set s := Real.sqrt (((2 * d : ℕ) : ℝ)) with hs_def
  have h2d : (0 : ℝ) < ((2 * d : ℕ) : ℝ) := by
    have : 0 < 2 * d := by omega
    exact_mod_cast this
  have hs : (0 : ℝ) < s := Real.sqrt_pos.mpr h2d
  have hFG : (fun y : ℝ => (Cpoly d).eval y * (HermiteEvenR d).coeff 0)
      = fun y : ℝ => (HermiteEvenR d).eval (y / s) :=
    funext fun y => Cpoly_eval_mul_coeff_zero d hd y
  have hF : HasDerivAt
      (fun y : ℝ => (Cpoly d).eval y * (HermiteEvenR d).coeff 0)
      ((derivative (Cpoly d)).eval x * (HermiteEvenR d).coeff 0) x :=
    (Polynomial.hasDerivAt (Cpoly d) x).mul_const _
  have hG : HasDerivAt (fun y : ℝ => (HermiteEvenR d).eval (y / s))
      ((derivative (HermiteEvenR d)).eval (x / s) * (1 / s)) x := by
    have hinner : HasDerivAt (fun y : ℝ => y / s) (1 / s) x := by
      simpa using (hasDerivAt_id x).div_const s
    exact (Polynomial.hasDerivAt (HermiteEvenR d) (x / s)).comp x hinner
  rw [hFG] at hF
  have huniq := hF.unique hG
  rw [huniq, derivative_hermiteEvenR d hd]
  simp only [eval_mul, eval_C]
  field_simp

/-- **Criticality correspondence**: `x` is a critical point of `C_d`
iff `x/√(2d)` is a root of `H_{2d−1}`. -/
lemma Cpoly_critical_iff (d : ℕ) (hd : 1 ≤ d) (x : ℝ) :
    (derivative (Cpoly d)).eval x = 0
      ↔ (HermiteR (2 * d - 1)).eval
          (x / Real.sqrt (((2 * d : ℕ) : ℝ))) = 0 := by
  have h := derivative_Cpoly_eval_mul_coeff_zero d hd x
  have hH0 := hermiteEvenR_coeff_zero_ne_zero d
  have h2d : (0 : ℝ) < ((2 * d : ℕ) : ℝ) := by
    have : 0 < 2 * d := by omega
    exact_mod_cast this
  have hs : (0 : ℝ) < Real.sqrt (((2 * d : ℕ) : ℝ)) := Real.sqrt_pos.mpr h2d
  have hc : ((2 * d : ℕ) : ℝ) / Real.sqrt (((2 * d : ℕ) : ℝ)) ≠ 0 := by
    positivity
  constructor
  · intro h0
    rw [h0, zero_mul] at h
    rcases mul_eq_zero.mp h.symm with hl | hr
    · exact absurd hl hc
    · exact hr
  · intro h0
    rw [h0, mul_zero] at h
    exact (mul_eq_zero.mp h).resolve_right hH0

/-- The sign of `H_{2d}(0)`: `0 < (−1)^d · H_{2d}(0)`. -/
lemma coeff_zero_hermiteEvenR_sign (d : ℕ) :
    0 < (-1 : ℝ) ^ d * (HermiteEvenR d).coeff 0 := by
  rw [hermiteEvenR_coeff_zero]
  push_cast
  have hsq : (-1 : ℝ) ^ d * (-1 : ℝ) ^ d = 1 := by
    rcases Nat.even_or_odd d with he | ho
    · rw [he.neg_one_pow]; norm_num
    · rw [ho.neg_one_pow]; norm_num
  have hdf : (0 : ℝ) < ((2 * d - 1).doubleFactorial : ℝ) :=
    Nat.cast_pos.mpr (Nat.doubleFactorial_pos _)
  rw [← mul_assoc, hsq, one_mul]
  exact hdf

/-! ## Root symmetry of `H_{2d−1}` through the bridge (C2b, part 1)

The derivative of the even `C_d` is odd; through the criticality
correspondence this transfers negation symmetry to the roots of
`H_{2d−1}`, with `0` among them. -/

/-- The derivative of `C_d` is odd: `C_d′(−x) = −C_d′(x)` (even-index
coefficients of the derivative come from odd coefficients of `C_d`
and vanish). -/
lemma derivative_Cpoly_eval_neg (d : ℕ) (x : ℝ) :
    (derivative (Cpoly d)).eval (-x)
      = -((derivative (Cpoly d)).eval x) := by
  rw [eval_eq_sum_range, eval_eq_sum_range, ← Finset.sum_neg_distrib]
  apply Finset.sum_congr rfl
  intro k _
  rcases Nat.even_or_odd k with he | ho
  · rw [coeff_derivative, Cpoly_coeff_odd d (k + 1) he.add_one]
    ring
  · rw [ho.neg_pow]
    ring

/-- Roots of `H_{2d−1}` in bridge coordinates: `z` is a root iff
`√(2d)·z` is a critical point of `C_d`. -/
lemma hermiteR_odd_root_iff_critical (d : ℕ) (hd : 1 ≤ d) (z : ℝ) :
    (HermiteR (2 * d - 1)).eval z = 0
      ↔ (derivative (Cpoly d)).eval
          (Real.sqrt (((2 * d : ℕ) : ℝ)) * z) = 0 := by
  have h2d : (0 : ℝ) < ((2 * d : ℕ) : ℝ) := by
    have : 0 < 2 * d := by omega
    exact_mod_cast this
  have hs0 : Real.sqrt (((2 * d : ℕ) : ℝ)) ≠ 0 :=
    (Real.sqrt_pos.mpr h2d).ne'
  have h := Cpoly_critical_iff d hd
    (Real.sqrt (((2 * d : ℕ) : ℝ)) * z)
  rw [mul_div_cancel_left₀ z hs0] at h
  exact h.symm

/-- Root symmetry of `H_{2d−1}`: `−y` is a root iff `y` is. -/
lemma hermiteR_odd_isRoot_neg_iff (d : ℕ) (hd : 1 ≤ d) (y : ℝ) :
    (HermiteR (2 * d - 1)).eval (-y) = 0
      ↔ (HermiteR (2 * d - 1)).eval y = 0 := by
  rw [hermiteR_odd_root_iff_critical d hd, hermiteR_odd_root_iff_critical d hd,
    show Real.sqrt (((2 * d : ℕ) : ℝ)) * (-y)
      = -(Real.sqrt (((2 * d : ℕ) : ℝ)) * y) by ring,
    derivative_Cpoly_eval_neg]
  exact neg_eq_zero

/-- `0` is a root of `H_{2d−1}` (the bridge image of the critical
point of `C_d` at the origin). -/
lemma hermiteR_odd_eval_zero (d : ℕ) (hd : 1 ≤ d) :
    (HermiteR (2 * d - 1)).eval 0 = 0 := by
  have h := (Cpoly_critical_iff d hd 0).mp (derivative_Cpoly_eval_zero d)
  rwa [zero_div] at h

/-! ## The sorted-roots pin (C2b, part 2)

No counting combinatorics: the sorted list of a negation-symmetric
nodup multiset equals the reverse of its own negation (sort
uniqueness), so the middle entry is its own negative — zero. -/

/-- The sorted root list of `H_n` has length `n`. -/
lemma hermiteRRootsSorted_length_eq (n : ℕ) :
    (HermiteRRootsSorted n).length = n := by
  rw [hermiteRRootsSorted_length]
  exact hermiteR_card_roots n

/-- Strict monotonicity of the sorted root list at distinct indices. -/
lemma hermiteRRootsSorted_strictMono (n : ℕ) {i j : ℕ}
    (hij : i < j) (hj : j < (HermiteRRootsSorted n).length) :
    (HermiteRRootsSorted n)[i]'(by omega)
      < (HermiteRRootsSorted n)[j]'hj :=
  (hermiteRRootsSorted_sortedLT n
    (hermiteR_roots_nodup n)).getElem_lt_getElem_of_lt hij

/-- The root multiset of `H_{2d−1}` is negation-symmetric. -/
lemma hermiteR_odd_roots_map_neg (d : ℕ) (hd : 1 ≤ d) :
    (HermiteR (2 * d - 1)).roots.map (fun r => -r)
      = (HermiteR (2 * d - 1)).roots := by
  have hnd := hermiteR_roots_nodup (2 * d - 1)
  have hndm : ((HermiteR (2 * d - 1)).roots.map (fun r => -r)).Nodup :=
    hnd.map neg_injective
  rw [Multiset.Nodup.ext hndm hnd]
  intro a
  simp only [Multiset.mem_map]
  constructor
  · rintro ⟨b, hb, rfl⟩
    rw [Polynomial.mem_roots (hermiteR_ne_zero _)] at hb ⊢
    exact (hermiteR_odd_isRoot_neg_iff d hd b).mpr hb
  · intro ha
    refine ⟨-a, ?_, by simp⟩
    rw [Polynomial.mem_roots (hermiteR_ne_zero _)] at ha ⊢
    exact (hermiteR_odd_isRoot_neg_iff d hd a).mpr ha

/-- **The reversal identity**: the sorted root list of `H_{2d−1}` is
the reverse of its own negation. -/
lemma hermiteR_odd_sorted_eq_reverse (d : ℕ) (hd : 1 ≤ d) :
    HermiteRRootsSorted (2 * d - 1)
      = ((HermiteRRootsSorted (2 * d - 1)).map (fun r => -r)).reverse := by
  apply List.Perm.eq_reverse_of_sortedLE_of_sortedGE
  · rw [← Multiset.coe_eq_coe, ← Multiset.map_coe, Multiset.sort_eq]
    exact (hermiteR_odd_roots_map_neg d hd).symm
  · exact (Multiset.pairwise_sort (s := (HermiteR (2 * d - 1)).roots)
      (r := fun x y : ℝ => x ≤ y)).sortedLE
  · apply List.Pairwise.sortedGE
    exact List.Pairwise.map _ (fun a b hab => by linarith)
      (Multiset.pairwise_sort (s := (HermiteR (2 * d - 1)).roots)
        (r := fun x y : ℝ => x ≤ y))

/-- **The middle entry of the sorted root list of `H_{2d−1}` is `0`.** -/
lemma hermiteR_odd_sorted_middle (d : ℕ) (hd : 1 ≤ d) :
    (HermiteRRootsSorted (2 * d - 1))[d - 1]'(by
      rw [hermiteRRootsSorted_length_eq]; omega) = 0 := by
  have hlen := hermiteRRootsSorted_length_eq (2 * d - 1)
  have hidx : d - 1 < (HermiteRRootsSorted (2 * d - 1)).length := by
    omega
  have h := congrArg (fun l : List ℝ => l[d - 1]?)
    (hermiteR_odd_sorted_eq_reverse d hd)
  simp only [List.getElem?_reverse (by
      rw [List.length_map]
      omega : d - 1 < ((HermiteRRootsSorted (2 * d - 1)).map
        (fun r => -r)).length),
    List.getElem?_map, List.length_map] at h
  rw [show (HermiteRRootsSorted (2 * d - 1)).length - 1 - (d - 1)
      = d - 1 by omega] at h
  rw [List.getElem?_eq_getElem hidx] at h
  simp only [Option.map_some] at h
  have := Option.some.inj h
  linarith

/-! ## The sign alternation (C2c)

The sign engine runs on the monic `H_{2d}` at the sorted roots of
`H_{2d−1}` (which are never roots of `H_{2d}`), the count above the
`i`-th root is `(2d−1)−i` (GPT's interface), and the bridge transfers
the alternation to `C_d` at its scaled criticals. -/

/-- The two spellings of the even Hermite polynomial agree. -/
lemma hermiteEvenR_eq_hermiteR (d : ℕ) :
    HermiteEvenR d = HermiteR (2 * d) := rfl

/-- A root of `H_{2d−1}` is never a root of `H_{2d}`: a common root
would be a multiple root of `H_{2d}` (its derivative is a multiple of
`H_{2d−1}`), contradicting root simplicity. -/
lemma hermiteR_even_ne_zero_of_odd_root (d : ℕ) (hd : 1 ≤ d) {y : ℝ}
    (hy : (HermiteR (2 * d - 1)).eval y = 0) :
    (HermiteR (2 * d)).eval y ≠ 0 := by
  intro h0
  have hder : (derivative (HermiteR (2 * d))).eval y = 0 := by
    rw [← hermiteEvenR_eq_hermiteR, derivative_hermiteEvenR d hd]
    rw [eval_mul, eval_C]
    rw [show ((Polynomial.hermite (2 * d - 1)).map
        (Int.castRingHom ℝ)) = HermiteR (2 * d - 1) from rfl, hy]
    ring
  obtain ⟨q, hq⟩ := (Polynomial.dvd_iff_isRoot).mpr h0
  have hqy : q.eval y = 0 := by
    have hd2 := congrArg (fun p : ℝ[X] => (derivative p).eval y) hq
    simp only [derivative_mul, derivative_sub, derivative_X,
      derivative_C, sub_zero, one_mul, eval_add, eval_mul, eval_sub,
      eval_X, eval_C, sub_self, zero_mul, add_zero] at hd2
    rw [hder] at hd2
    linarith [hd2]
  obtain ⟨r, hr⟩ := (Polynomial.dvd_iff_isRoot).mpr hqy
  have hsq : (X - Polynomial.C y) ^ 2 ∣ HermiteR (2 * d) := by
    exact ⟨r, by rw [hq, hr]; ring⟩
  have hmul : 2 ≤ (HermiteR (2 * d)).rootMultiplicity y :=
    (Polynomial.le_rootMultiplicity_iff (hermiteR_ne_zero (2 * d))).mpr hsq
  have hcount : (HermiteR (2 * d)).roots.count y
      = (HermiteR (2 * d)).rootMultiplicity y :=
    Polynomial.count_roots _
  have hone := Multiset.nodup_iff_count_le_one.mp
    (hermiteR_roots_nodup (2 * d)) y
  omega

/-- **Sign of `H_{2d}` at the `i`-th sorted root of `H_{2d−1}`**:
`0 < (−1)^{(2d−1)−i} · H_{2d}(y_i)` — the engine on the monic split
`H_{2d}`, with the count above `y_i` from the interlacing interface. -/
lemma hermiteR_even_sign_at_sorted_root (d : ℕ) (hd : 1 ≤ d) {i : ℕ}
    (hi : i < (HermiteRRootsSorted (2 * d - 1)).length) :
    0 < (-1 : ℝ) ^ (2 * d - 1 - i)
        * (HermiteR (2 * d)).eval
            ((HermiteRRootsSorted (2 * d - 1))[i]'hi) := by
  have hyroot : (HermiteR (2 * d - 1)).eval
      ((HermiteRRootsSorted (2 * d - 1))[i]'hi) = 0 := by
    have := hermiteRRootsSorted_get_mem_roots (2 * d - 1) hi
    rwa [Polynomial.mem_roots (hermiteR_ne_zero _)] at this
  have hnotroot : ∀ r ∈ (HermiteR (2 * d)).roots,
      (HermiteRRootsSorted (2 * d - 1))[i]'hi ≠ r := by
    intro r hr hyr
    rw [Polynomial.mem_roots (hermiteR_ne_zero (2 * d))] at hr
    exact hermiteR_even_ne_zero_of_odd_root d hd hyroot (hyr ▸ hr)
  have hengine := neg_one_pow_roots_above_mul_leadingCoeff_mul_eval_pos
    (hermiteR_ne_zero (2 * d)) (hermiteR_splits (2 * d)) hnotroot
  have hcount := hermiteR_succ_count_roots_above (n := 2 * d - 1)
    (i := i) hi
  rw [show 2 * d - 1 + 1 = 2 * d by omega, hermiteRRootsSorted_length]
    at hcount
  rw [hcount, hermiteR_card_roots, (hermiteR_monic (2 * d)).leadingCoeff,
    mul_one] at hengine
  exact hengine

/-- **Sign alternation of `C_d` at its scaled criticals** (the
quadruple's `hCsign`): for `m < d` and
`c_m = √(2d)·y_{(d−1)+m}`, `0 < (−1)^m · C_d(c_m)`. -/
lemma Cpoly_sign_at_scaled_root (d : ℕ) (hd : 1 ≤ d) {m : ℕ}
    (hm : m < d) :
    0 < (-1 : ℝ) ^ m * (Cpoly d).eval
      (Real.sqrt (((2 * d : ℕ) : ℝ))
        * ((HermiteRRootsSorted (2 * d - 1))[d - 1 + m]'(by
            rw [hermiteRRootsSorted_length_eq]; omega))) := by
  have h2d : (0 : ℝ) < ((2 * d : ℕ) : ℝ) := by
    have : 0 < 2 * d := by omega
    exact_mod_cast this
  have hs0 : Real.sqrt (((2 * d : ℕ) : ℝ)) ≠ 0 :=
    (Real.sqrt_pos.mpr h2d).ne'
  set y := (HermiteRRootsSorted (2 * d - 1))[d - 1 + m]'(by
    rw [hermiteRRootsSorted_length_eq]; omega) with hy_def
  have hbridge := Cpoly_eval_mul_coeff_zero d hd
    (Real.sqrt (((2 * d : ℕ) : ℝ)) * y)
  rw [mul_div_cancel_left₀ y hs0, hermiteEvenR_eq_hermiteR] at hbridge
  have hsign := hermiteR_even_sign_at_sorted_root d hd
    (i := d - 1 + m) (by rw [hermiteRRootsSorted_length_eq]; omega)
  rw [show 2 * d - 1 - (d - 1 + m) = d - m by omega] at hsign
  have hH0sign := coeff_zero_hermiteEvenR_sign d
  have hH0 := hermiteEvenR_coeff_zero_ne_zero d
  have hH0sq : (0 : ℝ) < ((HermiteEvenR d).coeff 0) ^ 2 :=
    pow_two_pos_of_ne_zero hH0
  have hCm2 : (-1 : ℝ) ^ m * (-1 : ℝ) ^ m = 1 := by
    rw [← pow_add, ← two_mul, pow_mul]
    norm_num
  have hkey : (-1 : ℝ) ^ (d - m) * (-1 : ℝ) ^ d * (-1 : ℝ) ^ m = 1 := by
    rw [← pow_add, ← pow_add, show d - m + d + m = 2 * d by omega,
      pow_mul]
    norm_num
  have hAB : (-1 : ℝ) ^ (d - m) * (-1 : ℝ) ^ d = (-1 : ℝ) ^ m := by
    linear_combination (-1 : ℝ) ^ m * hkey
      - ((-1 : ℝ) ^ (d - m) * (-1 : ℝ) ^ d) * hCm2
  have hP : 0 < ((-1 : ℝ) ^ (d - m)
        * (HermiteR (2 * d)).eval y)
      * ((-1 : ℝ) ^ d * (HermiteEvenR d).coeff 0) :=
    mul_pos hsign hH0sign
  have hP2 : ((-1 : ℝ) ^ (d - m) * (HermiteR (2 * d)).eval y)
      * ((-1 : ℝ) ^ d * (HermiteEvenR d).coeff 0)
      = ((-1 : ℝ) ^ m * (Cpoly d).eval
          (Real.sqrt (((2 * d : ℕ) : ℝ)) * y))
        * ((HermiteEvenR d).coeff 0) ^ 2 := by
    rw [← hbridge, ← hAB]
    ring
  rw [hP2] at hP
  exact (mul_pos_iff_of_pos_right hH0sq).mp hP

/-! ## The quadruple and the theorem (C2d)

Everything assembles: the critical sequence `c_m = √(2d)·y_{(d−1)+m}`
satisfies the four hypotheses of the measure capstone, and Theorem M
follows. -/

/-- The critical sequence of `C_d`: the middle-and-upper sorted roots
of `H_{2d−1}`, scaled by `√(2d)` (total function via `getD`). -/
noncomputable def criticalSeq (d : ℕ) : ℕ → ℝ :=
  fun m => Real.sqrt (((2 * d : ℕ) : ℝ))
    * ((HermiteRRootsSorted (2 * d - 1)).getD (d - 1 + m) 0)

/-- `criticalSeq` at a valid index, as a `getElem`. -/
lemma criticalSeq_eq (d : ℕ) {m : ℕ} (hm : m < d) :
    criticalSeq d m = Real.sqrt (((2 * d : ℕ) : ℝ))
      * ((HermiteRRootsSorted (2 * d - 1))[d - 1 + m]'(by
          rw [hermiteRRootsSorted_length_eq]; omega)) := by
  unfold criticalSeq
  rw [List.getD_eq_getElem _ _ (by
    rw [hermiteRRootsSorted_length_eq]; omega)]

/-- The first critical point is the origin. -/
lemma criticalSeq_zero (d : ℕ) (hd : 1 ≤ d) : criticalSeq d 0 = 0 := by
  rw [criticalSeq_eq d (by omega)]
  simp only [Nat.add_zero]
  rw [hermiteR_odd_sorted_middle d hd, mul_zero]

/-- Strict monotonicity of the critical sequence. -/
lemma criticalSeq_mono (d : ℕ) (hd : 1 ≤ d) :
    ∀ m n', m < n' → n' < d → criticalSeq d m < criticalSeq d n' := by
  intro m n' hmn hn'
  have h2d : (0 : ℝ) < ((2 * d : ℕ) : ℝ) := by
    have : 0 < 2 * d := by omega
    exact_mod_cast this
  rw [criticalSeq_eq d (by omega), criticalSeq_eq d hn']
  exact mul_lt_mul_of_pos_left
    (hermiteRRootsSorted_strictMono _ (by omega) _)
    (Real.sqrt_pos.mpr h2d)

/-- Every `criticalSeq` point is critical for `C_d`. -/
lemma criticalSeq_crit (d : ℕ) (hd : 1 ≤ d) :
    ∀ m, m < d →
      (derivative (Cpoly d)).eval (criticalSeq d m) = 0 := by
  intro m hm
  have h2d : (0 : ℝ) < ((2 * d : ℕ) : ℝ) := by
    have : 0 < 2 * d := by omega
    exact_mod_cast this
  have hs0 : Real.sqrt (((2 * d : ℕ) : ℝ)) ≠ 0 :=
    (Real.sqrt_pos.mpr h2d).ne'
  rw [criticalSeq_eq d hm, Cpoly_critical_iff d hd,
    mul_div_cancel_left₀ _ hs0]
  have := hermiteRRootsSorted_get_mem_roots (2 * d - 1)
    (i := d - 1 + m) (by rw [hermiteRRootsSorted_length_eq]; omega)
  rwa [Polynomial.mem_roots (hermiteR_ne_zero _)] at this

/-- The sign alternation along the critical sequence. -/
lemma criticalSeq_sign (d : ℕ) (hd : 1 ≤ d) :
    ∀ m, m < d →
      0 < (-1 : ℝ) ^ m * (Cpoly d).eval (criticalSeq d m) := by
  intro m hm
  rw [criticalSeq_eq d hm]
  exact Cpoly_sign_at_scaled_root d hd hm

/-- **THEOREM M, fully proven**: for every `d ≥ 1`, all complex zeros
of `Ψ_d` are real.  The critical data comes from the Hermite
interlacing induction (P6.2, `Hermite.lean` + this file); the measure
side is the compound-Poisson construction (P6.4b, `CPMeasure.lean` +
`Capstone.lean`).  Axioms: `[propext, Classical.choice, Quot.sound]`. -/
theorem theorem_M (d : ℕ) (hd : 1 ≤ d) :
    ∀ z ∈ ((Psi d).map (algebraMap ℝ ℂ)).roots, z.im = 0 :=
  theorem_M_of_critical_data_measure d hd (criticalSeq d)
    (le_of_eq (criticalSeq_zero d hd).symm)
    (criticalSeq_mono d hd)
    (criticalSeq_crit d hd)
    (criticalSeq_sign d hd)

/-- The multiset-convention-free form of Theorem M: any complex number
annihilating `Ψ_d` has imaginary part zero. -/
theorem theorem_M_aeval (d : ℕ) (hd : 1 ≤ d) (z : ℂ)
    (hz : Polynomial.aeval z (Psi d) = 0) : z.im = 0 := by
  apply theorem_M d hd z
  rw [Polynomial.mem_roots']
  refine ⟨(Polynomial.map_ne_zero_iff
    (algebraMap ℝ ℂ).injective).mpr (Psi_ne_zero d), ?_⟩
  rw [Polynomial.IsRoot, Polynomial.eval_map, ← Polynomial.aeval_def]
  exact hz

end TheoremM
