/-
Theorem M — All-degree hyperbolicity of the critical model lift.
Formalization phase P6.0: definitions, the precise statement, and the
§1.4 moment algebra (quest log rounds 295–310; docs/rh/theorem_M_draft.md).

Authors: Fable (Claude) + GPT, mquantum RH quest, 2026-06-12.
-/
import Mathlib

namespace TheoremM

open Polynomial Real Finset

/-! ## The moment sequence (§1.4/§1.4a)

`S1 k = k·H_{k-1} − (k−1)` for `k ≥ 1`, `S1 0 = 0`, where `H` is the
harmonic number. The moments `M k = (2k)!·exp(γk − S1 k)/(4^k·k!)` are
the moments of the compound-Poisson variable `U₁` of §1.4a; here they
are taken as the *definition*, and the §1.4a identities become the
lemmas `M_zero` and `M_ratio` below. -/

/-- `S1 (k+1) = (k+1)·H_k − k`; `S1 0 = 0`. -/
noncomputable def S1 : ℕ → ℝ
  | 0 => 0
  | (k + 1) => (k + 1) * (harmonic k : ℝ) - k

/-- The §1.4 moment sequence. -/
noncomputable def M (k : ℕ) : ℝ :=
  (2 * k).factorial * Real.exp (Real.eulerMascheroniConstant * k - S1 k) /
    (4 ^ k * k.factorial)

@[simp] lemma S1_zero : S1 0 = 0 := rfl

lemma S1_one : S1 1 = 0 := by
  simp [S1, harmonic]

/-- The telescoping identity `S1 (k+1) − S1 k = H_k` (draft §1.4a, step (R)). -/
lemma S1_succ_sub (k : ℕ) : S1 (k + 1) - S1 k = (harmonic k : ℝ) := by
  cases k with
  | zero => simp [S1, harmonic]
  | succ n =>
    simp only [S1]
    rw [harmonic_succ]
    have hn : ((n : ℝ) + 1) ≠ 0 := by positivity
    push_cast
    field_simp
    ring

@[simp] lemma M_zero : M 0 = 1 := by
  unfold M
  norm_num

lemma M_pos (k : ℕ) : 0 < M k := by
  unfold M
  positivity

/-- The adjacent-ratio identity (draft §1.4a, display (R)):
`M (k+1) = M k · (k + 1/2) · exp(γ − H_k)`. -/
lemma M_ratio (k : ℕ) :
    M (k + 1) = M k * ((k : ℝ) + 1 / 2) *
      Real.exp (Real.eulerMascheroniConstant - (harmonic k : ℝ)) := by
  unfold M
  have hfac2 : (2 * (k + 1)).factorial
      = (2 * k + 2) * ((2 * k + 1) * (2 * k).factorial) := by
    have h : 2 * (k + 1) = (2 * k + 1) + 1 := by ring
    rw [h, Nat.factorial_succ, Nat.factorial_succ]
  have hexp : Real.exp (Real.eulerMascheroniConstant * ((k + 1 : ℕ) : ℝ) - S1 (k + 1))
      = Real.exp (Real.eulerMascheroniConstant * (k : ℝ) - S1 k) *
        Real.exp (Real.eulerMascheroniConstant - (harmonic k : ℝ)) := by
    rw [← Real.exp_add]
    congr 1
    have h := S1_succ_sub k
    push_cast
    linarith
  rw [hfac2, Nat.factorial_succ, hexp]
  have hk4 : (4 : ℝ) ^ k ≠ 0 := by positivity
  have hkf : (k.factorial : ℝ) ≠ 0 := by positivity
  have hk1 : ((k : ℝ) + 1) ≠ 0 := by positivity
  push_cast
  rw [pow_succ]
  field_simp
  ring

/-! ## The model polynomial `C_d` and the lift `Ψ_d` (§1, Statement)

`C_d(w) = ₁F₁(−d; 1/2; w²/4d) = Σ_{k≤d} (−1)^k ((d)_k/d^k) w^{2k}/(2k)!`
(normalized `C_d(0) = 1`), and

`Ψ_d(w) = Σ_{k≤d} (−1)^k ((d)_k/d^k) M_k w^{2k}/(2k)!`

— the coefficient-exact form of `p·C_d(w) + ∫₀¹ C_d(vw) dμ(v)` from the
§1.4 decomposition; the measure form is *derived*, not assumed, so the
formal statement carries no measure theory. -/

/-- The critical Laguerre/Kummer model polynomial `C_d`. -/
noncomputable def Cpoly (d : ℕ) : ℝ[X] :=
  ∑ k ∈ range (d + 1),
    Polynomial.C ((-1) ^ k * (d.descFactorial k : ℝ) /
      ((d : ℝ) ^ k * (2 * k).factorial)) * X ^ (2 * k)

/-- The critical model lift `Ψ_d`. -/
noncomputable def Psi (d : ℕ) : ℝ[X] :=
  ∑ k ∈ range (d + 1),
    Polynomial.C ((-1) ^ k * (d.descFactorial k : ℝ) * M k /
      ((d : ℝ) ^ k * (2 * k).factorial)) * X ^ (2 * k)

/-- `Ψ_d(0) = 1` — the constant coefficient is `M 0 = 1`. -/
lemma Psi_coeff_zero (d : ℕ) : (Psi d).coeff 0 = 1 := by
  unfold Psi
  rw [finsetSum_coeff]
  rw [Finset.sum_eq_single 0]
  · simp
  · intro k hk hk0
    simp [coeff_C_mul, coeff_X_pow]
    omega
  · intro h
    exact absurd (Finset.mem_range.mpr (Nat.succ_pos d)) h

/-- Only even powers occur in `Ψ_d`. -/
lemma Psi_coeff_odd (d : ℕ) (m : ℕ) (hm : Odd m) : (Psi d).coeff m = 0 := by
  unfold Psi
  rw [finsetSum_coeff]
  apply Finset.sum_eq_zero
  intro k _
  have hne : m ≠ 2 * k := by
    intro h
    rw [h] at hm
    have := Nat.odd_iff.mp hm
    omega
  simp [coeff_C_mul, coeff_X_pow, hne]

/-! ## The statement

**Theorem M** — for every `d ≥ 1`, all complex zeros of `Ψ_d` are real
— is STATED AND PROVEN in `TheoremM/CriticalData.lean` (`theorem_M`,
with the multiset-convention-free companion `theorem_M_aeval`), at the
top of the import tree: the proof consumes the Hermite interlacing
induction (P6.2, `Hermite.lean`), the scaling bridge and critical data
(`CriticalData.lean`), and the compound-Poisson measure capstone
(P6.4b, `CPMeasure.lean` + `Capstone.lean`).  Axioms:
`[propext, Classical.choice, Quot.sound]` — no `sorry`. -/

end TheoremM
