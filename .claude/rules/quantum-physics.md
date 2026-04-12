# Quantum Physics Scope

## Object Type Constraint

Two object types: `ObjectType = 'schroedinger' | 'pauliSpinor'`. Both are quantum wavefunctions rendered through the same pipeline.

## Supported Quantum Modes

### Analytical Modes

| Mode                   | Key                  | Dimensions | Basis                                              | Key Parameters                                                   |
| ---------------------- | -------------------- | ---------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Harmonic Oscillator    | `harmonicOscillator` | 1D-11D     | Hermite polynomials                                | Superposition up to 8 terms, per-dimension frequencies (`omega`) |
| Hydrogen N-Dimensional | `hydrogenND`         | 3D-11D     | Laguerre + spherical harmonics + HO for extra dims | Quantum numbers `n`, `l`, `m`; n_eff = n + (D-3)/2               |

### Compute Modes (GPU lattice simulation, 3D+ only)

| Mode              | Key               | Description                                                       |
| ----------------- | ----------------- | ----------------------------------------------------------------- |
| Free Scalar Field | `freeScalarField` | k-space scalar field with vacuum fluctuations                     |
| TDSE Dynamics     | `tdseDynamics`    | Time-dependent Schroedinger equation with configurable potentials |
| BEC Dynamics      | `becDynamics`     | Bose-Einstein condensate via Gross-Pitaevskii equation            |
| Dirac Equation    | `diracEquation`   | Relativistic Dirac equation on a lattice                          |
| Quantum Walk      | `quantumWalk`     | Discrete-time quantum walk with coin operator                     |

## Physics Accuracy Requirements

- Use mathematically correct implementations — no approximations that sacrifice physical accuracy
- Bounding radius: computed dynamically per quantum state via physics formulas (not hardcoded)
- Wavefunction normalization must be preserved in superpositions
- Verify quantum number constraints: `0 <= l < n`, `-l <= m <= l`
