# Quantum Physics Scope

## Object Type Constraint

Single object type: `ObjectType = 'schroedinger'`.

There are NO other object types in this codebase. Do not reference, create, or assume the existence of polytopes, fractals, black holes, skyboxes, or any non-quantum objects. All removed features have been fully deleted.

## Supported Quantum Modes

| Mode | Dimensions | Basis | Key Parameters |
|------|-----------|-------|----------------|
| Harmonic Oscillator | 1D-11D | Hermite polynomials | Superposition up to 8 terms, per-dimension frequencies (`omega`) |
| Hydrogen Orbital | 3D only | Laguerre polynomials + spherical harmonics | Quantum numbers `n`, `l`, `m`; real orbital variants |
| Hydrogen N-Dimensional | 4D-11D | 3D hydrogen radial core + independent HO for extra dims | Same as above + extra-dimension HO quantum numbers |

## Physics Accuracy Requirements

- Use mathematically correct implementations — no approximations that sacrifice physical accuracy
- Bounding radius: computed dynamically per quantum state via physics formulas (not hardcoded)
- Wavefunction normalization must be preserved in superpositions
- Verify quantum number constraints: `0 <= l < n`, `-l <= m <= l`
