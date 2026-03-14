# Plan: Quantum Chaos (Scarred Eigenstates in Chaotic Potentials)

## Overview

Add a new quantum mode `'quantumChaos'` that launches wavepackets into classically chaotic potentials and visualizes the resulting dynamics — including quantum scarring, ergodic spreading, and recurrences. Unlike the existing `tdseDynamics` mode which focuses on scattering/tunneling through simple potentials, this mode is purpose-built for chaos: coupled anharmonic potentials, long-time evolution, and controls tuned for exploring scar topology.

Under the hood, this reuses the TDSE split-operator FFT solver, the same `TDSEComputePass`, and the same `WebGPUSchrodingerRenderer` volumetric ray marcher. The new mode provides:
- Dedicated chaotic potential types (not mixed into the TDSE potential list)
- Distinct UI controls focused on chaos parameters (coupling strength, orbit visualization)
- Preset library of known chaotic systems with interesting scar structures
- Long-time evolution defaults (larger grids, slower dt, longer runs)

## Physics

### Quantum Scarring

In classically chaotic systems, most eigenstates are ergodic — their probability density spreads quasi-uniformly over the classically allowed region (Berry's random wave conjecture). However, a subset of eigenstates show anomalous concentration along unstable periodic orbits of the classical system. These "scars" (Heller, 1984) are:

- Bright ridges/tubes of enhanced |ψ|² tracing classical periodic orbits
- Typically 1.5–3× the mean ergodic density (subtle, not dramatic)
- Most visible in high-lying excited states
- Present in any classically chaotic system

### Why Time-Evolution (Not Eigenstate Computation)

Computing eigenstates of chaotic potentials requires diagonalizing large matrices (Lanczos/Arnoldi) or imaginary-time propagation with Gram-Schmidt deflation — both expensive and complex. Instead, we use real-time TDSE evolution:

1. Launch a wavepacket along a classical periodic orbit
2. The wavepacket initially follows the orbit (Ehrenfest time)
3. After Ehrenfest time, it scatters chaotically — probability spreads ergodically
4. At Heisenberg time (t_H ~ ℏ/ΔE), partial revivals occur along scar trajectories
5. The time-averaged density naturally highlights scars (constructive interference along periodic orbits)

This approach reuses the existing TDSE infrastructure with zero new compute passes.

### Chaotic Potentials

All potentials are N-dimensional, using the existing `latticeDim` loop structure in WGSL.

| Potential | Formula | Chaos Condition | Character |
|-----------|---------|-----------------|-----------|
| **Coupled Quartic** | V = ½Σω²x² + λΣᵢ<ⱼ xᵢ²xⱼ² | λ ≳ 0.05 with ω ~ 1 | Soft chaos, smooth scars |
| **Hénon-Heiles** | V = ½(x² + y²) + λ(x²y − y³/3) | E > 1/6λ² | Classic 2D chaos, homoclinic tangles |
| **Stadium** | V = 0 inside stadium, ∞ outside | Always (for L > 0) | Hard chaos, bouncing-ball scars |
| **Sinai** | V = 0 outside disk, ∞ inside (in box) | Always | Dispersing billiard, strong chaos |
| **Nelson** | V = ½(x² + y²) + λx²y² | λ > 0 | N-D generalizable, coupled oscillators |

**Phase 1 scope**: Coupled Quartic (Nelson) and Hénon-Heiles only. These generalize to N-D trivially and work with the existing soft-wall potential infrastructure (no hard-wall billiards needed).

### N-Dimensional Generalization

The coupled quartic potential V = ½Σ(ωᵢ²xᵢ²) + λΣᵢ<ⱼ(xᵢ²xⱼ²) scales naturally to any dimension:
- 2D: Single coupling term x₁²x₂²
- 3D: Three coupling terms (x₁²x₂² + x₁²x₃² + x₂²x₃²)
- ND: N(N-1)/2 coupling terms
- More dimensions = richer periodic orbit structure = more complex scar topology
- 3D slices through high-D scar manifolds shift as the user rotates through extra dimensions

## Architecture

### What We Reuse (No Changes Needed)

| Component | Role |
|-----------|------|
| `TDSEComputePass` | Split-operator time stepping, FFT, potential application |
| `WebGPUSchrodingerRenderer` | Volumetric ray marching of |ψ|² |
| `extendedObjectStore.schroedinger.tdse` | TdseConfig structure (grid, spacing, dt, mass, hbar) |
| TDSE uniform buffer | All existing uniforms passed to GPU |
| Wavepacket initialization | Gaussian wavepacket launch with configurable momentum |
| Energy diagram HUD | 1D potential profile visualization |

### What We Add

| Component | Location | Purpose |
|-----------|----------|---------|
| `SchroedingerQuantumMode: 'quantumChaos'` | `types.ts` | New mode entry |
| `ChaosConfig` interface | `types.ts` | Chaos-specific parameters |
| `chaosSlice` | `stores/slices/geometry/` | Store slice for chaos config |
| `ChaosPotentialControls.tsx` | `components/sections/Geometry/SchroedingerControls/` | UI for chaos parameters |
| WGSL potential branches | `tdsePotential.wgsl.ts` | New potential evaluation code |
| CPU potential mirror | `potentialProfile.ts` | 1D profile for energy diagram |
| Chaos presets | `lib/physics/chaos/presets.ts` | Known interesting configurations |

### What We Modify

| Component | Change |
|-----------|--------|
| `ObjectTypeExplorer.tsx` | Add `quantumChaos` card in Compute category |
| `SchroedingerControls/index.tsx` | Route to `ChaosPotentialControls` when mode is `quantumChaos` |
| `TdsePotentialType` | Add `'coupledQuartic'` and `'henonHeiles'` |
| `tdsePotential.wgsl.ts` | Add potential evaluation branches |
| `potentialProfile.ts` | Add 1D profile cases |
| `setSchroedingerQuantumMode` | Handle `quantumChaos` → set TDSE defaults for chaos |

## Implementation Tasks

### Task 1: Type Definitions

**Files**: `src/lib/geometry/extended/types.ts`

1. Add `'quantumChaos'` to `SchroedingerQuantumMode` union
2. Add `'coupledQuartic' | 'henonHeiles'` to `TdsePotentialType` union
3. Define `ChaosConfig` interface:

```typescript
interface ChaosConfig {
  /** Which chaotic potential to use */
  chaosPotential: 'coupledQuartic' | 'henonHeiles'
  /** Coupling strength λ — controls degree of chaos */
  couplingLambda: number
  /** Per-axis frequencies [ω₁, ω₂, ...] for coupled quartic */
  axisFrequencies: number[]
  /** Whether to use time-averaged density (highlights scars) */
  timeAveraged: boolean
  /** Number of frames to average over */
  averagingWindow: number
}
```

4. Add `chaos: ChaosConfig` to `SchroedingerConfig`
5. Add defaults

### Task 2: Store Slice

**Files**: `src/stores/slices/geometry/chaosSlice.ts`, `src/stores/extendedObjectStore.ts`

1. Create `chaosSlice` with getters/setters for all `ChaosConfig` fields
2. Wire into `extendedObjectStore` under `schroedinger.chaos`
3. Add `setSchroedingerQuantumMode` handler for `'quantumChaos'`:
   - Set dimension to 3 if < 3 (minimum for interesting chaos)
   - Set `potentialType` to `'coupledQuartic'`
   - Set larger grid (64³ minimum), smaller dt, longer evolution defaults
   - Set representation to `'position'`

### Task 3: WGSL Potential Shader

**Files**: `src/rendering/webgpu/shaders/schroedinger/compute/tdsePotential.wgsl.ts`

Add two new branches to the potential evaluation:

```wgsl
// Coupled quartic: V = ½Σ(ω²x²) + λΣᵢ<ⱼ(xᵢ²xⱼ²)
} else if (params.potentialType == 11u) {
  var harmonic: f32 = 0.0;
  // Store per-axis x² values for coupling terms
  var x2: array<f32, 11>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    let omega_d = params.chaosAxisFreq[d];
    x2[d] = pos * pos;
    harmonic += 0.5 * omega_d * omega_d * x2[d];
  }
  var coupling: f32 = 0.0;
  for (var i: u32 = 0u; i < params.latticeDim; i++) {
    for (var j: u32 = i + 1u; j < params.latticeDim; j++) {
      coupling += x2[i] * x2[j];
    }
  }
  V = harmonic + params.chaosLambda * coupling;

// Hénon-Heiles (2D/3D only): V = ½(x² + y²) + λ(x²y − y³/3)
} else if (params.potentialType == 12u) {
  let x = (f32(coords[0]) - f32(params.gridSize[0]) * 0.5 + 0.5) * params.spacing[0];
  let y = (f32(coords[1]) - f32(params.gridSize[1]) * 0.5 + 0.5) * params.spacing[1];
  V = 0.5 * (x * x + y * y) + params.chaosLambda * (x * x * y - y * y * y / 3.0);
}
```

### Task 4: TDSE Uniforms Extension

**Files**: `src/rendering/webgpu/passes/TDSEComputePass.ts`, TDSE uniform block

1. Add `chaosLambda: f32` to TDSE uniforms
2. Add `chaosAxisFreq: array<f32, 11>` to TDSE uniforms (or pack into existing padding)
3. Map `ChaosConfig` fields to uniform buffer in the compute pass

### Task 5: CPU Potential Profile

**Files**: `src/lib/physics/tdse/potentialProfile.ts`

1. Add `'coupledQuartic'` case to `evaluatePotential1D` — 1D slice shows the harmonic + quartic self-coupling term
2. Add `'henonHeiles'` case — 1D slice along x with y=0
3. Add corresponding `getPotentialPlotScale` entries

### Task 6: UI — ObjectTypeExplorer Card

**Files**: `src/components/sections/ObjectTypes/ObjectTypeExplorer.tsx`

1. Add `quantumChaos` to `MODE_FEATURES`: `{ minDim: 2, category: 'compute' }`
2. Add card to `modeOptions`:

```typescript
{
  value: 'quantumChaos',
  label: 'Quantum Chaos',
  description: 'Chaotic potentials with quantum scarring — wavepackets in coupled anharmonic wells.',
}
```

### Task 7: UI — Chaos Controls

**Files**: `src/components/sections/Geometry/SchroedingerControls/ChaosPotentialControls.tsx`

Controls needed:
- **Potential selector**: Toggle between Coupled Quartic / Hénon-Heiles
- **Coupling λ**: Slider [0.001, 1.0], log scale, default 0.1
- **Per-axis frequencies**: Sliders for ω₁...ωₙ (only for coupled quartic)
  - Incommensurate frequencies (e.g., ω₁=1.0, ω₂=√2) produce stronger chaos
  - Preset buttons: "Equal", "Golden Ratio", "Random Incommensurate"
- **Time averaging toggle**: Switch + window size slider
- **Chaos presets**: Dropdown with named configurations (see Task 8)

### Task 8: Presets

**Files**: `src/lib/physics/chaos/presets.ts`

Named configurations that produce visually interesting results:

| Preset | Potential | λ | Frequencies | Notes |
|--------|-----------|---|-------------|-------|
| Weak Chaos | Coupled Quartic | 0.05 | [1.0, 1.0, 1.0] | Near-integrable, sparse scars |
| Strong Chaos | Coupled Quartic | 0.5 | [1.0, √2, √3] | Fully chaotic, dense scar network |
| Hénon-Heiles Classic | Hénon-Heiles | 1.0 | — | The textbook system |
| Golden Ratio | Coupled Quartic | 0.1 | [1.0, φ, φ²] | Maximally incommensurate |
| High-D Chaos (6D) | Coupled Quartic | 0.2 | [1,√2,√3,√5,√7,√11] | Prime-root frequencies, rich topology |

### Task 9: SchroedingerControls Routing

**Files**: `src/components/sections/Geometry/SchroedingerControls/index.tsx`

1. When `quantumMode === 'quantumChaos'`, render `ChaosPotentialControls` instead of `TDSEPotentialControls`
2. Still show the shared TDSE controls (grid size, dt, evolution speed) since we reuse the solver

### Task 10: Wavepacket Launch Presets

**Files**: `src/lib/physics/chaos/presets.ts`

For scar visualization, the initial wavepacket should be launched along a classical periodic orbit. Each chaos preset should include:
- Initial position (center of a known orbit)
- Initial momentum (tangent to the orbit)
- Wavepacket width (narrow enough to resolve orbit structure)

These are computed from classical mechanics of the potential — e.g., for the coupled quartic, periodic orbits along the coordinate axes (x₁ oscillating, others zero) are known analytically.

### Task 11: Time-Averaged Density (Optional Enhancement)

**Files**: `src/rendering/webgpu/passes/TDSEComputePass.ts` or new compute pass

Time-averaging |ψ(x,t)|² highlights scars by suppressing interference fluctuations:
1. Maintain a running average buffer: `⟨|ψ|²⟩ = (1/T)∫|ψ(t)|²dt`
2. In practice: exponential moving average updated each frame
3. Toggle between instantaneous |ψ|² and time-averaged ⟨|ψ|²⟩ for visualization
4. This is a new storage buffer + a simple compute pass (accumulate and divide)

This is the feature that makes scars clearly visible — without it, instantaneous |ψ|² fluctuates wildly and scars are hard to see.

## Task Order (Dependencies)

```
Task 1 (types) ──────────────────────────────────┐
  ├── Task 2 (store slice)                        │
  │     └── Task 9 (controls routing)             │
  │           └── Task 7 (chaos UI controls)      │
  │                 └── Task 8 (presets)           │
  ├── Task 3 (WGSL potential)                     │
  │     └── Task 4 (uniforms extension)           │
  ├── Task 5 (CPU potential profile)              │
  ├── Task 6 (ObjectTypeExplorer card)            │
  └── Task 10 (wavepacket launch presets)         │
                                                  │
Task 11 (time-averaged density) ──── independent, │
  can be done after Tasks 1-4 are complete        │
```

## Verification

After all tasks are complete:

1. **Select "Quantum Chaos" in ObjectTypeExplorer** — mode switches, controls appear
2. **Coupled Quartic preset loads** — potential profile visible in energy diagram HUD
3. **Wavepacket launches and evolves** — density cloud visible in 3D ray marcher
4. **After Ehrenfest time** — cloud spreads ergodically (no longer follows a single orbit)
5. **Enable time averaging** — scar ridges/tubes gradually become visible as bright filaments
6. **Change λ** — scars change topology (weaker λ = sparser scars, stronger = denser)
7. **Rotate through N-D** — 3D scar cross-sections shift and morph
8. **Switch between presets** — different scar patterns for each configuration
9. **Hénon-Heiles in 2D/3D** — classic triangular symmetry visible in probability density
