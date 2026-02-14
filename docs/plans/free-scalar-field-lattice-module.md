# Plan: Free Scalar Field Module on a Lattice

Date: 2026-02-14
Status: Proposed
Scope: New scientifically grounded mode with real-time field evolution, observables, and educational analysis

## 1. Goal

Introduce a new quantum mode (proposed name: `freeScalarField`) that simulates a real Klein-Gordon scalar field on a spatial lattice, with real-time evolution of:

- field amplitude `phi(x, t)`
- conjugate momentum `pi(x, t)`

The module should provide educational observables that connect field dynamics to mode/particle intuition.

## 2. Why This Fits This Codebase

The current renderer already has the right architecture patterns:

- Compile-time quantum mode composition:
  - `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/compute/compose.ts:83`
- Per-frame compute execution with version-aware updates:
  - `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts:2390`
- Existing cross-section, volume, and representation controls that can be reused.

This allows adding a new physics branch while preserving the existing object type and render graph patterns.

## 3. Physics Model

### 3.1 Continuum model (real scalar field)

```text
L = 1/2 * (d_mu phi d^mu phi - m^2 phi^2)
pi = d_t phi
H = integral d^d x 1/2 * (pi^2 + |grad phi|^2 + m^2 phi^2)
```

### 3.2 Lattice Hamiltonian (periodic box)

For lattice site `n` and spatial directions `i`:

```text
H = 1/2 * sum_n [
  pi_n^2
  + m^2 phi_n^2
  + sum_i ((phi_{n+e_i} - phi_n)^2 / a_i^2)
]
```

### 3.3 Equations of motion on lattice

```text
d_t phi_n = pi_n
d_t pi_n = Laplacian(phi)_n - m^2 phi_n

Laplacian(phi)_n = sum_i (phi_{n+e_i} - 2 phi_n + phi_{n-e_i}) / a_i^2
```

### 3.4 Time integration

Use leapfrog/staggered updates for stability and symplectic behavior:

```text
pi(t + dt/2) = pi(t - dt/2) + dt * [Laplacian(phi(t)) - m^2 phi(t)]
phi(t + dt)  = phi(t) + dt * pi(t + dt/2)
```

### 3.5 Mode/dispersion relation (validation target)

For periodic lattice momenta `k_i = 2*pi*n_i/L_i`:

```text
omega_k^2 = m^2 + sum_i [ (2/a_i) * sin(k_i*a_i/2) ]^2
```

This is a core validation hook for educational correctness.

## 4. Scientific Observables to Expose

### 4.1 Equal-time correlator

```text
C(r, t) = <phi(x+r, t) phi(x, t)>_x
```

Display as radial average or axis-aligned profile.

### 4.2 Spectral content / structure factor

```text
S(k, t) = |phi_k(t)|^2
```

Useful for wave packet propagation, mode occupation intuition, and quench response.

### 4.3 Energy diagnostics

- total energy `E(t)`
- kinetic, gradient, mass contributions
- drift metric `|E(t)-E(0)|/E(0)`

### 4.4 Vacuum fluctuation baseline

For initialized vacuum-like Gaussian random state (with cutoff-aware normalization), show expected scaling trends and finite-volume effects.

## 5. High-Level Integration Design

### 5.1 Data model additions

Extend mode union in both runtime and compute typing:

- `SchroedingerQuantumMode` add `'freeScalarField'`
- `ComputeQuantumMode` add `'freeScalarField'`

Primary touchpoint:

- `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/compute/compose.ts:83`

Add `freeScalar` config section under `SchroedingerConfig`:

```ts
freeScalar: {
  enabled: boolean
  latticeDim: 1 | 2 | 3
  gridSize: [number, number, number]   // use z=1 for 2D, y=z=1 for 1D
  spacing: [number, number, number]
  mass: number
  dt: number
  stepsPerFrame: number
  boundary: 'periodic'

  initialCondition:
    | 'vacuumNoise'
    | 'singleMode'
    | 'gaussianPacket'
    | 'quench'

  // initial state params
  modeK: [number, number, number]
  packetCenter: [number, number, number]
  packetWidth: number
  packetAmplitude: number

  // quench params
  preQuenchMass: number
  postQuenchMass: number
  quenchTime: number

  // visualization
  fieldView: 'phi' | 'pi' | 'energyDensity'
  autoScale: boolean
  valueWindow: [number, number]

  // observables
  showCorrelator: boolean
  showSpectrum: boolean
  showEnergyDiagnostics: boolean
}
```

### 5.2 Compute pass architecture

Add dedicated passes modeled after existing cache passes:

1. `FreeScalarStateComputePass`

- Maintains ping-pong storage textures/buffers for `phi` and `pi`.
- Executes `stepsPerFrame` leapfrog steps.
- Rebuilds resources only when lattice shape changes.

2. `FreeScalarObservablesComputePass` (optional phase-2)

- Reduces field buffers into:
  - correlator profile
  - spectrum bins
  - energy components

Renderer integration location:

- Insert execution block in the same per-frame compute orchestration area as existing Wigner/eigen cache logic:
  - `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts:2390`

### 5.3 Shader composition strategy

Branch by mode in compute composition:

- Existing HO/hydrogen paths unchanged.
- Add `freeScalar` include set:
  - lattice constants
  - update kernel
  - initialization kernel(s)
  - observable kernels

Keep composition modular through existing `assembleShaderBlocks()` usage pattern.

### 5.4 Rendering reuse

Re-use current volume/cross-section visualization with mapped scalar:

- `fieldView = phi`: signed scalar field coloring.
- `fieldView = pi`: momentum-like scalar field coloring.
- `fieldView = energyDensity`: strictly nonnegative scalar suitable for existing density-style transfer.

Cross-section tooling can remain mostly unchanged, now sampling field state textures instead of HO/hydrogen `psi`-derived density.

## 6. High-Level UX and UI Elements

### 6.1 Mode entry

In Quantum State controls, add a third mode option:

- `Harmonic Oscillator`
- `Hydrogen N-D`
- `Free Scalar Field (Lattice)`

### 6.2 Control sections

Suggested UI sections when `freeScalarField` is active:

1. `Lattice Setup`
- dimension (1D/2D/3D)
- grid size
- spacing
- mass
- time-step `dt`
- steps/frame

2. `Initial Condition`
- preset picker (`vacuumNoise`, `singleMode`, `gaussianPacket`, `quench`)
- preset-specific parameters
- `Reset Field` button

3. `Field View`
- scalar selector (`phi`, `pi`, `energy density`)
- autoscale/window controls
- signed colormap toggle for `phi`/`pi`

4. `Observables`
- toggles: correlator / spectrum / energy
- mode selection for plotted cut direction or radial average

### 6.3 User journey examples

A. Dispersion learning flow

1. Select `singleMode` with known `k`.
2. Run simulation.
3. Read measured oscillation frequency and compare to theoretical `omega_k`.

B. Quench flow

1. Initialize in vacuum-like state with `m = m1`.
2. Apply quench to `m = m2` at `t_q`.
3. Observe transient growth/redistribution in `S(k,t)` and correlator light-cone-like spreading.

C. Vacuum fluctuation flow

1. Start with vacuum noise.
2. View correlator and energy decomposition.
3. Explain finite lattice/cutoff effects in tooltip text.

## 7. Developer-Facing UI Component Sketch

Suggested components:

- `FreeScalarControls.tsx`
- `FreeScalarInitialConditionSection.tsx`
- `FreeScalarFieldViewSection.tsx`
- `FreeScalarObservablesSection.tsx`
- `FieldDiagnosticsPanel.tsx`

Suggested compute/render classes:

- `FreeScalarStateComputePass.ts`
- `FreeScalarObservablesComputePass.ts`
- optional helper `FreeScalarUniformAdapter.ts`

Suggested WGSL modules:

- `compute/freeScalarState.wgsl.ts`
- `compute/freeScalarInit.wgsl.ts`
- `compute/freeScalarObservables.wgsl.ts`

## 8. Numerical and Scientific Validation Plan

### 8.1 Deterministic checks

- `dt -> 0` convergence for small test lattice.
- energy drift below threshold in free evolution.
- parity/symmetry checks for symmetric initial conditions.

### 8.2 Physics checks

- measured mode frequency agrees with lattice dispersion formula.
- group velocity trends match dispersion derivative behavior.
- correlator broadening behavior consistent with free propagation.

### 8.3 Regression checks

- Existing HO/hydrogen render paths remain unchanged when mode not active.
- No additional WebGPU validation errors.
- Resource lifecycle (resize/dispose) follows existing pass patterns.

## 9. Phased Delivery

Phase 1 (MVP):

- New mode wiring in types/store/UI.
- `FreeScalarStateComputePass` with `phi/pi` evolution.
- Basic field rendering (`phi` and `energyDensity`).

Phase 2:

- Observables compute pass (correlator, spectrum, energy).
- Diagnostics panel and instructional text.

Phase 3:

- Quench scenarios, preset tutorials, optional dispersion fit overlay.

## 10. Risks and Mitigations

- Risk: numerical instability for large `dt`.
  - Mitigation: enforce CFL-like bounds in UI and show warnings.
- Risk: conflating non-relativistic Schr mode with relativistic field mode.
  - Mitigation: explicit mode label and physics-model explanation.
- Risk: VRAM/perf pressure at large lattice sizes.
  - Mitigation: cap grid sizes by device tier; adaptive defaults.

## 11. Acceptance Criteria

- New mode runs stably for default lattice settings with no WebGPU errors.
- Users can initialize and evolve `phi/pi` in real time.
- At least one validated observable (dispersion or energy conservation) is visible in UI.
- Existing harmonic/hydrogen workflows remain behaviorally unchanged.
