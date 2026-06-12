/-
Theorem M formalization, P6.4b(b) building block: Frullani's integral
for exponentials,

  `∫_{(0,∞)} (e^{−at} − e^{−bt})/t dt = log(b/a)`,  `0 < a ≤ b`,

proved by writing the integrand as `∫_a^b e^{−st} ds` and swapping the
order of integration (the inner `t`-integral is `1/s`). The
product-integrability certificate reuses the inner identity: the
iterated norm integral IS the Frullani integrand, dominated by
`(b−a)·e^{−at}`.

Keystone of the Binet identity (B) from draft §1.4a. Not in mathlib
(grep round 322) — upstream candidate.

File owned by Fable (F135 protocol).
-/
import Mathlib

namespace TheoremM

open Real MeasureTheory Set intervalIntegral

/-- For `t > 0`: `(e^{−at} − e^{−bt})/t = ∫_a^b e^{−st} ds`. -/
lemma exp_diff_div_eq_integral {a b t : ℝ} (ht : 0 < t) :
    (Real.exp (-(a * t)) - Real.exp (-(b * t))) / t
      = ∫ s in a..b, Real.exp (-(s * t)) := by
  have hderiv : ∀ s ∈ uIcc a b, HasDerivAt
      (fun u : ℝ => -Real.exp (-(u * t)) / t) (Real.exp (-(s * t))) s := by
    intro s _
    have h1 : HasDerivAt (fun u : ℝ => -(u * t)) (-t) s := by
      simpa using ((hasDerivAt_id s).mul_const t).neg
    have h2 : HasDerivAt (fun u : ℝ => Real.exp (-(u * t)))
        (Real.exp (-(s * t)) * (-t)) s := (Real.hasDerivAt_exp _).comp s h1
    have h3 := (h2.neg).div_const t
    convert h3 using 1
    field_simp
  have hcont : ContinuousOn (fun s : ℝ => Real.exp (-(s * t))) (uIcc a b) := by
    fun_prop
  rw [integral_eq_sub_of_hasDerivAt hderiv (hcont.intervalIntegrable)]
  field_simp
  ring

/-- `∫_{(0,∞)} e^{−st} dt = 1/s` for `s > 0`. -/
lemma integral_exp_neg_mul_Ioi' {s : ℝ} (hs : 0 < s) :
    ∫ t in Ioi (0 : ℝ), Real.exp (-(s * t)) = 1 / s := by
  have h := MeasureTheory.integral_comp_mul_left_Ioi
    (fun x => Real.exp (-x)) 0 hs
  simp only [mul_zero] at h
  rw [h, integral_exp_neg_Ioi_zero, smul_eq_mul, mul_one, one_div]

/-- Integrability of `t ↦ e^{−st}` on `(0,∞)` for `s > 0`. -/
lemma integrableOn_exp_neg_mul {s : ℝ} (hs : 0 < s) :
    IntegrableOn (fun t : ℝ => Real.exp (-(s * t))) (Ioi 0) := by
  have h := exp_neg_integrableOn_Ioi 0 hs
  apply h.congr_fun _ measurableSet_Ioi
  intro t _
  ring_nf

/-- Pointwise domination: for `0 < a ≤ b`, `t > 0`:
`0 ≤ (e^{−at} − e^{−bt})/t ≤ (b−a)·e^{−at}`. -/
lemma exp_diff_div_bounds {a b t : ℝ} (ha : 0 < a) (hab : a ≤ b)
    (ht : 0 < t) :
    0 ≤ (Real.exp (-(a * t)) - Real.exp (-(b * t))) / t ∧
    (Real.exp (-(a * t)) - Real.exp (-(b * t))) / t
      ≤ (b - a) * Real.exp (-(a * t)) := by
  constructor
  · apply div_nonneg _ ht.le
    have : -(b * t) ≤ -(a * t) := by nlinarith
    linarith [Real.exp_le_exp.mpr this]
  · rw [div_le_iff₀ ht]
    have hfac : Real.exp (-(b * t))
        = Real.exp (-(a * t)) * Real.exp (-((b - a) * t)) := by
      rw [← Real.exp_add]
      ring_nf
    rw [hfac]
    have hexp : 1 - Real.exp (-((b - a) * t)) ≤ (b - a) * t := by
      have h := Real.add_one_le_exp (-((b - a) * t))
      nlinarith
    have hpos := Real.exp_pos (-(a * t))
    nlinarith [hpos.le, mul_nonneg (mul_nonneg (sub_nonneg.mpr hab) ht.le)
      hpos.le]

/-- Integrability of the Frullani integrand. -/
lemma integrable_frullani {a b : ℝ} (ha : 0 < a) (hab : a ≤ b) :
    IntegrableOn
      (fun t : ℝ => (Real.exp (-(a * t)) - Real.exp (-(b * t))) / t)
      (Ioi 0) := by
  apply Integrable.mono' ((integrableOn_exp_neg_mul ha).const_mul (b - a))
  · exact ((Measurable.div (by fun_prop) measurable_id)).aestronglyMeasurable
  · filter_upwards [ae_restrict_mem measurableSet_Ioi] with t ht
    have hb := exp_diff_div_bounds ha hab (mem_Ioi.mp ht)
    rw [norm_eq_abs, abs_of_nonneg hb.1]
    exact hb.2

/-- **Frullani for exponentials.** -/
theorem frullani_exp {a b : ℝ} (ha : 0 < a) (hab : a ≤ b) :
    ∫ t in Ioi (0 : ℝ), (Real.exp (-(a * t)) - Real.exp (-(b * t))) / t
      = Real.log (b / a) := by
  have hb : 0 < b := lt_of_lt_of_le ha hab
  -- rewrite the integrand as an inner integral over s ∈ Ioc a b
  have hpt : ∀ t ∈ Ioi (0 : ℝ),
      (Real.exp (-(a * t)) - Real.exp (-(b * t))) / t
        = ∫ s in Ioc a b, Real.exp (-(s * t)) := by
    intro t ht
    rw [exp_diff_div_eq_integral (mem_Ioi.mp ht),
      intervalIntegral.integral_of_le hab]
  rw [setIntegral_congr_fun measurableSet_Ioi hpt]
  -- product integrability
  have hmeas : AEStronglyMeasurable
      (Function.uncurry fun t s : ℝ => Real.exp (-(s * t)))
      ((volume.restrict (Ioi (0 : ℝ))).prod (volume.restrict (Ioc a b))) := by
    apply Continuous.aestronglyMeasurable
    fun_prop
  have hint : Integrable
      (Function.uncurry fun t s : ℝ => Real.exp (-(s * t)))
      ((volume.restrict (Ioi (0 : ℝ))).prod (volume.restrict (Ioc a b))) := by
    rw [integrable_prod_iff hmeas]
    constructor
    · filter_upwards with t
      apply Continuous.integrableOn_Ioc
      fun_prop
    · have hcongr : (fun t : ℝ => ∫ s in Ioc a b,
          ‖Real.exp (-(s * t))‖) =ᵐ[volume.restrict (Ioi 0)]
          fun t : ℝ => (Real.exp (-(a * t)) - Real.exp (-(b * t))) / t := by
        filter_upwards [ae_restrict_mem measurableSet_Ioi] with t ht
        simp_rw [norm_eq_abs, abs_of_pos (Real.exp_pos _)]
        rw [← intervalIntegral.integral_of_le hab,
          ← exp_diff_div_eq_integral (mem_Ioi.mp ht)]
      simp only [Function.uncurry_apply_pair]
      rw [integrable_congr hcongr]
      exact integrable_frullani ha hab
  -- swap
  rw [MeasureTheory.integral_integral_swap hint]
  -- inner integral in t, then ∫ 1/s
  have hinner : ∀ s ∈ Ioc a b,
      (∫ t in Ioi (0 : ℝ), Real.exp (-(s * t))) = 1 / s := by
    intro s hs
    exact integral_exp_neg_mul_Ioi' (lt_trans ha hs.1)
  rw [setIntegral_congr_fun measurableSet_Ioc hinner,
    ← intervalIntegral.integral_of_le hab]
  rw [show (fun s : ℝ => 1 / s) = fun s : ℝ => s⁻¹ by
    funext s; rw [one_div]]
  rw [integral_inv (by
    intro h
    rcases h with ⟨h1, h2⟩
    rw [min_eq_left hab] at h1 <;> rw [max_eq_right hab] at h2 <;> linarith)]

end TheoremM
