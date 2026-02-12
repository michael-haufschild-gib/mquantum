
# Comprehensive Code Review: Schroedinger Renderer

## Executive Summary

This review identifies **critical performance issues** in the Schroedinger renderer, including the specific bug where deactivating all rotation planes causes frame rate drops instead of improvements. The root causes span from React component architecture, shader design, state management, and the animation/rotation coupling.

---

## 2. SHADER PERFORMANCE ISSUES

### 2.1 Redundant Wavefunction Evaluations

**Location**: `psi.wgsl.ts` lines 190-227

For Hydrogen ND mode, the `evalPsiWithSpatialPhase` function evaluates the wavefunction TWICE:

```wgsl
if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
    // We call twice: once with t for density, once with 0 for spatial phase
    vec2 psiTime;
    vec2 psiSpatial;
    #if HYDROGEN_ND_DIMENSION == 4
    psiTime = evalHydrogenNDPsi4D(xND, t);
    psiSpatial = evalHydrogenNDPsi4D(xND, 0.0);  // <-- REDUNDANT!
    #endif
    // ...
}
```

Each `evalHydrogenNDPsi*D` function is expensive (~20-50 ALU operations). The spatial phase is computed SEPARATELY from the time-dependent phase even though for a single-orbital hydrogen atom, the phase is simply a time offset.

**For harmonic oscillator mode** (lines 229-254), this is properly optimized to compute both in one loop. The ND hydrogen mode should follow the same pattern.

### 2.2 Density Sampling is Called Multiple Times Per Ray Step

**Location**: `integration.wgsl.ts`, `emission.wgsl.ts`

In `volumeRaymarchHQ`, each step samples density:
```wgsl
vec3 densityInfo = sampleDensityWithPhase(pos, animTime);
```

Then `computeEmissionLit` is called, which internally may call `sampleDensity` again for:
1. Self-shadowing (up to 8 additional samples per light) - lines 240-248 in emission.wgsl.ts
2. AO (up to 8 additional samples) - lines 286-302 in emission.wgsl.ts

**Per-step worst case**:
- 1 density sample for color
- 8 shadow samples × number of lights
- 8 AO samples

For 3 lights with shadows+AO enabled: **1 + 24 + 8 = 33 density samples per step**.

With 64 steps: **2,112 density samples per ray**.

### 2.3 Gradient Computation Uses Forward Differences but Still Expensive

**Location**: `integration.wgsl.ts` lines 67-73

```wgsl
// OPTIMIZED: Use forward differences with pre-computed center value
vec3 computeDensityGradientFast(vec3 pos, float t, float delta, float sCenter) {
    float sxp = sFromRho(sampleDensity(pos + vec3(delta, 0.0, 0.0), t));
    float syp = sFromRho(sampleDensity(pos + vec3(0.0, delta, 0.0), t));
    float szp = sFromRho(sampleDensity(pos + vec3(0.0, 0.0, delta), t));
    return vec3(sxp - sCenter, syp - sCenter, szp - sCenter) / delta;
}
```

This is **3 additional density samples per step** for gradient. This is called in the main loop.

### 2.4 Dispersion Mode Multiplies Sampling Cost

**Location**: `integration.wgsl.ts` lines 261-275

When dispersion is enabled in HQ mode:
```wgsl
if (useFullSampling) { // High Quality: Full Sampling
    vec3 dInfoR = sampleDensityWithPhase(pos + dispOffsetR, animTime);
    vec3 dInfoB = sampleDensityWithPhase(pos + dispOffsetB, animTime);
    rhoRGB.r = dInfoR.x;
    rhoRGB.b = dInfoB.x;
}
```

This adds **2 more density samples per step**.

### 2.5 Flow Distortion Applied on Every Sample

**Location**: `density.wgsl.ts` lines 261-265

```wgsl
float sampleDensity(vec3 pos, float t) {
    // Apply Animated Flow (Curl Noise)
    vec3 flowedPos = applyFlow(pos, t);
    // ...
}
```

When `curlEnabled`, `applyFlow` calls `curlNoise` which internally calls `distortPosition` which calls `gradientNoise` multiple times.

In `density.wgsl.ts` lines 153-199, `curlNoise` does:
```wgsl
vec3 curlNoise(vec3 p) {
    const float e = 0.1;
    // ...multiple gradientNoise calls...
}
```

**Each `gradientNoise` call is 8 hash lookups + 8 dot products + trilinear interpolation.**

---

## 3. COMPONENT ARCHITECTURE ISSUES

### 3.1 Zustand Selector Not Optimized for `parameterValues`

**Location**: `SchroedingerMesh.tsx` line 103

```typescript
const parameterValues = useExtendedObjectStore((state) => state.schroedinger.parameterValues);
```

**Issue**: This selector returns a reference to the array. When ANY schroedinger property changes, the parent object changes, causing re-subscription evaluation. While the array reference itself is stable, the component may still re-render unnecessarily.

**Should use `useShallow` for proper shallow comparison:**
```typescript
const parameterValues = useExtendedObjectStore(
  useShallow((state) => state.schroedinger.parameterValues)
);
```

Wait - according to the workspace rules, `useShallow` cannot be called as an argument to another hook in React 19/Zustand 5. The correct pattern is:

```typescript
const selectParamValues = useShallow((state: ExtendedObjectState) => state.schroedinger.parameterValues);
const parameterValues = useExtendedObjectStore(selectParamValues);
```

### 3.2 Multiple Individual Store Subscriptions

**Location**: `SchroedingerMesh.tsx` lines 265-271

```typescript
const curlEnabled = useExtendedObjectStore((state) => state.schroedinger.curlEnabled);
const dispersionEnabled = useExtendedObjectStore((state) => state.schroedinger.dispersionEnabled);
const nodalEnabled = useExtendedObjectStore((state) => state.schroedinger.nodalEnabled);
const energyColorEnabled = useExtendedObjectStore((state) => state.schroedinger.energyColorEnabled);
const shimmerEnabled = useExtendedObjectStore((state) => state.schroedinger.shimmerEnabled);
const erosionStrength = useExtendedObjectStore((state) => state.schroedinger.erosionStrength);
```

**Each of these is a separate Zustand subscription.** When ANY schroedinger state changes, ALL of these re-evaluate (even if the specific value didn't change). This creates unnecessary work.

**Should batch with `useShallow`:**
```typescript
const features = useExtendedObjectStore(
  useShallow((state) => ({
    curlEnabled: state.schroedinger.curlEnabled,
    dispersionEnabled: state.schroedinger.dispersionEnabled,
    nodalEnabled: state.schroedinger.nodalEnabled,
    energyColorEnabled: state.schroedinger.energyColorEnabled,
    shimmerEnabled: state.schroedinger.shimmerEnabled,
    erosionStrength: state.schroedinger.erosionStrength,
  }))
);
```

### 3.3 Shader Recompilation Dependencies Too Broad

**Location**: `SchroedingerMesh.tsx` lines 283-305

```typescript
const { glsl: shaderString, modules, features } = useMemo(() => {
  const result = composeSchroedingerShader({
    dimension,
    shadows: true,
    temporal: temporalEnabled && isoEnabled,
    temporalAccumulation: useTemporalAccumulation,
    // ...many options...
  });
  return result;
}, [dimension, temporalEnabled, shaderOverrides, isoEnabled, useTemporalAccumulation,
    quantumMode, sssEnabled, edgesVisible, curlEnabled, dispersionEnabled,
    nodalEnabled, energyColorEnabled, shimmerEnabled, erosionEnabled]);
```

The `useMemo` has **14 dependencies**. Any change to these triggers a full shader recompilation which can cause stuttering.

---

## 4. VOLUMETRIC LOOP INEFFICIENCIES

### 4.1 MAX_VOLUME_SAMPLES Loop Bound vs Actual Sample Count

**Location**: `integration.wgsl.ts` lines 108-109, 231-232

```wgsl
for (int i = 0; i < MAX_VOLUME_SAMPLES; i++) {
    if (i >= sampleCount) break;
    // ...
}
```

On most GPUs, the loop is unrolled to `MAX_VOLUME_SAMPLES` (128) iterations, with early breaks. Some GPU architectures (especially mobile/lower-end) may not efficiently break out of unrolled loops, causing all 128 iterations to execute (with most being no-ops).

### 4.2 Transmittance Check Per Channel in HQ Mode

**Location**: `integration.wgsl.ts` lines 233-234

```wgsl
// Exit if ALL channels are blocked
if (transmittance.r < MIN_TRANSMITTANCE && transmittance.g < MIN_TRANSMITTANCE && transmittance.b < MIN_TRANSMITTANCE) break;
```

This requires checking 3 conditions per iteration. Could use a simpler `max(max(transmittance.r, transmittance.g), transmittance.b) < MIN_TRANSMITTANCE`.

### 4.3 No Adaptive Step Size

The step length is fixed: `float stepLen = (tFar - tNear) / float(sampleCount);`

High-density regions could use shorter steps for accuracy, while low-density regions could use longer steps for speed. This is a common optimization in production volume renderers.

---

## 5. QUANTUM MATH INEFFICIENCIES

### 5.1 Hermite Polynomial Unrolling is Sub-Optimal

**Location**: `hermite.wgsl.ts` lines 72-98

```wgsl
if (n == 2) {
    result = result * u + HERMITE_COEFFS[offset + 1];
    result = result * u + HERMITE_COEFFS[offset];
} else if (n == 3) {
    // ...
} // etc.
```

This creates a **6-way branch** for n=0 through n=6. On GPUs, branches cause divergence. Since `n` is uniform per wavefunction term but terms have different n values, threads in a warp may diverge.

**Better approach**: Use the polynomial directly without branching, or use a switch statement which some compilers optimize better.

### 5.2 HO1D Early Exit May Cause Divergence

**Location**: `ho1d.wgsl.ts` lines 62-73

```wgsl
// OPTIMIZATION: Early exit for points outside 3σ Gaussian envelope
float distSq = 0.0;
for (int j = 0; j < MAX_DIM; j++) {
    if (j >= dim) break;
    float alpha = sqrt(max(uOmega[j], 0.01));
    float u = alpha * xND[j];
    distSq += u * u;
}
if (distSq > 18.0) return 0.0;  // <-- Early exit
```

This early exit causes **thread divergence** within a warp. Half the threads may exit early while others continue, causing the early-exiting threads to idle.

### 5.3 N-Dimensional Coordinate Transform Per Sample

**Location**: `density.wgsl.ts` lines 266-284

```wgsl
// Map 3D position to ND coordinates
float xND[MAX_DIM];
for (int j = 0; j < MAX_DIM; j++) {
    if (j >= uDimension) {
        xND[j] = 0.0;
    } else {
        xND[j] = uOrigin[j]
               + flowedPos.x * uBasisX[j]
               + flowedPos.y * uBasisY[j]
               + flowedPos.z * uBasisZ[j];
    }
}

// Scale coordinates by field scale
for (int j = 0; j < MAX_DIM; j++) {
    if (j >= uDimension) break;
    xND[j] *= uFieldScale;
}
```

This is **two loops with branch-per-iteration** for coordinate transformation. The loops iterate to MAX_DIM (11) even for 3D or 4D. Should unroll for common dimensions or use compile-time dimension dispatch.

---

## 6. UNIFORM UPDATE OVERHEAD

### 6.1 Excessive Uniform Checks Per Frame

**Location**: `SchroedingerMesh.tsx` lines 376-635 (useFrame callback)

The `useFrame` callback has approximately **100+ conditional uniform updates**:

```typescript
if (material.uniforms.uTime) material.uniforms.uTime.value = accumulatedTime;
if (material.uniforms.uResolution) material.uniforms.uResolution.value.set(size.width, size.height);
// ... 100+ more
```

Each `if (material.uniforms.X)` check is an object property lookup. While individually cheap, 100+ lookups per frame adds up.

**Better**: Validate uniforms exist once on material creation, then update directly:

```typescript
const u = material.uniforms; // Single lookup
u.uTime.value = accumulatedTime;
u.uResolution.value.set(size.width, size.height);
// etc.
```

### 6.2 Color Conversion Every Frame

**Location**: `SchroedingerMesh.tsx` lines 544-548, 573-580

```typescript
if (material.uniforms.uSssColor) {
    updateLinearColorUniform(cache.faceColor, material.uniforms.uSssColor.value assssColor || '#ff8844');
}
```

The `updateLinearColorUniform` function parses hex strings and converts sRGB to linear RGB. This should only happen when the color value actually changes, not every frame.

### 6.3 Quantum Preset Regeneration Check Every Frame

**Location**: `SchroedingerMesh.tsx` lines 461-513

```typescript
const needsPresetRegen =
  !prevQuantumConfigRef.current ||
  prevQuantumConfigRef.current.presetName !== currentConfig.presetName ||
  prevQuantumConfigRef.current.seed !== currentConfig.seed ||
  // ... 4 more comparisons
```

This check runs every frame even though quantum config rarely changes during playback. Should debounce or use version counters.

---

## 7. MEMORY ALLOCATION CONCERNS

### 7.1 Object Spread in Zustand Selectors

The schroedingerSlice creates new objects on every state update:

```typescript
set((state) => ({
  schroedinger: { ...state.schroedinger, someProperty: newValue },
}))
```

This is correct for immutability but means every setter creates a new `schroedinger` object, triggering subscriber re-evaluations.

### 7.2 Working Array Recreation

**Location**: `useRotationUpdates.ts` line 147

```typescript
const workingArraysRef = useRef<WorkingArrays>(createWorkingArrays());
```

`createWorkingArrays()` allocates Float32Arrays on hook initialization. This is fine, but if the component remounts frequently (e.g., from shader recompilation), these allocations add up.

---

## 8. SPECIFIC BUG: DEACTIVATING ROTATIONS DROPS FRAME RATE

### Summary of the Bug

When animations are playing and all rotation planes are deactivated:

1. **`animationStore.animatingPlanes` becomes empty**
2. **BUT `animationStore.isPlaying` remains true**
3. **`accumulatedTime` continues to increment via `updateAccumulatedTime`**
4. **The wavefunction time evolution continues** (`uTime * uTimeScale`)
5. **`rotationStore.version` may still increment** if the animation loop calls `updateRotations` with an empty map
6. **Quality tracking interprets version changes as "rotation happening"**
7. **`fastMode` remains true** (or toggles repeatedly)
8. **Shader may toggle between fast/HQ modes**, causing stuttering
9. **If fastMode is false**, the full HQ path runs with maximum samples

### The Paradox

When rotations are ACTIVE:
- `fastMode = true` (due to rotation version changes)
- Shader uses reduced samples
- Frame rate is reasonable

When rotations are DEACTIVATED:
- Rotation version stops incrementing (no rotations to apply)
- `fastMode = false` after QUALITY_RESTORE_DELAY_MS (300ms)
- Shader switches to FULL quality with maximum samples
- Frame rate drops because the full HQ shader is more expensive

**The frame rate drop is caused by the quality system restoring HIGH quality when rotations stop**, not by any rotation calculation overhead. The wavefunction animation continues at full quality.

---

## 9. RECOMMENDATIONS

### Critical Fixes (Immediate)

1. **Separate rotation changes from animation time changes** in the version tracking system
2. **Don't increment rotationStore.version** when applying empty rotation updates
3. **Add animation-aware quality tracking** that stays in fast mode while `isPlaying && accumulatedTime` is changing
4. **Batch Zustand subscriptions** using `useShallow` properly

### Performance Optimizations (High Priority)

1. **Reduce density samples per step** by caching gradient and reusing for shadows/AO
2. **Implement adaptive step sizing** based on local density
3. **Use dimension-specific loop bounds** (compile-time or runtime clamped) instead of MAX_DIM iterations
4. **Cache quantum preset uniform arrays** and only update when preset actually changes

### Shader Optimizations (Medium Priority)

1. **Eliminate redundant `evalHydrogenNDPsi*D` call** for spatial phase
2. **Use `max()` for transmittance early-exit** instead of 3 separate comparisons
3. **Consider loop tiling** for volume integration to improve cache coherency
4. **Pre-compute basis transformation matrix** on CPU and pass as uniform instead of per-sample computation

### Architecture Improvements (Long Term)

1. **Separate wavefunction animation from rotation animation** in state management
2. **Implement proper dirty tracking** for shader compilation dependencies
3. **Add frame budget system** that dynamically adjusts sample count to hit target frame rate
4. **Consider WebGPU compute shaders** for wavefunction evaluation (when supported)

---

## 10. CONCLUSION

The performance degradation when deactivating rotation planes is primarily caused by the **quality system restoring full quality** when it detects "no rotation activity", while the **wavefunction animation continues at full cost**. This is a design flaw in how the quality tracking system interprets "rotation" vs "animation" states.

Secondary factors include:
- Excessive density samples per ray step (up to 2,112 with all features enabled)
- Sub-optimal loop bounds and branching in quantum math
- Per-frame overhead in uniform updates and state checks
- Zustand subscription patterns causing unnecessary component evaluations

The fix requires decoupling "rotation animation quality" from "wavefunction animation quality" and ensuring the quality system understands that wavefunction time evolution is equally expensive regardless of rotation state.
