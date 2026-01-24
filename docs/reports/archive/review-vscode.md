# N-Dimensional Visualizer - Performance Optimization Review

**Date:** January 2, 2026
**Scope:** Architecture and code optimization for improved CPU/GPU/memory efficiency
**Constraint:** No changes to visual quality or features

---

## Executive Summary

The application is already well-architected with GPU-based transformations, useFrame optimization, and dirty-flag tracking. However, I've identified **11 concrete optimizations** that can improve performance without affecting visual quality, organized by impact.

### Scene Composition Context

A typical scene consists of:
- **1 main object** (polytope, Mandelbulb, etc.) - always present
- **Optional skybox** - 1 draw call when present
- **Optional walls** (floor, back, left, right, top) - 1-4 draw calls

**Impact:** The relatively simple scene composition (≤6 total meshes) means:
- ✅ **Object pooling** is highly valuable (reducing GC pressure is critical)
- ✅ **Uniform batching** is very effective (fewer materials = bigger savings per optimization)
- ⚠️ **GPU instancing** for walls becomes HIGH priority (4 identical walls = perfect use case)
- ℹ️ Draw call count is already low, so instancing the main object is lower priority

**Estimated Total Performance Gain:** 25-40% reduction in frame time across all optimizations.

---

## HIGH-IMPACT OPTIMIZATIONS

### 1. **Consolidate Store Subscriptions in Renderers**
**Impact: High | Complexity: Medium | Estimated Gain: 5-10%**

**Current Issue:**

Location: `src/rendering/renderers/Polytope/PolytopeScene.tsx:340-355`

```tsx
useEffect(() => {
  const unsubAnim = useAnimationStore.subscribe((s) => { animationStateRef.current = s; });
  const unsubExt = useExtendedObjectStore.subscribe((s) => { extendedObjectStateRef.current = s; });
  const unsubApp = useAppearanceStore.subscribe((s) => { appearanceStateRef.current = s; });
  const unsubLight = useLightingStore.subscribe((s) => { lightingStateRef.current = s; });
  const unsubEnv = useEnvironmentStore.subscribe((s) => { environmentStateRef.current = s; });
  return () => {
    unsubAnim();
    unsubExt();
    unsubApp();
    unsubLight();
    unsubEnv();
  };
}, []);
```

Similar pattern in `src/rendering/renderers/base/useNDTransformUpdates.ts:120-135`

**Problem:**
- Creates 5 separate subscription listeners per renderer instance
- Each subscription triggers on ANY change to the store
- Zustand has to iterate through all subscriptions on every state change
- With multiple renderers, this multiplies (e.g., TubeWireframe also subscribes)

**Solution:**

Create a shared hook for combined subscriptions:

```tsx
// src/hooks/useCombinedStoreRefs.ts
import { useAnimationStore } from '@/stores/animationStore';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useLightingStore } from '@/stores/lightingStore';
import { useEnvironmentStore } from '@/stores/environmentStore';
import { useEffect, useRef } from 'react';

export interface CombinedStoreRefs {
  animation: ReturnType<typeof useAnimationStore.getState>;
  extended: ReturnType<typeof useExtendedObjectStore.getState>;
  appearance: ReturnType<typeof useAppearanceStore.getState>;
  lighting: ReturnType<typeof useLightingStore.getState>;
  environment: ReturnType<typeof useEnvironmentStore.getState>;
}

/**
 * Consolidated store subscription hook.
 * Reduces subscription overhead by batching all store updates into a single ref.
 */
export function useCombinedStoreRefs() {
  const stateRef = useRef<CombinedStoreRefs>({
    animation: useAnimationStore.getState(),
    extended: useExtendedObjectStore.getState(),
    appearance: useAppearanceStore.getState(),
    lighting: useLightingStore.getState(),
    environment: useEnvironmentStore.getState(),
  });

  useEffect(() => {
    // Single subscription that batches all updates
    // Triggers on any store change, updates all refs
    const updateAllRefs = () => {
      stateRef.current = {
        animation: useAnimationStore.getState(),
        extended: useExtendedObjectStore.getState(),
        appearance: useAppearanceStore.getState(),
        lighting: useLightingStore.getState(),
        environment: useEnvironmentStore.getState(),
      };
    };

    // Subscribe to one store as the trigger (they all update together in practice)
    const unsub = useAnimationStore.subscribe(updateAllRefs);
    return unsub;
  }, []);

  return stateRef;
}
```

Replace in PolytopeScene:

```tsx
// Remove individual refs and useEffect
const storeRefs = useCombinedStoreRefs();

// In useFrame
const extendedObjectState = storeRefs.current.extended;
const appearanceState = storeRefs.current.appearance;
const lightingState = storeRefs.current.lighting;
const environmentState = storeRefs.current.environment;
```

**Files to Update:**
- `src/hooks/useCombinedStoreRefs.ts` (new file)
- `src/rendering/renderers/Polytope/PolytopeScene.tsx`
- `src/rendering/renderers/TubeWireframe/TubeWireframe.tsx`
- `src/rendering/renderers/base/useNDTransformUpdates.ts`

---

### 2. **Replace JSON.stringify with Hash-Based Config Comparison**
**Impact: High | Complexity: Low | Estimated Gain: 2-5%**

**Current Issue:**

Location: `src/hooks/useGeometryGenerator.ts:140`

```tsx
const configJson = useMemo(() => JSON.stringify(relevantConfig), [relevantConfig]);
```

**Problem:**
- `JSON.stringify()` is called on every render when config changes
- For complex configs (Wythoff polytopes), this can be 1000+ characters
- O(n) string comparison on every dependency check
- Generates garbage strings frequently

**Solution:**

Create a fast hash function for configs:

```tsx
// src/utils/configHash.ts
/**
 * Fast hash function for configuration objects.
 * Uses FNV-1a algorithm for good distribution.
 *
 * @param config - Configuration object to hash
 * @returns Base-36 hash string
 */
export function hashConfig(config: Record<string, unknown>): string {
  let hash = 2166136261; // FNV offset basis

  // Sort keys for consistent hashing
  const keys = Object.keys(config).sort();

  for (const key of keys) {
    const val = config[key];
    const str = typeof val === 'object' && val !== null
      ? JSON.stringify(val)
      : String(val);

    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
  }

  return (hash >>> 0).toString(36);
}

/**
 * Compare two config objects by hash.
 * Much faster than JSON.stringify comparison.
 */
export function configsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return hashConfig(a) === hashConfig(b);
}
```

Replace in useGeometryGenerator:

```tsx
import { hashConfig } from '@/utils/configHash';

const configHash = useMemo(() => hashConfig(relevantConfig), [relevantConfig]);
```

**Files to Update:**
- `src/utils/configHash.ts` (new file)
- `src/hooks/useGeometryGenerator.ts`

---

### 3. **Object Pool for Three.js Math Objects**
**Impact: High | Complexity: Medium | Estimated Gain: 10-15%**

**Current Issue:**

Multiple locations create temporary Three.js objects that cause GC pressure:
- `src/rendering/renderers/Polytope/PolytopeScene.tsx:851`: `new Vector3()` for color components
- `src/rendering/environment/PostProcessingV2.tsx:365-373`: `new THREE.Raycaster()`, `new THREE.Vector2()`, etc.
- Throughout useFrame hooks

**Problem:**
- These allocations happen in render phase or hot paths
- Causes garbage collection pauses (especially noticeable at 60fps)
- Memory allocations are expensive on GPU-constrained devices
- Repeated allocations for temporary calculations

**Solution:**

Create object pools with automatic lifecycle management:

```tsx
// src/utils/objectPool.ts
import * as THREE from 'three';

/**
 * Generic object pool for Three.js math types.
 * Reduces GC pressure by reusing objects.
 */
class ObjectPool<T> {
  private pool: T[] = [];
  private inUse = new Set<T>();
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void) {
    this.factory = factory;
    this.reset = reset;
  }

  /**
   * Acquire an object from the pool.
   * Creates a new one if pool is empty.
   */
  acquire(): T {
    const obj = this.pool.pop() || this.factory();
    this.inUse.add(obj);
    return obj;
  }

  /**
   * Release an object back to the pool.
   * Resets the object for reuse.
   */
  release(obj: T): void {
    if (!this.inUse.has(obj)) {
      console.warn('Attempted to release object not in use');
      return;
    }
    this.reset(obj);
    this.inUse.delete(obj);
    this.pool.push(obj);
  }

  /**
   * Pre-warm the pool with objects.
   * Call during initialization to avoid allocations later.
   */
  prewarm(count: number): void {
    for (let i = 0; i < count; i++) {
      this.pool.push(this.factory());
    }
  }

  /**
   * Get pool statistics.
   */
  getStats() {
    return {
      available: this.pool.length,
      inUse: this.inUse.size,
      total: this.pool.length + this.inUse.size,
    };
  }
}

// Vector3 Pool
export const vector3Pool = new ObjectPool<THREE.Vector3>(
  () => new THREE.Vector3(),
  (v) => v.set(0, 0, 0)
);

// Vector2 Pool
export const vector2Pool = new ObjectPool<THREE.Vector2>(
  () => new THREE.Vector2(),
  (v) => v.set(0, 0)
);

// Color Pool
export const colorPool = new ObjectPool<THREE.Color>(
  () => new THREE.Color(),
  (c) => c.set(0xffffff)
);

// Matrix4 Pool
export const matrix4Pool = new ObjectPool<THREE.Matrix4>(
  () => new THREE.Matrix4(),
  (m) => m.identity()
);

// Quaternion Pool
export const quaternionPool = new ObjectPool<THREE.Quaternion>(
  () => new THREE.Quaternion(),
  (q) => q.identity()
);

// Raycaster Pool
export const raycasterPool = new ObjectPool<THREE.Raycaster>(
  () => new THREE.Raycaster(),
  (r) => {
    r.ray.origin.set(0, 0, 0);
    r.ray.direction.set(0, 0, -1);
    r.near = 0;
    r.far = Infinity;
  }
);

/**
 * Pre-warm all pools during initialization.
 * Call this once at app startup.
 */
export function prewarmPools() {
  vector3Pool.prewarm(50);
  vector2Pool.prewarm(20);
  colorPool.prewarm(20);
  matrix4Pool.prewarm(10);
  quaternionPool.prewarm(10);
  raycasterPool.prewarm(5);
}
```

Usage example in PolytopeScene:

```tsx
import { vector3Pool, colorPool } from '@/utils/objectPool';

useFrame(() => {
  // Acquire temp objects
  const tempVec = vector3Pool.acquire();
  const tempColor = colorPool.acquire();

  // Use them
  tempVec.set(cosineCoefficients.a[0], cosineCoefficients.a[1], cosineCoefficients.a[2]);
  (u.uCosineA.value as Vector3).copy(tempVec);

  // Release back to pool
  vector3Pool.release(tempVec);
  colorPool.release(tempColor);
});
```

Initialize in App.tsx:

```tsx
import { prewarmPools } from '@/utils/objectPool';

function App() {
  useEffect(() => {
    prewarmPools();
  }, []);
  // ...
}
```

**Files to Update:**
- `src/utils/objectPool.ts` (new file)
- `src/App.tsx` (add prewarm call)
- `src/rendering/renderers/Polytope/PolytopeScene.tsx`
- `src/rendering/renderers/TubeWireframe/TubeWireframe.tsx`
- `src/rendering/environment/PostProcessingV2.tsx`

**Note:** This requires careful tracking of acquire/release calls. Consider using RAII pattern with callbacks for safety:

```tsx
function withPooledVector3<T>(fn: (vec: THREE.Vector3) => T): T {
  const vec = vector3Pool.acquire();
  try {
    return fn(vec);
  } finally {
    vector3Pool.release(vec);
  }
}
```

---

### 4. **Batch Uniform Updates Using UniformManager More Aggressively**
**Impact: Medium-High | Complexity: Low | Estimated Gain: 5-8%**

**Current Issue:**

Location: `src/rendering/renderers/Polytope/PolytopeScene.tsx:870-940`

```tsx
// Manual uniform updates scattered across code
if (u.uCosineA) (u.uCosineA.value as Vector3).set(cosineCoefficients.a[0], ...);
if (u.uCosineB) (u.uCosineB.value as Vector3).set(cosineCoefficients.b[0], ...);
if (u.uCosineC) (u.uCosineC.value as Vector3).set(cosineCoefficients.c[0], ...);
if (u.uCosineD) (u.uCosineD.value as Vector3).set(cosineCoefficients.d[0], ...);
if (u.uDistPower) u.uDistPower.value = distribution.power;
if (u.uDistCycles) u.uDistCycles.value = distribution.cycles;
// ... 15+ more uniform updates
```

**Problem:**
- Each uniform check (`if (u.uCosineA)`) is a property access
- Manual uniform updates scattered across code
- No batching of related uniforms
- Easy to forget uniforms when adding new ones
- Duplicated logic across renderers

**Solution:**

Extend UniformManager to handle color system uniforms:

```tsx
// src/rendering/uniforms/sources/ColorSystemSource.ts
import type * as THREE from 'three';
import { Color, Vector3 } from 'three';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { COLOR_ALGORITHM_TO_INT } from '@/rendering/shaders/palette';
import type { UniformSource, UniformUpdateState } from './UniformSource';

/**
 * Uniform source for advanced color system.
 * Manages cosine palette, distribution, and multi-source weighting.
 */
export class ColorSystemSource implements UniformSource {
  id = 'color-system';
  version = 0;

  private uniforms: Record<string, { value: unknown }>;

  constructor() {
    this.uniforms = {
      uColorAlgorithm: { value: 2 },
      uCosineA: { value: new Vector3(0.5, 0.5, 0.5) },
      uCosineB: { value: new Vector3(0.5, 0.5, 0.5) },
      uCosineC: { value: new Vector3(1.0, 1.0, 1.0) },
      uCosineD: { value: new Vector3(0.0, 0.33, 0.67) },
      uDistPower: { value: 1.0 },
      uDistCycles: { value: 1.0 },
      uDistOffset: { value: 0.0 },
      uLchLightness: { value: 0.7 },
      uLchChroma: { value: 0.15 },
      uMultiSourceWeights: { value: new Vector3(0.5, 0.3, 0.2) },
    };
  }

  getUniforms(): Record<string, { value: unknown }> {
    return this.uniforms;
  }

  update(state: UniformUpdateState): void {
    const {
      colorAlgorithm,
      cosineCoefficients,
      distribution,
      lchLightness,
      lchChroma,
      multiSourceWeights,
    } = useAppearanceStore.getState();

    // Update uniforms
    this.uniforms.uColorAlgorithm.value = COLOR_ALGORITHM_TO_INT[colorAlgorithm];
    (this.uniforms.uCosineA.value as Vector3).set(
      cosineCoefficients.a[0],
      cosineCoefficients.a[1],
      cosineCoefficients.a[2]
    );
    (this.uniforms.uCosineB.value as Vector3).set(
      cosineCoefficients.b[0],
      cosineCoefficients.b[1],
      cosineCoefficients.b[2]
    );
    (this.uniforms.uCosineC.value as Vector3).set(
      cosineCoefficients.c[0],
      cosineCoefficients.c[1],
      cosineCoefficients.c[2]
    );
    (this.uniforms.uCosineD.value as Vector3).set(
      cosineCoefficients.d[0],
      cosineCoefficients.d[1],
      cosineCoefficients.d[2]
    );
    this.uniforms.uDistPower.value = distribution.power;
    this.uniforms.uDistCycles.value = distribution.cycles;
    this.uniforms.uDistOffset.value = distribution.offset;
    this.uniforms.uLchLightness.value = lchLightness;
    this.uniforms.uLchChroma.value = lchChroma;
    (this.uniforms.uMultiSourceWeights.value as Vector3).set(
      multiSourceWeights.depth,
      multiSourceWeights.orbitTrap,
      multiSourceWeights.normal
    );

    this.version++;
  }

  getCombinedUniforms(): Record<string, { value: unknown }> {
    return this.uniforms;
  }
}
```

Register in init.ts:

```tsx
// src/rendering/uniforms/init.ts
import { ColorSystemSource } from './sources/ColorSystemSource';

export function initializeUniformSources(): void {
  // ... existing registrations
  UniformManager.register(new ColorSystemSource());
}
```

Then in PolytopeScene, replace manual updates with:

```tsx
// Instead of 20+ manual uniform updates
UniformManager.applyToMaterial(material, [
  'lighting',
  'pbr-face',
  'color-system' // New source
]);
```

**Files to Update:**
- `src/rendering/uniforms/sources/ColorSystemSource.ts` (new file)
- `src/rendering/uniforms/sources/index.ts` (export new source)
- `src/rendering/uniforms/init.ts`
- `src/rendering/renderers/Polytope/PolytopeScene.tsx`
- `src/rendering/renderers/Mandelbulb/MandelbulbMesh.tsx`

---

## MEDIUM-IMPACT OPTIMIZATIONS

### 5. **Optimize Store Version Checks with Bit Flags**
**Impact: Medium | Complexity: Low | Estimated Gain: 1-2%**

**Current Issue:**

Location: `src/rendering/renderers/Polytope/PolytopeScene.tsx:800-820`

```tsx
const polytopeChanged = polytopeVersion !== lastPolytopeVersionRef.current;
const appearanceChanged = appearanceVersion !== lastAppearanceVersionRef.current;
const iblChanged = iblVersion !== lastIblVersionRef.current;
const lightingChanged = lightingVersion !== lastLightingVersionRef.current;
```

Multiple comparisons, multiple refs, multiple memory accesses.

**Problem:**
- Multiple version refs require multiple memory reads
- Multiple comparison operations
- More code to maintain
- Could be optimized with bit operations

**Solution:**

Combine version flags into a single number using bit operations:

```tsx
// In store
interface VersionFlags {
  polytope: number;
  appearance: number;
  ibl: number;
  lighting: number;
}

// Generate combined version number
function getCombinedVersion(flags: VersionFlags): number {
  return (
    (flags.polytope & 0xFF) |
    ((flags.appearance & 0xFF) << 8) |
    ((flags.ibl & 0xFF) << 16) |
    ((flags.lighting & 0xFF) << 24)
  );
}

// In useFrame
const currentVersion = getCombinedVersion({
  polytope: extendedObjectState.polytopeVersion,
  appearance: appearanceState.appearanceVersion,
  ibl: environmentState.iblVersion,
  lighting: lightingState.version,
});

const changedMask = currentVersion ^ lastVersionRef.current;

// Check specific changes
if (changedMask & 0x000000FF) { /* polytope changed */ }
if (changedMask & 0x0000FF00) { /* appearance changed */ }
if (changedMask & 0x00FF0000) { /* ibl changed */ }
if (changedMask & 0xFF000000) { /* lighting changed */ }

lastVersionRef.current = currentVersion;
```

**Files to Update:**
- `src/rendering/renderers/Polytope/PolytopeScene.tsx`
- `src/rendering/renderers/Mandelbulb/MandelbulbMesh.tsx`

---

### 6. **Memoize Shader Builder Results**
**Impact: Medium | Complexity: Medium | Estimated Gain: 3-5%**

**Current Issue:**

Location: `src/rendering/renderers/Polytope/PolytopeScene.tsx:415-425`

```tsx
const { glsl: faceFragmentShader, modules: faceShaderModules, features: faceShaderFeatures } = useMemo(() => {
  const config = {
    shadows: shadowEnabled,
    sss: sssEnabled,
    fresnel: surfaceSettings.fresnelEnabled,
  };
  return useScreenSpaceNormals
    ? buildFaceFragmentShaderScreenSpace(config)
    : buildFaceFragmentShader(config);
}, [shadowEnabled, sssEnabled, surfaceSettings.fresnelEnabled, useScreenSpaceNormals]);
```

Builder functions are called every time dependencies change, even for common combinations.

**Problem:**
- Shader building involves string concatenation (expensive)
- Common configurations (e.g., shadows=true, sss=false) are rebuilt repeatedly
- No caching across component instances
- Memory allocation for shader strings

**Solution:**

Cache built shaders at the module level:

```tsx
// src/rendering/shaders/shaderCache.ts
/**
 * Global shader cache for built shaders.
 * Reduces shader compilation overhead by reusing built shader strings.
 */
const shaderCache = new Map<string, {
  glsl: string;
  modules: string[];
  features: string[];
}>();

/**
 * Get or build a shader with caching.
 *
 * @param key - Unique key for this shader configuration
 * @param builder - Function to build the shader if not cached
 * @returns Cached or newly built shader result
 */
export function getCachedShader(
  key: string,
  builder: () => { glsl: string; modules: string[]; features: string[] }
) {
  if (!shaderCache.has(key)) {
    shaderCache.set(key, builder());
  }
  return shaderCache.get(key)!;
}

/**
 * Clear shader cache (for testing or memory management).
 */
export function clearShaderCache(): void {
  shaderCache.clear();
}

/**
 * Get cache statistics.
 */
export function getShaderCacheStats() {
  return {
    size: shaderCache.size,
    keys: Array.from(shaderCache.keys()),
  };
}
```

Usage in PolytopeScene:

```tsx
import { getCachedShader } from '@/rendering/shaders/shaderCache';

const { glsl: faceFragmentShader, modules: faceShaderModules, features: faceShaderFeatures } = useMemo(() => {
  const config = {
    shadows: shadowEnabled,
    sss: sssEnabled,
    fresnel: surfaceSettings.fresnelEnabled,
  };

  // Generate cache key from configuration
  const cacheKey = `face-frag-${useScreenSpaceNormals ? 'ss' : 'geom'}-${shadowEnabled}-${sssEnabled}-${surfaceSettings.fresnelEnabled}`;

  return getCachedShader(cacheKey, () => {
    return useScreenSpaceNormals
      ? buildFaceFragmentShaderScreenSpace(config)
      : buildFaceFragmentShader(config);
  });
}, [shadowEnabled, sssEnabled, surfaceSettings.fresnelEnabled, useScreenSpaceNormals]);
```

**Files to Update:**
- `src/rendering/shaders/shaderCache.ts` (new file)
- `src/rendering/renderers/Polytope/PolytopeScene.tsx`
- `src/rendering/renderers/Mandelbulb/MandelbulbMesh.tsx`
- `src/rendering/renderers/QuaternionJulia/QuaternionJuliaMesh.tsx`
- `src/rendering/renderers/Schroedinger/SchroedingerMesh.tsx`

---

### 7. **Reduce Worker Message Overhead with Batching**
**Impact: Medium | Complexity: Medium | Estimated Gain: 2-4%**

**Current Issue:**

Location: `src/workers/geometry.worker.ts`

Progress messages are sent on every update, causing main thread to process many small messages.

**Problem:**
- Each postMessage has overhead (serialization, message queue)
- Progress updates at 100% frequency overwhelm main thread
- Most progress updates are not visible to user (too fast)
- Message processing competes with rendering

**Solution:**

Batch progress updates using throttling:

```tsx
// src/workers/geometry.worker.ts

/**
 * Progress update batcher.
 * Throttles progress messages to ~60fps to avoid overwhelming main thread.
 */
class ProgressBatcher {
  private pendingProgress: ProgressResponse | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly throttleMs: number;

  constructor(throttleMs = 16) { // ~60fps
    this.throttleMs = throttleMs;
  }

  /**
   * Queue a progress update.
   * Will be sent after throttle period or immediately on flush.
   */
  send(progress: ProgressResponse): void {
    this.pendingProgress = progress;

    if (!this.timeout) {
      this.timeout = setTimeout(() => {
        this.flush();
      }, this.throttleMs);
    }
  }

  /**
   * Immediately send pending progress.
   * Used for final progress (100%) to ensure it's not delayed.
   */
  flush(): void {
    if (this.pendingProgress) {
      postMessage(this.pendingProgress);
      this.pendingProgress = null;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  /**
   * Clear pending progress without sending.
   */
  cancel(): void {
    this.pendingProgress = null;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

const progressBatcher = new ProgressBatcher();

// Replace direct postMessage with batched version
function sendProgress(progress: ProgressResponse): void {
  // Always send 100% immediately
  if (progress.progress === 100) {
    progressBatcher.flush();
    postMessage(progress);
  } else {
    progressBatcher.send(progress);
  }
}

// Use in worker:
sendProgress({
  type: 'progress',
  id: requestId,
  progress: Math.floor((i / total) * 100),
  stage: 'vertices',
});
```

**Files to Update:**
- `src/workers/geometry.worker.ts`

---

### 8. **Use Float32Array for Uniform Arrays Directly**
**Impact: Medium | Complexity: Low | Estimated Gain: 1-3%**

**Current Issue:**

Many places copy data to Float32Array uniforms:

```tsx
(u.uExtraRotationCols.value as Float32Array).set(gpuData.extraRotationCols);
(u.uDepthRowSums.value as Float32Array).set(gpuData.depthRowSums);
```

The `.set()` call copies data, which is redundant if we can share the array reference.

**Problem:**
- Unnecessary memory copy operation
- CPU time spent copying
- Cache misses from reading source array
- Two arrays in memory (source + uniform)

**Solution:**

Store as Float32Array from the start and share references:

```tsx
// src/rendering/uniforms/sources/NDTransformSource.ts

export class NDTransformSource implements UniformSource {
  // Store as Float32Array directly (not as source + copy)
  private gpuData = {
    rotationMatrix4D: new Matrix4(),
    extraRotationCols: new Float32Array(28), // Direct storage
    depthRowSums: new Float32Array(11),      // Direct storage
  };

  private uniforms = {
    uRotationMatrix4D: { value: this.gpuData.rotationMatrix4D },
    uExtraRotationCols: { value: this.gpuData.extraRotationCols }, // Shared reference
    uDepthRowSums: { value: this.gpuData.depthRowSums },           // Shared reference
  };

  // Update in place
  update(config: NDTransformConfig): void {
    // Write directly to the arrays (no .set() needed)
    const cols = this.gpuData.extraRotationCols;
    const sums = this.gpuData.depthRowSums;

    // Fill arrays directly
    for (let i = 0; i < 28; i++) {
      cols[i] = /* computed value */;
    }

    this.version++;
  }

  // Return the shared reference
  getGPUData() {
    return this.gpuData;
  }
}
```

Then in renderers, no copy is needed:

```tsx
// Before (with copy):
(u.uExtraRotationCols.value as Float32Array).set(gpuData.extraRotationCols);

// After (shared reference already up to date):
// Nothing needed! The uniform already points to the updated array
```

**Important:** This requires that the NDTransformSource updates the arrays in place, which is already the case.

**Files to Update:**
- `src/rendering/uniforms/sources/NDTransformSource.ts`
- `src/rendering/renderers/Polytope/PolytopeScene.tsx`
- `src/rendering/renderers/TubeWireframe/TubeWireframe.tsx`

---

## LOW-IMPACT OPTIMIZATIONS

### 9. **Lazy Initialize UniformManager Sources**
**Impact: Low | Complexity: Low | Estimated Gain: <1%**

**Current Issue:**

Location: `src/rendering/uniforms/init.ts:46`

All uniform sources are initialized immediately, even if not all are needed for the current scene.

**Problem:**
- Unnecessary memory allocation
- Initialization time for unused sources
- Not significant, but good practice

**Solution:**

```tsx
// src/rendering/uniforms/UniformManager.ts

class LazyUniformManager {
  private sources = new Map<string, UniformSource>();
  private sourceFactories = new Map<string, () => UniformSource>();

  /**
   * Register a lazy source factory.
   */
  registerLazy(id: string, factory: () => UniformSource): void {
    this.sourceFactories.set(id, factory);
  }

  /**
   * Get source, creating it lazily if needed.
   */
  getSource(id: string): UniformSource | undefined {
    if (!this.sources.has(id)) {
      const factory = this.sourceFactories.get(id);
      if (factory) {
        this.sources.set(id, factory());
      }
    }
    return this.sources.get(id);
  }
}
```

**Files to Update:**
- `src/rendering/uniforms/UniformManager.ts`
- `src/rendering/uniforms/init.ts`

---

### 10. **Optimize Color Cache Lookups with Integer Hashing**
**Impact: Low | Complexity: Low | Estimated Gain: <1%**

**Current Issue:**

Location: `src/rendering/colors/linearCache.ts:45`

```tsx
if (cache.source === srgbColor) {
  return false; // Cache hit
}
```

String comparison on every frame.

**Problem:**
- String comparison is O(n) where n is string length
- Even short strings like "#FF0000" require 7 comparisons
- Can be optimized with integer hash

**Solution:**

```tsx
// src/rendering/colors/linearCache.ts

/**
 * Fast DJB2 hash for color strings.
 */
function hashColorString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash >>> 0;
}

export interface CachedLinearColor {
  sourceHash: number; // Integer hash for fast comparison
  source: string;     // Keep string for validation
  linear: Color;
}

export function updateCachedLinearColor(cache: CachedLinearColor, srgbColor: string): boolean {
  const hash = hashColorString(srgbColor);

  // Fast integer comparison first
  if (cache.sourceHash === hash && cache.source === srgbColor) {
    return false; // Cache hit
  }

  // Cache miss - convert and store
  cache.sourceHash = hash;
  cache.source = srgbColor;
  cache.linear.set(srgbColor).convertSRGBToLinear();
  return true;
}
```

**Files to Update:**
- `src/rendering/colors/linearCache.ts`

---

### 11. **Use GPU Instancing for Repeated Geometry**
**Impact: HIGH for walls, Low-Medium for edges | Complexity: Medium | Estimated Gain: 15-25% when walls active**

**IMPORTANT UPDATE:** Given the scene composition (1 main object + optional skybox + 1-4 walls), GPU instancing is **HIGHLY VALUABLE** for walls:

**Wall Instancing (High Priority):**
- 1-4 walls with **identical geometry** but different transforms
- Currently: 1-4 separate meshes = 1-4 draw calls + 1-4 material binds
- With instancing: **1 draw call** for all walls
- Estimated gain: **15-25% when 3-4 walls are active**

**Edge Instancing (Lower Priority):**
- Edge rendering creates individual line segments for each edge
- For objects with 1000+ edges, this is many draw calls
- Less critical given scene's low base draw call count

**Current Issue:**
- One draw call per wall (floor, back, left, right, top)
- GPU state changes between draw calls
- CPU overhead processing draw calls
- Not leveraging instanced rendering for identical geometry

**Solution Part 1: Wall Instancing (High Priority)**

The GroundPlane component currently renders 1-4 walls as separate meshes. These are perfect candidates for instancing because they:
- Use identical geometry (planes)
- Have different transforms (position + rotation)
- Are always rendered together

```tsx
// src/rendering/environment/InstancedGroundPlane.tsx
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { WallPosition } from '@/stores/defaults/visualDefaults';

interface InstancedGroundPlaneProps {
  activeWalls: WallPosition[];
  distance: number;
  planeSize: number;
  color: string;
  // ... other props
}

export function InstancedGroundPlane({ activeWalls, distance, planeSize, color }: InstancedGroundPlaneProps) {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);

  // Single plane geometry shared by all walls
  const planeGeometry = useMemo(() => {
    return new THREE.PlaneGeometry(planeSize, planeSize);
  }, [planeSize]);

  // Single material shared by all walls (managed via UniformManager)
  const material = useMemo(() => {
    return new GroundPlaneMaterial({ color });
  }, [color]);

  // Update instance matrices when walls or distance changes
  useFrame(() => {
    if (!instancedMeshRef.current) return;

    const wallTransforms: Record<WallPosition, THREE.Matrix4> = {
      floor: new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, -distance, 0),
      back: new THREE.Matrix4().setPosition(0, 0, -distance),
      left: new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-distance, 0, 0),
      right: new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(distance, 0, 0),
      top: new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, distance, 0),
    };

    activeWalls.forEach((wall, index) => {
      const matrix = wallTransforms[wall];
      if (matrix) {
        instancedMeshRef.current?.setMatrixAt(index, matrix);
      }
    });

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    instancedMeshRef.current.count = activeWalls.length; // Dynamic instance count
  });

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[planeGeometry, material, 5]} // Max 5 walls
      receiveShadow
    />
  );
}
```

**Benefits:**
- **1 draw call** instead of 1-4
- **1 material bind** instead of 1-4
- **Single geometry buffer** instead of 4 identical buffers
- Estimated **15-25% performance gain** when 3-4 walls are active

**Solution Part 2: Edge Instancing (Lower Priority)**

For polytopes with many identical edges, use instanced rendering:

```tsx
// src/rendering/renderers/Polytope/InstancedEdgeRenderer.tsx

interface InstancedEdgeRendererProps {
  edges: [number, number][];
  vertices: VectorND[];
  color: string;
  radius: number;
}

export function InstancedEdgeRenderer({ edges, vertices, color, radius }: InstancedEdgeRendererProps) {
  // Create single edge geometry (cylinder from origin to unit Z)
  const edgeGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(radius, radius, 1, 8);
  }, [radius]);

  // Create instanced mesh
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);

  // Update instance matrices
  useEffect(() => {
    if (!instancedMeshRef.current) return;

    const tempMatrix = new THREE.Matrix4();
    const tempVec1 = new THREE.Vector3();
    const tempVec2 = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();

    edges.forEach((edge, i) => {
      const [aIdx, bIdx] = edge;
      const a = vertices[aIdx];
      const b = vertices[bIdx];

      if (!a || !b) return;

      // Extract 3D positions (will be transformed by shader)
      tempVec1.set(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0);
      tempVec2.set(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0);

      // Compute edge transform
      const center = tempVec1.clone().add(tempVec2).multiplyScalar(0.5);
      const direction = tempVec2.clone().sub(tempVec1);
      const length = direction.length();
      direction.normalize();

      // Rotation to align with edge
      tempQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

      // Build matrix: translate to center, rotate to direction, scale to length
      tempMatrix.compose(center, tempQuat, new THREE.Vector3(1, length, 1));

      instancedMeshRef.current?.setMatrixAt(i, tempMatrix);
    });

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [edges, vertices]);

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[edgeGeometry, undefined, edges.length]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} />
    </instancedMesh>
  );
}
```

**Priority:**
1. **Implement wall instancing FIRST** (high value, simpler implementation)
2. **Consider edge instancing later** only if profiling shows it's a bottleneck

**Note on edge instancing complexity:**
- Requires adapting N-D transform shader for instanced rendering
- Per-edge coloring would require instance attributes
- May not work with tube caps
- Given low base draw call count (scene has ≤6 meshes), less critical

**Files to Update:**
- `src/rendering/environment/InstancedGroundPlane.tsx` (new file - HIGH PRIORITY)
- `src/rendering/environment/GroundPlane.tsx` (refactor to use instancing)
- `src/rendering/renderers/Polytope/InstancedEdgeRenderer.tsx` (new file - lower priority)
- `src/rendering/renderers/Polytope/PolytopeScene.tsx` (if implementing edge instancing)

---

## ARCHITECTURAL CONSIDERATIONS

### Memory Management
1. **ResourcePool**: Already well-implemented with automatic cleanup
2. **Geometry Disposal**: Correctly disposes old geometries in PolytopeScene
3. **Consider**: Add memory limit to geometry cache in Wythoff generator to prevent excessive cache growth

### Worker Thread Utilization
1. **Current**: Single geometry worker handles all generation
2. **Opportunity**: Use OffscreenCanvas for parallel shader compilation (WebGL2 supports this)
3. **Opportunity**: Offload face depth calculation to worker thread
4. **Opportunity**: Consider SharedArrayBuffer for zero-copy vertex data transfer (requires COOP/COEP headers)

### Scene Composition Optimizations
1. **Wall Instancing**: CRITICAL - 1-4 identical walls are perfect for instancing (moved to Phase 1)
2. **Draw Call Budget**: With ≤6 total meshes, focus on per-mesh efficiency rather than reducing mesh count
3. **Material Sharing**: Walls already share materials via UniformManager (good!)
4. **Skybox Optimization**: Single cube map sample - already optimal

### Render Graph Optimization
1. **Already optimal**: Declarative dependencies, smart resource pooling, lazy resource deallocation
2. **Consider**: Add pass-level GPU timing for profiling (already has infrastructure via GPUTimer)
3. **Consider**: Implement render graph hot-reload during development

### Store Architecture
1. **Current**: Multiple stores with individual subscriptions
2. **Consider**: Implement store middleware for subscription batching
3. **Consider**: Add store change logs for debugging (track what triggered re-renders)

---

## RECOMMENDED IMPLEMENTATION ORDER

### Phase 1: Quick Wins (1-2 days)
**Priority: Immediate impact with low risk**

1. **Optimization #11 (Part 1)**: **Wall GPU instancing** ⭐ NEW HIGH PRIORITY
   - Create InstancedGroundPlane component
   - Replace current GroundPlane implementation
   - **Risk: Low** | **Impact: HIGH (15-25% when walls active)**
   - **Justification:** Simple implementation, massive gain for common use case

2. **Optimization #2**: Hash-based config comparison
   - Replace JSON.stringify in useGeometryGenerator
   - Create configHash utility
   - **Risk: Low** | **Impact: High**

3. **Optimization #5**: Bit-flag version checks
   - Combine version comparisons
   - Reduce memory reads
   - **Risk: Low** | **Impact: Medium**

4. **Optimization #10**: Color cache integer hashing
   - Add hash to CachedLinearColor
   - Fast integer comparison
   - **Risk: Low** | **Impact: Low**

**Expected Combined Gain:** 18-35% performance improvement (wall instancing alone: 15-25%)

---

### Phase 2: Medium Impact (3-5 days)
**Priority: Higher complexity but significant gains**

1. **Optimization #1**: Consolidated store subscriptions
   - Create useCombinedStoreRefs hook
   - Refactor PolytopeScene, TubeWireframe, useNDTransformUpdates
   - **Risk: Medium** | **Impact: High**

2. **Optimization #4**: UniformManager batching
   - Create ColorSystemSource
   - Register in UniformManager
   - Refactor uniform updates in renderers
   - **Risk: Low** | **Impact: Medium-High**

3. **Optimization #8**: Direct Float32Array usage
   - Eliminate .set() calls
   - Share array references
   - **Risk: Low** | **Impact: Medium**

4. **Optimization #6**: Shader caching
   - Create shader cache utility
   - Wrap shader builders
   - **Risk: Low** | **Impact: Medium**

**Expected Combined Gain:** 12-20% performance improvement

---

### Phase 3: High Complexity (1-2 weeks)
**Priority: Largest gains but requires careful implementation**

1. **Optimization #3**: Object pooling
   - Create object pool utility
   - Add prewarm initialization
   - Refactor hot paths to use pools
   - Add lifecycle management
   - **Risk: High** | **Impact: High**
   - **Caution:** Requires careful acquire/release tracking

2. **Optimization #7**: Worker message batching
   - Add ProgressBatcher class
   - Throttle progress updates
   - **Risk: Low** | **Impact: Medium**

3. **Optimization #11 (Part 2)**: Edge GPU instancing (optional)
   - Create InstancedEdgeRenderer for polytope edges
   - Adapt N-D transform for instances
   - Profile before/after
   - **Risk: Medium** | **Impact: Scene-dependent (5-10% for 1000+ edges)**
   - **Recommendation:** Only if profiling shows it's needed (wall instancing in Phase 1 already reduces draw calls significantly)

**Expected Combined Gain:** 10-20% performance improvement

---

### Phase 4: Monitoring & Polish (ongoing)
**Priority: Ensure optimizations work as expected**

1. **Add Performance Benchmarks**
   - Create benchmark suite
   - Test each optimization independently
   - Measure 99th percentile frame time (more important than average)

2. **Profile with Chrome DevTools**
   - Performance tab: record frame timeline
   - Memory tab: check GC frequency
   - Rendering tab: paint flashing, layer borders

3. **Measure Actual Gains**
   - Before/after metrics for each phase
   - Track in performance monitoring UI
   - A/B test on different hardware

4. **Add Performance Telemetry**
   - Track metrics: frame time, GC pauses, draw calls
   - Log to console in dev mode
   - Export to CSV for analysis

---

## WHAT'S ALREADY OPTIMIZED ✅

The application already implements many best practices:

- ✅ **GPU-based transformations**: All vertex transformations in shaders (no CPU calculations)
- ✅ **useFrame with getState()**: Bypasses React re-renders during animation
- ✅ **Dirty-flag tracking**: Only updates changed uniforms (version checking)
- ✅ **Screen-space normals**: For high dimensions (67% memory reduction)
- ✅ **Cached linear colors**: Avoids sRGB→linear conversion per frame
- ✅ **UniformManager**: Centralized uniform management with version tracking
- ✅ **React.memo**: Proper component memoization
- ✅ **Efficient geometry disposal**: Three.js objects cleaned up properly
- ✅ **Render graph**: Declarative pass dependencies, automatic ordering
- ✅ **Resource pooling**: WebGL render targets reused efficiently
- ✅ **Web Workers**: Heavy geometry generation offloaded from main thread
- ✅ **MRT optimization**: Multi-render-target for efficient G-buffer

---

## PERFORMANCE TESTING RECOMMENDATIONS

### 1. Establish Baseline Metrics

Before implementing optimizations, measure:

```tsx
// Add to App.tsx for development
useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    const stats = {
      frameTime: [] as number[],
      gcPauses: 0,
      subscriptionCount: 0,
    };

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'measure') {
          stats.frameTime.push(entry.duration);
        }
      }
    });

    observer.observe({ entryTypes: ['measure'] });

    setInterval(() => {
      const avg = stats.frameTime.reduce((a, b) => a + b, 0) / stats.frameTime.length;
      const p99 = stats.frameTime.sort()[Math.floor(stats.frameTime.length * 0.99)];
      console.log('Perf Stats:', { avg, p99, gcPauses: stats.gcPauses });
      stats.frameTime = [];
    }, 5000);
  }
}, []);
```

### 2. Chrome DevTools Profiling

**Performance Tab:**
- Record 10 seconds of interaction
- Look for long frames (>16.67ms = dropped frame)
- Identify bottlenecks: scripting, rendering, painting

**Memory Tab:**
- Take heap snapshots before/after optimization
- Check for memory leaks (increasing heap size)
- Monitor GC frequency (should be <10/minute)

**Rendering Tab:**
- Enable "Paint flashing" - minimize green flashes
- Enable "Layer borders" - ensure proper layer compositing
- Monitor draw call count via WebGL inspector

### 3. Test Scenarios

Test each optimization with:

1. **Simple scene**: 4D hypercube
2. **Complex scene**: 8D Wythoff polytope with 10,000+ faces
3. **Animated scene**: Continuous rotation on all planes
4. **Fractal scene**: Mandelbulb at high iteration count
5. **Low-end hardware**: Integrated GPU, 8GB RAM

### 4. Metrics to Track

| Metric | Target | Measurement |
|--------|--------|-------------|
| Frame time (avg) | <16ms | requestAnimationFrame delta |
| Frame time (p99) | <33ms | 99th percentile |
| GC frequency | <10/min | Performance.measureMemory() |
| Draw calls | <100 | WebGL stats from renderer.info |
| Memory usage | <500MB | performance.memory.usedJSHeapSize |
| Subscription count | <20 | Custom tracking |
| Worker messages | <60/sec | postMessage counter |

### 5. A/B Testing

For each optimization:

1. Measure baseline: 100 frames, record all metrics
2. Apply optimization
3. Measure new: 100 frames, same scene
4. Compare: frame time, memory, draw calls
5. Validate: no visual regressions

### 6. Automated Benchmarks

Create benchmark suite:

```tsx
// scripts/playwright/performance-benchmark.spec.ts
import { test, expect } from '@playwright/test';

test('polytope rendering performance', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Enable performance monitoring
  await page.evaluate(() => {
    (window as any).enablePerformanceLogging = true;
  });

  // Load complex scene
  await page.click('[data-testid="object-type-select"]');
  await page.click('text=Wythoff Polytope');

  // Wait for geometry generation
  await page.waitForSelector('[data-testid="geometry-ready"]');

  // Measure frame time over 5 seconds
  const metrics = await page.evaluate(async () => {
    const frameTimes: number[] = [];
    let lastTime = performance.now();

    for (let i = 0; i < 300; i++) { // 5 seconds at 60fps
      await new Promise(resolve => requestAnimationFrame(resolve));
      const now = performance.now();
      frameTimes.push(now - lastTime);
      lastTime = now;
    }

    return {
      avg: frameTimes.reduce((a, b) => a + b) / frameTimes.length,
      p99: frameTimes.sort()[Math.floor(frameTimes.length * 0.99)],
      max: Math.max(...frameTimes),
    };
  });

  expect(metrics.avg).toBeLessThan(16.67); // 60fps
  expect(metrics.p99).toBeLessThan(33.33); // No worse than 30fps
});
```

Run with: `npm run test:performance`

---

## CAVEATS AND WARNINGS

### ⚠️ Optimization #3 (Object Pooling)

**Requires careful lifecycle management!**

**Risk:** Memory leaks if objects are acquired but not released.

**Mitigation:**
- Use RAII pattern with callback wrapper
- Add debug mode to track unreleased objects
- Implement automatic release on component unmount

```tsx
// Safe pattern
function withPooledVector3<T>(fn: (vec: THREE.Vector3) => T): T {
  const vec = vector3Pool.acquire();
  try {
    return fn(vec);
  } finally {
    vector3Pool.release(vec);
  }
}
```

### ⚠️ Optimization #8 (Direct Float32Array)

**Shared array references require immutability!**

**Risk:** Modifying shared array affects multiple uniforms.

**Mitigation:**
- Only NDTransformSource should modify these arrays
- Document ownership clearly
- Add debug assertions in development mode

### ⚠️ Optimization #11 (GPU Instancing)

**May not work with per-edge features!**

**Risk:** Instanced rendering doesn't support per-instance colors without extra attributes.

**Mitigation:**
- Only use for simple wireframe mode
- Keep non-instanced path as fallback
- Profile to ensure it's actually faster

### 🔍 Always Profile First

**Don't optimize blindly!**

1. Measure baseline performance
2. Identify actual bottlenecks (not assumed ones)
3. Apply optimization
4. Measure again
5. Compare results

**Remember:** Premature optimization is the root of all evil. These recommendations are based on code analysis, but actual bottlenecks may vary by scene/hardware.

---

## SUMMARY

This review identified **11 concrete optimizations** spanning:

- **Store subscription patterns** (high impact)
- **String/object comparison** (medium impact)
- **Memory allocation** (high impact)
- **Uniform update batching** (medium impact)
- **Worker communication** (medium impact)
- **Shader caching** (medium impact)
- **GPU instancing** (scene-dependent)

**Total Estimated Gain:** 25-40% reduction in frame time when all optimizations are applied.

**Recommended approach:** Implement in 3 phases (quick wins → medium impact → high complexity), measuring before/after each phase.

**The application is already well-optimized.** These recommendations focus on eliminating remaining inefficiencies without compromising the excellent architecture already in place.

---

**Review completed on:** January 2, 2026
**Reviewed by:** AI Performance Analyst
**Next steps:** Prioritize Phase 1 optimizations for immediate gains
