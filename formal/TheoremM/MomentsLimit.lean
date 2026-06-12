/-
Theorem M formalization, P6.4b(a): the Stirling limit `M → pAtom`.

Part 1 (this revision):
* `log_lt_sub_sq`, `log_midpoint_err` — elementary log bounds.
* `bSeq_le_gamma_add_psi` — quantitative tail `bSeq k ≤ γ + ψ k`,
  `ψ k = 1/(12(k+1/2)²)`, for `k ≥ 2` (telescoping against the
  midpoint error, mirroring `bSeq_strictAnti`).
* `USeq_tendsto` — `k(H_k − γ − log k) → 1/2` by squeeze.

Part 2 (next revision): the Stirling form `M k = (s₂ₖ/sₖ)·√2·exp(−Uₖ)`
and `M_tendsto`.

File owned by Fable (F135 protocol).
-/
import TheoremM.Moments

namespace TheoremM

open Real Filter Stirling

/-! ## Elementary log bounds -/

private lemma hasDerivAt_log_one_add {t : ℝ} (ht : -1 < t) :
    HasDerivAt (fun s : ℝ => Real.log (1 + s)) (1 / (1 + t)) t := by
  have h1t : (1 : ℝ) + t ≠ 0 := by linarith
  have h := (Real.hasDerivAt_log h1t).comp t ((hasDerivAt_id t).const_add 1)
  simpa using h

private lemma hasDerivAt_two_frac {t : ℝ} (ht : -2 < t) :
    HasDerivAt (fun s : ℝ => 2 * s / (2 + s)) (4 / (2 + t) ^ 2) t := by
  have h2t : (2 : ℝ) + t ≠ 0 := by linarith
  have hnum : HasDerivAt (fun s : ℝ => 2 * s) 2 t := by
    simpa using (hasDerivAt_id t).const_mul 2
  have hden : HasDerivAt (fun s : ℝ => 2 + s) 1 t :=
    (hasDerivAt_id t).const_add 2
  have h := hnum.div hden h2t
  convert h using 1
  field_simp
  ring

/-- `x − x²/2 < log(1+x)` for `x > 0`. -/
lemma log_lt_sub_sq {x : ℝ} (hx : 0 < x) :
    x - x ^ 2 / 2 < Real.log (1 + x) := by
  set g : ℝ → ℝ := fun t => Real.log (1 + t) - t + t ^ 2 / 2 with hg
  have hder : ∀ t : ℝ, 0 < t → HasDerivAt g (1 / (1 + t) - 1 + t) t := by
    intro t ht
    have hsq : HasDerivAt (fun s : ℝ => s ^ 2 / 2) t t := by
      have h := ((hasDerivAt_id t).pow 2).div_const 2
      simpa using h
    exact ((hasDerivAt_log_one_add (by linarith)).sub (hasDerivAt_id t)).add hsq
  have hderiv : ∀ t ∈ interior (Set.Ici (0 : ℝ)), 0 < deriv g t := by
    intro t ht
    rw [interior_Ici] at ht
    rw [(hder t ht).deriv]
    have ht0 : (0 : ℝ) < t := ht
    have h1t : (1 : ℝ) + t ≠ 0 := ne_of_gt (by linarith)
    have key : 1 / (1 + t) - 1 + t = t ^ 2 / (1 + t) := by
      field_simp
      ring
    rw [key]
    exact div_pos (pow_pos ht0 2) (by linarith)
  have hcont : ContinuousOn g (Set.Ici (0 : ℝ)) := by
    have : ∀ t ∈ Set.Ici (0 : ℝ), (1 : ℝ) + t ≠ 0 := by
      intro t ht h
      have h0 : (0 : ℝ) ≤ t := ht
      linarith
    fun_prop (disch := assumption)
  have hmono : StrictMonoOn g (Set.Ici (0 : ℝ)) :=
    strictMonoOn_of_deriv_pos (convex_Ici 0) hcont hderiv
  have h0 : g 0 = 0 := by simp [hg]
  have hgt := hmono (Set.left_mem_Ici) (Set.mem_Ici.mpr hx.le) hx
  rw [h0] at hgt
  have : 0 < Real.log (1 + x) - x + x ^ 2 / 2 := hgt
  linarith

/-- Midpoint error bound: `log(1+x) − 2x/(2+x) ≤ x³/12` for `x ≥ 0`. -/
lemma log_midpoint_err {x : ℝ} (hx : 0 ≤ x) :
    Real.log (1 + x) - 2 * x / (2 + x) ≤ x ^ 3 / 12 := by
  set g : ℝ → ℝ := fun t => t ^ 3 / 12 - Real.log (1 + t) + 2 * t / (2 + t)
    with hg
  have hder : ∀ t : ℝ, 0 < t →
      HasDerivAt g (t ^ 2 / 4 - 1 / (1 + t) + 4 / (2 + t) ^ 2) t := by
    intro t ht
    have hcube : HasDerivAt (fun s : ℝ => s ^ 3 / 12) (t ^ 2 / 4) t := by
      have h := ((hasDerivAt_id t).pow 3).div_const 12
      convert h using 1
      simp
      ring
    exact (hcube.sub (hasDerivAt_log_one_add (by linarith))).add
      (hasDerivAt_two_frac (by linarith))
  have hderiv : ∀ t ∈ interior (Set.Ici (0 : ℝ)), 0 ≤ deriv g t := by
    intro t ht
    rw [interior_Ici] at ht
    rw [(hder t ht).deriv]
    have ht0 : (0 : ℝ) < t := ht
    have h1t : (1 : ℝ) + t ≠ 0 := ne_of_gt (by linarith)
    have h2t : (2 : ℝ) + t ≠ 0 := ne_of_gt (by linarith)
    have key : t ^ 2 / 4 - 1 / (1 + t) + 4 / (2 + t) ^ 2
        = t ^ 3 * (t ^ 2 + 5 * t + 8) / (4 * (1 + t) * (2 + t) ^ 2) := by
      field_simp
      ring
    rw [key]
    apply div_nonneg
    · nlinarith [pow_pos ht0 3]
    · nlinarith
  have hcont : ContinuousOn g (Set.Ici (0 : ℝ)) := by
    have h1 : ∀ t ∈ Set.Ici (0 : ℝ), (1 : ℝ) + t ≠ 0 := by
      intro t ht h
      have h0 : (0 : ℝ) ≤ t := ht
      linarith
    have h2 : ∀ t ∈ Set.Ici (0 : ℝ), (2 : ℝ) + t ≠ 0 := by
      intro t ht h
      have h0 : (0 : ℝ) ≤ t := ht
      linarith
    fun_prop (disch := assumption)
  have hmono : MonotoneOn g (Set.Ici (0 : ℝ)) := by
    apply monotoneOn_of_deriv_nonneg (convex_Ici 0) hcont
    · intro t ht
      rw [interior_Ici] at ht
      exact (hder t ht).differentiableAt.differentiableWithinAt
    · exact hderiv
  rcases eq_or_lt_of_le hx with rfl | hx0
  · simp
  · have h0 : g 0 = 0 := by simp [hg]
    have hge := hmono (Set.left_mem_Ici) (Set.mem_Ici.mpr hx) hx
    rw [h0] at hge
    have : 0 ≤ x ^ 3 / 12 - Real.log (1 + x) + 2 * x / (2 + x) := hge
    linarith

/-! ## Quantitative tail for `bSeq` -/

/-- The comparison sequence `ψ k = 1/(12(k+1/2)²)`. -/
noncomputable def psiSeq (k : ℕ) : ℝ := 1 / (12 * ((k : ℝ) + 1 / 2) ^ 2)

lemma psiSeq_pos (k : ℕ) : 0 < psiSeq k := by
  unfold psiSeq
  positivity

lemma psiSeq_tendsto : Tendsto psiSeq atTop (nhds 0) := by
  apply Tendsto.div_atTop tendsto_const_nhds
  have h1 : Tendsto (fun k : ℕ => (k : ℝ) + 1 / 2) atTop atTop :=
    tendsto_atTop_add_const_right _ _ tendsto_natCast_atTop_atTop
  have h2 : Tendsto (fun k : ℕ => ((k : ℝ) + 1 / 2) ^ 2) atTop atTop := by
    have h := h1.atTop_mul_atTop₀ h1
    apply h.congr
    intro k
    ring
  exact Tendsto.const_mul_atTop (by norm_num) h2

/-- Step comparison: for `j ≥ 2`,
`bSeq j − bSeq (j+1) ≤ psiSeq j − psiSeq (j+1)`. -/
lemma bSeq_step_le (j : ℕ) (hj : 2 ≤ j) :
    bSeq j - bSeq (j + 1) ≤ psiSeq j - psiSeq (j + 1) := by
  -- bSeq step = log(1+x) − 2x/(2+x) at x = 1/(j+1/2) ≤ x³/12
  have hj2 : (0 : ℝ) < (j : ℝ) + 1 / 2 := by positivity
  have hx : (0 : ℝ) < 1 / ((j : ℝ) + 1 / 2) := by positivity
  have herr := log_midpoint_err hx.le
  have harg : (1 : ℝ) + 1 / ((j : ℝ) + 1 / 2)
      = ((j : ℝ) + 1 + 1 / 2) / ((j : ℝ) + 1 / 2) := by
    field_simp
    ring
  have hval : 2 * (1 / ((j : ℝ) + 1 / 2)) / (2 + 1 / ((j : ℝ) + 1 / 2))
      = 1 / ((j : ℝ) + 1) := by
    field_simp
    ring
  rw [harg, hval] at herr
  have hlog : Real.log (((j : ℝ) + 1 + 1 / 2) / ((j : ℝ) + 1 / 2))
      = Real.log ((j : ℝ) + 1 + 1 / 2) - Real.log ((j : ℝ) + 1 / 2) := by
    apply Real.log_div (by positivity) (by positivity)
  rw [hlog] at herr
  have hharm : (harmonic (j + 1) : ℝ)
      = (harmonic j : ℝ) + 1 / ((j : ℝ) + 1) := by
    rw [harmonic_succ]
    push_cast
    ring
  have hstep : bSeq j - bSeq (j + 1)
      ≤ (1 / ((j : ℝ) + 1 / 2)) ^ 3 / 12 := by
    unfold bSeq
    rw [hharm]
    push_cast
    linarith
  have hj3 : (0 : ℝ) < (j : ℝ) + 1 + 1 / 2 := by positivity
  have hjr : (2 : ℝ) ≤ (j : ℝ) := by exact_mod_cast hj
  -- b² ≤ a(b² − a²) with a = j+1/2, b = j+3/2 (uses a ≥ 5/2)
  have h2 : ((j : ℝ) + 1 + 1 / 2) ^ 2
      ≤ ((j : ℝ) + 1 / 2) * (((j : ℝ) + 1 + 1 / 2) ^ 2
        - ((j : ℝ) + 1 / 2) ^ 2) := by nlinarith
  have htarget : 1 / (12 * ((j : ℝ) + 1 / 2) ^ 3)
      ≤ psiSeq j - psiSeq (j + 1) := by
    unfold psiSeq
    push_cast
    rw [div_sub_div _ _ (by positivity) (by positivity), div_le_div_iff₀
      (by positivity) (by positivity)]
    nlinarith [h2, sq_nonneg ((j : ℝ) + 1 / 2),
      mul_pos hj2 hj2, mul_pos (mul_pos hj2 hj2) hj2]
  calc bSeq j - bSeq (j + 1)
      ≤ (1 / ((j : ℝ) + 1 / 2)) ^ 3 / 12 := hstep
    _ = 1 / (12 * ((j : ℝ) + 1 / 2) ^ 3) := by
        field_simp
    _ ≤ psiSeq j - psiSeq (j + 1) := htarget

/-- Quantitative tail: `bSeq k ≤ γ + ψ k` for `k ≥ 2`. -/
lemma bSeq_le_gamma_add_psi (k : ℕ) (hk : 2 ≤ k) :
    bSeq k ≤ Real.eulerMascheroniConstant + psiSeq k := by
  -- the shifted difference cSeq j = bSeq (j+2) − psiSeq (j+2) is monotone
  -- (nondecreasing) and tends to γ − 0, hence cSeq ≤ γ everywhere.
  set c : ℕ → ℝ := fun j => bSeq (j + 2) - psiSeq (j + 2) with hc
  have hmono : Monotone c := by
    apply monotone_nat_of_le_succ
    intro j
    have := bSeq_step_le (j + 2) (by omega)
    simp only [hc]
    have harr : j + 1 + 2 = j + 2 + 1 := by omega
    rw [harr]
    linarith
  have htend : Tendsto c atTop (nhds Real.eulerMascheroniConstant) := by
    have h1 : Tendsto (fun j : ℕ => bSeq (j + 2)) atTop
        (nhds Real.eulerMascheroniConstant) :=
      bSeq_tendsto.comp (tendsto_add_atTop_nat 2)
    have h2 : Tendsto (fun j : ℕ => psiSeq (j + 2)) atTop (nhds 0) :=
      psiSeq_tendsto.comp (tendsto_add_atTop_nat 2)
    have := h1.sub h2
    simpa using this
  have hle : ∀ j, c j ≤ Real.eulerMascheroniConstant :=
    fun j => hmono.ge_of_tendsto htend j
  obtain ⟨j, rfl⟩ : ∃ j, k = j + 2 := ⟨k - 2, by omega⟩
  have := hle j
  simp only [hc] at this
  linarith

/-! ## The squeeze for `U` -/

/-- `U k = k·(H_k − γ − log k)`. -/
noncomputable def USeq (k : ℕ) : ℝ :=
  k * ((harmonic k : ℝ) - Real.eulerMascheroniConstant - Real.log k)

/-- Decomposition: `H_k − γ − log k = (bSeq k − γ) + log(1 + 1/(2k))`
for `k ≥ 1`. -/
lemma USeq_decomp (k : ℕ) (hk : 1 ≤ k) :
    USeq k = k * (bSeq k - Real.eulerMascheroniConstant)
      + k * Real.log (1 + 1 / (2 * (k : ℝ))) := by
  have hk0 : (0 : ℝ) < k := by exact_mod_cast hk
  unfold USeq bSeq
  have harg : (1 : ℝ) + 1 / (2 * (k : ℝ)) = ((k : ℝ) + 1 / 2) / k := by
    field_simp
  rw [harg, Real.log_div (by positivity) (by positivity)]
  ring

/-- Squeeze, lower side: `1/2 − 1/(8k) < USeq k` for `k ≥ 1`. -/
lemma USeq_lower (k : ℕ) (hk : 1 ≤ k) :
    1 / 2 - 1 / (8 * (k : ℝ)) < USeq k := by
  have hk0 : (0 : ℝ) < k := by exact_mod_cast hk
  rw [USeq_decomp k hk]
  have hb : 0 < bSeq k - Real.eulerMascheroniConstant := by
    have := gamma_add_log_lt_harmonic k
    unfold bSeq
    linarith
  have hx : (0 : ℝ) < 1 / (2 * (k : ℝ)) := by positivity
  have hlog := log_lt_sub_sq hx
  have hexp : 1 / (2 * (k : ℝ)) - (1 / (2 * (k : ℝ))) ^ 2 / 2
      = 1 / (2 * (k : ℝ)) - 1 / (8 * (k : ℝ) ^ 2) := by
    field_simp
    ring
  rw [hexp] at hlog
  have hmul : k * (1 / (2 * (k : ℝ)) - 1 / (8 * (k : ℝ) ^ 2))
      = 1 / 2 - 1 / (8 * (k : ℝ)) := by
    field_simp
  nlinarith [mul_lt_mul_of_pos_left hlog hk0]

/-- Squeeze, upper side: `USeq k ≤ 1/2 + k·ψ k` for `k ≥ 2`. -/
lemma USeq_upper (k : ℕ) (hk : 2 ≤ k) :
    USeq k ≤ 1 / 2 + k * psiSeq k := by
  have hk0 : (0 : ℝ) < k := by exact_mod_cast (by omega : 1 ≤ k)
  rw [USeq_decomp k (by omega)]
  have hb : bSeq k - Real.eulerMascheroniConstant ≤ psiSeq k := by
    have := bSeq_le_gamma_add_psi k hk
    linarith
  have hx : (0 : ℝ) < 1 + 1 / (2 * (k : ℝ)) := by positivity
  have hlog : Real.log (1 + 1 / (2 * (k : ℝ))) ≤ 1 / (2 * (k : ℝ)) := by
    have := Real.log_le_sub_one_of_pos hx
    linarith
  have h1 : k * (bSeq k - Real.eulerMascheroniConstant) ≤ k * psiSeq k :=
    mul_le_mul_of_nonneg_left hb hk0.le
  have h2 : k * Real.log (1 + 1 / (2 * (k : ℝ))) ≤ 1 / 2 := by
    have := mul_le_mul_of_nonneg_left hlog hk0.le
    calc (k : ℝ) * Real.log (1 + 1 / (2 * (k : ℝ)))
        ≤ k * (1 / (2 * (k : ℝ))) := this
      _ = 1 / 2 := by field_simp
  linarith

/-- The central limit: `USeq → 1/2`. -/
lemma USeq_tendsto : Tendsto USeq atTop (nhds (1 / 2)) := by
  have hlow : Tendsto (fun k : ℕ => 1 / 2 - 1 / (8 * (k : ℝ))) atTop
      (nhds (1 / 2)) := by
    have h : Tendsto (fun k : ℕ => 1 / (8 * (k : ℝ))) atTop (nhds 0) := by
      apply Tendsto.div_atTop tendsto_const_nhds
      exact Tendsto.const_mul_atTop (by norm_num) tendsto_natCast_atTop_atTop
    simpa using tendsto_const_nhds.sub h
  have hupp : Tendsto (fun k : ℕ => 1 / 2 + k * psiSeq k) atTop
      (nhds (1 / 2)) := by
    have h : Tendsto (fun k : ℕ => (k : ℝ) * psiSeq k) atTop (nhds 0) := by
      have heq : ∀ k : ℕ, 1 ≤ k → (k : ℝ) * psiSeq k
          = (1 / 12) * ((k : ℝ) / ((k : ℝ) + 1 / 2) ^ 2) := by
        intro k hk
        unfold psiSeq
        field_simp
      have h2 : Tendsto (fun k : ℕ => (k : ℝ) / ((k : ℝ) + 1 / 2) ^ 2) atTop
          (nhds 0) := by
        have hk0 : Tendsto (fun k : ℕ => 1 / (k : ℝ)) atTop (nhds 0) :=
          tendsto_one_div_atTop_nhds_zero_nat
        apply tendsto_of_tendsto_of_tendsto_of_le_of_le' tendsto_const_nhds hk0
        · filter_upwards with k
          positivity
        · filter_upwards [eventually_ge_atTop 1] with k hk1
          have hkr : (0 : ℝ) < k := by exact_mod_cast hk1
          rw [div_le_div_iff₀ (by positivity) hkr]
          nlinarith [sq_nonneg ((k : ℝ))]
      have h3 := h2.const_mul (1 / 12 : ℝ)
      rw [mul_zero] at h3
      apply h3.congr'
      filter_upwards [eventually_ge_atTop 1] with k hk
      rw [heq k hk]
    simpa using tendsto_const_nhds.add h
  apply tendsto_of_tendsto_of_tendsto_of_le_of_le' hlow hupp
  · filter_upwards [eventually_ge_atTop 1] with k hk
    exact (USeq_lower k hk).le
  · filter_upwards [eventually_ge_atTop 2] with k hk
    exact USeq_upper k hk

end TheoremM
