# WGSL Shader Composition & Uniform Layouts - TDSE Planning Reference

## Date
2026-02-20 — Comprehensive exploration for TDSE shader module architecture planning

## 1. Shader Composition Patterns (`assembleShaderBlocks`)

### Function Signature
```typescript
assembleShaderBlocks(
  blocks: ShaderBlock[],
  overrides?: Array<{ target: string; replacement: string }>
): { wgsl: string; modules: string[] }
```

### ShaderBlock Interface
```typescript
interface ShaderBlock {
  name: string              // Debugging label
  content: string           // WGSL source code (can be multiline)
  condition?: boolean       // Optional: skip if === false
}
```

### Behavior
- Iterates blocks in order; skips if `condition === false`
- Adds header comments for each block: `// ====== {name} ======`
- Returns assembled WGSL and list of included module names
- Supports overrides: find block by name and replace content
- Each block is a self-contained WGSL module (functions, struct, constants)

### Key Insight for TDSE
- Blocks are composed sequentially with clear separation
- No inter-block symbol resolution required (each block self-contained or explicitly imports via names)
- Dead-code elimination handled naturally (if a symbol isn't used, WGSL compiler removes it)
- Compute shaders use same pattern as fragment shaders

---

## 2. Existing Compute Shader Patterns

### Compute Shader Files in `src/rendering/webgpu/shaders/schroedinger/compute/`

**Free Scalar Field (Klein-Gordon TDSE-adjacent):**
1. `freeScalarInit.wgsl.ts` — Initialize phi, pi from IC
2. `freeScalarUpdatePi.wgsl.ts` — Pi-update (momentum step)
3. `freeScalarUpdatePhi.wgsl.ts` — Phi-update (position step)
4. `freeScalarWriteGrid.wgsl.ts` — Write density grid to texture
5. `freeScalarNDIndex.wgsl.ts` — N-D indexing helpers
6. `compose.ts` — Composition logic for compute shaders

**Composition/Caching:**
- `composeEigenCache.ts`, `eigenfunctionCache.wgsl.ts`
- `composeWignerCache.ts`, `wignerCache.wgsl.ts`, `wignerSpatial.wgsl.ts`, etc.

---

## 3. Uniform Buffer Layouts

### SchroedingerUniforms (Main Wavefunction Uniform)
**File:** `src/rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts`

**Key struct layout:**
```wgsl
struct SchroedingerUniforms {
  // Quantum mode (i32)
  quantumMode: i32,          // 0=HO, 1=Hydrogen ND, 2=free scalar
  
  // HO config
  termCount: i32,            // 1-8 superposition terms
  _padScalar0: i32,          // Padding
  _padScalar1: i32,          // Padding

  // Packed arrays (16-byte aligned)
  omega: array<vec4f, 3>,        // 11 f32 values (3*4=12 slots)
  quantum: array<vec4<i32>, 22>, // 88 i32 values (MAX_TERMS*MAX_DIM)
  coeff: array<vec4f, 8>,        // 8 complex (vec2f each)
  energy: array<vec4f, 2>,       // 8 f32 values

  // Hydrogen config (scalars)
  principalN: i32,
  azimuthalL: i32,
  magneticM: i32,
  bohrRadius: f32,
  useRealOrbitals: u32,
  hydrogenBoost: f32,
  hydrogenNDBoost: f32,
  hydrogenRadialThreshold: f32,
  
  // Extra-dim HO (hydrogen N-D)
  extraDimN: array<vec4<i32>, 2>,
  extraDimOmega: array<vec4f, 2>,

  // Volume rendering
  phaseAnimationEnabled: u32,
  timeScale: f32,            // Animation speed
  fieldScale: f32,           // Coordinate scale
  densityGain: f32,          // Absorption
  powderScale: f32,          // Scattering
  emissionIntensity: f32,
  emissionThreshold: f32,
  emissionColorShift: f32,
  peakDensity: f32,
  densityContrast: f32,      // Lobe sharpening power
  scatteringAnisotropy: f32, // Henyey-Greenstein g

  // ... many more (total ~1488 bytes)
  
  // Animation time (critical for TDSE)
  time: f32,                 // Scaled animation time
  
  // Wigner visualization
  wignerDimensionIndex: i32,
  wignerCrossTermsEnabled: u32,
  wignerXRange: f32,
  wignerPRange: f32,
  wignerQuadPoints: i32,
  wignerClassicalOverlay: u32,
  
  // ... reserved fields for removed features
}
```

**Access helpers in WGSL:**
```wgsl
fn getOmega(uniforms: SchroedingerUniforms, i: i32) -> f32
fn getQuantum(uniforms: SchroedingerUniforms, idx: i32) -> i32
fn getCoeff(uniforms: SchroedingerUniforms, k: i32) -> vec2f
fn getEnergy(uniforms: SchroedingerUniforms, k: i32) -> f32
```

### FreeScalarUniforms (Compute-Specific)
**File:** `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl.ts`

```wgsl
struct FreeScalarUniforms {
  latticeDim: u32,           // Dimension 1-11
  totalSites: u32,           // Total lattice points
  mass: f32,                 // Particle mass (m in dispersion)
  dt: f32,                   // Timestep

  // Per-dimension arrays (12 elements each, 16-byte padded)
  gridSize: array<u32, 12>,  // Lattice extent per dimension
  strides: array<u32, 12>,   // Row-major strides for linear indexing
  spacing: array<f32, 12>,   // Lattice spacing per dimension
  
  // Init/display
  initCondition: u32,        // 0=vacuumNoise, 1=singleMode, 2=gaussianPacket
  fieldView: u32,            // 0=phi, 1=pi, 2=energyDensity
  stepsPerFrame: u32,        // Leapfrog substeps per frame
  packetWidth: f32,          // Gaussian σ
  packetAmplitude: f32,      // Initial A
  maxFieldValue: f32,        // Normalization max
  boundingRadius: f32,       // Bounding sphere
  analysisMode: u32,         // 0=off, 1=hamiltonian, 2=flux, 3=kSpace

  // Per-dim init arrays
  packetCenter: array<f32, 12>,  // Gaussian center
  modeK: array<i32, 12>,         // Wave vector indices
  slicePositions: array<f32, 12>, // Slice offsets for d>=3

  // N-D -> 3D basis projection
  basisX: array<f32, 12>,    // Basis vector X components
  basisY: array<f32, 12>,    // Basis vector Y components
  basisZ: array<f32, 12>,    // Basis vector Z components
}
```

**Total:** 480 bytes (all 16-byte aligned).

---

## 4. Bind Group Organization

### Standard Raymarching (Fragment Shader)
```wgsl
@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> lighting: LightingUniforms;
@group(2) @binding(0) var<uniform> material: MaterialUniforms;
// (Object-specific uniforms go in group 2 or 3)
```

### Density Grid Compute Shader
```wgsl
@group(0) @binding(0) var<uniform> schroedinger: SchroedingerUniforms;
@group(0) @binding(1) var<uniform> basis: BasisVectors;  // (not seen yet)
@group(0) @binding(2) var<uniform> gridParams: GridParams;
@group(0) @binding(3) var densityGrid: texture_storage_3d<rgba16float, write>;
```

### Free Scalar Update Passes
```wgsl
@group(0) @binding(0) var<uniform> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read_write> phi: array<f32>;   // or read
@group(0) @binding(2) var<storage, read_write> pi: array<f32>;    // or read
@group(0) @binding(3) var outputTex: texture_storage_3d<rgba16float, write>; // write only
@group(0) @binding(4) var analysisTex: texture_storage_3d<rgba16float, write>; // write only
```

**Pattern:**
- Compute shaders use **Group 0 only** (max 8 bindings per group, 4 groups total in WebGPU)
- Multiple buffers fit naturally: uniforms + storage buffers + textures
- Free scalar uses **5 bindings** in group 0:
  1. Uniform params
  2. Phi storage (input)
  3. Pi storage (input/output)
  4. Density output texture
  5. Analysis texture

**For TDSE:** Will need similar layout; psi wavefunction can be storage buffer like phi/pi.

---

## 5. Workgroup Sizing & Dispatch

### Free Scalar Field Updates
```wgsl
@compute @workgroup_size(64)  // 1D dispatch
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }
  
  let coords = linearToND(idx, params.gridSize, params.latticeDim);
  // ... update phi[idx] or pi[idx]
}
```

**Pattern:**
- Linear 1D workgroup (64 threads per workgroup)
- Dispatch: `(totalSites + 63) / 64` workgroups
- Thread index = `gid.x`

### Density Grid Compute
```wgsl
@compute @workgroup_size(8, 8, 8)  // 3D dispatch
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid >= gridParams.gridSize)) { return; }
  
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);
  let densityResult = sampleDensityWithPhaseComponents(worldPos, t, schroedinger);
  textureStore(densityGrid, gid, vec4f(densityResult));
}
```

**Pattern:**
- 3D workgroup `(8,8,8) = 512 threads`
- Dispatch: `(gridSize.x/8, gridSize.y/8, gridSize.z/8)` workgroups
- For 64³ grid: 8×8×8 = 512 workgroups

---

## 6. Grid Texture Contract (Emission Shader)

### Output Texture Format
From `freeScalarWriteGrid.wgsl.ts`:
```wgsl
// R: |value| (magnitude / density) — normalized 0-1
// G: log(|value| + epsilon) — log-density for rendering
// B: phase encoding (0.0 = positive, π = negative) — wavefunction phase
// A: unused (reserved)

let rho = abs(fieldValue);
let normRho = select(rho / params.maxFieldValue, rho, params.maxFieldValue <= 0.0);
let logRho = log(normRho + 1e-10);
let phase = select(0.0, 3.14159265, fieldValue < 0.0);  // Simple sign encoding

textureStore(outputTex, gid, vec4f(normRho, logRho, phase, 0.0));
```

### Emission Shader Reading (volume/emission.wgsl.ts)
The fragment shader uses pre-sampled density:
```wgsl
// Precomputed from grid or analytic wavefunction
let s = log(rho + 1e-10);  // log-density
let phase = ... ;           // wavefunction phase

// Normalize for color mapping
let normalized = clamp((s + 8.0) / 8.0, 0.0, 1.0);
```

**Key insight:** Log-density `s` is mapped `[−8, 0] → [0, 1]` for color algorithms.

---

## 7. Composition Pattern for TDSE (Planned)

### Expected Structure (Analogous to Free Scalar)

**Compose file** (e.g., `composeTDSEComputeShader.ts`):
```typescript
export interface TDSEComputeConfig {
  dimension: number           // 3-11
  quantumMode: ComputeQuantumMode  // 'tdse' for new mode
  storageFormat?: 'rgba32float' | 'rgba16float'
}

export function composeTDSEComputeShader(config: TDSEComputeConfig) {
  const blocks = [
    { name: 'Defines', content: defines.join('\n') },
    { name: 'Constants', content: constantsBlock },
    
    // TDSE-specific uniforms (psi, momentum grid params, etc.)
    { name: 'TDSE Uniforms', content: tdseUniformsBlock },
    
    // Compute bindings (psi storage buffer, FFT temp, etc.)
    { name: 'TDSE Compute Bindings', content: generateTDSEBindingsBlock() },
    
    // FFT/linear-algebra modules
    { name: 'FFT 1D', content: fft1dBlock, condition: usesFFT },
    
    // Quantum math (same HO/hydrogen blocks as rendering)
    { name: 'Complex Math', content: complexMathBlock },
    { name: 'Hermite', content: hermiteBlock },
    // ... dimension-specific blocks
    
    // TDSE solver stages (split-operator, etc.)
    { name: 'TDSE Kinetic Half-Step', content: kineticHalfStepBlock },
    { name: 'TDSE Potential Full-Step', content: potentialFullStepBlock },
    
    // Main entry point
    { name: 'TDSE Compute Main', content: tdseMainBlock },
  ]
  
  const { wgsl, modules } = assembleShaderBlocks(blocks)
  return { wgsl, modules, features: [...] }
}
```

### TDSE Uniforms (Planned)
```wgsl
struct TDSEUniforms {
  // Wavefunction config
  quantumMode: i32,           // Selection of HO / hydrogen / etc.
  dimension: i32,
  totalSites: u32,           // N_x * N_y * ... for D-dim lattice
  dt: f32,                   // Timestep (real time: 0.01, imag time: 0.001)
  
  // Lattice parameters (per-dimension, 12 max)
  gridSize: array<u32, 12>,
  strides: array<u32, 12>,
  spacing: array<f32, 12>,
  
  // Potential parameters (HO frequencies, hydrogen quantum numbers, etc.)
  omega: array<vec4f, 3>,    // HO frequencies (same as Schroedinger)
  quantum: array<vec4<i32>, 22>, // Quantum numbers
  
  // Potential evaluation
  potentialMode: i32,        // 0=HO, 1=Coulomb, 2=custom
  potentialStrength: f32,    // V_0 scaling
  
  // FFT-related (if using Fourier solver)
  kGridSize: array<u32, 12>, // Momentum-space grid (may differ from position)
  fftMode: u32,              // Cooley-Tukey, Bluestein, etc.
  
  // Solver config
  solverType: u32,           // 0=splitOp, 1=RK4, 2=CN, etc.
  numFFTStages: u32,         // For FFT radix scheduling
  numAbsorberLayers: u32,    // Boundary absorbers
  
  // Physical
  mass: f32,                 // Particle mass (default 1.0)
  imaginaryTime: u32,        // 1 = use imaginary time, 0 = real time
  
  // Diagnostic flags
  recordDensity: u32,        // Write to density grid per step
  recordAnalysis: u32,       // Compute energy observables
}
```

---

## 8. Timeline Controls Structure

### Files in `src/components/layout/TimelineControls/`

1. **TimelineControls.tsx** — Main UI container, wraps drawer
2. **SchroedingerAnimationDrawer.tsx** — Animation controls for Schroedinger mode
   - Time evolution (timeScale)
   - Interference fringing (amplitude, frequency, speed)
   - Probability flow (speed, strength)
   - Probability current (style, placement, color mode)
3. **AnimationSystemPanel.tsx** — Generic reusable panel for registry-based systems
4. **AnimationDrawerContainer.tsx** — Drawer wrapper with collapse/expand
5. **index.ts** — Exports

### SchroedingerAnimationDrawer Pattern
```typescript
// Uses useShallow for multi-value selectors
const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
  config: state.schroedinger,
  setTimeScale: state.setSchroedingerTimeScale,
  setInterferenceEnabled: state.setSchroedingerInterferenceEnabled,
  // ... many setters
}))

// Renders via AnimationSystemPanel or direct sliders
<Slider
  label="Time Speed"
  min={0.1}
  max={2.0}
  step={0.05}
  value={config.timeScale}
  onChange={setTimeScale}
  showValue
/>
```

### Integration Points (for TDSE)
- `SchroedingerControls` in `src/components/sections/Geometry/SchroedingerControls/` — Mode selection, quantum numbers
- `extendedObjectStore` — State management for Schroedinger config
- Animation drawer — Real-time animation params (timestep, solver settings)

---

## 9. Key Patterns for TDSE Implementation

### 1. Uniform Struct Pattern
- Use **array<vec4f, N>** and **array<vec4i, N>** for multi-element data (16-byte alignment)
- Provide helper functions in WGSL to extract individual elements
- Keep scalars in groups of 4 (pad to 16-byte boundary)

### 2. Storage Buffer Pattern
- Use **@group(0) @binding(N) var<storage, read_write> data: array<T>**
- 1D linear indexing with stride table for N-D lattices
- Periodic boundary conditions via modular arithmetic

### 3. Compute Shader Entry Point Pattern
- Check bounds early: `if (idx >= limit) { return; }`
- Convert to N-D coords via `linearToND()` or direct formula
- Process each site independently (lock-free, no shared memory conflicts)

### 4. Composition Pattern
- Each `.wgsl.ts` file exports a block (function, struct, or constants)
- Dependency order matters: uniforms → helpers → main logic
- Use `condition` field to conditionally include blocks (e.g., only if `usesFFT`)

### 5. Timestep Storage & Integration
- Store current timestep in uniforms: `dt: f32`
- For leapfrog: two passes (pi-update, then phi-update)
- For RK4: four intermediate stages (each a separate compute pass or single pass with loop)
- For split-operator: alternate kinetic (FFT-based) and potential (direct) steps

---

## 10. Critical TDSE-Specific Decisions

### FFT Integration
- **Option A:** Inline FFT in single compute shader (complex, but single pass)
- **Option B:** Separate FFT compute passes (Cooley-Tukey or Bluestein, multiple dispatch)
- **Current Project:** Free scalar uses direct Laplacian (no FFT) — implies spectral TDSE will need FFT

### Solver Architecture
- **Spectral (momentum-space):** FFT to k-space, apply kinetic operator, FFT back
- **Split-operator Strang:** 
  - Half kinetic (position or momentum space)
  - Full potential (position space)
  - Half kinetic
- **RK4:** Four stages of psi evaluation per timestep

### Absorbing Boundary Conditions
- Imaginary damping layers (e.g., `psi *= exp(-absorberCoeff * |r|)`)
- Perfectly matched layer (PML) — complex spatial coordinates
- For compute: add damping after each update stage

### Density vs Full Wavefunction Storage
- Store: `array<vec2f, totalSites>` for complex psi (or split re/im arrays)
- Density grid: 3D texture for raymarching (computed from psi on-demand or periodically)
- Analysis: Store energy observables (E_kin, E_pot, <r>, etc.) separately

---

## 11. Reference File Locations

**Shader modules:**
- `/src/rendering/webgpu/shaders/schroedinger/` — All Schroedinger shaders
- `/src/rendering/webgpu/shaders/schroedinger/compute/` — Compute-specific
- `/src/rendering/webgpu/shaders/shared/` — Reusable blocks

**Type definitions:**
- `/src/rendering/webgpu/shaders/types.ts` — ColorAlgorithm, WGSLShaderConfig
- `/src/lib/geometry/extended/types.ts` — Schroedinger config types

**Composition logic:**
- `/src/rendering/webgpu/shaders/shared/compose-helpers.ts` — assembleShaderBlocks()
- `/src/rendering/webgpu/shaders/schroedinger/compute/compose.ts` — Density grid example

**Animation/UI:**
- `/src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx` — Animation panel
- `/src/stores/extendedObjectStore.ts` — State management for Schroedinger config

**Physics:**
- `/src/lib/physics/freeScalar/vacuumSpectrum.ts` — Spectrum sampling for free scalar
- `/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` — Renderer impl

---

## Summary for TDSE Planning

1. **Shader composition** is straightforward: blocks, optional conditions, linear assembly.
2. **Uniforms** pack scalars into vec4 for alignment; use helper functions in WGSL.
3. **Compute shaders** use group 0 exclusively; up to 8 bindings per group.
4. **Workgroup sizing** depends on problem: 1D (64 threads) for lattice updates, 3D (8³) for texture fills.
5. **Grid textures** encode density (R), log-density (G), phase (B); read in emission shaders.
6. **N-D lattices** use stride tables and linearToND / ndToLinear helpers.
7. **Timeline controls** hook into extendedObjectStore; new TDSE controls slot in SchroedingerAnimationDrawer.
8. **Storage buffers** (psi, rho_grid) are stateful; updated in-place each frame via compute passes.
9. **FFT integration** is the open question (inline vs. separate passes); recommend prototyping separate 1D FFT pass first.
10. **Timestep control** lives in uniforms (dt); solver type selected at compile time or via dispatch function.
