# Plan: Bose-Einstein Condensate (Gross-Pitaevskii Equation)

## Overview

Add a new quantum mode `'becDynamics'` that simulates a Bose-Einstein condensate via the Gross-Pitaevskii equation (GPE). The GPE is the TDSE with one additional nonlinear term: `g|ψ|²ψ`, where `g` is the interaction strength.

This mode reuses the existing TDSE compute pipeline (`TDSEComputePass`) with minimal shader modifications. The nonlinearity enables quantized vortices, dark solitons, vortex rings, and quantum turbulence — phenomena absent from all current modes.

## Physics

The Gross-Pitaevskii equation:

```
iℏ ∂ψ/∂t = (-ℏ²/2m ∇² + V(x) + g|ψ|²) ψ
```

The split-step method handles the nonlinear term identically to the potential — it's a position-space phase kick:

```
ψ → ψ · exp(-i(V + g|ψ|²) dt / 2ℏ)
```

Key physical quantities:
- **Chemical potential**: μ = g·n₀ (peak density × interaction strength)
- **Healing length**: ξ = ℏ / √(2m·g·n₀) — minimum size of density features
- **Thomas-Fermi radius**: R_TF = √(2μ / mω²) — condensate boundary in a harmonic trap
- **Sound speed**: c_s = √(g·n₀ / m) — speed of Bogoliubov excitations

Dimensionless form (natural units ℏ = m = ω = 1):
```
i ∂ψ/∂t = (-½∇² + V + g̃|ψ|²) ψ
```
where g̃ = g·N (interaction × particle number).

## Architecture Decision: Extend TDSE, Not a Separate Pass

The GPE solver is identical to the TDSE solver except for 2 lines in the potential half-step shader. Creating a separate `BECComputePass` would duplicate ~95% of `TDSEComputePass` code.

**Approach**: The `TDSEComputePass` handles both TDSE and BEC. The renderer checks `quantumMode` and passes a `interactionStrength` parameter. When `g = 0`, the shader is pure TDSE. When `g ≠ 0`, it's GPE. The UI presents BEC as a separate mode with its own controls, presets, and diagnostics — but the compute backend is shared.

---

## Implementation Steps

### Phase 1: Type System & Config

#### Step 1.1: Add `'becDynamics'` to `SchroedingerQuantumMode`

**File**: `src/lib/geometry/extended/types.ts`

```typescript
// Line 109: extend the union
export type SchroedingerQuantumMode =
  | 'harmonicOscillator'
  | 'hydrogenND'
  | 'freeScalarField'
  | 'tdseDynamics'
  | 'becDynamics'
```

#### Step 1.2: Add `BecConfig` interface

**File**: `src/lib/geometry/extended/types.ts`

Add after the `TdseConfig` interface (around line 470):

```typescript
/**
 * BEC initial condition type.
 * - thomasFermi: Ground state in Thomas-Fermi approximation (inverted parabola)
 * - gaussianPacket: Standard Gaussian (same as TDSE)
 * - vortexImprint: Thomas-Fermi with a phase-imprinted vortex at center
 * - vortexLattice: Thomas-Fermi with an array of imprinted vortices
 * - darkSoliton: Thomas-Fermi with a density dip (phase step) along axis 0
 */
export type BecInitialCondition =
  | 'thomasFermi'
  | 'gaussianPacket'
  | 'vortexImprint'
  | 'vortexLattice'
  | 'darkSoliton'

/**
 * BEC field view type.
 * - density: |ψ|²
 * - phase: arg(ψ)
 * - superfluidVelocity: v_s = (ℏ/m) ∇arg(ψ), shows vortex flow
 * - healingLength: local ξ(x) = ℏ/√(2m·g·|ψ|²)
 */
export type BecFieldView = 'density' | 'phase' | 'superfluidVelocity' | 'healingLength'

/**
 * Configuration for the BEC (Gross-Pitaevskii) solver.
 */
export interface BecConfig {
  // === Lattice ===
  /** Spatial dimensionality (2-11, synced from global dimension) */
  latticeDim: number
  /** Grid points per dimension (power of 2, shares TDSE FFT requirement) */
  gridSize: number[]
  /** Grid spacing per dimension */
  spacing: number[]

  // === Physics ===
  /** Particle mass */
  mass: number
  /** Reduced Planck constant */
  hbar: number
  /** Time step */
  dt: number
  /** Sub-steps per frame */
  stepsPerFrame: number
  /** Nonlinear interaction strength g̃ = g·N */
  interactionStrength: number

  // === Trap ===
  /** Trap frequency ω (isotropic harmonic trap) */
  trapOmega: number
  /** Anisotropy ratios per dimension (ω_d / ω_0) — length matches latticeDim */
  trapAnisotropy: number[]

  // === Initial condition ===
  initialCondition: BecInitialCondition
  /** Vortex charge for vortexImprint (integer, typically ±1 or ±2) */
  vortexCharge: number
  /** Number of vortices in lattice arrangement for vortexLattice */
  vortexLatticeCount: number
  /** Soliton depth for darkSoliton (0-1, fraction of background density) */
  solitonDepth: number
  /** Soliton velocity for darkSoliton (fraction of sound speed) */
  solitonVelocity: number

  // === Display ===
  fieldView: BecFieldView
  /** Auto-scale density normalization */
  autoScale: boolean

  // === Absorber ===
  absorberEnabled: boolean
  absorberWidth: number
  absorberStrength: number

  // === Diagnostics ===
  diagnosticsEnabled: boolean
  diagnosticsInterval: number

  // === Runtime ===
  needsReset: boolean
  /** Slice positions for dimensions > 3 */
  slicePositions: number[]
}

export const DEFAULT_BEC_CONFIG: BecConfig = {
  latticeDim: 3,
  gridSize: [64, 64, 64],
  spacing: [0.15, 0.15, 0.15],
  mass: 1.0,
  hbar: 1.0,
  dt: 0.002,
  stepsPerFrame: 4,
  interactionStrength: 500.0,
  trapOmega: 1.0,
  trapAnisotropy: [1.0, 1.0, 1.0],
  initialCondition: 'thomasFermi',
  vortexCharge: 1,
  vortexLatticeCount: 4,
  solitonDepth: 1.0,
  solitonVelocity: 0.0,
  fieldView: 'density',
  autoScale: true,
  absorberEnabled: false,
  absorberWidth: 0.1,
  absorberStrength: 5.0,
  diagnosticsEnabled: true,
  diagnosticsInterval: 5,
  needsReset: true,
  slicePositions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}
```
Gemini Embedding 2 is our first natively multimodal embedding model that maps text, images, video, audio and documents into a single embedding space, enabling multimodal retrieval and classification across different types of media — and it’s available now in public preview.
The model is based on Gemini and leverages its best-in-class multimodal understanding capabilities to create high-quality embeddings across:
Text: supports an expansive context of up to 8192 input tokens
Images: capable of processing up to 6 images per request, supporting PNG and JPEG formats
Videos: supports up to 120 seconds of video input in MP4 and MOV formats
Audio: natively ingests and embeds audio data without needing intermediate text transcriptions
Documents: directly embed PDFs up to 6 pages long

#### Step 1.3: Add `bec` field to `SchroedingerConfig`

**File**: `src/lib/geometry/extended/types.ts`

In the `SchroedingerConfig` interface (around line 892), add:

```typescript
// === BEC Configuration (when quantumMode === 'becDynamics') ===
/** Gross-Pitaevskii condensate configuration */
bec: BecConfig
```

In `DEFAULT_SCHROEDINGER_CONFIG` (around line 1123), add:

```typescript
bec: DEFAULT_BEC_CONFIG,
```

#### Step 1.4: Add `bec` to `TRANSIENT_FIELDS`

**File**: `src/stores/utils/presetSerialization.ts`

Add `needsReset` under BEC config to the transient fields list, matching the pattern for TDSE:
```typescript
'schroedinger.bec.needsReset',
```

---

### Phase 2: Store Actions

#### Step 2.1: Add BEC actions to the Schrödinger slice

**File**: `src/stores/slices/geometry/schroedingerSlice.ts`

Add a `setSchroedingerQuantumMode` branch for `'becDynamics'` (mirroring the TDSE branch):

```typescript
if (mode === 'becDynamics') {
  if (state.schroedinger.representation !== 'position') {
    updates.representation = 'position'
  }
  if (state.schroedinger.crossSectionEnabled) {
    updates.crossSectionEnabled = false
  }
  const dim = useGeometryStore.getState().dimension
  const prev = state.schroedinger.bec
  if (prev.latticeDim !== dim) {
    const resized = resizeBecArrays(prev, dim)
    updates.bec = { ...prev, ...resized, needsReset: true }
  }
}
```

Add a `resizeBecArrays` helper (following `resizeTdseArrays` pattern):
```typescript
function resizeBecArrays(config: BecConfig, dim: number): Partial<BecConfig> {
  return {
    latticeDim: dim,
    gridSize: resizeArray(config.gridSize, dim, 64),
    spacing: resizeArray(config.spacing, dim, 0.15),
    trapAnisotropy: resizeArray(config.trapAnisotropy, dim, 1.0),
    slicePositions: resizeArray(config.slicePositions, dim, 0),
  }
}
```

Add BEC-specific setters using the existing `valueSetter` / `clampedSetter` patterns:

```typescript
setBecInteractionStrength: clampedSetter('bec.interactionStrength', -1000, 10000),
setBecTrapOmega: clampedSetter('bec.trapOmega', 0.01, 10.0),
setBecInitialCondition: valueSetter('bec.initialCondition'),
setBecFieldView: valueSetter('bec.fieldView'),
setBecVortexCharge: valueSetter('bec.vortexCharge'),
setBecDt: (dt: number) => { /* with CFL clamping */ },
setBecGridSize: (axis: number, size: number) => { /* with needsReset */ },
setBecNeedsReset: () => { /* set needsReset: true */ },
clearBecNeedsReset: () => { /* set needsReset: false */ },
// ... etc, following TdseConfig setter patterns
```

#### Step 2.2: Add actions to `ExtendedObjectState` type

**File**: `src/stores/slices/geometry/types.ts` (or wherever `ExtendedObjectActions` is defined)

Add the BEC setter signatures to the actions interface.

---

### Phase 3: GPU Compute — Extend TDSE for Nonlinearity

#### Step 3.1: Add `interactionStrength` to TDSE uniforms

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl.ts`

Replace the padding at offset 632:

```wgsl
// BEC interaction strength (0 = linear TDSE, >0 = repulsive GPE, <0 = attractive)
interactionStrength: f32,  // offset 632
_pad: f32,                 // offset 636 (pad to 640 bytes)
```

Total struct size stays 640 bytes.

#### Step 3.2: Add nonlinear term to potential half-step

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl.ts`

Change the potential computation to include the density-dependent term:

```wgsl
let V = potential[idx];

// GPE nonlinear interaction: g|ψ|²
let re = psiRe[idx];
let im = psiIm[idx];
let density = re * re + im * im;
let effectiveV = V + params.interactionStrength * density;

let phase = -effectiveV * params.dt / (2.0 * params.hbar);
let cosP = cos(phase);
let sinP = sin(phase);

// Complex rotation: (re + i*im) * (cosP + i*sinP)
psiRe[idx] = re * cosP - im * sinP;
psiIm[idx] = re * sinP + im * cosP;
```

When `interactionStrength = 0` (TDSE mode), this is mathematically identical to the current code. No behavior change for existing TDSE.

#### Step 3.3: Add BEC initial conditions to init shader

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/tdseInit.wgsl.ts`

Add new branches after `initCondition == 2` (superposition):

```wgsl
} else if (params.initCondition == 3u) {
  // Thomas-Fermi ground state: psi = sqrt(max(0, (mu - V) / g))
  // mu is passed via packetAmplitude, g via interactionStrength
  let mu = params.packetAmplitude;
  let g = params.interactionStrength;
  let V = 0.0;
  // Compute harmonic trap potential inline
  var r2tf: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    r2tf += pos * pos;
  }
  V = 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r2tf;
  let n = max(0.0, (mu - V) / max(g, 1e-10));
  reVal = sqrt(n);
  imVal = 0.0;

} else if (params.initCondition == 4u) {
  // Vortex imprint: Thomas-Fermi × exp(i·charge·θ)
  // θ = atan2(x₁, x₀) — vortex in the (x₀, x₁) plane
  let mu = params.packetAmplitude;
  let g = params.interactionStrength;
  var r2v: f32 = 0.0;
  var pos0v: f32 = 0.0;
  var pos1v: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    r2v += pos * pos;
    if (d == 0u) { pos0v = pos; }
    if (d == 1u) { pos1v = pos; }
  }
  let V = 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r2v;
  let n = max(0.0, (mu - V) / max(g, 1e-10));
  let rho = sqrt(n);
  // Phase winding: charge is encoded in packetMomentum[0]
  let charge = params.packetMomentum[0];
  let theta = atan2(pos1v, pos0v);
  let vortexPhase = charge * theta;
  // Vortex core: density vanishes at r_perp = 0
  let r_perp = sqrt(pos0v * pos0v + pos1v * pos1v);
  let xi = params.hbar / sqrt(2.0 * params.mass * max(g * n, 1e-10));
  let coreProfile = r_perp / sqrt(r_perp * r_perp + xi * xi);
  reVal = rho * coreProfile * cos(vortexPhase);
  imVal = rho * coreProfile * sin(vortexPhase);

} else if (params.initCondition == 5u) {
  // Dark soliton: Thomas-Fermi × tanh((x₀ - x_s) / (√2 ξ))
  let mu = params.packetAmplitude;
  let g = params.interactionStrength;
  var r2s: f32 = 0.0;
  var pos0s: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    r2s += pos * pos;
    if (d == 0u) { pos0s = pos; }
  }
  let V = 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r2s;
  let n0 = max(0.0, (mu - V) / max(g, 1e-10));
  let xi = params.hbar / sqrt(2.0 * params.mass * max(g * n0, 1e-10));
  let solitonProfile = tanh(pos0s / (1.414 * max(xi, 1e-6)));
  reVal = sqrt(n0) * solitonProfile;
  imVal = 0.0;
}
```

#### Step 3.4: Add BEC trap potential type

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/tdsePotential.wgsl.ts`

Add `potentialType == 9u` for anisotropic BEC trap:

```wgsl
} else if (params.potentialType == 9u) {
  // Anisotropic BEC trap: V = 0.5 * m * Σ(ω_d² * x_d²)
  // Trap anisotropy ratios stored in slicePositions (reused, documented)
  // For now, use isotropic harmonicOmega with anisotropy from kGridScale (repurposed)
  var r2: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    let omega_d = params.harmonicOmega * params.kGridScale[d];
    r2 += omega_d * omega_d * pos * pos;
  }
  V = 0.5 * params.mass * r2;
}
```

> **Note**: Reusing `kGridScale` array for trap anisotropy ratios in BEC mode avoids adding 48 bytes to the uniform struct. The kinetic step computes its own k-space scales from gridSize/spacing — it doesn't read `kGridScale` after the potential step. Document this dual-use clearly.

#### Step 3.5: Upload `interactionStrength` in `TDSEComputePass.ts`

**File**: `src/rendering/webgpu/passes/TDSEComputePass.ts`

In the `updateUniforms()` method, write `interactionStrength` at byte offset 632:

```typescript
// Byte offset 632: interactionStrength (f32)
this.uniformFloatView[158] = config.interactionStrength ?? 0.0
```

When called for TDSE mode, pass `0.0`. When called for BEC mode, pass the config value.

Also upload trap anisotropy ratios into the `kGridScale` slots (offset 544, indices 136-147) when in BEC mode:

```typescript
if (isBecMode) {
  for (let d = 0; d < config.latticeDim; d++) {
    this.uniformFloatView[136 + d] = config.trapAnisotropy?.[d] ?? 1.0
  }
}
```

#### Step 3.6: Chemical potential computation (CPU)

**File**: `src/lib/physics/bec/chemicalPotential.ts` (new file)

```typescript
/**
 * Compute Thomas-Fermi chemical potential for an isotropic N-D harmonic trap.
 *
 * μ_TF = (g̃ · N_dim_factor / (2π)^(D/2))^(2/(D+2)) × (ℏω/2) × correction_factors
 *
 * For practical use, the 3D formula is:
 *   μ = (15 g̃ ω³ m^(3/2) / (16π√2 ℏ^(3/2)))^(2/5) × ℏω / 2
 *
 * Simplified in natural units (ℏ=m=1):
 *   μ = 0.5 * (15 * g̃ / (4π))^(2/5) * ω^(6/5)
 */
export function thomasFermiMu3D(g: number, omega: number): number {
  return 0.5 * Math.pow((15 * g) / (4 * Math.PI), 2 / 5) * Math.pow(omega, 6 / 5)
}

/**
 * Thomas-Fermi radius in natural units.
 */
export function thomasFermiRadius(mu: number, mass: number, omega: number): number {
  return Math.sqrt((2 * mu) / (mass * omega * omega))
}

/**
 * Healing length at given density.
 */
export function healingLength(hbar: number, mass: number, g: number, density: number): number {
  const denom = 2 * mass * g * density
  if (denom <= 0) return Infinity
  return hbar / Math.sqrt(denom)
}

/**
 * Sound speed (Bogoliubov).
 */
export function soundSpeed(g: number, density: number, mass: number): number {
  return Math.sqrt((g * density) / mass)
}
```

---

### Phase 4: Renderer Integration

#### Step 4.1: Add `'becDynamics'` to `QUANTUM_MODE_MAP`

**File**: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

```typescript
const QUANTUM_MODE_MAP = {
  harmonicOscillator: 0,
  hydrogenND: 1,
  freeScalarField: 2,
  tdseDynamics: 3,
  becDynamics: 4,
}
```

#### Step 4.2: Route BEC through the existing TDSE pass

In the renderer's mode-detection logic (where `isTdse` is computed), add:

```typescript
const isBec = rendererConfig.quantumMode === 'becDynamics'
const isTdse = rendererConfig.quantumMode === 'tdseDynamics'
const isTdseOrBec = isTdse || isBec
```

Replace all `isTdse` references with `isTdseOrBec` where they control:
- `useDensityGrid` flag
- `densityGridHasPhase` flag
- TDSE pass execution
- Density texture binding

In the per-frame render loop, when dispatching `this.tdsePass.execute()`:
- For TDSE mode: pass `extended.schroedinger.tdse` config with `interactionStrength = 0`
- For BEC mode: pass a merged config derived from `extended.schroedinger.bec` mapped to `TdseConfig` shape, with `interactionStrength` from the BEC config

Add a helper:

```typescript
function becConfigToTdseDispatch(bec: BecConfig): TdseConfigForDispatch {
  return {
    ...bec,
    potentialType: 'harmonicTrap',  // BEC always uses trap (or custom type 9)
    interactionStrength: bec.interactionStrength,
    harmonicOmega: bec.trapOmega,
    // Map BEC initial conditions to initCondition integers
    initCondition: BEC_INIT_MAP[bec.initialCondition],
    // Map BEC field view to TDSE field view integers
    fieldView: BEC_FIELD_VIEW_MAP[bec.fieldView],
  }
}
```

#### Step 4.3: Shader compilation flags

**File**: `src/rendering/webgpu/shaders/schroedinger/compose.ts`

No new flags needed. BEC uses `useDensityGrid: true` and `densityGridHasPhase: true`, same as TDSE. The raymarching shader reads the density grid identically.

If BEC-specific color algorithms are added later, they can use existing `colorAlgorithm` slots.

---

### Phase 5: Diagnostics

#### Step 5.1: BEC diagnostics store

**File**: `src/stores/becDiagnosticsStore.ts` (new file)

```typescript
import { create } from 'zustand'

interface BecDiagnosticsState {
  hasData: boolean
  totalNorm: number
  maxDensity: number
  normDrift: number
  /** Chemical potential μ (computed from peak density) */
  chemicalPotential: number
  /** Healing length ξ at peak density */
  healingLength: number
  /** Sound speed at peak density */
  soundSpeed: number
  /** Thomas-Fermi radius */
  thomasFermiRadius: number
  /** Estimated vortex count (from phase winding analysis, approximate) */
  vortexCount: number

  update: (snapshot: Partial<BecDiagnosticsState>) => void
  reset: () => void
}

export const useBecDiagnosticsStore = create<BecDiagnosticsState>((set) => ({
  hasData: false,
  totalNorm: 1.0,
  maxDensity: 0,
  normDrift: 0,
  chemicalPotential: 0,
  healingLength: 0,
  soundSpeed: 0,
  thomasFermiRadius: 0,
  vortexCount: 0,
  update: (snapshot) => set({ ...snapshot, hasData: true }),
  reset: () => set({
    hasData: false, totalNorm: 1, maxDensity: 0, normDrift: 0,
    chemicalPotential: 0, healingLength: 0, soundSpeed: 0,
    thomasFermiRadius: 0, vortexCount: 0,
  }),
}))
```

#### Step 5.2: Compute BEC diagnostics from GPU readback

In `TDSEComputePass.ts`, after the existing norm/maxDensity readback, when in BEC mode:

```typescript
if (isBecMode && readbackData) {
  const { totalNorm, maxDensity } = readbackData
  const g = becConfig.interactionStrength
  const mu = g * maxDensity
  const xi = healingLength(becConfig.hbar, becConfig.mass, g, maxDensity)
  const cs = soundSpeed(g, maxDensity, becConfig.mass)
  const rtf = thomasFermiRadius(mu, becConfig.mass, becConfig.trapOmega)

  useBecDiagnosticsStore.getState().update({
    totalNorm, maxDensity, normDrift,
    chemicalPotential: mu,
    healingLength: xi,
    soundSpeed: cs,
    thomasFermiRadius: rtf,
  })
}
```

Vortex counting is deferred to a later phase — it requires phase-winding analysis on the GPU which is a separate compute pass.

---

### Phase 6: UI Controls

#### Step 6.1: `BECControls.tsx`

**File**: `src/components/sections/Geometry/SchroedingerControls/BECControls.tsx` (new file)

Structure mirrors `TDSEControls.tsx`. Sections:

1. **Scenario Preset** — Select dropdown with curated presets
2. **Initial Condition** — Select (Thomas-Fermi, Vortex, Dark Soliton, etc.)
   - Conditional sub-panels per initial condition (vortex charge, soliton depth/velocity)
3. **Physics** — Interaction strength (g̃), trap frequency (ω), anisotropy sliders per dimension
4. **Display** — Field view (density, phase, superfluid velocity, healing length), auto-scale
5. **Absorber** — Toggle + width/strength (for open boundary simulations)
6. **Numerics** — Grid size, spacing, mass, ℏ, dt, steps/frame
7. **Slice Positions** — For dims > 3 (same pattern as TDSE)
8. **Reset Button**

#### Step 6.2: Wire into `SchroedingerControls/index.tsx`

Add a new branch in the mode conditional (line 439):

```tsx
{isBecDynamics ? (
  <BECControls config={config} dimension={dimension} actions={becActions} />
) : isTdseDynamics ? (
  <TDSEControls ... />
) : ...}
```

Add `isBecDynamics` flag:
```typescript
const isBecDynamics = config.quantumMode === 'becDynamics'
```

Hide representation selector for BEC (same as TDSE/FSF):
```tsx
{!isFreeScalarField && !isTdseDynamics && !isBecDynamics && (
  <Section title="Representation" ...>
```

#### Step 6.3: Wire into mode selector

In the quantum mode `ToggleGroup` (in `SchroedingerControls/index.tsx`), add the BEC option:

```typescript
{ value: 'becDynamics', label: 'BEC' }
```

This goes alongside `harmonicOscillator`, `hydrogenND`, `freeScalarField`, `tdseDynamics`.

---

### Phase 7: Animation Drawer Integration

#### Step 7.1: Add BEC panel to `SchroedingerAnimationDrawer.tsx`

BEC is a compute mode — it uses `dt/stepsPerFrame` for time evolution, not `timeScale`. Same pattern as TDSE.

**Show for BEC**:
- TDSE Auto-Loop toggle (reuse, rename to "Auto-Loop" generically)
- Slice Animation (for dims ≥ 4)

**Hide for BEC** (same as other compute modes):
- Time Evolution (timeScale) — BEC uses its own dt
- Interference Fringing — requires inline evalPsi(), BEC uses density grid
- Probability Flow (texture noise) — same reason
- Probability Current (j-field) — same reason

Add `isBec` flag alongside existing `isTdse`:
```typescript
const isBec = config.quantumMode === 'becDynamics'
const isComputeMode = isFreeScalarField || isTdse || isBec
```

The auto-loop toggle condition becomes:
```tsx
{(isTdse || isBec) && (
  <div className="space-y-3" data-testid="animation-panel-autoLoop">
    ...
  </div>
)}
```

---

### Phase 8: Feature Compatibility Matrix

#### Step 8.1: Features to HIDE for `becDynamics`

These features use inline `evalPsi()` or analytical wavefunctions. BEC uses a density grid — they don't apply.

| Feature | Location | Action |
|-|-|-|
| Representation selector (position/momentum/wigner) | `SchroedingerControls/index.tsx` line 372 | Add `!isBecDynamics` guard |
| Quantum Effects section (nodal, uncertainty, phase materiality) | `SchroedingerQuantumEffectsSection.tsx` line 99 | Add `\|\| config.quantumMode === 'becDynamics'` |
| Cross-section | `setSchroedingerQuantumMode` in slice | Disable `crossSectionEnabled` on BEC switch |
| Open Quantum drawer | `SchroedingerOpenQuantumDrawer.tsx` | BEC is not HO/hydrogen — already hidden |
| Second Quantization section | `SecondQuantizationSection.tsx` | Check if gated by mode — add guard if needed |
| Interference fringing | Animation drawer | Already hidden by `isComputeMode` |
| Probability flow | Animation drawer | Already hidden by `isComputeMode` |
| Probability current (j) | Animation drawer | Already hidden by `isComputeMode` |
| Wigner controls | `WignerControls.tsx` | Already hidden (representation not available) |

#### Step 8.2: Features that WORK as-is with `becDynamics`

These read from the density grid texture and don't depend on inline wavefunction evaluation.

| Feature | Why it works |
|-|-|
| All 19 color algorithms | Compile-time specialization reads density grid; phase algorithms (3, 4, 6, 7, 8) read phase from rgba channels — same as TDSE |
| Isosurface rendering | Reads density grid, threshold-based — works identically |
| Lights (PBR, multi-light) | Applied to isosurface geometry — works identically |
| N-D rotation | Rotates the bounding cube and basis vectors — works identically |
| Post-processing (bloom, SSAO, tone mapping, etc.) | Operates on rendered image — mode-agnostic |
| Export (screenshot, video) | Mode-agnostic |
| Performance quality presets | Mode-agnostic |
| Temporal accumulation/reprojection | Reads density grid — works identically |
| Environment (skybox, ground) | Mode-agnostic |

#### Step 8.3: Features that NEED ADAPTATION

| Feature | What to change |
|-|-|
| `EnergyDiagramHUD` | Show BEC-specific readout: μ, ξ, c_s, R_TF instead of R/T. Gate visibility on `quantumMode === 'becDynamics'`. Draw μ line and R_TF markers on the V(x) plot. |
| Bounding radius | Compute from Thomas-Fermi radius: `R_bound = 1.5 × R_TF`. Add to `src/lib/geometry/extended/schroedinger/boundingRadius.ts`. |
| Timeline active animation count | Add BEC-specific flags if any BEC animations exist beyond auto-loop. |

---

### Phase 9: BEC Scenario Presets

#### Step 9.1: Create presets file

**File**: `src/lib/physics/bec/presets.ts` (new file)

```typescript
export interface BecScenarioPreset {
  id: string
  name: string
  description: string
  overrides: Partial<BecConfig>
}

export const BEC_SCENARIO_PRESETS: BecScenarioPreset[] = [
  {
    id: 'groundState',
    name: 'Ground State',
    description: 'Thomas-Fermi ground state in a harmonic trap — stationary condensate',
    overrides: {
      interactionStrength: 500,
      trapOmega: 1.0,
      initialCondition: 'thomasFermi',
      fieldView: 'density',
    },
  },
  {
    id: 'singleVortex',
    name: 'Single Vortex',
    description: 'Condensate with a single quantized vortex (charge +1) — watch it precess',
    overrides: {
      interactionStrength: 500,
      trapOmega: 1.0,
      initialCondition: 'vortexImprint',
      vortexCharge: 1,
      fieldView: 'phase',
    },
  },
  {
    id: 'vortexDipole',
    name: 'Vortex-Antivortex Pair',
    description: 'Opposite-charge vortex pair — they orbit each other or annihilate',
    overrides: {
      latticeDim: 2,
      gridSize: [128, 128],
      spacing: [0.1, 0.1],
      interactionStrength: 500,
      trapOmega: 0.5,
      initialCondition: 'vortexLattice',
      vortexLatticeCount: 2,
      fieldView: 'phase',
    },
  },
  {
    id: 'darkSoliton',
    name: 'Dark Soliton',
    description: 'Density dip propagating through the condensate — nonlinearity prevents spreading',
    overrides: {
      interactionStrength: 500,
      trapOmega: 0.3,
      initialCondition: 'darkSoliton',
      solitonDepth: 1.0,
      solitonVelocity: 0.0,
      fieldView: 'density',
    },
  },
  {
    id: 'quantumTurbulence',
    name: 'Quantum Turbulence',
    description: 'Chaotic vortex tangle from many imprinted vortices — turbulence in a superfluid',
    overrides: {
      interactionStrength: 1000,
      trapOmega: 0.5,
      initialCondition: 'vortexLattice',
      vortexLatticeCount: 8,
      fieldView: 'phase',
      dt: 0.001,
      stepsPerFrame: 8,
    },
  },
  {
    id: 'breathingMode',
    name: 'Breathing Mode',
    description: 'Condensate oscillates radially — collective excitation at 2ω (2D) or √5 ω (3D)',
    overrides: {
      interactionStrength: 500,
      trapOmega: 1.0,
      initialCondition: 'thomasFermi',
      fieldView: 'density',
      // CPU side: after init, rescale psi by 0.8 to kick the breathing mode
    },
  },
  {
    id: 'attractiveBec',
    name: 'Attractive BEC (Collapse)',
    description: 'Negative g — condensate collapses when N exceeds critical value',
    overrides: {
      interactionStrength: -200,
      trapOmega: 1.0,
      initialCondition: 'thomasFermi',
      fieldView: 'density',
    },
  },
]
```

---

### Phase 10: EnergyDiagramHUD Adaptation

#### Step 10.1: Extend HUD for BEC mode

**File**: `src/components/canvas/EnergyDiagramHUD.tsx`

The HUD currently gates on `quantumMode === 'tdseDynamics'`. Extend:

```typescript
const isBec = quantumMode === 'becDynamics'
const isVisible = ((quantumMode === 'tdseDynamics' && tdse.diagnosticsEnabled) ||
                   (isBec && bec.diagnosticsEnabled)) && !isCinematic
```

For BEC mode:
- **SVG plot**: Same V(x) profile (harmonic trap). Add horizontal dashed line at μ (chemical potential). Add vertical dashed lines at ±R_TF.
- **Metrics readout**: Replace R/T/normDrift with:
  ```
  μ = 12.5    ξ = 0.31
  c_s = 3.54  R_TF = 5.0
  ||ψ||² = 1.000  Δn = +0.01%
  ```

---

### Phase 11: Tests

#### Step 11.1: Unit tests

**File**: `src/tests/lib/physics/bec/chemicalPotential.test.ts`

Test `thomasFermiMu3D`, `healingLength`, `soundSpeed`, `thomasFermiRadius` against known analytical values.

#### Step 11.2: Store tests

**File**: `src/tests/stores/extendedObjectStore.bec.test.ts`

Following the pattern of `extendedObjectStore.freeScalar.test.ts`:
- Mode switching to `'becDynamics'` forces `representation = 'position'`
- Mode switching disables `crossSectionEnabled`
- `resizeBecArrays` correctly handles dimension changes
- BEC config setters clamp values correctly
- `needsReset` is set when grid dimensions change

#### Step 11.3: WGSL compilation test

**File**: `src/tests/rendering/webgpu/wgslCompilation.test.ts`

Add a case verifying the shader compiles with the modified `tdseApplyPotentialHalf` block containing the nonlinear term.

---

## File Summary

| File | Action | Description |
|-|-|-|
| `src/lib/geometry/extended/types.ts` | Edit | Add `'becDynamics'` to mode union, `BecConfig`, `DEFAULT_BEC_CONFIG` |
| `src/stores/slices/geometry/schroedingerSlice.ts` | Edit | Add BEC mode-switch logic, `resizeBecArrays`, BEC setters |
| `src/stores/slices/geometry/types.ts` | Edit | Add BEC action signatures |
| `src/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl.ts` | Edit | Add `interactionStrength` at offset 632 |
| `src/rendering/webgpu/shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl.ts` | Edit | Add `g\|ψ\|²` nonlinear term (2 lines) |
| `src/rendering/webgpu/shaders/schroedinger/compute/tdseInit.wgsl.ts` | Edit | Add Thomas-Fermi, vortex, soliton inits |
| `src/rendering/webgpu/shaders/schroedinger/compute/tdsePotential.wgsl.ts` | Edit | Add anisotropic trap (type 9) |
| `src/rendering/webgpu/passes/TDSEComputePass.ts` | Edit | Upload `interactionStrength`, route BEC config |
| `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` | Edit | Add `becDynamics` to mode map, `isTdseOrBec` routing |
| `src/lib/physics/bec/chemicalPotential.ts` | **New** | μ, ξ, c_s, R_TF computations |
| `src/lib/physics/bec/presets.ts` | **New** | 7 curated BEC scenario presets |
| `src/stores/becDiagnosticsStore.ts` | **New** | BEC diagnostics store |
| `src/components/sections/Geometry/SchroedingerControls/BECControls.tsx` | **New** | BEC UI controls |
| `src/components/sections/Geometry/SchroedingerControls/index.tsx` | Edit | Add BEC mode branch, hide representation |
| `src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx` | Edit | Add `isBec` to `isComputeMode`, show auto-loop |
| `src/components/sections/Advanced/SchroedingerQuantumEffectsSection.tsx` | Edit | Hide for `becDynamics` |
| `src/components/canvas/EnergyDiagramHUD.tsx` | Edit | BEC diagnostics display (μ, ξ, c_s, R_TF) |
| `src/stores/utils/presetSerialization.ts` | Edit | Add `bec.needsReset` to transient fields |
| `src/lib/geometry/extended/schroedinger/boundingRadius.ts` | Edit | BEC bounding radius from R_TF |
| `src/tests/lib/physics/bec/chemicalPotential.test.ts` | **New** | Physics unit tests |
| `src/tests/stores/extendedObjectStore.bec.test.ts` | **New** | Store tests |

**New files**: 5
**Edited files**: 16
**Core shader change**: 2 lines in `tdseApplyPotentialHalf.wgsl.ts` + 1 field in `tdseUniforms.wgsl.ts`

---

## Implementation Order

1. **Types & config** (Phase 1) — foundation, no runtime effect
2. **Store actions** (Phase 2) — enables UI development
3. **GPU compute** (Phase 3) — the physics engine, 2-line core change
4. **Renderer routing** (Phase 4) — connects GPU to display
5. **Diagnostics** (Phase 5) — observables readout
6. **UI controls** (Phase 6) — user-facing controls
7. **Animation drawer** (Phase 7) — timeline integration
8. **Feature compat** (Phase 8) — hide/show existing features
9. **Presets** (Phase 9) — curated scenarios
10. **HUD** (Phase 10) — diagnostic overlay
11. **Tests** (Phase 11) — verification

Phases 1-4 are the critical path. Once those are done, the BEC mode is functional (you can switch to it and see a condensate evolve). Phases 5-11 are polish and integration.
