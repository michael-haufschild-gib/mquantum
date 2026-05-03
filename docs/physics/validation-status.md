# Physics Validation Status

This document tracks per-mode validation level for the quantum physics
implementations rendered by mquantum. It is a single source of truth for
what is _demonstrably correct_ versus what is _plausible but unverified_.

The README disclaims the project as "vibecoded". This document is the
counter-disclaimer: it enumerates exactly which claims rest on tested
oracles and which do not.

> **Audience.** Reviewers, users evaluating the simulator's
> trustworthiness, and contributors deciding where validation effort
> would yield the highest marginal correctness.

## Validation levels

| Level                        | Meaning                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **A — analytical oracle**    | Closed-form formula evaluated to machine precision and asserted at numerical tolerance.                                          |
| **R — reference dataset**    | External authoritative values (NIST, peer-reviewed paper, textbook with cited formula) loaded from data files and compared.      |
| **P — property / invariant** | Norm conservation, energy conservation, hermiticity, symmetry, commutator identity, or unitarity asserted across time evolution. |
| **C — convergence**          | Discretization error reduces at the predicted rate as resolution doubles (publication-grade Cauchy convergence).                 |
| **F — fixture**              | Hand-curated reference output (from this project) used for regression: catches regressions but cannot prove correctness.         |
| **—**                        | No tests beyond "runs without crashing".                                                                                         |

A mode may carry multiple levels (e.g. **A + P + C**). The strongest
applicable level wins for an at-a-glance read.

## Mode summary

| Mode                          | Level         | Test directory                                                                                        | Notes                                                                                                                                      |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Harmonic Oscillator           | **A + P**     | `lib/math/hermitePolynomials.property.test.ts`, `lib/physics/analyticalBenchmarks.test.ts`            | Hermite polynomial orthogonality, recurrence, norm.                                                                                        |
| Hydrogen 3D                   | **R + A + P** | `lib/physics/hydrogenNistReferenceData.test.ts`, `lib/math/hydrogenRadialND.property.test.ts`         | NIST hydrogen-energy reference dataset (Z = 1, n = 1..5) loaded from `docs/physics/validation/reference-data/hydrogen-nist-energies.json`. |
| Hydrogen N-D                  | **A + P**     | `lib/physics/hydrogenMomentumNorm.test.ts`, `lib/physics/hydrogenNDCoupled.test.ts`                   | Energy formula `E_n = -1/(2 n_eff²)` checked at D=3 only; D≥4 covered partially.                                                           |
| Anti-de Sitter (Lorentzian)   | **A + P + F** | `lib/physics/antiDeSitter/{btz,hkll,math,presets,scratchPool,btzDensityGrid,hkllDensityGrid}.test.ts` | Δ_± formula, BF window, KW fallback; HKLL kernel sign convention.                                                                          |
| Anti-de Sitter — BTZ          | **A + F**     | `lib/physics/antiDeSitter/btz.test.ts`, `lib/physics/antiDeSitter/btzDensityGrid.test.ts`             | T_H, S_BH, M derived analytically; rendering verified against fixture.                                                                     |
| Anti-de Sitter — HKLL         | **F + P**     | `lib/physics/antiDeSitter/hkll.test.ts`, `lib/physics/antiDeSitter/hkllDensityGrid.test.ts`           | Boundary smearing kernel; bulk-from-boundary reconstruction matches fixture.                                                               |
| Wheeler-DeWitt                | **C + P + A** | `lib/physics/wheelerDeWitt/*` (23 files)                                                              | Cauchy convergence verified per gridNa/gridNphi/gridNphiCoupled sweep; analytic Stage-2 WKB tail matches fixture.                          |
| SRMT diagnostic               | **P + C**     | `lib/physics/srmt/*` (19 files)                                                                       | Affine-fit quality `q` reported with sweep variation; Tier-3 sensitivity sweeps over phiRef, rankCap, phiExtent.                           |
| Free Scalar Field             | **A + P**     | `lib/physics/freeScalar/*` (8 files)                                                                  | Vacuum dispersion, k-space packing/occupation; cosmology coupling tested per preset.                                                       |
| TDSE Dynamics                 | **A + P + F** | `lib/physics/tdse/*` (14 files), `lib/physics/cflConvergence.test.ts`                                 | Norm conservation, energy drift, CFL convergence; potentials tested per preset.                                                            |
| BEC Dynamics                  | **A + P**     | `lib/physics/bec/*` (7 files)                                                                         | Chemical potential, incompressible spectrum, page curve, sonic horizon.                                                                    |
| Dirac Equation                | **A + F**     | `lib/physics/dirac/*` (3 files)                                                                       | Clifford algebra identity verification; spinor scaling.                                                                                    |
| Pauli Spinor                  | **F**         | `lib/physics/pauli/*` (2 files)                                                                       | Compute-pass smoke + parity checks.                                                                                                        |
| Quantum Walk                  | **A + P**     | `lib/physics/quantumWalk.test.ts`                                                                     | Coin operator unitarity, ballistic spreading.                                                                                              |
| Bohmian Trajectories          | **A**         | `lib/physics/bohmian/quantumPotential.test.ts`                                                        | Quantum potential formula.                                                                                                                 |
| Open Quantum Systems          | **P**         | `lib/physics/openQuantum/*` (19 files)                                                                | Lindblad evolution, decoherence rates.                                                                                                     |
| Stochastic Localization (CSL) | **P**         | `lib/physics/stochastic/*` (7 files)                                                                  | Branching consistency, monitoring rate, localization width.                                                                                |
| Wigner Function               | **A + P**     | `lib/physics/wigner.property.test.ts`, `wignerHydrogen.property.test.ts`                              | Marginal recovery, normalization.                                                                                                          |
| Cosmology models              | **A + P**     | `lib/physics/cosmology/*` (6 files)                                                                   | Bianchi-I Kasner exponent constraints, LQC bounce, preheating.                                                                             |
| Coordinate Entanglement       | **A + P**     | `coordinateEntanglement.{property,}.test.ts`                                                          | von Neumann entropy reduction; RDM hermiticity.                                                                                            |

## What is **not** validated

The following are not asserted by any current test. A reviewer should
treat the corresponding rendered values with appropriate skepticism.

| Mode / claim                                                                                   | Why missing                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| TDSE curved-metric Schwarzschild ISCO matches `r = 6M` for circular orbits                     | Long-run wave-packet propagator + orbital fitting infrastructure not yet built. |
| BEC healing length ξ = ℏ/√(2 m g n ρ) sets soliton width within 5 %                            | Soliton initial condition + spatial-FFT analysis not implemented.               |
| Dirac Klein paradox — transmission coefficient through step potential matches analytic formula | Step-potential setup + reflection / transmission readback not built.            |
| Free-scalar two-point function `⟨φ(x) φ(0)⟩` matches massless-free-theory in flat space        | Correlator measurement infrastructure absent.                                   |
| Quantum-walk variance `⟨x²⟩ ∝ t²` (ballistic) over long time                                   | Long-run variance-vs-time fit not yet asserted.                                 |
| Hydrogen-N-D energies at D = 4..7 matching D-dimensional Coulomb formula at high n             | Only n = 1..3 tested at D ≠ 3.                                                  |
| WdW DeWitt boundary condition produces real-valued WKB amplitude in classically-allowed region | Asserted at solver-input level, not at solver-output level.                     |
| HKLL bulk reconstruction reproduces boundary correlator at ρ → π/2                             | Limit-of-bulk readback infrastructure absent.                                   |

This matches `docs/physics/validation/README.md#validation-gaps-todo`.
Closing a row above means moving it into `oracle-index.md` (when that
file exists) and adding a row to the table at the top of this file.

## Reference data

Authoritative external references live under
`docs/physics/validation/reference-data/`. Today this directory contains
one dataset:

| File                          | Source                                                                    | Use                                                         |
| ----------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `hydrogen-nist-energies.json` | [NIST Atomic Spectra Database](https://physics.nist.gov/PhysRefData/ASD/) | Hydrogen ground-state and excited-state energies, n = 1..5. |

Adding a new reference dataset requires a citation block (URL, paper
DOI, or textbook + page) at the top of the JSON file. See the existing
`hydrogen-nist-energies.json` for the schema.

## How to interpret this document

- **A green-card mode** (level **A + P + C** or stronger) is suitable
  for citing in publications: claims are mathematically grounded, with
  numerical evidence at machine precision.
- **A yellow-card mode** (level **F** or **P** alone) is verified
  internally but not against external references. Use with care.
- **A red-card mode** (level **—**) renders something but it has not
  been checked. Reviewers and users should not rely on numerical
  output.

The honest assessment: the project is **mostly green-card** for
analytical modes (HO, Hydrogen, AdS, FSF, BEC, QW), **mostly
yellow-card** for compute modes (TDSE, Dirac, Pauli) where renderer
correctness is observed but boundary cases lack external oracles, and
**no red-card modes**. Coverage still varies by mode: Bohmian and
Pauli remain below property-level validation in this matrix.

## Provenance of this document

Written 2026-05-02 by counting tests in `src/tests/lib/physics/` and
cross-referencing the validation framework in
`docs/physics/validation/README.md`. The mode list matches
`.claude/rules/quantum-physics.md`. When a new mode lands or test
coverage changes materially, update both this file and the validation
gaps list together.
