# WebGL Render Pipeline Architecture Analysis (2026-01-24)

## Executive Summary
The WebGL rendering pipeline uses a **declarative dependency-driven architecture** where:
- Passes declare inputs/outputs (resources they read/write)
- GraphCompiler automatically determines execution order via topological sort
- Resource names standardized across all passes via RESOURCES object
- Circular dependencies detected and rejected at compile time
- Ping-pong buffers automatically enabled for read-while-write hazards

---

## Core Architecture Principles

### 1. **Dependency-Driven Execution**
Passes don't specify execution order - the compiler derives it from resource access:
```
ScenePass (writes: sceneColor) 
  → BloomPass (reads: sceneColor, writes: bloomOutput)
    → ToScreenPass (reads: bloomOutput, writes: screen)
```

### 2. **Resource as Graph Edges**
Resources form the edges connecting passes. A pass depends on another if it reads a resource that pass writes.

### 3. **Ping-Pong Buffer Automation**
When a resource is both read AND written by the same pass (temporal feedback), compiler automatically enables ping-pong:
```
TemporalCloudPass reads: temporalAccumulation, writes: temporalAccumulation
→ Compiler adds ping-pong buffer automatically
```

---

## Resource Names (RESOURCES Object)

### G-Buffer Resources
- `sceneColor` - Main HDR scene render (HalfFloat, with depth texture)
- `objectDepth` - Object-only depth (UnsignedShort, separate from sceneColor depth)
- `normalEnv` - Environment normal buffer (HalfFloat)
- `mainObjectMrt` - Main object MRT (3 attachments: gColor, gNormal, gPosition)
- `normalBuffer` - Composited normals (env + main object + volumetric)
- `sceneComposite` - Scene after clouds composited

### Environment Separation (Gravity Enabled)
- `environmentColor` - Environment + skybox only (when gravity enabled)
- `mainObjectColor` - Main object only (when gravity enabled)
- `lensedEnvironment` - Environment after gravitational lensing applied

### Polar Jets (Black Hole)
- `jetsColor` - Jets rendered to separate buffer
- `jetsComposite` - Scene + jets composited (before god rays)
- `godRaysOutput` - Final jets output (after god rays if enabled)

### Temporal/Volumetric
- `temporalCloudBuffer` - Quarter-res volumetric cloud (MRT, 3 attachments)
- `temporalAccumulation` - Cloud accumulation (MRT, ping-pong enabled)
- `temporalReprojection` - Reprojection buffer for temporal tracking
- `temporalDepthOutput` - Position-based temporal depth for raymarching
- `temporalCloudDepth` - Cloud world position converted to depth

### Post-Processing Chain
- `gtaoOutput` - Ambient occlusion (half-res with upsampling)
- `bloomOutput` - Bloom/HDR glow
- `ssrOutput` - Screen-space reflections
- `bokehOutput` - Depth of field blur
- `refractedOutput` - Refraction distortion
- `lensingOutput` - Screen-space lensing (deprecated)
- `tonemappedOutput` - Tone mapping + cinematic effects
- `frameBlendingOutput` - Frame blending for motion smoothing
- `paperOutput` - Paper texture overlay
- `aaOutput` - Anti-aliasing output (FXAA or SMAA)

### Debug/Preview
- `previewOutput` - Debug buffer preview (depth/normal/temporal)

---

## WebGL Pipeline Flow

### Initialization Phase (per frame)
1. **externalRegistry.captureAll()** - Freeze external state (scene.background, stores)
2. **captureFrameContext()** - Create frozen frame context for consistent state reads
3. **pool.updateSize()** - Resize all resources to current screen size
4. **compiler.enablePingPong()** - Enable ping-pong for detected resources

### Main Rendering Phase (pass execution order determined by compiler)

#### Stage 1: Environment Setup
1. **cubemapCapture** → outputs background cubemap
   - Input: SKYBOX layer
   - Output: (internal, used as scene.environment via ExternalBridge)
   - Enabled: When skybox active + consumer (black hole/walls/IBL)

#### Stage 2: Base Scene Rendering (Two Paths - Mutually Exclusive)
**Path A: No Gravity**
2. **scene** → renders MAIN_OBJECT + ENVIRONMENT + SKYBOX to sceneColor
   - Outputs: `sceneColor` (RenderContext handles passthrough to `jetsComposite`)
   - Enabled: when !gravityEnabled

**Path B: Gravity Enabled (Split Rendering)**
2. **environmentScene** → renders ENVIRONMENT + SKYBOX only
   - Outputs: `environmentColor`
   - Enabled: when gravityEnabled

3. **mainObjectScene** → renders MAIN_OBJECT only
   - Outputs: `mainObjectColor`
   - Enabled: when gravityEnabled

4. **gravityLensing** → applies gravitational lensing to environment
   - Inputs: `environmentColor`
   - Outputs: `lensedEnvironment`
   - Enabled: when gravityEnabled

5. **gravityComposite** → combines lensed environment + main object
   - Inputs: `lensedEnvironment`, `mainObjectColor`
   - Outputs: `sceneColor` (feeds into jets pipeline)
   - Enabled: when gravityEnabled

#### Stage 3: Depth & Geometry Capture
6. **objectDepth** → renders object-only depth (if effects need it)
   - Outputs: `objectDepth`
   - Enabled: objectOnlyDepth && (SSR || refraction || bokeh) || jetsEnabled

7. **jetsRender** → renders jet cone geometry
   - Inputs: `objectDepth` (for soft particle intersections)
   - Outputs: `jetsColor`
   - Enabled: objectType == 'blackhole' && jetsEnabled

8. **jetsComposite** → composites scene + jets additively
   - Inputs: `sceneColor`, `jetsColor`
   - Outputs: `jetsComposite`
   - Passthrough: SCENE_COLOR → JETS_COMPOSITE when disabled
   - Enabled: shouldRenderJets

9. **godRays** → radial blur from jets
   - Inputs: `jetsComposite`, `jetsColor`
   - Outputs: `godRaysOutput`
   - Passthrough: JETS_COMPOSITE → GOD_RAYS_OUTPUT when disabled
   - Enabled: jetsEnabled && jetsGodRaysEnabled

#### Stage 4: Temporal & Volumetric
10. **temporalDepthCapture** → captures position for temporal reprojection
    - Inputs: `mainObjectMrt` (attachment 2 = gPosition)
    - Outputs: `temporalDepthOutput`
    - Enabled: temporalReprojectionEnabled && usesTemporalDepth(objectType)

11. **temporalCloud** → quarter-res volumetric accumulation
    - Reads: `temporalAccumulation` (previous frame)
    - Writes: `temporalCloudBuffer`, `temporalAccumulation` (current frame)
    - Ping-pong: YES (accumulation buffer has temporal feedback)
    - Enabled: usesTemporalCloud(objectType) && temporalReprojectionEnabled

12. **temporalCloudDepth** → converts world position to depth
    - Inputs: `temporalAccumulation` (attachment 1 = world position)
    - Outputs: `temporalCloudDepth`
    - Enabled: isTemporalCloud && (SSR || refraction || bokeh)

#### Stage 5: Normal Buffer Capture
13. **normalEnv** → renders environment normals
    - Outputs: `normalEnv`
    - Enabled: SSR || refraction || (SSAO && isPolytope) || showNormalBuffer

14. **mainObjectMrt** → renders main object MRT (color, normal, position)
    - Outputs: `mainObjectMrt` (3 attachments)
    - Always enabled (no optional enable callback)

15. **normalComposite** → composites env + main object normals
    - Inputs: `normalEnv`, `mainObjectMrt` (attachment 1)
    - Outputs: `normalBuffer`
    - Enabled: shouldRenderNormals

#### Stage 6: Cloud Compositing
16. **cloudComposite** → composites temporal clouds over scene
    - Inputs: `godRaysOutput`
    - Outputs: `sceneComposite`
    - Passthrough: GOD_RAYS_OUTPUT → SCENE_COMPOSITE when disabled
    - Enabled: shouldRenderTemporalCloud

#### Stage 7: Post-Processing Effects Chain
17. **gtao** → ambient occlusion (half-res with bilateral upsampling)
    - Inputs: `sceneComposite`, `normalBuffer`, `sceneColor` (depth)
    - Outputs: `gtaoOutput`
    - Enabled: SSAO && isPolytope
    - Ping-pong: Only if enabled (skipPassthrough: true)

18. **bloom** → HDR bloom using UnrealBloomPass
    - Inputs: `gtaoOutput` (or `sceneComposite` if GTAO disabled via aliasing)
    - Outputs: `bloomOutput`
    - Enabled: bloomEnabled

19. **bokeh** → depth of field
    - Inputs: `bloomOutput`, `normalBuffer`, depth
    - Outputs: `bokehOutput`
    - Enabled: bokehEnabled && !showDebug
    - Note: Input is `bloomOutput` - chains after bloom

20. **ssr** → screen-space reflections
    - Inputs: `bokehOutput`, `normalBuffer`, depth (selector chooses)
    - Outputs: `ssrOutput`
    - Enabled: ssrEnabled
    - Depth selector: TEMPORAL_CLOUD_DEPTH (Schroedinger temporal) > OBJECT_DEPTH > SCENE_COLOR

21. **refraction** → refraction distortion
    - Inputs: `ssrOutput`, `normalBuffer`, depth
    - Outputs: `refractedOutput`
    - Enabled: refractionEnabled

22. **lensing** → screen-space lensing
    - Inputs: `refractedOutput`, `sceneColor` (depth)
    - Outputs: `lensingOutput`
    - Enabled: ALWAYS FALSE (deprecated for black hole, use gravity lensing instead)

23. **toneMappingCinematic** → tone mapping + cinematic effects
    - Inputs: `lensingOutput`
    - Outputs: `tonemappedOutput`
    - Operations: Chromatic aberration → tone mapping → vignette → film grain
    - Enabled: cinematicEnabled || toneMappingEnabled

24. **frameBlending** → motion smoothing
    - Inputs: `tonemappedOutput`
    - Outputs: `frameBlendingOutput`
    - Enabled: frameBlendingEnabled

25. **paper** → paper texture overlay
    - Inputs: `frameBlendingOutput`
    - Outputs: `paperOutput`
    - Enabled: paperEnabled

#### Stage 8: Anti-Aliasing & Output
26. **fxaa** OR **smaa** OR **aaPassthrough** → anti-aliasing
    - Inputs: `paperOutput`
    - Outputs: `aaOutput`
    - Only ONE added to graph based on antiAliasingMethod
    - aaPassthrough uses zero-cost aliasing when AA disabled

27. **bufferPreview** → debug buffer visualization
    - Inputs: `normalBuffer` (configurable)
    - Outputs: `previewOutput`
    - Enabled: showDepthBuffer || showNormalBuffer || showTemporalDepthBuffer

28. **previewToScreen** → outputs debug buffer to screen
    - Inputs: `previewOutput`
    - Enabled: showDebug

29. **finalToScreen** → outputs final rendered image to screen
    - Inputs: `aaOutput`
    - Enabled: !showDebug

30. **debugOverlay** → renders debug layer on top
    - No inputs/outputs (renders RENDER_LAYERS.DEBUG directly)
    - Always runs last

---

## Circular Dependency Prevention

### Detection Strategy
1. **Build Dependency Graph** (GraphCompiler.buildDependencyGraph):
   - For each resource: writer(s) → readers (edges = dependencies)
   - Every reader depends on every writer of that resource

2. **Topological Sort** (GraphCompiler.topologicalSort):
   - Kahn's algorithm: process passes with in-degree 0
   - When in-degree reaches 0, pass can execute
   - Maintains priority ordering for deterministic execution

3. **Cycle Detection**:
   - If result.length !== passes.size, some passes unreachable
   - Throws error: "Cycle detected in render graph"

### Real-World Example
```
// This would be INVALID:
Pass A writes: texture1
Pass B reads: texture1, writes: texture2
Pass A reads: texture2  // ← CYCLE! A depends on B, B depends on A
```

Compiler would:
1. Calculate in-degrees: A(1), B(1)  - both have dependencies
2. Can't process either (queue empty)
3. Throw: "Cycle detected: A, B"

---

## Ping-Pong Buffer Management

### Automatic Detection (detectPingPongResources)

**Case 1: Readwrite Access**
```
Pass reads: accumBuffer, writes: accumBuffer (same pass)
→ Auto-enable ping-pong
Example: TemporalCloudPass
```

**Case 2: Multiple Writers**
```
Pass A writes: resource
Pass B writes: resource  (conflict - needs arbitration)
→ Auto-enable ping-pong
```

**Case 3: Same Pass Reads & Writes**
```
Readwrite = [passA]
Reader = [passA], Writer = [passA]
→ Auto-enable ping-pong
```

### Implementation
```typescript
// In RenderGraph.execute() and compile()
if (pingPongResourceId) {
  pool.enablePingPong(resourceId)  // Allocates A/B buffers
  ctx.getWriteTarget() → returns write buffer (A or B)
  ctx.getReadTexture() → returns read buffer (!write buffer)
}
```

---

## Resource Aliasing (Zero-Cost Passthrough)

When a pass is disabled and has `skipPassthrough: true`, instead of copying a resource:

```typescript
// Normally:
aaOutput = copy(paperOutput)  // GPU texture copy

// With aliasing:
resourceAliases.set('aaOutput', 'paperOutput')  // JavaScript pointer copy
```

Used in:
- **jetsComposite**: When jets disabled, alias sceneColor → jetsComposite
- **godRays**: When god rays disabled, alias jetsComposite → godRaysOutput
- **cloudComposite**: When clouds disabled, alias godRaysOutput → sceneComposite
- **aaPassthrough**: When AA disabled, alias paperOutput → aaOutput

Saves multiple render target switches + texture copies per frame.

---

## Data Flow Summary

```
External Resources (stores, scene.background)
        ↓
    [cubemapCapture]
        ↓
    [scene/gravity path]
        ↓
    [objectDepth/jets]
        ↓
    [temporal/volumetric]
        ↓
    [normals]
        ↓
    [cloud composite]
        ↓
    [GTAO → bloom → bokeh → SSR → refraction → lensing]
        ↓
    [toneMappingCinematic → frameBlending → paper]
        ↓
    [AA] → [toScreen]
        ↓
    Screen
```

---

## Key Design Insights for WebGPU Port

1. **Dependency declarations are declarative** - passes don't hardcode order, so WebGPU can use same resource graph
2. **Ping-pong is compiler-detected** - no manual tracking needed, WebGPU inherits this automatically
3. **Resource aliasing eliminates copies** - critical optimization, WebGPU should preserve
4. **Temporal resources use explicit feedback** - `readwriters: [passA]` makes temporal intent explicit
5. **Depth resource selection is dynamic** - passes use callbacks (depthInputSelector) to choose depth at runtime
6. **skipPassthrough controls passthrough behavior** - when disabled, either aliases or copies input → output
7. **Color space handling is explicit** - resources specify LinearSRGBColorSpace, no implicit conversions
