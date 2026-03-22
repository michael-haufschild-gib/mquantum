# Deep E2E Testing Strategy — Per-Mode Spec Files

## Pattern (codified from free-scalar-field.spec.ts)

Each mode-specific spec has four sections:

### A: Preset/Config × Dimension Rendering Matrix
- Every preset renders at 2-3 dimensions without GPU errors
- Pixel check with multi-screenshot for oscillating modes (3 screenshots, 30-frame gaps)
- ONE representative color algo per preset (not random rotation)
- Faint modes use `minPixels: 1`

### B: Control Response — Differential Pixel Checks
- For each UI control: capture before, change via store, capture after, assert `snapshotDistance > 2.0`
- Uses `capturePixelSnapshot` + `expectSnapshotsDiffer` from app-helpers.ts
- Run at 3D only (control wiring is dimension-independent)

### C: Physics Invariants (per-mode diagnostics)
- Don't duplicate physics-validation.spec.ts — add only control RESPONSE tests
- Three assertion types:
  - **Invariant**: always holds (normDrift < 2%)
  - **Directional**: observable moves predictably (increase barrier → R increases)
  - **Exact**: analytical result known (HO center density)

### D: Feature Toggles + Edge Cases
- Absorber, isosurface, autoScale, diagnostics on/off
- Dimension switching within mode
- Animation verification (frames advance, field evolves)

## Priority Order

1. **TDSE** — 20+ data-testids, 8 presets, most controls
2. **BEC** — 7 presets, store-only (no testids), GP physics
3. **Dirac** — 6 presets, store-only, particle/antiparticle
4. **Quantum Walk** — 7 testids, 3 coin types, simple physics
5. **Pauli** — 6 presets, store-only, spinor color algos
6. **Hydrogen** — partially covered already
7. **HO** — best covered already

## Key Physics Responses to Test

| Mode | Change | Expected Response |
|-|-|-|
| TDSE | classicTunneling preset | R + T ≈ 1.0 |
| TDSE | thickBarrier vs classicTunneling | T decreases |
| TDSE | imaginaryTime ON | energy decreases over frames |
| TDSE | absorber ON | norm decreases |
| BEC | groundState | chemicalPotential > 0, healingLength > 0 |
| BEC | attractiveBec | chemicalPotential < 0 |
| Dirac | free Dirac | particle + antiparticle ≈ 1.0 |
| Dirac | kleinParadox | antiparticleFraction > 0 |
| Pauli | any preset | spinUp + spinDown = 1 |
| QW | coin type change | different spatial distribution |
| Hydrogen | increase n | bounding radius increases |

## Infrastructure Needed

- BEC and Dirac controls need data-testid attributes added before UI interaction tests
- Shared helpers in app-helpers.ts for each mode's store mutations
- Generic "change + assert visual diff" and "change + assert diagnostic response" patterns

## Rules from FSF Experience

- kSpaceOccupation + vacuum = blank (physically correct, gate in UI)
- 5D+ vacuum/faint modes need minPixels: 1
- Async readback pipelines (k-space FFT) need extra settle time
- Educational color algos (hamiltonianDecomposition, energyFlux, modeCharacter) may be blank for featureless fields
- Always test with PML/absorber both on and off
