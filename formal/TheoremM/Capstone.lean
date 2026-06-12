/-
Theorem M formalization, P6.4b(β4): the measure-variant capstone.

The finite-quadrature hypotheses of `theorem_M_of_critical_data`
(existence of nodes/weights matching the residual moments `M k − p`)
are here DISCHARGED by the constructed compound-Poisson pushforward
`muMeasure`:

* its even moments ARE the residual moments (`integral_pow_muMeasure`),
* its total mass is `1 − pAtom` (`muMeasure_univ`),
* it is concentrated on `(0, 1]` (`ae_muMeasure_mem_Ioc`).

What remains as hypothesis in `theorem_M_of_critical_data_measure` is
exactly the P6.2 critical data of `C_d` — the interlacing critical
points with alternating critical-value signs — delivered by
`CriticalData.lean`, where `theorem_M` is stated and proven from this
capstone.

The finite-quadrature interface in `MuBridge.lean` remains intact as
the special case (F140/F141 agreement); both routes share the generic
sign-transfer core `Psi_sign_of_budget`.

File owned by Fable (F135 protocol).
-/
import TheoremM.CPMeasure

namespace TheoremM

open Real MeasureTheory Set Polynomial Finset

/-- **The measure decomposition**:
`Ψ_d(x) = pAtom·C_d(x) + ∫ C_d(vx) dμ(v)` — unconditionally, since the
even moments of `muMeasure` are the residual moments at EVERY order. -/
lemma Psi_eval_decomp_measure (d : ℕ) (x : ℝ) :
    (Psi d).eval x = pAtom * (Cpoly d).eval x
      + ∫ v, (Cpoly d).eval (v * x) ∂muMeasure := by
  have hint : ∫ v, (Cpoly d).eval (v * x) ∂muMeasure
      = ∑ k ∈ range (d + 1),
          (-1) ^ k * (d.descFactorial k : ℝ) /
            ((d : ℝ) ^ k * (2 * k).factorial) * x ^ (2 * k)
          * (M k - pAtom) := by
    have heval : ∀ v : ℝ, (Cpoly d).eval (v * x)
        = ∑ k ∈ range (d + 1),
            (-1) ^ k * (d.descFactorial k : ℝ) /
              ((d : ℝ) ^ k * (2 * k).factorial) * x ^ (2 * k)
            * v ^ (2 * k) := by
      intro v
      rw [Cpoly_eval_formula]
      refine Finset.sum_congr rfl fun k _ => ?_
      rw [mul_pow]
      ring
    simp_rw [heval]
    rw [integral_finsetSum _ fun k _ =>
      (integrable_pow_muMeasure (2 * k)).const_mul _]
    refine Finset.sum_congr rfl fun k _ => ?_
    rw [integral_const_mul, integral_pow_muMeasure]
  rw [Psi_eval_formula, Cpoly_eval_formula, hint, Finset.mul_sum,
    ← Finset.sum_add_distrib]
  refine Finset.sum_congr rfl fun k _ => ?_
  ring

/-- **The budget at a critical point, from the measure**: at every
nonnegative critical point `c` of `C_d`,
`|Ψ_d(c) − pAtom·C_d(c)| ≤ (1 − pAtom)·|C_d(c)|`. -/
lemma Psi_budget_at_critical_measure (d : ℕ) (hd : 1 ≤ d)
    {c : ℝ} (hc : 0 ≤ c)
    (hcrit : (derivative (Cpoly d)).eval c = 0) :
    |(Psi d).eval c - pAtom * (Cpoly d).eval c|
      ≤ (1 - pAtom) * |(Cpoly d).eval c| := by
  have hp1 : pAtom < 1 := by
    have := M_gt_pAtom 0
    rwa [M_zero] at this
  rw [Psi_eval_decomp_measure d c, add_sub_cancel_left]
  have hint := integrable_polyEval_muMeasure (Cpoly d) c
  calc |∫ v, (Cpoly d).eval (v * c) ∂muMeasure|
      ≤ ∫ v, |(Cpoly d).eval (v * c)| ∂muMeasure :=
        abs_integral_le_integral_abs
    _ ≤ ∫ _, |(Cpoly d).eval c| ∂muMeasure := by
        apply integral_mono_ae hint.abs (integrable_const _)
        filter_upwards [ae_muMeasure_mem_Ioc] with v hv
        have hyc : v * c ≤ c := by nlinarith [hv.1.le, hv.2, hc]
        have hy0 : 0 ≤ v * c := mul_nonneg hv.1.le hc
        exact abs_Cpoly_le_of_critical d hd hc hcrit hy0 hyc
    _ = (1 - pAtom) * |(Cpoly d).eval c| := by
        rw [integral_const, measureReal_def, muMeasure_univ,
          ENNReal.toReal_ofReal (by linarith), smul_eq_mul]

/-- **Theorem M from critical data alone** — the quadrature hypotheses
of `theorem_M_of_critical_data` are discharged by the compound-Poisson
construction.  Only the P6.2 critical data of `C_d` remains: the
critical points `c 0 < c 1 < ⋯ < c (d−1)` with alternating
critical-value signs. -/
theorem theorem_M_of_critical_data_measure (d : ℕ) (hd : 1 ≤ d)
    (c : ℕ → ℝ)
    (hc0 : 0 ≤ c 0)
    (hmono : ∀ m n', m < n' → n' < d → c m < c n')
    (hcrit : ∀ m, m < d → (derivative (Cpoly d)).eval (c m) = 0)
    (hCsign : ∀ m, m < d → 0 < (-1 : ℝ) ^ m * (Cpoly d).eval (c m)) :
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
  exact Psi_sign_of_budget d
    (Psi_budget_at_critical_measure d hd hcm (hcrit m hm))
    ((-1 : ℝ) ^ m) (hCsign m hm) hs1

end TheoremM
