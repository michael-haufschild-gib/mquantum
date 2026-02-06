# Half-Resolution GTAO Implementation Plan

**Status**: Planning  
**Author**: AI Agent  
**Created**: 2025-12-25  
**Estimated Performance Improvement**: 50-75% for GTAO pass  
**Risk of Visual Quality Loss**: Medium  
**Visual Impact**: Softer ambient occlusion, more noticeable in high-contrast areas with fine geometry

---

## Overview

This document outlines the full implementation plan for rendering Ground Truth Ambient Occlusion (GTAO) at half resolution with bilateral upsampling. This optimization follows the same pattern established by SSRPass and reuses the existing `BilateralUpsampleShader`.

---

## Architecture Analysis

### Current Implementation

**File**: `src/rendering/graph/passes/GTAOPass.ts`

The current GTAOPass:
1. Wraps Three.js's `GTAOPass` from `three/examples/jsm/postprocessing/GTAOPass.js`
2. Uses external G-buffer textures (normal + depth) from the render graph
3. Renders at full resolution via `ThreeGTAOPass.render()`
4. Copies results to output target

```typescript
// Current flow:
// 1. Copy color to readTarget (full-res)
// 2. Run GTAOPass.render() at full resolution
// 3. Copy result to output
```

### Reference Implementation: SSRPass

**File**: `src/rendering/graph/passes/SSRPass.ts`

SSRPass already implements half-resolution rendering:
- Creates a half-resolution render target
- Renders SSR at half-res
- Upsamples using `BilateralUpsampleShader`
- Provides runtime toggle via `setHalfResolution()`

---

## Implementation Strategy

### Approach: Wrapper with Half-Res Intermediates

Since Three.js GTAOPass doesn't natively support half-resolution, we will:
1. Create half-resolution render targets for GTAOPass input/output
2. Downsample the input color to half-resolution
3. Initialize GTAOPass at half resolution
4. Run GTAOPass at half resolution
5. Apply GTAO-specific bilateral upsampling to full resolution

### Key Difference from SSR

GTAO output is **ambient occlusion only** (grayscale intensity), not a reflection color. The bilateral upsample for GTAO should:
- Sample the half-res AO value
- Apply depth-aware upsampling
- Composite AO with the full-res scene color

### Critical: Three.js GTAOPass Output Modes

The Three.js `GTAOPass` has multiple output modes:
- `OUTPUT.Default` - Composited: scene color * AO (current mode)
- `OUTPUT.AO` - AO texture only (grayscale)
- `OUTPUT.Denoise` - Denoised AO only

**For half-resolution rendering, we MUST use `OUTPUT.Denoise` or `OUTPUT.AO`** to get an AO-only texture that we can then upsample and composite ourselves.

```typescript
// Full-res mode (current)
this.gtaoPass.output = ThreeGTAOPass.OUTPUT.Default;

// Half-res mode (new)
this.gtaoPass.output = ThreeGTAOPass.OUTPUT.Denoise; // or OUTPUT.AO
```

**AO Texture Format**: The AO output is typically:
- R channel: AO value (0.0 = full occlusion, 1.0 = no occlusion)
- Or may use different channels depending on Three.js version

**Verification Required**: During implementation, verify the AO output format by rendering a debug visualization.

---

## File Changes

### 1. New Shader: `GTAOBilateralUpsampleShader.ts`

**Location**: `src/rendering/shaders/postprocessing/GTAOBilateralUpsampleShader.ts`

A specialized bilateral upsample shader for GTAO that:
- Takes half-res AO texture
- Takes full-res color and depth
- Applies depth-aware upsampling
- Blends AO with scene color (multiplicative darkening)

```glsl
// Key difference from SSR:
// SSR: fragColor = sceneColor + result.rgb * result.a (additive reflection)
// GTAO: fragColor = sceneColor * mix(1.0, aoValue, aoIntensity) (multiplicative darkening)
```

### 2. Update: `GTAOPass.ts`

**Location**: `src/rendering/graph/passes/GTAOPass.ts`

Modifications:
1. Add `halfResolution` config option (default: true)
2. Add `bilateralDepthThreshold` config option
3. Create half-res render targets
4. Create upsample material and scene
5. Add `executeFullRes()` and `executeHalfRes()` methods
6. Add `ensureHalfResTarget()` for dynamic sizing
7. Add runtime setters: `setHalfResolution()`, `setBilateralDepthThreshold()`
8. Update `dispose()` to clean up half-res resources

### 3. Update: `GTAOPassConfig` Interface

Add new configuration options:
```typescript
interface GTAOPassConfig {
  // ... existing options ...
  
  /** Enable half-resolution rendering with bilateral upsampling. @default true */
  halfResolution?: boolean;
  
  /** Depth threshold for bilateral upsampling. @default 0.02 */
  bilateralDepthThreshold?: number;
}
```

### 4. Update: PostProcessingV2.tsx

**Location**: `src/rendering/environment/PostProcessingV2.tsx`

- Pass `halfResolution` and `bilateralDepthThreshold` to GTAOPass construction
- Optionally expose settings through postProcessing store

### 5. Optional: Store Updates

**Location**: `src/stores/slices/postProcessingSlice.ts`

Add settings for user control (optional, can be internal-only initially):
- `ssaoHalfResolution: boolean`
- `ssaoDepthThreshold: number`

### 6. New Tests: `GTAOPass.test.ts` Updates

**Location**: `src/tests/rendering/graph/passes/GTAOPass.test.ts`

Add tests for:
- Half-resolution toggle
- Bilateral depth threshold setter
- Resource disposal with half-res enabled
- Fallback to full-res behavior

---

## Detailed Implementation

### Phase 1: Create GTAO Bilateral Upsample Shader

> ⚠️ **CRITICAL BUG PREVENTION**: The original SSR BilateralUpsampleShader had two critical bugs:
>
> **Bug 1 - Bilinear weights always 0:**
> ```glsl
> // WRONG: This was always (1.0, 1.0), making distWeight always 0!
> vec2 distToSample = abs(offsets[i]) / halfOffset;
> float distWeight = (1.0 - distToSample.x) * (1.0 - distToSample.y); // Always 0!
> ```
>
> **Bug 2 - Additive instead of alpha blending:**
> ```glsl
> // WRONG: Additive blending
> fragColor = vec4(sceneColor.rgb + result.rgb * result.a, sceneColor.a);
> // CORRECT: Alpha blending
> fragColor = vec4(mix(sceneColor.rgb, result.rgb, result.a), sceneColor.a);
> ```

The GTAO shader must use the **corrected pattern** from the fixed `BilateralUpsampleShader`:

1. Calculate `cellPos = fract(vUv / halfResTexelSize)` - position within 2x2 cell
2. Calculate bilinear weights from `cellPos`, NOT from offsets
3. Align sampling to half-res grid using `floor()` + snap
4. Use multiplicative blending for AO: `color * aoFactor`

```typescript
// src/rendering/shaders/postprocessing/GTAOBilateralUpsampleShader.ts

export const GTAOBilateralUpsampleShader = {
  uniforms: {
    tAO: { value: null },           // Half-res AO texture
    tColor: { value: null },         // Full-res scene color
    tDepth: { value: null },         // Full-res depth
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDepthThreshold: { value: 0.02 },
    uNearClip: { value: 0.1 },
    uFarClip: { value: 1000 },
    uAOIntensity: { value: 1.0 },    // GTAO-specific: blend intensity
  },
  
  vertexShader: /* glsl */ `
    out vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  
  fragmentShader: /* glsl */ `
    precision highp float;
    
    uniform sampler2D tAO;
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform vec2 uResolution;     // Full resolution
    uniform float uDepthThreshold;
    uniform float uNearClip;
    uniform float uFarClip;
    uniform float uAOIntensity;
    
    in vec2 vUv;
    layout(location = 0) out vec4 fragColor;
    
    float linearizeDepth(float rawDepth) {
      return (2.0 * uNearClip * uFarClip) / 
             (uFarClip + uNearClip - rawDepth * (uFarClip - uNearClip));
    }
    
    void main() {
      vec2 texelSize = 1.0 / uResolution;
      vec2 halfResTexelSize = texelSize * 2.0;  // Half-res texel in full-res UV space
      
      float centerDepth = linearizeDepth(texture(tDepth, vUv).r);
      
      // ============================================================
      // CRITICAL: Calculate position within the 2x2 half-res cell
      // This is a value from 0-1 representing where in the cell we are
      // ============================================================
      vec2 cellPos = fract(vUv / halfResTexelSize);
      
      // ============================================================
      // CRITICAL: Align to half-res grid by snapping to cell boundaries
      // Then sample the 4 corners of this cell
      // ============================================================
      vec2 baseUv = floor(vUv / halfResTexelSize) * halfResTexelSize + halfResTexelSize * 0.5;
      
      vec2 offsets[4];
      offsets[0] = vec2(0.0, 0.0);
      offsets[1] = vec2(halfResTexelSize.x, 0.0);
      offsets[2] = vec2(0.0, halfResTexelSize.y);
      offsets[3] = vec2(halfResTexelSize.x, halfResTexelSize.y);
      
      // ============================================================
      // CRITICAL: Bilinear weights from cellPos, NOT from offsets!
      // The old bug calculated this from offsets which always gave 0
      // ============================================================
      float wx0 = 1.0 - cellPos.x;
      float wx1 = cellPos.x;
      float wy0 = 1.0 - cellPos.y;
      float wy1 = cellPos.y;
      float bilinearWeights[4];
      bilinearWeights[0] = wx0 * wy0;  // Top-left corner
      bilinearWeights[1] = wx1 * wy0;  // Top-right corner
      bilinearWeights[2] = wx0 * wy1;  // Bottom-left corner
      bilinearWeights[3] = wx1 * wy1;  // Bottom-right corner
      
      float aoSamples[4];
      float weights[4];
      float totalWeight = 0.0;
      
      for (int i = 0; i < 4; i++) {
        vec2 sampleUv = baseUv - halfResTexelSize * 0.5 + offsets[i];
        aoSamples[i] = texture(tAO, sampleUv).r;
        float sampleDepth = linearizeDepth(texture(tDepth, sampleUv).r);
        
        // Bilateral weight based on depth similarity
        float depthDiff = abs(sampleDepth - centerDepth);
        float depthWeight = exp(-depthDiff / (uDepthThreshold * max(centerDepth, 0.001)));
        
        // Combine bilinear and depth weights
        weights[i] = bilinearWeights[i] * depthWeight;
        totalWeight += weights[i];
      }
      
      // Normalize and compute final AO
      float ao = 1.0;  // Default: no occlusion
      if (totalWeight > 0.001) {
        ao = 0.0;
        for (int i = 0; i < 4; i++) {
          ao += aoSamples[i] * (weights[i] / totalWeight);
        }
      }
      
      // ============================================================
      // GTAO-specific: Multiplicative blending (NOT additive or alpha)
      // AO darkens the scene: result = color * lerp(1.0, ao, intensity)
      // ============================================================
      vec4 sceneColor = texture(tColor, vUv);
      float aoFactor = mix(1.0, ao, uAOIntensity);
      fragColor = vec4(sceneColor.rgb * aoFactor, sceneColor.a);
    }
  `,
};
```

### Phase 2: Update GTAOPass Class

Key modifications to `GTAOPass.ts`:

1. **New Properties**:
```typescript
// Half-resolution pipeline
private useHalfRes: boolean;
private halfResReadTarget: THREE.WebGLRenderTarget | null = null;
private halfResWriteTarget: THREE.WebGLRenderTarget | null = null;
private upsampleMaterial: THREE.ShaderMaterial | null = null;
private upsampleMesh: THREE.Mesh | null = null;
private upsampleScene: THREE.Scene | null = null;
private bilateralDepthThreshold: number;
```

2. **Constructor Updates**:
```typescript
this.useHalfRes = config.halfResolution ?? true;
this.bilateralDepthThreshold = config.bilateralDepthThreshold ?? 0.02;

if (this.useHalfRes) {
  this.initHalfResPipeline();
}
```

3. **New Methods**:
- `initHalfResPipeline()`: Create upsample material/mesh/scene
- `ensureHalfResTarget(width, height)`: Create/resize half-res targets
- `executeFullRes(ctx)`: Original rendering path
- `executeHalfRes(ctx)`: New half-res rendering path
- `setHalfResolution(enabled)`: Runtime toggle
- `setBilateralDepthThreshold(threshold)`: Runtime parameter

4. **Execute Method Changes**:
```typescript
execute(ctx: RenderContext): void {
  // ... validation ...
  
  if (this.useHalfRes && this.upsampleMaterial && this.upsampleScene) {
    this.executeHalfRes(ctx);
  } else {
    this.executeFullRes(ctx);
  }
}
```

5. **Half-Res Execution Flow**:
```typescript
private executeHalfRes(ctx: RenderContext): void {
  const { renderer, size, scene, camera } = ctx;
  const colorTex = ctx.getReadTexture(this.colorInputId);
  const depthTex = ctx.getReadTexture(this.depthInputId, this.depthInputAttachment);
  const outputTarget = ctx.getWriteTarget(this.outputId);
  
  // 1. Ensure half-res targets exist
  this.ensureHalfResTarget(size.width, size.height);
  
  // 2. Get half-res dimensions
  const halfWidth = Math.floor(size.width / 2);
  const halfHeight = Math.floor(size.height / 2);
  
  // 3. Ensure GTAOPass is initialized at half resolution
  this.ensureInitialized(halfWidth, halfHeight, scene, camera);
  
  // 4. CRITICAL: Switch to AO-only output mode for half-res
  //    This gives us raw AO values instead of composited result
  this.gtaoPass.output = ThreeGTAOPass.OUTPUT.Denoise; // or OUTPUT.AO
  
  // 5. Copy input color to half-res read buffer (downsampled)
  this.copyMaterial.uniforms['tDiffuse'].value = colorTex;
  this.halfResReadTarget.viewport.set(0, 0, halfWidth, halfHeight);
  renderer.setRenderTarget(this.halfResReadTarget);
  renderer.render(this.copyScene, this.copyCamera);
  
  // 6. Run GTAOPass at half resolution - outputs AO-only
  this.halfResWriteTarget.viewport.set(0, 0, halfWidth, halfHeight);
  this.gtaoPass.render(
    renderer,
    this.halfResWriteTarget,
    this.halfResReadTarget,
    0,
    false
  );
  
  // 7. Bilateral upsample to full resolution with scene color compositing
  const upsampleUniforms = this.upsampleMaterial.uniforms;
  upsampleUniforms.tAO.value = this.halfResWriteTarget.texture;
  upsampleUniforms.tColor.value = colorTex;  // Full-res scene color
  upsampleUniforms.tDepth.value = depthTex;  // Full-res depth
  upsampleUniforms.uResolution.value.set(size.width, size.height);
  upsampleUniforms.uNearClip.value = camera.near;
  upsampleUniforms.uFarClip.value = camera.far;
  
  renderer.setRenderTarget(outputTarget);
  renderer.render(this.upsampleScene, this.copyCamera);
  renderer.setRenderTarget(null);
}

private executeFullRes(ctx: RenderContext): void {
  // ... existing logic ...
  
  // CRITICAL: Use Default output mode for full-res (composited)
  this.gtaoPass.output = ThreeGTAOPass.OUTPUT.Default;
  
  // ... rest of existing logic ...
}
```

### Phase 3: Integration Testing

1. **Unit Tests**: Extend `GTAOPass.test.ts`
2. **Playwright Tests**: Visual regression for AO quality
3. **Performance Benchmarks**: Measure frame time reduction

---

## Risk Mitigation

### Visual Quality Concerns

**Problem**: Half-res AO can appear softer and may miss fine details.

**Mitigations**:
1. **Tunable depth threshold**: Lower values = sharper edges but may show artifacts
2. **Runtime toggle**: Users can switch to full-res if quality is priority
3. **Intensity compensation**: Slightly increase AO intensity at half-res to maintain visual impact

### Edge Cases

1. **Odd resolutions**: Use `Math.floor(size / 2)` and handle minimum size of 1
2. **Camera changes**: GTAOPass gets camera near/far for linearization
3. **Scene changes**: GTAOPass is re-initialized when scene/camera refs change

### Performance Validation

Measure:
- GPU time for GTAO pass (before/after)
- Memory usage (additional half-res targets)
- Visual quality comparison screenshots

---

## Critical Bug Prevention Checklist

> 🚨 **These bugs caused SSR to be completely non-functional. DO NOT REPEAT.**

### Bug Pattern 1: Bilinear Weights Always Zero

**Root Cause**: Calculating distance weight from offset values instead of cell position.

```glsl
// ❌ WRONG - This produces (1.0, 1.0), making distWeight = 0
vec2 distToSample = abs(offsets[i]) / halfOffset;
float distWeight = (1.0 - distToSample.x) * (1.0 - distToSample.y); // ALWAYS 0!

// ✅ CORRECT - Use fractional position within the cell
vec2 cellPos = fract(vUv / halfResTexelSize);  // 0.0 to 1.0
float wx0 = 1.0 - cellPos.x;
float wx1 = cellPos.x;
float wy0 = 1.0 - cellPos.y;
float wy1 = cellPos.y;
bilinearWeights[0] = wx0 * wy0;  // Varies correctly from 0.0 to 1.0
```

**Verification**: Print/visualize `totalWeight` - it should vary smoothly, never be 0 everywhere.

### Bug Pattern 2: Wrong Blending Mode

**Root Cause**: Using additive blending instead of appropriate blend for the effect type.

| Effect Type | Correct Blending | Wrong Blending |
|-------------|------------------|----------------|
| **SSR** (reflections) | `mix(scene, reflection, alpha)` | `scene + reflection * alpha` (additive) |
| **GTAO** (occlusion) | `scene * aoFactor` (multiplicative) | `mix(scene, ao, intensity)` or additive |

```glsl
// ❌ WRONG for SSR - additive adds energy, looks washed out
fragColor = vec4(sceneColor.rgb + result.rgb * result.a, sceneColor.a);

// ✅ CORRECT for SSR - alpha blend replaces, not adds
vec3 blended = mix(sceneColor.rgb, result.rgb, result.a);
fragColor = vec4(blended, sceneColor.a);

// ✅ CORRECT for GTAO - multiplicative darkening
float aoFactor = mix(1.0, ao, uAOIntensity);
fragColor = vec4(sceneColor.rgb * aoFactor, sceneColor.a);
```

### Bug Pattern 3: Misaligned Half-Res Sampling

**Root Cause**: Not aligning sample coordinates to half-res texel centers.

```glsl
// ❌ WRONG - Samples at wrong locations
vec2 sampleUv = vUv + offsets[i];

// ✅ CORRECT - Snap to half-res grid, then sample corners
vec2 baseUv = floor(vUv / halfResTexelSize) * halfResTexelSize + halfResTexelSize * 0.5;
vec2 sampleUv = baseUv - halfResTexelSize * 0.5 + offsets[i];
```

### Implementation Verification Steps

Before considering the shader complete:

1. **Visual Test**: Render with half-res and compare to full-res
   - Effect should be visible (not just scene color)
   - Quality should be similar with slight softening

2. **Debug Visualization**: Add debug output mode
   ```glsl
   // Temporarily output totalWeight as color to verify it's non-zero
   fragColor = vec4(vec3(totalWeight), 1.0);
   ```

3. **Edge Preservation Test**: Check depth discontinuities
   - Object edges should remain sharp
   - No halos around silhouettes

4. **Intensity Test**: Vary AO intensity from 0 to 1
   - At 0: scene unchanged
   - At 1: full AO effect visible

---

## Implementation Checklist

### Phase 1: Shader Creation
- [ ] Create `GTAOBilateralUpsampleShader.ts`
- [ ] Add uniform types export
- [ ] Test shader compilation
- [ ] **VERIFY**: Bilinear weights use `cellPos`, NOT offsets
- [ ] **VERIFY**: Multiplicative blending (`color * aoFactor`)
- [ ] **VERIFY**: Sample UVs aligned to half-res grid

### Phase 2: GTAOPass Updates
- [ ] Add config interface options (`halfResolution`, `bilateralDepthThreshold`)
- [ ] Add private properties for half-res pipeline
- [ ] Implement `initHalfResPipeline()`
- [ ] Implement `ensureHalfResTarget()`
- [ ] Implement `executeFullRes()` (extract from current `execute()`)
- [ ] Implement `executeHalfRes()`
- [ ] Add runtime setters (`setHalfResolution()`, `setBilateralDepthThreshold()`)
- [ ] Update `dispose()` for cleanup
- [ ] Update JSDoc documentation

### Phase 3: Integration
- [ ] Update PostProcessingV2.tsx to pass new config
- [ ] (Optional) Add store settings for user control
- [ ] Update index.ts exports

### Phase 4: Testing & Bug Verification
- [ ] Update GTAOPass.test.ts with new test cases
- [ ] Create Playwright visual regression test
- [ ] Performance benchmark comparison
- [ ] **CRITICAL**: Visual test - AO effect visible at half-res (not just scene color)
- [ ] **CRITICAL**: Debug `totalWeight` output - must vary, never all zeros
- [ ] **CRITICAL**: Compare half-res to full-res - similar quality, slightly softer
- [ ] Edge preservation test - no halos at depth discontinuities

### Phase 5: Documentation
- [ ] Update rendering-pipeline.md
- [ ] Add inline code comments
- [ ] Document tuning parameters

---

## Performance Expectations

| Metric | Full Resolution | Half Resolution | Improvement |
|--------|-----------------|-----------------|-------------|
| Pixel count | 1920×1080 = 2.07M | 960×540 = 0.52M | **4x fewer pixels** |
| GTAO pass time | ~4ms (estimated) | ~1.5ms (estimated) | **~60% reduction** |
| Upsample overhead | 0ms | ~0.3ms | +0.3ms |
| **Net improvement** | - | - | **~50-60%** |

---

## Future Considerations

1. **Adaptive resolution**: Could implement quarter-resolution for mobile/low-end
2. **Temporal stability**: Consider temporal reprojection to reduce flickering
3. **Quality presets**: Add "High/Medium/Low" AO quality settings
4. **Normal-aware upsampling**: Include normal buffer in bilateral filter for better edge detection

---

## References

- SSRPass implementation: `src/rendering/graph/passes/SSRPass.ts`
- BilateralUpsampleShader: `src/rendering/shaders/postprocessing/BilateralUpsampleShader.ts`
- Three.js GTAOPass: `three/examples/jsm/postprocessing/GTAOPass.js`
- AMD FidelityFX CACAO: [GPUOpen reference](https://gpuopen.com/manuals/fidelityfx_sdk/fidelityfx_sdk-page_techniques_combined-adaptive-compute-ambient-occlusion/)

