# Performance Optimization Implementation Plan

**Generated:** January 2, 2026
**Source:** Validated findings from review-codex.md, review-vscode.md, review-cursor.md
**Validation:** Each item verified against actual codebase

---

## Overview

This plan includes **16 actionable optimizations** that were validated as beneficial. The 16 invalid/counterproductive suggestions have been excluded.

**Estimated Total Impact:** 2-3ms per frame improvement

---

## P0 - HIGH PRIORITY

### 1. CODEX-1: Unify Dual RAF Drivers

**Impact:** 1-2ms per frame when animation is playing

**Problem:**
Two separate `requestAnimationFrame` loops run simultaneously:
- `FpsController.tsx:50` - Controls render timing via `advance()`
- `useAnimationLoop.ts:60,78,119` - Updates rotation state

When animation is playing, both RAF callbacks execute every frame, causing redundant wakeups.

**Files to modify:**
- `src/hooks/useAnimationLoop.ts`
- `src/rendering/controllers/FpsController.tsx`

**Solution:**
Move rotation updates from separate RAF to R3F's `useFrame` callback with appropriate priority:

```typescript
// In a new hook or integrated into existing renderer
useFrame((state, delta) => {
  if (!isPlaying || animatingPlanes.size === 0) return;

  const rotationDelta = getRotationDelta(delta * 1000);
  // ... update rotations
}, FRAME_PRIORITY.ANIMATION); // Before render reads
```

**Risk:** Low - useFrame priority system ensures correct execution order

---

### 2. CODEX-2: Throttle Autofocus Raycaster

**Impact:** High when autofocus enabled (raycast every frame is expensive)

**Problem:**
When `bokehFocusMode === 'auto-center'` or `'auto-mouse'`, the raycaster runs every frame with no throttling:

```typescript
// PostProcessingV2.tsx:1588-1590
if (pp.bokehFocusMode === 'auto-center' || pp.bokehFocusMode === 'auto-mouse') {
  autoFocusRaycaster.setFromCamera(screenCenter, camera);
  const intersects = autoFocusRaycaster.intersectObjects(scene.children, true);
```

`intersectObjects(scene.children, true)` traverses entire scene graph every frame.

**Files to modify:**
- `src/rendering/environment/PostProcessingV2.tsx`

**Solution:**
Add time-based throttling (100ms) or camera movement detection:

```typescript
const lastRaycastTimeRef = useRef(0);
const RAYCAST_INTERVAL = 100; // ms

// In useFrame:
if (pp.bokehFocusMode === 'auto-center' || pp.bokehFocusMode === 'auto-mouse') {
  const now = performance.now();
  if (now - lastRaycastTimeRef.current > RAYCAST_INTERVAL) {
    lastRaycastTimeRef.current = now;
    autoFocusRaycaster.setFromCamera(screenCenter, camera);
    const intersects = autoFocusRaycaster.intersectObjects(scene.children, true);
    // ... update focus
  }
}
```

**Risk:** Low - focus distance changes smoothly anyway via `bokehSmoothTime`

---

## P1 - MEDIUM PRIORITY

### 3. CODEX-3: Dirty-Check ND Uniforms

**Impact:** 0.3-0.5ms per frame

**Problem:**
`updateNDUniforms` runs every frame without version guard:

```typescript
// PolytopeScene.tsx:869
updateNDUniforms(material, gpuData, dimension, visualScale, projectionDistance);
// Not inside any version check!
```

Other uniforms (appearance, IBL) ARE properly guarded.

**Files to modify:**
- `src/rendering/renderers/Polytope/PolytopeScene.tsx`

**Solution:**
Add version tracking for ND transform:

```typescript
const lastNDVersionRef = useRef(-1);

// In useFrame:
const ndVersion = ndTransform.source.version;
const ndChanged = ndVersion !== lastNDVersionRef.current;

if (ndChanged) {
  updateNDUniforms(material, gpuData, dimension, visualScale, projectionDistance);
  lastNDVersionRef.current = ndVersion;
}
```

**Risk:** Low - NDTransformSource already has version tracking

---

### 4. CODEX-4: Graph Active-Pass Short-Circuit

**Impact:** 0.2-0.5ms per frame when effects disabled

**Problem:**
Execute loop iterates ALL 20+ passes even when most are disabled:

```typescript
// RenderGraph.ts:884-889
for (const pass of this.compiled.passes) {
  const enabled = !debugDisabled && (pass.config.enabled?.(frozenFrameContext) ?? true)
  // ... even disabled passes do passthrough work
}
```

**Files to modify:**
- `src/rendering/graph/RenderGraph.ts`

**Solution:**
Cache enabled passes and rebuild only when configuration changes:

```typescript
private enabledPassCache: RenderPass[] | null = null;
private enabledPassCacheVersion = -1;

execute(...) {
  const configVersion = this.computeConfigVersion(frozenFrameContext);
  if (configVersion !== this.enabledPassCacheVersion) {
    this.enabledPassCache = this.compiled.passes.filter(pass =>
      pass.config.enabled?.(frozenFrameContext) ?? true
    );
    this.enabledPassCacheVersion = configVersion;
  }

  for (const pass of this.enabledPassCache!) {
    // ... only iterate enabled passes
  }
}
```

**Risk:** Medium - must ensure passthrough/aliasing still works for disabled passes

---

## P2 - LOW PRIORITY

### 5. CODEX-5: Clear Color Change Detection

**Impact:** ~0.1ms per frame (micro-optimization)

**Problem:**
`setClearColor` and `setMaxSteps` called every frame without change detection:

```typescript
// PostProcessingV2.tsx:1575-1581
const clearColor = env.skyboxEnabled ? 0x000000 : env.backgroundColor;
passRefs.current.scenePass?.setClearColor(clearColor);
passRefs.current.ssr.setMaxSteps(SSR_QUALITY_STEPS[effectiveQuality] ?? 32);
```

**Files to modify:**
- `src/rendering/environment/PostProcessingV2.tsx`

**Solution:**
Add simple change detection:

```typescript
const lastClearColorRef = useRef<number | null>(null);
const lastSSRStepsRef = useRef<number | null>(null);

// In useFrame:
const clearColor = env.skyboxEnabled ? 0x000000 : env.backgroundColor;
if (clearColor !== lastClearColorRef.current) {
  passRefs.current.scenePass?.setClearColor(clearColor);
  lastClearColorRef.current = clearColor;
}

const ssrSteps = SSR_QUALITY_STEPS[effectiveQuality] ?? 32;
if (ssrSteps !== lastSSRStepsRef.current) {
  passRefs.current.ssr.setMaxSteps(ssrSteps);
  lastSSRStepsRef.current = ssrSteps;
}
```

**Risk:** None

---

### 6. CODEX-8: Resource Teardown Documentation

**Impact:** Memory savings for long-running sessions

**Problem:**
Pool resources (shared render targets) persist even after passes are disabled for extended periods. This is BY DESIGN for quick re-enable, but could be configurable.

**Files to modify:**
- `src/rendering/graph/ResourcePool.ts`

**Solution:**
Add optional memory pressure callback for mobile/low-memory scenarios:

```typescript
interface ResourcePoolOptions {
  onMemoryPressure?: () => void;
}

// In ResourcePool:
releaseUnusedResources(unusedThresholdFrames = 300): void {
  // Release resources unused for 5+ seconds
  for (const [id, entry] of this.resources) {
    if (entry.unusedFrames > unusedThresholdFrames) {
      entry.target?.dispose();
      this.resources.delete(id);
    }
  }
}
```

**Risk:** Low - opt-in behavior only

---

### 7. VSCODE-4: PolytopeScene ColorSource Integration

**Impact:** Code cleanup, reduced duplication

**Problem:**
PolytopeScene manually updates color uniforms instead of using existing ColorSource:

```typescript
// PolytopeScene.tsx:485 - MISSING 'color'
...UniformManager.getCombinedUniforms(['lighting', 'pbr-face']),

// PolytopeScene.tsx:910-914 - duplicated logic
if (u.uColorAlgorithm) u.uColorAlgorithm.value = COLOR_ALGORITHM_TO_INT[colorAlgorithm];
if (u.uCosineA) (u.uCosineA.value as Vector3).set(...);
```

Other renderers (Mandelbulb, QuaternionJulia, Schroedinger) correctly use `'color'` source.

**Files to modify:**
- `src/rendering/renderers/Polytope/PolytopeScene.tsx`

**Solution:**
1. Add 'color' to UniformManager calls:
```typescript
// Line 485:
...UniformManager.getCombinedUniforms(['lighting', 'pbr-face', 'color']),

// Line 944:
UniformManager.applyToMaterial(material, ['lighting', 'pbr-face', 'color']);
```

2. Remove manual color uniform updates (lines 910-920)

**Risk:** None - ColorSource already handles all these uniforms

---

### 8. CURSOR-12: Layer Array Caching

**Impact:** Eliminates per-frame array allocation

**Problem:**
New array created every frame:

```typescript
// PostProcessingV2.tsx:1564-1568
const objectDepthLayers: number[] = [RENDER_LAYERS.MAIN_OBJECT];
if (!useTemporalCloud) {
  objectDepthLayers.push(RENDER_LAYERS.VOLUMETRIC);
}
```

**Files to modify:**
- `src/rendering/environment/PostProcessingV2.tsx`

**Solution:**
Define constants at module level:

```typescript
// At top of file, after imports:
const LAYERS_MAIN_ONLY = [RENDER_LAYERS.MAIN_OBJECT] as const;
const LAYERS_MAIN_AND_VOLUMETRIC = [RENDER_LAYERS.MAIN_OBJECT, RENDER_LAYERS.VOLUMETRIC] as const;

// In useFrame:
passRefs.current.objectDepth?.setLayers(
  useTemporalCloud ? LAYERS_MAIN_ONLY : LAYERS_MAIN_AND_VOLUMETRIC
);
```

**Risk:** None

---

## P3 - VERY LOW PRIORITY

### 9. VSCODE-6: Module-Level Shader Caching

**Impact:** ~1ms on rare config changes (multi-instance scenarios only)

**Current:** Shader builders use `useMemo` within component
**Enhancement:** Add module-level cache for cross-instance/remount reuse

**Files:** `src/rendering/shaders/polytope/compose.ts`

---

### 10. CURSOR-1: FrozenFrameContext Pooling

**Impact:** 0.1-0.3ms per frame (GC reduction)

**Current:** Creates ~10-15 small objects per frame
**Enhancement:** Object pooling with careful mutation management

**Files:** `src/rendering/graph/FrameContext.ts`

**Note:** Modern V8 handles frame-scoped allocations efficiently. Only implement if profiling shows GC pressure.

---

### 11. CURSOR-3: ResourcePool Dimension Caching

**Impact:** ~5 microseconds per call

**Current:** `computeDimensions()` called on every `ensureAllocated()`
**Enhancement:** Cache dimensions and invalidate on screen resize

**Files:** `src/rendering/graph/ResourcePool.ts`

**Note:** Computation is simple arithmetic; may not be worth added complexity.

---

### 12. CURSOR-4: Animation Loop Plane Array

**Impact:** Trivial (small sets iterate efficiently)

**Current:** `for...of` on Set
**Enhancement:** Pre-compute array when `animatingPlanes` changes

**Files:** `src/hooks/useAnimationLoop.ts`

---

### 13. CURSOR-5: Camera Matrix Version Tracking

**Impact:** 4 matrix copies per frame (when camera stationary)

**Current:** Matrix copies unconditional
**Enhancement:** Track camera version to skip copies

**Files:** `src/rendering/renderers/Mandelbulb/MandelbulbMesh.tsx`

**Note:** For raymarching, current values are always needed. Low benefit.

---

### 14. CURSOR-7: buildScalesArray Pre-allocation

**Impact:** ~50 nanoseconds per call

**Current:** New array per call
**Enhancement:** Reuse pre-allocated array

**Files:** `src/rendering/renderers/base/useNDTransformUpdates.ts`

**Note:** Already gated by version tracking; calls are infrequent.

---

### 15. CURSOR-9: Pass Timing Array Pre-allocation

**Impact:** Debug mode only

**Current:** Empty array with push operations
**Enhancement:** Pre-allocate based on pass count

**Files:** `src/rendering/graph/RenderGraph.ts`

---

### 16. CURSOR-2: Enabled Pass Caching

**Duplicate of CODEX-4** - see item #4 above.

---

## Implementation Order

**Recommended sequence for maximum impact with minimum risk:**

1. **CURSOR-12** - Layer array caching (5 minutes, zero risk)
2. **CODEX-5** - Clear color change detection (10 minutes, zero risk)
3. **VSCODE-4** - PolytopeScene ColorSource (15 minutes, zero risk)
4. **CODEX-2** - Autofocus throttling (20 minutes, low risk)
5. **CODEX-3** - ND uniform dirty check (15 minutes, low risk)
6. **CODEX-4** - Graph pass short-circuit (30 minutes, medium risk)
7. **CODEX-1** - Unify RAF drivers (45 minutes, low risk)

**Total estimated time:** ~2.5 hours for P0-P2 items

---

## Testing Checklist

After implementing optimizations, verify:

- [ ] Animation playback still works smoothly
- [ ] Autofocus DOF still tracks objects correctly
- [ ] ND rotation/projection renders correctly
- [ ] All post-processing effects still function
- [ ] No visual regressions in any render mode
- [ ] FPS improves as expected (use performance monitor)
- [ ] Memory usage stable over time

---

## Excluded Items (16)

The following were validated as INVALID or counterproductive and should NOT be implemented:

| ID | Reason |
|----|--------|
| CODEX-6 | VRAM traversal already properly gated |
| CODEX-7 | Geometry already properly memoized |
| CODEX-9 | CAS sharpening already gated by useEffect |
| VSCODE-1 | Current store subscription pattern is correct |
| VSCODE-2 | JSON.stringify required for worker communication |
| VSCODE-3 | Three.js objects already properly memoized |
| VSCODE-5 | Bit flags add complexity without benefit |
| VSCODE-7 | No worker message spam exists |
| VSCODE-8 | Float32Array .set() is correct pattern |
| VSCODE-9 | All uniform sources needed; lazy init pointless |
| VSCODE-10 | String comparison fast for 7-char colors |
| VSCODE-11 | Too few objects for GPU instancing benefit |
| CURSOR-6 | State sync consolidation is style preference only |
| CURSOR-8 | External registry capture is 2 trivial reads |
| CURSOR-10 | getState() is trivially fast |
| CURSOR-11 | No color conversion issue exists |

See `docs/reports/review-validated.md` for full validation details.
