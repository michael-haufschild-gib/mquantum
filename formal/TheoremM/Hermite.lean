/-
Theorem M P6.2 Hermite route scaffold.

This file is intentionally disjoint from Fable-owned proof files: it packages
mathlib's probabilists' Hermite facts needed for the later `C_d` rescaling and
Rolle/Gaussian real-rootedness route.
-/
import TheoremM.Structure
import Mathlib.RingTheory.Polynomial.Hermite.Gaussian

noncomputable section

namespace TheoremM

open Polynomial Finset
open scoped Nat

/-- Derivative-lowering identity for mathlib's probabilists' Hermite polynomials. -/
lemma derivative_hermite_succ (n : ℕ) :
    derivative (Polynomial.hermite (n + 1)) =
      Polynomial.C ((n + 1 : ℕ) : ℤ) * Polynomial.hermite n := by
  induction n with
  | zero =>
      rw [Polynomial.hermite_one]
      simp
  | succ n ih =>
      rw [Polynomial.hermite_succ]
      rw [derivative_sub, derivative_mul, derivative_X]
      rw [ih]
      rw [derivative_C_mul]
      calc
        1 * Polynomial.hermite (n + 1) +
              X * (C (((n + 1 : ℕ) : ℤ)) * Polynomial.hermite n)
            - C (((n + 1 : ℕ) : ℤ)) * derivative (Polynomial.hermite n)
            = 1 * Polynomial.hermite (n + 1) +
                C (((n + 1 : ℕ) : ℤ)) *
                  (X * Polynomial.hermite n - derivative (Polynomial.hermite n)) := by
              ring
        _ = 1 * Polynomial.hermite (n + 1) +
              C (((n + 1 : ℕ) : ℤ)) * Polynomial.hermite (n + 1) := by
              rw [← Polynomial.hermite_succ]
        _ = C (((n + 1 + 1 : ℕ) : ℤ)) * Polynomial.hermite (n + 1) := by
              simp [Nat.cast_add, add_mul, one_mul]
              abel

/-- Probabilists' Hermite ODE: `Hₙ'' - X Hₙ' + n Hₙ = 0`. -/
lemma hermite_ode (n : ℕ) :
    derivative (derivative (Polynomial.hermite n))
      - X * derivative (Polynomial.hermite n)
      + Polynomial.C (((n : ℕ) : ℤ)) * Polynomial.hermite n = 0 := by
  have h := derivative_hermite_succ n
  rw [Polynomial.hermite_succ] at h
  rw [derivative_sub, derivative_mul, derivative_X] at h
  have hC : Polynomial.C (((n + 1 : ℕ) : ℤ)) =
      (1 : Polynomial ℤ) + Polynomial.C (((n : ℕ) : ℤ)) := by
    ext m
    cases m <;> simp [Nat.cast_add, add_comm]
  rw [hC, add_mul, one_mul] at h
  have h1 : X * derivative (Polynomial.hermite n)
      - derivative (derivative (Polynomial.hermite n)) =
        Polynomial.C (((n : ℕ) : ℤ)) * Polynomial.hermite n := by
    simpa [sub_eq_add_neg, add_assoc, add_comm, add_left_comm] using h
  rw [← h1]
  simp [sub_eq_add_neg, add_assoc, add_comm, add_left_comm]

/-- Real-coefficient version of the probabilists' Hermite ODE. -/
lemma hermite_odeR (n : ℕ) :
    derivative (derivative ((Polynomial.hermite n).map (Int.castRingHom ℝ)))
      - X * derivative ((Polynomial.hermite n).map (Int.castRingHom ℝ))
      + Polynomial.C (((n : ℕ) : ℝ)) *
          ((Polynomial.hermite n).map (Int.castRingHom ℝ)) = 0 := by
  have h := congrArg (fun p : Polynomial ℤ => p.map (Int.castRingHom ℝ))
    (hermite_ode n)
  simpa [Polynomial.map_add, Polynomial.map_sub, Polynomial.map_mul, derivative_map] using h

/-- The even probabilists' Hermite polynomial that will be rescaled to `C_d`. -/
abbrev HermiteEven (d : ℕ) : Polynomial ℤ :=
  Polynomial.hermite (2 * d)

/-- `H_{2d}` viewed as a real polynomial. -/
abbrev HermiteEvenR (d : ℕ) : ℝ[X] :=
  (HermiteEven d).map (Int.castRingHom ℝ)

/-- The even Hermite polynomial has the expected degree. -/
lemma hermiteEven_natDegree (d : ℕ) : (HermiteEven d).natDegree = 2 * d := by
  simp [HermiteEven]

/-- The even Hermite polynomial is monic. -/
lemma hermiteEven_monic (d : ℕ) : (HermiteEven d).Monic := by
  simpa [HermiteEven] using Polynomial.hermite_monic (2 * d)

/-- Derivative of `H_{2d}` lowers to a nonzero scalar multiple of `H_{2d-1}`. -/
lemma derivative_hermiteEven (d : ℕ) (hd : 1 ≤ d) :
    derivative (HermiteEven d) =
      Polynomial.C (((2 * d : ℕ) : ℤ)) * Polynomial.hermite (2 * d - 1) := by
  have h := derivative_hermite_succ (2 * d - 1)
  rw [show 2 * d - 1 + 1 = 2 * d by omega] at h
  simpa [HermiteEven] using h

/-- Real-coefficient version of `derivative_hermiteEven`. -/
lemma derivative_hermiteEvenR (d : ℕ) (hd : 1 ≤ d) :
    derivative (HermiteEvenR d) =
      Polynomial.C (((2 * d : ℕ) : ℝ)) *
        (Polynomial.hermite (2 * d - 1)).map (Int.castRingHom ℝ) := by
  unfold HermiteEvenR
  rw [derivative_map]
  rw [derivative_hermiteEven d hd]
  rw [Polynomial.map_mul]
  rw [map_C]
  norm_num

/-- Even-coefficient recurrence for `H_{2d}` over `ℝ`.

After dividing by the constant coefficient and by `(2d)^k`, this is exactly
the coefficient recurrence of `C_d`. -/
lemma hermiteEvenR_coeff_even_succ (d k : ℕ) :
    ((2 * k + 1 : ℕ) : ℝ) * ((2 * k + 2 : ℕ) : ℝ) *
        (HermiteEvenR d).coeff (2 * (k + 1)) =
      (((2 * k : ℕ) : ℝ) - ((2 * d : ℕ) : ℝ)) *
        (HermiteEvenR d).coeff (2 * k) := by
  let H : ℝ[X] := HermiteEvenR d
  have hode : derivative (derivative H) - X * derivative H
      + Polynomial.C (((2 * d : ℕ) : ℝ)) * H = 0 := by
    simpa [H, HermiteEvenR] using hermite_odeR (2 * d)
  have hcoeff := congrArg (fun p : ℝ[X] => p.coeff (2 * k)) hode
  change (derivative (derivative H) - X * derivative H
      + Polynomial.C (((2 * d : ℕ) : ℝ)) * H).coeff (2 * k) =
    (0 : ℝ[X]).coeff (2 * k) at hcoeff
  have hD2 : (derivative (derivative H)).coeff (2 * k) =
      H.coeff (2 * (k + 1)) *
        (((2 * k + 1 : ℕ) : ℝ) * ((2 * k + 2 : ℕ) : ℝ)) := by
    rw [coeff_derivative, coeff_derivative]
    rw [show 2 * k + 1 + 1 = 2 * (k + 1) by omega]
    push_cast
    ring
  have hXC : (X * derivative H).coeff (2 * k) =
      ((2 * k : ℕ) : ℝ) * H.coeff (2 * k) := by
    cases k with
    | zero => simp
    | succ n =>
        rw [show 2 * (n + 1) = (2 * n + 1) + 1 by ring]
        rw [coeff_X_mul, coeff_derivative]
        rw [show 2 * n + 1 + 1 = 2 * (n + 1) by omega]
        push_cast
        ring
  rw [coeff_add, coeff_sub, hD2, hXC, coeff_C_mul, coeff_zero] at hcoeff
  simp only [H] at hcoeff
  linarith

/-- No odd powers occur in `H_{2d}`. -/
lemma hermiteEven_coeff_odd (d k : ℕ) : (HermiteEven d).coeff (2 * k + 1) = 0 := by
  have hodd : Odd (2 * d + (2 * k + 1)) := by
    rw [show 2 * d + (2 * k + 1) = 2 * (d + k) + 1 by omega]
    exact ⟨d + k, rfl⟩
  simpa [HermiteEven] using (Polynomial.coeff_hermite_of_odd_add hodd)

/-- Closed coefficient formula for the even powers of `H_{2d}`. -/
lemma hermiteEven_coeff_even (d k : ℕ) :
    (HermiteEven d).coeff (2 * k) =
      (-1) ^ ((2 * d - 2 * k) / 2) * (2 * d - 2 * k - 1)‼ *
        Nat.choose (2 * d) (2 * k) := by
  have heven : Even (2 * d + 2 * k) := by
    rw [show 2 * d + 2 * k = 2 * (d + k) by omega]
    exact ⟨d + k, by omega⟩
  simpa [HermiteEven] using
    (Polynomial.coeff_hermite_of_even_add (n := 2 * d) (k := 2 * k) heven)

/-- Constant coefficient of `H_{2d}`, used to normalize the later `C_d` rescaling. -/
lemma hermiteEven_coeff_zero (d : ℕ) :
    (HermiteEven d).coeff 0 = (-1) ^ d * (2 * d - 1)‼ := by
  rw [show (0 : ℕ) = 2 * 0 by omega]
  rw [hermiteEven_coeff_even]
  simp

/-- The normalizing constant `H_{2d}(0)` is nonzero. -/
lemma hermiteEven_coeff_zero_ne_zero (d : ℕ) : (HermiteEven d).coeff 0 ≠ 0 := by
  rw [hermiteEven_coeff_zero]
  have hdf : ((2 * d - 1)‼ : ℤ) ≠ 0 := by
    exact_mod_cast (ne_of_gt (Nat.doubleFactorial_pos (2 * d - 1)))
  exact mul_ne_zero (by simp) hdf

/-- No odd powers occur after casting `H_{2d}` to real coefficients. -/
lemma hermiteEvenR_coeff_odd (d k : ℕ) : (HermiteEvenR d).coeff (2 * k + 1) = 0 := by
  simp [HermiteEvenR, hermiteEven_coeff_odd]

/-- Closed coefficient formula for the even powers after casting to real coefficients. -/
lemma hermiteEvenR_coeff_even (d k : ℕ) :
    (HermiteEvenR d).coeff (2 * k) =
      ((-1 : ℤ) ^ ((2 * d - 2 * k) / 2) * (2 * d - 2 * k - 1)‼ *
        Nat.choose (2 * d) (2 * k) : ℤ) := by
  simp [HermiteEvenR, hermiteEven_coeff_even]

/-- Real-valued normalizing constant of `H_{2d}`. -/
lemma hermiteEvenR_coeff_zero (d : ℕ) :
    (HermiteEvenR d).coeff 0 = ((-1 : ℤ) ^ d * (2 * d - 1)‼ : ℤ) := by
  simp [HermiteEvenR, hermiteEven_coeff_zero]

/-- The real normalizing constant is nonzero. -/
lemma hermiteEvenR_coeff_zero_ne_zero (d : ℕ) : (HermiteEvenR d).coeff 0 ≠ 0 := by
  rw [hermiteEvenR_coeff_zero]
  norm_cast
  have hdf : ((2 * d - 1)‼ : ℤ) ≠ 0 := by
    exact_mod_cast (ne_of_gt (Nat.doubleFactorial_pos (2 * d - 1)))
  exact mul_ne_zero (by simp) hdf

/-- Coefficient-side normalization of `H_{2d}(w/sqrt(2d)) / H_{2d}(0)`.

This avoids choosing square roots while proving the exact coefficient bridge to
`Cpoly d`: the factor `(2d)^k` is the contribution of `(sqrt(2d))^(2k)`. -/
noncomputable def HermiteCpoly (d : ℕ) : ℝ[X] :=
  ∑ k ∈ range (d + 1),
    Polynomial.C ((HermiteEvenR d).coeff (2 * k) /
      ((HermiteEvenR d).coeff 0 * (((2 * d : ℕ) : ℝ) ^ k))) * X ^ (2 * k)

/-- Even coefficients of the coefficient-side normalized Hermite polynomial. -/
lemma hermiteCpoly_coeff_even_of_le (d k : ℕ) (hk : k ≤ d) :
    (HermiteCpoly d).coeff (2 * k) =
      (HermiteEvenR d).coeff (2 * k) /
        ((HermiteEvenR d).coeff 0 * (((2 * d : ℕ) : ℝ) ^ k)) := by
  unfold HermiteCpoly
  rw [finsetSum_coeff]
  rw [Finset.sum_eq_single k]
  · simp [coeff_C_mul, coeff_X_pow]
  · intro j _ hj
    have : (2 * k) ≠ 2 * j := by omega
    simp [coeff_C_mul, coeff_X_pow, this]
  · intro h
    exact False.elim (h (Finset.mem_range.mpr (Nat.lt_succ_of_le hk)))

/-- Even coefficients above the top degree of the coefficient-side normalized
Hermite polynomial vanish. -/
lemma hermiteCpoly_coeff_even_gt (d k : ℕ) (hk : d < k) :
    (HermiteCpoly d).coeff (2 * k) = 0 := by
  unfold HermiteCpoly
  rw [finsetSum_coeff]
  apply Finset.sum_eq_zero
  intro j hj
  have : (2 * k) ≠ 2 * j := by
    have hjd : j ≤ d := Nat.lt_succ_iff.mp (Finset.mem_range.mp hj)
    omega
  simp [coeff_C_mul, coeff_X_pow, this]

/-- Odd coefficients of the coefficient-side normalized Hermite polynomial vanish. -/
lemma hermiteCpoly_coeff_odd (d m : ℕ) (hm : Odd m) :
    (HermiteCpoly d).coeff m = 0 := by
  unfold HermiteCpoly
  rw [finsetSum_coeff]
  apply Finset.sum_eq_zero
  intro k _
  have hne : m ≠ 2 * k := by
    intro h
    rw [h] at hm
    exact (Nat.not_even_iff_odd.mpr hm) (even_two_mul k)
  simp [coeff_C_mul, coeff_X_pow, hne]

/-- The coefficient-side normalized Hermite polynomial has constant coefficient `1`. -/
lemma hermiteCpoly_coeff_zero (d : ℕ) : (HermiteCpoly d).coeff 0 = 1 := by
  rw [show (0 : ℕ) = 2 * 0 by omega]
  rw [hermiteCpoly_coeff_even_of_le d 0 (Nat.zero_le d)]
  rw [show 2 * 0 = (0 : ℕ) by omega]
  simpa using div_self (hermiteEvenR_coeff_zero_ne_zero d)

/-- The normalized Hermite coefficients satisfy the same first-order recurrence
as `Cpoly d`. -/
lemma hermiteCpoly_coeff_even_succ (d k : ℕ) (hd : 1 ≤ d) (hk : k < d) :
    ((2 * k + 1 : ℕ) : ℝ) * ((2 * k + 2 : ℕ) : ℝ) *
        (((2 * d : ℕ) : ℝ)) * (HermiteCpoly d).coeff (2 * (k + 1)) =
      (((2 * k : ℕ) : ℝ) - ((2 * d : ℕ) : ℝ)) *
        (HermiteCpoly d).coeff (2 * k) := by
  rw [hermiteCpoly_coeff_even_of_le d (k + 1) (Nat.succ_le_of_lt hk),
    hermiteCpoly_coeff_even_of_le d k (le_of_lt hk)]
  have hraw := hermiteEvenR_coeff_even_succ d k
  have h0 : (HermiteEvenR d).coeff 0 ≠ 0 := hermiteEvenR_coeff_zero_ne_zero d
  have hd2 : (((2 * d : ℕ) : ℝ)) ≠ 0 := by
    have : (0 : ℝ) < ((2 * d : ℕ) : ℝ) := by exact_mod_cast (by omega)
    exact this.ne'
  have hpow : (((2 * d : ℕ) : ℝ)) ^ k ≠ 0 := pow_ne_zero _ hd2
  rw [pow_succ]
  field_simp [h0, hd2, hpow]
  nlinarith [hraw]

/-- The `Cpoly d` coefficients in the same recurrence form as
`HermiteCpoly d`. -/
lemma Cpoly_coeff_even_succ (d k : ℕ) (hd : 1 ≤ d) (hk : k < d) :
    ((2 * k + 1 : ℕ) : ℝ) * ((2 * k + 2 : ℕ) : ℝ) *
        (((2 * d : ℕ) : ℝ)) * (Cpoly d).coeff (2 * (k + 1)) =
      (((2 * k : ℕ) : ℝ) - ((2 * d : ℕ) : ℝ)) *
        (Cpoly d).coeff (2 * k) := by
  rw [Cpoly_coeff_even, Cpoly_coeff_even]
  rw [Nat.descFactorial_succ]
  have hcast : ((d - k : ℕ) : ℝ) = (d : ℝ) - k := Nat.cast_sub (le_of_lt hk)
  have hdne : (d : ℝ) ≠ 0 := by
    have : (0 : ℝ) < d := by exact_mod_cast hd
    exact this.ne'
  have hfacrec : ((2 * (k + 1)).factorial : ℝ)
      = (2 * k + 2) * ((2 * k + 1) * (2 * k).factorial) := by
    have h : 2 * (k + 1) = (2 * k + 1) + 1 := by ring
    rw [h, Nat.factorial_succ, Nat.factorial_succ]
    push_cast
    ring
  rw [hfacrec, pow_succ]
  push_cast [hcast]
  field_simp
  ring

/-- Gaussian derivative representation of the even Hermite polynomial. -/
lemma hermiteEven_gaussian_factor (d : ℕ) (x : ℝ) :
    aeval x (HermiteEven d) =
      (-1 : ℝ) ^ (2 * d) *
        deriv^[2 * d] (fun y => Real.exp (-(y ^ 2 / 2))) x * Real.exp (x ^ 2 / 2) := by
  simpa [HermiteEven] using Polynomial.hermite_eq_deriv_gaussian' (2 * d) x

/-- Even-order Gaussian derivative representation with the sign removed. -/
lemma hermiteEven_gaussian_factor_even (d : ℕ) (x : ℝ) :
    aeval x (HermiteEven d) =
      deriv^[2 * d] (fun y => Real.exp (-(y ^ 2 / 2))) x * Real.exp (x ^ 2 / 2) := by
  rw [hermiteEven_gaussian_factor]
  simp

end TheoremM
