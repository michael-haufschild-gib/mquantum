# Physics Validation Ownership

This directory establishes the *ownership and process* layer on top of the
analytical/property tests already in `src/tests/lib/physics/`. The existing
test suite (~1030 tests across 48 files) verifies physics correctness.
This directory makes the validation **auditable** and **extensible**:

- A reviewer can find what is verified, against what reference, with what
  tolerance, without reading test source.
- Adding a new mode (or extending an existing one) follows a documented
  template instead of folklore.
- Reference data is stored as data files with citations, not buried in test
  literals — so updating a reference does not require touching test logic.

## Directory layout

```
docs/physics/validation/
  README.md              ← this file
  oracle-index.md        ← every claim → test → reference table (source of truth)
  reference-data/
    hydrogen-nist-energies.json   ← worked example: external reference values
    *.json                         ← future datasets, one per mode/claim
```

## What "validated" means here

A physics implementation is *validated* iff there exists at least one of:

1. **Analytical oracle** — closed-form formula evaluated to machine
   precision and compared to the implementation. Strongest.
2. **Reference dataset** — values from a peer-reviewed source (NIST,
   journal article, textbook with explicit formula citation) loaded as
   data and compared.
3. **Conservation/symmetry property** — invariants (norm, energy,
   commutators, hermiticity) checked over time evolution.
4. **Convergence order** — discretization error reduces at the predicted
   rate as resolution doubles.

Code-vs-code comparison (e.g. matching another simulator) is **not** a
validation in this project: it confirms agreement, not correctness.
See `docs/physics/validation-methodology.md` for the rationale.

## How to add a new validation

For a new physics claim (e.g. "BEC ground-state chemical potential matches
Thomas-Fermi limit at large interaction strength"):

1. **Write the claim** as one sentence in `oracle-index.md` against the
   relevant mode row, including the reference (URL, paper DOI, or
   textbook + page).
2. **Choose the oracle type** (analytical / reference data / property /
   convergence). For reference-data oracles, drop a `*.json` file in
   `reference-data/` with the values and full citation block.
3. **Write the test** in `src/tests/lib/physics/{mode}/`. Tests should
   load reference data from JSON, not hardcode it — this lets reviewers
   diff data updates separately from code changes.
4. **State the tolerance** with justification (e.g. "1e-7 because
   10-point Gauss-Laguerre integrates polynomials of degree ≤ 19
   exactly; the integrand is degree 18 here").

## Validation gaps (TODO)

The list below is the backlog of validation work *not yet done*. Adding a
test should remove the corresponding row, not annotate it.

| Mode | Claim | Why missing | Owner |
|------|-------|-------------|-------|
| `tdseDynamics` (curved metric) | Schwarzschild ISCO matches GR prediction `r_ISCO = 6M` for circular orbits | needs a long-run wave-packet propagator, currently only norm-drift is checked | unassigned |
| `becDynamics` | Healing length ξ = ℏ/√(2mgnρ) sets the soliton width within 5% | requires soliton initial condition + spatial-FFT analysis of the result | unassigned |
| `diracEquation` | Klein paradox: transmission coefficient through step potential matches analytical formula | requires step-potential setup and reflection/transmission readback | unassigned |
| `freeScalarField` | Vacuum two-point function ⟨φ(x)φ(0)⟩ matches massless free theory in flat space | requires correlator measurement infrastructure | unassigned |
| `quantumWalk` | Diffusion exponent: variance grows as t² (ballistic, not diffusive) | needs a long-run variance-vs-time fit | unassigned |
| `hydrogenND` | Energy spectrum at D=4..7 matches D-dimensional Coulomb formula `E_n = -1/(2 n_eff²)` for high n | only n=1..3 currently tested at D≠3 | unassigned |
| `wheelerDeWitt` | DeWitt boundary condition produces real-valued WKB amplitude in classically allowed region | analytic property, not yet asserted at the solver-output level | unassigned |
| `antiDeSitter` | HKLL bulk reconstruction reproduces the boundary correlator at the boundary limit ρ→π/2 | requires limit-of-bulk readback infrastructure | unassigned |

When a row above gets covered, move it to `oracle-index.md` with the
test reference and tolerance.
