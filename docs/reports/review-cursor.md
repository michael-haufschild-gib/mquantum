# Performance Optimization Report for MDimension

**Generated:** January 2, 2026  
**Author:** Cursor AI Analysis  
**Focus:** Architectural and code optimizations (no visual quality changes)

---

## Scene Composition Context

The application renders relatively simple scenes:
- **Main object** (always present) - polytope, mandelbulb, or other N-dimensional shape
- **Skybox** (optional)
- **1-4 walls** (optional ground/environment planes)

This means scene geometry count is low, but computational complexity comes from:
- N-dimensional projection mathematics
- Ray marching (Mandelbulb)
- Post-processing effect chains
- Per-frame shader uniform updates

---

## Executive Summary

The MDimension codebase already implements many excellent performance patterns:

- ✅ Version-based dirty flags for store updates
- ✅ Pre-allocated working arrays to avoid per-frame allocations
- ✅ Ref-based store state caching to avoid `getState()` calls
- ✅ UniformManager with version tracking
- ✅ `useShallow` for Zustand subscriptions
- ✅ Web Workers for heavy geometry computation
- ✅ Linear color caching to avoid sRGB→linear conversion per frame

This report identifies **14 specific optimization opportunities** that can further improve performance while maintaining identical visual output.

---

## HIGH PRIORITY (Significant Impact)

### 1. FrozenFrameContext Allocates Every Frame

**File:** `src/rendering/graph/FrameContext.ts`

**Problem:** The `captureFrameContext()` function is called every frame and creates new objects including:
- Multiple cloned Vector3/Matrix4 objects (camera state)
- New Set copies (`new Set(state.animatingPlanes)`)
- Spread arrays (`[...ground.activeWalls]`)
- Multiple intermediate objects for each store

**Impact:** ~15-20 object allocations per frame, increasing GC pressure

**Solution:** Implement object pooling for frozen frame context:

```typescript
// Create a reusable context pool
class FrameContextPool {
  private context: FrozenFrameContext;
  private cameraPosition = new THREE.Vector3();
  private cameraMatrixWorld = new THREE.Matrix4();
  // ... other pre-allocated objects
  
  capture(frameNumber: number, scene: THREE.Scene, camera: THREE.Camera, getters: StoreGetters): FrozenFrameContext {
    // Reuse existing objects, copy values into them
    this.cameraPosition.copy(camera.position);
    this.cameraMatrixWorld.copy(camera.matrixWorld);
    // ... update context in place
    return this.context;
  }
}
```

---

### 2. Render Graph Pass Iteration with Many Disabled Passes

**File:** `src/rendering/graph/RenderGraph.ts` (lines 884-1048)

**Problem:** The render graph has **20+ registered passes** (Bloom, SSR, GTAO, FXAA, SMAA, Bokeh, etc.), but for simple scenes (main object + optional skybox + 1-4 walls), many effects are disabled. The `execute()` method still iterates all passes, calling each `enabled()` callback every frame.

**Impact:** 20+ function callback invocations per frame, mostly returning false. With the simple scene structure, this overhead is disproportionate to actual work.

**Solution:** Add a pre-compiled enabled pass list that's updated only when configuration changes:

```typescript
// In RenderGraph class
private enabledPassCache: RenderPass[] | null = null;
private enabledPassCacheVersion = -1;

execute(...) {
  // Only rebuild enabled list when frame context indicates changes
  const configVersion = this.computeConfigVersion(frozenFrameContext);
  if (configVersion !== this.enabledPassCacheVersion) {
    this.enabledPassCache = this.compiled.passes.filter(pass => 
      pass.config.enabled?.(frozenFrameContext) ?? true
    );
    this.enabledPassCacheVersion = configVersion;
  }
  
  // Iterate only enabled passes
  for (const pass of this.enabledPassCache) {
    // ... execute pass
  }
}
```

---

### 3. Multiple Redundant Store Subscriptions in Renderers

**Files:** `PolytopeScene.tsx`, `MandelbulbMesh.tsx`, `TubeWireframe.tsx`, `SchroedingerMesh.tsx`

**Problem:** Each renderer creates 5-6 separate `useEffect` hooks for store subscriptions. While refs are cached, the subscription callbacks fire on every store update.

**Example from PolytopeScene.tsx (lines 349-362):**

```typescript
useEffect(() => {
  const unsubAnim = useAnimationStore.subscribe((s) => { animationStateRef.current = s; });
  const unsubExt = useExtendedObjectStore.subscribe((s) => { extendedObjectStateRef.current = s; });
  const unsubApp = useAppearanceStore.subscribe((s) => { appearanceStateRef.current = s; });
  const unsubLight = useLightingStore.subscribe((s) => { lightingStateRef.current = s; });
  const unsubEnv = useEnvironmentStore.subscribe((s) => { environmentStateRef.current = s; });
  // ...
}, []);
```

**Impact:** Each store update triggers callback execution across all subscribing components

**Solution:** Create a consolidated subscription hook that batches updates:

```typescript
// src/hooks/useStoreRefs.ts
export function useRendererStoreRefs() {
  const refs = useRef({
    animation: useAnimationStore.getState(),
    extended: useExtendedObjectStore.getState(),
    appearance: useAppearanceStore.getState(),
    lighting: useLightingStore.getState(),
    environment: useEnvironmentStore.getState(),
  });
  
  useEffect(() => {
    // Batch all subscriptions into single object update
    const update = () => {
      refs.current = {
        animation: useAnimationStore.getState(),
        extended: useExtendedObjectStore.getState(),
        appearance: useAppearanceStore.getState(),
        lighting: useLightingStore.getState(),
        environment: useEnvironmentStore.getState(),
      };
    };
    
    // Subscribe with selector for minimal updates
    const unsubs = [
      useAnimationStore.subscribe(update),
      // ... etc
    ];
    return () => unsubs.forEach(u => u());
  }, []);
  
  return refs;
}
```

---

### 4. ResourcePool Dimension Computation on Every Access

**File:** `src/rendering/graph/ResourcePool.ts` (lines 361-402)

**Problem:** `ensureAllocated()` calls `computeDimensions()` on every resource access, even when dimensions haven't changed.

**Impact:** Repeated arithmetic per resource per frame

**Solution:** Cache computed dimensions and only recompute on screen size change:

```typescript
private cachedDimensions = new Map<string, { width: number; height: number }>();
private lastScreenWidth = 0;
private lastScreenHeight = 0;

private getOrComputeDimensions(entry: ResourceEntry): { width: number; height: number } {
  // Invalidate cache on screen size change
  if (this.screenWidth !== this.lastScreenWidth || this.screenHeight !== this.lastScreenHeight) {
    this.cachedDimensions.clear();
    this.lastScreenWidth = this.screenWidth;
    this.lastScreenHeight = this.screenHeight;
  }
  
  const cached = this.cachedDimensions.get(entry.config.id);
  if (cached) return cached;
  
  const dims = this.computeDimensions(entry.config.size);
  this.cachedDimensions.set(entry.config.id, dims);
  return dims;
}
```

---

## MEDIUM PRIORITY (Moderate Impact)

### 5. Animation Loop Plane Array Optimization

**File:** `src/hooks/useAnimationLoop.ts` (lines 89-91)

**Current Code:**

```typescript
const updates = updatesRef.current;
updates.clear();
```

**Observation:** This is already well-optimized with reused Map, but the inner loop could be further optimized.

**Potential Improvement:** Pre-compute plane indices if animatingPlanes is stable:

```typescript
// Cache plane array when animatingPlanes changes
const planesArrayRef = useRef<string[]>([]);
useEffect(() => {
  planesArrayRef.current = Array.from(animatingPlanes);
}, [animatingPlanes]);

// In animate callback, use cached array
const planes = planesArrayRef.current;
for (let i = 0; i < planes.length; i++) {
  const plane = planes[i]!;
  // ...
}
```

---

### 6. JSON.stringify for Config Stability Check

**File:** `src/hooks/useGeometryGenerator.ts` (line 144)

**Problem:**

```typescript
const configJson = useMemo(() => JSON.stringify(relevantConfig), [relevantConfig]);
```

This creates a new string every time `relevantConfig` changes, but `JSON.stringify` is called even when the config hasn't meaningfully changed.

**Solution:** Use a version number from the store instead:

```typescript
// Already exists in some stores (mandelbulbVersion, appearanceVersion)
// Add configVersion to extendedObjectStore slices
const configVersion = useExtendedObjectStore((s) => s.wythoffPolytopeVersion);
```

---

### 7. Uniform Updates Without Version Check

**File:** `src/rendering/renderers/Mandelbulb/MandelbulbMesh.tsx` (lines 395-399)

**Problem:** Some uniforms are updated unconditionally every frame:

```typescript
if (material.uniforms.uModelMatrix) material.uniforms.uModelMatrix.value.copy(meshRef.current.matrixWorld);
if (material.uniforms.uInverseModelMatrix) material.uniforms.uInverseModelMatrix.value.copy(meshRef.current.matrixWorld).invert();
if (material.uniforms.uProjectionMatrix) material.uniforms.uProjectionMatrix.value.copy(camera.projectionMatrix);
if (material.uniforms.uViewMatrix) material.uniforms.uViewMatrix.value.copy(camera.matrixWorldInverse);
```

**Impact:** 4 matrix copies per frame even when camera hasn't moved

**Solution:** Track camera matrix version:

```typescript
const cameraVersionRef = useRef(-1);

// In useFrame:
const cameraVersion = (camera as any).matrixWorldVersion ?? camera.matrixWorld.elements[0];
if (cameraVersion !== cameraVersionRef.current) {
  cameraVersionRef.current = cameraVersion;
  // Update camera-related uniforms
}
```

---

### 8. PostProcessingV2 State Sync Pattern

**File:** `src/rendering/environment/PostProcessingV2.tsx` (lines 341-359)

**Problem:** Five separate `useEffect` hooks update refs when store state changes:

```typescript
useEffect(() => { ppStateRef.current = ppState; }, [ppState]);
useEffect(() => { envStateRef.current = envState; }, [envState]);
// ... 3 more
```

**Solution:** Consolidate into single effect:

```typescript
useEffect(() => {
  ppStateRef.current = ppState;
  envStateRef.current = envState;
  uiStateRef.current = uiState;
  perfStateRef.current = perfState;
  blackHoleStateRef.current = blackHoleState;
}, [ppState, envState, uiState, perfState, blackHoleState]);
```

---

### 9. buildScalesArray Allocation

**File:** `src/rendering/renderers/base/useNDTransformUpdates.ts` (lines 200-210)

**Problem:**

```typescript
function buildScalesArray(dimension: number, uniformScale: number, perAxisScale: number[]): number[] {
  const scales: number[] = [];  // New array every call
  for (let i = 0; i < dimension; i++) {
    scales[i] = perAxisScale[i] ?? uniformScale;
  }
  return scales;
}
```

**Solution:** Pre-allocate and reuse:

```typescript
const scalesRef = useRef(new Array(11).fill(1) as number[]);

const update = (...) => {
  const scales = overrides?.scales ?? buildScalesArrayInPlace(
    scalesRef.current, geomState.dimension, transState.uniformScale, transState.perAxisScale
  );
  // ...
};
```

---

## LOW PRIORITY (Minor Impact)

### 10. External Resource Registry Captures Every Frame

**File:** `src/rendering/graph/RenderGraph.ts` (line 835)

**Observation:** `this.externalRegistry.captureAll()` runs every frame. Consider adding version tracking to skip when external state hasn't changed.

---

### 11. Pass Timing Array Growth

**File:** `src/rendering/graph/RenderGraph.ts` (line 874)

**Current:**

```typescript
const passTiming: PassTiming[] = [];
```

**Improvement:** Pre-allocate based on compiled pass count:

```typescript
const passTiming: PassTiming[] = this.timingEnabled 
  ? new Array(this.compiled.passes.length) 
  : [];
```

---

### 12. throttledUpdateSceneGpu Store Access

**File:** `src/rendering/environment/PostProcessingV2.tsx` (lines 147-157)

**Problem:** Calls `useUIStore.getState()` to check if stats should be updated, on every throttle check.

**Solution:** Use a ref cached from subscription instead.

---

### 13. Color Conversion in Shader Material Creation

**Files:** Multiple renderers

**Observation:** `new Color(faceColor).convertSRGBToLinear()` is called in `useMemo` which is fine for material creation, but ensure this isn't called in useFrame loops (it isn't currently - good!).

---

### 14. Set Layer Operations on Every Frame

**File:** `src/rendering/environment/PostProcessingV2.tsx` (lines 1564-1568)

**Problem:**

```typescript
const objectDepthLayers: number[] = [RENDER_LAYERS.MAIN_OBJECT];
if (!useTemporalCloud) {
  objectDepthLayers.push(RENDER_LAYERS.VOLUMETRIC);
}
passRefs.current.objectDepth?.setLayers(objectDepthLayers);
```

Creates new array every frame.

**Solution:** Cache layer configurations:

```typescript
const LAYERS_MAIN_ONLY = [RENDER_LAYERS.MAIN_OBJECT];
const LAYERS_MAIN_AND_VOLUMETRIC = [RENDER_LAYERS.MAIN_OBJECT, RENDER_LAYERS.VOLUMETRIC];

// In useFrame:
passRefs.current.objectDepth?.setLayers(
  useTemporalCloud ? LAYERS_MAIN_ONLY : LAYERS_MAIN_AND_VOLUMETRIC
);
```

---

## Where the Actual Load Comes From

Given the simple scene structure, the GPU/CPU load is concentrated in:

| Component | Resource | Why |
|-----------|----------|-----|
| **Main Object Shader** | GPU | N-dimensional projection math, ray marching (Mandelbulb) |
| **Post-Processing Chain** | GPU | Multiple full-screen passes, even when effects are subtle |
| **Rotation/Transform Updates** | CPU | N-dimensional matrix math every frame |
| **Frame Context Capture** | CPU | Object allocation, store reads every frame |
| **Pass Enable Checks** | CPU | 20+ callback evaluations per frame |

The optimizations above target the CPU overhead, which frees up frame budget for the GPU-intensive work.

---

## Summary of Expected Impact

| Priority | Count | Est. Frame Time Savings |
|----------|-------|------------------------|
| HIGH     | 4     | 1-3ms per frame        |
| MEDIUM   | 5     | 0.3-1ms per frame      |
| LOW      | 5     | 0.1-0.3ms per frame    |

**Total Estimated Improvement:** 2-5ms per frame, depending on configuration complexity

---

## Recommended Implementation Order

1. **FrozenFrameContext pooling** (High impact, moderate effort)
2. **Enabled pass caching** (High impact, low effort)
3. **Consolidate store subscriptions** (High impact, moderate effort)
4. **ResourcePool dimension caching** (High impact, low effort)
5. **Matrix version tracking** (Medium impact, low effort)
6. **Pre-allocated arrays cleanup** (Medium impact, low effort)

---

## Architecture Observations

### What's Working Well

1. **Dirty-flag pattern** - Version tracking in stores (appearanceVersion, mandelbulbVersion) is an excellent pattern that's used consistently across the codebase.

2. **Frame priority system** - The `FRAME_PRIORITY` constants in `useFrame` callbacks ensure predictable execution order.

3. **UniformManager** - Centralized uniform management with version tracking prevents redundant GPU uploads.

4. **Web Worker geometry** - Heavy geometry computation is properly offloaded to workers with cancellation support.

5. **Render graph architecture** - The declarative pass system with dependency resolution is well-designed.

### Potential Future Improvements

1. **Shader variant caching** - Pre-compile common shader variants to reduce first-use compilation stalls.

2. **Frame budget system** - Implement a frame budget that can skip lower-priority updates when over budget.

### Not Recommended (Given Scene Complexity)

1. **Geometry instancing** - With only 1 main object + optional skybox + 1-4 walls, instancing overhead would exceed benefits. The scene is already draw-call-efficient.

2. **Occlusion culling** - Scene is too simple to benefit; everything is typically visible.

---

## Files Analyzed

- `src/rendering/graph/RenderGraph.ts`
- `src/rendering/graph/FrameContext.ts`
- `src/rendering/graph/ResourcePool.ts`
- `src/rendering/environment/PostProcessingV2.tsx`
- `src/rendering/renderers/Polytope/PolytopeScene.tsx`
- `src/rendering/renderers/Mandelbulb/MandelbulbMesh.tsx`
- `src/rendering/renderers/TubeWireframe/TubeWireframe.tsx`
- `src/rendering/renderers/Schroedinger/SchroedingerMesh.tsx`
- `src/rendering/renderers/base/useNDTransformUpdates.ts`
- `src/rendering/renderers/base/useRotationUpdates.ts`
- `src/rendering/uniforms/UniformManager.ts`
- `src/hooks/useAnimationLoop.ts`
- `src/hooks/useGeometryGenerator.ts`
- `src/stores/appearanceStore.ts`
- `src/workers/geometry.worker.ts`
- `src/App.tsx`
- `src/rendering/Scene.tsx`

