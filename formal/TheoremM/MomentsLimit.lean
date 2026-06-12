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

/-! ## Part 2: the Stirling form and the limit -/

lemma stirlingSeq_pos {n : ℕ} (hn : 1 ≤ n) : 0 < stirlingSeq n := by
  unfold stirlingSeq
  have hn0 : (0 : ℝ) < n := by exact_mod_cast hn
  have hfac : (0 : ℝ) < (n.factorial : ℝ) := by exact_mod_cast n.factorial_pos
  apply div_pos hfac
  apply mul_pos
  · apply Real.sqrt_pos.mpr
    positivity
  · apply pow_pos
    positivity

/-- The factorial in logs, via the Stirling sequence. -/
lemma log_factorial_eq {n : ℕ} (hn : 1 ≤ n) :
    Real.log (n.factorial : ℝ) = Real.log (stirlingSeq n)
      + (1 / 2) * Real.log (2 * n) + n * (Real.log n - 1) := by
  have hn0 : (0 : ℝ) < n := by exact_mod_cast hn
  have hs := stirlingSeq_pos hn
  have hsqrt : (0 : ℝ) < Real.sqrt (2 * n) := by
    apply Real.sqrt_pos.mpr
    positivity
  have hpow : (0 : ℝ) < ((n : ℝ) / Real.exp 1) ^ n := by
    apply pow_pos
    positivity
  have hfac : (n.factorial : ℝ) = stirlingSeq n * (Real.sqrt (2 * n)
      * ((n : ℝ) / Real.exp 1) ^ n) := by
    unfold stirlingSeq
    field_simp
  rw [hfac, Real.log_mul hs.ne' (by positivity),
    Real.log_mul hsqrt.ne' hpow.ne', Real.log_sqrt (by positivity),
    Real.log_pow, Real.log_div hn0.ne' (Real.exp_pos 1).ne', Real.log_exp]
  push_cast
  ring

/-- `S₁(k) = k(H_k − 1)` for `k ≥ 1`. -/
lemma S1_eq_succ (j : ℕ) :
    S1 (j + 1) = ((j : ℝ) + 1) * ((harmonic (j + 1) : ℝ) - 1) := by
  simp only [S1]
  rw [harmonic_succ]
  have hj1 : ((j : ℝ) + 1) ≠ 0 := by positivity
  push_cast
  field_simp
  ring

/-- The log-linear Stirling form of the moments. -/
lemma M_log_form (j : ℕ) :
    Real.log (M (j + 1)) = Real.log (stirlingSeq (2 * (j + 1)))
      - Real.log (stirlingSeq (j + 1)) + (1 / 2) * Real.log 2
      - USeq (j + 1) := by
  set k : ℕ := j + 1 with hk
  have hk1 : 1 ≤ k := by omega
  have hk0 : (0 : ℝ) < k := by exact_mod_cast hk1
  have hMpos := M_pos k
  -- log M = log((2k)!) − k log 4 − log(k!) + (γk − S1 k)
  have hfac2 : (0 : ℝ) < ((2 * k).factorial : ℝ) := by
    exact_mod_cast (2 * k).factorial_pos
  have hfac1 : (0 : ℝ) < (k.factorial : ℝ) := by exact_mod_cast k.factorial_pos
  have hlogM : Real.log (M k) = Real.log ((2 * k).factorial : ℝ)
      + (Real.eulerMascheroniConstant * k - S1 k)
      - ((k : ℝ) * Real.log 4 + Real.log (k.factorial : ℝ)) := by
    unfold M
    rw [Real.log_div (by positivity) (by positivity),
      Real.log_mul hfac2.ne' (Real.exp_pos _).ne', Real.log_exp,
      Real.log_mul (by positivity) hfac1.ne', Real.log_pow]
  have hL2 := log_factorial_eq (show 1 ≤ 2 * k by omega)
  have hL1 := log_factorial_eq hk1
  have hS1 : S1 k = (k : ℝ) * ((harmonic k : ℝ) - 1) := by
    rw [hk]
    push_cast
    exact S1_eq_succ j
  have hU : USeq k = k * ((harmonic k : ℝ)
      - Real.eulerMascheroniConstant - Real.log k) := rfl
  -- log-arithmetic side identities
  have hlog4 : Real.log (4 : ℝ) = 2 * Real.log 2 := by
    rw [show (4 : ℝ) = 2 ^ 2 by norm_num, Real.log_pow]
    push_cast
    ring
  have hlog4k : Real.log (2 * (2 * k : ℕ) : ℝ)
      = 2 * Real.log 2 + Real.log k := by
    push_cast
    rw [show (2 : ℝ) * (2 * k) = 2 ^ 2 * k by ring,
      Real.log_mul (by positivity) hk0.ne', Real.log_pow]
    push_cast
    ring
  have hlog2k : Real.log (2 * (k : ℕ) : ℝ) = Real.log 2 + Real.log k := by
    push_cast
    rw [Real.log_mul (by norm_num) hk0.ne']
  have hcast2k : ((2 * k : ℕ) : ℝ) = 2 * (k : ℝ) := by push_cast; ring
  have hlog2k' : Real.log ((2 * k : ℕ) : ℝ) = Real.log 2 + Real.log k := by
    rw [hcast2k, Real.log_mul (by norm_num) hk0.ne']
  rw [hlogM, hL2, hL1]
  rw [hlog4k, hlog2k, hlog4, hS1, hU, hlog2k', hcast2k]
  ring

/-- The Stirling form of the moments. -/
lemma M_eq_form (j : ℕ) :
    M (j + 1) = stirlingSeq (2 * (j + 1)) / stirlingSeq (j + 1)
      * Real.sqrt 2 * Real.exp (-USeq (j + 1)) := by
  set k : ℕ := j + 1 with hk
  have hk1 : 1 ≤ k := by omega
  have hs2 := stirlingSeq_pos (show 1 ≤ 2 * k by omega)
  have hs1 := stirlingSeq_pos hk1
  have hMpos := M_pos k
  have hRpos : 0 < stirlingSeq (2 * k) / stirlingSeq k
      * Real.sqrt 2 * Real.exp (-USeq k) := by
    have h2 : (0 : ℝ) < Real.sqrt 2 := by
      apply Real.sqrt_pos.mpr; norm_num
    positivity
  apply Real.log_injOn_pos (Set.mem_Ioi.mpr hMpos) (Set.mem_Ioi.mpr hRpos)
  rw [hk] at *
  rw [M_log_form j]
  rw [Real.log_mul (by positivity) (Real.exp_pos _).ne',
    Real.log_mul (div_pos hs2 hs1).ne' (by
      apply (Real.sqrt_pos.mpr _).ne'
      norm_num),
    Real.log_div hs2.ne' hs1.ne', Real.log_exp,
    Real.log_sqrt (by norm_num)]
  ring

/-- `√2·e^{−1/2} = pAtom`. -/
lemma pAtom_eq_sqrt_two_exp :
    pAtom = Real.sqrt 2 * Real.exp (-(1 / 2 : ℝ)) := by
  unfold pAtom
  have hy : (0 : ℝ) ≤ Real.exp (-(1 / 2 : ℝ)) := (Real.exp_pos _).le
  have hsq : Real.exp (-(1 / 2 : ℝ)) ^ 2 = 1 / Real.exp 1 := by
    rw [show Real.exp (-(1 / 2 : ℝ)) ^ 2
        = Real.exp (-(1 / 2 : ℝ)) * Real.exp (-(1 / 2 : ℝ)) by ring,
      ← Real.exp_add]
    rw [show -(1 / 2 : ℝ) + -(1 / 2) = -1 by norm_num, Real.exp_neg]
    simp
  have harg : 2 / Real.exp 1 = 2 * Real.exp (-(1 / 2 : ℝ)) ^ 2 := by
    rw [hsq]
    ring
  rw [harg, Real.sqrt_mul (by norm_num), Real.sqrt_sq hy]

/-- The doubling map tends to infinity. -/
private lemma tendsto_two_mul_atTop :
    Tendsto (fun k : ℕ => 2 * k) atTop atTop := by
  apply Filter.tendsto_atTop_atTop.mpr
  intro b
  exact ⟨b, fun a ha => by omega⟩

/-- **The Stirling limit: `M → pAtom`.** Closes the hypothesis of
`M_gt_pAtom_of_tendsto`. -/
theorem M_tendsto : Tendsto M atTop (nhds pAtom) := by
  have hpi : Real.sqrt Real.pi ≠ 0 := by
    apply (Real.sqrt_pos.mpr Real.pi_pos).ne'
  have h2k : Tendsto (fun k : ℕ => stirlingSeq (2 * k)) atTop
      (nhds (Real.sqrt Real.pi)) :=
    tendsto_stirlingSeq_sqrt_pi.comp tendsto_two_mul_atTop
  have hratio : Tendsto (fun k : ℕ => stirlingSeq (2 * k) / stirlingSeq k)
      atTop (nhds 1) := by
    have h := h2k.div tendsto_stirlingSeq_sqrt_pi hpi
    rwa [div_self hpi] at h
  have hexp : Tendsto (fun k : ℕ => Real.exp (-USeq k)) atTop
      (nhds (Real.exp (-(1 / 2 : ℝ)))) := by
    have h := USeq_tendsto.neg
    exact (Real.continuous_exp.tendsto _).comp h
  have hprod : Tendsto (fun k : ℕ => stirlingSeq (2 * k) / stirlingSeq k
      * Real.sqrt 2 * Real.exp (-USeq k)) atTop
      (nhds (1 * Real.sqrt 2 * Real.exp (-(1 / 2 : ℝ)))) :=
    (hratio.mul_const _).mul hexp
  rw [one_mul, ← pAtom_eq_sqrt_two_exp] at hprod
  apply hprod.congr'
  filter_upwards [eventually_ge_atTop 1] with k hk
  obtain ⟨j, rfl⟩ : ∃ j, k = j + 1 := ⟨k - 1, by omega⟩
  exact (M_eq_form j).symm

/-- **Unconditional residual-moment positivity**: `pAtom < M k`. -/
theorem M_gt_pAtom (k : ℕ) : pAtom < M k :=
  M_gt_pAtom_of_tendsto M_tendsto k

end TheoremM
