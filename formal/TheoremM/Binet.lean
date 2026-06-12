/-
Theorem M formalization, P6.4b(b) step (β2): the integer Binet identity

  `∫_{(0,∞)} e^{−(k+1)t} η(t) dt = H_k − γ − log(k + 1/2)`,

where `η(t) = e^{t/2}/t − 1/(1−e^{−t})` is the Lévy-density numerator
from draft §1.4a.  In the notation of `Moments.lean` the right-hand
side is `bSeq k − γ`: the Binet integral measures how far the
companion sequence sits above its limit.

Proof: telescoping decomposition under the integral.  For `t > 0`,

  `e^{−(k+1)t} η(t) = ∑_{n≥0} binetTerm k n t`,
  `binetTerm k n t = (e^{−(k+n+1/2)t} − e^{−(k+n+3/2)t})/t − e^{−(k+n+1)t}`,

each term is nonnegative (it equals `e^{−(k+n+1)t}·(2 sinh(t/2) − t)/t`),
each integrates to `log((k+n+3/2)/(k+n+1/2)) − 1/(k+n+1)` by
`frullani_exp`, and the partial sums of the integrals telescope to
`bSeq k − bSeq (k+N) → bSeq k − γ`.  Positivity makes the sum/integral
swap a Tonelli statement.

File owned by Fable (F135 protocol).
-/
import TheoremM.Frullani
import TheoremM.Moments

namespace TheoremM

open Real MeasureTheory Set Filter

/-- The Binet/Lévy density numerator `η(t) = e^{t/2}/t − 1/(1−e^{−t})`
(draft §1.4a).  Junk values at `t ≤ 0` (division by zero) are
irrelevant: every integral below is over `(0,∞)`. -/
noncomputable def eta (t : ℝ) : ℝ :=
  Real.exp (t / 2) / t - 1 / (1 - Real.exp (-t))

/-- Cancellation-safe form of `η` (draft §1.4a):
`η(t) = (2 sinh(t/2) − t)/(t(1−e^{−t}))` for `t > 0`. -/
lemma eta_eq_sinh_form {t : ℝ} (ht : 0 < t) :
    eta t = (2 * Real.sinh (t / 2) - t) / (t * (1 - Real.exp (-t))) := by
  have hlt : Real.exp (-t) < 1 := by
    rw [Real.exp_lt_one_iff]
    linarith
  have h1 : (0 : ℝ) < 1 - Real.exp (-t) := by linarith
  have hmul : Real.exp (t / 2) * Real.exp (-t) = Real.exp (-(t / 2)) := by
    rw [← Real.exp_add]
    ring_nf
  unfold eta
  rw [Real.sinh_eq]
  field_simp
  nlinarith [hmul]

/-- `η ≥ 0` on `(0,∞)`: the numerator is `2 sinh(t/2) − t ≥ 0`. -/
lemma eta_nonneg {t : ℝ} (ht : 0 < t) : 0 ≤ eta t := by
  rw [eta_eq_sinh_form ht]
  have hsinh : t ≤ 2 * Real.sinh (t / 2) := by
    have := Real.self_lt_sinh_iff.mpr (by positivity : (0 : ℝ) < t / 2)
    linarith
  have hlt : Real.exp (-t) < 1 := by
    rw [Real.exp_lt_one_iff]
    linarith
  have h1 : (0 : ℝ) < 1 - Real.exp (-t) := by linarith
  exact div_nonneg (by linarith) (by positivity)

/-- The `n`-th telescoping term of the Binet integrand at integer
shift `k`: a Frullani slice minus a pure exponential. -/
noncomputable def binetTerm (k n : ℕ) (t : ℝ) : ℝ :=
  (Real.exp (-(((k : ℝ) + n + 1 / 2) * t))
      - Real.exp (-(((k : ℝ) + n + 3 / 2) * t))) / t
    - Real.exp (-(((k : ℝ) + n + 1) * t))

/-- Factored form: `binetTerm k n t = e^{−(k+n+1)t}·(2 sinh(t/2) − t)/t`. -/
lemma binetTerm_eq {k n : ℕ} {t : ℝ} (ht : 0 < t) :
    binetTerm k n t
      = Real.exp (-(((k : ℝ) + n + 1) * t))
          * ((2 * Real.sinh (t / 2) - t) / t) := by
  unfold binetTerm
  have e1 : Real.exp (-(((k : ℝ) + n + 1 / 2) * t))
      = Real.exp (-(((k : ℝ) + n + 1) * t)) * Real.exp (t / 2) := by
    rw [← Real.exp_add]
    ring_nf
  have e2 : Real.exp (-(((k : ℝ) + n + 3 / 2) * t))
      = Real.exp (-(((k : ℝ) + n + 1) * t)) * Real.exp (-(t / 2)) := by
    rw [← Real.exp_add]
    ring_nf
  rw [e1, e2, Real.sinh_eq]
  field_simp

/-- Each telescoping term is nonnegative on `(0,∞)`. -/
lemma binetTerm_nonneg {k n : ℕ} {t : ℝ} (ht : 0 < t) :
    0 ≤ binetTerm k n t := by
  rw [binetTerm_eq ht]
  have hsinh : t ≤ 2 * Real.sinh (t / 2) := by
    have := Real.self_lt_sinh_iff.mpr (by positivity : (0 : ℝ) < t / 2)
    linarith
  exact mul_nonneg (Real.exp_pos _).le (div_nonneg (by linarith) ht.le)

/-- Each telescoping term is integrable on `(0,∞)`: it is a Frullani
integrand minus an integrable exponential. -/
lemma integrable_binetTerm (k n : ℕ) :
    IntegrableOn (binetTerm k n) (Ioi 0) := by
  have ha : (0 : ℝ) < (k : ℝ) + n + 1 / 2 := by positivity
  have hab : ((k : ℝ) + n + 1 / 2) ≤ (k : ℝ) + n + 3 / 2 := by linarith
  have h1 := integrable_frullani ha hab
  have h2 := integrableOn_exp_neg_mul (s := (k : ℝ) + n + 1) (by positivity)
  exact h1.sub h2

/-- The value of each term integral, by `frullani_exp` and `∫e^{−st} = 1/s`. -/
lemma integral_binetTerm (k n : ℕ) :
    ∫ t in Ioi (0 : ℝ), binetTerm k n t
      = Real.log (((k : ℝ) + n + 3 / 2) / ((k : ℝ) + n + 1 / 2))
        - 1 / ((k : ℝ) + n + 1) := by
  have ha : (0 : ℝ) < (k : ℝ) + n + 1 / 2 := by positivity
  have hab : ((k : ℝ) + n + 1 / 2) ≤ (k : ℝ) + n + 3 / 2 := by linarith
  have h1 := integrable_frullani ha hab
  have h2 := integrableOn_exp_neg_mul (s := (k : ℝ) + n + 1) (by positivity)
  unfold binetTerm
  rw [integral_sub h1 h2, frullani_exp ha hab,
    integral_exp_neg_mul_Ioi' (by positivity : (0 : ℝ) < (k : ℝ) + n + 1)]

/-- Each term integral is nonnegative (pointwise positivity of the term). -/
lemma integral_binetTerm_nonneg (k n : ℕ) :
    0 ≤ ∫ t in Ioi (0 : ℝ), binetTerm k n t := by
  apply setIntegral_nonneg measurableSet_Ioi
  intro t ht
  exact binetTerm_nonneg (mem_Ioi.mp ht)

/-- The partial sums of the term integrals telescope:
`∑_{n<N} ∫ binetTerm k n = bSeq k − bSeq (k+N)`. -/
lemma sum_integral_binetTerm (k N : ℕ) :
    ∑ n ∈ Finset.range N, ∫ t in Ioi (0 : ℝ), binetTerm k n t
      = bSeq k - bSeq (k + N) := by
  set f : ℕ → ℝ := fun i => Real.log ((k : ℝ) + i + 1 / 2) with hf
  set g : ℕ → ℝ := fun i => (harmonic (k + i) : ℝ) with hg
  have hterm : ∀ n : ℕ, (∫ t in Ioi (0 : ℝ), binetTerm k n t)
      = (f (n + 1) - f n) - (g (n + 1) - g n) := by
    intro n
    rw [integral_binetTerm]
    have harg : ((k : ℝ) + n + 3 / 2) = ((k : ℝ) + ((n + 1 : ℕ) : ℝ) + 1 / 2) := by
      push_cast
      ring
    have hlog : Real.log (((k : ℝ) + n + 3 / 2) / ((k : ℝ) + n + 1 / 2))
        = f (n + 1) - f n := by
      rw [Real.log_div (by positivity) (by positivity), harg]
    have hharm : g (n + 1) - g n = 1 / ((k : ℝ) + n + 1) := by
      simp only [hg]
      rw [← Nat.add_assoc, harmonic_succ]
      push_cast
      ring
    rw [hlog, ← hharm]
  calc ∑ n ∈ Finset.range N, ∫ t in Ioi (0 : ℝ), binetTerm k n t
      = ∑ n ∈ Finset.range N, ((f (n + 1) - f n) - (g (n + 1) - g n)) :=
        Finset.sum_congr rfl fun n _ => hterm n
    _ = (f N - f 0) - (g N - g 0) := by
        rw [Finset.sum_sub_distrib, Finset.sum_range_sub f, Finset.sum_range_sub g]
    _ = bSeq k - bSeq (k + N) := by
        simp only [hf, hg, Nat.cast_zero, add_zero]
        unfold bSeq
        push_cast
        ring

/-- The term integrals sum to `bSeq k − γ`: the partial sums telescope
and `bSeq → γ` (`bSeq_tendsto`). -/
lemma hasSum_integral_binetTerm (k : ℕ) :
    HasSum (fun n => ∫ t in Ioi (0 : ℝ), binetTerm k n t)
      (bSeq k - Real.eulerMascheroniConstant) := by
  rw [hasSum_iff_tendsto_nat_of_nonneg (fun n => integral_binetTerm_nonneg k n)]
  simp_rw [sum_integral_binetTerm]
  have hkn : Tendsto (fun N : ℕ => k + N) atTop atTop :=
    tendsto_atTop_mono (fun n => Nat.le_add_left n k) tendsto_id
  exact (bSeq_tendsto.comp hkn).const_sub (bSeq k)

/-- Pointwise geometric resummation on `(0,∞)`:
`∑_n binetTerm k n t = e^{−(k+1)t} η(t)`. -/
lemma tsum_binetTerm {k : ℕ} {t : ℝ} (ht : 0 < t) :
    ∑' n, binetTerm k n t
      = Real.exp (-(((k : ℝ) + 1) * t)) * eta t := by
  have hr0 : (0 : ℝ) ≤ Real.exp (-t) := (Real.exp_pos _).le
  have hr1 : Real.exp (-t) < 1 := by
    rw [Real.exp_lt_one_iff]
    linarith
  have hterm : ∀ n : ℕ, binetTerm k n t
      = Real.exp (-t) ^ n
          * (Real.exp (-(((k : ℝ) + 1) * t))
              * ((2 * Real.sinh (t / 2) - t) / t)) := by
    intro n
    rw [binetTerm_eq ht]
    have hsplit : Real.exp (-(((k : ℝ) + n + 1) * t))
        = Real.exp (-t) ^ n * Real.exp (-(((k : ℝ) + 1) * t)) := by
      rw [← Real.exp_nat_mul, ← Real.exp_add]
      ring_nf
    rw [hsplit]
    ring
  simp_rw [hterm]
  rw [tsum_mul_right, tsum_geometric_of_lt_one hr0 hr1, eta_eq_sinh_form ht]
  have h1 : (0 : ℝ) < 1 - Real.exp (-t) := by linarith
  field_simp

/-- **The integer Binet identity**, `bSeq` form: the Binet integral at
shift `k+1` measures the distance of `bSeq k` above its limit `γ`. -/
theorem binet_integer_bSeq (k : ℕ) :
    ∫ t in Ioi (0 : ℝ), Real.exp (-(((k : ℝ) + 1) * t)) * eta t
      = bSeq k - Real.eulerMascheroniConstant := by
  have hswap : ∫ t in Ioi (0 : ℝ), (∑' n, binetTerm k n t)
      = ∑' n, ∫ t in Ioi (0 : ℝ), binetTerm k n t := by
    refine (integral_tsum_of_summable_integral_norm
      (fun n => integrable_binetTerm k n) ?_).symm
    have hnorm : ∀ n : ℕ, (∫ t in Ioi (0 : ℝ), ‖binetTerm k n t‖)
        = ∫ t in Ioi (0 : ℝ), binetTerm k n t := by
      intro n
      apply integral_congr_ae
      filter_upwards [ae_restrict_mem measurableSet_Ioi] with t ht
      rw [norm_eq_abs, abs_of_nonneg (binetTerm_nonneg (mem_Ioi.mp ht))]
    simp_rw [hnorm]
    exact (hasSum_integral_binetTerm k).summable
  have hcongr : ∫ t in Ioi (0 : ℝ), Real.exp (-(((k : ℝ) + 1) * t)) * eta t
      = ∫ t in Ioi (0 : ℝ), (∑' n, binetTerm k n t) := by
    apply setIntegral_congr_fun measurableSet_Ioi
    intro t ht
    exact (tsum_binetTerm (mem_Ioi.mp ht)).symm
  rw [hcongr, hswap, (hasSum_integral_binetTerm k).tsum_eq]

/-- **The integer Binet identity** (draft §1.4a at integer arguments):
`∫_{(0,∞)} e^{−(k+1)t} η(t) dt = H_k − γ − log(k + 1/2)`. -/
theorem binet_integer (k : ℕ) :
    ∫ t in Ioi (0 : ℝ), Real.exp (-(((k : ℝ) + 1) * t)) * eta t
      = (harmonic k : ℝ) - Real.eulerMascheroniConstant
        - Real.log ((k : ℝ) + 1 / 2) := by
  rw [binet_integer_bSeq]
  unfold bSeq
  ring

end TheoremM
