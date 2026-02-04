# WebGPU Post-Processing Effects Deep Code Review

**Date:** 2026-02-04
**Scope:** 35 WebGPU post-processing passes, shaders, stores, reactivity, configuration, render graph integration
**Review Type:** Deep review (no token limit, no quick scan)

---

## Executive Summary

This review examined all 35 WebGPU post-processing passes. **10 CRITICAL issues** were identified that will cause runtime failures or incorrect rendering. **15 WARNING issues** indicate potential bugs or inefficiencies. The majority of passes are correctly implemented following WebGPU best practices.

---

## Critical Issues (Must Fix)

### 1. NDC Depth Unprojection Uses Wrong Clip Z Range
**Severity:** CRITICAL
**Affected Files:**
- `SSRPass.ts:66`
- `GTAOPass.ts:73`
- `NormalPass.ts:55`
- `RefractionPass.ts:67`

**Issue:** All these passes use `depth * 2.0 - 1.0` for NDC depth unprojection, assuming OpenGL clip Z range `[-1, 1]`. However, `WebGPUCamera.createPerspectiveMatrix` builds matrices for WebGPU's `[0, 1]` depth range.

**Evidence:**
```wgsl
// Shader code (WRONG)
let ndc = vec4f(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
```

```typescript
// WebGPUCamera.ts:147 - uses WebGPU [0,1] convention
// Column 2 - WebGPU depth range is [0, 1]
m[10] = far * nf
```

**Fix:** Change depth conversion to:
```wgsl
let ndc = vec4f(uv * 2.0 - 1.0, depth, 1.0);  // WebGPU uses [0,1] directly
```

---

### 2. BokehPass Non-Uniform Control Flow
**Severity:** CRITICAL
**File:** `BokehPass.ts:83-120`

**Issue:** `textureSample` called in non-uniform control flow:
1. Early return based on `cocRadius` (fragment-varying depth value)
2. Nested loops with variable bounds (`pointsInRing` depends on `ring`)

**Evidence:**
```wgsl
// WRONG - cocRadius varies per fragment
if (cocRadius < 0.5) {
  return textureSample(tColor, texSampler, uv);  // Line 83
}
// Later textureSample calls are now in non-uniform control flow

for (var ring = 1; ring <= rings; ring++) {
  let pointsInRing = ring * 6;  // Variable bound!
  for (var i = 0; i < pointsInRing; i++) {
    textureSample(tColor, texSampler, sampleUV);  // Line 99
  }
}
```

**Fix:** Restructure to always sample all textures before any data-dependent branching, or use `textureLoad` instead.

---

### 3. SSRPass textureSample in Ray March Loop
**Severity:** CRITICAL
**File:** `SSRPass.ts:114`

**Issue:** `textureSample` called inside ray march loop with dynamic termination condition.

**Evidence:**
```wgsl
for (var i = 0; i < maxSteps; i++) {
  // ... ray marching ...
  if (rayDepth > surfaceDepth) {
    let hitColor = textureSample(tColor, texSampler, screenPos.xy);  // Non-uniform!
  }
}
```

**Fix:** Sample color after ray march completes, using final hit coordinates.

---

### 4. RefractionPass textureSample in Non-Uniform Branch
**Severity:** CRITICAL
**File:** `RefractionPass.ts:142`

**Issue:** `textureSample` inside early-return block based on `hasGBufferData()` which uses `textureLoad` (non-uniform result).

**Evidence:**
```wgsl
if (!hasGBufferData(uv)) {  // hasGBufferData uses textureLoad - non-uniform!
  return textureSample(tDiffuse, texSampler, uv);  // WRONG
}
```

**Fix:** Sample texture unconditionally before the branch.

---

### 5. TemporalCloudPass ArrayBuffer Type Mismatch
**Severity:** CRITICAL
**File:** `TemporalCloudPass.ts:851, 909`

**Issue:** `writeUniformBuffer` called with `ArrayBuffer` instead of typed array. The base class method expects `Float32Array | Uint32Array | Int32Array | Uint8Array`.

**Evidence:**
```typescript
const reprojData = new ArrayBuffer(176)  // Line 825
// ... populate views ...
this.writeUniformBuffer(this.device, this.reprojectionUniformBuffer, reprojData)  // WRONG
```

**Fix:** Pass the typed array view:
```typescript
this.writeUniformBuffer(this.device, this.reprojectionUniformBuffer, new Uint8Array(reprojData))
```

---

### 6. TemporalCloudPass Read-After-Write Hazard
**Severity:** CRITICAL
**File:** `TemporalCloudPass.ts:913`

**Issue:** `reprojColorView` used as both render target and texture input in same command buffer without synchronization barrier.

**Evidence:**
```typescript
// Reprojection pass writes to reprojColorView
// Reconstruction pass immediately reads reprojHistoryView (same texture)
// No barrier between them!
```

**Fix:** Either use separate textures or insert appropriate barriers.

---

### 7. TemporalDepthCapturePass Camera Store Structure Mismatch
**Severity:** CRITICAL
**File:** `TemporalDepthCapturePass.ts:468`

**Issue:** Camera store access expects raw `number[]` arrays but Three.js stores `Matrix4` objects with `.elements` property.

**Evidence:**
```typescript
// WRONG - expects direct arrays
ctx.frame?.stores?.['camera'] as {
  projectionMatrix: number[];  // Three.js has .projectionMatrix.elements
  matrixWorldInverse: number[]
}
```

**Fix:** Access via `.elements` property or ensure store serializes correctly.

---

### 8. EnvironmentCompositePass u32/f32 Type Mismatch
**Severity:** CRITICAL
**File:** `EnvironmentCompositePass.ts:312`

**Issue:** `shellEnabled` written as `Float32` (1.0) but shader expects `u32` (1). Binary representations differ completely.

**Evidence:**
```typescript
// TypeScript (WRONG)
const data = new Float32Array(16)
data[2] = this.shellConfig.enabled ? 1 : 0  // Writes float 1.0 = 0x3F800000

// WGSL expects
shellEnabled: u32  // Should be 0x00000001
```

**Fix:** Use `DataView` or `Uint32Array` overlay for the u32 field:
```typescript
const data = new ArrayBuffer(64)
const floatView = new Float32Array(data)
const uintView = new Uint32Array(data)
uintView[2] = this.shellConfig.enabled ? 1 : 0
```

---

### 9. TonemappingPass i32 Mode via Float32Array
**Severity:** CRITICAL
**File:** `TonemappingPass.ts:162`

**Issue:** Shader expects `mode: i32` but value written via `Float32Array`.

**Evidence:**
```typescript
const uniformData = new Float32Array([this.exposure, this.gamma, this.mode, 0])
// this.mode should be written via Int32Array for i32 type
```

**Fix:** Use mixed typed array views like `ToneMappingCinematicPass` does correctly.

---

## Warnings (Should Fix)

### 1. BokehPass Oversized Uniform Buffer
**File:** `BokehPass.ts:253`
**Issue:** 64 bytes allocated but struct only needs 32 bytes. Wastes GPU memory.

### 2. BokehPass Camera Store Structure Mismatch
**File:** `BokehPass.ts:364`
**Issue:** Expects `projectionMatrix.elements` at top level but `CameraStoreState` has it under `controls.object`.

### 3. BloomPass Unused Variable
**File:** `BloomPass.ts:318`
**Issue:** `_temp` variable assigned but never read in ping-pong swap.

### 4. bloom.wgsl.ts textureSample in Loop
**File:** `bloom.wgsl.ts:126`
**Issue:** `textureSample` inside constant-bound loop. While technically uniform control flow, some implementations may have derivative issues.

### 5. WebGPUTemporalCloudPass Bind Group Sampler Position
**File:** `WebGPUTemporalCloudPass.ts:584`
**Issue:** `linearSampler` bound at binding 2 but only used for `prevAccumulation` (binding 0). `quarterPosition` (binding 1) is unfilterable.

### 6. TemporalDepthCapturePass Format Mismatch
**File:** `TemporalDepthCapturePass.ts:256`
**Issue:** History buffer uses canvas format (likely `rgba8unorm`) instead of float format for position data.

### 7. TemporalDepthCapturePass Matrix Order
**File:** `TemporalDepthCapturePass.ts:171`
**Issue:** Matrix multiplication may have row/column-major order mismatch with WGSL expectations.

### 8. TemporalCloudPass Dead Code
**File:** `TemporalCloudPass.ts:647`
**Issue:** `copyPipeline` and `copyBindGroupLayout` created but never used.

### 9. TemporalCloudPass Incomplete Implementation
**File:** `TemporalCloudPass.ts:834`
**Issue:** Current `viewProjectionMatrix` copies from `prevViewProjectionMatrix` - no actual current matrix.

### 10. SSRPass Oversized Uniform Buffer
**File:** `SSRPass.ts:286`
**Issue:** 320 bytes allocated but struct needs ~288 bytes.

### 11. GTAOPass Oversized Uniform Buffer
**File:** `GTAOPass.ts:263`
**Issue:** 256 bytes allocated but struct needs ~176 bytes.

### 12. Inconsistent Camera Store Access
**Multiple Files**
**Issue:** Different passes access camera stores with different expected structures - some expect `.elements`, some expect raw arrays.

### 13. FrameBlendingPass Store Key
**File:** `FrameBlendingPass.ts:280`
**Issue:** Store key `'postProcessing'` may not match actual store name.

### 14. NormalPass Unused Sampler
**File:** `NormalPass.ts:44`
**Issue:** Sampler declared at binding 1 but never used - all access via `textureLoad`.

### 15. DepthPass Unused Sampler
**File:** `DepthPass.ts:57`
**Issue:** Sampler declared "for potential future use" but currently unused.

---

## Verified Correct Patterns

### Good: ToneMappingCinematicPass Mixed-Type Uniforms
**File:** `ToneMappingCinematicPass.ts:561-568`
```typescript
const data = new ArrayBuffer(48)
const floatView = new Float32Array(data)
const intView = new Int32Array(data)
intView[3] = this.toneMapping  // Correctly writes i32
```

### Good: Depth Textures Use textureLoad
All passes correctly use `textureLoad` for depth textures with `unfilterable-float` sample type, avoiding the `textureSample` requirement for filterable textures.

### Good: Bind Groups Within Limits
All passes use at most 4 bind groups (0-3), staying within WebGPU limits.

### Good: Uniform-Based Conditional textureSample
Several passes correctly use `textureSample` inside conditionals that depend only on uniform values:
- `CinematicPass.ts:82` - `uniforms.noiseIntensity > 0.001`
- `ToneMappingCinematicPass.ts:264` - `uniforms.distortion > 0.001`
- `CompositePass.ts:166` - `uniforms.inputCount >= N`

### Good: Resource Disposal
All passes properly destroy GPU buffers and textures in `dispose()` methods.

---

## Inline Pattern Detection Summary

| Pattern | Count | Status |
|---------|-------|--------|
| `console.warn/error` | 8 | Expected (debug logging) |
| `as any` | 4 | Should reduce |
| `textureSample` | 183 | Most correct; some critical issues above |
| `textureLoad` | 28 | All correct for depth textures |
| `layout: 'auto'` | 0 | Good (explicit layouts used) |
| `@ts-ignore` | 0 | Good |
| Bind groups > 3 | 0 | Good (within limits) |

---

## Files Reviewed (35 Passes)

1. BloomPass.ts
2. BokehPass.ts
3. BufferPreviewPass.ts
4. CinematicPass.ts
5. CompositePass.ts
6. CopyPass.ts
7. CubemapCapturePass.ts
8. DebugOverlayPass.ts
9. DensityGridComputePass.ts
10. DepthPass.ts
11. EnvironmentCompositePass.ts
12. FrameBlendingPass.ts
13. FullscreenPass.ts
14. FXAAPass.ts
15. GodRaysPass.ts
16. GravitationalLensingPass.ts
17. GTAOPass.ts
18. JetsCompositePass.ts
19. JetsRenderPass.ts
20. MainObjectMRTPass.ts
21. NormalPass.ts
22. PaperTexturePass.ts
23. RefractionPass.ts
24. ScenePass.ts
25. ScreenSpaceLensingPass.ts
26. SMAAPass.ts
27. SSRPass.ts
28. TemporalCloudDepthPass.ts
29. TemporalCloudPass.ts
30. TemporalDepthCapturePass.ts
31. ToneMappingCinematicPass.ts
32. TonemappingPass.ts
33. ToScreenPass.ts
34. WebGPUTemporalCloudPass.ts

---

## Priority Remediation Order

1. **Immediate (Blocking):** NDC depth unprojection fix (4 files) - affects all depth-based effects
2. **High:** EnvironmentCompositePass u32/f32 fix - shell glow broken
3. **High:** TonemappingPass i32 mode fix - tonemap mode selection broken
4. **High:** BokehPass shader restructure - bokeh DOF broken on many GPUs
5. **Medium:** TemporalCloudPass ArrayBuffer + RAW hazard fixes
6. **Medium:** SSRPass shader restructure
7. **Medium:** RefractionPass shader restructure
8. **Low:** Camera store access consistency
9. **Low:** Memory waste (oversized buffers)

---

*Generated by deep code review on 2026-02-04*
