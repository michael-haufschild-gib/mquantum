/-
Theorem M formalization, P6.4b prerequisites (roadmap step 4a):
monotonicity of the moment sequence.

Results:
* `log_midpoint_lt` — `2x/(2+x) < log(1+x)` for `x > 0` (the midpoint
  bound; equality direction is what makes the harmonic refinement work).
* `gamma_add_log_lt_harmonic` — `γ + log(k + 1/2) < H_k` for every `k`
  (sharpens mathlib's `γ < H_k − log k`; the companion sequence
  `H_k − log(k + 1/2)` is strictly decreasing to `γ`).
* `M_strictAnti` — the moment sequence `M` is strictly decreasing.
* `M_gt_pAtom_of_tendsto` — granted the Stirling limit `M → pAtom`
  (the named remaining input `M_tendsto`, a P6.4b work item), every
  `M k > pAtom`, i.e. the residual moments are strictly positive.

File owned by Fable (F135 protocol).
-/
import TheoremM.MuBridge

namespace TheoremM

open Real Filter

/-! ## The midpoint logarithm bound -/

/-- `2x/(2+x) < log(1+x)` for `x > 0`. -/
lemma log_midpoint_lt {x : ℝ} (hx : 0 < x) :
    2 * x / (2 + x) < Real.log (1 + x) := by
  set g : ℝ → ℝ := fun t => Real.log (1 + t) - 2 * t / (2 + t) with hg
  have hderiv : ∀ t ∈ interior (Set.Ici (0 : ℝ)), 0 < deriv g t := by
    intro t ht
    rw [interior_Ici] at ht
    have ht0 : (0 : ℝ) < t := ht
    have h1t : (1 : ℝ) + t ≠ 0 := by linarith
    have h2t : (2 : ℝ) + t ≠ 0 := by linarith
    have hlog : HasDerivAt (fun s : ℝ => Real.log (1 + s)) (1 / (1 + t)) t := by
      have h := (Real.hasDerivAt_log h1t).comp t
        ((hasDerivAt_id t).const_add 1)
      simpa using h
    have hfrac : HasDerivAt (fun s : ℝ => 2 * s / (2 + s))
        (4 / (2 + t) ^ 2) t := by
      have hnum : HasDerivAt (fun s : ℝ => 2 * s) 2 t := by
        simpa using (hasDerivAt_id t).const_mul 2
      have hden : HasDerivAt (fun s : ℝ => 2 + s) 1 t :=
        (hasDerivAt_id t).const_add 2
      have h := hnum.div hden h2t
      convert h using 1
      field_simp
      ring
    have hgd : HasDerivAt g (1 / (1 + t) - 4 / (2 + t) ^ 2) t := hlog.sub hfrac
    rw [hgd.deriv]
    have key : 1 / (1 + t) - 4 / (2 + t) ^ 2
        = t ^ 2 / ((1 + t) * (2 + t) ^ 2) := by
      field_simp
      ring
    rw [key]
    positivity
  have hcont : ContinuousOn g (Set.Ici (0 : ℝ)) := by
    apply ContinuousOn.sub
    · apply ContinuousOn.log (by fun_prop)
      intro t ht
      have : (0 : ℝ) ≤ t := ht
      intro h
      linarith [h]
    · apply ContinuousOn.div (by fun_prop) (by fun_prop)
      intro t ht
      have : (0 : ℝ) ≤ t := ht
      intro h
      linarith [h]
  have hmono : StrictMonoOn g (Set.Ici (0 : ℝ)) :=
    strictMonoOn_of_deriv_pos (convex_Ici 0) hcont hderiv
  have h0 : g 0 = 0 := by simp [hg]
  have := hmono (Set.left_mem_Ici) (Set.mem_Ici.mpr hx.le) hx
  rw [h0] at this
  simpa [hg, sub_pos] using this

/-! ## The sharpened harmonic bound -/

/-- The companion sequence `H_k − log(k + 1/2)`. -/
noncomputable def bSeq (k : ℕ) : ℝ := (harmonic k : ℝ) - Real.log (k + 1 / 2)

/-- `bSeq` is strictly decreasing: the step is the midpoint bound at
`x = 1/(k + 1/2)`. -/
lemma bSeq_strictAnti : StrictAnti bSeq := by
  apply strictAnti_nat_of_succ_lt
  intro k
  unfold bSeq
  have hk2 : (0 : ℝ) < (k : ℝ) + 1 / 2 := by positivity
  have hx : (0 : ℝ) < 1 / ((k : ℝ) + 1 / 2) := by positivity
  have hmid := log_midpoint_lt hx
  -- log((k+3/2)/(k+1/2)) = log(1 + 1/(k+1/2)) > 2(1/(k+1/2))/(2+1/(k+1/2)) = 1/(k+1)
  have harg : (1 : ℝ) + 1 / ((k : ℝ) + 1 / 2)
      = ((k : ℝ) + 1 + 1 / 2) / ((k : ℝ) + 1 / 2) := by
    field_simp
    ring
  have hval : 2 * (1 / ((k : ℝ) + 1 / 2)) / (2 + 1 / ((k : ℝ) + 1 / 2))
      = 1 / ((k : ℝ) + 1) := by
    field_simp
    ring
  rw [harg, hval] at hmid
  have hlog : Real.log (((k : ℝ) + 1 + 1 / 2) / ((k : ℝ) + 1 / 2))
      = Real.log ((k : ℝ) + 1 + 1 / 2) - Real.log ((k : ℝ) + 1 / 2) := by
    apply Real.log_div (by positivity) (by positivity)
  rw [hlog] at hmid
  have hharm : (harmonic (k + 1) : ℝ) = (harmonic k : ℝ) + 1 / ((k : ℝ) + 1) := by
    rw [harmonic_succ]
    push_cast
    ring
  rw [hharm]
  push_cast
  linarith

/-- `bSeq → γ`. -/
lemma bSeq_tendsto :
    Tendsto bSeq atTop (nhds Real.eulerMascheroniConstant) := by
  have h1 : Tendsto (fun k : ℕ => (harmonic k : ℝ) - Real.log k) atTop
      (nhds Real.eulerMascheroniConstant) := Real.tendsto_harmonic_sub_log
  have h2 : Tendsto (fun k : ℕ => Real.log ((k : ℝ) + 1 / 2) - Real.log k)
      atTop (nhds 0) := by
    have h3 : Tendsto (fun k : ℕ => Real.log (1 + 1 / (2 * (k : ℝ)))) atTop
        (nhds 0) := by
      have h5 : Tendsto (fun k : ℕ => 1 / (2 * (k : ℝ))) atTop (nhds 0) := by
        apply Tendsto.div_atTop tendsto_const_nhds
        exact Tendsto.const_mul_atTop (by norm_num) tendsto_natCast_atTop_atTop
      have hbase : Tendsto (fun k : ℕ => 1 + 1 / (2 * (k : ℝ))) atTop
          (nhds 1) := by
        simpa using tendsto_const_nhds.add h5
      have h6 := hbase.log (by norm_num : (1 : ℝ) ≠ 0)
      simpa using h6
    apply h3.congr'
    filter_upwards [eventually_gt_atTop 0] with k hk
    have hk0 : (0 : ℝ) < k := by exact_mod_cast hk
    rw [← Real.log_div (by positivity) (by positivity)]
    congr 1
    field_simp
  have := h1.sub h2
  simp only [sub_zero] at this
  apply this.congr
  intro k
  unfold bSeq
  ring

/-- The sharpened bound: `γ + log(k + 1/2) < H_k` for every `k`
(including `k = 0`, where it reads `γ < log 2`). -/
lemma gamma_add_log_lt_harmonic (k : ℕ) :
    Real.eulerMascheroniConstant + Real.log ((k : ℝ) + 1 / 2)
      < (harmonic k : ℝ) := by
  have hlim : Real.eulerMascheroniConstant ≤ bSeq (k + 1) :=
    bSeq_strictAnti.antitone.le_of_tendsto bSeq_tendsto (k + 1)
  have hstep : bSeq (k + 1) < bSeq k := bSeq_strictAnti (Nat.lt_succ_self k)
  have : Real.eulerMascheroniConstant < bSeq k := lt_of_le_of_lt hlim hstep
  unfold bSeq at this
  linarith

/-! ## Monotonicity of the moments -/

/-- The moment sequence is strictly decreasing. -/
lemma M_strictAnti : StrictAnti M := by
  apply strictAnti_nat_of_succ_lt
  intro k
  rw [M_ratio k]
  have hM := M_pos k
  have hfac : (0 : ℝ) < (k : ℝ) + 1 / 2 := by positivity
  have hkey : ((k : ℝ) + 1 / 2) *
      Real.exp (Real.eulerMascheroniConstant - (harmonic k : ℝ)) < 1 := by
    rw [← Real.exp_log hfac, ← Real.exp_add]
    have hlt : Real.log ((k : ℝ) + 1 / 2)
        + (Real.eulerMascheroniConstant - (harmonic k : ℝ)) < 0 := by
      have := gamma_add_log_lt_harmonic k
      linarith
    calc Real.exp (Real.log ((k : ℝ) + 1 / 2)
          + (Real.eulerMascheroniConstant - (harmonic k : ℝ)))
        < Real.exp 0 := Real.exp_lt_exp.mpr hlt
      _ = 1 := Real.exp_zero
  calc M k * ((k : ℝ) + 1 / 2) *
      Real.exp (Real.eulerMascheroniConstant - (harmonic k : ℝ))
      = M k * (((k : ℝ) + 1 / 2) *
        Real.exp (Real.eulerMascheroniConstant - (harmonic k : ℝ))) := by ring
    _ < M k * 1 := by
        apply mul_lt_mul_of_pos_left hkey hM
    _ = M k := mul_one _

/-- **Residual-moment positivity, conditional on the Stirling limit.**
Granted `M → pAtom` (the named remaining analytic input `M_tendsto`,
a P6.4b work item: Stirling + the second-order harmonic asymptotic),
every moment strictly exceeds the atom mass. -/
lemma M_gt_pAtom_of_tendsto
    (htend : Tendsto M atTop (nhds pAtom)) (k : ℕ) : pAtom < M k := by
  have hlim : pAtom ≤ M (k + 1) :=
    M_strictAnti.antitone.le_of_tendsto htend (k + 1)
  exact lt_of_le_of_lt hlim (M_strictAnti (Nat.lt_succ_self k))

end TheoremM
