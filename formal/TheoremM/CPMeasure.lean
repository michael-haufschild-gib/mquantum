/-
Theorem M formalization, P6.4b(b) step (β3), layer 1: the Lévy measure.

The Lévy density of draft §1.4a is

  `levyDensity t = η(t) · e^{−t}/(1−e^{−t})`  on `(0,∞)`,

and `levyMeasure` is the corresponding `withDensity` measure.  The two
main results of this layer:

* `M_eq_exp_neg_sum` / `lintegral_weight` — the exponential-moment
  identity `M k = exp(−∫ (1−e^{−kt}) dλ)`: the moment sequence is the
  Laplace exponent of the Lévy measure.  The proof needs NO infinite
  series: `(1−e^{−kt})·levyDensity t = ∑_{m<k} e^{−(m+1)t}·η(t)` is a
  FINITE geometric identity, each summand integrates by the integer
  Binet identity (β2), and the closed form follows from `M_ratio` by
  induction.
* `levyMeasure_univ` — the total mass is `−log pAtom`: monotone
  convergence sends the weights `1−e^{−kt} ↑ 1`, and
  `−log (M k) ↑ −log pAtom` by `M_tendsto`.  This is where the atom
  weight `p = √(2/e)` of Ψ comes from: `e^{−Λ} = pAtom`.

Integrability is grounded in a new elementary bound,
`eta_le_two_sinh_div`: `η(t) ≤ 2 sinh(t/2)/t`, equivalent after
`u = e^{−t/2}` to `u − u³ ≤ −2 log u`, which follows from
`log u ≤ u − 1` and `u³ − 3u + 2 = (u−1)²(u+2) ≥ 0`.  The resulting
dominator of `e^{−(k+1)t} η(t)` is exactly the Frullani integrand of
(β1), whose integrability is already proved.

File owned by Fable (F135 protocol).
-/
import TheoremM.Binet
import TheoremM.MomentsLimit

namespace TheoremM

open Real MeasureTheory Set Filter
open scoped ENNReal

/-! ## The elementary domination inequality -/

/-- `e^{−t/2} − e^{−3t/2} ≤ t` (unconditionally): with `u = e^{−t/2}` this is
`u − u³ ≤ −2 log u`, from `log u ≤ u − 1` and `(u−1)²(u+2) ≥ 0`. -/
lemma exp_diff_le_self (t : ℝ) :
    Real.exp (-(t / 2)) - Real.exp (-(3 * t / 2)) ≤ t := by
  set u := Real.exp (-(t / 2)) with hu
  have hu0 : 0 < u := Real.exp_pos _
  have hlog : Real.log u = -(t / 2) := by rw [hu, Real.log_exp]
  have hcube : Real.exp (-(3 * t / 2)) = u ^ 3 := by
    rw [hu, ← Real.exp_nat_mul]
    push_cast
    ring_nf
  have h1 : Real.log u ≤ u - 1 := Real.log_le_sub_one_of_pos hu0
  have hfac : 0 ≤ (u - 1) ^ 2 * (u + 2) :=
    mul_nonneg (sq_nonneg _) (by linarith)
  rw [hcube]
  nlinarith [hfac, h1, hlog]

/-- `2 sinh(t/2) e^{−t} ≤ t` (unconditionally). -/
lemma two_sinh_mul_exp_le (t : ℝ) :
    2 * Real.sinh (t / 2) * Real.exp (-t) ≤ t := by
  have h := exp_diff_le_self t
  rw [Real.sinh_eq]
  have e1 : Real.exp (t / 2) * Real.exp (-t) = Real.exp (-(t / 2)) := by
    rw [← Real.exp_add]
    ring_nf
  have e2 : Real.exp (-(t / 2)) * Real.exp (-t) = Real.exp (-(3 * t / 2)) := by
    rw [← Real.exp_add]
    ring_nf
  nlinarith [e1, e2, h]

/-- The domination bound: `η(t) ≤ 2 sinh(t/2)/t` on `(0,∞)`.  (The
difference of the two sides is `t − 2 sinh(t/2)e^{−t} ≥ 0` up to the
positive factor `t(1−e^{−t})`.) -/
lemma eta_le_two_sinh_div {t : ℝ} (ht : 0 < t) :
    eta t ≤ 2 * Real.sinh (t / 2) / t := by
  have hlt : Real.exp (-t) < 1 := by
    rw [Real.exp_lt_one_iff]
    linarith
  have h1 : (0 : ℝ) < 1 - Real.exp (-t) := by linarith
  rw [eta_eq_sinh_form ht, div_le_div_iff₀ (mul_pos ht h1) ht]
  nlinarith [mul_le_mul_of_nonneg_left (two_sinh_mul_exp_le t) ht.le]

/-! ## Integrability of the Binet integrand -/

/-- `η` is measurable. -/
lemma measurable_eta : Measurable eta := by
  unfold eta
  fun_prop

/-- The Binet integrand `e^{−(k+1)t} η(t)` is integrable on `(0,∞)`:
it is dominated by the Frullani integrand of (β1). -/
lemma integrableOn_exp_mul_eta (k : ℕ) :
    IntegrableOn (fun t : ℝ => Real.exp (-(((k : ℝ) + 1) * t)) * eta t)
      (Ioi 0) := by
  have ha : (0 : ℝ) < (k : ℝ) + 1 / 2 := by positivity
  have hab : ((k : ℝ) + 1 / 2) ≤ (k : ℝ) + 3 / 2 := by linarith
  apply Integrable.mono' (integrable_frullani ha hab)
  · exact (((by fun_prop : Measurable fun t : ℝ =>
      Real.exp (-(((k : ℝ) + 1) * t)))).mul measurable_eta).aestronglyMeasurable
  · filter_upwards [ae_restrict_mem measurableSet_Ioi] with t ht
    have ht0 : (0 : ℝ) < t := mem_Ioi.mp ht
    rw [norm_eq_abs,
      abs_of_nonneg (mul_nonneg (Real.exp_pos _).le (eta_nonneg ht0))]
    have hfact : (Real.exp (-(((k : ℝ) + 1 / 2) * t))
        - Real.exp (-(((k : ℝ) + 3 / 2) * t))) / t
        = Real.exp (-(((k : ℝ) + 1) * t)) * (2 * Real.sinh (t / 2) / t) := by
      have e1 : Real.exp (-(((k : ℝ) + 1 / 2) * t))
          = Real.exp (-(((k : ℝ) + 1) * t)) * Real.exp (t / 2) := by
        rw [← Real.exp_add]
        ring_nf
      have e2 : Real.exp (-(((k : ℝ) + 3 / 2) * t))
          = Real.exp (-(((k : ℝ) + 1) * t)) * Real.exp (-(t / 2)) := by
        rw [← Real.exp_add]
        ring_nf
      rw [e1, e2, Real.sinh_eq]
      field_simp
    rw [hfact]
    exact mul_le_mul_of_nonneg_left (eta_le_two_sinh_div ht0)
      (Real.exp_pos _).le

/-! ## The Lévy density -/

/-- The Lévy density of draft §1.4a:
`levyDensity t = η(t)·e^{−t}/(1−e^{−t})` (junk at `t ≤ 0`). -/
noncomputable def levyDensity (t : ℝ) : ℝ :=
  eta t * Real.exp (-t) / (1 - Real.exp (-t))

/-- The Lévy density is nonnegative on `(0,∞)`. -/
lemma levyDensity_nonneg {t : ℝ} (ht : 0 < t) : 0 ≤ levyDensity t := by
  have hlt : Real.exp (-t) < 1 := by
    rw [Real.exp_lt_one_iff]
    linarith
  exact div_nonneg (mul_nonneg (eta_nonneg ht) (Real.exp_pos _).le)
    (by linarith)

/-- The Lévy density is measurable. -/
lemma measurable_levyDensity : Measurable levyDensity := by
  unfold levyDensity
  exact (measurable_eta.mul (by fun_prop)).div (by fun_prop)

/-- The finite geometric identity behind the moment recursion:
`(1 − e^{−kt})·levyDensity t = ∑_{m<k} e^{−(m+1)t} η(t)` for `t > 0`.
No infinite series: `(1−e^{−kt}) = (∑_{m<k} e^{−mt})(1−e^{−t})`. -/
lemma weight_mul_levyDensity_eq_sum {k : ℕ} {t : ℝ} (ht : 0 < t) :
    (1 - Real.exp (-((k : ℝ) * t))) * levyDensity t
      = ∑ m ∈ Finset.range k, Real.exp (-(((m : ℝ) + 1) * t)) * eta t := by
  have hlt : Real.exp (-t) < 1 := by
    rw [Real.exp_lt_one_iff]
    linarith
  have h1 : (0 : ℝ) < 1 - Real.exp (-t) := by linarith
  have hpow : Real.exp (-t) ^ k = Real.exp (-((k : ℝ) * t)) := by
    rw [← Real.exp_nat_mul]
    ring_nf
  have hgeom : 1 - Real.exp (-((k : ℝ) * t))
      = (∑ m ∈ Finset.range k, Real.exp (-t) ^ m) * (1 - Real.exp (-t)) := by
    have h := geom_sum_mul (Real.exp (-t)) k
    rw [← hpow]
    linear_combination h
  have hld : (1 - Real.exp (-t)) * levyDensity t = Real.exp (-t) * eta t := by
    unfold levyDensity
    field_simp
  calc (1 - Real.exp (-((k : ℝ) * t))) * levyDensity t
      = (∑ m ∈ Finset.range k, Real.exp (-t) ^ m)
          * ((1 - Real.exp (-t)) * levyDensity t) := by
        rw [hgeom]
        ring
    _ = (∑ m ∈ Finset.range k, Real.exp (-t) ^ m)
          * (Real.exp (-t) * eta t) := by rw [hld]
    _ = ∑ m ∈ Finset.range k, Real.exp (-(((m : ℝ) + 1) * t)) * eta t := by
        rw [Finset.sum_mul]
        refine Finset.sum_congr rfl fun m _ => ?_
        have hsplit : Real.exp (-t) ^ m * Real.exp (-t)
            = Real.exp (-(((m : ℝ) + 1) * t)) := by
          rw [← Real.exp_nat_mul, ← Real.exp_add]
          ring_nf
        rw [← mul_assoc, hsplit]

/-- Integrability of the weighted density on `(0,∞)`. -/
lemma integrableOn_weight_mul_levyDensity (k : ℕ) :
    IntegrableOn
      (fun t : ℝ => (1 - Real.exp (-((k : ℝ) * t))) * levyDensity t)
      (Ioi 0) := by
  have hsum : IntegrableOn
      (fun t : ℝ => ∑ m ∈ Finset.range k,
        Real.exp (-(((m : ℝ) + 1) * t)) * eta t) (Ioi 0) :=
    integrable_finsetSum _ fun m _ => integrableOn_exp_mul_eta m
  apply hsum.congr
  filter_upwards [ae_restrict_mem measurableSet_Ioi] with t ht
  exact (weight_mul_levyDensity_eq_sum (mem_Ioi.mp ht)).symm

/-! ## The exponential-moment identity -/

/-- The weighted Lévy integral telescopes to the partial Binet sums:
`∫ (1−e^{−kt}) levyDensity = ∑_{m<k} (bSeq m − γ)`. -/
lemma integral_weight_mul_levyDensity (k : ℕ) :
    ∫ t in Ioi (0 : ℝ), (1 - Real.exp (-((k : ℝ) * t))) * levyDensity t
      = ∑ m ∈ Finset.range k, (bSeq m - Real.eulerMascheroniConstant) := by
  rw [setIntegral_congr_fun measurableSet_Ioi
    (fun t ht => weight_mul_levyDensity_eq_sum (mem_Ioi.mp ht))]
  rw [integral_finsetSum _ fun m _ => integrableOn_exp_mul_eta m]
  exact Finset.sum_congr rfl fun m _ => binet_integer_bSeq m

/-- **The moment sequence is the Laplace exponent of the Lévy data**:
`M k = exp(−∑_{m<k} (bSeq m − γ))`, by induction from `M_ratio`. -/
lemma M_eq_exp_neg_sum (k : ℕ) :
    M k = Real.exp
      (-(∑ m ∈ Finset.range k, (bSeq m - Real.eulerMascheroniConstant))) := by
  induction k with
  | zero => simp
  | succ k ih =>
    have hexp : Real.exp (-(bSeq k - Real.eulerMascheroniConstant))
        = ((k : ℝ) + 1 / 2)
          * Real.exp (Real.eulerMascheroniConstant - (harmonic k : ℝ)) := by
      unfold bSeq
      rw [show -(((harmonic k : ℝ) - Real.log ((k : ℝ) + 1 / 2))
            - Real.eulerMascheroniConstant)
          = Real.log ((k : ℝ) + 1 / 2)
            + (Real.eulerMascheroniConstant - (harmonic k : ℝ)) by ring,
        Real.exp_add,
        Real.exp_log (show (0 : ℝ) < (k : ℝ) + 1 / 2 by positivity)]
    rw [M_ratio k, ih, Finset.sum_range_succ, neg_add, Real.exp_add, hexp]
    ring

/-- The partial Binet sums in closed form: `∑_{m<k}(bSeq m − γ) = −log M k`. -/
lemma sum_bSeq_eq_neg_log_M (k : ℕ) :
    ∑ m ∈ Finset.range k, (bSeq m - Real.eulerMascheroniConstant)
      = -Real.log (M k) := by
  rw [M_eq_exp_neg_sum, Real.log_exp]
  ring

/-- The partial Binet sums are uniformly below `−log pAtom`
(`M k > pAtom`, `M_gt_pAtom`). -/
lemma sum_bSeq_lt_neg_log_pAtom (k : ℕ) :
    ∑ m ∈ Finset.range k, (bSeq m - Real.eulerMascheroniConstant)
      < -Real.log pAtom := by
  rw [sum_bSeq_eq_neg_log_M]
  have h := Real.log_lt_log pAtom_pos (M_gt_pAtom k)
  linarith

/-! ## The Lévy measure -/

/-- The Lévy measure `λ` of draft §1.4a: density `levyDensity` against
Lebesgue measure on `(0,∞)`. -/
noncomputable def levyMeasure : Measure ℝ :=
  (volume.restrict (Ioi 0)).withDensity fun t =>
    ENNReal.ofReal (levyDensity t)

/-- The weighted lintegrals of the Lévy measure, at the restrict level:
`∫⁻ (1−e^{−kt}) dλ = −log M k`. -/
lemma lintegral_weight_levyMeasure (k : ℕ) :
    ∫⁻ t, ENNReal.ofReal (1 - Real.exp (-((k : ℝ) * t))) ∂levyMeasure
      = ENNReal.ofReal (-Real.log (M k)) := by
  have hnn : 0 ≤ᵐ[volume.restrict (Ioi (0 : ℝ))]
      fun t => (1 - Real.exp (-((k : ℝ) * t))) * levyDensity t := by
    filter_upwards [ae_restrict_mem measurableSet_Ioi] with t ht
    have ht0 : (0 : ℝ) < t := mem_Ioi.mp ht
    have hk : Real.exp (-((k : ℝ) * t)) ≤ 1 := by
      rw [Real.exp_le_one_iff, neg_nonpos]
      positivity
    exact mul_nonneg (by linarith) (levyDensity_nonneg ht0)
  have hcongr : (fun t => ENNReal.ofReal (levyDensity t)
        * ENNReal.ofReal (1 - Real.exp (-((k : ℝ) * t))))
      =ᵐ[volume.restrict (Ioi (0 : ℝ))]
      fun t => ENNReal.ofReal
        ((1 - Real.exp (-((k : ℝ) * t))) * levyDensity t) := by
    filter_upwards [ae_restrict_mem measurableSet_Ioi] with t ht
    rw [← ENNReal.ofReal_mul (levyDensity_nonneg (mem_Ioi.mp ht)), mul_comm]
  unfold levyMeasure
  rw [lintegral_withDensity_eq_lintegral_mul _
    measurable_levyDensity.ennreal_ofReal (by fun_prop)]
  simp only [Pi.mul_apply]
  rw [lintegral_congr_ae hcongr,
    ← ofReal_integral_eq_lintegral_ofReal
      (integrableOn_weight_mul_levyDensity k) hnn,
    integral_weight_mul_levyDensity k, sum_bSeq_eq_neg_log_M k]

/-- **The total Lévy mass is `−log pAtom`**: monotone convergence along
the weights `1−e^{−kt} ↑ 1` plus `−log (M k) → −log pAtom` (`M_tendsto`).
This is the source of the atom weight `p = √(2/e)` in Ψ: the compound-
Poisson normalisation `e^{−Λ}` equals `pAtom`. -/
lemma levyMeasure_univ :
    levyMeasure Set.univ = ENNReal.ofReal (-Real.log pAtom) := by
  have hae : ∀ᵐ t ∂levyMeasure, t ∈ Ioi (0 : ℝ) :=
    (withDensity_absolutelyContinuous _ _).ae_le
      (ae_restrict_mem measurableSet_Ioi)
  have hmeas : ∀ k : ℕ, AEMeasurable
      (fun t : ℝ => ENNReal.ofReal (1 - Real.exp (-((k : ℝ) * t))))
      levyMeasure :=
    fun k => (by fun_prop : Measurable fun t : ℝ =>
      ENNReal.ofReal (1 - Real.exp (-((k : ℝ) * t)))).aemeasurable
  have hmono : ∀ᵐ t ∂levyMeasure, Monotone
      (fun k : ℕ => ENNReal.ofReal (1 - Real.exp (-((k : ℝ) * t)))) := by
    filter_upwards [hae] with t ht
    intro i j hij
    have ht0 : (0 : ℝ) < t := mem_Ioi.mp ht
    apply ENNReal.ofReal_le_ofReal
    have hcast : (i : ℝ) ≤ (j : ℝ) := Nat.cast_le.mpr hij
    have hmul : (i : ℝ) * t ≤ (j : ℝ) * t :=
      mul_le_mul_of_nonneg_right hcast ht0.le
    have := Real.exp_le_exp.mpr (neg_le_neg hmul)
    linarith
  have hlim : ∀ᵐ t ∂levyMeasure,
      (⨆ k : ℕ, ENNReal.ofReal (1 - Real.exp (-((k : ℝ) * t)))) = 1 := by
    filter_upwards [hae, hmono] with t ht hm
    have ht0 : (0 : ℝ) < t := mem_Ioi.mp ht
    have hexp : Tendsto (fun k : ℕ => Real.exp (-((k : ℝ) * t))) atTop
        (nhds 0) := by
      have hr1 : |Real.exp (-t)| < 1 := by
        rw [abs_of_pos (Real.exp_pos _), Real.exp_lt_one_iff]
        linarith
      apply (tendsto_pow_atTop_nhds_zero_of_abs_lt_one hr1).congr
      intro k
      rw [← Real.exp_nat_mul]
      ring_nf
    have htend : Tendsto
        (fun k : ℕ => ENNReal.ofReal (1 - Real.exp (-((k : ℝ) * t)))) atTop
        (nhds (ENNReal.ofReal 1)) := by
      apply (ENNReal.continuous_ofReal.tendsto _).comp
      simpa using tendsto_const_nhds.sub hexp
    have huniq := tendsto_nhds_unique (tendsto_atTop_iSup hm) htend
    rw [huniq, ENNReal.ofReal_one]
  calc levyMeasure Set.univ
      = ∫⁻ _, 1 ∂levyMeasure := lintegral_one.symm
    _ = ∫⁻ t, (⨆ k : ℕ, ENNReal.ofReal (1 - Real.exp (-((k : ℝ) * t))))
          ∂levyMeasure :=
        lintegral_congr_ae (hlim.mono fun t ht => ht.symm)
    _ = ⨆ k : ℕ, ∫⁻ t,
          ENNReal.ofReal (1 - Real.exp (-((k : ℝ) * t))) ∂levyMeasure :=
        lintegral_iSup' hmeas hmono
    _ = ⨆ k : ℕ, ENNReal.ofReal (-Real.log (M k)) := by
        exact iSup_congr fun k => lintegral_weight_levyMeasure k
    _ = ENNReal.ofReal (-Real.log pAtom) := by
        have hmono2 : Monotone
            fun k : ℕ => ENNReal.ofReal (-Real.log (M k)) := by
          intro i j hij
          apply ENNReal.ofReal_le_ofReal
          have hle : M j ≤ M i := M_strictAnti.antitone hij
          have := Real.log_le_log (M_pos j) hle
          linarith
        have htend2 : Tendsto
            (fun k : ℕ => ENNReal.ofReal (-Real.log (M k))) atTop
            (nhds (ENNReal.ofReal (-Real.log pAtom))) := by
          apply (ENNReal.continuous_ofReal.tendsto _).comp
          have hlog : Tendsto (fun k : ℕ => Real.log (M k)) atTop
              (nhds (Real.log pAtom)) :=
            ((Real.continuousAt_log pAtom_pos.ne').tendsto).comp M_tendsto
          simpa using hlog.neg
        exact tendsto_nhds_unique (tendsto_atTop_iSup hmono2) htend2

/-- The Lévy measure is finite. -/
instance : IsFiniteMeasure levyMeasure :=
  ⟨by rw [levyMeasure_univ]; exact ENNReal.ofReal_lt_top⟩

/-! ## Convolution powers -/

/-- The `n`-fold additive convolution power: `convPow μ 0 = δ₀`,
`convPow μ (n+1) = convPow μ n ∗ μ`. -/
noncomputable def convPow (μ : Measure ℝ) : ℕ → Measure ℝ
  | 0 => Measure.dirac 0
  | n + 1 => (convPow μ n) ∗ μ

@[simp] lemma convPow_zero (μ : Measure ℝ) :
    convPow μ 0 = Measure.dirac 0 := rfl

@[simp] lemma convPow_succ (μ : Measure ℝ) (n : ℕ) :
    convPow μ (n + 1) = (convPow μ n) ∗ μ := rfl

instance convPow_sfinite (μ : Measure ℝ) [SFinite μ] (n : ℕ) :
    SFinite (convPow μ n) := by
  induction n with
  | zero => rw [convPow_zero]; infer_instance
  | succ n ih =>
    haveI := ih
    rw [convPow_succ]
    infer_instance

instance convPow_isFiniteMeasure (μ : Measure ℝ) [IsFiniteMeasure μ]
    (n : ℕ) : IsFiniteMeasure (convPow μ n) := by
  induction n with
  | zero => rw [convPow_zero]; infer_instance
  | succ n ih =>
    haveI := ih
    rw [convPow_succ]
    infer_instance

/-! ## Concentration on the half-line -/

/-- Convolution preserves vanishing on the negative half-line.
(Hand-rolled: mathlib has no support lemma for `Measure.conv`.) -/
lemma conv_Iio_zero_eq_zero {μ ν : Measure ℝ} [SFinite ν]
    (hμ : μ (Iio 0) = 0) (hν : ν (Iio 0) = 0) :
    (μ ∗ ν) (Iio 0) = 0 := by
  have hind : Measurable ((Iio (0 : ℝ)).indicator (1 : ℝ → ℝ≥0∞)) :=
    measurable_one.indicator measurableSet_Iio
  rw [← lintegral_indicator_one measurableSet_Iio,
    Measure.lintegral_conv hind]
  have hae : ∀ᵐ x ∂μ, ¬ x < 0 := by
    rw [ae_iff]
    simp only [not_not]
    exact hμ
  have hzero : ∀ᵐ x ∂μ,
      (∫⁻ y, (Iio (0 : ℝ)).indicator (1 : ℝ → ℝ≥0∞) (x + y) ∂ν)
        = 0 := by
    filter_upwards [hae] with x hx
    refine le_antisymm ?_ zero_le'
    calc ∫⁻ y, (Iio (0 : ℝ)).indicator (1 : ℝ → ℝ≥0∞) (x + y) ∂ν
        ≤ ∫⁻ y, (Iio (0 : ℝ)).indicator (1 : ℝ → ℝ≥0∞) y ∂ν := by
          apply lintegral_mono
          intro y
          simp only [Set.indicator_apply, mem_Iio, Pi.one_apply]
          split_ifs with h1 h2
          · exact le_rfl
          · exact absurd (by linarith [not_lt.mp hx] : y < 0) h2
          · exact zero_le'
          · exact zero_le'
      _ = ν (Iio 0) := lintegral_indicator_one measurableSet_Iio
      _ = 0 := hν
  rw [lintegral_congr_ae hzero, lintegral_zero]

/-- The Lévy measure vanishes on the negative half-line. -/
lemma levyMeasure_Iio_zero : levyMeasure (Iio 0) = 0 := by
  unfold levyMeasure
  rw [withDensity_apply _ measurableSet_Iio,
    Measure.restrict_restrict measurableSet_Iio]
  have hdisj : Iio (0 : ℝ) ∩ Ioi 0 = ∅ := by
    ext x
    simp only [mem_inter_iff, mem_Iio, mem_Ioi, mem_empty_iff_false,
      iff_false, not_and]
    intro h
    linarith
  rw [hdisj]
  simp

/-- All convolution powers of the Lévy measure vanish on the negative
half-line. -/
lemma convPow_levyMeasure_Iio_zero (n : ℕ) :
    convPow levyMeasure n (Iio 0) = 0 := by
  induction n with
  | zero =>
    rw [convPow_zero, Measure.dirac_apply' _ measurableSet_Iio]
    simp
  | succ n ih =>
    rw [convPow_succ]
    exact conv_Iio_zero_eq_zero ih levyMeasure_Iio_zero

/-! ## Exponential moments of the convolution powers -/

/-- Exponential moments of the Lévy measure:
`∫⁻ e^{−kt} dλ = log(M k) − log pAtom` — the complement of the weighted
lintegral against the total mass. -/
lemma lintegral_exp_levyMeasure (k : ℕ) :
    ∫⁻ t, ENNReal.ofReal (Real.exp (-((k : ℝ) * t))) ∂levyMeasure
      = ENNReal.ofReal (Real.log (M k) - Real.log pAtom) := by
  have hae : ∀ᵐ t ∂levyMeasure, t ∈ Ioi (0 : ℝ) :=
    (withDensity_absolutelyContinuous _ _).ae_le
      (ae_restrict_mem measurableSet_Ioi)
  have hsplit : (∫⁻ t, ENNReal.ofReal (Real.exp (-((k : ℝ) * t)))
        ∂levyMeasure)
      + ∫⁻ t, ENNReal.ofReal (1 - Real.exp (-((k : ℝ) * t))) ∂levyMeasure
      = ENNReal.ofReal (-Real.log pAtom) := by
    rw [← lintegral_add_left (by fun_prop), ← levyMeasure_univ,
      ← lintegral_one]
    apply lintegral_congr_ae
    filter_upwards [hae] with t ht
    have ht0 : (0 : ℝ) < t := mem_Ioi.mp ht
    have hk1 : Real.exp (-((k : ℝ) * t)) ≤ 1 := by
      rw [Real.exp_le_one_iff, neg_nonpos]
      positivity
    rw [← ENNReal.ofReal_add (Real.exp_pos _).le (by linarith),
      ← ENNReal.ofReal_one]
    congr 1
    ring
  rw [lintegral_weight_levyMeasure k] at hsplit
  have hM1 : M k ≤ 1 := by
    rcases Nat.eq_zero_or_pos k with hk | hk
    · rw [hk, M_zero]
    · rw [← M_zero]
      exact (M_strictAnti hk).le
  have hMp : pAtom < M k := M_gt_pAtom k
  have hlogM : Real.log (M k) ≤ 0 := Real.log_nonpos (M_pos k).le hM1
  have hlogp : Real.log pAtom < Real.log (M k) :=
    Real.log_lt_log pAtom_pos hMp
  have hrhs : ENNReal.ofReal (-Real.log pAtom)
      = ENNReal.ofReal (Real.log (M k) - Real.log pAtom)
        + ENNReal.ofReal (-Real.log (M k)) := by
    rw [← ENNReal.ofReal_add (by linarith) (by linarith)]
    congr 1
    ring
  rw [hrhs] at hsplit
  exact (ENNReal.add_left_inj ENNReal.ofReal_ne_top).mp hsplit

/-- Exponential moments of the convolution powers:
`∫⁻ e^{−ks} d(λ^{∗n}) = (log(M k) − log pAtom)^n`. -/
lemma lintegral_exp_convPow (k n : ℕ) :
    ∫⁻ s, ENNReal.ofReal (Real.exp (-((k : ℝ) * s)))
        ∂(convPow levyMeasure n)
      = ENNReal.ofReal (Real.log (M k) - Real.log pAtom) ^ n := by
  induction n with
  | zero =>
    rw [convPow_zero, lintegral_dirac' _ (by fun_prop)]
    simp
  | succ n ih =>
    rw [convPow_succ, Measure.lintegral_conv (by fun_prop)]
    have hsplit : ∀ x y : ℝ,
        ENNReal.ofReal (Real.exp (-((k : ℝ) * (x + y))))
          = ENNReal.ofReal (Real.exp (-((k : ℝ) * x)))
            * ENNReal.ofReal (Real.exp (-((k : ℝ) * y))) := by
      intro x y
      rw [← ENNReal.ofReal_mul (Real.exp_pos _).le, ← Real.exp_add]
      ring_nf
    simp_rw [hsplit,
      lintegral_const_mul' _ _ ENNReal.ofReal_ne_top,
      lintegral_exp_levyMeasure k,
      lintegral_mul_const' _ _ ENNReal.ofReal_ne_top, ih]
    ring

/-! ## The compound-Poisson measure -/

/-- The compound-Poisson measure of draft §1.4a:
`pAtom · ∑_n (1/n!) λ^{∗n}` — the normalisation is `e^{−Λ} = pAtom`
since the total Lévy mass is `Λ = −log pAtom` (`levyMeasure_univ`). -/
noncomputable def cpMeasure : Measure ℝ :=
  ENNReal.ofReal pAtom
    • Measure.sum fun n => (n.factorial : ℝ≥0∞)⁻¹ • convPow levyMeasure n

/-- The `ℝ≥0∞` exponential series at a nonnegative real. -/
lemma tsum_inv_factorial_mul_ofReal_pow {x : ℝ} (hx : 0 ≤ x) :
    ∑' n : ℕ, (n.factorial : ℝ≥0∞)⁻¹ * ENNReal.ofReal x ^ n
      = ENNReal.ofReal (Real.exp x) := by
  have hterm : ∀ n : ℕ, (n.factorial : ℝ≥0∞)⁻¹ * ENNReal.ofReal x ^ n
      = ENNReal.ofReal (x ^ n / n.factorial) := by
    intro n
    rw [ENNReal.ofReal_div_of_pos (Nat.cast_pos.mpr n.factorial_pos),
      ENNReal.ofReal_pow hx, ENNReal.ofReal_natCast, div_eq_mul_inv,
      mul_comm]
  simp_rw [hterm]
  rw [← ENNReal.ofReal_tsum_of_nonneg (fun n => by positivity)
    (Real.summable_pow_div_factorial x)]
  congr 1
  rw [Real.exp_eq_exp_ℝ]
  exact (congrFun NormedSpace.exp_eq_tsum_div x).symm

/-- **The moments of the compound-Poisson measure are the M sequence**:
`∫⁻ e^{−ks} d(cpMeasure) = M k`.  At `k = 0` this is the probability
normalisation `cpMeasure(ℝ) = 1`. -/
lemma lintegral_exp_cpMeasure (k : ℕ) :
    ∫⁻ s, ENNReal.ofReal (Real.exp (-((k : ℝ) * s))) ∂cpMeasure
      = ENNReal.ofReal (M k) := by
  have hL : 0 ≤ Real.log (M k) - Real.log pAtom := by
    have := Real.log_lt_log pAtom_pos (M_gt_pAtom k)
    linarith
  unfold cpMeasure
  rw [lintegral_smul_measure, lintegral_sum_measure]
  simp_rw [lintegral_smul_measure, lintegral_exp_convPow, smul_eq_mul]
  rw [tsum_inv_factorial_mul_ofReal_pow hL,
    ← ENNReal.ofReal_mul pAtom_pos.le]
  congr 1
  rw [Real.exp_sub, Real.exp_log (M_pos k), Real.exp_log pAtom_pos]
  rw [mul_comm]
  exact div_mul_cancel₀ _ pAtom_pos.ne'

/-- The compound-Poisson measure is a probability measure
(the `k = 0` moment). -/
instance : IsProbabilityMeasure cpMeasure := by
  constructor
  have h := lintegral_exp_cpMeasure 0
  simpa using h

/-- The compound-Poisson measure vanishes on the negative half-line. -/
lemma cpMeasure_Iio_zero : cpMeasure (Iio 0) = 0 := by
  unfold cpMeasure
  rw [Measure.smul_apply, Measure.sum_apply _ measurableSet_Iio]
  simp [Measure.smul_apply, convPow_levyMeasure_Iio_zero]

end TheoremM
