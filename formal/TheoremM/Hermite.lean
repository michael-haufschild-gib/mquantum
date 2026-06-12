/-
Theorem M P6.2 Hermite route scaffold.

This file is intentionally disjoint from `Structure.lean`: it packages
mathlib's probabilists' Hermite facts needed for the later `C_d` rescaling and
Rolle/Gaussian real-rootedness route, without importing this file from the root
module yet.
-/
import TheoremM.Defs
import Mathlib.RingTheory.Polynomial.Hermite.Gaussian

noncomputable section

namespace TheoremM

open Polynomial
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
