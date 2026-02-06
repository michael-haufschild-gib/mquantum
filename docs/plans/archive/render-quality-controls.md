# Render Quality Controls for Mandelbulb and Julia

## Summary
Add `sdfMaxIterations` and `sdfSurfaceDistance` parameters to Mandelbulb and Julia configs. These are exposed via UI sliders in a "Render Quality" control group. These parameters control ONLY Mandelbulb and Julia shaders - Schroedinger and Blackhole are completely unaffected.

## Performance Guarantee
- **Default values = current LQ values** (30 iterations, 0.002 surface distance)
- Same value = same performance (no regression)
- No new branching patterns

## Store Properties

### MandelbulbConfig
```typescript
sdfMaxIterations: number    // Default: 30 (current LQ)
sdfSurfaceDistance: number  // Default: 0.002
```

### QuaternionJuliaConfig
```typescript
sdfMaxIterations: number    // Default: 30 (current LQ)
sdfSurfaceDistance: number  // Default: 0.002
```

## Shader Uniforms (Mandelbulb & Julia ONLY)

```glsl
uniform float uSdfMaxIterations;    // From store
uniform float uSdfSurfaceDistance;  // From store
```

These uniforms are added to Mandelbulb and Julia shaders ONLY. Schroedinger continues using MAX_ITER_LQ/HQ constants unchanged.

## Implementation

### 1. Types (`src/lib/geometry/extended/types.ts`)

Add to `MandelbulbConfig`:
```typescript
sdfMaxIterations: number      // SDF iteration limit (10-200, default 30)
sdfSurfaceDistance: number    // Surface hit threshold (0.0005-0.01, default 0.002)
```

Add to `QuaternionJuliaConfig`:
```typescript
sdfMaxIterations: number      // SDF iteration limit (10-200, default 30)
sdfSurfaceDistance: number    // Surface hit threshold (0.0005-0.01, default 0.002)
```

Update defaults:
```typescript
DEFAULT_MANDELBULB_CONFIG = {
  ...existing,
  sdfMaxIterations: 30,
  sdfSurfaceDistance: 0.002,
}

DEFAULT_QUATERNION_JULIA_CONFIG = {
  ...existing,
  sdfMaxIterations: 30,
  sdfSurfaceDistance: 0.002,
}
```

### 2. Store Slices

**mandelbulbSlice.ts** - Add setters:
```typescript
setMandelbulbSdfMaxIterations: (value: number) => void
setMandelbulbSdfSurfaceDistance: (value: number) => void
```

**quaternionJuliaSlice.ts** - Add setters:
```typescript
setQuaternionJuliaSdfMaxIterations: (value: number) => void
setQuaternionJuliaSdfSurfaceDistance: (value: number) => void
```

### 3. Shader - Mandelbulb Dispatch (`src/rendering/shaders/mandelbulb/dispatch.glsl.ts`)

```glsl
float GetDist(vec3 pos) {
    float pwr = getEffectivePower();
    float bail = max(uEscapeRadius, 2.0);
    int maxIt = uFastMode ? min(int(uSdfMaxIterations), 30) : int(uSdfMaxIterations);
    return ${simpleSdfName}(${args});
}

float GetDistWithTrap(vec3 pos, out float trap) {
    float pwr = getEffectivePower();
    float bail = max(uEscapeRadius, 2.0);
    int maxIt = uFastMode ? min(int(uSdfMaxIterations), 30) : int(uSdfMaxIterations);
    return ${sdfName}(${argsTrap});
}
```

### 4. Shader - Julia Dispatch (`src/rendering/shaders/julia/dispatch.glsl.ts`)

```glsl
float GetDist(vec3 pos) {
    float pwr = getEffectivePower();
    float bail = max(uEscapeRadius, 2.0);
    int maxIt = uFastMode ? min(int(uSdfMaxIterations), 30) : int(uSdfMaxIterations);
    return sdfJulia3D_simple(pos, pwr, bail, maxIt);
}

float GetDistWithTrap(vec3 pos, out float trap) {
    float pwr = getEffectivePower();
    float bail = max(uEscapeRadius, 2.0);
    int maxIt = uFastMode ? min(int(uSdfMaxIterations), 30) : int(uSdfMaxIterations);
    return sdfJulia3D(pos, pwr, bail, maxIt, trap);
}
```

### 5. Shader - Mandelbulb/Julia Raymarch

Add to Mandelbulb and Julia shader composition (NOT shared raymarch):
```glsl
float surfDist = uFastMode ? max(uSdfSurfaceDistance, 0.004) : uSdfSurfaceDistance;
```

This replaces the SURF_DIST_LQ/HQ constants in the raymarch code FOR THESE TWO OBJECTS ONLY.

### 6. Mesh Components

**MandelbulbMesh.tsx**:
```typescript
// Uniforms
uSdfMaxIterations: { value: 30 },
uSdfSurfaceDistance: { value: 0.002 },

// In useFrame update
material.uniforms.uSdfMaxIterations.value = mbConfig.sdfMaxIterations;
material.uniforms.uSdfSurfaceDistance.value = mbConfig.sdfSurfaceDistance;
```

**QuaternionJuliaMesh.tsx**:
```typescript
// Uniforms
uSdfMaxIterations: { value: 30 },
uSdfSurfaceDistance: { value: 0.002 },

// In useFrame update
u.uSdfMaxIterations.value = config.sdfMaxIterations;
u.uSdfSurfaceDistance.value = config.sdfSurfaceDistance;
```

### 7. UI Controls

**MandelbulbControls.tsx** - Add "Render Quality" section:
```tsx
<Section title="Render Quality" defaultOpen={true}>
  <Slider
    label="SDF Iterations"
    min={10}
    max={200}
    step={5}
    value={config.sdfMaxIterations}
    onChange={setSdfMaxIterations}
    showValue
  />
  <Slider
    label="Surface Distance"
    min={0.0005}
    max={0.01}
    step={0.0005}
    value={config.sdfSurfaceDistance}
    onChange={setSdfSurfaceDistance}
    showValue
  />
</Section>
```

**QuaternionJuliaControls.tsx** - Add "Render Quality" section, remove old maxIterations/quality preset:
```tsx
<Section title="Render Quality" defaultOpen={true}>
  <Slider
    label="SDF Iterations"
    min={10}
    max={200}
    step={5}
    value={config.sdfMaxIterations}
    onChange={setSdfMaxIterations}
    showValue
  />
  <Slider
    label="Surface Distance"
    min={0.0005}
    max={0.01}
    step={0.0005}
    value={config.sdfSurfaceDistance}
    onChange={setSdfSurfaceDistance}
    showValue
  />
</Section>
```

## NOT Modified (Schroedinger/Blackhole Unaffected)

- `src/rendering/shaders/shared/core/constants.glsl.ts` - Keep MAX_ITER_LQ/HQ for Schroedinger
- `src/rendering/shaders/shared/raymarch/core.glsl.ts` - Keep SURF_DIST constants for Schroedinger
- `src/rendering/shaders/schroedinger/*` - No changes
- `src/rendering/shaders/blackhole/*` - No changes (already has uMaxSteps)

## Files to Modify

1. `src/lib/geometry/extended/types.ts`
2. `src/stores/slices/geometry/mandelbulbSlice.ts`
3. `src/stores/slices/geometry/quaternionJuliaSlice.ts`
4. `src/stores/slices/geometry/types.ts`
5. `src/rendering/shaders/mandelbulb/dispatch.glsl.ts`
6. `src/rendering/shaders/julia/dispatch.glsl.ts`
7. `src/rendering/shaders/mandelbulb/compose.ts` (add uniforms, surfDist logic)
8. `src/rendering/shaders/julia/compose.ts` (add uniforms, surfDist logic)
9. `src/rendering/renderers/Mandelbulb/MandelbulbMesh.tsx`
10. `src/rendering/renderers/QuaternionJulia/QuaternionJuliaMesh.tsx`
11. `src/components/sections/Geometry/MandelbulbControls.tsx`
12. `src/components/sections/Geometry/QuaternionJuliaControls.tsx`

## Scene Loading

Zustand handles missing fields automatically - defaults from DEFAULT_*_CONFIG are used when fields don't exist in saved scenes.
