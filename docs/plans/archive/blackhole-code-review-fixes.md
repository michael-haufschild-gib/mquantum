# Black Hole Code Review Fixes Plan

Implementation plan for 17 issues identified in code review.

---

## Batch 1: Critical Safety

### Fix #3: N-D Array Bounds Compile-Time Guard

**File:** `src/rendering/shaders/blackhole/nd/embedding.glsl.ts`

**Problem:** float[11] arrays break silently if DIMENSION > 11

**Change:** Add at top of `embeddingBlock`:
```glsl
#if DIMENSION > 11
#error "DIMENSION must not exceed 11 for N-D array operations"
#endif
```

**Test:** Verify shader compilation fails with DIMENSION=12

---

### Fix #2: Memory Leak - Material Disposal

**File:** `src/rendering/renderers/BlackHole/BlackHoleMesh.tsx`

**Problem:** When shader recompiles (mode/dimension change), old material is not disposed

**Change:** Add cleanup in shader compilation useEffect:
```typescript
useEffect(() => {
  // ... existing shader compilation logic ...

  return () => {
    if (materialRef.current) {
      materialRef.current.dispose();
    }
  };
}, [dimension, raymarchMode, sliceAnimationEnabled, temporalEnabled]);
```

**Test:** Verify no WebGL memory warnings after multiple mode switches

---

### Fix #6: Division by Zero in Doppler

**File:** `src/rendering/shaders/blackhole/color/doppler.glsl.ts`

**Problem:** Division without epsilon protection risks NaN/Inf

**Change:** Add epsilon to denominators:
```glsl
const float DOPPLER_EPSILON = 0.0001;

float computeDopplerFactor(float r, float velocity) {
  float safeR = max(r, DOPPLER_EPSILON);
  // ... rest of calculation using safeR ...
}
```

**Test:** Verify no visual artifacts at r=0

---

## Batch 2: Shader Output Fixes

### Fix #1: MRT Output Declarations

**File:** `src/rendering/shaders/blackhole/main.glsl.ts`

**Problem:** gColor, gNormal, gPosition used without layout declarations

**Change:** Add at top of fragment shader after precision:
```glsl
// MRT outputs for temporal accumulation
layout(location = 0) out vec4 gColor;
layout(location = 1) out vec4 gNormal;
layout(location = 2) out vec4 gPosition;
```

**Note:** Remove any conflicting gl_FragColor usage

**Test:** Verify MRT outputs render correctly to temporal buffer

---

### Fix #8: Undefined gPosition When Temporal Disabled

**File:** `src/rendering/shaders/blackhole/main.glsl.ts`

**Problem:** gPosition not set when temporal accumulation off, causing undefined behavior

**Change:** Always write all MRT outputs:
```glsl
void main() {
  // ... raymarching ...

  gColor = vec4(finalColor, 1.0);

  #ifdef USE_TEMPORAL
    gNormal = vec4(normal * 0.5 + 0.5, 1.0);
    gPosition = vec4(worldPos, depth);
  #else
    gNormal = vec4(0.0, 0.0, 1.0, 1.0);  // default up normal
    gPosition = vec4(0.0);
  #endif
}
```

**Test:** Verify no WebGL errors when toggling temporal mode

---

### Fix #5: Consistent Noise Function

**File:** `src/rendering/shaders/blackhole/main.glsl.ts`

**Problem:** Inline noise duplicates shared utility

**Change:**
1. Check if `src/rendering/shaders/common/noise.glsl.ts` exists
2. Import shared noise in compose.ts
3. Replace inline noise with shared version

**Fallback:** If no shared noise exists, document the inline version

**Test:** Visual comparison before/after to ensure identical output

---

## Batch 3: Code Quality

### Fix #4: Redundant Dimension Check

**File:** `src/rendering/renderers/BlackHole/BlackHoleMesh.tsx`

**Problem:** Dimension bounds checking runs every frame in useFrame

**Change:** Move validation to shader compilation useMemo:
```typescript
const validatedDimension = useMemo(() => {
  const clamped = Math.min(Math.max(dimension, 3), 11);
  if (clamped !== dimension && process.env.NODE_ENV === 'development') {
    console.warn(`BlackHole: dimension clamped from ${dimension} to ${clamped}`);
  }
  return clamped;
}, [dimension]);
```

Use `validatedDimension` in shader defines instead of runtime check.

**Test:** Verify dimension=12 gets clamped with warning

---

### Fix #9: Null Checks on Type Assertions

**File:** `src/rendering/renderers/BlackHole/BlackHoleMesh.tsx`

**Problem:** Uniform access like `uniforms.uTime.value` may fail if uniform missing

**Change:** Add null checks in useFrame:
```typescript
useFrame(({ clock }) => {
  const uniforms = materialRef.current?.uniforms;
  if (!uniforms) return;

  uniforms.uTime?.value = clock.getElapsedTime();
  uniforms.uCameraPosition?.value?.copy(camera.position);
  // ... etc for all uniform updates
});
```

**Test:** No runtime errors when uniforms are undefined

---

### Fix #7: Extract Shared Raymarching Logic

**File:** `src/rendering/shaders/blackhole/main.glsl.ts`

**Problem:** raymarchBlackHole and raymarchBlackHoleND duplicate accumulation logic

**Change:** Extract shared helper:
```glsl
/**
 * Accumulates emission into raymarch result
 */
void accumulateEmission(
  inout RaymarchResult result,
  vec3 emission,
  float density,
  float stepSize
) {
  float alpha = 1.0 - exp(-density * stepSize);
  result.color += emission * alpha * result.transmittance;
  result.transmittance *= exp(-density * stepSize);
}
```

Call from both raymarch functions.

**Test:** Visual comparison to ensure identical output

---

## Batch 4: Documentation & Polish

### Fix #10: JSDoc for N-D Math

**Files:** `embedding.glsl.ts`, `lensing.glsl.ts`

**Change:** Add TSDoc comments:
```typescript
/**
 * N-Dimensional Embedding Functions
 *
 * Embeds 3D rays into N-dimensional space using spherical coordinate extension.
 * Higher dimensions are mapped via time-modulated rotation angles.
 *
 * @mathematical For dimension d > 3, position[d] = sin(time * (d-2) * 0.1) * ||pos3||
 *
 * @constraint DIMENSION must be <= 11 due to fixed-size float[11] arrays
 */
export const embeddingBlock = /* glsl */ `...`
```

---

### Fix #11: Named Constants for Magic Numbers

**Files:** Multiple shader files

**Change:** Replace magic numbers:
```glsl
// In a new constants block or at top of relevant files
const float EPSILON = 0.0001;
const float PHOTON_SPHERE_RATIO = 1.5;      // r_photon = 1.5 * r_schwarzschild
const float EINSTEIN_RING_WIDTH = 0.3;       // fraction of horizon radius
const float MAX_LENSING_DEFLECTION = 0.5;    // prevents extreme distortion
const int DEFAULT_RAYMARCH_STEPS = 128;
```

---

### Fix #15: Dev Warnings for Silent Clamping

**File:** `src/stores/slices/geometry/blackholeSlice.ts`

**Change:** Add warnings in setters:
```typescript
setHorizonRadius: (value: number) => {
  const clamped = Math.max(0.1, Math.min(value, 10.0));
  if (process.env.NODE_ENV === 'development' && clamped !== value) {
    console.warn(`BlackHole: horizonRadius clamped from ${value} to ${clamped}`);
  }
  set({ horizonRadius: clamped });
},
```

---

### Fix #16: ARIA Labels

**File:** `src/components/sections/Advanced/AdvancedObjectControls.tsx`

**Change:** Add accessibility attributes:
```tsx
<select
  aria-label="Raymarch mode selection"
  value={config.raymarchMode}
  onChange={...}
>
```

Apply to all interactive controls in the black hole section.

---

## Batch 5: Optimization & Tests

### Fix #17: Array Fill Optimization

**File:** `src/rendering/shaders/blackhole/nd/embedding.glsl.ts`

**Problem:** Loops to zero-fill arrays when initializer is more efficient

**Change:** Use array initializers where GLSL ES 3.0 allows:
```glsl
void zeroND(out float v[11]) {
  v = float[11](0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
}
```

**Note:** Test on target GPUs - some drivers may not optimize this better than loops

---

### Fix #13: N-D Embedding Math Tests

**File:** `src/tests/rendering/shaders/blackhole/embedding.test.ts` (NEW)

**Tests to add:**
```typescript
describe('N-D Embedding Math', () => {
  it('lengthND returns correct Euclidean distance', () => {
    // Test known vectors
  });

  it('normalizeND produces unit vector', () => {
    // Test ||normalize(v)|| === 1
  });

  it('embedRay3DtoND preserves 3D direction', () => {
    // First 3 components match input direction
  });

  it('projectNDto3D extracts first 3 components', () => {
    // Verify round-trip for 3D subset
  });
});
```

---

## Batch 6: Refactoring

### Fix #12: Split BlackHoleMesh Into Hooks

**Current:** `BlackHoleMesh.tsx` at 586 lines

**Extract to:**
- `hooks/useBlackHoleUniforms.ts` - Uniform initialization and per-frame updates
- `hooks/useBlackHoleShader.ts` - Shader compilation with memoization
- `hooks/useBlackHoleGeometry.ts` - Geometry and mesh creation

**Final BlackHoleMesh.tsx:** ~150 lines, just composition

**Dependencies:** Complete after #2, #4, #9 are done

---

### Fix #14: Integrate Deferred Lensing

**Files:**
- `src/rendering/shaders/postprocessing/DeferredLensingShader.ts`
- `src/rendering/renderers/BlackHole/BlackHoleMesh.tsx`

**Current status:** Shader created but not wired into render pipeline

**Options:**
1. **Integrate now:** Add post-processing pass when `deferredLensingEnabled` is true
2. **Defer:** Add TODO comment explaining deferred lensing is for future multi-object scenes

**Recommended:** Option 2 (defer) - add TODO explaining the intended use case

---

## Summary

| Batch | Fixes | Focus |
|-------|-------|-------|
| 1 | #3, #2, #6 | Critical safety |
| 2 | #1, #8, #5 | Shader outputs |
| 3 | #4, #9, #7 | Code quality |
| 4 | #10, #11, #15, #16 | Documentation |
| 5 | #17, #13 | Optimization & tests |
| 6 | #12, #14 | Refactoring |

**Estimated test coverage additions:** 4 new test files, ~25 new test cases
