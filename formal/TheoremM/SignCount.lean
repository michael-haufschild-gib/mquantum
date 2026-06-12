/-
Theorem M formalization, phase P6.5: the sign-count assembly.

Main result: `psi_roots_real_of_alternation` — if `Ψ_d` is positive at
`c 0`, negative at `c 1`, … (alternating through `d` nonnegative,
strictly increasing points), then EVERY complex root of `Ψ_d` is real
(and the proof exhibits `2d` distinct real roots, so all roots are
simple). The alternation hypothesis is exactly what P6.2 (critical
points of `C_d`, alternating critical values) + P6.4a (the μ-budget)
will deliver; this file makes the rest of the second proof (§3c steps
(iii)+(iv)) formal.

File claimed by Fable (F132); GPT works in Hermite.lean.
-/
import TheoremM.Structure

namespace TheoremM

open Polynomial Set Finset

/-! ## Small structural lemmas -/

/-- `Ψ_d(0) = 1`. -/
lemma Psi_eval_zero (d : ℕ) : (Psi d).eval 0 = 1 := by
  have h := Psi_coeff_zero d
  rw [← coeff_zero_eq_eval_zero]
  exact h

/-- `Ψ_d` is even: `Ψ_d(−x) = Ψ_d(x)`. -/
lemma Psi_eval_neg (d : ℕ) (x : ℝ) : (Psi d).eval (-x) = (Psi d).eval x := by
  rw [eval_eq_sum_range, eval_eq_sum_range]
  apply Finset.sum_congr rfl
  intro k _
  rcases Nat.even_or_odd k with he | ho
  · rw [he.neg_pow]
  · rw [Psi_coeff_odd d k ho]
    ring

/-- The leading coefficient of `Ψ_d` times `(−1)^d` is positive. -/
lemma Psi_leadingCoeff_sign (d : ℕ) (hd : 1 ≤ d) :
    0 < (-1 : ℝ) ^ d * (Psi d).leadingCoeff := by
  have hdeg := Psi_natDegree d hd
  rw [leadingCoeff, hdeg, Psi_coeff_even]
  rw [Nat.descFactorial_self]
  have hM := M_pos d
  have hden : (0 : ℝ) < (d : ℝ) ^ d * (2 * d).factorial := by positivity
  have hfac : (0 : ℝ) < (d.factorial : ℝ) := by positivity
  have hsq : ((-1 : ℝ) ^ d) ^ 2 = 1 := by
    rcases Nat.even_or_odd d with he | ho
    · rw [he.neg_one_pow]; norm_num
    · rw [ho.neg_one_pow]; norm_num
  have : (-1 : ℝ) ^ d * ((-1) ^ d * (d.factorial : ℝ) * M d /
      ((d : ℝ) ^ d * (2 * d).factorial))
      = ((-1 : ℝ) ^ d) ^ 2 * ((d.factorial : ℝ) * M d /
        ((d : ℝ) ^ d * (2 * d).factorial)) := by ring
  rw [this, hsq, one_mul]
  positivity

/-- Eventually `(−1)^d · Ψ_d(x) > 0`: for every bound `B` there is `X > B`
with the tail sign. -/
lemma Psi_tail_sign (d : ℕ) (hd : 1 ≤ d) (B : ℝ) :
    ∃ X, B < X ∧ 0 < (-1 : ℝ) ^ d * (Psi d).eval X := by
  set q : ℝ[X] := Polynomial.C ((-1 : ℝ) ^ d) * Psi d with hq
  have hqlc : 0 < q.leadingCoeff := by
    rw [hq, leadingCoeff_C_mul_of_isUnit]
    · exact Psi_leadingCoeff_sign d hd
    · rcases Nat.even_or_odd d with he | ho
      · rw [he.neg_one_pow]; exact isUnit_one
      · rw [ho.neg_one_pow]; exact (isUnit_one).neg
  have hqdeg : 0 < q.degree := by
    have hne : ((-1 : ℝ) ^ d) ≠ 0 := by
      rcases Nat.even_or_odd d with he | ho
      · rw [he.neg_one_pow]; norm_num
      · rw [ho.neg_one_pow]; norm_num
    have h1 : q.natDegree = (Psi d).natDegree := by
      rw [hq]
      exact natDegree_C_mul hne
    have h2 : 0 < q.natDegree := by
      rw [h1, Psi_natDegree d hd]; omega
    exact natDegree_pos_iff_degree_pos.mp h2
  have htend := Polynomial.tendsto_atTop_of_leadingCoeff_nonneg q hqdeg hqlc.le
  have hev := htend.eventually_gt_atTop 0
  obtain ⟨X0, hX0⟩ := hev.exists_forall_of_atTop
  refine ⟨max X0 (B + 1), lt_of_lt_of_le (by linarith) (le_max_right _ _), ?_⟩
  have := hX0 (max X0 (B + 1)) (le_max_left _ _)
  rw [hq] at this
  simpa using this

/-! ## The main assembly -/

/-- **P6.5 assembly.** If `c 0 < c 1 < … < c (d−1)` are nonnegative
points where `Ψ_d` alternates in sign (`0 < (−1)^m·Ψ_d(c m)`), then
every complex root of `Ψ_d` is real. (The hypotheses are delivered by
P6.2 + P6.4a; conclusion = `theorem_M`.) -/
theorem psi_roots_real_of_alternation (d : ℕ) (hd : 1 ≤ d)
    (c : ℕ → ℝ)
    (hc0 : 0 ≤ c 0)
    (hmono : ∀ m n, m < n → n < d → c m < c n)
    (hsign : ∀ m, m < d → 0 < (-1 : ℝ) ^ m * (Psi d).eval (c m)) :
    ∀ z ∈ ((Psi d).map (algebraMap ℝ ℂ)).roots, z.im = 0 := by
  -- tail point
  obtain ⟨X, hXgt, hXsign⟩ := Psi_tail_sign d hd (c (d - 1))
  -- extended sign points: cc m = c m for m < d, X for m = d
  set cc : ℕ → ℝ := fun m => if m < d then c m else X with hcc
  have hccmono : ∀ m, m < d → cc m < cc (m + 1) := by
    intro m hm
    by_cases hm1 : m + 1 < d
    · simp only [hcc, if_pos hm, if_pos hm1]
      exact hmono m (m + 1) (Nat.lt_succ_self m) hm1
    · have : m + 1 = d := by omega
      simp only [hcc, if_pos hm, if_neg (by omega : ¬ m + 1 < d)]
      rcases Nat.lt_or_ge m (d - 1) with h | h
      · exact lt_of_lt_of_le (hmono m (d - 1) (by omega) (by omega)) hXgt.le
      · have : m = d - 1 := by omega
        rw [this]; exact hXgt
  have hccsign : ∀ m, m ≤ d → 0 < (-1 : ℝ) ^ m * (Psi d).eval (cc m) := by
    intro m hm
    rcases Nat.lt_or_ge m d with h | h
    · simp only [hcc, if_pos h]; exact hsign m h
    · have hmd : m = d := by omega
      simp only [hcc, hmd, if_neg (lt_irrefl d)]
      exact hXsign
  have hccpos : ∀ m, m ≤ d → 0 ≤ cc m := by
    intro m hm
    induction m with
    | zero => simp only [hcc, if_pos (by omega : 0 < d)]; exact hc0
    | succ n ih =>
      have hn : n ≤ d := by omega
      exact le_of_lt (lt_of_le_of_lt (ih hn) (hccmono n (by omega)))
  -- one root in each open interval (cc m, cc (m+1)), m = 0..d−1
  have hroot : ∀ m, m < d → ∃ x, cc m < x ∧ x < cc (m + 1) ∧
      (Psi d).eval x = 0 := by
    intro m hm
    have hs1 := hccsign m (le_of_lt hm)
    have hs2 := hccsign (m + 1) (by omega)
    -- (−1)^m·Ψ flips from + at cc m to − at cc (m+1)
    have hflip : (-1 : ℝ) ^ m * (Psi d).eval (cc (m + 1)) < 0 := by
      have h := hs2
      rw [pow_succ] at h
      nlinarith [h]
    have hcont : ContinuousOn (fun x => (-1 : ℝ) ^ m * (Psi d).eval x)
        (Icc (cc m) (cc (m + 1))) := by
      apply Continuous.continuousOn
      exact continuous_const.mul (Psi d).continuous_aeval
    have hmem : (0 : ℝ) ∈ Ioo ((-1 : ℝ) ^ m * (Psi d).eval (cc (m + 1)))
        ((-1 : ℝ) ^ m * (Psi d).eval (cc m)) := ⟨hflip, hs1⟩
    have hiv := intermediate_value_Ioo' (le_of_lt (hccmono m hm)) hcont
    obtain ⟨x, hx, hfx⟩ := hiv hmem
    refine ⟨x, hx.1, hx.2, ?_⟩
    have h0 : (-1 : ℝ) ^ m ≠ 0 := by
      rcases Nat.even_or_odd m with he | ho
      · rw [he.neg_one_pow]; norm_num
      · rw [ho.neg_one_pow]; norm_num
    have hfx' : (-1 : ℝ) ^ m * (Psi d).eval x = 0 := hfx
    exact (mul_eq_zero.mp hfx').resolve_left h0
  -- choose the roots
  choose r hr1 hr2 hr0 using hroot
  -- positivity and strict ordering of the chosen roots
  have hrpos : ∀ m (hm : m < d), 0 < r m hm := fun m hm =>
    lt_of_le_of_lt (hccpos m (le_of_lt hm)) (hr1 m hm)
  have hrlt : ∀ m n (hm : m < d) (hn : n < d), m < n → r m hm < r n hn := by
    intro m n hm hn hmn
    calc r m hm < cc (m + 1) := hr2 m hm
    _ ≤ cc n := by
      rcases Nat.lt_or_ge (m + 1) n with h | h
      · -- cc strictly increasing on 0..d
        have : ∀ a b, a ≤ b → b ≤ d → cc a ≤ cc b := by
          intro a b hab hbd
          induction b with
          | zero => simp_all
          | succ k ih =>
            rcases Nat.lt_or_ge a (k + 1) with h2 | h2
            · exact le_trans (ih (by omega) (by omega))
                (le_of_lt (hccmono k (by omega)))
            · have : a = k + 1 := by omega
              rw [this]
        exact this (m + 1) n (by omega) (le_of_lt hn)
      · have : n = m + 1 := by omega
        rw [this]
    _ < r n hn := hr1 n hn
  -- the 2d distinct real roots, packaged as a finset of ℂ
  classical
  intro z hz
  set pmap : ℂ[X] := (Psi d).map (algebraMap ℝ ℂ) with hpmap
  have hinj : Function.Injective (algebraMap ℝ ℂ) :=
    (algebraMap ℝ ℂ).injective
  have hpne : pmap ≠ 0 := by
    rw [hpmap, Polynomial.map_ne_zero_iff hinj]
    exact Psi_ne_zero d
  -- the positive roots as an injective Fin d family
  let f : Fin d → ℝ := fun i => r i.1 i.2
  have hfpos : ∀ i, 0 < f i := fun i => hrpos i.1 i.2
  have hfinj : Function.Injective f := by
    intro i j hij
    by_contra hne
    rcases lt_or_gt_of_ne (Fin.val_ne_of_ne hne) with h | h
    · exact absurd hij (ne_of_lt (hrlt i.1 j.1 i.2 j.2 h))
    · exact absurd hij.symm (ne_of_lt (hrlt j.1 i.1 j.2 i.2 h))
  -- both-signs family into ℂ
  let S : Finset ℂ :=
    (Finset.univ.image fun i : Fin d => ((f i : ℝ) : ℂ)) ∪
    (Finset.univ.image fun i : Fin d => ((-(f i) : ℝ) : ℂ))
  have hSP : ∀ w ∈ S, w ∈ pmap.roots := by
    intro w hw
    have hroot : ∀ a : ℝ, (Psi d).eval a = 0 → ((a : ℝ) : ℂ) ∈ pmap.roots := by
      intro a ha
      rw [Polynomial.mem_roots hpne]
      show pmap.IsRoot (algebraMap ℝ ℂ a)
      rw [hpmap, Polynomial.IsRoot, Polynomial.eval_map,
        Polynomial.eval₂_at_apply, ha, map_zero]
    rcases Finset.mem_union.mp hw with h | h
    · obtain ⟨i, _, rfl⟩ := Finset.mem_image.mp h
      exact hroot (f i) (hr0 i.1 i.2)
    · obtain ⟨i, _, rfl⟩ := Finset.mem_image.mp h
      apply hroot
      rw [Psi_eval_neg]
      exact hr0 i.1 i.2
  have hScard : S.card = 2 * d := by
    have hinj1 : Function.Injective fun i : Fin d => ((f i : ℝ) : ℂ) :=
      fun i j h => hfinj (Complex.ofReal_injective h)
    have hinj2 : Function.Injective fun i : Fin d => ((-(f i) : ℝ) : ℂ) := by
      intro i j h
      apply hfinj
      have := Complex.ofReal_injective h
      linarith
    have hdisj : Disjoint
        (Finset.univ.image fun i : Fin d => ((f i : ℝ) : ℂ))
        (Finset.univ.image fun i : Fin d => ((-(f i) : ℝ) : ℂ)) := by
      rw [Finset.disjoint_left]
      intro w h1 h2
      obtain ⟨i, _, rfl⟩ := Finset.mem_image.mp h1
      obtain ⟨j, _, hj⟩ := Finset.mem_image.mp h2
      have := Complex.ofReal_injective hj
      have hi := hfpos i
      have hjp := hfpos j
      linarith
    rw [Finset.card_union_of_disjoint hdisj,
      Finset.card_image_of_injective _ hinj1,
      Finset.card_image_of_injective _ hinj2,
      Finset.card_univ, Fintype.card_fin]
    ring
  -- count: |roots| ≤ natDegree = 2d, and S ⊆ roots.toFinset with |S| = 2d
  have hsub : S ⊆ pmap.roots.toFinset := by
    intro w hw
    exact Multiset.mem_toFinset.mpr (hSP w hw)
  have hcard_le : pmap.roots.card ≤ 2 * d := by
    have h1 := Polynomial.card_roots' pmap
    have h2 : pmap.natDegree = 2 * d := by
      rw [hpmap]
      rw [Polynomial.natDegree_map_eq_of_injective hinj]
      exact Psi_natDegree d hd
    omega
  have hfin_le : pmap.roots.toFinset.card ≤ pmap.roots.card :=
    Multiset.toFinset_card_le _
  have hEq : pmap.roots.toFinset = S := by
    apply Finset.Subset.antisymm
    · apply Finset.subset_of_eq
      symm
      apply Finset.eq_of_subset_of_card_le hsub
      omega
    · exact hsub
  -- conclude: z is one of the ±real points
  have hzS : z ∈ S := by
    rw [← hEq]
    exact Multiset.mem_toFinset.mpr hz
  rcases Finset.mem_union.mp hzS with h | h
  · obtain ⟨i, _, rfl⟩ := Finset.mem_image.mp h
    exact Complex.ofReal_im _
  · obtain ⟨i, _, rfl⟩ := Finset.mem_image.mp h
    exact Complex.ofReal_im _

end TheoremM
