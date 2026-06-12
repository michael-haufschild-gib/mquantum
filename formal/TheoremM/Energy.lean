/-
Theorem M formalization, phase P6.3: the REAL W1 energy lemma —
E(x) = C_d(x)² + C_d′(x)² is nondecreasing on x ≥ 0 — and its
consequences for the second proof (draft §3c): E(0) = 1 and the
pointwise domination |C_d(y)| ≤ |C_d(c)| for 0 ≤ y ≤ c at critical c.
-/
import TheoremM.Structure

namespace TheoremM

open Polynomial Real Set

/-- The Sonin energy of the model at a real point. -/
noncomputable def energy (d : ℕ) (x : ℝ) : ℝ :=
  ((Cpoly d).eval x) ^ 2 + ((derivative (Cpoly d)).eval x) ^ 2

/-- The evaluated ODE: `2d·C″(x) = x·C′(x) − 2d·C(x)` for every real `x`. -/
lemma Cpoly_ode_eval (d : ℕ) (hd : 1 ≤ d) (x : ℝ) :
    (2 * d : ℝ) * (derivative (derivative (Cpoly d))).eval x
      = x * (derivative (Cpoly d)).eval x - (2 * d : ℝ) * (Cpoly d).eval x := by
  have h := Cpoly_ode d hd
  have h2 := congrArg (Polynomial.eval x) h
  simp only [eval_add, eval_sub, eval_mul, eval_C, eval_X, eval_zero] at h2
  push_cast at h2
  linarith

/-- `energy` has derivative `(x/d)·C′(x)²` at every `x`. -/
lemma hasDerivAt_energy (d : ℕ) (hd : 1 ≤ d) (x : ℝ) :
    HasDerivAt (energy d) ((x / d) * ((derivative (Cpoly d)).eval x) ^ 2) x := by
  have hC : HasDerivAt (fun y => (Cpoly d).eval y)
      ((derivative (Cpoly d)).eval x) x := (Cpoly d).hasDerivAt x
  have hC' : HasDerivAt (fun y => (derivative (Cpoly d)).eval y)
      ((derivative (derivative (Cpoly d))).eval x) x :=
    (derivative (Cpoly d)).hasDerivAt x
  have h1 : HasDerivAt (fun y => ((Cpoly d).eval y) ^ 2)
      (2 * ((Cpoly d).eval x) * ((derivative (Cpoly d)).eval x)) x := by
    simpa [mul_comm, mul_assoc, mul_left_comm] using
      (hC.pow 2)
  have h2 : HasDerivAt (fun y => ((derivative (Cpoly d)).eval y) ^ 2)
      (2 * ((derivative (Cpoly d)).eval x)
        * ((derivative (derivative (Cpoly d))).eval x)) x := by
    simpa [mul_comm, mul_assoc, mul_left_comm] using
      (hC'.pow 2)
  have hsum := h1.add h2
  have hode := Cpoly_ode_eval d hd x
  have hdpos : (0 : ℝ) < d := by exact_mod_cast hd
  convert hsum using 1
  have hCdd : (derivative (derivative (Cpoly d))).eval x
      = (x * (derivative (Cpoly d)).eval x
          - (2 * d : ℝ) * (Cpoly d).eval x) / (2 * d) := by
    field_simp
    linarith
  rw [hCdd]
  field_simp
  ring

/-- **Real W1**: the energy is monotone nondecreasing on `[0, ∞)`. -/
lemma energy_monotoneOn (d : ℕ) (hd : 1 ≤ d) :
    MonotoneOn (energy d) (Ici (0 : ℝ)) := by
  have hderiv : ∀ x ∈ interior (Ici (0 : ℝ)),
      0 ≤ deriv (energy d) x := by
    intro x hx
    rw [interior_Ici] at hx
    rw [(hasDerivAt_energy d hd x).deriv]
    have hxpos : (0 : ℝ) < x := hx
    have hdpos : (0 : ℝ) < d := by exact_mod_cast hd
    positivity
  have hcont : ContinuousOn (energy d) (Ici (0 : ℝ)) := by
    apply Continuous.continuousOn
    unfold energy
    fun_prop
  exact monotoneOn_of_deriv_nonneg (convex_Ici 0) hcont
    (fun x hx =>
      (hasDerivAt_energy d hd x).differentiableAt.differentiableWithinAt)
    hderiv

/-- `E(0) = 1`: the model is normalized. -/
lemma energy_zero (d : ℕ) : energy d 0 = 1 := by
  unfold energy
  have h0 : (Cpoly d).eval 0 = 1 := by
    rw [eval_eq_sum_range]
    rw [Finset.sum_eq_single 0]
    · have := Cpoly_coeff_even d 0
      simpa using this
    · intro k _ hk
      simp [zero_pow hk]
    · intro h
      exact absurd (Finset.mem_range.mpr (Nat.succ_pos _)) h
  have h1 : (derivative (Cpoly d)).eval 0 = 0 := by
    rw [eval_eq_sum_range]
    rw [Finset.sum_eq_single 0]
    · rw [coeff_derivative]
      have : (Cpoly d).coeff 1 = 0 := Cpoly_coeff_odd d 1 ⟨0, by omega⟩
      simp [this]
    · intro k _ hk
      simp [zero_pow hk]
    · intro h
      exact absurd (Finset.mem_range.mpr (Nat.succ_pos _)) h
  rw [h0, h1]
  norm_num

/-- Pointwise domination from W1: `C_d(y)² ≤ E(x)` for `0 ≤ y ≤ x`. -/
lemma sq_Cpoly_le_energy (d : ℕ) (hd : 1 ≤ d) {y x : ℝ}
    (hy : 0 ≤ y) (hyx : y ≤ x) :
    ((Cpoly d).eval y) ^ 2 ≤ energy d x := by
  have h1 : ((Cpoly d).eval y) ^ 2 ≤ energy d y := by
    unfold energy
    have : (0 : ℝ) ≤ ((derivative (Cpoly d)).eval y) ^ 2 := sq_nonneg _
    linarith
  have h2 : energy d y ≤ energy d x :=
    energy_monotoneOn d hd hy (le_trans hy hyx) hyx
  linarith

/-- At a critical point `c ≥ 0` of `C_d`, the energy collapses to the
critical value: `E(c) = C_d(c)²`, hence `|C_d(y)| ≤ |C_d(c)|` on `[0, c]`
— the y = 0 wall dominance of the second proof (§3c, step (i)). -/
lemma abs_Cpoly_le_of_critical (d : ℕ) (hd : 1 ≤ d) {c y : ℝ}
    (hc : 0 ≤ c) (hcrit : (derivative (Cpoly d)).eval c = 0)
    (hy : 0 ≤ y) (hyc : y ≤ c) :
    |(Cpoly d).eval y| ≤ |(Cpoly d).eval c| := by
  have hE : energy d c = ((Cpoly d).eval c) ^ 2 := by
    unfold energy
    rw [hcrit]
    ring
  have h := sq_Cpoly_le_energy d hd hy hyc
  rw [hE] at h
  have h2 : |(Cpoly d).eval y| ^ 2 ≤ |(Cpoly d).eval c| ^ 2 := by
    rwa [sq_abs, sq_abs]
  nlinarith [h2, abs_nonneg ((Cpoly d).eval y), abs_nonneg ((Cpoly d).eval c)]

end TheoremM
