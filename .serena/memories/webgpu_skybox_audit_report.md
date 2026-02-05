# WebGPU Skybox Audit Report

**Date:** 2026-02-05  
**Status:** AUDIT COMPLETE - CRITICAL BUG FOUND  
**Severity:** HIGH - Skybox/background not rendering in WebGPU

---

## Executive Summary

The WebGPU implementation has a **WebGPUSkyboxRenderer** that is fully implemented but **NEVER INSTANTIATED** in the render graph. As a result:

- **WebGPU has NO skybox or background rendering** (just solid black)
- **WebGL renders procedural skybox** (Aurora, Nebula, Crystalline, Horizon, Ocean, Twilight) or classic KTX2 textures
- Both implementations are complete but only WebGL is wired into the pipeline

---

## Part 1: WebGL Skybox Implementation (WORKING)

### Architecture
1. **React Component** (`Skybox.tsx`)
   - `SkyboxLoader`: Async KTX2 texture loading (for classic mode)
   - `SkyboxMesh`: Visual mesh rendering with procedural shader (for procedural modes)
   - Both use WebGL 2 ShaderMaterial with composable GLSL fragment shaders

2. **Shader System** (`src/rendering/shaders/skybox/`)
   - `main.glsl.ts`: Defines 7 modes + effects
   - `compose.ts`: Composes shaders based on mode + effects (sun, vignette)
   - Supports: Classic, Aurora, Nebula, Crystalline, Horizon, Ocean, Twilight

3. **Store Integration**
   - `useEnvironmentStore` provides:
     - `skyboxEnabled`: boolean
     - `skyboxMode`: 'classic' | 'procedural_aurora' | 'procedural_nebula' | ...
     - `skyboxIntensity`: number (0-10)
     - `skyboxRotation`: number (degrees)
     - `skyboxAnimationMode`: 'none' | 'cinematic' | 'heatwave' | 'tumble' | 'ethereal' | 'nebula'
     - `skyboxAnimationSpeed`: number
     - `proceduralSettings`: SkyboxProceduralSettings (hue, saturation, scale, complexity, timeScale, evolution, etc.)
     - `skyboxTexture`: string (selected KTX2 asset)
     - `skyboxHighQuality`: boolean

4. **Uniform Updates** (in SkyboxMesh.tsx)
   - Per-frame: uTime, uIntensity (with fade animation)
   - Per-store-change: mode, colors, palette, effects
   - Animation-driven: rotation matrices, hue shifts (based on animation mode)

5. **Environment Map Integration**
   - `CubemapCapturePass` (WebGL) captures skybox to cubemap for:
     - `scene.background` (for black hole gravitational lensing)
     - `scene.environment` (PMREM for wall PBR reflections)

### Store Keys Read by WebGL Skybox
```
environment.skyboxEnabled
environment.skyboxMode
environment.skyboxIntensity
environment.skyboxRotation
environment.skyboxAnimationMode
environment.skyboxAnimationSpeed
environment.proceduralSettings (all subfields)
environment.skyboxTexture
environment.skyboxHighQuality
appearance.colorAlgorithm
appearance.cosineCoefficients
appearance.distribution
appearance.lchLightness
appearance.lchChroma
appearance.faceColor
animation.isPlaying
```

---

## Part 2: WebGPU Skybox Implementation (EXISTS BUT NOT USED)

### WebGPUSkyboxRenderer Class
**File:** `src/rendering/webgpu/renderers/WebGPUSkyboxRenderer.ts`  
**Lines:** 84-657  
**Status:** 100% implemented, 0% used

#### Features Implemented
1. **Store Integration** (Lines 324-435)
   - Reads `ctx.frame?.stores?.['environment']` for:
     - `skyboxMode`
     - `skyboxIntensity`
     - `skyboxRotation`
     - `proceduralSettings` (all subfields)
   - Correctly maps store mode to shader numeric mode (0-6)
   - Correctly parses hex colors and arrays

2. **Pipeline Creation** (Lines 139-250)
   - Creates separate pipeline for each shader mode (dynamic recreation)
   - Bind Group 0: Uniform buffers (SkyboxUniforms + VertexUniforms)
   - Bind Group 1: Textures (placeholder cube + sampler)
   - Proper buffer sizes: 512 bytes (256 SkyboxUniforms + 256 VertexUniforms)

3. **Uniform Packing** (Lines 324-435)
   - SkyboxUniforms (256 bytes):
     - Core: mode, time, intensity, hue, saturation, scale, complexity, timeScale
     - Effects: evolution, syncWithObject, distortion, vignette, turbulence, dualTone, sunIntensity
     - Colors: color1, color2, palette coefficients (a, b, c, d)
     - Sun: sunPosition (vec3)
     - Mode-specific: aurora, horizon, ocean settings
   - VertexUniforms (256 bytes):
     - modelMatrix, modelViewMatrix, projectionMatrix, rotationMatrix

4. **Geometry** (Lines 605-640)
   - Creates cube vertices (36 vertices = 6 faces × 2 triangles × 3 vertices)
   - Per-frame allocation (destroyed after draw call)

5. **Shader Compilation** (Lines 13-17, 152-163)
   - Uses `composeSkyboxFragmentShader()` with mode + effects
   - Uses `composeSkyboxVertexShader()` with effects
   - Same WGSL composition as main shaders

#### Issues Found

**Issue 1: Fragment Entry Point Mismatch**
- **Line 230:** `entryPoint: 'fragmentMain'`
- **Should be:** `entryPoint: 'main'`
- The base class convention is to use `main` for both vertex and fragment
- Currently will fail pipeline creation with "Entry point 'fragmentMain' doesn't exist"

**Issue 2: Placeholder Texture Limitation**
- **Lines 256-282:** Placeholder cube is always 1×1 dark gray
- **Impact:** No real cubemap for reflections
- **Missing:** Integration with classic KTX2 textures or procedural captures

**Issue 3: Missing Pipeline Recreation During Execute**
- **Lines 549-554:** Pipeline mode changes are detected but NOT applied
- **Code:** `this.pipelineNeedsRecreation = true` then immediately `= false` with comment "would need async handling"
- **Impact:** Skybox mode changes will not take effect

**Issue 4: No Store Key Wiring in WebGPUScene**
- `setupRenderPasses()` never instantiates `new WebGPUSkyboxRenderer()`
- No pass in the graph renders the skybox
- Result: **Skybox is never rendered**

---

## Part 3: Comparison Matrix

| Feature | WebGL | WebGPU |
|---------|-------|--------|
| **Skybox rendering** | ✅ YES (SkyboxMesh) | ❌ MISSING (renderer not instantiated) |
| **Background color** | ✅ YES (clear color from store) | ✅ PARTIAL (ScenePass clears to [0,0,0]) |
| **Procedural modes** | ✅ 7 modes (Aurora, Nebula, etc.) | ✅ 7 modes (compiled in WGSL) |
| **Classic KTX2** | ✅ Async loaded, textured mesh | ⚠️ Placeholder support only |
| **Animation** | ✅ Full (cinematic, heatwave, tumble, ethereal, nebula) | ✅ Computed in uniforms (not applied) |
| **Store reads** | ✅ 13+ keys from environment/appearance | ✅ ~10 keys from environment (no effect) |
| **Environment map** | ✅ CubemapCapturePass (scene.background/environment) | ⚠️ CubemapCapturePass exists but skybox not rendered to capture |
| **Cubemap generation** | ✅ Renders SKYBOX layer to CubeCamera | ⚠️ Would need skybox to render first |

---

## Part 4: What's Missing in WebGPU

### Missing: Skybox Instantiation
**File:** `src/rendering/webgpu/WebGPUScene.tsx` - `setupRenderPasses()` function  
**Line:** After line 1106 (after ScenePass, before GroundPlaneRenderer)

Should add:
```typescript
// Skybox (procedural or classic) - render before main objects
if (config.skyboxEnabled) {
  await graph.addPass(
    new WebGPUSkyboxRenderer({
      mode: 'procedural_aurora', // Default, will be overridden by store
      sun: true,
      vignette: true,
    })
  )
}
```

### Missing: Background Color from Store
**File:** `src/rendering/webgpu/passes/ScenePass.ts`  
**Line 317:** Currently hardcoded to `{ r: 0, g: 0, b: 0, a: 1 }`

Should read from `ctx.frame?.stores?.['appearance']?.backgroundColor` or similar

### Missing: Animation State
**File:** `src/rendering/webgpu/WebGPUScene.tsx`  
**Line:** `graph.setStoreGetter('animation', ...)`

The animation store is registered but WebGPUSkyboxRenderer doesn't use `isPlaying` flag like WebGL does

### Bug: Fragment Entry Point
**File:** `src/rendering/webgpu/renderers/WebGPUSkyboxRenderer.ts`  
**Line 230:** Change `entryPoint: 'fragmentMain'` to `entryPoint: 'main'`

---

## Part 5: Store Keys Analysis

### Environment Store Keys - VERIFIED CORRECT
All keys that WebGPUSkyboxRenderer reads are registered in WebGPUScene:
```typescript
graph.setStoreGetter('environment', () => useEnvironmentStore.getState())
```

Keys read:
- `skyboxMode` ✅
- `skyboxIntensity` ✅
- `skyboxRotation` ✅
- `proceduralSettings` (all subfields) ✅
- `skyboxAnimationMode` ⚠️ NOT read by WebGPU renderer (would need animation integration)
- `skyboxAnimationSpeed` ⚠️ NOT read by WebGPU renderer

### Animation Store Keys - MISSING INTEGRATION
File: `src/rendering/webgpu/WebGPUScene.tsx` line ~350
```typescript
graph.setStoreGetter('animation', () => useAnimationStore.getState())
```

WebGPUSkyboxRenderer should also read:
- `isPlaying` (from animation store)

But currently doesn't check it. Would need to:
1. Pass animation store to updateUniforms()
2. Accumulate time only when isPlaying is true
3. Apply animation-specific modulations (like classic mode animations)

---

## Part 6: Visual Comparison

### WebGL Flow
```
Skybox.tsx (React)
  ├─ SkyboxLoader (async KTX2)
  │  └─ SkyboxMesh (renders sphere with texture)
  │     └─ ShaderMaterial (glsl shader)
  │        └─ Updates uniforms from stores (per-frame)
  └─ CubemapCapturePass (WebGL)
     ├─ Captures SKYBOX layer to CubeRenderTarget
     ├─ Generates PMREM
     └─ Exports scene.background + scene.environment

Result: Procedural or KTX2 skybox visible on screen + environment maps for reflections
```

### WebGPU Flow (CURRENT - BROKEN)
```
WebGPUScene.tsx
  └─ setupRenderPasses()
     ├─ ScenePass (clears to black [0,0,0])
     ├─ GroundPlaneRenderer
     ├─ Render main object
     ├─ EnvironmentCompositePass (composites object over black environment)
     ├─ Post-processing passes
     └─ TonemappingPass
     
Result: Black background, no skybox, objects float in void
```

### WebGPU Flow (IF FIXED)
```
WebGPUScene.tsx
  └─ setupRenderPasses()
     ├─ WebGPUSkyboxRenderer (renders cube with procedural shader to hdr-color)
     ├─ ScenePass (NO-OP, already has skybox)
     ├─ GroundPlaneRenderer
     ├─ Render main object
     ├─ EnvironmentCompositePass (composites object over skybox)
     ├─ Post-processing passes
     └─ TonemappingPass
     
Result: Procedural skybox visible + environment maps for reflections
```

---

## Detailed Code Audit: WebGPUSkyboxRenderer Store Usage

### ✅ Correct Field Reads
```typescript
// Line 328-333: Store access
const env = ctx.frame?.stores?.['environment'] as {...}
const storeMode = env?.skyboxMode ?? 'procedural_aurora'
const settings = env?.proceduralSettings
const time = ctx.frame?.time ?? 0

// Line 444-451: Camera and rotation
const camera = ctx.frame?.stores?.['camera']
const env = ctx.frame?.stores?.['environment']
const rotation = env?.skyboxRotation ?? 0
```

### ✅ Correct Uniform Packing
All fields correctly mapped from store to uniform buffer:
- `data[0] = modeToNumeric(shaderMode)` - mode numeric
- `data[1] = time * (settings?.timeScale ?? 0.2)` - scaled time
- `data[2] = env?.skyboxIntensity ?? 1.0` - intensity
- `data[3-15]` - hue, saturation, scale, complexity, evolution, etc.
- `data[16-39]` - color1, color2, palette coefficients
- `data[40-50]` - sun position, aurora, horizon, ocean settings

### ✅ Correct Pipeline Creation
- Bind groups properly sized (256 bytes each)
- Vertex buffer format: float32x3 for positions
- Depth test: less-equal (correct for skybox at far plane)
- Cull mode: front (correct - we're inside the cube)
- No depth write (correct - background only)

### ❌ Issues with Matrix Updates
**Lines 481-541:** View/Projection matrices handled, BUT:
- Line 505-510: Fallback to identity if matrices missing
- No validation that matrices have 16 elements
- Could pass garbage data to shader if camera not initialized

### ⚠️ Pipeline Mode Recreation Not Implemented
**Lines 549-554:** Detected but not applied
```typescript
if (this.pipelineNeedsRecreation) {
  // For now, skip recreation during execute - would need async handling
  // In production, this would trigger pipeline recreation
  this.pipelineNeedsRecreation = false
}
```
This means: Change skybox mode → detected → flag set → immediately cleared → shader doesn't update

---

## Summary of Bugs

| Bug | File | Line | Severity | Status |
|-----|------|------|----------|--------|
| Skybox not instantiated | WebGPUScene.tsx | 1106 | CRITICAL | Not fixed |
| Fragment entry point wrong | WebGPUSkyboxRenderer.ts | 230 | CRITICAL | Not fixed |
| Pipeline recreation disabled | WebGPUSkyboxRenderer.ts | 549-554 | CRITICAL | Not fixed |
| No animation integration | WebGPUSkyboxRenderer.ts | updateUniforms | MEDIUM | Not fixed |
| Placeholder texture only | WebGPUSkyboxRenderer.ts | 256-282 | MEDIUM | Not fixed |
| No background color store read | ScenePass.ts | 317 | MEDIUM | Not fixed |

---

## Recommendations

### Priority 1 (Blocking)
1. Instantiate WebGPUSkyboxRenderer in setupRenderPasses()
2. Fix fragment entry point from 'fragmentMain' to 'main'
3. Implement async pipeline recreation for mode changes
4. Reorder passes: Skybox should render BEFORE main object

### Priority 2 (Feature Parity)
1. Integrate animation store for skybox animation (time accumulation, mode-specific effects)
2. Add background color fallback in ScenePass
3. Wire KTX2 textures to skybox for classic mode

### Priority 3 (Optimization)
1. Replace per-frame vertex buffer allocation with persistent buffer
2. Cache shader modules to avoid recompilation on mode change
3. Throttle uniform buffer updates like CubemapCapturePass does

---

## Files Involved

### WebGL (Working)
- `src/rendering/environment/Skybox.tsx` - Main React component
- `src/rendering/materials/skybox/SkyboxShader.ts` - Shader defaults
- `src/rendering/shaders/skybox/compose.ts` - Shader composition
- `src/rendering/shaders/skybox/main.glsl.ts` - GLSL shader code
- `src/rendering/graph/passes/CubemapCapturePass.ts` - Environment map generation

### WebGPU (Incomplete)
- `src/rendering/webgpu/renderers/WebGPUSkyboxRenderer.ts` - Renderer (not used)
- `src/rendering/webgpu/shaders/skybox/` - WGSL shader code (not compiled)
- `src/rendering/webgpu/WebGPUScene.tsx` - Setup (missing instantiation)
- `src/rendering/webgpu/passes/ScenePass.ts` - Clears to black instead of using skybox

---

**End of Report**
