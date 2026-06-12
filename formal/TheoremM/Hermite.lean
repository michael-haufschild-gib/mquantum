/-
Theorem M P6.2 Hermite route scaffold.

This file is intentionally disjoint from Fable-owned proof files: it packages
mathlib's probabilists' Hermite facts needed for the later `C_d` rescaling and
Rolle/Gaussian real-rootedness route.
-/
import TheoremM.Structure
import Mathlib.RingTheory.Polynomial.Hermite.Gaussian
import Mathlib.Topology.Order.IntermediateValue
import Mathlib.Analysis.Polynomial.Basic
import Mathlib.Data.Multiset.Sort

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

/-- Real-coefficient probabilists' Hermite polynomial. -/
abbrev HermiteR (n : ℕ) : Polynomial ℝ :=
  (Polynomial.hermite n).map (Int.castRingHom ℝ)

/-- Hermite roots sorted increasingly. This is the ordered root list used by
the real-rootedness induction. -/
abbrev HermiteRRootsSorted (n : ℕ) : List ℝ :=
  (HermiteR n).roots.sort (fun x y : ℝ => x ≤ y)

/-- Real-coefficient Hermite polynomials are monic. -/
lemma hermiteR_monic (n : ℕ) : (HermiteR n).Monic := by
  exact (Polynomial.hermite_monic n).map (Int.castRingHom ℝ)

/-- Real Hermite polynomials have degree `n`. -/
lemma hermiteR_natDegree (n : ℕ) : (HermiteR n).natDegree = n := by
  unfold HermiteR
  rw [(Polynomial.hermite_monic n).natDegree_map (Int.castRingHom ℝ)]
  simp

/-- Real Hermite polynomials are nonzero. -/
lemma hermiteR_ne_zero (n : ℕ) : HermiteR n ≠ 0 :=
  (hermiteR_monic n).ne_zero

/-- Root count is bounded by the Hermite degree. -/
lemma hermiteR_roots_card_le (n : ℕ) : (HermiteR n).roots.card ≤ n := by
  simpa [hermiteR_natDegree n] using Polynomial.card_roots' (HermiteR n)

/-- Length of the sorted Hermite-root list. -/
lemma hermiteRRootsSorted_length (n : ℕ) :
    (HermiteRRootsSorted n).length = (HermiteR n).roots.card := by
  simp [HermiteRRootsSorted]

/-- Membership in the sorted Hermite-root list is membership in the root
multiset. -/
lemma mem_hermiteRRootsSorted_iff (n : ℕ) {x : ℝ} :
    x ∈ HermiteRRootsSorted n ↔ x ∈ (HermiteR n).roots := by
  simp [HermiteRRootsSorted]

/-- An indexed element of the sorted Hermite-root list is a root. -/
lemma hermiteRRootsSorted_get_mem_roots (n : ℕ) {i : ℕ}
    (hi : i < (HermiteRRootsSorted n).length) :
    (HermiteRRootsSorted n)[i]'hi ∈ (HermiteR n).roots := by
  rw [← mem_hermiteRRootsSorted_iff n]
  exact List.getElem_mem _

/-- For real Hermite, splitting is equivalent to having the full number of
roots counted with multiplicity. -/
lemma hermiteR_splits_iff_card_roots (n : ℕ) :
    (HermiteR n).Splits ↔ (HermiteR n).roots.card = n := by
  rw [Polynomial.splits_iff_card_roots, hermiteR_natDegree]

/-- Base polynomial `H_0 = 1`. -/
lemma hermiteR_zero : HermiteR 0 = 1 := by
  simp [HermiteR]

/-- Base polynomial `H_1 = X`. -/
lemma hermiteR_one : HermiteR 1 = X := by
  simp [HermiteR]

/-- `H_0` splits. -/
lemma hermiteR_splits_zero : (HermiteR 0).Splits := by
  rw [hermiteR_zero]
  exact Polynomial.Splits.one

/-- `H_1` splits. -/
lemma hermiteR_splits_one : (HermiteR 1).Splits := by
  rw [hermiteR_one]
  exact Polynomial.Splits.X

/-- `H_0` has no roots. -/
lemma hermiteR_card_roots_zero : (HermiteR 0).roots.card = 0 := by
  rw [← hermiteR_splits_zero.natDegree_eq_card_roots, hermiteR_natDegree]

/-- `H_1` has one root. -/
lemma hermiteR_card_roots_one : (HermiteR 1).roots.card = 1 := by
  rw [← hermiteR_splits_one.natDegree_eq_card_roots, hermiteR_natDegree]

/-- `H_0` has no repeated roots. -/
lemma hermiteR_roots_nodup_zero : (HermiteR 0).roots.Nodup := by
  simp [hermiteR_zero]

/-- `H_1` has no repeated roots. -/
lemma hermiteR_roots_nodup_one : (HermiteR 1).roots.Nodup := by
  simp [hermiteR_one]

/-- The Hermite recurrence over real coefficients:
`H_{n+1}=X*H_n-H_n'`. -/
lemma hermiteR_succ (n : ℕ) :
    HermiteR (n + 1) = X * HermiteR n - derivative (HermiteR n) := by
  simp [HermiteR, Polynomial.hermite_succ, Polynomial.map_mul, Polynomial.map_sub,
    derivative_map]

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

/-- The coefficient-side normalized Hermite polynomial has the same even
coefficients as `Cpoly d` through degree `2d`. -/
lemma hermiteCpoly_coeff_even_eq_Cpoly (d k : ℕ) (hd : 1 ≤ d) (hk : k ≤ d) :
    (HermiteCpoly d).coeff (2 * k) = (Cpoly d).coeff (2 * k) := by
  induction k with
  | zero =>
      rw [show 2 * 0 = (0 : ℕ) by omega]
      rw [hermiteCpoly_coeff_zero]
      rw [show (0 : ℕ) = 2 * 0 by omega, Cpoly_coeff_even]
      simp
  | succ k ih =>
      have hklt : k < d := Nat.succ_le_iff.mp hk
      have hkle : k ≤ d := le_of_lt hklt
      have ih' := ih hkle
      have hH := hermiteCpoly_coeff_even_succ d k hd hklt
      have hC := Cpoly_coeff_even_succ d k hd hklt
      let A : ℝ := ((2 * k + 1 : ℕ) : ℝ) * ((2 * k + 2 : ℕ) : ℝ) *
        (((2 * d : ℕ) : ℝ))
      have hA : A ≠ 0 := by
        have h1 : (0 : ℝ) < ((2 * k + 1 : ℕ) : ℝ) := by positivity
        have h2 : (0 : ℝ) < ((2 * k + 2 : ℕ) : ℝ) := by positivity
        have h3 : (0 : ℝ) < ((2 * d : ℕ) : ℝ) := by exact_mod_cast (by omega)
        exact (mul_pos (mul_pos h1 h2) h3).ne'
      apply mul_left_cancel₀ hA
      calc A * (HermiteCpoly d).coeff (2 * (k + 1))
          = (((2 * k : ℕ) : ℝ) - ((2 * d : ℕ) : ℝ)) *
              (HermiteCpoly d).coeff (2 * k) := by
              simpa [A, mul_assoc] using hH
        _ = (((2 * k : ℕ) : ℝ) - ((2 * d : ℕ) : ℝ)) *
              (Cpoly d).coeff (2 * k) := by
              rw [ih']
        _ = A * (Cpoly d).coeff (2 * (k + 1)) := by
              simpa [A, mul_assoc] using hC.symm

/-- Coefficient-side statement of the exact probabilists'-Hermite rescaling:
`C_d(w) = H_{2d}(w/sqrt(2d)) / H_{2d}(0)`. -/
lemma HermiteCpoly_eq_Cpoly (d : ℕ) (hd : 1 ≤ d) : HermiteCpoly d = Cpoly d := by
  ext m
  rcases Nat.even_or_odd m with he | ho
  · obtain ⟨k, hk⟩ := he
    subst hk
    rw [show k + k = 2 * k by omega]
    by_cases hkd : k ≤ d
    · exact hermiteCpoly_coeff_even_eq_Cpoly d k hd hkd
    · have hdk : d < k := lt_of_not_ge hkd
      rw [hermiteCpoly_coeff_even_gt d k hdk]
      rw [Cpoly_coeff_even]
      rw [Nat.descFactorial_of_lt hdk]
      simp
  · rw [hermiteCpoly_coeff_odd d m ho, Cpoly_coeff_odd d m ho]

/-! ## Degree facts for the Hermite root route -/

/-- The model polynomial has constant coefficient `1`. -/
lemma Cpoly_coeff_zero (d : ℕ) : (Cpoly d).coeff 0 = 1 := by
  rw [show (0 : ℕ) = 2 * 0 by omega, Cpoly_coeff_even]
  simp

/-- The top coefficient of `Cpoly d` is nonzero. -/
lemma Cpoly_coeff_top_ne_zero (d : ℕ) (hd : 1 ≤ d) :
    (Cpoly d).coeff (2 * d) ≠ 0 := by
  rw [Cpoly_coeff_even, Nat.descFactorial_self]
  have hnum : (-1 : ℝ) ^ d * (d.factorial : ℝ) ≠ 0 := by
    exact mul_ne_zero (pow_ne_zero _ (by norm_num)) (ne_of_gt (by positivity))
  have hden : (d : ℝ) ^ d * ((2 * d).factorial : ℝ) ≠ 0 := by
    exact ne_of_gt (by positivity)
  exact div_ne_zero hnum hden

/-- Coefficients of `Cpoly d` vanish above degree `2d`. -/
lemma Cpoly_coeff_gt_two_mul (d m : ℕ) (hm : 2 * d < m) :
    (Cpoly d).coeff m = 0 := by
  rcases Nat.even_or_odd m with he | ho
  · obtain ⟨k, hk⟩ := he
    subst hk
    rw [show k + k = 2 * k by omega, Cpoly_coeff_even]
    rw [Nat.descFactorial_of_lt (by omega : d < k)]
    simp
  · exact Cpoly_coeff_odd d m ho

/-- The model polynomial has degree exactly `2d`. -/
lemma Cpoly_natDegree (d : ℕ) (hd : 1 ≤ d) : (Cpoly d).natDegree = 2 * d := by
  apply le_antisymm
  · apply natDegree_le_iff_coeff_eq_zero.mpr
    intro m hm
    exact Cpoly_coeff_gt_two_mul d m hm
  · exact le_natDegree_of_ne_zero (Cpoly_coeff_top_ne_zero d hd)

/-- `Cpoly d` is nonzero. -/
lemma Cpoly_ne_zero (d : ℕ) : Cpoly d ≠ 0 := by
  intro h
  have h0 := Cpoly_coeff_zero d
  rw [h, coeff_zero] at h0
  norm_num at h0

/-- The derivative of `Cpoly d` has degree exactly `2d - 1`. -/
lemma Cpoly_derivative_natDegree (d : ℕ) (hd : 1 ≤ d) :
    (derivative (Cpoly d)).natDegree = 2 * d - 1 := by
  have hpos : 0 < (Cpoly d).natDegree := by
    rw [Cpoly_natDegree d hd]
    omega
  have hdeg := degree_derivative_eq (Cpoly d) hpos
  rw [Cpoly_natDegree d hd] at hdeg
  exact natDegree_eq_of_degree_eq_some (by simpa using hdeg)

/-- The derivative of `Cpoly d` is nonzero for positive `d`. -/
lemma Cpoly_derivative_ne_zero (d : ℕ) (hd : 1 ≤ d) :
    derivative (Cpoly d) ≠ 0 := by
  intro h
  have hdeg := Cpoly_derivative_natDegree d hd
  rw [h, natDegree_zero] at hdeg
  omega

/-! ## Root-insertion kernels for `L(p) = X*p - p'` -/

/-- If a real polynomial has opposite signs at two endpoints, it has a real root
strictly between them. -/
lemma exists_root_between_of_eval_mul_neg (p : ℝ[X]) {a b : ℝ} (hab : a < b)
    (hneg : p.eval a * p.eval b < 0) :
    ∃ x, a < x ∧ x < b ∧ p.eval x = 0 := by
  have hcont : ContinuousOn (fun x => p.eval x) (Set.Icc a b) :=
    p.continuous_aeval.continuousOn
  have hane : p.eval a ≠ 0 := by
    intro h
    rw [h, zero_mul] at hneg
    linarith
  rcases lt_or_gt_of_ne hane with ha | ha
  · have hb : 0 < p.eval b := by nlinarith [hneg, ha]
    have hmem : (0 : ℝ) ∈ Set.Ioo (p.eval a) (p.eval b) := ⟨ha, hb⟩
    obtain ⟨x, hx, hfx⟩ :=
      (intermediate_value_Ioo (le_of_lt hab) hcont) hmem
    exact ⟨x, hx.1, hx.2, hfx⟩
  · have hb : p.eval b < 0 := by nlinarith [hneg, ha]
    have hmem : (0 : ℝ) ∈ Set.Ioo (p.eval b) (p.eval a) := ⟨hb, ha⟩
    obtain ⟨x, hx, hfx⟩ :=
      (intermediate_value_Ioo' (le_of_lt hab) hcont) hmem
    exact ⟨x, hx.1, hx.2, hfx⟩

/-- Gap insertion for the Hermite recurrence operator `L(p)=X*p-p'`.

At roots `a,b` of `p`, the endpoint values of `L(p)` are `-p'(a)` and
`-p'(b)`. Opposite derivative signs therefore force a root of `L(p)` in
the gap. -/
lemma exists_root_X_mul_sub_derivative_between_of_derivative_mul_neg
    (p : ℝ[X]) {a b : ℝ} (hab : a < b)
    (ha : p.eval a = 0) (hb : p.eval b = 0)
    (hneg : (derivative p).eval a * (derivative p).eval b < 0) :
    ∃ x, a < x ∧ x < b ∧ (X * p - derivative p).eval x = 0 := by
  apply exists_root_between_of_eval_mul_neg (X * p - derivative p) hab
  have hLa : (X * p - derivative p).eval a = - (derivative p).eval a := by
    simp [ha]
  have hLb : (X * p - derivative p).eval b = - (derivative p).eval b := by
    simp [hb]
  rw [hLa, hLb]
  simpa using hneg

/-- If `a` is the rightmost root of a monic split real polynomial, then the
derivative is positive at `a`. This is the product formula for `p'` at a
root, with every erased-root factor `a-b` positive. -/
lemma derivative_eval_pos_of_monic_splits_rightmost_root
    {p : ℝ[X]} (hp : p.Monic) (hsplits : p.Splits) {a : ℝ}
    (ha : a ∈ p.roots)
    (hright : ∀ b ∈ p.roots.erase a, b < a) :
    0 < (derivative p).eval a := by
  rw [hsplits.eval_root_derivative hp ha]
  refine Multiset.prod_pos ?_
  intro x hx
  obtain ⟨b, hb, rfl⟩ := Multiset.mem_map.mp hx
  linarith [hright b hb]

/-- Moving the left-root signs into the explicit factor `(-1)^card` turns
all factors `a-b` into positive factors `b-a`. -/
lemma neg_one_pow_card_mul_prod_left_sub_eq_prod_sub_left
    (s : Multiset ℝ) (a : ℝ) :
    (-1 : ℝ) ^ s.card * (s.map (fun b => a - b)).prod =
      (s.map (fun b => b - a)).prod := by
  induction s using Multiset.induction_on with
  | empty =>
      simp
  | cons b s ih =>
      simp [pow_succ]
      rw [← ih]
      ring

/-- If `a` is the leftmost root of a monic split real polynomial, then the
derivative has the left-tail parity sign at `a`. -/
lemma neg_one_pow_card_erase_mul_derivative_eval_pos_of_monic_splits_leftmost_root
    {p : ℝ[X]} (hp : p.Monic) (hsplits : p.Splits) {a : ℝ}
    (ha : a ∈ p.roots)
    (hleft : ∀ b ∈ p.roots.erase a, a < b) :
    0 < (-1 : ℝ) ^ (p.roots.erase a).card * (derivative p).eval a := by
  rw [hsplits.eval_root_derivative hp ha]
  rw [neg_one_pow_card_mul_prod_left_sub_eq_prod_sub_left]
  refine Multiset.prod_pos ?_
  intro x hx
  obtain ⟨b, hb, rfl⟩ := Multiset.mem_map.mp hx
  linarith [hleft b hb]

/-- If every element of a multiset lies outside the open gap `(a,b)`, then
the paired factors `(a-c)(b-c)` have positive product. -/
lemma prod_mul_sub_pos_of_forall_outside_gap
    (s : Multiset ℝ) {a b : ℝ} (hab : a < b)
    (hout : ∀ c ∈ s, c < a ∨ b < c) :
    0 < (s.map (fun c => (a - c) * (b - c))).prod := by
  refine Multiset.prod_pos ?_
  intro x hx
  obtain ⟨c, hc, rfl⟩ := Multiset.mem_map.mp hx
  rcases hout c hc with hca | hbc
  · nlinarith
  · nlinarith

/-- In a strictly sorted list, any element whose index is not one of an
adjacent pair lies outside the open interval between that pair. -/
lemma sortedLT_getElem_outside_adjacent
    {l : List ℝ} (hs : l.SortedLT) {i j : ℕ}
    (hi : i + 1 < l.length) (hj : j < l.length)
    (hji : j ≠ i) (hjs : j ≠ i + 1) :
    l[j] < l[i] ∨ l[i + 1] < l[j] := by
  have hi0 : i < l.length := by omega
  by_cases hlt : j < i
  · left
    exact hs.getElem_lt_getElem_of_lt (i := j) (j := i) hlt
  · right
    have hsij : i + 1 < j := by omega
    exact hs.getElem_lt_getElem_of_lt (i := i + 1) (j := j) hsij

/-- Membership form of `sortedLT_getElem_outside_adjacent`. This is the
ordered-root-list bridge used to feed the adjacent-gap Hermite insertion
lemma. -/
lemma sortedLT_mem_outside_adjacent
    {l : List ℝ} (hs : l.SortedLT) {i : ℕ}
    (hi : i + 1 < l.length) {c : ℝ} (hc : c ∈ l)
    (hci : c ≠ l[i]) (hcs : c ≠ l[i + 1]) :
    c < l[i] ∨ l[i + 1] < c := by
  have hmem : ∃ x ∈ l, x = c := ⟨c, hc, rfl⟩
  rw [List.exists_mem_iff_getElem] at hmem
  obtain ⟨j, hj, hjc⟩ := hmem
  have hji : j ≠ i := by
    intro h
    subst j
    exact hci hjc.symm
  have hjs : j ≠ i + 1 := by
    intro h
    subst j
    exact hcs hjc.symm
  rcases sortedLT_getElem_outside_adjacent hs hi hj hji hjs with hleft | hright
  · left
    simpa [hjc] using hleft
  · right
    simpa [hjc] using hright

/-- Quantified outside-gap form for a sub-multiset whose elements are drawn
from a strictly sorted list and are not the adjacent endpoints. -/
lemma sortedLT_forall_mem_outside_adjacent
    {l : List ℝ} (hs : l.SortedLT) {i : ℕ}
    (hi : i + 1 < l.length) {s : Multiset ℝ}
    (hsub : ∀ c ∈ s, c ∈ l)
    (hne_i : ∀ c ∈ s, c ≠ l[i])
    (hne_succ : ∀ c ∈ s, c ≠ l[i + 1]) :
    ∀ c ∈ s, c < l[i] ∨ l[i + 1] < c := by
  intro c hc
  exact sortedLT_mem_outside_adjacent hs hi (hsub c hc) (hne_i c hc) (hne_succ c hc)

/-- If a nodup multiset has the same elements as a strictly sorted list, then
erasing an adjacent pair from the multiset produces only elements outside the
open interval between that pair. -/
lemma sortedLT_erase_erase_outside_adjacent_of_mem_iff
    {l : List ℝ} (hs : l.SortedLT) {s : Multiset ℝ} (hnd : s.Nodup)
    (hmem : ∀ c : ℝ, c ∈ s ↔ c ∈ l) {i : ℕ}
    (hi : i + 1 < l.length) :
    ∀ c ∈ (s.erase (l[i]'(by omega))).erase (l[i + 1]'hi),
      c < l[i]'(by omega) ∨ l[i + 1]'hi < c := by
  intro c hc
  have hcEraseLeft : c ∈ s.erase (l[i]'(by omega)) := Multiset.mem_of_mem_erase hc
  have hcs : c ∈ s := Multiset.mem_of_mem_erase hcEraseLeft
  have hci : c ≠ l[i]'(by omega) := (hnd.mem_erase_iff.mp hcEraseLeft).1
  have hndEraseLeft : (s.erase (l[i]'(by omega))).Nodup :=
    hnd.erase (l[i]'(by omega))
  have hcsucc : c ≠ l[i + 1]'hi := (hndEraseLeft.mem_erase_iff.mp hc).1
  exact sortedLT_mem_outside_adjacent hs hi ((hmem c).mp hcs) hci hcsucc

/-- Every non-first member of a strictly sorted list lies to the right of the
first member. -/
lemma sortedLT_mem_right_of_first
    {l : List ℝ} (hs : l.SortedLT) (h0 : 0 < l.length)
    {c : ℝ} (hc : c ∈ l) (hc0 : c ≠ l[0]) :
    l[0] < c := by
  have hmem : ∃ x ∈ l, x = c := ⟨c, hc, rfl⟩
  rw [List.exists_mem_iff_getElem] at hmem
  obtain ⟨j, hj, hjc⟩ := hmem
  have hj0 : j ≠ 0 := by
    intro h
    subst j
    exact hc0 hjc.symm
  have h0j : 0 < j := by omega
  have hlt := hs.getElem_lt_getElem_of_lt (i := 0) (j := j) (hi := h0) (hj := hj) h0j
  simpa [hjc] using hlt

/-- Every non-last member of a strictly sorted list lies to the left of the
last member. -/
lemma sortedLT_mem_left_of_last
    {l : List ℝ} (hs : l.SortedLT) {i : ℕ}
    (hi : i < l.length) (hlast : i + 1 = l.length)
    {c : ℝ} (hc : c ∈ l) (hci : c ≠ l[i]) :
    c < l[i] := by
  have hmem : ∃ x ∈ l, x = c := ⟨c, hc, rfl⟩
  rw [List.exists_mem_iff_getElem] at hmem
  obtain ⟨j, hj, hjc⟩ := hmem
  have hji : j ≠ i := by
    intro h
    subst j
    exact hci hjc.symm
  have hlt : j < i := by omega
  have hout := hs.getElem_lt_getElem_of_lt (i := j) (j := i) (hi := hj) (hj := hi) hlt
  simpa [hjc] using hout

/-- A point left of the first element of a sorted list lies left of every
point between an adjacent pair. -/
lemma sortedLT_left_tail_lt_between
    {l : List ℝ} (hs : l.SortedLT) (h0 : 0 < l.length) {i : ℕ}
    (hi : i + 1 < l.length) {x y : ℝ}
    (hx : x < l[0]) (hy : l[i] < y ∧ y < l[i + 1]) :
    x < y := by
  have h0i : l[0] ≤ l[i] :=
    hs.sortedLE.getElem_le_getElem_of_le (i := 0) (j := i)
      (hi := h0) (hj := by omega) (by omega)
  linarith

/-- A point between an earlier adjacent pair of a sorted list lies left of a
point between a later adjacent pair. -/
lemma sortedLT_between_lt_between_of_index_lt
    {l : List ℝ} (hs : l.SortedLT) {i j : ℕ}
    (hi : i + 1 < l.length) (hj : j + 1 < l.length) (hij : i < j)
    {x y : ℝ}
    (hx : l[i] < x ∧ x < l[i + 1])
    (hy : l[j] < y ∧ y < l[j + 1]) :
    x < y := by
  have hbridge : l[i + 1] ≤ l[j] :=
    hs.sortedLE.getElem_le_getElem_of_le (i := i + 1) (j := j)
      (hi := hi) (hj := by omega) (by omega)
  linarith

/-- A point between an adjacent pair of a sorted list lies left of every point
right of the last element. -/
lemma sortedLT_between_lt_right_tail
    {l : List ℝ} (hs : l.SortedLT) {i last : ℕ}
    (hi : i + 1 < l.length) (hlast : last < l.length)
    (hlast_eq : last + 1 = l.length) {x y : ℝ}
    (hx : l[i] < x ∧ x < l[i + 1]) (hy : l[last] < y) :
    x < y := by
  have hbridge : l[i + 1] ≤ l[last] :=
    hs.sortedLE.getElem_le_getElem_of_le (i := i + 1) (j := last)
      (hi := hi) (hj := hlast) (by omega)
  linarith

/-- A point left of the first element lies left of every point right of the
last element of a nonempty sorted list. -/
lemma sortedLT_left_tail_lt_right_tail
    {l : List ℝ} (hs : l.SortedLT) (h0 : 0 < l.length) {last : ℕ}
    (hlast : last < l.length) (hlast_eq : last + 1 = l.length)
    {x y : ℝ} (hx : x < l[0]) (hy : l[last] < y) :
    x < y := by
  have hbridge : l[0] ≤ l[last] :=
    hs.sortedLE.getElem_le_getElem_of_le (i := 0) (j := last)
      (hi := h0) (hj := hlast) (by omega)
  linarith

/-- Sorting a nodup multiset by `≤` gives a strictly sorted list. This is the
simple-root bridge from multiset roots to ordered root lists. -/
lemma sortedLT_sort_le_of_nodup (s : Multiset ℝ) (hnd : s.Nodup) :
    (s.sort (fun x y : ℝ => x ≤ y)).SortedLT := by
  apply List.SortedLE.sortedLT_of_nodup
  · exact (Multiset.pairwise_sort (s := s) (r := fun x y : ℝ => x ≤ y)).sortedLE
  · rw [← Multiset.coe_nodup]
    rw [Multiset.sort_eq]
    exact hnd

/-- If the Hermite roots are nodup, their sorted list is strictly increasing. -/
lemma hermiteRRootsSorted_sortedLT (n : ℕ)
    (hnd : (HermiteR n).roots.Nodup) :
    (HermiteRRootsSorted n).SortedLT := by
  simpa [HermiteRRootsSorted] using sortedLT_sort_le_of_nodup (HermiteR n).roots hnd

/-- Direct sorted-multiset outside-gap bridge for adjacent indices in
`s.sort (· ≤ ·)`. -/
lemma sortedLT_sort_le_erase_erase_outside_adjacent
    (s : Multiset ℝ) (hnd : s.Nodup) {i : ℕ}
    (hi : i + 1 < (s.sort (fun x y : ℝ => x ≤ y)).length) :
    ∀ c ∈
        (s.erase ((s.sort (fun x y : ℝ => x ≤ y))[i]'(by omega))).erase
          ((s.sort (fun x y : ℝ => x ≤ y))[i + 1]'hi),
      c < (s.sort (fun x y : ℝ => x ≤ y))[i]'(by omega) ∨
        (s.sort (fun x y : ℝ => x ≤ y))[i + 1]'hi < c :=
  sortedLT_erase_erase_outside_adjacent_of_mem_iff
    (sortedLT_sort_le_of_nodup s hnd) hnd
    (fun c => by simp [Multiset.mem_sort]) hi

/-- The same outside-gap bridge for a strictly sorted view of a multiset. -/
lemma sortedLT_sort_mem_outside_adjacent
    (s : Multiset ℝ) (hs : (s.sort (fun x y : ℝ => x ≤ y)).SortedLT) {i : ℕ}
    (hi : i + 1 < (s.sort (fun x y : ℝ => x ≤ y)).length) {c : ℝ} (hc : c ∈ s)
    (hci : c ≠ (s.sort (fun x y : ℝ => x ≤ y))[i]'(by omega))
    (hcs : c ≠ (s.sort (fun x y : ℝ => x ≤ y))[i + 1]'hi) :
    c < (s.sort (fun x y : ℝ => x ≤ y))[i]'(by omega) ∨
      (s.sort (fun x y : ℝ => x ≤ y))[i + 1]'hi < c :=
  sortedLT_mem_outside_adjacent hs hi (by simpa [Multiset.mem_sort] using hc) hci hcs

/-- Consecutive-root sign alternation for a monic split real polynomial.
The hypothesis says that, after erasing `a` and `b`, all remaining roots lie
outside the open gap `(a,b)`. Then the derivative signs at `a` and `b` are
opposite. -/
lemma derivative_eval_mul_neg_of_monic_splits_adjacent_roots
    {p : ℝ[X]} (hp : p.Monic) (hsplits : p.Splits) {a b : ℝ}
    (hab : a < b) (ha : a ∈ p.roots) (hb : b ∈ p.roots.erase a)
    (hgap : ∀ c ∈ (p.roots.erase a).erase b, c < a ∨ b < c) :
    (derivative p).eval a * (derivative p).eval b < 0 := by
  let s : Multiset ℝ := (p.roots.erase a).erase b
  have hbroot : b ∈ p.roots := Multiset.mem_of_mem_erase hb
  have hane : a ≠ b := ne_of_lt hab
  have haEraseB : a ∈ p.roots.erase b := by
    rw [Multiset.mem_erase_of_ne hane]
    exact ha
  rw [hsplits.eval_root_derivative hp ha,
    hsplits.eval_root_derivative hp hbroot]
  have hA :
      ((p.roots.erase a).map (fun c => a - c)).prod =
        (a - b) * (s.map (fun c => a - c)).prod := by
    rw [← Multiset.cons_erase hb, Multiset.map_cons, Multiset.prod_cons]
  have hB :
      ((p.roots.erase b).map (fun c => b - c)).prod =
        (b - a) * (s.map (fun c => b - c)).prod := by
    rw [← Multiset.cons_erase haEraseB, Multiset.map_cons, Multiset.prod_cons]
    rw [← Multiset.erase_comm p.roots a b]
  rw [hA, hB]
  have hpaired :
      0 < (s.map (fun c => a - c)).prod * (s.map (fun c => b - c)).prod := by
    rw [← Multiset.prod_map_mul]
    exact prod_mul_sub_pos_of_forall_outside_gap s hab (by simpa [s] using hgap)
  have hfirst : (a - b) * (b - a) < 0 := by
    nlinarith
  nlinarith

/-- Adjacent-root gap insertion for the Hermite recurrence operator. If
`a < b` are adjacent roots of a monic split `p` (encoded by the erased-roots
outside-gap condition), then `L(p)=X*p-p'` has a root strictly inside
`(a,b)`. -/
lemma exists_root_X_mul_sub_derivative_between_of_monic_splits_adjacent_roots
    {p : ℝ[X]} (hp : p.Monic) (hsplits : p.Splits) {a b : ℝ}
    (hab : a < b) (ha : a ∈ p.roots) (hb : b ∈ p.roots.erase a)
    (hgap : ∀ c ∈ (p.roots.erase a).erase b, c < a ∨ b < c) :
    ∃ x, a < x ∧ x < b ∧ (X * p - derivative p).eval x = 0 := by
  have hbroot : b ∈ p.roots := Multiset.mem_of_mem_erase hb
  have haeval : p.eval a = 0 := by
    simpa [Polynomial.IsRoot] using Polynomial.isRoot_of_mem_roots ha
  have hbeval : p.eval b = 0 := by
    simpa [Polynomial.IsRoot] using Polynomial.isRoot_of_mem_roots hbroot
  exact exists_root_X_mul_sub_derivative_between_of_derivative_mul_neg p hab haeval hbeval
    (derivative_eval_mul_neg_of_monic_splits_adjacent_roots hp hsplits hab ha hb hgap)

/-- Right-tail insertion: a polynomial with positive leading coefficient and
positive degree crosses to the right of any point where its value is negative. -/
lemma exists_root_right_of_eval_neg_of_leadingCoeff_pos (p : ℝ[X]) {a : ℝ}
    (hdeg : 0 < p.degree) (hlc : 0 < p.leadingCoeff) (ha : p.eval a < 0) :
    ∃ x, a < x ∧ p.eval x = 0 := by
  have htend := p.tendsto_atTop_of_leadingCoeff_nonneg hdeg hlc.le
  obtain ⟨b, hb⟩ := (htend.eventually_gt_atTop 0).exists_forall_of_atTop
  let B := max b (a + 1)
  have hBpos : 0 < p.eval B := hb B (le_max_left _ _)
  have haB : a < B := lt_of_lt_of_le (by linarith) (le_max_right _ _)
  obtain ⟨x, hax, _hxB, hx0⟩ := exists_root_between_of_eval_mul_neg p haB (by
    nlinarith [ha, hBpos])
  exact ⟨x, hax, hx0⟩

/-- For monic `p`, the Hermite recurrence operator `X*p-p'` has degree
one larger than `p`. -/
lemma natDegree_X_mul_sub_derivative_of_monic {p : ℝ[X]} (hp : p.Monic) :
    (X * p - derivative p).natDegree = p.natDegree + 1 := by
  have hpne : p ≠ 0 := hp.ne_zero
  have hlt : (derivative p).natDegree < (X * p).natDegree := by
    rw [natDegree_X_mul hpne]
    exact lt_of_le_of_lt (natDegree_derivative_le p) (by omega)
  rw [natDegree_sub_eq_left_of_natDegree_lt hlt]
  exact natDegree_X_mul hpne

/-- For monic `p`, the Hermite recurrence operator `X*p-p'` is monic. -/
lemma leadingCoeff_X_mul_sub_derivative_of_monic {p : ℝ[X]} (hp : p.Monic) :
    (X * p - derivative p).leadingCoeff = 1 := by
  have hpne : p ≠ 0 := hp.ne_zero
  have hlt_nat : (derivative p).natDegree < (X * p).natDegree := by
    rw [natDegree_X_mul hpne]
    exact lt_of_le_of_lt (natDegree_derivative_le p) (by omega)
  have hlt : (derivative p).degree < (X * p).degree := degree_lt_degree hlt_nat
  rw [leadingCoeff_sub_of_degree_lt hlt]
  exact (monic_X.mul hp).leadingCoeff

/-- Right-tail insertion for the Hermite recurrence operator at a root whose
derivative is positive. This is the largest-root tail case in the ordered-root
induction. -/
lemma exists_root_right_X_mul_sub_derivative_of_monic_of_derivative_pos
    {p : ℝ[X]} (hp : p.Monic) {a : ℝ}
    (ha : p.eval a = 0) (hder : 0 < (derivative p).eval a) :
    ∃ x, a < x ∧ (X * p - derivative p).eval x = 0 := by
  let L : ℝ[X] := X * p - derivative p
  have hdeg_nat : 0 < L.natDegree := by
    rw [show L = X * p - derivative p by rfl]
    rw [natDegree_X_mul_sub_derivative_of_monic hp]
    exact Nat.succ_pos _
  have hdeg : 0 < L.degree := natDegree_pos_iff_degree_pos.mp hdeg_nat
  have hlc : 0 < L.leadingCoeff := by
    rw [show L = X * p - derivative p by rfl]
    rw [leadingCoeff_X_mul_sub_derivative_of_monic hp]
    norm_num
  have hLa : L.eval a < 0 := by
    simp [L, ha]
    nlinarith
  exact exists_root_right_of_eval_neg_of_leadingCoeff_pos L hdeg hlc hLa

/-- Right-tail insertion stated in terms of the rightmost root in the roots
multiset of a monic split polynomial. -/
lemma exists_root_right_X_mul_sub_derivative_of_monic_splits_rightmost_root
    {p : ℝ[X]} (hp : p.Monic) (hsplits : p.Splits) {a : ℝ}
    (ha : a ∈ p.roots)
    (hright : ∀ b ∈ p.roots.erase a, b < a) :
    ∃ x, a < x ∧ (X * p - derivative p).eval x = 0 := by
  have haeval : p.eval a = 0 := by
    simpa [Polynomial.IsRoot] using Polynomial.isRoot_of_mem_roots ha
  exact exists_root_right_X_mul_sub_derivative_of_monic_of_derivative_pos hp haeval
    (derivative_eval_pos_of_monic_splits_rightmost_root hp hsplits ha hright)

/-- Left-tail insertion: a polynomial with positive leading coefficient and
positive degree crosses to the left of any point whose value has opposite sign
to the left tail. -/
lemma exists_root_left_of_neg_one_pow_mul_eval_neg_of_leadingCoeff_pos
    (p : ℝ[X]) {a : ℝ} (hdeg : 0 < p.degree)
    (hlc : 0 < p.leadingCoeff)
    (ha : (-1 : ℝ) ^ p.natDegree * p.eval a < 0) :
    ∃ x, x < a ∧ p.eval x = 0 := by
  let s : ℝ := (-1 : ℝ) ^ p.natDegree
  let q : ℝ[X] := Polynomial.C s * p.comp (-X)
  have hs : s ≠ 0 := pow_ne_zero _ (by norm_num)
  have hsu : IsUnit s := by
    dsimp [s]
    rcases Nat.even_or_odd p.natDegree with he | ho
    · rw [he.neg_one_pow]
      exact isUnit_one
    · rw [ho.neg_one_pow]
      exact (isUnit_one).neg
  have hs2 : s * s = 1 := by
    dsimp [s]
    rw [← pow_two, ← pow_mul]
    norm_num
  have hqnat : q.natDegree = p.natDegree := by
    change (Polynomial.C s * p.comp (-X)).natDegree = p.natDegree
    rw [natDegree_C_mul hs, natDegree_comp]
    simp
  have hqdeg : 0 < q.degree := by
    apply natDegree_pos_iff_degree_pos.mp
    rw [hqnat]
    exact natDegree_pos_iff_degree_pos.mpr hdeg
  have hqlc : 0 < q.leadingCoeff := by
    change 0 < (Polynomial.C s * p.comp (-X)).leadingCoeff
    rw [leadingCoeff_C_mul_of_isUnit hsu]
    rw [comp_neg_X_leadingCoeff_eq]
    change 0 < s * (s * p.leadingCoeff)
    rw [← mul_assoc, hs2, one_mul]
    exact hlc
  have hqa : q.eval (-a) < 0 := by
    simpa [q, s] using ha
  obtain ⟨y, hy, hyroot⟩ :=
    exists_root_right_of_eval_neg_of_leadingCoeff_pos q hqdeg hqlc hqa
  refine ⟨-y, by linarith, ?_⟩
  have hyroot' : s * p.eval (-y) = 0 := by
    simpa [q, s] using hyroot
  exact (mul_eq_zero.mp hyroot').resolve_left hs

/-- Left-tail insertion for the Hermite recurrence operator. The sign
condition is written in the natural left-tail form for `L(p)`. -/
lemma exists_root_left_X_mul_sub_derivative_of_monic
    {p : ℝ[X]} (hp : p.Monic) {a : ℝ}
    (hleft : (-1 : ℝ) ^ (X * p - derivative p).natDegree *
        (X * p - derivative p).eval a < 0) :
    ∃ x, x < a ∧ (X * p - derivative p).eval x = 0 := by
  let L : ℝ[X] := X * p - derivative p
  have hdeg_nat : 0 < L.natDegree := by
    rw [show L = X * p - derivative p by rfl]
    rw [natDegree_X_mul_sub_derivative_of_monic hp]
    exact Nat.succ_pos _
  have hdeg : 0 < L.degree := natDegree_pos_iff_degree_pos.mp hdeg_nat
  have hlc : 0 < L.leadingCoeff := by
    rw [show L = X * p - derivative p by rfl]
    rw [leadingCoeff_X_mul_sub_derivative_of_monic hp]
    norm_num
  exact exists_root_left_of_neg_one_pow_mul_eval_neg_of_leadingCoeff_pos
    L hdeg hlc (by simpa [L] using hleft)

/-- Left-tail insertion stated in terms of the leftmost root in the roots
multiset of a monic split polynomial. The card hypothesis is the simple-root
accounting needed to identify the erased-root parity with `p.natDegree - 1`. -/
lemma exists_root_left_X_mul_sub_derivative_of_monic_splits_leftmost_root
    {p : ℝ[X]} (hp : p.Monic) (hsplits : p.Splits) {a : ℝ}
    (ha : a ∈ p.roots)
    (hleft : ∀ b ∈ p.roots.erase a, a < b)
    (hcard : (p.roots.erase a).card + 1 = p.natDegree) :
    ∃ x, x < a ∧ (X * p - derivative p).eval x = 0 := by
  have haeval : p.eval a = 0 := by
    simpa [Polynomial.IsRoot] using Polynomial.isRoot_of_mem_roots ha
  have hsgn :
      0 < (-1 : ℝ) ^ (p.roots.erase a).card * (derivative p).eval a :=
    neg_one_pow_card_erase_mul_derivative_eval_pos_of_monic_splits_leftmost_root
      hp hsplits ha hleft
  apply exists_root_left_X_mul_sub_derivative_of_monic hp
  have hnat :
      (X * p - derivative p).natDegree = (p.roots.erase a).card + 2 := by
    rw [natDegree_X_mul_sub_derivative_of_monic hp]
    omega
  have hpow :
      (-1 : ℝ) ^ ((p.roots.erase a).card + 2) =
        (-1 : ℝ) ^ (p.roots.erase a).card := by
    rw [pow_add]
    norm_num
  have hLa :
      (X * p - derivative p).eval a = - (derivative p).eval a := by
    simp [haeval]
  rw [hnat, hpow, hLa]
  nlinarith

/-- Hermite recurrence gap insertion, stated directly for `HermiteR (n+1)`.
This packages the generic adjacent-root insertion with `H_{n+1}=XH_n-H_n'`. -/
lemma exists_root_between_hermiteR_succ_of_adjacent_roots
    (n : ℕ) (hsplits : (HermiteR n).Splits) {a b : ℝ}
    (hab : a < b) (ha : a ∈ (HermiteR n).roots)
    (hb : b ∈ (HermiteR n).roots.erase a)
    (hgap : ∀ c ∈ ((HermiteR n).roots.erase a).erase b, c < a ∨ b < c) :
    ∃ x, a < x ∧ x < b ∧ (HermiteR (n + 1)).eval x = 0 := by
  obtain ⟨x, hax, hxb, hxroot⟩ :=
    exists_root_X_mul_sub_derivative_between_of_monic_splits_adjacent_roots
      (hermiteR_monic n) hsplits hab ha hb hgap
  exact ⟨x, hax, hxb, by simpa [hermiteR_succ] using hxroot⟩

/-- Hermite recurrence right-tail insertion, stated directly for
`HermiteR (n+1)`. -/
lemma exists_root_right_hermiteR_succ_of_rightmost_root
    (n : ℕ) (hsplits : (HermiteR n).Splits) {a : ℝ}
    (ha : a ∈ (HermiteR n).roots)
    (hright : ∀ b ∈ (HermiteR n).roots.erase a, b < a) :
    ∃ x, a < x ∧ (HermiteR (n + 1)).eval x = 0 := by
  obtain ⟨x, hax, hxroot⟩ :=
    exists_root_right_X_mul_sub_derivative_of_monic_splits_rightmost_root
      (hermiteR_monic n) hsplits ha hright
  exact ⟨x, hax, by simpa [hermiteR_succ] using hxroot⟩

/-- Hermite recurrence left-tail insertion, stated directly for
`HermiteR (n+1)`. -/
lemma exists_root_left_hermiteR_succ_of_leftmost_root
    (n : ℕ) (hsplits : (HermiteR n).Splits) {a : ℝ}
    (ha : a ∈ (HermiteR n).roots)
    (hleft : ∀ b ∈ (HermiteR n).roots.erase a, a < b)
    (hcard : ((HermiteR n).roots.erase a).card + 1 = (HermiteR n).natDegree) :
    ∃ x, x < a ∧ (HermiteR (n + 1)).eval x = 0 := by
  obtain ⟨x, hxa, hxroot⟩ :=
    exists_root_left_X_mul_sub_derivative_of_monic_splits_leftmost_root
      (hermiteR_monic n) hsplits ha hleft hcard
  exact ⟨x, hxa, by simpa [hermiteR_succ] using hxroot⟩

/-- Indexed adjacent-root insertion for the sorted Hermite roots. If
`H_n` splits with nodup roots, then each adjacent pair in the sorted root list
brackets a root of `H_{n+1}`. -/
lemma exists_root_between_hermiteR_succ_of_sorted_adjacent
    (n : ℕ) (hsplits : (HermiteR n).Splits)
    (hnd : (HermiteR n).roots.Nodup) {i : ℕ}
    (hi : i + 1 < (HermiteRRootsSorted n).length) :
    ∃ x, (HermiteRRootsSorted n)[i]'(by omega) < x ∧
      x < (HermiteRRootsSorted n)[i + 1]'hi ∧
      (HermiteR (n + 1)).eval x = 0 := by
  have hsorted := hermiteRRootsSorted_sortedLT n hnd
  have hab :
      (HermiteRRootsSorted n)[i]'(by omega) <
        (HermiteRRootsSorted n)[i + 1]'hi :=
    hsorted.getElem_lt_getElem_of_lt (i := i) (j := i + 1)
      (hi := by omega) (hj := hi) (by omega)
  have ha :
      (HermiteRRootsSorted n)[i]'(by omega) ∈ (HermiteR n).roots :=
    hermiteRRootsSorted_get_mem_roots n (i := i) (by omega)
  have hbroot :
      (HermiteRRootsSorted n)[i + 1]'hi ∈ (HermiteR n).roots :=
    hermiteRRootsSorted_get_mem_roots n (i := i + 1) hi
  have hb :
      (HermiteRRootsSorted n)[i + 1]'hi ∈
        (HermiteR n).roots.erase ((HermiteRRootsSorted n)[i]'(by omega)) := by
    rw [Multiset.mem_erase_of_ne (ne_of_gt hab)]
    exact hbroot
  have hgap :
      ∀ c ∈
          ((HermiteR n).roots.erase ((HermiteRRootsSorted n)[i]'(by omega))).erase
            ((HermiteRRootsSorted n)[i + 1]'hi),
        c < (HermiteRRootsSorted n)[i]'(by omega) ∨
          (HermiteRRootsSorted n)[i + 1]'hi < c := by
    simpa [HermiteRRootsSorted] using
      sortedLT_sort_le_erase_erase_outside_adjacent (HermiteR n).roots hnd
        (i := i) (by simpa [HermiteRRootsSorted] using hi)
  exact exists_root_between_hermiteR_succ_of_adjacent_roots
    n hsplits hab ha hb hgap

/-- Left-tail insertion for the first element of the sorted Hermite root list. -/
lemma exists_root_left_hermiteR_succ_of_sorted_first
    (n : ℕ) (hsplits : (HermiteR n).Splits)
    (hnd : (HermiteR n).roots.Nodup)
    (h0 : 0 < (HermiteRRootsSorted n).length) :
    ∃ x, x < (HermiteRRootsSorted n)[0]'h0 ∧
      (HermiteR (n + 1)).eval x = 0 := by
  have hsorted := hermiteRRootsSorted_sortedLT n hnd
  have ha :
      (HermiteRRootsSorted n)[0]'h0 ∈ (HermiteR n).roots :=
    hermiteRRootsSorted_get_mem_roots n (i := 0) h0
  have hleft :
      ∀ b ∈ (HermiteR n).roots.erase ((HermiteRRootsSorted n)[0]'h0),
        (HermiteRRootsSorted n)[0]'h0 < b := by
    intro b hb
    have hbroot : b ∈ (HermiteR n).roots := Multiset.mem_of_mem_erase hb
    have hbne : b ≠ (HermiteRRootsSorted n)[0]'h0 := (hnd.mem_erase_iff.mp hb).1
    exact sortedLT_mem_right_of_first hsorted h0
      ((mem_hermiteRRootsSorted_iff n).mpr hbroot) hbne
  have hcard :
      ((HermiteR n).roots.erase ((HermiteRRootsSorted n)[0]'h0)).card + 1 =
        (HermiteR n).natDegree := by
    have h := Multiset.card_erase_add_one ha
    rwa [← hsplits.natDegree_eq_card_roots] at h
  exact exists_root_left_hermiteR_succ_of_leftmost_root n hsplits ha hleft hcard

/-- Right-tail insertion for the last element of the sorted Hermite root list. -/
lemma exists_root_right_hermiteR_succ_of_sorted_last
    (n : ℕ) (hsplits : (HermiteR n).Splits)
    (hnd : (HermiteR n).roots.Nodup) {i : ℕ}
    (hi : i < (HermiteRRootsSorted n).length)
    (hlast : i + 1 = (HermiteRRootsSorted n).length) :
    ∃ x, (HermiteRRootsSorted n)[i]'hi < x ∧
      (HermiteR (n + 1)).eval x = 0 := by
  have hsorted := hermiteRRootsSorted_sortedLT n hnd
  have ha :
      (HermiteRRootsSorted n)[i]'hi ∈ (HermiteR n).roots :=
    hermiteRRootsSorted_get_mem_roots n (i := i) hi
  have hright :
      ∀ b ∈ (HermiteR n).roots.erase ((HermiteRRootsSorted n)[i]'hi),
        b < (HermiteRRootsSorted n)[i]'hi := by
    intro b hb
    have hbroot : b ∈ (HermiteR n).roots := Multiset.mem_of_mem_erase hb
    have hbne : b ≠ (HermiteRRootsSorted n)[i]'hi := (hnd.mem_erase_iff.mp hb).1
    exact sortedLT_mem_left_of_last hsorted hi hlast
      ((mem_hermiteRRootsSorted_iff n).mpr hbroot) hbne
  exact exists_root_right_hermiteR_succ_of_rightmost_root n hsplits ha hright

/-- The sorted left/gap/right construction gives `length + 1` distinct roots
of the next Hermite polynomial. This is the finite-count object needed to
turn the insertion lemmas into the real-rootedness induction. -/
lemma exists_finset_roots_hermiteR_succ_card
    (n : ℕ) (hsplits : (HermiteR n).Splits)
    (hnd : (HermiteR n).roots.Nodup)
    (h0 : 0 < (HermiteRRootsSorted n).length) :
    ∃ S : Finset ℝ,
      S.card = (HermiteRRootsSorted n).length + 1 ∧
      ∀ x ∈ S, (HermiteR (n + 1)).eval x = 0 := by
  classical
  let m : ℕ := (HermiteRRootsSorted n).length
  have hm0 : 0 < m := by simpa [m] using h0
  have hsorted := hermiteRRootsSorted_sortedLT n hnd
  let leftExists := exists_root_left_hermiteR_succ_of_sorted_first n hsplits hnd h0
  let left : ℝ := Classical.choose leftExists
  have leftSpec : left < (HermiteRRootsSorted n)[0]'h0 ∧
      (HermiteR (n + 1)).eval left = 0 :=
    Classical.choose_spec leftExists
  have hlast_idx : m - 1 < (HermiteRRootsSorted n).length := by
    dsimp [m]
    omega
  have hlast_eq : (m - 1) + 1 = (HermiteRRootsSorted n).length := by
    dsimp [m]
    omega
  let rightExists :=
    exists_root_right_hermiteR_succ_of_sorted_last n hsplits hnd
      (i := m - 1) hlast_idx hlast_eq
  let right : ℝ := Classical.choose rightExists
  have rightSpec : (HermiteRRootsSorted n)[m - 1]'hlast_idx < right ∧
      (HermiteR (n + 1)).eval right = 0 :=
    Classical.choose_spec rightExists
  have hgapIndex (k : Fin (m - 1)) :
      k.1 + 1 < (HermiteRRootsSorted n).length := by
    dsimp [m] at k
    omega
  let gapExists (k : Fin (m - 1)) :=
    exists_root_between_hermiteR_succ_of_sorted_adjacent n hsplits hnd
      (i := k.1) (hgapIndex k)
  let gap (k : Fin (m - 1)) : ℝ := Classical.choose (gapExists k)
  have gapSpec (k : Fin (m - 1)) :
      (HermiteRRootsSorted n)[k.1]'(by omega) < gap k ∧
        gap k < (HermiteRRootsSorted n)[k.1 + 1]'(hgapIndex k) ∧
        (HermiteR (n + 1)).eval (gap k) = 0 :=
    Classical.choose_spec (gapExists k)
  have hgap_inj : Function.Injective gap := by
    intro a b hab
    by_cases hlt : a.1 < b.1
    · have hlt_gap : gap a < gap b :=
        sortedLT_between_lt_between_of_index_lt hsorted
          (hgapIndex a) (hgapIndex b) hlt
          ⟨(gapSpec a).1, (gapSpec a).2.1⟩
          ⟨(gapSpec b).1, (gapSpec b).2.1⟩
      linarith
    · by_cases hgt : b.1 < a.1
      · have hlt_gap : gap b < gap a :=
          sortedLT_between_lt_between_of_index_lt hsorted
            (hgapIndex b) (hgapIndex a) hgt
            ⟨(gapSpec b).1, (gapSpec b).2.1⟩
            ⟨(gapSpec a).1, (gapSpec a).2.1⟩
        linarith
      · apply Fin.ext
        omega
  let gapSet : Finset ℝ := Finset.univ.image gap
  have hgapcard : gapSet.card = m - 1 := by
    calc
      gapSet.card = (Finset.univ : Finset (Fin (m - 1))).card := by
        dsimp [gapSet]
        exact Finset.card_image_of_injective _ hgap_inj
      _ = m - 1 := by simp
  have hleft_lt_gap (k : Fin (m - 1)) : left < gap k := by
    exact sortedLT_left_tail_lt_between hsorted h0 (hgapIndex k)
      leftSpec.1 ⟨(gapSpec k).1, (gapSpec k).2.1⟩
  have hgap_lt_right (k : Fin (m - 1)) : gap k < right := by
    exact sortedLT_between_lt_right_tail hsorted (hgapIndex k)
      hlast_idx hlast_eq ⟨(gapSpec k).1, (gapSpec k).2.1⟩ rightSpec.1
  have hleft_lt_right : left < right := by
    exact sortedLT_left_tail_lt_right_tail hsorted h0 hlast_idx hlast_eq
      leftSpec.1 rightSpec.1
  have hleft_not_gap : left ∉ gapSet := by
    intro hmem
    rcases Finset.mem_image.mp hmem with ⟨k, _hk, hk⟩
    have hlt := hleft_lt_gap k
    linarith
  have hright_not_gap : right ∉ gapSet := by
    intro hmem
    rcases Finset.mem_image.mp hmem with ⟨k, _hk, hk⟩
    have hlt := hgap_lt_right k
    linarith
  have hleft_ne_right : left ≠ right := ne_of_lt hleft_lt_right
  let S : Finset ℝ := insert left (insert right gapSet)
  refine ⟨S, ?_, ?_⟩
  · have hleft_not : left ∉ insert right gapSet := by
      simp [hleft_ne_right, hleft_not_gap]
    calc
      S.card = (insert right gapSet).card + 1 := by
        dsimp [S]
        exact Finset.card_insert_of_notMem hleft_not
      _ = gapSet.card + 2 := by
        rw [Finset.card_insert_of_notMem hright_not_gap]
      _ = (HermiteRRootsSorted n).length + 1 := by
        rw [hgapcard]
        dsimp [m]
        omega
  · intro x hx
    dsimp [S] at hx
    rw [Finset.mem_insert] at hx
    rcases hx with rfl | hx
    · exact leftSpec.2
    rw [Finset.mem_insert] at hx
    rcases hx with rfl | hx
    · exact rightSpec.2
    rcases Finset.mem_image.mp hx with ⟨k, _hk, hkx⟩
    rw [← hkx]
    exact (gapSpec k).2.2

/-- The sorted left/gap/right construction also counts exactly the successor
roots above any selected old root. This is the filter-card shape consumed by
the sign-count engine. -/
lemma exists_finset_roots_hermiteR_succ_card_count_above
    (n : ℕ) (hsplits : (HermiteR n).Splits)
    (hnd : (HermiteR n).roots.Nodup)
    (h0 : 0 < (HermiteRRootsSorted n).length) {i : ℕ}
    (hi : i < (HermiteRRootsSorted n).length) :
    ∃ S : Finset ℝ,
      S.card = (HermiteRRootsSorted n).length + 1 ∧
      (∀ x ∈ S, (HermiteR (n + 1)).eval x = 0) ∧
      (S.filter (fun r => (HermiteRRootsSorted n)[i]'hi < r)).card =
        (HermiteRRootsSorted n).length - i := by
  classical
  let m : ℕ := (HermiteRRootsSorted n).length
  have hm0 : 0 < m := by simpa [m] using h0
  have hi_m : i < m := by simpa [m] using hi
  have hsorted := hermiteRRootsSorted_sortedLT n hnd
  let leftExists := exists_root_left_hermiteR_succ_of_sorted_first n hsplits hnd h0
  let left : ℝ := Classical.choose leftExists
  have leftSpec : left < (HermiteRRootsSorted n)[0]'h0 ∧
      (HermiteR (n + 1)).eval left = 0 :=
    Classical.choose_spec leftExists
  have hlast_idx : m - 1 < (HermiteRRootsSorted n).length := by
    dsimp [m]
    omega
  have hlast_eq : (m - 1) + 1 = (HermiteRRootsSorted n).length := by
    dsimp [m]
    omega
  let rightExists :=
    exists_root_right_hermiteR_succ_of_sorted_last n hsplits hnd
      (i := m - 1) hlast_idx hlast_eq
  let right : ℝ := Classical.choose rightExists
  have rightSpec : (HermiteRRootsSorted n)[m - 1]'hlast_idx < right ∧
      (HermiteR (n + 1)).eval right = 0 :=
    Classical.choose_spec rightExists
  have hgapIndex (k : Fin (m - 1)) :
      k.1 + 1 < (HermiteRRootsSorted n).length := by
    dsimp [m] at k
    omega
  let gapExists (k : Fin (m - 1)) :=
    exists_root_between_hermiteR_succ_of_sorted_adjacent n hsplits hnd
      (i := k.1) (hgapIndex k)
  let gap (k : Fin (m - 1)) : ℝ := Classical.choose (gapExists k)
  have gapSpec (k : Fin (m - 1)) :
      (HermiteRRootsSorted n)[k.1]'(by omega) < gap k ∧
        gap k < (HermiteRRootsSorted n)[k.1 + 1]'(hgapIndex k) ∧
        (HermiteR (n + 1)).eval (gap k) = 0 :=
    Classical.choose_spec (gapExists k)
  have hgap_inj : Function.Injective gap := by
    intro a b hab
    by_cases hlt : a.1 < b.1
    · have hlt_gap : gap a < gap b :=
        sortedLT_between_lt_between_of_index_lt hsorted
          (hgapIndex a) (hgapIndex b) hlt
          ⟨(gapSpec a).1, (gapSpec a).2.1⟩
          ⟨(gapSpec b).1, (gapSpec b).2.1⟩
      linarith
    · by_cases hgt : b.1 < a.1
      · have hlt_gap : gap b < gap a :=
          sortedLT_between_lt_between_of_index_lt hsorted
            (hgapIndex b) (hgapIndex a) hgt
            ⟨(gapSpec b).1, (gapSpec b).2.1⟩
            ⟨(gapSpec a).1, (gapSpec a).2.1⟩
        linarith
      · apply Fin.ext
        omega
  let gapSet : Finset ℝ := Finset.univ.image gap
  have hgapcard : gapSet.card = m - 1 := by
    calc
      gapSet.card = (Finset.univ : Finset (Fin (m - 1))).card := by
        dsimp [gapSet]
        exact Finset.card_image_of_injective _ hgap_inj
      _ = m - 1 := by simp
  have hleft_lt_gap (k : Fin (m - 1)) : left < gap k := by
    exact sortedLT_left_tail_lt_between hsorted h0 (hgapIndex k)
      leftSpec.1 ⟨(gapSpec k).1, (gapSpec k).2.1⟩
  have hgap_lt_right (k : Fin (m - 1)) : gap k < right := by
    exact sortedLT_between_lt_right_tail hsorted (hgapIndex k)
      hlast_idx hlast_eq ⟨(gapSpec k).1, (gapSpec k).2.1⟩ rightSpec.1
  have hleft_lt_right : left < right := by
    exact sortedLT_left_tail_lt_right_tail hsorted h0 hlast_idx hlast_eq
      leftSpec.1 rightSpec.1
  have hleft_not_gap : left ∉ gapSet := by
    intro hmem
    rcases Finset.mem_image.mp hmem with ⟨k, _hk, hk⟩
    have hlt := hleft_lt_gap k
    linarith
  have hright_not_gap : right ∉ gapSet := by
    intro hmem
    rcases Finset.mem_image.mp hmem with ⟨k, _hk, hk⟩
    have hlt := hgap_lt_right k
    linarith
  have hleft_ne_right : left ≠ right := ne_of_lt hleft_lt_right
  let aboveGap (t : Fin (m - 1 - i)) : ℝ :=
    gap ⟨i + t.1, by
      dsimp [m] at t ⊢
      omega⟩
  have haboveGap_inj : Function.Injective aboveGap := by
    intro a b hab
    dsimp [aboveGap] at hab
    have hfin := hgap_inj hab
    have hval := congrArg Fin.val hfin
    dsimp at hval
    apply Fin.ext
    omega
  let gapAboveSet : Finset ℝ := Finset.univ.image aboveGap
  have hgapAboveCard : gapAboveSet.card = m - 1 - i := by
    calc
      gapAboveSet.card = (Finset.univ : Finset (Fin (m - 1 - i))).card := by
        dsimp [gapAboveSet]
        exact Finset.card_image_of_injective _ haboveGap_inj
      _ = m - 1 - i := by simp
  have hgap_above (k : Fin (m - 1)) (hik : i ≤ k.1) :
      (HermiteRRootsSorted n)[i]'hi < gap k := by
    by_cases hEq : i = k.1
    · subst i
      simpa using (gapSpec k).1
    · have hiklt : i < k.1 := lt_of_le_of_ne hik hEq
      have hk_len : k.1 < (HermiteRRootsSorted n).length := by
        dsimp [m] at k
        omega
      have h_lt :
          (HermiteRRootsSorted n)[i]'hi <
            (HermiteRRootsSorted n)[k.1]'hk_len :=
        hsorted.getElem_lt_getElem_of_lt (i := i) (j := k.1)
          (hi := hi) (hj := hk_len) hiklt
      have hkgap := (gapSpec k).1
      linarith
  have hgap_not_above (k : Fin (m - 1)) (hki : k.1 < i) :
      ¬ (HermiteRRootsSorted n)[i]'hi < gap k := by
    have hgap_lt_next := (gapSpec k).2.1
    have hnext_le_i :
        (HermiteRRootsSorted n)[k.1 + 1]'(hgapIndex k) ≤
          (HermiteRRootsSorted n)[i]'hi := by
      by_cases hEq : k.1 + 1 = i
      · subst i
        exact le_rfl
      · have hlt : k.1 + 1 < i := by omega
        exact le_of_lt <|
          hsorted.getElem_lt_getElem_of_lt (i := k.1 + 1) (j := i)
            (hi := hgapIndex k) (hj := hi) hlt
    intro hbad
    linarith
  have hgapFilter :
      gapSet.filter (fun r => (HermiteRRootsSorted n)[i]'hi < r) = gapAboveSet := by
    ext x
    constructor
    · intro hx
      have hxgap := (Finset.mem_filter.mp hx).1
      have hxabove := (Finset.mem_filter.mp hx).2
      rcases Finset.mem_image.mp hxgap with ⟨k, _hk, hkx⟩
      rw [← hkx] at hxabove ⊢
      have hik : i ≤ k.1 := by
        by_contra hnot
        exact hgap_not_above k (Nat.lt_of_not_ge hnot) hxabove
      let t : Fin (m - 1 - i) := ⟨k.1 - i, by
        have ht : k.1 < m - 1 := k.2
        have hi_lt : i < m := hi_m
        omega⟩
      refine Finset.mem_image.mpr ⟨t, Finset.mem_univ _, ?_⟩
      dsimp [aboveGap, t]
      have hval_eq : i + (k.1 - i) = k.1 := Nat.add_sub_of_le hik
      exact congrArg gap (Fin.ext hval_eq)
    · intro hx
      rcases Finset.mem_image.mp hx with ⟨t, _ht, htx⟩
      rw [← htx]
      refine Finset.mem_filter.mpr ⟨?_, ?_⟩
      · exact Finset.mem_image.mpr
          ⟨⟨i + t.1, by
              have ht : t.1 < m - 1 - i := t.2
              have hi_lt : i < m := hi_m
              omega⟩, Finset.mem_univ _, rfl⟩
      · let kt : Fin (m - 1) := ⟨i + t.1, by
            have ht : t.1 < m - 1 - i := t.2
            have hi_lt : i < m := hi_m
            omega⟩
        have hikt : i ≤ kt.1 := by
          dsimp [kt]
          exact Nat.le_add_right i t.1
        exact hgap_above kt hikt
  have hleft_not_above :
      ¬ (HermiteRRootsSorted n)[i]'hi < left := by
    have hleft_lt_i : left < (HermiteRRootsSorted n)[i]'hi := by
      by_cases hi0 : i = 0
      · subst i
        simpa using leftSpec.1
      · have h0i : 0 < i := Nat.pos_of_ne_zero hi0
        have h0_lt_i :
            (HermiteRRootsSorted n)[0]'h0 < (HermiteRRootsSorted n)[i]'hi :=
          hsorted.getElem_lt_getElem_of_lt (i := 0) (j := i)
            (hi := h0) (hj := hi) h0i
        linarith
    linarith
  have hright_above :
      (HermiteRRootsSorted n)[i]'hi < right := by
    have hi_le_last :
        (HermiteRRootsSorted n)[i]'hi ≤
          (HermiteRRootsSorted n)[m - 1]'hlast_idx := by
      by_cases hEq : i = m - 1
      · subst i
        exact le_rfl
      · have hlt : i < m - 1 := by omega
        exact le_of_lt <|
          hsorted.getElem_lt_getElem_of_lt (i := i) (j := m - 1)
            (hi := hi) (hj := hlast_idx) hlt
    linarith
  have hright_not_gapAbove : right ∉ gapAboveSet := by
    intro hmem
    rcases Finset.mem_image.mp hmem with ⟨t, _ht, ht⟩
    have hlt := hgap_lt_right
      ⟨i + t.1, by
        dsimp [m] at t ⊢
        omega⟩
    dsimp [aboveGap] at ht
    linarith
  let S : Finset ℝ := insert left (insert right gapSet)
  refine ⟨S, ?_, ?_, ?_⟩
  · have hleft_not : left ∉ insert right gapSet := by
      simp [hleft_ne_right, hleft_not_gap]
    calc
      S.card = (insert right gapSet).card + 1 := by
        dsimp [S]
        exact Finset.card_insert_of_notMem hleft_not
      _ = gapSet.card + 2 := by
        rw [Finset.card_insert_of_notMem hright_not_gap]
      _ = (HermiteRRootsSorted n).length + 1 := by
        rw [hgapcard]
        dsimp [m]
        omega
  · intro x hx
    dsimp [S] at hx
    rw [Finset.mem_insert] at hx
    rcases hx with rfl | hx
    · exact leftSpec.2
    rw [Finset.mem_insert] at hx
    rcases hx with rfl | hx
    · exact rightSpec.2
    rcases Finset.mem_image.mp hx with ⟨k, _hk, hkx⟩
    rw [← hkx]
    exact (gapSpec k).2.2
  · have hfilter :
        S.filter (fun r => (HermiteRRootsSorted n)[i]'hi < r) =
          insert right gapAboveSet := by
      dsimp [S]
      rw [Finset.filter_insert, if_neg hleft_not_above]
      rw [Finset.filter_insert, if_pos hright_above]
      rw [hgapFilter]
    rw [hfilter]
    rw [Finset.card_insert_of_notMem hright_not_gapAbove, hgapAboveCard]
    omega

/-- If `H_n` splits, the sorted root-list length is `n`. -/
lemma hermiteRRootsSorted_length_eq_of_splits
    (n : ℕ) (hsplits : (HermiteR n).Splits) :
    (HermiteRRootsSorted n).length = n := by
  rw [hermiteRRootsSorted_length, ← hsplits.natDegree_eq_card_roots, hermiteR_natDegree]

/-- Successor root-count step for Hermite: split/nodup roots of `H_n`, with
`n>0`, give the full root count for `H_{n+1}`. -/
lemma hermiteR_succ_card_roots_of_splits_nodup_pos
    (n : ℕ) (hn : 0 < n) (hsplits : (HermiteR n).Splits)
    (hnd : (HermiteR n).roots.Nodup) :
    (HermiteR (n + 1)).roots.card = n + 1 := by
  have hlen := hermiteRRootsSorted_length_eq_of_splits n hsplits
  have h0 : 0 < (HermiteRRootsSorted n).length := by omega
  obtain ⟨S, hScard, hSroot⟩ :=
    exists_finset_roots_hermiteR_succ_card n hsplits hnd h0
  have hroots :
      (HermiteR (n + 1)).roots = S.val := by
    apply Polynomial.roots_eq_of_natDegree_le_card_of_ne_zero
    · exact hSroot
    · rw [hermiteR_natDegree, hScard, hlen]
    · exact hermiteR_ne_zero (n + 1)
  have hcard := congrArg Multiset.card hroots
  simpa [hScard, hlen] using hcard

/-- Successor nodup step for Hermite roots. -/
lemma hermiteR_succ_roots_nodup_of_splits_nodup_pos
    (n : ℕ) (hn : 0 < n) (hsplits : (HermiteR n).Splits)
    (hnd : (HermiteR n).roots.Nodup) :
    (HermiteR (n + 1)).roots.Nodup := by
  have hlen := hermiteRRootsSorted_length_eq_of_splits n hsplits
  have h0 : 0 < (HermiteRRootsSorted n).length := by omega
  obtain ⟨S, hScard, hSroot⟩ :=
    exists_finset_roots_hermiteR_succ_card n hsplits hnd h0
  have hroots :
      (HermiteR (n + 1)).roots = S.val := by
    apply Polynomial.roots_eq_of_natDegree_le_card_of_ne_zero
    · exact hSroot
    · rw [hermiteR_natDegree, hScard, hlen]
    · exact hermiteR_ne_zero (n + 1)
  rw [hroots]
  exact S.nodup

/-- Successor splitting step for Hermite roots. -/
lemma hermiteR_succ_splits_of_splits_nodup_pos
    (n : ℕ) (hn : 0 < n) (hsplits : (HermiteR n).Splits)
    (hnd : (HermiteR n).roots.Nodup) :
    (HermiteR (n + 1)).Splits := by
  rw [hermiteR_splits_iff_card_roots]
  exact hermiteR_succ_card_roots_of_splits_nodup_pos n hn hsplits hnd

/-- Main Hermite real-rootedness package: `H_n` splits over `ℝ`, has no
repeated roots, and has exactly `n` roots. -/
theorem hermiteR_splits_roots_nodup_card (n : ℕ) :
    (HermiteR n).Splits ∧
      (HermiteR n).roots.Nodup ∧
      (HermiteR n).roots.card = n := by
  induction n using Nat.twoStepInduction with
  | zero =>
      exact ⟨hermiteR_splits_zero, hermiteR_roots_nodup_zero, hermiteR_card_roots_zero⟩
  | one =>
      exact ⟨hermiteR_splits_one, hermiteR_roots_nodup_one, hermiteR_card_roots_one⟩
  | more n _ ih =>
      have hnpos : 0 < n + 1 := Nat.succ_pos n
      have hsplits : (HermiteR (n + 1 + 1)).Splits :=
        hermiteR_succ_splits_of_splits_nodup_pos (n + 1) hnpos ih.1 ih.2.1
      have hnd : (HermiteR (n + 1 + 1)).roots.Nodup :=
        hermiteR_succ_roots_nodup_of_splits_nodup_pos (n + 1) hnpos ih.1 ih.2.1
      have hcard : (HermiteR (n + 1 + 1)).roots.card = n + 1 + 1 :=
        hermiteR_succ_card_roots_of_splits_nodup_pos (n + 1) hnpos ih.1 ih.2.1
      simpa [Nat.add_assoc] using And.intro hsplits (And.intro hnd hcard)

/-- Every real Hermite polynomial splits over `ℝ`. -/
theorem hermiteR_splits (n : ℕ) : (HermiteR n).Splits :=
  (hermiteR_splits_roots_nodup_card n).1

/-- Real Hermite roots are simple. -/
theorem hermiteR_roots_nodup (n : ℕ) : (HermiteR n).roots.Nodup :=
  (hermiteR_splits_roots_nodup_card n).2.1

/-- Real Hermite has exactly `n` roots, counted with multiplicity. -/
theorem hermiteR_card_roots (n : ℕ) : (HermiteR n).roots.card = n :=
  (hermiteR_splits_roots_nodup_card n).2.2

/-- Count roots of `H_{n+1}` strictly above a selected sorted root of `H_n`.
There is one successor root in each higher adjacent gap and one in the right
tail. -/
theorem hermiteR_succ_count_roots_above (n : ℕ) {i : ℕ}
    (hi : i < (HermiteRRootsSorted n).length) :
    ((HermiteR (n + 1)).roots.filter
        (fun r => (HermiteRRootsSorted n)[i]'hi < r)).card =
      (HermiteRRootsSorted n).length - i := by
  classical
  have hsplits : (HermiteR n).Splits := hermiteR_splits n
  have hnd : (HermiteR n).roots.Nodup := hermiteR_roots_nodup n
  have h0 : 0 < (HermiteRRootsSorted n).length := by omega
  obtain ⟨S, hScard, hSroot, hSabove⟩ :=
    exists_finset_roots_hermiteR_succ_card_count_above n hsplits hnd h0 hi
  have hlen := hermiteRRootsSorted_length_eq_of_splits n hsplits
  have hroots :
      (HermiteR (n + 1)).roots = S.val := by
    apply Polynomial.roots_eq_of_natDegree_le_card_of_ne_zero
    · exact hSroot
    · rw [hermiteR_natDegree, hScard, hlen]
    · exact hermiteR_ne_zero (n + 1)
  rw [hroots]
  simpa [Finset.filter_val] using hSabove

/-- Unconditional adjacent-gap interlacing witness for consecutive sorted
roots of `H_n`. -/
theorem hermiteR_succ_root_between_sorted_adjacent
    (n : ℕ) {i : ℕ}
    (hi : i + 1 < (HermiteRRootsSorted n).length) :
    ∃ x, (HermiteRRootsSorted n)[i]'(by omega) < x ∧
      x < (HermiteRRootsSorted n)[i + 1]'hi ∧
      (HermiteR (n + 1)).eval x = 0 :=
  exists_root_between_hermiteR_succ_of_sorted_adjacent n
    (hermiteR_splits n) (hermiteR_roots_nodup n) hi

/-- Unconditional left-tail interlacing witness for `H_{n+1}`. -/
theorem hermiteR_succ_root_left_sorted_first
    (n : ℕ) (h0 : 0 < (HermiteRRootsSorted n).length) :
    ∃ x, x < (HermiteRRootsSorted n)[0]'h0 ∧
      (HermiteR (n + 1)).eval x = 0 :=
  exists_root_left_hermiteR_succ_of_sorted_first n
    (hermiteR_splits n) (hermiteR_roots_nodup n) h0

/-- Unconditional right-tail interlacing witness for `H_{n+1}`. -/
theorem hermiteR_succ_root_right_sorted_last
    (n : ℕ) {i : ℕ}
    (hi : i < (HermiteRRootsSorted n).length)
    (hlast : i + 1 = (HermiteRRootsSorted n).length) :
    ∃ x, (HermiteRRootsSorted n)[i]'hi < x ∧
      (HermiteR (n + 1)).eval x = 0 :=
  exists_root_right_hermiteR_succ_of_sorted_last n
    (hermiteR_splits n) (hermiteR_roots_nodup n) hi hlast

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
