# Feature Contract (Auto)

_Last updated: 2026-01-24 02:24 UTC (precompact transcript)_

## Intent
<task-notification>
<task-id>ae5c834</task-id>
<status>completed</status>
<summary>Agent "Review WebGPU core infrastructure" completed</summary>
<result>## Core Infrastructure Review

### Critical Issues

- **Type Safety Violation**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/graph/WebGPURenderGraph.ts` lines 99-108 - `SetupContextImpl` has an invalid type annotation `capabilities: WebGPURenderContext['frame'] extends null ? never : WebGPURenderContext['frame']` which is nonsensical. The type should be `WebGPUCapabilities`. Line 104 uses `any` type, and line 190 casts `capabilities as any` to bypass type checking.

- **Logic Error (Operator Precedence)**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/graph/WebGPURenderGraph.ts` line 500 - The expression `!this.passes.get(id)?.config.enabled?.(this.frameContext) ?? true` has incorrect operator precedence. The `?? true` applies to the entire negated expression rather than just the enabled check. If `enabled` is undefined, the expression evaluates to `true` (skipped) instead of `false` (not skipped, since undefined means default enabled).

- **Topological Sort Broken by Priority Sort**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/graph/WebGPURenderGraph.ts` lines 341-348 - After performing topological sort on line 334, the code immediately re-sorts by priority on lines 342-348. This `.sort()` mutates the array in-place and can break dependency ordering. A pass with higher priority could execute before a lower-priority pass that produces its input.

### Warnings

- **Dead Code (Timing Never Read)**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/graph/WebGPURenderGraph.ts` lines 200-219, 449-477 - GPU timestamp infrastructure is created (`timestampQuerySet`, `timestampBuffer`, `timestampReadBuffer`) and timestamps are written, but the results are never read back. The `timestampReadBuffer` is never used to copy and map the results. The `lastPassTimings` map on line 162 is never populated.

- **Static Resources Not Cleaned**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/core/WebGPUBasePass.ts` lines 40-41 - `fullscreenVertexBuffer` and `fullscreenIndexBuffer` are static and never destroyed. When `dispose()` is called on individual passes, these shared buffers leak.

- **Infinite Recovery Loop Risk**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/core/WebGPUDevice.ts` lines 185-190 - If device recovery fails repeatedly (e.g., GPU driver issue), the `handleDeviceLost` method will keep calling `initialize()` in a loop since there's no retry limit or backoff.

- **Unused Sampler**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/core/WebGPUResourcePool.ts` lines 65-70, 329 - `nearestSampler` is created but never used. Only `linearSampler` is returned on line 329 regardless of resource configuration.

### Missing Implementations

- **GPU Timing Readback**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/graph/WebGPURenderGraph.ts` - Need async readback of timestamp results using `timestampReadBuffer.mapAsync()` to populate `lastPassTimings` with actual GPU timing data.

- **Pass Initialization Race Condition**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/graph/WebGPURenderGraph.ts` lines 255-268 - If `addPass()` is called before `initialize()`, the pass is not initialized (setupContext is null). When `initialize()` is later called, existing passes are not retroactively initialized.

- **Index File for Graph**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/graph/index.ts` - Only exports `WebGPURenderGraph`. Consider also re-exporting types from `../core/types` that are specific to the render graph (like `WebGPURenderContext`, `WebGPURenderPass`, etc.) for consumer convenience.

### API Verification

| API Call | Location | Status | Notes |
|----------|----------|--------|-------|
| `navigator.gpu.requestAdapter()` | WebGPUDevice.ts:83 | Valid | Standard WebGPU entry point |
| `adapter.requestAdapterInfo()` | WebGPUDevice.ts:92 | Valid | Returns GPUAdapterInfo |
| `adapter.features.has()` | WebGPUDevice.ts:96 | Valid | GPUSupportedFeatures implements Set |
| `adapter.requestDevice()` | WebGPUDevice.ts:105 | Valid | Returns GPUDevice |
| `device.lost` | WebGPUDevice.ts:120 | Valid | Promise for device loss |
| `canvas.getContext('webgpu')` | WebGPUDevice.ts:126 | Valid | Returns GPUCanvasContext |
| `navigator.gpu.getPreferredCanvasFormat()` | WebGPUDevice.ts:132 | Valid | Returns GPUTextureFormat |
| `context.configure()` | WebGPUDevice.ts:134 | Valid | Standard context setup |
| `context.getCurrentTexture()` | WebGPUDevice.ts:251 | Valid | Gets current swap chain texture |
| `device.createBuffer()` | Multiple locations | Valid | All usage flags are valid |
| `device.createTexture()` | WebGPUResourcePool.ts:297 | Valid | All parameters valid |
| `device.createSampler()` | WebGPUResourcePool.ts:57 | Valid | Descriptor options valid |
| `device.createShaderModule()` | WebGPUBasePass.ts:97 | Valid | Takes WGSL code |
| `device.createBindGroup()` | WebGPUBasePass.ts:152 | Valid | Standard bind group creation |
| `device.createPipelineLayout()` | WebGPUBasePass.ts:221 | Valid | Takes bindGroupLayouts array |
| `device.createRenderPipeline()` | WebGPUBasePass.ts:242 | Valid | All descriptor fields valid |
| `device.createComputePipeline()` | WebGPUBasePass.ts:343 | Valid | Standard compute pipeline |
| `device.createQuerySet()` | WebGPURenderGraph.ts:204 | Valid | 'timestamp' type valid |
| `device.queue.writeBuffer()` | Multiple locations | Valid | Standard buffer write |
| `device.queue.submit()` | WebGPURenderGraph.ts:482 | Valid | Takes command buffer array |
| `encoder.writeTimestamp()` | WebGPURenderGraph.ts:451 | Valid | For timestamp queries |
| `encoder.resolveQuerySet()` | WebGPURenderGraph.ts:471 | Valid | Copies query results |
| `encoder.beginRenderPass()` | WebGPURenderGraph.ts:80 | Valid | Returns GPURenderPassEncoder |
| `encoder.beginComputePass()` | WebGPURenderGraph.ts:84 | Valid | Returns GPUComputePassEncoder |
| `texture.createView()` | WebGPUResourcePool.ts:309 | Valid | Standard view creation |
| `texture.destroy()` | WebGPUResourcePool.ts:363 | Valid | Explicit resource cleanup |
| `GPUBufferUsage.*` | Multiple locations | Valid | All flags exist in spec |
| `GPUTextureUsage.*` | WebGPUResourcePool.ts:17-21 | Valid | All flags exist in spec |
| `GPUColorWrite.ALL` | WebGPUBasePass.ts:238 | Valid | Equals 0xF |

### Suggestions

- **Add sampler selection**: In `WebGPUResourcePool.allocateResource()`, consider using `nearestSampler` for depth/integer textures where linear filtering is inappropriate.

- **Stable topological sort**: Replace the priority-based re-sort with a priority-aware topological sort that maintains dependency order while respecting priorities within valid orderings.

- **Timing cleanup in dispose()**: The `timestampQuerySet` should be explicitly destroyed in `dispose()` since `GPUQuerySet` has a `destroy()` method. Currently only the buffers are destroyed (lines 542-545).</result>
</task-notification>
Full transcript available at: /private/tmp/claude/-Users-Spare-Documents-code-mdimension/tasks/ae5c834.output

<task-notification>
<task-id>a1c85ad</task-id>
<status>completed</status>
<summary>Agent "Review WebGPU renderers" completed</summary>
<result>I have now collected enough information to provide a comprehensive review. Let me summarize my findings:

## Renderer Review

### Per-Renderer Status
| Renderer | Complete | Issues |
|----------|----------|--------|
| WebGPUMandelbulbRenderer | Partial | Missing quality bind group (reuses objectBindGroup for index 3 and 4), `setDimension` comments pipeline recreation but doesn't implement it |
| WebGPUQuaternionJuliaRenderer | Partial | Most complete implementation, has helper methods for uniform updates |
| WebGPUSchrodingerRenderer | Partial | Uses `(this as any)` for placeholder bind groups (code smell), no depth buffer in outputs |
| WebGPUBlackHoleRenderer | Partial | Uses `(this as any)` for placeholder bind groups, no depth buffer in outputs |
| WebGPUPolytopeRenderer | Partial | Uses placeholder bind groups reusing `cameraBindGroup` (incorrect semantics), geometry must be externally provided |
| WebGPUTubeWireframeRenderer | Partial | Uses placeholder bind groups reusing `cameraBindGroup`, requires `updateInstances()` to be called externally |

### Critical Issues

**1. INTEGRATION - Renderers are ORPHANED (Critical)**
- Location: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/WebGPUScene.tsx`
- Description: The WebGPU renderers (WebGPUMandelbulbRenderer, WebGPUQuaternionJuliaRenderer, etc.) are **NOT instantiated or used anywhere in the application**. The `WebGPUScene` component uses generic passes (`MainObjectMRTPass`, `ScenePass`, `BloomPass`, etc.) but never imports or instantiates the object-specific renderers. The `MainObjectMRTPass` merely clears targets and ends immediately (lines 231-235) - it does not delegate to object renderers.

**2. BIND GROUP BINDING MISMATCH (Critical)**
- Location: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/renderers/WebGPUMandelbulbRenderer.ts` (lines 553-558)
- Description: The Mandelbulb renderer creates 5 bind groups (camera, lighting, material, quality, object) but sets `objectBindGroup` at **both** index 3 and 4. This means `qualityBindGroup` is never used despite being created:
  ```typescript
  passEncoder.setBindGroup(3, this.objectBindGroup) // Should be qualityBindGroup?
  passEncoder.setBindGroup(4, this.objectBindGroup)
  ```

**3. PLACEHOLDER BIND GROUP PATTERN (Warning)**
- Location: Multiple renderers (Schroedinger, BlackHole, Polytope, TubeWireframe)
- Description: Several renderers use `(this as any).materialBindGroup` and `(this as any).qualityBindGroup` to store placeholder bind groups created in `createPipeline()`. This is a code smell that bypasses TypeScript's type system and indicates incomplete design:
  ```typescript
  ;(this as any).materialBindGroup = materialBindGroup
  ;(this as any).qualityBindGroup = qualityBindGroup
  ```

**4. INCOMPLETE DIMENSION CHANGE HANDLING (Warning)**
- Location: All renderers
- Description: All `setDimension()` methods have comments like "Note: Would need to recreate pipeline for dimension change" but **none implement pipeline recreation**. Changing dimension at runtime would not work correctly.

**5. MISSING NORMAL/DEPTH OUTPUTS (Warning)**
- Location: WebGPUSchrodingerRenderer, WebGPUBlackHoleRenderer
- Description: These renderers only output to `hdr-color` but the render graph expects `normal-buffer` and `depth-buffer` for deferred shading and post-processing (GTAO, SSR). This will cause the post-processing pipeline to fail.

### Uniformity Analysis

The renderers follow a **mostly consistent pattern**:
- All extend `WebGPUBasePass`
- All implement `constructor`, `createPipeline`, `execute`, `dispose`, `setDimension`
- All use similar bind group structures (camera, lighting, material, quality, object)

However, there are **inconsistencies**:
1. **Bounding geometry**: Mandelbulb/Julia use a cube, Schroedinger/BlackHole/Polytope(bounding sphere) use spheres, TubeWireframe uses instanced cylinders
2. **Uniform update methods**: Julia has more helper methods (`setJuliaConstant`, `updateJuliaUniforms`, `updateBasisVectors`, `initializeDefaultUniforms`); others have fewer
3. **IBL support**: Only Julia has IBL bind group and texture; others don't
4. **Vertex attributes**: Different vertex layouts (8 floats for cube, 3 floats for sphere, 14 floats for polytope faces)

### Resource Cleanup Analysis

All renderers properly implement `dispose()`:
- Call `buffer?.destroy()` for all GPU buffers
- Set references to `null` after destruction
- Call `super.dispose()` to clean up base class resources

**Issue**: Texture destruction is only present in Julia renderer (`envMapTexture?.destroy()`). If other renderers add textures in the future, they must remember to destroy them.

### Shader Binding Analysis

All shader composition functions exist and are properly exported:
- `composeMandelbulbShader`, `composeMandelbulbVertexShader`
- `composeJuliaShader`, `composeJuliaVertexShader`
- `composeSchroedingerShader`, `composeSchroedingerVertexShader`
- `composeBlackHoleShader`, `composeBlackHoleVertexShader`
- `composeFaceVertexShader`, `composeFaceFragmentShader`, `composeEdgeVertexShader`, `composeEdgeFragmentShader`
- `composeTubeWireframeVertexShader`, `composeTubeWireframeFragmentShader`

Uniform binding appears correct where implemented, matching the bind group layouts to shader expectations.

### Integration Status

**What's Wired:**
- Renderers are exported from `src/rendering/webgpu/renderers/index.ts`
- Main `src/rendering/webgpu/index.ts` re-exports renderers via `export * from './renderers'`

**What's Orphaned:**
- **All 6 object renderers are orphaned** - they are never instantiated in the application
- `WebGPUScene.tsx` does not use them; it uses generic passes instead
- The `MainObjectMRTPass` is a stub that only clears targets

### Summary

The WebGPU renderers represent significant implementation work but are **not integrated into the application**. They exist as standalone classes that could render objects if instantiated, but the current WebGPU pipeline (`WebGPUScene.tsx`) uses a different architecture with generic passes and does not instantiate object-specific renderers. To complete the WebGPU migration, either:

1. The renderers need to be instantiated in `WebGPUScene` based on `objectType` prop, OR
2. The `MainObjectMRTPass` needs to be modified to delegate to the appropriate renderer

Additionally, several quality issues (bind group mismatches, placeholder patterns, incomplete dimension handling) should be addressed before the renderers are production-ready.</result>
</task-notification>
Full transcript available at: /private/tmp/claude/-Users-Spare-Documents-code-mdimension/tasks/a1c85ad.output

<task-notification>
<task-id>aa8c11a</task-id>
<status>completed</status>
<summary>Agent "Review WGSL shaders for GLSL leakage" completed</summary>
<result>Now I have enough information to compile the complete audit report.

## WGSL Syntax Audit

### GLSL Leakage Found

| File | Line | Issue | Code Snippet |
|------|------|-------|--------------|
| `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/shaders/groundplane/main.wgsl.ts` | 82-86 | **Preprocessor directives** - WGSL does not support #ifdef/#else/#endif | `#ifdef USE_SHADOWS` / `#else` / `#endif` |
| `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/shaders/shared/raymarch/sphere-intersect.wgsl.ts` | 26, 52 | **Documentation uses GLSL-style return type** (not actual code) | `@returns vec2(near, far)` in JSDoc comment |
| `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/shaders/skybox/modes/horizon.wgsl.ts` | 42 | **Comment references mod() function** (not actual code, workaround is used) | `// mod(time * 0.15, TAU)` - code uses `floor()` workaround |

### Critical Issues (Will Cause Shader Compilation Failure)

**1. Preprocessor Directives in `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/shaders/groundplane/main.wgsl.ts`**

Lines 82-86 contain:
```wgsl
#ifdef USE_SHADOWS
    let shadow = select(1.0, getShadow(i, input.worldPosition), shadowUniforms.enabled != 0u);
#else
    let shadow = 1.0;
#endif
```

This is invalid WGSL. WebGPU shaders do not support C-style preprocessor directives. This must be handled either:
- At JavaScript/TypeScript level before shader compilation
- Using runtime branching with `if` statements
- Using shader variants generated at build time

### Non-Issues (Valid Usage or Documentation Only)

**1. `vec2(`, `vec3(`, `vec4(` patterns** - The matches in `sphere-intersect.wgsl.ts` are in JSDoc comments describing return types, not actual WGSL code. The actual function signatures use correct WGSL types like `vec2f`, `vec3f`.

**2. `mod()` function comment** - The comment in `horizon.wgsl.ts` explains the workaround being used. The actual code correctly uses `floor()` to implement modulo: `(time * 0.15) - floor(time * 0.15 / TAU) * TAU`

**3. `uniform` keyword matches** - All matches are in:
- JSDoc comments (e.g., "uniform structures", "uniform buffer")
- Variable names (e.g., `uniformVelocity`, `colorUniforms`)
- Not actual GLSL uniform declarations

**4. `varying` keyword match** - Found in a comment "time-varying uniforms", not GLSL varying declaration.

**5. `discard;` statements** - These are valid WGSL. The `discard` statement in WGSL can optionally include a semicolon.

**6. `float` keyword matches** - Found only in comments ("float value is NaN"), not type declarations.

### Files Clean

All 106 WGSL shader files were checked. The following directories had no issues:

- `src/rendering/webgpu/shaders/shared/core/` (2 files) - Clean except uniforms.wgsl.ts has comment only
- `src/rendering/webgpu/shaders/shared/color/` (5 files) - Clean
- `src/rendering/webgpu/shaders/shared/lighting/` (4 files) - Clean  
- `src/rendering/webgpu/shaders/shared/raymarch/` (3 files) - Clean (JSDoc comment only)
- `src/rendering/webgpu/shaders/shared/features/` (4 files) - Clean
- `src/rendering/webgpu/shaders/shared/math/` (1 file) - Clean (comment only)
- `src/rendering/webgpu/shaders/shared/depth/` (1 file) - Clean
- `src/rendering/webgpu/shaders/mandelbulb/` (4 files + 8 sdf/*.wgsl.ts) - Clean
- `src/rendering/webgpu/shaders/julia/` (15 files) - Clean
- `src/rendering/webgpu/shaders/schroedinger/` (18 files) - Clean
- `src/rendering/webgpu/shaders/blackhole/` (11 files) - Clean
- `src/rendering/webgpu/shaders/polytope/` (1 file) - Clean
- `src/rendering/webgpu/shaders/tubewireframe/` (2 files) - Clean
- `src/rendering/webgpu/shaders/postprocessing/` (6 files) - Clean
- `src/rendering/webgpu/shaders/skybox/` (17 files) - Clean (comment only)

### Summary

- **Total files checked:** 106
- **Files with critical issues:** 1 (`groundplane/main.wgsl.ts`)
- **Critical syntax errors:** 1 (preprocessor directive usage)
- **Documentation-only issues:** 2 (harmless comments)

### Recommended Fix

For `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/shaders/groundplane/main.wgsl.ts`, replace the preprocessor block with runtime branching:

```wgsl
// Replace:
#ifdef USE_SHADOWS
    let shadow = select(1.0, getShadow(i, input.worldPosition), shadowUniforms.enabled != 0u);
#else
    let shadow = 1.0;
#endif

// With:
var shadow = 1.0;
if (USE_SHADOWS && shadowUniforms.enabled != 0u) {
    shadow = getShadow(i, input.worldPosition);
}
```

Where `USE_SHADOWS` should be a constant boolean or uniform that can be set at runtime, or generate shader variants at the TypeScript level before shader compilation.</result>
</task-notification>
Full transcript available at: /private/tmp/claude/-Users-Spare-Documents-code-mdimension/tasks/aa8c11a.output
## Constraints / Non-goals
<local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.</local-command-caveat>
Execute each phase sequentially. Do not skip phases. Document findings as you go.
AI coding agents frequently hallucinate imports, function names, API methods, configuration options, and variable names that do not exist. This is the highest-priority failure mode.
This is invalid WGSL. WebGPU shaders do not support C-style preprocessor directives. This must be handled either:
## Decisions
-
## Plan / Checklist
- Phase 4: Completeness Audit
   - Phase 5: Correctness Verification
   - Phase 6: Concurrency & Race Conditions
   - Phase 7: Performance Review
   - Phase 8: Type Safety & Error Handling
   - Phase 9: Dead Code & Artifact Cleanup
   - Phase 10: Dependency & Compatibility Check
   - Created a main task to track the review
   - Delegated 6 parallel subagent tasks to review different aspects:
     - Core infrastructure (ae5c834)
     - Renderers (a1c85ad)
     - Render passes (a0256de)
     - WGSL shaders for GLSL leakage (aa8c11a)
     - Integration and App wiring (a4bc6dd)
     - Test coverage (a0df709)
   - Performed direct verification checks myself for critical issues
   - Core Infrastructure (ae5c834): Found type safety issues, operator precedence bug, dead timestamp code
   - Renderers (a1c85ad): Confirmed renderers are orphaned, found bind group mismatch issues
   - Render Passes (a0256de): All 32 passes properly implement WebGPUBasePass, no critical issues
   - WGSL Shaders (aa8c11a): Found 1 critical issue (preprocessor directives in groundplane)
   - Integration (a4bc6dd): Confirmed WebGPU integration is wired in App.tsx but object renderers not used
   - Test Coverage (a0df709): Minimal coverage, core WebGPU classes have zero tests
   - WebGPU infrastructure: WebGPUDevice.ts, WebGPUBasePass.ts, WebGPURenderGraph.ts, etc.
   - Renderers: 6 WebGPU renderer files
   - Passes: 32+ pass files
   - WGSL shaders: 106 shader files
   - Integration: App.tsx, WebGPUCanvas.tsx, WebGPUScene.tsx, rendererStore.ts
   - Tests: 3 test files with 93 tests passing
   - WebGPU rendering architecture with render graph pattern
   - WGSL shader language (WebGPU Shading Language) vs GLSL
   - WebGPUBasePass abstract class for render passes
   - MRT (Multiple Render Target) output for deferred rendering
   - Bind group layouts and GPU resource management
   - React integration with WebGPU (WebGPUCanvas, WebGPUScene components)
   - Zustand stores for renderer mode switching (rendererStore)
   - Fullscreen post-processing pipeline pattern
   - 106 WGSL shader files across mandelbulb, julia, schroedinger, blackhole, skybox, groundplane
     - Contains invalid WGSL preprocessor directives that will fail compilation
     - Execute method only clears targets, doesn't render objects
     - Sets up render passes but never instantiates object-specific renderers
     - Lines 36-37 only import ObjectType type, not actual renderers
     - Object renderers (WebGPUMandelbulbRenderer, etc.) are exported but never used
     - Exports 6 renderers that are never instantiated anywhere
     - Type annotation issues at line 99-108 (uses `any`)
     - Operator precedence bug at line 500 in `skipped` calculation
     - GPU timestamp writing but never read back (dead code)
     - Lines 278-295: Conditional rendering based on `rendererMode === 'webgpu'`
     - WebGPUCanvas and WebGPUScene properly wired
   - No errors during review process itself
     - WGSL preprocessor directives in groundplane shader
     - Orphaned object renderers
     - MainObjectMRTPass stub implementation
     - Bind group mismatch in WebGPUMandelbulbRenderer (uses objectBindGroup at index 3 AND 4)
   - Delegated complex review to 6 parallel subagents for efficiency
   - Directly verified critical integration gaps (renderers never instantiated)
   - Ran tests to verify 93 tests pass
   - Identified the root cause of why WebGPU would render blank: MainObjectMRTPass clears targets but never draws anything
   - Task #1 "Complete WebGPU Port Code Review" is in_progress
   - Need to compile final review report with all subagent findings
   - Core infrastructure review (valid API calls, type safety issues, dead timestamp code)
   - Renderer review (all 6 renderers orphaned, bind group issues)
   - Pass review (32 passes all properly implement WebGPUBasePass)
   - WGSL audit (1 critical issue in groundplane/main.wgsl.ts)
   - Integration review (App.tsx wired, but renderers never instantiated)
   - Test coverage (minimal - only state management tested)
   - Summary of files reviewed and verdict
   - Critical Issues (must fix): preprocessor directives, orphaned renderers, stub MRT pass
   - Warnings: type safety issues, dead code, bind group mismatches
   - Verification checklist confirmation
- Line 40: imports `useWebGPUSupport` from `@/hooks/useWebGPUSupport`
- Line 51: imports `WebGPUCanvas, WebGPUScene` from `@/rendering/webgpu`
- Line 235: calls `const { mode: rendererMode } = useWebGPUSupport()` to detect and get the renderer mode
- Lines 278-296: Conditional rendering based on `rendererMode === 'webgpu'`
  - If `webgpu`: renders `<WebGPUCanvas>` with `<WebGPUScene>` inside
  - If `webgl`: renders the standard `<Canvas>` with `<Visualizer>`
- Line 361: `<WebGPUFallbackNotification />` is rendered in the overlay layer
- Rendered as a child of `WebGPUCanvas`
- Receives `objectType` and `dimension` props from the geometry store
- Exported from `/Users/Spare/Documents/code/mdimension/src/stores/index.ts`
- Test file at `/Users/Spare/Documents/code/mdimension/src/tests/hooks/useWebGPUSupport.test.ts` (12 references)
- Exports `WebGPUCanvas`, `WebGPUContext`, `useWebGPU` from `./WebGPUCanvas`
- Exports `WebGPUScene` from `./WebGPUScene`
- Exports all core, graph, passes, renderers, and shaders
- Exports all 32+ pass classes including `MainObjectMRTPass` and `ScenePass` (used by WebGPUScene)
   - It references `MainObjectMRTPass` and `ScenePass` which exist in passes/index.ts
   - However, the object renderers (WebGPUMandelbulbRenderer, WebGPUBlackHoleRenderer, etc.) in `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/renderers/` are exported but not directly used in WebGPUScene
   - The render graph `execute()` method receives `objectType` and `dimension` but the connection between the scene and object-specific renderers is unclear
- App.tsx conditionally renders WebGPUCanvas/WebGPUScene when `rendererMode === 'webgpu'`
- Detection hook integrates with rendererStore properly
- Fallback notification is shown when WebGPU is unavailable
- Store actions (forceWebGL, handleDeviceLost) are connected
- All barrel exports are in place
- The actual object rendering - render passes are declared but object-specific renderers don't appear to be instantiated
- Geometry data pipeline (vertices, faces) is not passed to WebGPU path
- The render graph `execute()` method receives metadata but the actual rendering logic connection is unclear without reading the pass implementations</result>
- Location: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/WebGPUScene.tsx`
- Description: The WebGPU renderers (WebGPUMandelbulbRenderer, WebGPUQuaternionJuliaRenderer, etc.) are **NOT instantiated or used anywhere in the application**. The `WebGPUScene` component uses generic passes (`MainObjectMRTPass`, `ScenePass`, `BloomPass`, etc.) but never imports or instantiates the object-specific renderers. The `MainObjectMRTPass` merely clears targets and ends immediately (lines 231-235) - it does not delegate to object renderers.
- Location: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/renderers/WebGPUMandelbulbRenderer.ts` (lines 553-558)
- Description: The Mandelbulb renderer creates 5 bind groups (camera, lighting, material, quality, object) but sets `objectBindGroup` at **both** index 3 and 4. This means `qualityBindGroup` is never used despite being created:
- Location: Multiple renderers (Schroedinger, BlackHole, Polytope, TubeWireframe)
- Description: Several renderers use `(this as any).materialBindGroup` and `(this as any).qualityBindGroup` to store placeholder bind groups created in `createPipeline()`. This is a code smell that bypasses TypeScript's type system and indicates incomplete design:
- Location: All renderers
- Description: All `setDimension()` methods have comments like "Note: Would need to recreate pipeline for dimension change" but **none implement pipeline recreation**. Changing dimension at runtime would not work correctly.
- Location: WebGPUSchrodingerRenderer, WebGPUBlackHoleRenderer
- Description: These renderers only output to `hdr-color` but the render graph expects `normal-buffer` and `depth-buffer` for deferred shading and post-processing (GTAO, SSR). This will cause the post-processing pipeline to fail.
- All extend `WebGPUBasePass`
- All implement `constructor`, `createPipeline`, `execute`, `dispose`, `setDimension`
- All use similar bind group structures (camera, lighting, material, quality, object)
- Call `buffer?.destroy()` for all GPU buffers
- Set references to `null` after destruction
- Call `super.dispose()` to clean up base class resources
- Renderers are exported from `src/rendering/webgpu/renderers/index.ts`
- Main `src/rendering/webgpu/index.ts` re-exports renderers via `export * from './renderers'`
- The `MainObjectMRTPass` is a stub that only clears targets
- At JavaScript/TypeScript level before shader compilation
- Using runtime branching with `if` statements
- Using shader variants generated at build time
- JSDoc comments (e.g., "uniform structures", "uniform buffer")
- Variable names (e.g., `uniformVelocity`, `colorUniforms`)
- Not actual GLSL uniform declarations
## Notes
- Auto-generated on compaction / tool events. Edit manually if needed.
- Keep this short; it will be injected into context.
