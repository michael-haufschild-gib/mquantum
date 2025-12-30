# Performance Bug: Hypercube Polytope Face Rendering in Higher Dimensions

**Date:** 2024-12-30
**Status:** Analyzed
**Severity:** High
**Affects:** 11D hypercube (and higher dimensions) with faces enabled

## Summary

The hypercube polytope experiences severe performance degradation (~single-digit FPS) when rendering faces in higher dimensions (11D) during rotation. The root cause is an inefficient vertex shader design that performs **3× more N-dimensional transforms than necessary**.

## Symptoms

- 11D hypercube with faces active: single-digit FPS during rotation
- Performance degrades progressively with dimension
- Issue only occurs when faces are visible (edges-only is fast)
- Regression from earlier versions (possibly introduced with "optimizations")

## Root Cause Analysis

### The Problem

The face vertex shader in `src/rendering/shaders/polytope/compose.ts` (lines 57-59) transforms **all 3 vertices of each triangle** on every vertex shader invocation:

```glsl
vec3 v0_projected = transformND();           // This vertex
vec3 v1_projected = transformNeighbor1();    // Neighbor 1
vec3 v2_projected = transformNeighbor2();    // Neighbor 2
```

However, the face normal uses `flat out vec3 vFaceNormal`, which means **only the first vertex (provoking vertex) of each triangle** contributes its computed normal. The normals computed by the other 2 vertices of each triangle are discarded due to flat interpolation.

### Wasted Work Calculation

For each triangle:
- 3 vertex shader invocations occur
- Each invocation transforms 3 vertices (self + 2 neighbors)
- Only 1 invocation's normal calculation is used (the provoking vertex)
- **2/3 of all neighbor transforms are wasted**

### Impact by Dimension

| Dimension | Quads | Triangles | Vertex Invocations | Transforms/Frame | **Actually Needed** |
|-----------|-------|-----------|-------------------|------------------|---------------------|
| 3D | 6 | 12 | 36 | 108 | 36 |
| 4D | 24 | 48 | 144 | 432 | 144 |
| 5D | 80 | 160 | 480 | 1,440 | 480 |
| 6D | 240 | 480 | 1,440 | 4,320 | 1,440 |
| 7D | 672 | 1,344 | 4,032 | 12,096 | 4,032 |
| 8D | 1,792 | 3,584 | 10,752 | 32,256 | 10,752 |
| 9D | 4,608 | 9,216 | 27,648 | 82,944 | 27,648 |
| 10D | 11,520 | 23,040 | 69,120 | 207,360 | 69,120 |
| 11D | 28,160 | 56,320 | 168,960 | **506,880** | **168,960** |

At 11D, we're doing **3× the GPU work** needed.

### Additional Shader Inefficiency

Each `transformNDFromInputs` call in `src/rendering/shaders/polytope/transform-nd.glsl.ts` contains expensive dynamic branching:

```glsl
// Loop 1: Up to 7 iterations with conditional
for (int i = 0; i < 7; i++) {
  if (i + 5 <= uDimension) {
    // ... transform logic
  }
}

// Loop 2: Up to 11 iterations with conditional
for (int j = 0; j < 11; j++) {
  if (j < uDimension) {
    effectiveDepth += uDepthRowSums[j] * inputs[j];
  }
}
```

Dynamic branching (`if` inside loops) is particularly expensive on GPUs as it can cause thread divergence and prevent SIMD parallelization.

## Recommended Fixes

### Option 1: Skip Neighbor Transforms for Non-Provoking Vertices (Easiest)

Use `gl_VertexID % 3` to detect the provoking vertex:

```glsl
void main() {
  vec3 v0_projected = transformND(); // Always needed for position

  vec3 faceNormal;
  if (gl_VertexID % 3 == 0) {
    // Only compute neighbors for provoking vertex (first vertex of triangle)
    vec3 v1_projected = transformNeighbor1();
    vec3 v2_projected = transformNeighbor2();
    // ... modulation ...
    faceNormal = computeFaceNormal(modulated, v1_modulated, v2_modulated);
  } else {
    // Dummy value - will be overwritten by flat interpolation from provoking vertex
    faceNormal = vec3(0.0, 0.0, 1.0);
  }

  vFaceNormal = faceNormal;
  // ... rest of shader
}
```

**Expected improvement:** ~3× reduction in transform work (506,880 → 168,960 + 112,640 = 281,600)

### Option 2: Optimize Shader Loops (Complementary)

Replace dimension-conditional loops with uniform-bounded loops:

```glsl
// Before (inefficient):
for (int i = 0; i < 7; i++) {
  if (i + 5 <= uDimension) { ... }
}

// After (optimized):
int extraDimCount = uDimension - 4;
for (int i = 0; i < extraDimCount; i++) { ... }
```

**Note:** GLSL requires compile-time constant loop bounds in some cases. May need `#pragma optionNV (unroll all)` or similar.

### Option 3: Use Geometry Shader (Best but requires WebGL2 extension)

Compute face normal once per primitive in geometry shader instead of per vertex.

### Option 4: Indexed Geometry with Vertex Sharing

Use indexed geometry and compute normals differently, but this would require significant architecture changes.

## Files to Modify

1. `src/rendering/shaders/polytope/compose.ts` - Face vertex shader main function
2. `src/rendering/shaders/polytope/transform-nd.glsl.ts` - Transform function loops

## Verification Criteria

After implementing fixes:

1. **Performance:** 11D hypercube maintains 30+ FPS during rotation with faces enabled
2. **Visual correctness:** Face normals render correctly (no lighting artifacts)
3. **No regression:** Lower dimensions (3D-7D) perform at least as well as before
4. **Test coverage:** Run existing tests to ensure no breakage

## Related Files

- `src/rendering/renderers/Polytope/PolytopeScene.tsx` - Face geometry construction
- `src/lib/geometry/hypercube.ts` - Hypercube face generation
- `src/rendering/shaders/polytope/modulation.glsl.ts` - Vertex modulation

## Notes

- The architecture of passing neighbor vertices as attributes is sound for correctness
- The issue is purely about when to compute neighbors, not whether to have them available
- This fix should also improve TubeWireframe if it uses similar neighbor patterns
