/-
Theorem M formalization, phase P6.1: structure of `Cpoly` and `Psi` —
coefficient closed forms (valid at every index), degree, and the
Kummer ODE identity 1.1 in polynomial form.
-/
import TheoremM.Defs

namespace TheoremM

open Polynomial Real Finset

/-! ## Coefficient closed forms

The coefficient formulas hold at EVERY index: beyond `k = d` the
falling factorial `d.descFactorial k` vanishes, so no range bookkeeping
is needed downstream. -/

/-- Closed form for the even coefficients of `Cpoly d`, all `k`. -/
lemma Cpoly_coeff_even (d k : ℕ) :
    (Cpoly d).coeff (2 * k) =
      (-1) ^ k * (d.descFactorial k : ℝ) / ((d : ℝ) ^ k * (2 * k).factorial) := by
  unfold Cpoly
  rw [finsetSum_coeff]
  by_cases hk : k ∈ range (d + 1)
  · rw [Finset.sum_eq_single k]
    · simp [coeff_C_mul, coeff_X_pow]
    · intro j _ hj
      have : (2 * k) ≠ 2 * j := by omega
      simp [coeff_C_mul, coeff_X_pow, this]
    · intro h; exact absurd hk h
  · -- k > d: every term has exponent 2j ≠ 2k, and descFactorial d k = 0.
    have hkd : d < k := by
      by_contra h
      exact hk (Finset.mem_range.mpr (by omega))
    rw [Finset.sum_eq_zero, Nat.descFactorial_of_lt hkd]
    · simp
    · intro j hj
      have : (2 * k) ≠ 2 * j := by
        have := Finset.mem_range.mp hj; omega
      simp [coeff_C_mul, coeff_X_pow, this]

/-- Odd coefficients of `Cpoly d` vanish. -/
lemma Cpoly_coeff_odd (d m : ℕ) (hm : Odd m) : (Cpoly d).coeff m = 0 := by
  unfold Cpoly
  rw [finsetSum_coeff]
  apply Finset.sum_eq_zero
  intro k _
  have hne : m ≠ 2 * k := by
    intro h
    rw [h] at hm
    have := Nat.odd_iff.mp hm
    omega
  simp [coeff_C_mul, coeff_X_pow, hne]

/-- Closed form for the even coefficients of `Psi d`, all `k`. -/
lemma Psi_coeff_even (d k : ℕ) :
    (Psi d).coeff (2 * k) =
      (-1) ^ k * (d.descFactorial k : ℝ) * M k /
        ((d : ℝ) ^ k * (2 * k).factorial) := by
  unfold Psi
  rw [finsetSum_coeff]
  by_cases hk : k ∈ range (d + 1)
  · rw [Finset.sum_eq_single k]
    · simp [coeff_C_mul, coeff_X_pow]
    · intro j _ hj
      have : (2 * k) ≠ 2 * j := by omega
      simp [coeff_C_mul, coeff_X_pow, this]
    · intro h; exact absurd hk h
  · have hkd : d < k := by
      by_contra h
      exact hk (Finset.mem_range.mpr (by omega))
    rw [Finset.sum_eq_zero, Nat.descFactorial_of_lt hkd]
    · simp
    · intro j hj
      have : (2 * k) ≠ 2 * j := by
        have := Finset.mem_range.mp hj; omega
      simp [coeff_C_mul, coeff_X_pow, this]

/-! ## Degree -/

/-- The top coefficient of `Psi d` is nonzero (for `d ≥ 1`). -/
lemma Psi_coeff_top_ne_zero (d : ℕ) (hd : 1 ≤ d) :
    (Psi d).coeff (2 * d) ≠ 0 := by
  rw [Psi_coeff_even]
  have h1 : (d.descFactorial d : ℝ) ≠ 0 := by
    rw [Nat.descFactorial_self]
    exact_mod_cast (Nat.factorial_pos d).ne'
  have h2 : (0 : ℝ) < M d := M_pos d
  have h3 : ((d : ℝ) ^ d * (2 * d).factorial) ≠ 0 := by positivity
  have h4 : ((-1 : ℝ)) ^ d ≠ 0 := by
    simp
  exact div_ne_zero (by exact mul_ne_zero (mul_ne_zero h4 h1) h2.ne') h3

/-- Coefficients of `Psi d` above `2d` vanish. -/
lemma Psi_coeff_gt (d m : ℕ) (hm : 2 * d < m) : (Psi d).coeff m = 0 := by
  rcases Nat.even_or_odd m with he | ho
  · obtain ⟨k, hk⟩ := he
    have h2k : m = 2 * k := by omega
    rw [h2k, Psi_coeff_even]
    have hkd : d < k := by omega
    rw [Nat.descFactorial_of_lt hkd]
    simp
  · exact Psi_coeff_odd d m ho

/-- `Psi d` has degree exactly `2d` for `d ≥ 1`. -/
lemma Psi_natDegree (d : ℕ) (hd : 1 ≤ d) : (Psi d).natDegree = 2 * d := by
  apply le_antisymm
  · apply natDegree_le_iff_coeff_eq_zero.mpr
    intro m hm
    exact Psi_coeff_gt d m hm
  · exact le_natDegree_of_ne_zero (Psi_coeff_top_ne_zero d hd)

/-- `Psi d ≠ 0`. -/
lemma Psi_ne_zero (d : ℕ) : Psi d ≠ 0 := by
  intro h
  have := Psi_coeff_zero d
  rw [h] at this
  simp at this

/-! ## The Kummer ODE (draft 1.1) in polynomial form

`2d·C″ − X·C′ + 2d·C = 0`, equivalently `C″ − (w/2d)C′ + C = 0`.
The coefficient-level content is the falling-factorial recurrence
`(d)_{k+1} = (d − k)·(d)_k`. -/

/-- The ODE identity. -/
theorem Cpoly_ode (d : ℕ) (hd : 1 ≤ d) :
    Polynomial.C ((2 * d : ℕ) : ℝ) * derivative (derivative (Cpoly d))
      - X * derivative (Cpoly d)
      + Polynomial.C ((2 * d : ℕ) : ℝ) * Cpoly d = 0 := by
  ext m
  rcases Nat.even_or_odd m with he | ho
  · -- m = 2k: the descFactorial recurrence closes the identity.
    obtain ⟨k, hk⟩ := he
    have hm : m = 2 * k := by omega
    subst hm
    have hC2 : (derivative (derivative (Cpoly d))).coeff (2 * k)
        = (Cpoly d).coeff (2 * k + 2) * ((2 * k + 1) * (2 * k + 2)) := by
      rw [coeff_derivative, coeff_derivative]
      push_cast
      ring
    have hXC' : (X * derivative (Cpoly d)).coeff (2 * k)
        = (Cpoly d).coeff (2 * k) * (2 * k) := by
      cases k with
      | zero => simp
      | succ n =>
        have h : 2 * (n + 1) = (2 * n + 1) + 1 := by ring
        rw [h, coeff_X_mul, coeff_derivative]
        push_cast
        ring
    have hnext : (2 * k + 2) = 2 * (k + 1) := by ring
    simp only [coeff_add, coeff_sub, coeff_C_mul, hC2, hXC', coeff_zero]
    rw [hnext, Cpoly_coeff_even, Cpoly_coeff_even]
    by_cases hkd : k < d
    · -- live range: use the recurrence with a real subtraction
      rw [Nat.descFactorial_succ]
      have hcast : ((d - k : ℕ) : ℝ) = (d : ℝ) - k :=
        Nat.cast_sub (le_of_lt hkd)
      push_cast [hcast]
      have hdne : (d : ℝ) ≠ 0 := by
        have : (0 : ℝ) < d := by exact_mod_cast hd
        exact this.ne'
      have hdk : (d : ℝ) ^ k ≠ 0 := by positivity
      have hf1 : ((2 * k).factorial : ℝ) ≠ 0 := by positivity
      have hf2 : ((2 * (k + 1)).factorial : ℝ) ≠ 0 := by positivity
      have hfacrec : ((2 * (k + 1)).factorial : ℝ)
          = (2 * k + 2) * ((2 * k + 1) * (2 * k).factorial) := by
        have h : 2 * (k + 1) = (2 * k + 1) + 1 := by ring
        rw [h, Nat.factorial_succ, Nat.factorial_succ]
        push_cast
        ring
      rw [hfacrec]
      rw [pow_succ]
      field_simp
      ring
    · -- dead range: both descFactorials vanish
      have h1 : d.descFactorial (k + 1) = 0 :=
        Nat.descFactorial_of_lt (by omega)
      have h2 : d.descFactorial k = 0 ∨ d = k := by
        rcases Nat.lt_or_ge d k with h | h
        · exact Or.inl (Nat.descFactorial_of_lt h)
        · right; omega
      rcases h2 with h2 | h2
      · rw [h1, h2]; simp
      · subst h2
        rw [h1, Nat.descFactorial_self]
        have hdne : (d : ℝ) ≠ 0 := by
          have : (0 : ℝ) < d := by exact_mod_cast hd
          exact this.ne'
        have hdk : (d : ℝ) ^ d ≠ 0 := by positivity
        have hf1 : ((2 * d).factorial : ℝ) ≠ 0 := by positivity
        push_cast
        field_simp
        ring
  · -- odd m: every coefficient in sight vanishes.
    have hC : (Cpoly d).coeff m = 0 := Cpoly_coeff_odd d m ho
    have hC2 : (derivative (derivative (Cpoly d))).coeff m = 0 := by
      rw [coeff_derivative, coeff_derivative]
      have : Odd (m + 1 + 1) := by
        obtain ⟨j, hj⟩ := ho
        exact ⟨j + 1, by omega⟩
      rw [Cpoly_coeff_odd d _ this]
      ring
    have hXC' : (X * derivative (Cpoly d)).coeff m = 0 := by
      cases m with
      | zero => simp at ho
      | succ n =>
        rw [coeff_X_mul, coeff_derivative]
        have : Odd (n + 1) := ho
        have hn : Even n := by
          obtain ⟨j, hj⟩ := this
          exact ⟨j, by omega⟩
        -- n even ⟹ n + 1 odd is m itself… we need coeff at n + 1 = m: odd ✓
        rw [Cpoly_coeff_odd d (n + 1) this]
        ring
    have e1 : (Polynomial.C ((2 * d : ℕ) : ℝ)
        * derivative (derivative (Cpoly d))).coeff m = 0 := by
      rw [coeff_C_mul, hC2, mul_zero]
    have e2 : (Polynomial.C ((2 * d : ℕ) : ℝ) * Cpoly d).coeff m = 0 := by
      rw [coeff_C_mul, hC, mul_zero]
    rw [coeff_add, coeff_sub, e1, e2, hXC', coeff_zero]
    ring

end TheoremM
