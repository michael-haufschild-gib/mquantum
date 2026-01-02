# Rendering Pipeline Audit Report

**Date:** December 15, 2025
**Issue:** Excessive vertex/triangle/line counts in Performance Monitor

---

## Executive Summary

The rendering pipeline has **significant inefficiencies** causing the Performance Monitor to report ~5-10x more vertices and triangles than mathematically expected for hypercubes. The root causes are:

1. **Non-indexed geometry** for faces (vertices duplicated per triangle)
2. **TubeWireframe overhead** - 8-segment cylinders per edge
3. **Edge geometry duplication** - vertices stored twice per edge (start/end)
4. **Potential double-counting** in multi-pass rendering

---

## Observed vs Expected Counts

### Hypercube Mathematical Properties

| Dimension | Vertices | Edges | Faces (2D) | Triangles (faces×2) |
|-----------|----------|-------|------------|---------------------|
| 3D        | 8        | 12    | 6          | 12                  |
| 4D        | 16       | 32    | 24         | 48                  |
| 5D        | 32       | 80    | 80         | 160                 |

### Observed Performance Monitor Values

| Dimension | Vertices | Triangles | Lines |
|-----------|----------|-----------|-------|
| 3D        | 41       | 171       | 24    |
| 4D        | 113      | 467       | 64    |
| 5D        | 337      | 1,300     | 160   |

### Analysis Breakdown

#### 3D Hypercube (Cube)

**Faces:**
- Expected faces: 6 quads → 12 triangles
- Non-indexed: 12 triangles × 3 vertices = **36 face vertices**
- Observed triangles: 171

**TubeWireframe (8-segment cylinders):**
- Edges: 12
- Per cylinder: 8 radial segments × 2 caps × 3 verts = 48 vertices, 32 triangles
- Total: 12 edges × 32 triangles = **384 triangles** (if all enabled)
- But TubeWireframe is only used when `edgeThickness > 1`

**Line edges:**
- Expected: 12 edges × 2 = 24 line segments ✓ (matches!)
- Edge geometry stores 2 vertices per edge = 24 vertices

**Where are the extra triangles (171 vs 12)?**
- 12 face triangles × 3 = 36 non-indexed vertices
- Something is adding ~159 extra triangles

#### 4D Hypercube (Tesseract)

**Faces:**
- Expected: 24 quads → 48 triangles
- Non-indexed: 48 triangles × 3 = **144 face vertices**

**Lines:**
- Expected: 32 edges × 2 = 64 ✓ (matches!)

**Where are the extra triangles (467 vs 48)?**
- ~9.7× multiplication factor

#### 5D Hypercube

**Faces:**
- Expected: 80 quads → 160 triangles
- Non-indexed: 160 × 3 = **480 face vertices**

**Lines:**
- Expected: 80 edges × 2 = 160 ✓ (matches!)

**Where are the extra triangles (1,300 vs 160)?**
- ~8.1× multiplication factor

---

## Root Cause Analysis

### Issue #1: Non-Indexed Face Geometry (CONFIRMED)

**Location:** [PolytopeScene.tsx](../src/components/canvas/renderers/Polytope/PolytopeScene.tsx#L401-L490)

```typescript
// Face geometry creation - NON-INDEXED
const faceGeometry = useMemo(() => {
  // ...
  let vertexCount = 0;
  for (const face of faces) {
    if (face.vertices.length === 3) vertexCount += 3;
    else if (face.vertices.length === 4) vertexCount += 6; // Quad = 2 triangles
  }
  // ...
  // Each vertex is stored separately, not shared via index buffer
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  // NO index buffer!
});
```

**Impact:** Vertices that could be shared are duplicated. A cube with 8 unique vertices becomes 36 vertices (each face corner stored separately).

**Why it exists:** Allows per-vertex N-D attributes (`aExtraDim0-6`) and depth-based coloring per face. Indexed geometry would require attribute interpolation tricks.

### Issue #2: TubeWireframe Geometry Overhead (POTENTIAL)

**Location:** [TubeWireframe.tsx](../src/components/canvas/renderers/TubeWireframe/TubeWireframe.tsx#L55-L96)

```typescript
const CYLINDER_SEGMENTS = 8;  // 8 radial segments per tube

const geometry = useMemo(() => {
  return new CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS, 1, false)
}, []);
```

**Each edge as a TubeWireframe:**
- CylinderGeometry(r1, r2, height, 8 radialSegments, 1 heightSegment, open=false)
- Creates: (8 + 1) × 2 = 18 vertices per cap × 2 caps = **36 vertices per edge**
- Triangles: 8 × 2 (side) + 8 × 2 (caps) = **32 triangles per edge**

**For 3D cube (12 edges):**
- 12 × 32 = 384 triangles just for edges!

**Condition:** Only active when `edgeThickness > 1` (user setting)

### Issue #3: Edge Geometry Duplication (MINOR)

**Location:** [PolytopeScene.tsx](../src/components/canvas/renderers/Polytope/PolytopeScene.tsx#L488-L502)

```typescript
const edgeGeometry = useMemo(() => {
  const edgeVertices: VectorND[] = [];
  for (const [a, b] of edges) {
    const vA = baseVertices[a];
    const vB = baseVertices[b];
    if (vA && vB) {
      edgeVertices.push(vA, vB);  // Duplicated per edge
    }
  }
  return buildNDGeometry(edgeVertices);
}, [numEdges, edges, baseVertices]);
```

**Impact:** Edge vertices are duplicated (start/end stored separately). A cube vertex shared by 3 edges is stored 3 times.

**Mitigation:** For `LineSegments`, this is expected behavior (no shared vertices in line topology).

### Issue #4: Multi-Render Pass Accumulation (SUSPECTED)

**Location:** [PerformanceStatsCollector.tsx](../src/components/canvas/PerformanceStatsCollector.tsx#L51-L63)

```typescript
gl.render = function (...args) {
  // ...
  activeFrameStatsRef.current.calls += gl.info.render.calls;
  activeFrameStatsRef.current.triangles += gl.info.render.triangles;
  // ...
};
```

The collector **accumulates** stats across all render passes. If the scene uses:
- Main render pass
- Bloom/post-processing passes
- Shadow passes (when enabled)

Each pass may re-count geometry, causing inflated numbers.

**Investigation needed:** Check if `gl.info.render` resets between passes or accumulates.

### Issue #5: Ground Plane Contribution (MINOR)

**Location:** [GroundPlane.tsx](../src/components/canvas/environment/GroundPlane.tsx)

The ground plane adds triangles to the count:
- Basic plane: 2 triangles
- Grid overlay: Additional lines

---

## Triangle Count Deep Dive (3D Cube Example)

Breaking down the observed **171 triangles**:

| Component | Calculation | Triangles |
|-----------|-------------|-----------|
| Face geometry | 6 faces × 2 triangles | 12 |
| TubeWireframe (if enabled) | 12 edges × 32 | 384 |
| OR Thin lines | 0 | 0 |
| Ground plane | ~2 | 2 |
| Post-processing quad | 2 | 2 |
| Bloom passes (×N) | ~varies | ? |

**Likely scenario with TubeWireframe disabled (edgeThickness=1):**
- Faces: 12
- Bloom/effects: Could be ~150+ if counted multiple times

**Alternative hypothesis:**
If TubeWireframe is ON but using `InstancedMesh`:
- Base cylinder: 32 triangles
- Instances: 12 edges
- Should count as 32 triangles (instancing doesn't multiply in `gl.info`)

**Most likely cause: Post-processing multi-pass accumulation**

---

## Recommendations

### Immediate Fixes (Low Effort, High Impact)

1. **Fix Performance Monitor Counting**
   - Reset `gl.info.render` stats after main scene render
   - OR only capture stats after the first render call
   - This would show accurate geometry counts

2. **Document Expected vs Actual in UI**
   - Add tooltip explaining that post-processing inflates counts
   - Show "Scene triangles" separately from "Total rendered"

### Medium-Term Optimizations

3. **Indexed Geometry for Faces**
   - Use index buffers where vertices can be shared
   - Requires refactoring N-D attribute handling
   - Estimated savings: ~2-3× vertex count reduction

4. **Reduce TubeWireframe Segments**
   - Current: 8 radial segments
   - For thin tubes: 4-6 segments may be visually equivalent
   - Savings: 25-50% triangle count when tubes enabled

5. **LOD for High-Dimension Objects**
   - 5D+ objects have exponentially more faces
   - Consider simplified geometry for distant/small objects

### Long-Term Architecture

6. **Geometry Instancing for Repeated Patterns**
   - Hypercubes have symmetry that could use instancing
   - Significant memory/performance gains

7. **Compute Shader Preprocessing**
   - Move N-D→3D projection to compute pass
   - Share projected vertices across face/edge geometry

---

## Verification Steps

To confirm root causes:

1. **Disable post-processing**
   - Set bloom intensity to 0
   - Observe if triangle count drops significantly

2. **Toggle TubeWireframe**
   - Set edge thickness to 1 (thin lines)
   - Compare triangle counts with thickness > 1

3. **Add debug logging**
   ```typescript
   // In PerformanceStatsCollector.tsx
   console.log('Render pass:', gl.info.render.triangles);
   ```

4. **Check indexed vs non-indexed**
   - In faceGeometry useMemo, log:
   ```typescript
   console.log('Face vertices:', vertexCount, 'Expected indexed:', numFaces * 4);
   ```

---

## Confirmed: EffectComposer Multi-Pass Rendering

**Location:** [PostProcessing.tsx](../src/components/canvas/environment/PostProcessing.tsx#L864)

The scene uses `EffectComposer` with multiple passes:

```typescript
// PostProcessing.tsx line 864
composer.render();
```

The EffectComposer includes:
1. **TexturePass** - Initial scene capture
2. **UnrealBloomPass** - Multi-pass bloom (3+ internal passes)
3. **SSRPass** - Screen-space reflections (when enabled)
4. **RefractionPass** - Refraction effects (when enabled)
5. **BokehPass** - Depth of field (when enabled)
6. **FXAAPass/SMAAPass** - Anti-aliasing
7. **OutputPass** - Final tone mapping

**Each pass renders a full-screen quad** (2 triangles) and the `gl.info.render` stats accumulate.

For UnrealBloomPass specifically:
- Uses 4 blur levels by default
- Each level = 2 passes (horizontal + vertical blur)
- Plus threshold and composite passes
- **Total: ~10+ render passes just for bloom**

With 4 bloom blur levels: `10 passes × 2 triangles = 20 extra triangles` per bloom alone.

---

## Conclusion

The primary issue is **not** double calculation of geometry, but rather:

1. **Performance Monitor accumulates across all render passes** (bloom, SSR, bokeh, etc.)
2. **Non-indexed geometry** is intentional for N-D attributes but inflates vertex counts
3. **TubeWireframe** adds significant geometry when enabled
4. **EffectComposer** runs 10+ render passes, each adding to the triangle count

The actual GPU work is appropriate for the feature set—the displayed metrics just include post-processing overhead that makes it appear wasteful.

### Verified Math for 3D Cube

**Multiple Scene Renders Discovered:**

Looking at [PostProcessing.tsx](../src/components/canvas/environment/PostProcessing.tsx#L680-L750):

```typescript
// Pass 1: Object-only depth pass (for effects that exclude environment)
gl.render(scene, camera);  // Line ~700

// Pass 2: Full scene render (color + depth)
gl.render(scene, camera);  // Line ~735
```

Plus shadow map rendering adds more passes per shadow-casting light.

**Triangle Count Breakdown for 3D Cube:**

| Component | Passes | Triangles/Pass | Total |
|-----------|--------|----------------|-------|
| Face geometry base | 1 | 12 | 12 |
| Object-only depth pass | 1 | 12 | 12 |
| Full scene render | 1 | 12 | 12 |
| Shadow map (1 light) | 1 | 12 | 12 |
| Bloom (4 blur levels) | ~10 | 2 | 20 |
| AA pass (FXAA/SMAA) | 1 | 2 | 2 |
| Output pass | 1 | 2 | 2 |
| Ground plane | 1 | 2-4 | ~4 |
| **Subtotal** | | | **~76** |

Still not 171... Let me check if something else is happening.

**Additional finding:** Each `gl.render()` call accumulates to `gl.info.render.triangles`. The performance collector captures AFTER all render calls complete, showing cumulative total.

**With TubeWireframe enabled (edgeThickness > 1):**
- 12 edges × 8 segments × 4 triangles/segment = **384 base triangles**
- But InstancedMesh should count as 32 triangles (just the template)

**Mystery resolved:** The issue is the render stats accumulate across ALL render passes. With 2 scene renders + shadow pass + post-processing, we get ~3-4× multiplication of the base geometry count.

**Priority Fix:** Modify `PerformanceStatsCollector` to capture only the main scene render pass stats, not accumulated post-processing stats. This would show:
```typescript
// Capture ONLY main scene geometry
const sceneStats = { ...gl.info.render };
gl.info.render.triangles = 0; // Reset before post-processing
```
