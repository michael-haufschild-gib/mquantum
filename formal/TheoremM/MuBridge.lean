/-
Theorem M formalization, phase P6.4a: the μ-bridge.

Given finite quadrature data (weights ≥ 0, nodes in [0,1], total mass
1 − p, moments matching M k − p up to k = d — GPT's F131 interface,
to be supplied by P6.4b), this file proves:

1. the eval-level decomposition
   `Ψ_d(x) = p·C_d(x) + Σ_i w_i·C_d(v_i·x)`;
2. the budget `|Ψ_d(c) − p·C_d(c)| ≤ (1−p)·|C_d(c)|` at every
   nonnegative critical point of `C_d` (via Energy.lean's domination);
3. the strict sign transfer (`p > 1/2`, i.e. `e < 8`);
4. the capstone: `theorem_M_of_critical_data` — Theorem M's conclusion
   from (criticals with alternating `C_d`-signs) + (quadrature data),
   feeding `psi_roots_real_of_alternation`.

File claimed by Fable (F133); GPT works in Hermite.lean.
-/
import TheoremM.Energy
import TheoremM.SignCount

namespace TheoremM

open Polynomial Finset

/-! ## The atom mass `p = √(2/e)` -/

/-- The atom mass of the §1.4a decomposition. -/
noncomputable def pAtom : ℝ := Real.sqrt (2 / Real.exp 1)

lemma pAtom_pos : 0 < pAtom := by
  unfold pAtom
  apply Real.sqrt_pos.mpr
  positivity

lemma pAtom_gt_half : 1 / 2 < pAtom := by
  unfold pAtom
  have hexp := Real.exp_pos 1
  have h8 : Real.exp 1 < 8 := by nlinarith [Real.exp_one_lt_d9]
  have key : (1 / 2 : ℝ) ^ 2 < 2 / Real.exp 1 := by
    rw [show ((1 / 2 : ℝ)) ^ 2 = 1 / 4 by norm_num]
    calc (1 / 4 : ℝ) = (1 / 4 * Real.exp 1) / Real.exp 1 := by field_simp
      _ < 2 / Real.exp 1 := by gcongr ?_ / _; nlinarith
  calc (1 / 2 : ℝ) = Real.sqrt ((1 / 2) ^ 2) := by
        rw [Real.sqrt_sq (by norm_num : (0:ℝ) ≤ 1/2)]
    _ < Real.sqrt (2 / Real.exp 1) := by
        apply Real.sqrt_lt_sqrt (by positivity) key

/-! ## The decomposition from quadrature data -/

/-- Explicit eval formula for `Cpoly` (directly from the definition). -/
lemma Cpoly_eval_formula (d : ℕ) (x : ℝ) :
    (Cpoly d).eval x = ∑ k ∈ range (d + 1),
      (-1) ^ k * (d.descFactorial k : ℝ) /
        ((d : ℝ) ^ k * (2 * k).factorial) * x ^ (2 * k) := by
  unfold Cpoly
  rw [eval_finsetSum]
  apply Finset.sum_congr rfl
  intro k _
  rw [eval_mul, eval_C, eval_pow, eval_X]

/-- Explicit eval formula for `Psi` (directly from the definition). -/
lemma Psi_eval_formula (d : ℕ) (x : ℝ) :
    (Psi d).eval x = ∑ k ∈ range (d + 1),
      (-1) ^ k * (d.descFactorial k : ℝ) * M k /
        ((d : ℝ) ^ k * (2 * k).factorial) * x ^ (2 * k) := by
  unfold Psi
  rw [eval_finsetSum]
  apply Finset.sum_congr rfl
  intro k _
  rw [eval_mul, eval_C, eval_pow, eval_X]

/-- **The decomposition.** If the quadrature data matches the residual
moments `M k − pAtom` for `k ≤ d`, then for every real `x`:
`Ψ_d(x) = pAtom·C_d(x) + Σ_i w_i·C_d(v_i·x)`. -/
lemma Psi_eval_decomp (d : ℕ) (n : ℕ) (w v : Fin n → ℝ)
    (hmom : ∀ k, k ≤ d → ∑ i, w i * (v i) ^ (2 * k) = M k - pAtom)
    (x : ℝ) :
    (Psi d).eval x = pAtom * (Cpoly d).eval x
      + ∑ i, w i * (Cpoly d).eval (v i * x) := by
  rw [Psi_eval_formula, Cpoly_eval_formula]
  have hrhs : ∑ i, w i * (Cpoly d).eval (v i * x)
      = ∑ k ∈ range (d + 1),
          (-1) ^ k * (d.descFactorial k : ℝ) /
            ((d : ℝ) ^ k * (2 * k).factorial) * x ^ (2 * k)
          * (M k - pAtom) := by
    have h1 : ∀ i : Fin n, w i * (Cpoly d).eval (v i * x)
        = ∑ k ∈ range (d + 1),
            (-1) ^ k * (d.descFactorial k : ℝ) /
              ((d : ℝ) ^ k * (2 * k).factorial)
            * x ^ (2 * k) * (w i * (v i) ^ (2 * k)) := by
      intro i
      rw [Cpoly_eval_formula, Finset.mul_sum]
      apply Finset.sum_congr rfl
      intro k _
      rw [mul_pow]
      ring
    rw [Finset.sum_congr rfl (fun i _ => h1 i), Finset.sum_comm]
    apply Finset.sum_congr rfl
    intro k hk
    have hkd : k ≤ d := Nat.lt_succ_iff.mp (Finset.mem_range.mp hk)
    rw [← Finset.mul_sum, hmom k hkd]
  rw [hrhs, Finset.mul_sum, ← Finset.sum_add_distrib]
  apply Finset.sum_congr rfl
  intro k _
  ring

/-- **The budget at a critical point.** With nonnegative weights, nodes
in `[0,1]`, and total mass `1 − pAtom`: at every nonnegative critical
point `c` of `C_d`,
`|Ψ_d(c) − pAtom·C_d(c)| ≤ (1 − pAtom)·|C_d(c)|`. -/
lemma Psi_budget_at_critical (d : ℕ) (hd : 1 ≤ d)
    (n : ℕ) (w v : Fin n → ℝ)
    (hw : ∀ i, 0 ≤ w i)
    (hv : ∀ i, 0 ≤ v i ∧ v i ≤ 1)
    (hmass : ∑ i, w i = 1 - pAtom)
    (hmom : ∀ k, k ≤ d → ∑ i, w i * (v i) ^ (2 * k) = M k - pAtom)
    {c : ℝ} (hc : 0 ≤ c)
    (hcrit : (derivative (Cpoly d)).eval c = 0) :
    |(Psi d).eval c - pAtom * (Cpoly d).eval c|
      ≤ (1 - pAtom) * |(Cpoly d).eval c| := by
  rw [Psi_eval_decomp d n w v hmom c]
  rw [add_sub_cancel_left]
  calc |∑ i, w i * (Cpoly d).eval (v i * c)|
      ≤ ∑ i, |w i * (Cpoly d).eval (v i * c)| :=
        Finset.abs_sum_le_sum_abs _ _
    _ ≤ ∑ i, w i * |(Cpoly d).eval c| := by
        apply Finset.sum_le_sum
        intro i _
        rw [abs_mul, abs_of_nonneg (hw i)]
        apply mul_le_mul_of_nonneg_left _ (hw i)
        have hvi := hv i
        have hyc : v i * c ≤ c := by
          nlinarith [hvi.1, hvi.2, hc]
        have hy0 : 0 ≤ v i * c := mul_nonneg hvi.1 hc
        exact abs_Cpoly_le_of_critical d hd hc hcrit hy0 hyc
    _ = (1 - pAtom) * |(Cpoly d).eval c| := by
        rw [← Finset.sum_mul, hmass]

/-- **Sign transfer from a budget bound.** If
`|Ψ_d(c) − pAtom·C_d(c)| ≤ (1 − pAtom)·|C_d(c)|`, then `Ψ_d` has the
same strict sign as `C_d` at `c` — only `pAtom > 1/2` is used.  This is
the generic core consumed by both the finite-quadrature interface
below and the measure-variant capstone (`Capstone.lean`). -/
lemma Psi_sign_of_budget (d : ℕ) {c : ℝ}
    (hbudget : |(Psi d).eval c - pAtom * (Cpoly d).eval c|
      ≤ (1 - pAtom) * |(Cpoly d).eval c|)
    (s : ℝ) (hs : 0 < s * (Cpoly d).eval c) (hs1 : |s| = 1) :
    0 < s * (Psi d).eval c := by
  have hsor : s = 1 ∨ s = -1 := by
    rcases abs_cases s with ⟨h1, _⟩ | ⟨h1, _⟩
    · left; rw [← h1, hs1]
    · right
      have h2 : -s = 1 := by rw [← hs1, h1]
      linarith
  have habs : |(Cpoly d).eval c| = s * (Cpoly d).eval c := by
    rcases hsor with rfl | rfl
    · rw [one_mul] at hs ⊢
      exact abs_of_pos hs
    · have hC : (Cpoly d).eval c < 0 := by nlinarith
      rw [abs_of_neg hC]
      ring
  have hphalf := pAtom_gt_half
  have h1 : s * (Psi d).eval c
      ≥ s * (pAtom * (Cpoly d).eval c)
        - |(Psi d).eval c - pAtom * (Cpoly d).eval c| := by
    have habs2 : |s * ((Psi d).eval c - pAtom * (Cpoly d).eval c)|
        = |(Psi d).eval c - pAtom * (Cpoly d).eval c| := by
      rw [abs_mul, hs1, one_mul]
    nlinarith [neg_abs_le (s * ((Psi d).eval c - pAtom * (Cpoly d).eval c)),
      habs2.le, habs2.ge]
  have h2 : s * (pAtom * (Cpoly d).eval c)
      = pAtom * (s * (Cpoly d).eval c) := by ring
  calc (0 : ℝ) < (2 * pAtom - 1) * (s * (Cpoly d).eval c) := by
        have : 0 < 2 * pAtom - 1 := by linarith
        positivity
    _ = pAtom * (s * (Cpoly d).eval c)
        - (1 - pAtom) * (s * (Cpoly d).eval c) := by ring
    _ = pAtom * (s * (Cpoly d).eval c)
        - (1 - pAtom) * |(Cpoly d).eval c| := by rw [habs]
    _ ≤ pAtom * (s * (Cpoly d).eval c)
        - |(Psi d).eval c - pAtom * (Cpoly d).eval c| := by
        linarith [hbudget]
    _ ≤ s * (Psi d).eval c := by
        rw [← h2]
        linarith [h1]

/-- **Sign transfer.** Under the quadrature hypotheses, `Ψ_d` has the
same (strict) sign as `C_d` at every nonnegative critical point. -/
lemma Psi_sign_at_critical (d : ℕ) (hd : 1 ≤ d)
    (n : ℕ) (w v : Fin n → ℝ)
    (hw : ∀ i, 0 ≤ w i)
    (hv : ∀ i, 0 ≤ v i ∧ v i ≤ 1)
    (hmass : ∑ i, w i = 1 - pAtom)
    (hmom : ∀ k, k ≤ d → ∑ i, w i * (v i) ^ (2 * k) = M k - pAtom)
    {c : ℝ} (hc : 0 ≤ c)
    (hcrit : (derivative (Cpoly d)).eval c = 0)
    (s : ℝ) (hs : 0 < s * (Cpoly d).eval c) (hs1 : |s| = 1) :
    0 < s * (Psi d).eval c :=
  Psi_sign_of_budget d
    (Psi_budget_at_critical d hd n w v hw hv hmass hmom hc hcrit) s hs hs1

/-! ## The capstone -/

/-- **Theorem M from critical data + quadrature data.** This is the
formal reduction: P6.2 supplies the critical points of `C_d` with
alternating critical-value signs; P6.4b supplies the quadrature data;
this theorem (via `psi_roots_real_of_alternation`) concludes that all
complex roots of `Ψ_d` are real. -/
theorem theorem_M_of_critical_data (d : ℕ) (hd : 1 ≤ d)
    (c : ℕ → ℝ)
    (hc0 : 0 ≤ c 0)
    (hmono : ∀ m n', m < n' → n' < d → c m < c n')
    (hcrit : ∀ m, m < d → (derivative (Cpoly d)).eval (c m) = 0)
    (hCsign : ∀ m, m < d → 0 < (-1 : ℝ) ^ m * (Cpoly d).eval (c m))
    (n : ℕ) (w v : Fin n → ℝ)
    (hw : ∀ i, 0 ≤ w i)
    (hv : ∀ i, 0 ≤ v i ∧ v i ≤ 1)
    (hmass : ∑ i, w i = 1 - pAtom)
    (hmom : ∀ k, k ≤ d → ∑ i, w i * (v i) ^ (2 * k) = M k - pAtom) :
    ∀ z ∈ ((Psi d).map (algebraMap ℝ ℂ)).roots, z.im = 0 := by
  apply psi_roots_real_of_alternation d hd c hc0 hmono
  intro m hm
  have hcm : 0 ≤ c m := by
    rcases Nat.eq_zero_or_pos m with rfl | hmpos
    · exact hc0
    · exact le_of_lt (lt_of_le_of_lt hc0 (hmono 0 m hmpos hm))
  have hs1 : |(-1 : ℝ) ^ m| = 1 := by
    rcases Nat.even_or_odd m with he | ho
    · rw [he.neg_one_pow]; norm_num
    · rw [ho.neg_one_pow]; norm_num
  exact Psi_sign_at_critical d hd n w v hw hv hmass hmom hcm
    (hcrit m hm) ((-1 : ℝ) ^ m) (hCsign m hm) hs1

end TheoremM
