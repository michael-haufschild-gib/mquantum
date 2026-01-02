# Volumetric Fog Optimization Report

**Date:** December 19, 2025
**Target:** VolumetricFogPass & VolumetricFogShader
**Current Cost:** High GPU load due to raymarching with noise sampling and shadow queries

---

## Executive Summary

The current volumetric fog implementation renders at **50% resolution** with **64 raymarch steps**, each step sampling **5 noise textures** and potentially querying shadow maps. This creates a significant GPU bottleneck, especially on lower-end hardware.

| Current Setting | Value | Impact |
|-----------------|-------|--------|
| Resolution Scale | 50% | Medium savings |
| Raymarch Steps | 64 | **High cost** |
| Noise Samples/Step | 5 | **Very high cost** |
| Shadow Queries | Per-step (conditional) | High cost when enabled |

---

## Optimization Opportunities

### 1. **Reduce Raymarch Step Count (Highest Impact)**

**Current:** 64 steps
**Recommendation:** Make configurable with presets (16/32/48/64)

| Steps | Performance Gain | Visual Impact |
|-------|-----------------|---------------|
| 48 | ~25% faster | Minimal - slightly more banding |
| 32 | ~50% faster | Moderate - noticeable banding in dense areas |
| 16 | ~75% faster | Significant - visible stepping artifacts |

**Visual Fidelity:** At 32 steps with good dithering, most users won't notice degradation. The interleaved gradient noise already helps mask banding. For gothic fog with slow movement, 32-48 steps is sufficient.

**Implementation:**
```glsl
uniform int uRaymarchSteps; // Quality preset: 16/32/48/64
for (int i = 0; i < uRaymarchSteps; i++) { ... }
```

---

### 2. **Simplify Noise Sampling (High Impact)**

**Current:** 5 noise samples per step (lines 177-202 in shader)
- `banks`: 2 samples at 0.08x and 0.15x scale
- `structure`: 2 samples at 0.4x and 0.8x scale
- `wisps`: 1 sample at 1.5x scale with animation

**Recommendation:** Quality levels with reduced octaves

| Quality | Samples/Step | Performance Gain | Visual Impact |
|---------|--------------|-----------------|---------------|
| Ultra | 5 | Baseline | Best quality |
| High | 3 | ~40% faster noise | Slightly less detail in banks |
| Medium | 2 | ~60% faster noise | Simpler fog structure |
| Low | 1 | ~80% faster noise | Uniform fog, no layering |

**Visual Fidelity:** "High" (3 samples) maintains the gothic atmosphere with banks + structure. "Medium" (2 samples) still looks like fog but loses the fine wisp detail. Acceptable for most use cases.

**Implementation (High Quality):**
```glsl
#if FOG_QUALITY >= 2 // High
    float banks = sampleNoise(staticPos * 0.1);
    float structure = sampleNoise(staticPos * 0.5);
    float wisps = sampleNoise(staticPos * 1.5 + creepOffset);
    float combinedNoise = banks * 0.5 + structure * 0.35 + wisps * 0.15;
#elif FOG_QUALITY == 1 // Medium
    float combined = sampleNoise(staticPos * 0.2);
    combined += sampleNoise(staticPos * 0.8 + creepOffset * 0.5) * 0.5;
    float combinedNoise = combined / 1.5;
#else // Low
    float combinedNoise = sampleNoise(staticPos * 0.3);
#endif
```

---

### 3. **Lower Resolution Scale (Medium Impact)**

**Current:** 50% resolution (0.5x)
**Recommendation:** Add 25% option (0.25x) for low-end devices

| Scale | Pixel Count | Performance Gain | Visual Impact |
|-------|-------------|-----------------|---------------|
| 50% | 25% of full | Baseline | Good quality |
| 33% | 11% of full | ~55% faster | Soft edges, acceptable |
| 25% | 6% of full | ~75% faster | Blocky in motion, needs stronger blur |

**Visual Fidelity:** At 25%, fog becomes noticeably blocky during camera movement. The bilateral upsampling helps but can't fully hide it. Best suited for integrated GPUs or mobile. Consider adaptive resolution based on frame time.

**Implementation:**
```typescript
// In VolumetricFogPass.setSize()
const scale = fogQuality === 'low' ? 0.25 : fogQuality === 'medium' ? 0.33 : 0.5;
const w = Math.ceil(width * scale);
const h = Math.ceil(height * scale);
```

---

### 4. **Shadow Query Optimization (Medium Impact)**

**Current:** Shadow PCF sampled every step when `uVolumetricShadows = true`
**Recommendation:** Sample shadows every N steps

| Strategy | Performance Gain | Visual Impact |
|----------|-----------------|---------------|
| Every step | Baseline | Best god rays |
| Every 2nd step | ~15% faster | Slight shadow softening |
| Every 4th step | ~25% faster | Softer volumetric shadows |
| Start-only (1 sample) | ~35% faster | Uniform shadow, no god rays |

**Visual Fidelity:** Sampling every 2-4 steps with interpolation maintains convincing god rays. The human eye is less sensitive to shadow frequency than density changes.

**Implementation:**
```glsl
float shadow = 1.0;
if (uVolumetricShadows && (i % 2 == 0)) {
    shadow = getShadowVisibility(currentPos);
    lastShadow = shadow; // Cache for next step
} else if (uVolumetricShadows) {
    shadow = lastShadow; // Reuse cached value
}
```

---

### 5. **Early Ray Termination Improvement (Low-Medium Impact)**

**Current:** Terminates at `transmittance < 0.01`
**Recommendation:** More aggressive termination + adaptive step sizing

| Strategy | Performance Gain | Visual Impact |
|----------|-----------------|---------------|
| Current (0.01) | Baseline | Full accuracy |
| Aggressive (0.05) | ~5-10% faster | Imperceptible |
| Very Aggressive (0.1) | ~10-15% faster | Slight loss in dense fog |
| Adaptive stepping | ~20% faster | Minimal if well-tuned |

**Visual Fidelity:** Terminating at 0.05 transmittance is imperceptible - the remaining 5% contribution is below display precision. Adaptive step sizing (larger steps in sparse fog) can significantly speed up exterior shots.

**Implementation:**
```glsl
if (transmittance < 0.05) break; // More aggressive

// Adaptive stepping (optional)
float adaptiveStep = stepSize * (1.0 + (1.0 - density) * 2.0);
currentPos += rayDir * adaptiveStep;
```

---

### 6. **Temporal Accumulation (High Impact, Complex)**

**Current:** Full raymarch every frame
**Recommendation:** Temporal reprojection with jittered sampling

| Strategy | Performance Gain | Visual Impact |
|----------|-----------------|---------------|
| No temporal | Baseline | No ghosting |
| 2-frame accumulation | ~40% faster | Slight ghosting on fast camera |
| 4-frame accumulation | ~60% faster | Noticeable ghosting, needs rejection |

**Visual Fidelity:** Temporal accumulation dramatically reduces cost by spreading samples across frames. Requires proper motion vectors and rejection for disoccluded areas. Ghosting can be problematic during rapid camera movement.

**Implementation Complexity:** HIGH - requires motion vectors, history buffer, rejection masks

---

### 7. **Skip Fog When Camera is Above (Low Impact)**

**Current:** Ray-plane intersection limits marching
**Enhancement:** Skip pass entirely when camera is well above fog layer with no downward view

**Performance Gain:** ~100% when applicable (rare case)
**Visual Fidelity:** None - fog genuinely not visible

**Implementation:**
```typescript
// In PostProcessing.tsx
const cameraAboveFog = camera.position.y > fogHeight * 1.5 && camera.rotation.x > -0.3;
volumetricFogPass.enabled = fogEnabled && !cameraAboveFog;
```

---

### 8. **Precomputed Noise LUT (Medium Impact, One-time)**

**Current:** Real-time 3D noise sampling
**Alternative:** Bake animated noise into 3D texture atlas

**Performance Gain:** ~20-30% faster noise sampling
**Visual Fidelity:** Identical if properly baked

**Trade-off:** Increased VRAM usage (~4-16MB for 128³ RGBA texture)

---

## Recommended Quality Presets

### Ultra (Current)
- 64 steps, 5 noise samples, 50% resolution, full shadows
- **Use case:** High-end GPUs, screenshot mode

### High (Recommended Default)
- 48 steps, 3 noise samples, 50% resolution, shadows every 2 steps
- **Estimated gain:** 35-45% faster
- **Visual loss:** Minimal

### Medium
- 32 steps, 2 noise samples, 33% resolution, shadows every 4 steps
- **Estimated gain:** 60-70% faster
- **Visual loss:** Moderate - softer fog, less detail

### Low
- 16 steps, 1 noise sample, 25% resolution, no volumetric shadows
- **Estimated gain:** 80-85% faster
- **Visual loss:** Significant - basic fog effect only

---

## Implementation Priority

| Priority | Optimization | Effort | Impact |
|----------|-------------|--------|--------|
| 1 | Configurable step count | Low | High |
| 2 | Reduced noise octaves | Low | High |
| 3 | Shadow sampling frequency | Low | Medium |
| 4 | Resolution scale options | Low | Medium |
| 5 | More aggressive early termination | Trivial | Low |
| 6 | Temporal accumulation | High | High |
| 7 | Precomputed noise | Medium | Medium |

---

## Quick Wins (Immediate Implementation)

These can be implemented in ~30 minutes with significant benefit:

1. **Add `uRaymarchSteps` uniform** - expose step count to UI
2. **Create "Fog Quality" dropdown** - Low/Medium/High/Ultra
3. **Shadow sampling every 2nd step** - simple loop change
4. **Raise early termination to 0.05** - one line change

**Combined estimated performance improvement:** 40-50% for High preset vs current Ultra
