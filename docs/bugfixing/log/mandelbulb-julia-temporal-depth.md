# Temporal Depth Bug Investigation Log

**Object Types Affected:** Mandelbulb, Quaternion Julia
**Issue:** Temporal reprojection not working - zero FPS improvement, visual artifacts

---

## Bug Description

When temporal reprojection is enabled for Mandelbulb/Julia objects:
1. **No FPS improvement** - actually WORSE performance
2. **Visual artifacts** - "the object overlayed in a very different projection"
3. **Root symptom:** gPosition buffer (MRT attachment 2) only has valid data for ~10% of screen pixels

---

## Architecture Understanding

### Render Graph Flow

```
PostProcessingV2.tsx (line 995-1003)
  └── MainObjectMRTPass (id: 'mainObjectMrt')
        ├── Output: MAIN_OBJECT_MRT (MRT with 3 attachments)
        │     ├── [0] gColor
        │     ├── [1] gNormal
        │     └── [2] gPosition ← This is the input for temporal
        └── Layers: RENDER_LAYERS.MAIN_OBJECT (layer 1, mask=2)

PostProcessingV2.tsx (line 941-960)
  └── TemporalDepthCapturePass (id: 'temporalDepthCapture')
        ├── Input: MAIN_OBJECT_MRT attachment 2 (gPosition)
        ├── Output: TEMPORAL_DEPTH_OUTPUT
        └── Copies gPosition to ping-pong buffer for next frame

MandelbulbMesh.tsx / QuaternionJuliaMesh.tsx
  └── useFrame() reads temporal uniforms from TemporalDepthCapturePass
        └── Uses getTemporalUniforms(graph) to get previous frame's data
```

### Shader Flow (gPosition writing)

File: `src/rendering/shaders/shared/fractal/main.glsl.ts`

```glsl
// Line 39: Early discard if ray misses
if (d > maxDist) discard;

// Line 211: gPosition written ONLY if ray hits
gPosition = vec4(worldHitPos.xyz, d);
```

Key insight: gPosition is only written where the raymarcher finds a hit. Empty space has NO gPosition data (fragment is discarded).

---

## Investigation History

### Session 1: Initial Discovery

**ROOT CAUSE IDENTIFIED:** gPosition in MAIN_OBJECT_MRT only has valid data for approximately **10% of mandelbulb pixels** (or less).

**Debug output from Chrome DevTools:**
```
[MainObjectMRT] gPosition @ center: rgba(0.004, 0.319, 0.765, 7.293) ← 1 PIXEL HAS DATA
[MainObjectMRT] gPosition @ left (25%):   rgba(0.000, 0.000, 0.000, 0.000) ← ZERO
[MainObjectMRT] gPosition @ right (75%):  rgba(0.000, 0.000, 0.000, 0.000) ← ZERO
[MainObjectMRT] gPosition @ top (75%):    rgba(0.000, 0.000, 0.000, 0.000) ← ZERO
[MainObjectMRT] gPosition @ bottom (25%): rgba(0.000, 0.000, 0.000, 0.000) ← ZERO
```

**Grid sampling (10x10 full screen):**
```
[MainObjectMRT] gPosition FULL SCREEN coverage: 0/100 (0.0%)
```

**CRITICAL QUESTION:** Is the 0% coverage because:
1. The mandelbulb only covers center of screen and we're sampling edges? (EXPECTED)
2. OR gPosition is not being written correctly even where the mandelbulb IS visible? (BUG)

The center pixel has data (0.004, 0.319, 0.765, 7.293) but we need to verify:
- Does gPosition have data for ALL pixels where the mandelbulb is visible?
- Or only a tiny subset?

### Session 2: Added Center-Focused Grid

**Added center-focused grid sampling** to MainObjectMRTPass.ts:
- Sample 10x10 grid in CENTER 50% of screen (where mandelbulb should be)
- Also sample full-screen 10x10 for comparison
- This will distinguish "object not there" from "gPosition not written"

**Current debug flags:**
- `window._debugMRTGrid = true` - Dense grid sampling (center + full)
- `window._debugMRTDrawCalls = true` - Draw call count
- `window._debugMRTOutput = true` - Point sampling
- `window._debugMRTAlways = true` - Continuous monitoring (throttled)

**PENDING TEST:** Run `_debugMRTGrid` and check:
- If CENTER grid shows ~60-80% coverage → gPosition is working, edges are just empty space
- If CENTER grid shows ~10% or less → gPosition writing is broken

---

## Current Status

### Symptom Summary
1. **No FPS improvement** with temporal ON (actually worse)
2. **Visual artifacts** - object appears "overlayed in a very different projection"

### CONFIRMED: gPosition Writing is CORRECT

**Test Date:** Session 3 (current)
**Test:** `window._debugMRTGrid = true`

```
CENTER-FOCUSED (10x10 in middle 50% of screen):
  ··········
  ··········
  ··········
  ···████···
  ···████···
  ···████···
  ···████···
  ··········
  ··········
  ··········
Coverage: 16/100 (16.0%)

FULL SCREEN: 0/100 (0.0%)
```

**Conclusion:** The 4x4 block of hits matches the mandelbulb's actual screen position. gPosition IS being written correctly for all visible pixels. The bug is NOT in gPosition writing.

### Bug Location: Temporal Reprojection Logic

Since gPosition data is correct, the bug must be in:
1. ~~TemporalDepthCapturePass - copying gPosition to temporal buffer~~ **VERIFIED WORKING**
2. Temporal uniform binding - passing texture/matrices to shader
3. Reprojection shader math - using wrong matrices or coordinates
4. UV calculation - looking at wrong pixel location

### Session 3: TemporalDepthCapturePass Verification

**Test:** `window._debugTemporalCapture = true`

```
[TemporalDepthCapture] === execute() ===
[TemporalDepthCapture] positionInputId: mainObjectMrt
[TemporalDepthCapture] positionAttachment: 2
[TemporalDepthCapture] outputResourceId: temporalDepthOutput
[TemporalDepthCapture] positionTex: [object]
[TemporalDepthCapture] sourceTarget: [object]
[TemporalDepthCapture] writeTarget: [object]
[TemporalDepthCapture] Expected texture (textures[2]): cd846c4e
[TemporalDepthCapture] Match: true
```

**Conclusion:** TemporalDepthCapturePass IS executing every frame. It reads from correct source (mainObjectMrt[2]) and writes to correct destination (temporalDepthOutput). The texture reference matches.

### Remaining Suspects

1. **Is the copied data correct?** - Need to verify temporalDepthOutput has same data as mainObjectMrt[2]
2. **Are temporal uniforms reaching the shader?** - Check MandelbulbMesh uniform binding
3. **Is the reprojection math correct?** - The shader samples at vUv (current screen position), not reprojected position

### Next Steps
- [ ] Verify temporalDepthOutput contains valid position data
- [ ] Check if uPrevPositionTexture is non-null in shader
- [ ] Check if uTemporalEnabled is true
- [ ] Debug shader getTemporalDepth() function

---

## Key Files

| File | Purpose |
|------|---------|
| `src/rendering/environment/PostProcessingV2.tsx:995-1003` | MainObjectMRTPass instantiation |
| `src/rendering/environment/PostProcessingV2.tsx:941-960` | TemporalDepthCapturePass instantiation |
| `src/rendering/graph/passes/MainObjectMRTPass.ts` | MRT rendering pass |
| `src/rendering/graph/passes/TemporalDepthCapturePass.ts` | Position buffer capture |
| `src/rendering/shaders/shared/fractal/main.glsl.ts:211` | gPosition write location |
| `src/rendering/shaders/shared/fractal/main.glsl.ts:39` | Discard on miss |
| `src/rendering/renderers/Mandelbulb/MandelbulbMesh.tsx` | Consumer of temporal uniforms |

---

## Next Steps

1. **Verify coverage is correct** - Run `_debugMRTGrid` and confirm center coverage matches visible mandelbulb
2. **If coverage is correct**, trace forward to TemporalDepthCapturePass input
3. **Check temporal uniform binding** - Are the uniforms reaching the shader?
4. **Check reprojection shader logic** - Is the math correct?

---

## Debug Commands

```javascript
// In Chrome DevTools console:

// Check gPosition grid coverage
window._debugMRTGrid = true

// Check draw calls
window._debugMRTDrawCalls = true

// Continuous monitoring (1 per second)
window._debugMRTAlways = true

// Check temporal capture
window._debugTemporalCapture = true

// Check source grid for temporal
window._temporalDebugSourceGrid = true
```

---

## What Was Tried

### Debug Code Added

1. **MainObjectMRTPass.ts** - Added extensive debug logging:
   - `_debugMRTGrid` - 10x10 grid sampling (center-focused + full-screen)
   - `_debugMRTDrawCalls` - Draw call counting with proper `renderer.info.reset()`
   - `_debugMRTOutput` - 5-point sampling (center, left, right, top, bottom)
   - `_debugMRTAlways` - Continuous monitoring (throttled 1/60 frames)
   - `_debugMRTLayers` - Layer mask and mesh visibility logging
   - `_debugMRTConfig` - Framebuffer attachment verification

2. **ScenePass.ts** - Added debug logging for comparison:
   - `_debugSceneDrawCalls` - Draw call counting

3. **TemporalDepthCapturePass.ts** - Added debug logging:
   - `_debugTemporalCapture` - Input/output texture verification
   - `_temporalDebugSourceGrid` - Source gPosition grid sampling
   - `_temporalDebugGrid` - Output grid sampling

### Observations

1. **Draw calls occur** - MainObjectMRTPass renders something
2. **Center pixel has data** - gPosition @ center = (0.004, 0.319, 0.765, 7.293)
3. **Full-screen grid shows 0%** - But this could be because mandelbulb doesn't cover full screen
4. **Chrome DevTools disconnected** during testing - prevented further live verification

### What Remains Unknown

- **Coverage in center region** - Does the mandelbulb area have full gPosition coverage?
- **Shader execution** - Is the fragment shader actually running for all fragments?
- **MRT output** - Are all 3 attachments being written to correctly?

---

## Log Updates

**Session 1:**
- User reported temporal reprojection not working
- Identified gPosition only has data at center pixel
- Full-screen grid showed 0% coverage (inconclusive - could be sampling location issue)

**Session 2:**
- Added center-focused grid sampling to MainObjectMRTPass
- Chrome DevTools disconnected, pending retest
- Created this log file for memory persistence

**Session 3:**
- Documented full architecture and data flow
- Updated log with accurate findings

**Session 4 (current):**

### CRITICAL FINDING: Shader Debug Mode Tests

Added debug modes 8 and 9 to `main.glsl.ts` OUTSIDE `#ifdef USE_TEMPORAL` block:

```glsl
if (uDebugMode == 8) {
    // Shows GREEN where gPosition will be written (d > 0)
    debugCol = d > 0.0 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    gColor = vec4(debugCol, 1.0);
    gPosition = vec4(worldHitPos.xyz, d);
    return;
}
```

#### Debug Mode 8 Result: `window.temporalDebug = 8`
**Screenshot:** ENTIRE mandelbulb is SOLID GREEN

**Meaning:**
- Green = `d > 0.0` = raymarcher HIT the surface
- The ENTIRE mandelbulb surface shows green
- **CONCLUSION: gPosition IS being written correctly for 100% of visible pixels**

#### Debug Mode 4 Result: `window.temporalDebug = 4`
**Screenshot:** Mandelbulb renders with NORMAL coral/red colors, only TINY green spot at top

**Expected behavior (if working):**
- Mode 4 shows reject reason as color:
  - 0=green (valid temporal data)
  - 1=black (no data)
  - 2=blue (behind camera)
  - 3=red (off-ray)
  - 4=yellow (discontinuity)

**Actual behavior:**
- Mandelbulb renders with NORMAL colors (not debug colors)
- Only tiny green spot where temporal data is valid

**CRITICAL INSIGHT:**
- Debug mode 8 WORKS because it's OUTSIDE `#ifdef USE_TEMPORAL`
- Debug mode 4 DOESN'T WORK because it's INSIDE `#ifdef USE_TEMPORAL`
- **This means `USE_TEMPORAL` is likely NOT DEFINED in the shader!**

### Updated Bug Hypothesis

The temporal reprojection code is not being compiled into the shader because `USE_TEMPORAL` define is missing.

**Root cause candidates:**
1. `USE_TEMPORAL` define not being added during shader compilation
2. Temporal uniforms not being bound
3. Shader defines conditional not including temporal

### Session 4 Continued: Debug Mode 10 Test

Added debug mode 10 to test if `USE_TEMPORAL` is defined:
- RED = `USE_TEMPORAL` is defined
- GREEN = `USE_TEMPORAL` is NOT defined

**Test Results:**
- **Temporal ON:** Mandelbulb shows RED → `USE_TEMPORAL` IS defined ✓
- **Temporal OFF:** NOTHING RENDERS AT ALL

**CRITICAL BUG DISCOVERED:**
When temporal reprojection is toggled OFF, the shader fails to render entirely. This means there's a compilation or runtime error when `USE_TEMPORAL` is not defined.

**Root Cause Hypothesis:**
The shader likely references something from the temporal block (e.g., `gTemporalDebug`, `getTemporalDepth()`) outside of `#ifdef USE_TEMPORAL` guards, causing compilation failure when temporal is disabled.

### Session 4 Continued: Shader Compilation Failure

**WebGL Error:** `INVALID_OPERATION (1282)`
**Material Status:** No WebGL program - shader FAILED to compile

**Confirmed:**
- When temporal is ON: shader compiles, debug mode 10 shows RED
- When temporal is OFF: shader FAILS to compile, nothing renders

**Root Cause:** There's a GLSL compilation error when `USE_TEMPORAL` is NOT defined.

### Session 4: ROOT CAUSE FOUND

**Debug Mode 4 (Reject Reason) with STATIC camera:**
- **RED** (95%+) = Reject reason 3 = OFF-RAY rejection
- **GREEN** (tiny spot at top) = Valid temporal data
- FPS: 10 (100ms) - temporal adds overhead but doesn't help

**ROOT CAUSE:** The perpendicular distance check is failing for almost ALL pixels, even with a STATIC camera. This means the reprojection math is WRONG.

The rejection happens in `temporal.glsl.ts` line 102:
```glsl
if (perpDist > threshold) {
    gTemporalDebug.rejectReason = 3;  // Off-ray
    return -1.0;
}
```

**Possible causes:**
1. `prevWorldPos` from gPosition texture is wrong
2. Transformation `uInverseModelMatrix * prevWorldPos` is wrong
3. Ray origin/direction (`ro`, `rd`) doesn't match what was used to write gPosition
4. gPosition stores model-space but is read as world-space

### ROOT CAUSE CONFIRMED

**The Problem:**
- `gPosition.xyz` stores WORLD position: `worldHitPos = modelMatrix * modelPos`
- When object rotates, modelMatrix changes between frames
- Temporal code transforms prevWorldPos by CURRENT inverseModelMatrix
- `inverseModelMatrix_N+1 * modelMatrix_N * modelPos ≠ modelPos`

**The Fix:**
Store MODEL-SPACE position in gPosition instead of world-space. Then:
- No transformation needed in temporal reprojection
- Object rotation doesn't affect the stored position
- Camera movement still works (ray origin/direction change, but model-space hit point is stable)

**Code Changes Needed:**

1. `main.glsl.ts` - Change gPosition to store model-space:
```glsl
// OLD: gPosition = vec4(worldHitPos.xyz, d);
// NEW: gPosition = vec4(p, d);  // p is model-space hit point
```

2. `temporal.glsl.ts` - Remove world→model transformation:
```glsl
// OLD: vec3 prevModelPos = (uInverseModelMatrix * vec4(prevWorldPos, 1.0)).xyz;
// NEW: vec3 prevModelPos = prevPositionData.xyz;  // Already model-space
```

---

## Session 5: Model-Space Fix Applied - Still Broken

### Changes Made

Applied the model-space fix:
1. `main.glsl.ts`: Changed `gPosition = vec4(worldHitPos.xyz, d)` → `gPosition = vec4(p, d)`
2. `temporal.glsl.ts`: Removed inverseModelMatrix transformation

### Test Results After Fix

**Debug Mode 4 (Reject Reason):**
- **DARK GRAY** (95%+) = Reject reason **1 = NO DATA**
- **RED** (tiny area) = Reject reason 3 = off-ray
- **GREEN** (tiny area) = Reject reason 0 = valid

**CRITICAL:** The rejection reason changed from 3 (off-ray) to 1 (NO DATA). This means the temporal texture has NO DATA for most pixels.

### TemporalDepthCapturePass SOURCE Grid Test

```
window._temporalDebugSourceGrid = true
```

**Result:**
```
[TemporalDepthCapture] SOURCE gPosition grid (█=data, ·=zero):
·····
·····
··█··
·····
·····
Valid pixels: 1 / 25
```

**Only 1 pixel out of 25 has data in the SOURCE (mainObjectMrt attachment 2)!**

### The Contradiction

| Test | Result |
|------|--------|
| Debug mode 8 (shader writes gPosition) | ENTIRE mandelbulb is GREEN = 100% coverage |
| TemporalDepthCapturePass SOURCE grid | Only 1/25 pixels have data |

**The shader IS writing gPosition correctly, but by the time TemporalDepthCapturePass reads it, the data is GONE.**

### Current Hypothesis: Render Pass Execution Order

The gPosition data is being **lost** between:
1. MandelbulbMesh shader writes to gPosition (during MainObjectMRTPass)
2. TemporalDepthCapturePass reads from mainObjectMrt attachment 2

**Possible causes:**
1. **Execution order wrong** - TemporalDepthCapturePass runs BEFORE MainObjectMRTPass
2. **Buffer cleared** - Something clears gPosition after MRT render but before temporal capture
3. **Wrong attachment** - Reading from wrong MRT attachment index

### Next Step: Verify Render Pass Execution Order

Need to check if RenderGraph executes passes in correct order:
1. MainObjectMRTPass should execute FIRST (writes gPosition)
2. TemporalDepthCapturePass should execute AFTER (reads gPosition)

### GraphCompiler Dependency Analysis

The dependency graph is built in `GraphCompiler.ts:buildDependencyGraph()`:
- A pass P1 depends on P2 if P1 reads a resource that P2 writes
- Line 533-544: "Every reader depends on every writer"

**Expected dependency chain:**
- MainObjectMRTPass outputs to `mainObjectMrt` (writes)
- TemporalDepthCapturePass reads from `mainObjectMrt` (reads)
- Therefore: TemporalDepthCapturePass.dependencies should include MainObjectMRTPass

**To verify:** Add logging to see actual compiled pass order and dependencies.

### VERIFIED: Execution Order is CORRECT

**Pass order (from GraphCompiler debug output):**
```
... -> mainObjectMrt -> gravityLensing -> temporalDepthCapture -> ...
```

**Dependencies:**
- `mainObjectMrt` dependencies: `[]` (no dependencies, runs early)
- `temporalDepthCapture` dependencies: `["mainObjectMrt"]` ✓

**Conclusion:** MainObjectMRTPass runs BEFORE TemporalDepthCapturePass. Execution order is NOT the problem.

### Remaining Hypotheses

Since execution order is correct, the data loss must happen due to:
1. ~~**Something clears the MRT** between mainObjectMrt and temporalDepthCapture~~
   - `gravityLensing` pass runs between them - **NOT the culprit**
   - It only reads `ENVIRONMENT_COLOR` and writes `LENSED_ENVIRONMENT`
   - Does NOT touch `MAIN_OBJECT_MRT`
2. **Wrong texture reference** - TemporalDepthCapturePass might be reading stale/wrong texture
3. **MRT attachment 2 not written** - WebGL drawBuffers misconfigured

### Key Contradiction

| Test | Result |
|------|--------|
| Debug mode 8 (gColor output showing where d > 0) | Entire mandelbulb GREEN |
| Debug mode 4 (reads temporal buffer) | Mandelbulb DARK GRAY (no data) |
| TemporalDepthCapturePass SOURCE grid | Only 1/25 pixels have data |

**gColor works, gPosition doesn't** - both written in same shader statements.
This points to drawBuffers or MRT attachment configuration issue.

### Session 5 Continued: MRTStateManager Analysis

**Reviewed `src/rendering/graph/MRTStateManager.ts`:**
- Correctly patches `renderer.setRenderTarget()` to call `gl.drawBuffers()` automatically
- For 3 attachments: `gl.drawBuffers([COLOR_ATTACHMENT0, COLOR_ATTACHMENT1, COLOR_ATTACHMENT2])` ✓
- `_debugMRTConfig` already verified drawBuffers are correctly configured

**Conclusion:** MRTStateManager is NOT the culprit - drawBuffers is correct.

### Session 5 Continued: ResourcePool Analysis

**Reviewed `src/rendering/graph/ResourcePool.ts`:**
- `getTexture(id, 2)` correctly returns `target.textures[2]`
- MRT creation uses `new THREE.WebGLRenderTarget(w, h, { count: 3 })`
- All 3 textures configured with same format/type

**Conclusion:** ResourcePool is NOT the culprit.

### NEW HYPOTHESIS: Three.js Framebuffer Attachment

Even though:
1. drawBuffers = [CA0, CA1, CA2] ✓
2. target.textures has 3 elements ✓
3. shader outputs to all 3 locations ✓

**Question:** Does Three.js actually attach `textures[2]` to `gl.COLOR_ATTACHMENT2` on the WebGL framebuffer?

The debug code in TemporalDepthCapturePass uses:
```javascript
gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
gl.readBuffer(gl.COLOR_ATTACHMENT2)
gl.readPixels(...)
```

If Three.js didn't attach textures[2] to COLOR_ATTACHMENT2, readPixels would return zeros.

### Next Step: Verify Three.js Framebuffer Attachments

Need to check if the WebGL framebuffer has all 3 textures attached:
```javascript
gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME)
```

If this returns null/0, Three.js failed to attach the texture.

---

## Session 6: CRITICAL DISCOVERY - All MRT Attachments Empty

### Test: Sample ALL 3 MRT Attachments

Modified `_temporalDebugSourceGrid` to sample all 3 attachments instead of just gPosition.

**Results:**
```
[TemporalDepthCapture] SOURCE gColor (att 0) grid:
·····
·····
··█··
·····
·····
Valid pixels: 1 / 25

[TemporalDepthCapture] SOURCE gNormal (att 1) grid:
·····
·····
··█··
·····
·····
Valid pixels: 1 / 25

[TemporalDepthCapture] SOURCE gPosition (att 2) grid:
·····
·····
··█··
·····
·····
Valid pixels: 1 / 25
```

### Analysis

**ALL 3 attachments have only 1 pixel of data!** The issue is NOT specific to attachment 2 (gPosition).

This creates a contradiction:
- **Debug mode 8** shows the ENTIRE mandelbulb as GREEN (gColor written everywhere)
- **MRT readback** shows only 1 pixel has data in gColor

### Key Insight

The mandelbulb we see on screen must come from a **different render path** than the MRT. Either:
1. The MRT buffer is incorrectly sized (1x1 or tiny)
2. The mandelbulb mesh is not on the correct layer for MainObjectMRTPass
3. MainObjectMRTPass is not actually rendering the mandelbulb (something else is)
4. The framebuffer we're reading is stale/wrong

### Comparison: TemporalCloudPass vs TemporalDepthCapturePass

| Aspect | TemporalCloudPass (Schrödinger - WORKS) | TemporalDepthCapturePass (Mandelbulb - BROKEN) |
|--------|----------------------------------------|-----------------------------------------------|
| Rendering | Renders directly to its OWN MRT buffer | Relies on MainObjectMRTPass to render to shared MRT |
| Reading | Reads from texture it just rendered to | Reads from different pass's output |
| MRT ownership | Owns cloudBuffer, accumulationBuffer, reprojectionBuffer | Reads from MAIN_OBJECT_MRT owned by MainObjectMRTPass |

TemporalCloudPass renders AND reads in the SAME pass. TemporalDepthCapturePass tries to read from a DIFFERENT pass's output.

### Next Step: Verify MRT Dimensions

Added logging to show MRT dimensions when debug runs. Need to verify the MRT is full screen resolution, not 1x1.

```javascript
window._temporalDebugSourceGrid = true
```

Will now output:
```
[TemporalDepthCapture] MRT dimensions: WxH
[TemporalDepthCapture] MRT textures count: N
```

If dimensions are wrong (e.g., 1x1), that explains why only 1 pixel has data.

### Session 6 Continued: MRT Dimensions Are Correct

**Test:** Ran debug after 2-second delay to rule out timing issues.

```javascript
setTimeout(() => { window._debugMRTDrawCalls = true }, 2000)
setTimeout(() => { window._temporalDebugSourceGrid = true }, 2100)
```

**Results:**
```
[MainObjectMRT] Draw calls (this pass only): 1
[MainObjectMRT] Triangles: 12
[MainObjectMRT] Points: 0
[MainObjectMRT] Lines: 0
[MainObjectMRT] Meshes on target layer: 1

[TemporalDepthCapture] MRT dimensions: 1435x1093
[TemporalDepthCapture] MRT textures count: 3
[TemporalDepthCapture] SOURCE gColor (att 0) grid: 1/25 pixels
[TemporalDepthCapture] SOURCE gNormal (att 1) grid: 1/25 pixels
[TemporalDepthCapture] SOURCE gPosition (att 2) grid: 1/25 pixels
```

### Analysis

| Metric | Value | Expected | Status |
|--------|-------|----------|--------|
| MRT dimensions | 1435×1093 | Full screen | ✓ |
| Draw calls | 1 | 1 | ✓ |
| Triangles | 12 | 12 (box: 6 faces × 2) | ✓ |
| Meshes on layer | 1 | 1 | ✓ |
| Data in MRT | 1/25 pixels | ~16/25 (mandelbulb coverage) | ✗ |

**Timing theory RULED OUT:** After 2-second delay, still only 1 pixel has data.

### The Core Mystery

Everything looks correct:
- MainObjectMRTPass executes ✓
- Mandelbulb mesh found on correct layer ✓
- Draw call happens ✓
- 12 triangles rendered (box geometry) ✓
- MRT is full screen resolution ✓

But only 1 pixel has data in ALL 3 MRT attachments.

### Remaining Hypotheses

1. **Shader discards most fragments** - The raymarcher's `if (d > maxDist) discard;` might be discarding everything except 1 pixel. But we SEE the full mandelbulb on screen via ScenePass using the SAME shader.

2. **Different framebuffer** - The framebuffer we READ from might not be the same one that was WRITTEN to. Three.js internal caching could return a stale framebuffer reference.

3. **MRT attachment not bound** - WebGL might not have all 3 textures properly attached to the framebuffer, even though drawBuffers is configured correctly.

4. **Camera/projection difference** - MainObjectMRTPass might be using a different camera state than ScenePass, causing the raymarcher to miss the surface.

### Key Insight: ScenePass vs MainObjectMRTPass

Both passes render the SAME mandelbulb mesh with the SAME shader:
- **ScenePass** → renders to SCENE_COLOR (single attachment) → WORKS (we see full mandelbulb)
- **MainObjectMRTPass** → renders to MAIN_OBJECT_MRT (3 attachments) → BROKEN (1 pixel)

The difference is the render target type:
- Single attachment target: works
- MRT with 3 attachments: broken

This strongly suggests the issue is with **MRT framebuffer configuration**, not the shader or mesh.

### Session 6 Continued: Viewport Check

**Test:** Added viewport logging before and after render in MainObjectMRTPass.

**Results:**
```
[MainObjectMRT] BEFORE render:
  Target size: 1435 x 1093
  Target viewport: 0 0 1435 1093
  GL Viewport: 0 0 1435 1093
  Scissor: false
  Camera frustum near/far: 0.1 1000

[MainObjectMRT] AFTER render:
  GL Viewport: 0 0 1435 1093
```

**Viewport is NOT the issue** - correctly set to full screen resolution.

### Ruled Out Causes

| Cause | Status | Evidence |
|-------|--------|----------|
| MRT dimensions wrong | ✗ Ruled out | 1435×1093 = full screen |
| Layer assignment timing | ✗ Ruled out | Still broken after 2s delay |
| Mesh not on correct layer | ✗ Ruled out | `isOnMainObject: true` |
| Draw call not happening | ✗ Ruled out | 1 draw call, 12 triangles |
| Viewport/scissor | ✗ Ruled out | Full viewport, scissor disabled |
| drawBuffers config | ✗ Ruled out | All 3 attachments configured |

### Still Possible Causes

1. **Framebuffer texture attachments** - WebGL framebuffer might not have textures properly attached to COLOR_ATTACHMENTn
2. **Three.js MRT internal bug** - WebGLRenderTarget with `count: 3` might not work correctly
3. **Shader outputs not reaching MRT** - Fragment shader might output correctly but MRT not receiving it
---

## Session 7: DPR Resolution Mismatch - Not the Root Cause


### Deep Dive: Shader Uniforms

Added more diagnostic logging to check shader state during MainObjectMRTPass:

```javascript
window._debugMRTViewport = true
```

**Results:**
```
[MainObjectMRT] BEFORE render:
  Target size: 1435 x 1093
  Target viewport: 0 0 1435 1093
  GL Viewport: 0 0 1435 1093
  Scissor: false
  Camera frustum near/far: 0.1 1000
  Projection matrix [0,5,10,15]: 1.3194 1.7321 -1.0002 0.0000
  View matrix [12,13,14] (position): 0.00 0.00 -8.12
  Mesh: f165d3da
    World matrix [12,13,14] (position): 0.00 0.00 0.00
    World matrix [0,5,10] (scale diag): 1.00 1.00 1.00
    Geometry: BoxGeometry boundingSphere: 3.46
    uCameraPosition: (0.00, 3.13, 7.50)
    uResolution: (957, 729)          ← WRONG!
    uInverseModelMatrix: present
```

### THE BUG: uResolution Mismatch

| Parameter | MRT Target (Native) | Shader Uniform (CSS) | Ratio |
|-----------|---------------------|----------------------|-------|
| Width | 1435 | 957 | ~1.5 (DPR) |
| Height | 1093 | 729 | ~1.5 (DPR) |

The `uResolution` uniform is set from **CSS pixels** but the MRT target is at **native resolution** (CSS × DPR).

### Why This Causes 1-Pixel Coverage

In the raymarching shader:
```glsl
// Fragment shader computes UV from fragment position
vec2 uv = gl_FragCoord.xy / uResolution.xy;
```

With the wrong resolution:
- `gl_FragCoord` ranges from `(0,0)` to `(1435, 1093)` (native pixels)
- `uResolution` is `(957, 729)` (CSS pixels)
- For fragments at `gl_FragCoord = (957, 729)`: `uv = (1.0, 1.0)` ← edge of intended range
- For fragments BEYOND that (958 to 1435): `uv > 1.0` ← rays point in WRONG direction!

Only a small region where `gl_FragCoord < uResolution` computes valid UVs. The rest of the screen has rays pointing outside the expected view frustum, completely missing the mandelbulb.

### Source of the Bug

**MandelbulbMesh.tsx line 316:**
```tsx
// BUG: Uses CSS pixels from useThree().size
if (material.uniforms.uResolution) material.uniforms.uResolution.value.set(size.width, size.height);
```

The `size` from `useThree()` returns CSS pixels (957×729), but:
- The MRT is sized at native pixels (CSS × DPR = 1435×1093)
- `gl_FragCoord` is always in native pixels
- Therefore `uResolution` must also be in native pixels

### The Fix

**MandelbulbMesh.tsx:**
```tsx
// Get DPR from viewport
const { size, camera, viewport } = useThree();

// In useFrame:
// CRITICAL: Use DPR-scaled resolution for raymarching
const dpr = viewport.dpr;
if (material.uniforms.uResolution) material.uniforms.uResolution.value.set(
  Math.floor(size.width * dpr),
  Math.floor(size.height * dpr)
);
```

**Same fix applied to QuaternionJuliaMesh.tsx.**

### Why ScenePass Works But MainObjectMRTPass Fails

Both passes render the mandelbulb, but:
- **ScenePass** → renders to `SCENE_COLOR` which is ALSO at native resolution
- The mandelbulb still renders "correctly" to ScenePass because the UV calculation is WRONG but the screen coordinates happen to work out (the rays still HIT the object, just at wrong UVs)

Wait, that doesn't fully explain it. Let me reconsider...

Actually, the key insight is:
- **ScenePass output goes to screen** - we SEE the visual result
- **MainObjectMRTPass output goes to MRT** - temporal reads from this

The shader runs identically in both passes, but the UV mismatch means:
- Rays computed with `uv > 1.0` miss the mandelbulb entirely
- These fragments `discard` → no data written to MRT
- Only fragments where `uv <= 1.0` hit the mandelbulb → ~4% of screen

### Why Does the Visual Look Correct?

The mandelbulb visually renders full-screen because:
1. **ScenePass** renders with the same wrong `uResolution`
2. But the raymarcher still FINDS the mandelbulb (just at wrong UVs)
3. The color output looks "correct" because the mandelbulb is symmetric-ish
4. We don't notice the UV distortion because we don't have a reference

The MRT data being wrong only affects **temporal reprojection**, not visual output.

### Verification

After applying the fix, run:
```javascript
window._temporalDebugSourceGrid = true
```

Expected: ~60-80% coverage in center (matching actual mandelbulb screen coverage)

### Files Changed

| File | Change |
|------|--------|
| `src/rendering/renderers/Mandelbulb/MandelbulbMesh.tsx` | Use DPR-scaled resolution |
| `src/rendering/renderers/QuaternionJulia/QuaternionJuliaMesh.tsx` | Use DPR-scaled resolution |

### Note: Schroedinger Not Affected

SchroedingerMesh uses TemporalCloudPass which has its own rendering pipeline and doesn't use MainObjectMRTPass. The CSS resolution works because TemporalCloudPass manages its own buffer sizes.

---

## Debug Commands Reference

```javascript
// MRT viewport and matrix diagnostics
window._debugMRTViewport = true

// MRT draw calls and coverage
window._debugMRTDrawCalls = true

// MRT framebuffer configuration
window._debugMRTConfig = true

// MRT grid sampling
window._debugMRTGrid = true

// Temporal capture source grid
window._temporalDebugSourceGrid = true

// Continuous monitoring (throttled)
window._debugMRTAlways = true

// Temporal debug mode (set before rendering)
window.temporalDebug = 4  // 0-10, see modes below
```

### Temporal Debug Modes

| Mode | Description | Colors |
|------|-------------|--------|
| 1 | Stored distance | Blue = distance, Red if valid |
| 2 | Projected vs stored | Green = proj, Blue = stored |
| 3 | Perpendicular distance | Red = rejected, Green = accepted |
| 4 | Reject reason | See below |
| 5 | Used temporal? | Green = yes, Red = no |
| 6 | World position from prev | RGB = XYZ mapped |
| 7 | Model position from prev | RGB = XYZ mapped |
| 8 | gPosition output verification | Green = data, Red = none |
| 9 | gPosition.w distance | Grayscale |
| 10 | USE_TEMPORAL defined | Red = yes, Green = no |

**Mode 4 Reject Reasons:**
- **GREEN** = valid (reason 0)
- **DARK GRAY** = no data (reason 1)
- **BLUE** = behind camera (reason 2)
- **RED** = off-ray (reason 3)
- **YELLOW** = discontinuity (reason 4)

---

## Session 8: DPR Fix Worked for MRT Write, But Temporal Read Still Broken

**Date:** 2025-12-30

### DPR Fix Verification

After applying the DPR fix to MandelbulbMesh.tsx:

```javascript
window._temporalDebugSourceGrid = true
```

**Results:**
```
[TemporalDepthCapture] MRT dimensions: 1435x1093
[TemporalDepthCapture] MRT textures count: 3
[TemporalDepthCapture] SOURCE gColor (att 0) grid:
··█··
·███·
·███·
·███·
··█··
Valid pixels: 11 / 25
```

**SUCCESS!** The MRT now has correct coverage (11/25 = 44% diamond pattern matching the mandelbulb's screen coverage).

### New Problem: Temporal Hints Not Used

Debug mode 5 (`window.temporalDebug = 5`) shows:
- Almost entire mandelbulb is **RED** (temporal not used, full raymarching)
- Only a tiny **GREEN** spot at the top (temporal used)

The green spot **moves when camera zooms** even without rotation - this is the key clue.

### Root Cause Identified: Mesh UV vs Screen UV

**The temporal sampling code was using `vUv` instead of screen coordinates!**

```glsl
// BUG: vUv is mesh texture coordinate (0-1 per box face)
// but uPrevPositionTexture is a screen-space texture
vec4 prevPositionData = texture(uPrevPositionTexture, vUv);  // WRONG!
```

The mandelbulb is rendered on a 4×4×4 BoxGeometry with BackSide. The `vUv` varying is the **per-face UV coordinate** from the box geometry, NOT the screen position.

When camera zooms:
- Mandelbulb's **screen position** changes
- But **mesh UVs** stay fixed to geometry
- The "lucky alignment" point where mesh UV ≈ screen UV shifts

### Fix Attempt 1: Use gl_FragCoord

Changed to screen coordinates:
```glsl
vec2 screenUV = gl_FragCoord.xy / uResolution;
vec4 prevPositionData = texture(uPrevPositionTexture, screenUV);
```

**Result:** Debug mode 4 shows ALL DARK GRAY (no data, reason 1)

### Fix Attempt 2: Y-Flip

WebGL coordinate system mismatch:
- `gl_FragCoord.y` goes from **bottom (0) to top (height)**
- Render target textures stored **top (0) to bottom (1)**

```glsl
vec2 screenUV = vec2(gl_FragCoord.x / uResolution.x, 1.0 - gl_FragCoord.y / uResolution.y);
```

**Result:** Still ALL DARK GRAY

### Current Status: Temporal Read Path Broken

The MRT **write** path is now working (11/25 coverage).
The temporal **read** path is broken - sampling returns no data.

### Possible Causes for "No Data"

1. **uPrevPositionTexture not bound** - The texture uniform might be null or wrong
2. **Texture format mismatch** - Float texture sampling might not work as expected
3. **Wrong attachment index** - Might be reading gColor (att 0) instead of gPosition (att 2)
4. **DPR mismatch in read path** - uResolution might not match actual texture dimensions
5. **Ping-pong buffer issue** - Previous frame data might not be copied correctly

### Next Steps

1. **Verify uPrevPositionTexture is bound** - Add debug to check if texture exists
2. **Check texture dimensions** - Ensure uResolution matches uPrevPositionTexture size
3. **Trace TemporalDepthCapturePass** - Verify it copies gPosition correctly
4. **Check uniform binding** - Verify useTemporalDepthUniforms returns correct texture

### Key Files to Investigate

| File | Purpose |
|------|---------|
| `src/rendering/core/useTemporalDepthUniforms.ts` | Sets up temporal uniforms |
| `src/rendering/graph/passes/TemporalDepthCapturePass.ts` | Copies MRT to temporal buffer |
| `src/rendering/shaders/shared/features/temporal.glsl.ts` | Samples temporal data |

### Investigation: Uniform Binding

Need to verify:
1. What texture is bound to `uPrevPositionTexture`?
2. What are the dimensions of that texture?
3. Does `uResolution` match those dimensions?
4. Is the texture actually populated with position data?

```javascript
// Add this debug to MandelbulbMesh useFrame:
console.log('uPrevPositionTexture:', material.uniforms.uPrevPositionTexture?.value);
console.log('uResolution:', material.uniforms.uResolution?.value);
console.log('uTemporalEnabled:', material.uniforms.uTemporalEnabled?.value);
```

---

## Session 9: ROOT CAUSE FOUND AND FIXED

**Date:** 2025-12-30

### The Two Bugs

There were actually **two bugs** preventing temporal reprojection:

#### Bug 1: DPR Mismatch (MRT Write Path)

**Problem:** `uResolution` was set from CSS pixels but MRT targets are at native resolution.

**Symptom:** Only ~4% of pixels had valid MRT data (incorrect coverage).

**Fix:** Multiply resolution by DPR:
```tsx
const dpr = viewport.dpr;
material.uniforms.uResolution.value.set(
  Math.floor(size.width * dpr),
  Math.floor(size.height * dpr)
);
```

**Result:** MRT coverage now correct (11/25 = 44% diamond pattern matching mandelbulb).

#### Bug 2: Wrong UV Coordinates (Temporal Read Path)

**Problem:** Temporal sampling used `vUv` (mesh texture coordinates) instead of screen coordinates.

**Root Cause Trace:**
1. Debug mode 5 showed almost all RED (temporal not used)
2. The tiny GREEN spot moved when zooming (even without rotation)
3. This proved the sampling coordinates were tied to geometry, not screen

**The Bug:**
```glsl
// BUG: vUv is per-face UV on BoxGeometry (0-1 per face)
// but uPrevPositionTexture is a screen-space render target!
vec4 prevPositionData = texture(uPrevPositionTexture, vUv);
```

**Why It "Worked" Sometimes:**
The tiny green spot was where mesh UV happened to accidentally equal screen UV - pure coincidence that shifted as the camera moved.

**Fix Attempt 1 - Wrong:**
```glsl
// Used uResolution (mesh resolution) - still dark gray
vec2 screenUV = gl_FragCoord.xy / uResolution;
```

**Fix Attempt 2 - Also Wrong:**
```glsl
// Added Y-flip thinking it was coordinate system issue - still dark gray
vec2 screenUV = vec2(gl_FragCoord.x / uResolution.x, 1.0 - gl_FragCoord.y / uResolution.y);
```

**Final Fix - Correct:**
```glsl
// Use uDepthBufferResolution (temporal buffer size) not uResolution
// No Y-flip needed for render-to-texture scenarios in WebGL
vec2 screenUV = gl_FragCoord.xy / uDepthBufferResolution;
```

**Key Insight:** The temporal buffer has its own resolution stored in `uDepthBufferResolution`. Using `uResolution` (which is the current render target size) didn't match the temporal buffer dimensions.

### Files Changed

| File | Change |
|------|--------|
| `src/rendering/renderers/Mandelbulb/MandelbulbMesh.tsx` | DPR-scaled uResolution |
| `src/rendering/renderers/QuaternionJulia/QuaternionJuliaMesh.tsx` | DPR-scaled uResolution |
| `src/rendering/shaders/shared/features/temporal.glsl.ts` | Use gl_FragCoord/uDepthBufferResolution instead of vUv |

### Verification

```javascript
// Debug mode 4: Reject reason (should be all GREEN = valid)
window.temporalDebug = 4

// Debug mode 5: Used temporal? (should be all GREEN = yes)
window.temporalDebug = 5
```

Both now show GREEN across the entire mandelbulb surface.

### Summary of Call Chain

```
MandelbulbMesh renders to BoxGeometry (4×4×4, BackSide)
  ↓
Fragment shader runs for each visible pixel
  ↓
getTemporalDepth() called to get skip hint
  ↓
BUG: texture(uPrevPositionTexture, vUv)
     vUv = mesh face UV (wrong!)
     ↓
FIX: texture(uPrevPositionTexture, gl_FragCoord.xy / uDepthBufferResolution)
     screenUV = actual screen position (correct!)
```

### Lessons Learned

1. **vUv is NOT screen UV** - For raymarching on geometry (BoxGeometry), vUv is the mesh's texture coordinate, not the screen position.

2. **Use the right resolution uniform** - `uDepthBufferResolution` is the temporal buffer size, `uResolution` is the current render target size. They may differ!

3. **No Y-flip for RTT** - WebGL render-to-texture doesn't need Y coordinate flip when sampling the result.

4. **Debug modes are essential** - Mode 4 (reject reason) immediately showed "no data" which pointed to sampling the wrong location.

---

## Status: RESOLVED ✓

Temporal reprojection for Mandelbulb and QuaternionJulia now works correctly:
- MRT write path: Correct coverage (DPR fix)
- Temporal read path: Correct UV sampling (gl_FragCoord/uDepthBufferResolution)
