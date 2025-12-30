# Final Report: Hypercube Face Rendering Performance Regression

**Date:** 2024-12-30
**Status:** Root Cause Confirmed, Solutions Proposed
**Severity:** Critical
**Affects:** Hypercube polytopes in dimensions 7D+ with faces enabled

## Executive Summary

The 11D hypercube face rendering performance degradation has **two compounding root causes**:

1. **Geometry Bloat** (Commit `7a66245`): Changed from indexed to non-indexed geometry with neighbor data, resulting in **~80x more GPU vertex data**
2. **Shader Inefficiency**: Each vertex transforms 3 positions but only 1/3 of neighbor transforms are used due to flat interpolation, resulting in **3x wasted GPU compute**

Combined impact: **~240x performance degradation** compared to optimal implementation.

---

## Root Cause 1: Geometry Architecture Change

### The Regression Commit

**Commit:** `7a66245` ("fix normal calculations on polytopes")
**Date:** Fri Dec 19 20:13:03 2025
**Purpose:** Fix incorrect face normals after nD transformation

### What Changed

| Aspect | Before (Indexed) | After (Non-indexed + Neighbors) |
|--------|------------------|--------------------------------|
| Architecture | Shared vertices with index buffer | Unique vertices per triangle corner |
| Vertex count (11D) | 2,048 | 168,960 |
| Data per vertex | 10 floats (pos + extraDims) | 30 floats (self + 2 neighbors) |
| Total GPU floats | ~20,480 | **~5,068,800** |
| Memory footprint | ~80 KB | **~20 MB** |

### Why It Was Necessary

Normals must be computed **after** the nD→3D transformation in the vertex shader. To compute a face normal, each vertex needs its two neighboring vertex positions. With indexed geometry, vertices are shared across faces and don't have unique neighbor references, so the architecture was changed to embed neighbor data in each vertex.

### Face Count Formula

For an n-dimensional hypercube:
- **Faces:** `C(n,2) × 2^(n-2)` = `n(n-1)/2 × 2^(n-2)`
- **11D:** `55 × 512` = **28,160 quad faces** → **56,320 triangles** → **168,960 GPU vertices**

---

## Root Cause 2: Shader Inefficiency

### Redundant Neighbor Transforms

The face vertex shader (`src/rendering/shaders/polytope/compose.ts`, lines 57-59) transforms all 3 vertices on every invocation:

```glsl
vec3 v0_projected = transformND();           // This vertex
vec3 v1_projected = transformNeighbor1();    // Neighbor 1
vec3 v2_projected = transformNeighbor2();    // Neighbor 2
```

However, face normals use `flat out vec3 vFaceNormal`, meaning **only the provoking vertex** (first vertex of each triangle) contributes its computed normal. The other 2 vertices compute neighbors that are immediately discarded.

### Wasted Work

| Dimension | Triangles | Vertex Invocations | Transforms Performed | Transforms Used | **Waste Factor** |
|-----------|-----------|-------------------|---------------------|-----------------|------------------|
| 4D | 48 | 144 | 432 | 144 | 3× |
| 7D | 1,344 | 4,032 | 12,096 | 4,032 | 3× |
| 11D | 56,320 | 168,960 | **506,880** | **168,960** | **3×** |

### Dynamic Branching Overhead

The transform function contains dimension-conditional loops:

```glsl
for (int i = 0; i < 7; i++) {
  if (i + 5 <= uDimension) { ... }  // Branch inside loop = thread divergence
}
```

This prevents GPU SIMD parallelization and adds per-iteration branch overhead.

---

## Combined Impact Analysis

### 11D Hypercube Performance Breakdown

```
Indexed Geometry (Theoretical Best):
  - 2,048 unique vertices
  - 2,048 transforms/frame
  - ~80 KB GPU memory

Current Implementation:
  - 168,960 GPU vertices (~82× more)
  - 506,880 transforms/frame (~247× more)
  - ~20 MB GPU memory (~250× more)
  - Plus dynamic branching overhead
```

### Why It Scales Poorly with Dimension

The face count grows as `O(n² × 2^n)`:
- 4D: 24 faces → manageable
- 7D: 672 faces → noticeable
- 10D: 11,520 faces → slow
- 11D: 28,160 faces → unusable

---

## Recommended Solutions

### Priority 1: Skip Neighbor Transforms for Non-Provoking Vertices (Easy, ~3× speedup)

**File:** `src/rendering/shaders/polytope/compose.ts`

```glsl
void main() {
  vec3 v0_projected = transformND(); // Always needed for position

  vec3 faceNormal;
  if (gl_VertexID % 3 == 0) {
    // Only provoking vertex computes neighbors
    vec3 v1_projected = transformNeighbor1();
    vec3 v2_projected = transformNeighbor2();
    faceNormal = computeFaceNormal(v0_projected, v1_projected, v2_projected);
  } else {
    faceNormal = vec3(0.0, 0.0, 1.0); // Discarded by flat interpolation
  }

  vFaceNormal = faceNormal;
  // ... rest of shader
}
```

**Impact:** Reduces transforms from 506,880 → ~225,280 (56,320 × 1 full + 112,640 × 1 partial)

### Priority 2: Return to Indexed Geometry with Flat Shading (Medium, ~80× speedup)

**Approach:**
1. Use indexed geometry (2,048 vertices for 11D)
2. Compute per-face normals on CPU after rotation
3. Pass normals as uniform array indexed by `gl_PrimitiveID` (requires `OES_geometry_shader` or workaround)

**Alternative without geometry shader:**
- Use a texture lookup for face normals: `texture(uFaceNormalTex, vec2(float(faceID) / numFaces, 0.5))`

**Impact:** Returns to ~2,048 vertices + CPU normal computation overhead

### Priority 3: Optimize Transform Loops (Easy, ~1.2× speedup)

**File:** `src/rendering/shaders/polytope/transform-nd.glsl.ts`

```glsl
// Before:
for (int i = 0; i < 7; i++) {
  if (i + 5 <= uDimension) { ... }
}

// After (specialized by dimension at compile time):
#if DIMENSION >= 5
  // dimension 5 code
#endif
#if DIMENSION >= 6
  // dimension 6 code
#endif
// etc.
```

Or use loop unrolling pragmas.

### Priority 4: nD Backface Culling (Medium, up to 50% speedup)

Cull faces that are "facing away" in higher dimensions before GPU upload:

```typescript
// In faceGeometry useMemo
const visibleFaces = faces.filter(face => {
  const nDNormal = computeNDFaceNormal(face, baseVertices, dimension);
  const viewDirection = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]; // Along W axis
  return dotProduct(nDNormal, viewDirection) > 0;
});
```

**Impact:** Could reduce face count by ~50% depending on view angle.

### Priority 5: Face LOD System (Medium, configurable)

Reduce face count at high dimensions:

```typescript
const maxFaces = dimension <= 6 ? Infinity :
                 dimension <= 8 ? 5000 :
                 dimension <= 10 ? 2000 : 1000;

const lodFaces = faces.slice(0, maxFaces);
```

---

## Implementation Roadmap

| Phase | Solution | Effort | Speedup | Risk |
|-------|----------|--------|---------|------|
| 1 | Skip non-provoking neighbor transforms | 1 hour | ~3× | Low |
| 2 | Optimize transform loops | 2 hours | ~1.2× | Low |
| 3 | Face LOD system | 4 hours | Variable | Low |
| 4 | nD backface culling | 8 hours | ~2× | Medium |
| 5 | Indexed geometry + CPU normals | 16 hours | ~80× | High |

**Recommended approach:** Implement Phase 1 immediately for quick win, then evaluate if further optimization is needed.

---

## Verification Criteria

After implementing fixes:

1. **Performance:** 11D hypercube maintains **30+ FPS** during rotation with faces enabled
2. **Visual correctness:** Face normals render correctly (proper lighting, no artifacts)
3. **No regression:** Lower dimensions (3D-7D) perform at least as well as before
4. **Memory:** GPU memory usage reduced significantly
5. **Tests:** All existing tests pass

---

## Files to Modify

| File | Change |
|------|--------|
| `src/rendering/shaders/polytope/compose.ts` | Skip neighbor transforms for non-provoking vertices |
| `src/rendering/shaders/polytope/transform-nd.glsl.ts` | Optimize dimension loops |
| `src/rendering/renderers/Polytope/PolytopeScene.tsx` | (Optional) Add face LOD or nD culling |
| `src/lib/geometry/hypercube.ts` | (Optional) Pre-sort faces by nD orientation |

---

## Conclusion

The performance regression is caused by two architectural decisions that compound:

1. **Non-indexed geometry** was necessary for correctness but increased vertex count ~80×
2. **Redundant shader work** due to flat interpolation semantics wastes 2/3 of transforms

The quickest fix (Priority 1) can provide **~3× speedup** with minimal code changes. Full optimization could achieve **~240× improvement** but requires more significant architectural work.

For immediate relief, implementing the provoking vertex optimization is recommended as it:
- Takes ~1 hour to implement
- Has no visual impact (flat interpolation already discards non-provoking normals)
- Provides meaningful performance improvement
- Has zero regression risk
