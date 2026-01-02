# Performance Review (Codex)

## Scope
- Full-stack render pipeline review (CPU + GPU) without changing visual quality or user-facing defaults.
- Components inspected: render loop scheduling, R3F scene wiring, Polytope/Tubes, raymarchers, post-processing graph, geometry/face generation workers, perf/VRAM metrics.

## High-Risk / High-Impact Findings
- **Dual RAF drivers**: `FpsController` drives frames while `useAnimationLoop` uses its own `requestAnimationFrame`, causing two wakeups and unsynchronized throttling when `frameloop="never"` is already used (`src/hooks/useAnimationLoop.ts`, `src/rendering/controllers/FpsController.tsx`). Unify on one scheduler (prefer the existing `advance` tick) and pass rotation deltas there.
- **Per-frame autofocus raycast**: `PostProcessingV2` runs `autoFocusRaycaster.intersectObjects(scene.children, true)` every frame when the graph executes, regardless of whether autofocus is enabled. Raycasting the whole scene each tick is costly on CPU. Gate by autofocus mode and throttle to camera/object transform changes or a time budget.
- **Unconditional pass parameter churn**: In `PostProcessingV2`’s useFrame, pass setters run every frame (clear colors, SSR steps, buffer preview routing) even when inputs are unchanged. Add change-detection to skip redundant GPU state updates.
- **Uniform/Shadow updates without dirty checks**: `PolytopeScene` updates ND uniforms, color uniforms, shadow uniforms every frame even when versions are unchanged (rotation/appearance/lighting). Similar pattern in `TubeWireframe`. Use existing version refs to short-circuit `updateNDUniforms`/`updateShadowMapUniforms`.
- **VRAM traversal overhead**: `PerformanceStatsCollector` walks the entire scene to estimate VRAM whenever the System tab is active, on a 2s cadence. Add visibility-gated debounce (only when the tab becomes active) and reuse the last result unless a frame-count-based invalidation occurs.
- **Graph execute always on**: RenderGraph executes even when all enabled() predicates are false (e.g., most post-processing off). Add a fast-path skip when no passes are active to avoid full graph traversal.

## Detailed Findings

### Render Loop & Scheduling
- `Canvas` runs `frameloop="never"` and uses `FpsController` to call `advance()` on a RAF. `useAnimationLoop` runs a separate RAF with its own FPS throttle. This duplicates wakeups and can desync rotation updates from render cadence. Recommendation: drive rotations from the same tick as `advance()` or expose a shared scheduler so animation deltas and render deltas align.
- Frame priorities are centralized (`FRAME_PRIORITY`), but multiple priority-0 callbacks (camera, animation, renderers) rely on registration order. Documented but still worth consolidating timing-sensitive work (animations, uniform updates) into fewer hooks to reduce scheduling overhead.

### Post-Processing Graph (`PostProcessingV2`)
- Graph executes every frame; even when effects are disabled, passes are evaluated. A quick “active pass” guard can skip execution when `enabled()` is false for all passes.
- Autofocus raycast runs every frame; it should be gated to modes `auto-center`/`auto-mouse` and throttled to transform changes or an interval.
- Per-frame setters (clear colors, SSR max steps, buffer preview modes) run unconditionally in useFrame. Add state snapshots to avoid resending unchanged values.
- Temporal resources: when temporal reprojection/cloud are disabled, the graph still resolves targets; consider deferring allocation/swap until enabled.
- CAS sharpening is recomputed when renderResolutionScale changes, but setSharpness(0) still runs every effect-change; cache the last applied value.

### Polytope/Tubes
- `PolytopeScene` and `TubeWireframe` push ND transforms, color conversions, and shadow uniforms every frame even when versions haven’t changed. Dirty-flag the categories (rotation, appearance, lighting/IBL, shadow) and skip updates when unchanged.
- Shadow updates call `collectShadowDataCached` and `updateShadowMapUniforms` per frame; avoid when shadowEnabled is false or shadowVersion is unchanged.
- Tube instance attributes are preallocated; good. Ensure resizing only occurs on edge-count increase (already indicated) and not on every visibility toggle.

### Raymarchers (Mandelbulb / Quaternion Julia / Schrödinger)
- Uniform updates appear to run per-frame without explicit dirty checks; audit for redundant uniforms (time, camera, quality) versus truly changing values. Align them with a single scheduler to avoid double RAFs.
- Temporal buffers (depth/cloud) are toggled by store flags; ensure RenderGraph does not keep the ping-pong targets alive when the feature is off.

### Geometry / Face Generation / Workers
- `useGeometryGenerator` uses worker + IndexedDB caching for Wythoff polytopes; good. Face detection relies on `useAsyncFaceDetection` without a geometry hash: recomputation may trigger on dimension toggles back-and-forth. Add hash-based memo to reuse previous faces when geometry is unchanged.
- Generation cancellation is handled via requestId; solid. Consider debouncing generation when rapid dimension/type toggles happen to avoid worker churn.

### Perf Metrics & VRAM
- `PerformanceStatsCollector` wraps `gl.render` when the Stats tab is open; good tiering. VRAM traversal is heavy—run only when the System tab becomes active and back off to >2s or change-driven sampling.
- Min/max FPS tracking is cumulative; consider windowed stats to prevent long-session drift if desired.

### Resource / Graph Management
- RenderGraph has resource aliasing for disabled passes and a disable grace period (60 frames) before deallocation. Ensure the grace period doesn’t retain large MRTs when post-processing is globally off; allow an immediate drop when all passes disabled for N frames or when post-processing toggle is off.
- Passthrough materials are cached per attachment count; good. Ensure `executePassthrough` isn’t called when the target is already identical (alias) to avoid redundant copies.

## Recommendations (No Visual Quality Changes)
1) **Unify scheduling**: Drive `useAnimationLoop` from `FpsController`’s tick (or a shared scheduler). Keep a single RAF.  
2) **Throttle autofocus**: Only raycast when autofocus mode is active; throttle to transform changes or ≥100ms; reuse last hit.  
3) **Dirty-check uniforms**: In Polytope/Tubes, skip ND/appearance/shadow uniform updates when versions unchanged; same for raymarcher uniforms where applicable.  
4) **Graph active-pass short-circuit**: Skip `graph.execute` when no passes are active; defer temporal buffers when temporal features are off.  
5) **Reduce pass churn**: Cache last-applied SSR steps, clear colors, buffer preview mode; only set when values change.  
6) **VRAM traversal gating**: Run VRAM scan only on System tab activation and at a coarse cadence; reuse cached totals otherwise.  
7) **Face/geometry memo**: Hash geometry for `useAsyncFaceDetection` to avoid redundant face recomputation when geometry is unchanged.  
8) **Resource teardown**: When post-processing is disabled, immediately release graph resources instead of waiting 60 frames; keep grace period only for per-pass toggles.  
9) **CAS sharpening cache**: Cache last sharpness to avoid redundant `setSharpness` calls; skip CAS when scale ≥ 0.99.

## Suggested Priority
- P0: Unify RAF scheduling; throttle autofocus; dirty-check uniforms/shadows; active-pass short-circuit.  
- P1: Pass churn reductions; VRAM gating; temporal buffer deferral; face/geometry hash memo.  
- P2: Resource teardown tuning; CAS sharpness caching; windowed stats option.

## Notes
- All suggestions preserve visual output; no quality presets, LOD, or adaptive quality changes are proposed. 

