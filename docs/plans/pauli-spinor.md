# Plan: Pauli Spinor Wavefunctions (New Object Type)

## Overview

Add a new object type `'pauliSpinor'` that simulates the non-relativistic Pauli equation — the Schrödinger equation extended to two-component spinor wavefunctions in a magnetic field. From the user's perspective this is a completely independent object type with its own UI controls, presets, and store. Under the hood it reuses the existing TDSE split-step FFT infrastructure, Dirac multi-component grid management, and the Schrödinger volume renderer.

The Pauli equation is the simplest physically correct description of spin-½ particles. Spin is the most fundamentally quantum property — no classical analog, half-integer angular momentum — and is currently absent from the app as a standalone, user-friendly feature. Visualizing two interlocked spin-up/spin-down clouds that precess and exchange amplitude in a magnetic field, culminating in dynamic Stern-Gerlach beam splitting, would be genuinely novel for a web-based quantum visualizer.

## Physics

### The Pauli Equation

```
iℏ ∂ψ/∂t = [p²/(2m) + V(x) + μ_B σ·B(x)] ψ
```

where:
- `ψ = (ψ↑, ψ↓)` is a **2-component spinor** (always 2 components, regardless of spatial dimension)
- `σ = (σ_x, σ_y, σ_z)` are the three Pauli matrices
- `B(x)` is the magnetic field vector (3 components, acting on the first 3 spatial dimensions)
- `μ_B = eℏ/(2mc)` is the Bohr magneton
- `p²/(2m)` is the standard non-relativistic kinetic energy (scalar, diagonal in spinor space)
- `V(x)` is the scalar potential (also diagonal in spinor space)

### Key Distinction from Dirac

| Property | Pauli | Dirac |
|----------|-------|-------|
| Spinor components | Always 2 | 2^(⌊(N+1)/2⌋), up to 32 |
| Kinetic term | p²/(2m) — scalar, non-relativistic | cα·p — matrix, relativistic |
| Coupling | Zeeman (σ·B) | Spin-orbit intrinsic |
| Solver basis | TDSE split-step FFT + 2×2 potential matrix | Full matrix exponential in k-space |
| Conceptual level | "Schrödinger + spin" | Full relativistic QFT |

The Pauli equation is simpler and more pedagogically accessible than Dirac. The kinetic term is identical to the scalar TDSE (diagonal in spinor space), so the existing FFT split-step machinery applies directly. The only new physics is the Zeeman coupling `μ_B σ·B`, which mixes the two spinor components during the potential half-step via a 2×2 matrix exponential.

### Solver: Split-Operator with Zeeman Coupling

Strang splitting per time step:

1. **Half-step potential** (position space):
   - Scalar part: `exp(-iV(x)dt/(2ℏ))` applied to both components independently
   - Zeeman part: `exp(-iμ_B σ·B(x) dt/(2ℏ))` — a 2×2 SU(2) rotation mixing ψ↑ and ψ↓
   - The 2×2 matrix exponential has a closed-form: rotation by angle `|B|dt μ_B/ℏ` around axis `B/|B|`

2. **FFT** both components independently (2 FFTs, not S)

3. **Full-step kinetic** (momentum space):
   - `exp(-iℏk²dt/(2m))` applied to each component independently (scalar phase kick, identical to TDSE)

4. **Inverse FFT** both components

5. **Half-step potential** (same as step 1)

### Magnetic Field Configurations

| Configuration | B(x) | Physics |
|---------------|-------|---------|
| Uniform | `B = B₀ ẑ` | Larmor precession at ω_L = μ_B B₀/ℏ |
| Gradient (Stern-Gerlach) | `B = (B₀ + b'z) ẑ` | Spatial splitting of spin-up vs spin-down |
| Rotating | `B = B₀(cos(ωt), sin(ωt), 0)` | Rabi oscillations, spin flip |
| Inhomogeneous | `B = b(x ẑ + z x̂)` | Quadrupole trap, complex precession |

### N-Dimensional Extension

The spinor is always 2-component regardless of spatial dimension N. The magnetic field `B` defines a direction in the first 3 spatial dimensions. Dimensions 4 through N evolve with the standard kinetic term only — no magnetic coupling. This means spin precession projected through higher-dimensional slices produces visually unique patterns not seen in 3D.

## User Experience

### What the User Sees

- A new entry **"Pauli Spinor"** in the object type selector, alongside "Schrödinger Slices"
- Dedicated sidebar section with:
  - Magnetic field direction (spherical angles θ, φ) and strength B₀
  - Field gradient strength b' (for Stern-Gerlach)
  - Field configuration selector (uniform / gradient / rotating / custom)
  - Spin visualization mode (spin density, total density, spin expectation vector)
  - Initial spin direction (Bloch sphere angles)
  - Standard TDSE controls: grid size, spacing, dt, steps/frame
- Two-color volume rendering: spin-up (cyan) and spin-down (magenta) as distinct density clouds
- Curated presets: Larmor Precession, Stern-Gerlach Splitting, Rabi Oscillations, Spin Echo
- Analysis section showing: spin expectation ⟨σ⟩, spin polarization, precession frequency

### What the User Doesn't See

- Under the hood, the renderer is `WebGPUSchrodingerRenderer` with a new color mode
- The compute infrastructure shares FFT pipelines with TDSE
- The grid management reuses patterns from `DiracComputePass`
- The object type registry dispatches to shared rendering code

## Architecture

### Layer-by-Layer Changes

#### 1. Type System

**`src/lib/geometry/types.ts`**
```typescript
export type ObjectType = 'schroedinger' | 'pauliSpinor'
```

**`src/lib/geometry/extended/types.ts`** — add:
```typescript
export interface PauliConfig {
  // Grid
  gridSize: number[]
  latticeDim: number
  spacing: number[]
  dt: number
  stepsPerFrame: number
  hbar: number
  mass: number
  needsReset: boolean
  autoScale: boolean

  // Magnetic field
  fieldType: 'uniform' | 'gradient' | 'rotating' | 'quadrupole'
  fieldStrength: number        // B₀
  fieldDirection: [number, number]  // (θ, φ) spherical angles
  gradientStrength: number     // b' for Stern-Gerlach
  rotatingFrequency: number    // ω for rotating field

  // Initial spin state
  initialSpinDirection: [number, number]  // (θ, φ) on Bloch sphere

  // Visualization
  fieldView: PauliFieldView
  spinUpColor: [number, number, number]
  spinDownColor: [number, number, number]

  // Absorber
  absorberEnabled: boolean
  absorberStrength: number
  absorberWidth: number

  // Diagnostics
  diagnosticsEnabled: boolean
  diagnosticsInterval: number

  // Slice positions (for N-D)
  slicePositions: number[]

  // Initial wavepacket (reuse TDSE patterns)
  initialCondition: PauliInitialCondition
  packetCenter: number[]
  packetWidth: number
  packetMomentum: number[]

  // Potential (reuse TDSE potential types)
  potentialType: PauliPotentialType
  harmonicOmega: number
  wellDepth: number
  wellWidth: number
  showPotential: boolean
}

export type PauliFieldView =
  | 'spinDensity'        // Separate cyan/magenta clouds
  | 'totalDensity'       // Combined |ψ↑|² + |ψ↓|²
  | 'spinExpectation'    // Color-mapped by ⟨σ_z⟩ direction
  | 'coherence'          // |ψ↑* ψ↓| off-diagonal density matrix

export type PauliInitialCondition =
  | 'gaussianSpinUp'
  | 'gaussianSpinDown'
  | 'gaussianSuperposition'
  | 'planeWaveSpinor'

export type PauliPotentialType =
  | 'none'
  | 'harmonicTrap'
  | 'barrier'
  | 'doubleWell'
```

**`src/lib/geometry/extended/types.ts`** — extend `ExtendedObjectParams`:
```typescript
export interface ExtendedObjectParams {
  schroedinger: SchroedingerConfig
  pauliSpinor: PauliConfig       // NEW
}
```

#### 2. Object Type Registry

**`src/lib/geometry/registry/registry.ts`** — add entry:
```typescript
['pauliSpinor', {
  type: 'pauliSpinor',
  name: 'Pauli Spinor',
  description: 'Two-component spinor wavefunction in a magnetic field. Visualizes spin precession and Stern-Gerlach splitting.',
  category: 'fractal',  // same rendering paradigm as schroedinger

  dimensions: {
    min: 2,
    max: 11,
    recommended: 3,
    recommendedReason: '3D provides intuitive spin dynamics with magnetic field in physical space',
  },

  rendering: {
    supportsFaces: true,
    supportsEdges: true,
    supportsPoints: false,
    renderMethod: 'raymarch',
    faceDetection: 'none',
    requiresRaymarching: true,
    supportsEmission: true,
  },

  animation: {
    hasTypeSpecificAnimations: true,
    systems: {
      sliceAnimation: {
        name: 'Slice Animation',
        description: 'Animate through higher-dimensional slices (4D+ only)',
        enabledByDefault: false,
        minDimension: 4,
        enabledKey: 'sliceAnimationEnabled',
        params: {
          sliceSpeed: { min: 0.01, max: 0.1, default: 0.02, step: 0.01, label: 'Speed', description: 'Speed of slice movement' },
          sliceAmplitude: { min: 0.1, max: 1.0, default: 0.3, step: 0.05, label: 'Amplitude', description: 'Slice movement range' },
        },
      },
    },
  },

  urlSerialization: {
    typeKey: 'pauliSpinor',
    serializableParams: [],
  },

  ui: {
    controlsComponentKey: 'PauliSpinorControls',
    hasTimelineControls: true,
    qualityPresets: ['draft', 'standard', 'high', 'ultra'],
  },

  configStoreKey: 'pauliSpinor',
}]
```

#### 3. Store Layer

**New file: `src/stores/slices/geometry/pauliSpinorSlice.ts`**
- Manages `PauliConfig` state
- Follows exact same pattern as the existing `schroedingerSlice.ts`
- Setters for all config fields, `needsReset` flag, version counter

**`src/stores/slices/geometry/types.ts`**
- Add `PauliConfig` to `ExtendedObjectParams`
- Add `DEFAULT_PAULI_CONFIG` constant

**`src/stores/extendedObjectStore.ts`**
- Add `pauliSpinor` config key
- Wire up `clearPauliNeedsReset` action

#### 4. Compute Pass

**New file: `src/rendering/webgpu/passes/PauliComputePass.ts`**

This is the core physics engine. It reuses infrastructure from `DiracComputePass` but is fundamentally simpler:

- **Grid**: Two 3D textures (or one with 2 layers) for ψ↑ and ψ↓, each storing complex values (Re, Im)
- **FFT**: Reuse the FFT pipeline from DiracComputePass (2 independent transforms instead of S)
- **Potential half-step shader**: New — computes the 2×2 SU(2) rotation from `μ_B σ·B(x)` and the scalar potential. Closed-form matrix exponential (rotation by angle θ around axis n̂):
  ```
  U = cos(θ/2)·I - i·sin(θ/2)·(n̂·σ)
  ```
  where `θ = |B(x)| · μ_B · dt / ℏ` and `n̂ = B(x)/|B(x)|`
- **Kinetic full-step shader**: Identical to TDSE — scalar phase `exp(-iℏk²dt/(2m))`
- **Density write shader**: New — writes spin-up and spin-down densities to the 3D density texture with distinct color channels. Modes:
  - `spinDensity`: R = |ψ↑|², B = |ψ↓|² (separate channels for dual-color rendering)
  - `totalDensity`: single channel |ψ↑|² + |ψ↓|²
  - `spinExpectation`: color-mapped by local ⟨σ_z⟩ = (|ψ↑|² - |ψ↓|²) / (|ψ↑|² + |ψ↓|²)
- **Diagnostics shader**: Compute ⟨σ_x⟩, ⟨σ_y⟩, ⟨σ_z⟩, total norm, per-component norms

Reused from DiracComputePass:
- Buffer allocation pattern (Re/Im spinor buffers)
- FFT dispatch infrastructure (stage pipelines, scratch buffers, twiddle factors)
- Density texture write pipeline
- Diagnostics reduction pipeline
- Absorber boundary implementation

#### 5. WGSL Shaders

**New files in `src/rendering/webgpu/shaders/schroedinger/compute/`:**

| Shader | Purpose |
|--------|---------|
| `pauliUniforms.wgsl.ts` | Uniform struct: magnetic field, coupling, grid params |
| `pauliInit.wgsl.ts` | Initialize spinor from Gaussian wavepacket + spin state |
| `pauliPotentialHalf.wgsl.ts` | Half-step: scalar V + Zeeman 2×2 rotation |
| `pauliKinetic.wgsl.ts` | Full-step kinetic phase (identical to TDSE, reuse if possible) |
| `pauliWriteGrid.wgsl.ts` | Write density grid with spin-resolved color channels |
| `pauliDiagnostics.wgsl.ts` | Compute spin expectation values and norms |
| `pauliAbsorber.wgsl.ts` | Boundary absorber (same structure as Dirac) |

**Modified shader: volume `emission.wgsl.ts`**
- Add a code path for the `pauliSpinor` object type / spin-density field view
- When in `spinDensity` mode: sample R channel as spin-up density (map to cyan), B channel as spin-down density (map to magenta), blend additively where they overlap (producing violet)
- This is the key visual feature — two colored volumetric clouds

#### 6. Renderer Integration

**`src/rendering/webgpu/WebGPUScene.ts`**
- `createObjectRenderer`: add `case 'pauliSpinor':` that creates a `WebGPUSchrodingerRenderer` configured for Pauli mode (reuse the same renderer class, just with different config flags)
- `setupSchrodingerPasses`: conditionally create `PauliComputePass` when objectType is `pauliSpinor`
- `extractSchrodingerConfig` / `extractPPConfig`: handle the new object type

**`src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`**
- The renderer already handles multiple quantum modes via `setQuantumMode`
- Add awareness of `pauliSpinor` object type for the spin-density color pathway
- The density texture format may need adjustment (2 channels for spin-up/down vs 1)

#### 7. UI Components

**New directory: `src/components/sections/Geometry/PauliSpinorControls/`**

| File | Purpose |
|------|---------|
| `index.tsx` | Main controls component (registered in component loader) |
| `MagneticFieldControls.tsx` | Field type selector, strength, direction, gradient |
| `SpinControls.tsx` | Initial spin direction (Bloch sphere angles) |
| `PauliGridControls.tsx` | Grid size, spacing, dt, steps/frame (reuse TDSE patterns) |
| `PauliPotentialControls.tsx` | Potential type selector (reuse from TDSE) |
| `PauliVisualizationControls.tsx` | Field view mode, spin colors |

**`src/components/sections/ObjectTypes/ObjectTypeExplorer.tsx`**
- Add `pauliSpinor` to `MODE_FEATURES` with description of spin visualization capabilities

**New: `src/components/sections/Advanced/PauliAnalysisSection.tsx`**
- Spin expectation vector ⟨σ⟩ display (Bloch sphere or 3D arrow)
- Spin polarization gauge
- Precession frequency readout
- Norm conservation monitor

**`src/rendering/webgpu/shaders/palette/types.ts`**
- Add spin-density color algorithm entry if needed

#### 8. Presets

**New file: `src/lib/physics/pauli/presets.ts`**

| Preset | Description |
|--------|-------------|
| Larmor Precession | Spin-up packet in uniform B-field — watch spin precess at ω_L |
| Stern-Gerlach | Spin superposition in gradient field — beam splits into two |
| Rabi Oscillations | Rotating field drives full spin flip — population oscillates |
| Spin Echo | Two-pulse sequence refocuses dephased spins |
| Magnetic Trap | Quadrupole field confines spin-polarized packet |

#### 9. Bounding Radius

**`src/lib/geometry/extended/schroedinger/boundingRadius.ts`**
- Add `computePauliBoundingRadius` function
- Similar to `computeDiracBoundingRadius` — based on wavepacket extent + absorber margin

#### 10. Diagnostics Store

**New file: `src/stores/pauliDiagnosticsStore.ts`**
- Spin expectation values: ⟨σ_x⟩, ⟨σ_y⟩, ⟨σ_z⟩
- Per-component norms: ||ψ↑||², ||ψ↓||²
- Total norm (conservation check)
- Precession frequency (derived from ⟨σ⟩ time series)

## Implementation Order

### Phase 1: Foundation (Type System + Store + Registry)
1. Extend `ObjectType` union with `'pauliSpinor'`
2. Define `PauliConfig` interface and defaults
3. Add registry entry for `pauliSpinor`
4. Create Pauli store slice and wire into `extendedObjectStore`
5. Add `isExtendedObjectType` check for `'pauliSpinor'`
6. Update `geometryStore` validation for new type
7. **Verify**: object type selector shows "Pauli Spinor", switching to it doesn't crash

### Phase 2: Compute Pass (Core Physics)
8. Create `PauliComputePass` scaffold (extend patterns from `DiracComputePass`)
9. Write `pauliUniforms.wgsl.ts` — uniform struct for grid params + magnetic field
10. Write `pauliInit.wgsl.ts` — Gaussian wavepacket × initial spin state
11. Write `pauliPotentialHalf.wgsl.ts` — scalar V + Zeeman SU(2) rotation
12. Adapt kinetic shader (reuse TDSE scalar phase kick, run on 2 components)
13. Write `pauliWriteGrid.wgsl.ts` — spin-resolved density to 3D texture
14. Wire FFT infrastructure (reuse from DiracComputePass)
15. Wire absorber shader
16. Integrate into `WebGPUScene.ts` pass setup
17. **Verify**: density grid populates, basic Gaussian wavepacket visible

### Phase 3: Visualization (Dual-Color Rendering)
18. Modify density texture format to carry spin-up/spin-down in separate channels
19. Add spin-density color path in `emission.wgsl.ts` — cyan for ↑, magenta for ↓
20. Add `spinDensity` / `totalDensity` / `spinExpectation` field view modes to renderer
21. Wire `WebGPUSchrodingerRenderer` to handle `pauliSpinor` object type
22. **Verify**: two distinct colored clouds visible, overlap produces violet blend

### Phase 4: UI Controls
23. Create `PauliSpinorControls` component directory and main index
24. Implement magnetic field controls (type, strength, direction, gradient)
25. Implement spin state controls (initial direction on Bloch sphere)
26. Implement grid/solver controls (reuse TDSE control patterns)
27. Implement visualization mode selector
28. Register controls component in the component loader
29. Add to `ObjectTypeExplorer` features
30. **Verify**: all controls read from and write to the Pauli store correctly

### Phase 5: Diagnostics + Analysis
31. Create `pauliDiagnosticsStore`
32. Write `pauliDiagnostics.wgsl.ts` — GPU reduction for spin expectation values
33. Create `PauliAnalysisSection` component
34. Wire diagnostics readback in compute pass
35. **Verify**: spin expectation values update in real-time, norm conserved

### Phase 6: Presets + Polish
36. Create Pauli scenario presets (Larmor, Stern-Gerlach, Rabi, Spin Echo, Trap)
37. Add `computePauliBoundingRadius` function
38. Add Pauli to URL serializer type key (minimal — just type identifier)
39. Add preset selector to UI controls
40. End-to-end testing: verify each preset produces physically correct behavior
41. **Verify**: Stern-Gerlach preset shows visible beam splitting, Larmor shows precession

## Reuse Summary

| Component | Reuse From | Modification |
|-----------|-----------|--------------|
| Volume renderer | `WebGPUSchrodingerRenderer` | Add spin-density color path |
| FFT pipeline | `DiracComputePass` | 2 components instead of S |
| Buffer management | `DiracComputePass` | Simplified (always 2 buffers) |
| Kinetic shader | TDSE (scalar phase) | Identical, run twice |
| Density grid | `DensityGridPass` | Multi-channel for spin components |
| Absorber | `DiracComputePass` | Same structure, 2 components |
| Grid controls UI | `DiracControls` | Subset of controls |
| Diagnostics pipeline | `DiracComputePass` | Simplified reduction |
| Bounding radius | `computeDiracBoundingRadius` | Same approach |
| Preset pattern | `DIRAC_SCENARIO_PRESETS` | Same interface |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Density texture format change breaks existing modes | High | Use a separate texture format for Pauli, or add a second texture. Don't modify the existing single-channel format. |
| FFT precision for 2-component case | Low | Identical to TDSE — already validated |
| Zeeman rotation numerical stability | Low | Closed-form SU(2) rotation is unitarity-preserving by construction |
| Memory (2 complex grids) | Low | Half the memory of Dirac (2 vs S components) |
| Spin-density dual-color rendering performance | Medium | Two texture samples per ray step instead of one. Profile and optimize if needed. |
| Object type selector UI crowding | Low | Only 2 entries. Consider grouping under a "Quantum" category if more are added later. |
