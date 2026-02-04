# WebGPU Migration Plan: Full Feature Parity

**Created**: 2026-01-24
**Status**: Planning
**Goal**: Achieve 1:1 feature parity between WebGL and WebGPU rendering backends

---

## Executive Summary

This document details the complete work required to port all WebGL features to WebGPU. The migration is organized into 4 phases:

1. **Phase 1**: Core Rendering Shaders (SDF dimensions, quantum system, black hole modules)
2. **Phase 2**: Environment System (skybox, ground plane, environment components)
3. **Phase 3**: Integration Layer (render graph wiring, switching mechanism, stores)
4. **Phase 4**: Quality Assurance (testing, visual parity, performance)

**Estimated Scope**: ~80+ WGSL shader files, integration code, and tests

---

## Current State Assessment

### What's Complete
- [x] All 6 object renderers (WebGPUMandelbulbRenderer, WebGPUQuaternionJuliaRenderer, WebGPUSchrodingerRenderer, WebGPUBlackHoleRenderer, WebGPUPolytopeRenderer, WebGPUTubeWireframeRenderer)
- [x] All 32 render graph passes have WebGPU class implementations
- [x] Core infrastructure (WebGPUDevice, WebGPUBasePass, WebGPURenderGraph, WebGPUResourcePool)
- [x] Basic shared shaders (lighting: ggx, ibl, multi-light, sss; color: oklab, hsl, cosine-palette, selector; features: ao, shadows, temporal; raymarch: core, normal)
- [x] Julia SDF shaders (sdf3d through sdf11d)
- [x] Basic postprocessing shaders (bloom, fxaa, smaa, ssr, tonemapping, environment-composite)

### What's Missing
- [ ] Mandelbulb higher-dimension SDFs (sdf5d-sdf11d)
- [ ] Entire Schrödinger quantum shader system
- [ ] BlackHole gravity/effects modules
- [ ] Skybox procedural shader system
- [ ] Ground plane shaders
- [ ] Shared utility gaps (safe-math, sphere-intersect, shadowMaps, etc.)
- [ ] App integration (switching, stores, fallback)
- [ ] Testing infrastructure

---

## Phase 1: Core Rendering Shaders

**Priority**: CRITICAL
**Dependency**: None
**Estimated Files**: ~45 WGSL files

### 1.1 Mandelbulb SDF Dimensions

**Location**: `src/rendering/webgpu/shaders/mandelbulb/sdf/`

| File | Source Reference | Description |
|------|------------------|-------------|
| `sdf5d.wgsl.ts` | `src/rendering/shaders/mandelbulb/sdf/sdf5d.glsl.ts` | 5D Mandelbulb SDF |
| `sdf6d.wgsl.ts` | `src/rendering/shaders/mandelbulb/sdf/sdf6d.glsl.ts` | 6D Mandelbulb SDF |
| `sdf7d.wgsl.ts` | `src/rendering/shaders/mandelbulb/sdf/sdf7d.glsl.ts` | 7D Mandelbulb SDF |
| `sdf8d.wgsl.ts` | `src/rendering/shaders/mandelbulb/sdf/sdf8d.glsl.ts` | 8D Mandelbulb SDF |
| `sdf9d.wgsl.ts` | `src/rendering/shaders/mandelbulb/sdf/sdf9d.glsl.ts` | 9D Mandelbulb SDF |
| `sdf10d.wgsl.ts` | `src/rendering/shaders/mandelbulb/sdf/sdf10d.glsl.ts` | 10D Mandelbulb SDF |
| `sdf11d.wgsl.ts` | `src/rendering/shaders/mandelbulb/sdf/sdf11d.glsl.ts` | 11D Mandelbulb SDF |
| `sdf-high-d.wgsl.ts` | `src/rendering/shaders/mandelbulb/sdf/sdf-high-d.glsl.ts` | Generic high-D fallback |
| `dispatch.wgsl.ts` | `src/rendering/shaders/mandelbulb/dispatch.glsl.ts` | Dimension dispatch logic |

**Tasks**:
- [ ] Port each SDF file from GLSL ES 3.00 to WGSL
- [ ] Update `src/rendering/webgpu/shaders/mandelbulb/index.ts` to export all SDFs
- [ ] Update `compose.ts` to select correct SDF by dimension
- [ ] Test each dimension renders correctly

**GLSL → WGSL Conversion Notes**:
- Replace `in`/`out` with WGSL function parameters
- Replace `vec3` with `vec3<f32>`, etc.
- Replace `pow()` with WGSL `pow()`
- Replace `mod()` with WGSL `fract()` or `%` operator
- Handle array syntax differences

---

### 1.2 Schrödinger Quantum System

**Location**: `src/rendering/webgpu/shaders/schroedinger/`

This is the largest gap. The quantum visualization system requires:

#### 1.2.1 Quantum Functions (`quantum/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `complex.wgsl.ts` | `quantum/complex.glsl.ts` | Complex number operations |
| `density.wgsl.ts` | `quantum/density.glsl.ts` | Probability density calculation |
| `hermite.wgsl.ts` | `quantum/hermite.glsl.ts` | Hermite polynomials |
| `ho1d.wgsl.ts` | `quantum/ho1d.glsl.ts` | 1D harmonic oscillator |
| `hoNDVariants.wgsl.ts` | `quantum/hoNDVariants.glsl.ts` | N-D harmonic oscillator variants |
| `hoSuperpositionVariants.wgsl.ts` | `quantum/hoSuperpositionVariants.glsl.ts` | Superposition states |
| `hydrogenPsi.wgsl.ts` | `quantum/hydrogenPsi.glsl.ts` | Hydrogen wavefunction |
| `hydrogenRadial.wgsl.ts` | `quantum/hydrogenRadial.glsl.ts` | Radial component |
| `hydrogenNDVariants.wgsl.ts` | `quantum/hydrogenNDVariants.glsl.ts` | N-D hydrogen variants |
| `laguerre.wgsl.ts` | `quantum/laguerre.glsl.ts` | Laguerre polynomials |
| `legendre.wgsl.ts` | `quantum/legendre.glsl.ts` | Legendre polynomials |
| `psi.wgsl.ts` | `quantum/psi.glsl.ts` | Main wavefunction calculation |
| `sphericalHarmonics.wgsl.ts` | `quantum/sphericalHarmonics.glsl.ts` | Spherical harmonics Y_l^m |
| `index.ts` | `quantum/index.ts` | Module exports |

**Subdirectory**: `quantum/hydrogenND/`

| File | Source Reference | Description |
|------|------------------|-------------|
| `hydrogenNDCommon.wgsl.ts` | `quantum/hydrogenND/hydrogenNDCommon.glsl.ts` | Common N-D hydrogen functions |
| `index.ts` | `quantum/hydrogenND/index.ts` | Module exports |

**Tasks**:
- [ ] Port complex number math (careful with WGSL complex handling)
- [ ] Port all polynomial functions (Hermite, Laguerre, Legendre)
- [ ] Port spherical harmonics with proper normalization
- [ ] Port harmonic oscillator variants
- [ ] Port hydrogen orbital calculations
- [ ] Create index.ts exports

**Critical Math Notes**:
- WGSL has no native complex type - use `vec2<f32>` with helper functions
- Factorial/combinatorial functions need careful implementation
- Special functions (associated Legendre, spherical harmonics) are compute-intensive

#### 1.2.2 Volume Rendering (`volume/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `absorption.wgsl.ts` | `volume/absorption.glsl.ts` | Light absorption in volume |
| `emission.wgsl.ts` | `volume/emission.glsl.ts` | Volume emission (glow) |
| `integration.wgsl.ts` | `volume/integration.glsl.ts` | Ray marching integration |
| `index.ts` | `volume/index.ts` | Module exports |

**Tasks**:
- [ ] Port absorption model
- [ ] Port emission with color mapping
- [ ] Port volume integration loop
- [ ] Ensure correct alpha blending

#### 1.2.3 Temporal System (`temporal/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `reconstruction.wgsl.ts` | `temporal/reconstruction.glsl.ts` | Frame reconstruction |
| `reprojection.wgsl.ts` | `temporal/reprojection.glsl.ts` | Motion vector reprojection |
| `uniforms.wgsl.ts` | `temporal/uniforms.glsl.ts` | Temporal-specific uniforms |
| `index.ts` | `temporal/index.ts` | Module exports |

**Tasks**:
- [ ] Port reprojection matrix math
- [ ] Port reconstruction with velocity rejection
- [ ] Define temporal uniform buffer layout

#### 1.2.4 SDF Files (`sdf/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `sdf3d.wgsl.ts` | `sdf/sdf3d.glsl.ts` | 3D wavefunction SDF |
| `sdf4d.wgsl.ts` | `sdf/sdf4d.glsl.ts` | 4D wavefunction SDF |
| `sdf5d.wgsl.ts` | `sdf/sdf5d.glsl.ts` | 5D wavefunction SDF |
| `sdf6d.wgsl.ts` | `sdf/sdf6d.glsl.ts` | 6D wavefunction SDF |
| `sdf7d.wgsl.ts` | `sdf/sdf7d.glsl.ts` | 7D wavefunction SDF |
| `sdf8d.wgsl.ts` | `sdf/sdf8d.glsl.ts` | 8D wavefunction SDF |
| `sdf9d.wgsl.ts` | `sdf/sdf9d.glsl.ts` | 9D wavefunction SDF |
| `sdf10d.wgsl.ts` | `sdf/sdf10d.glsl.ts` | 10D wavefunction SDF |
| `sdf11d.wgsl.ts` | `sdf/sdf11d.glsl.ts` | 11D wavefunction SDF |
| `sdf-high-d.wgsl.ts` | `sdf/sdf-high-d.glsl.ts` | Generic high-D fallback |

#### 1.2.5 Root Files

| File | Source Reference | Description |
|------|------------------|-------------|
| `dispatch.wgsl.ts` | `dispatch.glsl.ts` | Dimension/mode dispatch |
| `power.wgsl.ts` | `power.glsl.ts` | Power/iteration functions |

**Tasks**:
- [ ] Port all SDF files (10 files)
- [ ] Port dispatch logic
- [ ] Update compose.ts for full feature composition
- [ ] Update index.ts exports

---

### 1.3 BlackHole Missing Modules

**Location**: `src/rendering/webgpu/shaders/blackhole/`

#### 1.3.1 Gravity Modules

| File | Source Reference | Description |
|------|------------------|-------------|
| `colors.wgsl.ts` | `gravity/colors.glsl.ts` | Accretion disk coloring, blackbody |
| `manifold.wgsl.ts` | `gravity/manifold.glsl.ts` | Manifold type rendering |
| `disk-volumetric.wgsl.ts` | `gravity/disk-volumetric.glsl.ts` | Volumetric disk rendering |

**Tasks**:
- [ ] Port blackbody radiation color functions
- [ ] Port manifold intersection logic
- [ ] Port volumetric disk raymarching

#### 1.3.2 Effects Modules

| File | Source Reference | Description |
|------|------------------|-------------|
| `motion-blur.wgsl.ts` | `effects/motion-blur.glsl.ts` | Motion blur post-effect |
| `deferred-lensing.wgsl.ts` | `effects/deferred-lensing.glsl.ts` | Deferred lensing pass |

**Tasks**:
- [ ] Port motion blur sampling
- [ ] Port deferred lensing with chromatic aberration

#### 1.3.3 Update Composition

- [ ] Update `compose.ts` to include new modules
- [ ] Update `index.ts` exports
- [ ] Ensure `WebGPUBlackHoleRenderer.ts` uses all features

---

### 1.4 Shared Shader Gaps

**Location**: `src/rendering/webgpu/shaders/shared/`

#### 1.4.1 Math Utilities (`math/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `safe-math.wgsl.ts` | `math/safe-math.glsl.ts` | Division guards, NaN prevention |

**Tasks**:
- [ ] Create `math/` subdirectory
- [ ] Port safe division, safe normalize, NaN guards
- [ ] WGSL-specific: handle `isnan()`, `isinf()` differences

#### 1.4.2 Raymarch Utilities (`raymarch/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `sphere-intersect.wgsl.ts` | `raymarch/sphere-intersect.glsl.ts` | Ray-sphere intersection |

**Tasks**:
- [ ] Port sphere intersection with near/far returns

#### 1.4.3 Features (`features/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `shadowMaps.wgsl.ts` | `features/shadowMaps.glsl.ts` | Shadow map sampling |

**Tasks**:
- [ ] Port shadow map sampling with PCF
- [ ] Handle WebGPU texture sampling differences

#### 1.4.4 Color (`color/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `selectorVariants.wgsl.ts` | `color/selectorVariants.glsl.ts` | Extended color algorithm variants |

**Tasks**:
- [ ] Port additional color algorithm implementations

#### 1.4.5 Depth (`depth/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `customDepth.wgsl.ts` | `depth/customDepth.glsl.ts` | Custom depth encoding/decoding |

**Tasks**:
- [ ] Create `depth/` subdirectory
- [ ] Port depth linearization functions

#### 1.4.6 Fractal (`fractal/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `main.wgsl.ts` | `fractal/main.glsl.ts` | Shared fractal rendering main |

**Tasks**:
- [ ] Create `fractal/` subdirectory (compose-helpers.ts exists)
- [ ] Port shared fractal main shader

---

## Phase 2: Environment System

**Priority**: HIGH
**Dependency**: Phase 1 (shared shaders)
**Estimated Files**: ~25 WGSL files + React components

### 2.1 Skybox Procedural Shaders

**Location**: `src/rendering/webgpu/shaders/skybox/`

#### 2.1.1 Core (`core/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `constants.wgsl.ts` | `core/constants.glsl.ts` | Skybox constants |
| `uniforms.wgsl.ts` | `core/uniforms.glsl.ts` | Skybox uniform definitions |
| `varyings.wgsl.ts` | `core/varyings.glsl.ts` | Inter-stage varyings |

**Note**: WGSL doesn't have `precision` - handled differently

**Tasks**:
- [ ] Create `core/` subdirectory
- [ ] Port constants
- [ ] Define uniform buffer layout
- [ ] Define vertex output / fragment input structs

#### 2.1.2 Utils (`utils/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `color.wgsl.ts` | `utils/color.glsl.ts` | Color space conversions |
| `rotation.wgsl.ts` | `utils/rotation.glsl.ts` | Rotation matrices |
| `noise.wgsl.ts` | `utils/noise.glsl.ts` | Procedural noise (simplex, fbm) |

**Tasks**:
- [ ] Create `utils/` subdirectory
- [ ] Port color utilities
- [ ] Port rotation matrices
- [ ] Port noise functions (critical for procedural modes)

**Noise Implementation Notes**:
- Simplex noise requires careful WGSL porting
- Consider compute shader pre-generation for complex noise

#### 2.1.3 Modes (`modes/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `aurora.wgsl.ts` | `modes/aurora.glsl.ts` | Aurora borealis effect |
| `nebula.wgsl.ts` | `modes/nebula.glsl.ts` | Space nebula |
| `crystalline.wgsl.ts` | `modes/crystalline.glsl.ts` | Crystal/geometric patterns |
| `horizon.wgsl.ts` | `modes/horizon.glsl.ts` | Horizon gradient |
| `ocean.wgsl.ts` | `modes/ocean.glsl.ts` | Ocean/water reflection |
| `twilight.wgsl.ts` | `modes/twilight.glsl.ts` | Sunset/twilight colors |
| `classic.wgsl.ts` | `modes/classic.glsl.ts` | Classic texture-based |

**Tasks**:
- [ ] Create `modes/` subdirectory
- [ ] Port each procedural mode
- [ ] Ensure noise dependency works correctly

#### 2.1.4 Effects (`effects/`)

| File | Source Reference | Description |
|------|------------------|-------------|
| `vignette.wgsl.ts` | `effects/vignette.glsl.ts` | Edge darkening |
| `sun.wgsl.ts` | `effects/sun.glsl.ts` | Sun/star rendering |

**Tasks**:
- [ ] Create `effects/` subdirectory
- [ ] Port vignette effect
- [ ] Port sun rendering with lens flare

#### 2.1.5 Root Files

| File | Source Reference | Description |
|------|------------------|-------------|
| `main.wgsl.ts` | `main.glsl.ts` | Main skybox shader |
| `compose.ts` | `compose.ts` | Shader composition |
| `types.ts` | `types.ts` | TypeScript types |
| `index.ts` | - | Module exports |

**Tasks**:
- [ ] Port main shader with mode switching
- [ ] Create compose.ts for WGSL composition
- [ ] Copy/adapt types.ts
- [ ] Create index.ts exports

---

### 2.2 Ground Plane Shaders

**Location**: `src/rendering/webgpu/shaders/groundplane/`

| File | Source Reference | Description |
|------|------------------|-------------|
| `vertex.wgsl.ts` | `vertex.glsl.ts` | Vertex transformation |
| `main.wgsl.ts` | `main.glsl.ts` | Fragment shader (surface, grid) |
| `grid.wgsl.ts` | `grid.glsl.ts` | Grid pattern generation |
| `compose.ts` | `compose.ts` | Shader composition |
| `index.ts` | - | Module exports |

**Tasks**:
- [ ] Create `groundplane/` directory
- [ ] Port vertex shader (handle infinite plane)
- [ ] Port grid pattern with anti-aliasing
- [ ] Port main fragment shader
- [ ] Create composition logic
- [ ] Create index exports

---

### 2.3 Environment Component Abstraction

**Goal**: Create unified abstraction layer for environment rendering that works with both WebGL and WebGPU.

#### 2.3.1 Analysis Required

Review current WebGL components:
- `src/rendering/environment/GroundPlane.tsx`
- `src/rendering/environment/GroundPlaneMaterial.tsx`
- `src/rendering/environment/ProceduralSkyboxWithEnvironment.tsx`
- `src/rendering/environment/Skybox.tsx`
- `src/rendering/environment/SceneLighting.tsx`

**Tasks**:
- [ ] Document current component interfaces
- [ ] Design abstraction layer (interface-based)
- [ ] Option A: Separate WebGPU environment components
- [ ] Option B: Unified components with renderer switching

#### 2.3.2 WebGPU Environment Passes

May need dedicated passes:
- [ ] `SkyboxPass.ts` - WebGPU skybox rendering
- [ ] `GroundPlanePass.ts` - WebGPU ground plane rendering
- [ ] Update `EnvironmentCompositePass.ts` for new inputs

---

## Phase 3: Integration Layer

**Priority**: HIGH
**Dependency**: Phases 1-2
**Estimated Files**: ~15-20 TypeScript files

### 3.1 Renderer Store

**Location**: `src/stores/rendererStore.ts` (new file)

**State Schema**:
```typescript
interface RendererState {
  // Selection
  rendererType: 'webgl' | 'webgpu' | 'auto'
  activeRenderer: 'webgl' | 'webgpu'

  // Capabilities
  webgpuSupported: boolean
  webgpuCapabilities: WebGPUCapabilities | null

  // Status
  isInitializing: boolean
  initializationError: string | null

  // Fallback
  fallbackReason: string | null

  // Actions
  setRendererType: (type: 'webgl' | 'webgpu' | 'auto') => void
  initialize: () => Promise<void>
  reset: () => void
}
```

**Tasks**:
- [ ] Create `rendererStore.ts`
- [ ] Implement capability detection
- [ ] Implement auto-selection logic
- [ ] Persist preference to localStorage
- [ ] Handle fallback scenarios

---

### 3.2 Render Graph Wiring

**Current**: `WebGPURenderGraph.ts` exists but is isolated

#### 3.2.1 Graph Controller

**Location**: `src/rendering/webgpu/graph/WebGPUGraphController.ts` (new)

**Responsibilities**:
- Initialize render graph with all passes
- Wire uniforms from stores
- Handle resize events
- Manage pass enable/disable based on settings

**Tasks**:
- [ ] Create graph controller
- [ ] Wire postProcessingStore settings to passes
- [ ] Wire performanceStore quality settings
- [ ] Wire environmentStore to skybox/ground passes
- [ ] Wire lightingStore to lighting passes
- [ ] Handle dynamic pass enable/disable

#### 3.2.2 Uniform Synchronization

**Tasks**:
- [ ] Create uniform buffer update system
- [ ] Map Zustand store changes to GPU buffer updates
- [ ] Handle per-frame vs per-resize updates
- [ ] Batch uniform updates efficiently

---

### 3.3 Scene Integration

**Location**: `src/rendering/Scene.tsx` or new `src/rendering/WebGPUScene.tsx`

#### 3.3.1 Approach Options

**Option A**: Dual Scene Components
- Keep `Scene.tsx` for WebGL
- Create `WebGPUScene.tsx` for WebGPU
- Parent component switches based on rendererStore

**Option B**: Unified Scene with Abstraction
- Modify `Scene.tsx` to use renderer abstraction
- More complex but cleaner long-term

**Recommended**: Option A for initial implementation

**Tasks**:
- [ ] Create `WebGPUScene.tsx`
- [ ] Create `SceneSwitch.tsx` wrapper component
- [ ] Handle canvas context switching
- [ ] Ensure state synchronization between modes

#### 3.3.2 Object Renderer Integration

**Tasks**:
- [ ] Wire `WebGPUMandelbulbRenderer` to mandelbulbSlice
- [ ] Wire `WebGPUQuaternionJuliaRenderer` to quaternionJuliaSlice
- [ ] Wire `WebGPUSchrodingerRenderer` to schroedingerSlice
- [ ] Wire `WebGPUBlackHoleRenderer` to blackholeSlice
- [ ] Wire `WebGPUPolytopeRenderer` to polytopeSlice
- [ ] Wire `WebGPUTubeWireframeRenderer` to material settings

---

### 3.4 Fallback Mechanism

**Scenarios**:
1. WebGPU not supported → Use WebGL
2. WebGPU device lost → Attempt recovery, then fallback
3. WebGPU feature missing → Partial fallback or warning

**Tasks**:
- [ ] Implement `isWebGPUSupported()` check at app start
- [ ] Handle device lost event with recovery attempt
- [ ] Implement graceful fallback to WebGL
- [ ] Show user notification on fallback
- [ ] Log telemetry for fallback reasons

---

### 3.5 UI Integration

#### 3.5.1 Settings Panel

**Location**: `src/components/sections/Settings/SettingsSection.tsx`

**Tasks**:
- [ ] Add "Renderer" toggle (WebGL / WebGPU / Auto)
- [ ] Show current active renderer
- [ ] Show capability information
- [ ] Disable WebGPU option if not supported

#### 3.5.2 Performance Monitor

**Location**: `src/components/canvas/PerformanceMonitor/`

**Tasks**:
- [ ] Add WebGPU-specific metrics
- [ ] Show GPU timestamp queries (if available)
- [ ] Show memory usage from WebGPU
- [ ] Differentiate metrics by renderer type

---

### 3.6 Export System Integration

**Location**: `src/lib/export/`

**Tasks**:
- [ ] Ensure video export works with WebGPU
- [ ] Ensure screenshot capture works with WebGPU
- [ ] Handle canvas readback differences

---

## Phase 4: Quality Assurance

**Priority**: CRITICAL (before release)
**Dependency**: Phases 1-3
**Estimated Files**: ~30+ test files

### 4.1 Unit Tests

**Location**: `src/tests/rendering/webgpu/`

#### 4.1.1 Shader Compilation Tests

| Test File | Description |
|-----------|-------------|
| `shaders/mandelbulb.test.ts` | All Mandelbulb WGSL compiles |
| `shaders/schroedinger.test.ts` | All Schrödinger WGSL compiles |
| `shaders/blackhole.test.ts` | All BlackHole WGSL compiles |
| `shaders/skybox.test.ts` | All Skybox WGSL compiles |
| `shaders/groundplane.test.ts` | All Ground WGSL compiles |
| `shaders/shared.test.ts` | All Shared WGSL compiles |
| `shaders/postprocessing.test.ts` | All PostProc WGSL compiles |

**Tasks**:
- [ ] Create WGSL compilation test harness
- [ ] Test each shader module compiles without errors
- [ ] Test shader composition produces valid WGSL

#### 4.1.2 Pass Tests

| Test File | Description |
|-----------|-------------|
| `passes/BloomPass.test.ts` | Bloom pass functionality |
| `passes/GTAOPass.test.ts` | GTAO pass functionality |
| `passes/SSRPass.test.ts` | SSR pass functionality |
| ... | (one per pass) |

**Tasks**:
- [ ] Create pass test template
- [ ] Test pass initialization
- [ ] Test pass execution (mock context)
- [ ] Test pass cleanup

#### 4.1.3 Core Tests

| Test File | Description |
|-----------|-------------|
| `core/WebGPUDevice.test.ts` | Device initialization |
| `core/WebGPUResourcePool.test.ts` | Resource management |
| `core/WebGPUUniformBuffer.test.ts` | Uniform buffer updates |

**Tasks**:
- [ ] Test device initialization
- [ ] Test resource allocation/deallocation
- [ ] Test uniform buffer updates

---

### 4.2 Integration Tests

**Location**: `scripts/playwright/webgpu/`

#### 4.2.1 Renderer Switching Tests

| Test File | Description |
|-----------|-------------|
| `renderer-switching.spec.ts` | WebGL ↔ WebGPU switching |
| `fallback.spec.ts` | Fallback behavior |

**Tasks**:
- [ ] Test switching from WebGL to WebGPU
- [ ] Test switching from WebGPU to WebGL
- [ ] Test auto-selection logic
- [ ] Test fallback on unsupported browser

#### 4.2.2 Feature Parity Tests

| Test File | Description |
|-----------|-------------|
| `mandelbulb-parity.spec.ts` | Mandelbulb WebGL vs WebGPU |
| `schroedinger-parity.spec.ts` | Schrödinger WebGL vs WebGPU |
| `blackhole-parity.spec.ts` | BlackHole WebGL vs WebGPU |
| `polytope-parity.spec.ts` | Polytope WebGL vs WebGPU |
| `postprocessing-parity.spec.ts` | Post-processing WebGL vs WebGPU |
| `skybox-parity.spec.ts` | Skybox WebGL vs WebGPU |

**Tasks**:
- [ ] Create visual comparison test harness
- [ ] Test each object type renders similarly
- [ ] Test each post-processing effect
- [ ] Test environment rendering

---

### 4.3 Visual Regression Tests

**Location**: `scripts/playwright/visual-regression/`

**Approach**:
1. Render scene with WebGL → save reference screenshot
2. Render same scene with WebGPU → compare
3. Allow configurable threshold for acceptable difference

**Tasks**:
- [ ] Set up visual regression framework
- [ ] Create reference screenshots for all object types
- [ ] Create reference screenshots for all post-processing combinations
- [ ] Define acceptable difference thresholds
- [ ] Integrate into CI pipeline

---

### 4.4 Performance Benchmarking

**Location**: `scripts/tools/benchmark/`

#### 4.4.1 Benchmark Suite

| Benchmark | Description |
|-----------|-------------|
| `fractal-raymarch.ts` | Fractal raymarching FPS |
| `postprocessing-chain.ts` | Full post-processing FPS |
| `high-dimension.ts` | 11D rendering performance |
| `memory-usage.ts` | GPU memory consumption |

**Tasks**:
- [ ] Create benchmark harness
- [ ] Benchmark each renderer type
- [ ] Compare WebGL vs WebGPU performance
- [ ] Document performance characteristics

#### 4.4.2 Metrics to Collect

- Frame time (ms)
- Frames per second
- GPU memory usage
- Shader compilation time
- Pass execution time (if timestamp queries available)

---

### 4.5 Browser Compatibility Testing

**Browsers to Test**:
- Chrome (primary WebGPU target)
- Edge (Chromium-based)
- Firefox (WebGPU behind flag)
- Safari (WebGPU in development)

**Tasks**:
- [ ] Test on Chrome stable
- [ ] Test on Chrome Canary
- [ ] Test on Edge
- [ ] Test on Firefox Nightly
- [ ] Test on Safari Technology Preview
- [ ] Document browser-specific issues

---

## Appendix A: GLSL to WGSL Conversion Guide

### Type Conversions

| GLSL | WGSL |
|------|------|
| `float` | `f32` |
| `int` | `i32` |
| `uint` | `u32` |
| `bool` | `bool` |
| `vec2` | `vec2<f32>` |
| `vec3` | `vec3<f32>` |
| `vec4` | `vec4<f32>` |
| `ivec2` | `vec2<i32>` |
| `mat3` | `mat3x3<f32>` |
| `mat4` | `mat4x4<f32>` |
| `sampler2D` | `texture_2d<f32>` + `sampler` |
| `samplerCube` | `texture_cube<f32>` + `sampler` |

### Function Conversions

| GLSL | WGSL |
|------|------|
| `texture2D(tex, uv)` | `textureSample(tex, samp, uv)` |
| `textureCube(tex, dir)` | `textureSample(tex, samp, dir)` |
| `mod(x, y)` | `x - y * floor(x / y)` or `x % y` (integers) |
| `fract(x)` | `fract(x)` |
| `mix(a, b, t)` | `mix(a, b, t)` |
| `clamp(x, a, b)` | `clamp(x, a, b)` |
| `dFdx(x)` | `dpdx(x)` |
| `dFdy(x)` | `dpdy(x)` |
| `gl_FragCoord` | `@builtin(position)` |
| `gl_VertexID` | `@builtin(vertex_index)` |

### Struct/Layout Differences

**GLSL**:
```glsl
layout(location = 0) out vec4 fragColor;
```

**WGSL**:
```wgsl
struct FragmentOutput {
  @location(0) color: vec4<f32>,
}
```

### Uniform Buffers

**GLSL**:
```glsl
uniform float uTime;
uniform vec3 uCameraPos;
```

**WGSL**:
```wgsl
struct Uniforms {
  time: f32,
  camera_pos: vec3<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
```

---

## Appendix B: File Checklist

### Phase 1 Files (45 files)

**Mandelbulb (9 files)**:
- [ ] `sdf5d.wgsl.ts`
- [ ] `sdf6d.wgsl.ts`
- [ ] `sdf7d.wgsl.ts`
- [ ] `sdf8d.wgsl.ts`
- [ ] `sdf9d.wgsl.ts`
- [ ] `sdf10d.wgsl.ts`
- [ ] `sdf11d.wgsl.ts`
- [ ] `sdf-high-d.wgsl.ts`
- [ ] `dispatch.wgsl.ts`

**Schrödinger Quantum (15 files)**:
- [ ] `quantum/complex.wgsl.ts`
- [ ] `quantum/density.wgsl.ts`
- [ ] `quantum/hermite.wgsl.ts`
- [ ] `quantum/ho1d.wgsl.ts`
- [ ] `quantum/hoNDVariants.wgsl.ts`
- [ ] `quantum/hoSuperpositionVariants.wgsl.ts`
- [ ] `quantum/hydrogenPsi.wgsl.ts`
- [ ] `quantum/hydrogenRadial.wgsl.ts`
- [ ] `quantum/hydrogenNDVariants.wgsl.ts`
- [ ] `quantum/laguerre.wgsl.ts`
- [ ] `quantum/legendre.wgsl.ts`
- [ ] `quantum/psi.wgsl.ts`
- [ ] `quantum/sphericalHarmonics.wgsl.ts`
- [ ] `quantum/hydrogenND/hydrogenNDCommon.wgsl.ts`
- [ ] `quantum/index.ts`

**Schrödinger Volume (4 files)**:
- [ ] `volume/absorption.wgsl.ts`
- [ ] `volume/emission.wgsl.ts`
- [ ] `volume/integration.wgsl.ts`
- [ ] `volume/index.ts`

**Schrödinger Temporal (4 files)**:
- [ ] `temporal/reconstruction.wgsl.ts`
- [ ] `temporal/reprojection.wgsl.ts`
- [ ] `temporal/uniforms.wgsl.ts`
- [ ] `temporal/index.ts`

**Schrödinger SDF (10 files)**:
- [ ] `sdf/sdf3d.wgsl.ts`
- [ ] `sdf/sdf4d.wgsl.ts`
- [ ] `sdf/sdf5d.wgsl.ts`
- [ ] `sdf/sdf6d.wgsl.ts`
- [ ] `sdf/sdf7d.wgsl.ts`
- [ ] `sdf/sdf8d.wgsl.ts`
- [ ] `sdf/sdf9d.wgsl.ts`
- [ ] `sdf/sdf10d.wgsl.ts`
- [ ] `sdf/sdf11d.wgsl.ts`
- [ ] `sdf/sdf-high-d.wgsl.ts`

**Schrödinger Root (2 files)**:
- [ ] `dispatch.wgsl.ts`
- [ ] `power.wgsl.ts`

**BlackHole (5 files)**:
- [ ] `colors.wgsl.ts`
- [ ] `manifold.wgsl.ts`
- [ ] `disk-volumetric.wgsl.ts`
- [ ] `motion-blur.wgsl.ts`
- [ ] `deferred-lensing.wgsl.ts`

**Shared (6 files)**:
- [ ] `math/safe-math.wgsl.ts`
- [ ] `raymarch/sphere-intersect.wgsl.ts`
- [ ] `features/shadowMaps.wgsl.ts`
- [ ] `color/selectorVariants.wgsl.ts`
- [ ] `depth/customDepth.wgsl.ts`
- [ ] `fractal/main.wgsl.ts`

### Phase 2 Files (25 files)

**Skybox Core (3 files)**:
- [ ] `core/constants.wgsl.ts`
- [ ] `core/uniforms.wgsl.ts`
- [ ] `core/varyings.wgsl.ts`

**Skybox Utils (3 files)**:
- [ ] `utils/color.wgsl.ts`
- [ ] `utils/rotation.wgsl.ts`
- [ ] `utils/noise.wgsl.ts`

**Skybox Modes (7 files)**:
- [ ] `modes/aurora.wgsl.ts`
- [ ] `modes/nebula.wgsl.ts`
- [ ] `modes/crystalline.wgsl.ts`
- [ ] `modes/horizon.wgsl.ts`
- [ ] `modes/ocean.wgsl.ts`
- [ ] `modes/twilight.wgsl.ts`
- [ ] `modes/classic.wgsl.ts`

**Skybox Effects (2 files)**:
- [ ] `effects/vignette.wgsl.ts`
- [ ] `effects/sun.wgsl.ts`

**Skybox Root (4 files)**:
- [ ] `main.wgsl.ts`
- [ ] `compose.ts`
- [ ] `types.ts`
- [ ] `index.ts`

**Ground Plane (5 files)**:
- [ ] `vertex.wgsl.ts`
- [ ] `main.wgsl.ts`
- [ ] `grid.wgsl.ts`
- [ ] `compose.ts`
- [ ] `index.ts`

### Phase 3 Files (15-20 files)

- [ ] `src/stores/rendererStore.ts`
- [ ] `src/rendering/webgpu/graph/WebGPUGraphController.ts`
- [ ] `src/rendering/WebGPUScene.tsx`
- [ ] `src/rendering/SceneSwitch.tsx`
- [ ] `src/rendering/webgpu/passes/SkyboxPass.ts`
- [ ] `src/rendering/webgpu/passes/GroundPlanePass.ts`
- [ ] Updates to SettingsSection.tsx
- [ ] Updates to PerformanceMonitor
- [ ] Updates to export system

### Phase 4 Files (30+ files)

- Unit tests (15+ files)
- Integration tests (6+ files)
- Visual regression tests (10+ files)
- Benchmark scripts (4+ files)

---

## Appendix C: Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| WGSL shader compilation differences | High | Medium | Thorough testing, validation layer |
| Performance regression | Medium | Low | Benchmarking before/after |
| Browser compatibility issues | High | Medium | Feature detection, graceful fallback |
| Visual parity issues | Medium | Medium | Visual regression testing |
| Memory management differences | Medium | Low | Resource pool monitoring |
| Uniform buffer alignment | Medium | High | Careful struct layout, validation |

---

## Appendix D: Useful Resources

- [WGSL Specification](https://www.w3.org/TR/WGSL/)
- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WebGPU Best Practices](https://developer.chrome.com/docs/web-platform/webgpu/)
- [GLSL to WGSL Migration Guide](https://google.github.io/tour-of-wgsl/)
- [Three.js WebGPU Branch](https://github.com/mrdoob/three.js/tree/dev/examples/jsm/renderers/webgpu)

---

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-24 | Claude | Initial plan creation |

