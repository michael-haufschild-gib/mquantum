# Theorem M — Lean 4 Formalization Plan (campaign phase P6)

_Started round 311 (2026-06-12). Toolchain: Lean 4 v4.30.0 + mathlib
v4.30.0 (pinned). Project: `formal/`, library `TheoremM`. Build:
`lake build` (mathlib via `lake exe cache get`, no local mathlib
compile)._

**Why**: the decisive artifact for an AI-authored result in this
territory. A kernel-checked proof requires trusting no author —
exactly the standard the publication-hardening campaign aims at.

## Status

**ROUND-313 RESTRUCTURE — the critical path collapsed.** The Rouché-(b)
recon found a SECOND PROOF of Theorem M (draft §3c): real-variable sign
alternation at the critical points of C_d. It needs NO complex
analysis: real W1 gives sup_v |C_d(vc)| ≤ |C_d(c)| at criticals
(constant 1), the μ-budget (1−p) < p preserves the alternating signs,
and d sign changes + evenness + degree count finish. Rouché (old
P6.4), the Cap Lemma chain (old P6.5), and the complex W2/W3 (old
P6.3) are REMOVED from the formalization's critical path (they remain
relevant only if we later formalize the transport interface).

| Phase | Content | Status |
|-------|---------|--------|
| P6.0 | Scaffold; defs; formal statement; §1.4a moment algebra | **DONE** |
| P6.1 | Coefficient closed forms; `Psi_natDegree = 2d`; the ODE `2d·C″ − X·C′ + 2d·C = 0` (`Cpoly_ode`) | **DONE — kernel-checked** |
| P6.2 | Real-rootedness + simplicity of `C_d`; interlacing; critical points c_0 < … < c_{d−1} with alternating critical-value signs (Hermite/Gaussian + iterated Rolle) | IN PROGRESS — GPT's `Hermite.lean` scaffold green (7 lemmas, F131) |
| P6.3 | REAL W1: `energy_monotoneOn`, `energy_zero`, `abs_Cpoly_le_of_critical` (`Energy.lean`) | **DONE — kernel-checked (round 314)** |
| P6.4a | The μ-bridge (`MuBridge.lean`): `pAtom = √(2/e)` with `pAtom > 1/2` (from `e < 8`); `Psi_eval_decomp` (quadrature ⟹ the decomposition at every point); `Psi_budget_at_critical`; `Psi_sign_at_critical` (strict sign transfer); capstone `theorem_M_of_critical_data` reducing theorem_M to (P6.2 critical data) + (P6.4b quadrature data) | **DONE — kernel-checked (round 317)** |
| P6.4b | Existence of the quadrature data: truncated Hausdorff / Hankel-PSD for the residual moments `(M_k − p)` (from the CP transform; mathlib HAS digamma for (B) if needed). Isolated as a named `mu_step` theorem; the rest of the tree does not block on it | open — the one hard analytic item, OFF the critical path of everything else |
| P6.5 | Sign-change count assembly: `psi_roots_real_of_alternation` (`SignCount.lean`) — alternation hypotheses ⟹ every complex root real, via IVT roots in each gap + tail sign from `Psi_leadingCoeff_sign` + evenness mirror (`Psi_eval_neg`) + the 2d-cardinality pin against `card_roots'` | **DONE — kernel-checked (round 316)** |
| P6.6 | (post-theorem, optional) transport-interface formalization: Corollary T floors, Rouché-(b) homotopy | parked |

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
3. **Hermite route for P6.2 (REFINED, GPT F132).** Instead of
   Gaussian/Rolle with endpoint-at-infinity bookkeeping: the recurrence
   root-insertion induction. For monic `p` with simple ordered real
   roots, `L(p) = X·p − p′` satisfies `L(p)(x_i) = −p′(x_i)`, whose
   signs alternate; IVT inserts a root of `L(p)` in every gap and both
   tails; degree count gives simplicity + interlacing. mathlib's
   `hermite (n+1) = X·hermite n − derivative (hermite n)` carries the
   induction. Transfer (CONVENTION NOTE, round 319): mathlib's
   `hermite` is the PROBABILISTS' family — the identity is
   `C_d(w) = He_{2d}(w/√(2d))/He_{2d}(0)`, `He_{2d}(0) = (−1)^d(2d−1)!!`
   (verified in exact rationals d ≤ 8, all k; the paper's physicists'
   √(4d) form is equivalent). No Laguerre, no orthogonality, no
   Gaussian tails.

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
- GPT: P6.2 (Hermite real-rootedness — scaffold green, F131);
  STATEMENT-FAITHFULNESS AUDIT: **PASS** (F130 — formulas match
  §1.4/§1.4a, statement = "all complex roots real", numeric cross-eval
  vs theoremM_verify.py at d = 7: max abs difference 0.0 at 100 dps).
- Both: P6.5 split by lemma ownership as in the paper.

## Faithfulness invariant

Any change to `Psi`/`M`/`S1` definitions must be cross-checked against
`scripts/research/hilbertPolya/theoremM_verify.py` (same coefficients
to 60+ digits) — the Lean definitions and the numerical suite must
describe the SAME object, or the formalization proves the wrong
theorem. Check: evaluate both at d = 7 and compare coefficient lists.
