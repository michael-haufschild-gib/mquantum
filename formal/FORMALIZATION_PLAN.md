# Theorem M — Lean 4 Formalization Plan (campaign phase P6)

_Started round 311 (2026-06-12). Toolchain: Lean 4 v4.30.0 + mathlib
v4.30.0 (pinned). Project: `formal/`, library `TheoremM`. Build:
`lake build` (mathlib via `lake exe cache get`, no local mathlib
compile)._

**Why**: the decisive artifact for an AI-authored result in this
territory. A kernel-checked proof requires trusting no author —
exactly the standard the publication-hardening campaign aims at.

## Status

| Phase | Content | Status |
|-------|---------|--------|
| P6.0 | Scaffold; defs (`S1`, `M`, `Cpoly`, `Psi`); the precise formal statement `theorem_M`; §1.4a moment algebra (`S1_succ_sub`, `M_zero`, `M_pos`, `M_ratio`); structural lemmas (`Psi_coeff_zero`, `Psi_coeff_odd`) | **DONE — builds green, single `sorry` = the main theorem** |
| P6.1 | Ψ_d structure: `natDegree = 2d`, leading coefficient ≠ 0, evenness as `Polynomial` symmetry; the ODE identity `2d·C″ − X·C′ + 2d·C = 0` (coefficient-level binomial identity); the Ψ/C moment relation | next |
| P6.2 | Real-rootedness + simplicity of `C_d`'s zeros; critical-point count d−1 + interlacing (Rolle) | open |
| P6.3 | W1 energy identity, W2 Riccati identity, A1, W3 chain (complex `deriv` computations) | open |
| P6.4 | Rouché infrastructure (mathlib gap — see below) | open |
| P6.5 | Quantitative chain: Cap Lemma E1–E8, Corollary T floors, Szegő-replacement | open (heaviest) |
| P6.6 | Assembly: cells, Rouché per cell, conjugation finisher, count | open |

## Design decisions

1. **The statement carries no measure theory.** `Psi d` is DEFINED by
   its coefficients `(−1)^k (d)_k M_k/(d^k (2k)!)` with the moments
   `M_k` defined by the closed form. The §1.4a compound-Poisson
   construction is then a *provenance* statement (the measure
   decomposition is derived where the proof needs it — W3's triangle
   inequality consumes μ ≥ 0 via the finite total-variation split,
   which at polynomial level is a finite positive combination).
2. **Real polynomials, complex roots.** `Psi d : ℝ[X]`; the statement
   quantifies over `((Psi d).map (algebraMap ℝ ℂ)).roots`.
3. **Hermite route for P6.2.** mathlib has `Polynomial.hermite` AND
   `hermite_eq_deriv_gaussian` (H_n as Gaussian derivative). Iterated
   Rolle (mathlib: `exists_deriv_eq_zero`) on x ↦ dⁿ/dxⁿ e^{−x²} gives
   real-rootedness of H_n — the classical argument, fully
   mathlib-supported. Then `C_d(w) ∝ H_{2d}(w/√(4d))` is an algebraic
   identity (binomial), giving C_d's 2d real simple zeros WITHOUT
   formalizing Laguerre polynomials or orthogonality.

## mathlib inventory (v4.30.0, verified by grep round 311)

AVAILABLE:
- `harmonic : ℕ → ℚ` + `harmonic_succ` (NumberTheory/Harmonic/Defs)
- `Real.eulerMascheroniConstant` + bounds (NumberTheory/Harmonic/EulerMascheroni)
- `Real.digamma`, `digamma_one = −γ`, `digamma_one_half`
  (Analysis/SpecialFunctions/Gamma/Digamma) — directly relevant if we
  later formalize §1.4a's Binet identity (B)
- `Polynomial.hermite` + Gaussian-derivative identity
  (RingTheory/Polynomial/Hermite/{Basic,Gaussian})
- Rolle: `exists_deriv_eq_zero` and friends
- Complex analysis: Cauchy integral, open mapping, max modulus,
  `JensenFormula`, `Hadamard`, `CanonicalDecomposition`
  (Analysis/Complex/) — the argument-principle neighborhood exists
- `Polynomial.roots` over ℂ (alg. closed, with multiplicity)
- Numeric exp/log bounds (Analysis/SpecialFunctions/ExponentialBounds)

GAPS (must build or route around):
1. **Rouché — NOT in mathlib** (grep: zero hits). Two routes:
   (a) derive from the existing Cauchy-integral/winding machinery
   (general, hard); (b) polynomial-specific: continuity of roots +
   degree counting along the homotopy `pC_d + t·(Ψ_d − pC_d)`,
   t ∈ [0,1] — roots can't cross the cell boundary (floor m₀ > 0) so
   counts are constant. Route (b) avoids contour integration entirely
   and fits mathlib's `Polynomial.roots` continuity tools better.
   DECISION PENDING — route (b) preferred.
2. **Sturm comparison / spacing π⁻ — NOT in mathlib.** Needed for the
   Cap Lemma's layer-cake and E1b. Alternative: zero spacing of H_n
   via the three-term recurrence + interlacing (also not in mathlib,
   but elementary). Real work either way.
3. **Szegő 6.32 (largest-zero bound)** — not in mathlib; formalize the
   self-contained Sturm-gap bound (E1b shape) instead, accepting a
   worse constant; budgets have the room (K threshold 3.0500 vs
   delivered 2.98).
4. **Laguerre polynomials** — not needed (Hermite route, decision 3).

## Division of labor (proposed, F120)

- Fable: P6.1 (structure + ODE identity), P6.4 recon (route (b)
  prototype).
- GPT: P6.2 (Hermite real-rootedness via Gaussian/Rolle — fully
  self-contained, mathlib-supported); review of the formal STATEMENT
  for faithfulness to the draft (the most important audit of all:
  does `theorem_M` say what the paper claims?).
- Both: P6.5 split by lemma ownership as in the paper.

## Faithfulness invariant

Any change to `Psi`/`M`/`S1` definitions must be cross-checked against
`scripts/research/hilbertPolya/theoremM_verify.py` (same coefficients
to 60+ digits) — the Lean definitions and the numerical suite must
describe the SAME object, or the formalization proves the wrong
theorem. Check: evaluate both at d = 7 and compare coefficient lists.
