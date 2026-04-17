# CPU Frame-Loop Overhead Reduction

## Executive Summary

Baseline from 2026-04-17 (`perf-benchmark.spec.ts`, 4-run runs, `cpuTimeMs` column):

| mode          | CPU ms (median) | CPU ms (max)  |
|---------------|-----------------|---------------|
| HO 3D         | 0.14            | 0.17          |
| Hydrogen 3D   | 0.15            | 0.18          |
| TDSE 3D       | 0.17            | 0.22          |
| BEC 3D        | 0.18            | 0.20          |
| Dirac 3D      | 0.17            | 0.22          |
| **Free Scalar 3D** | **0.36**   | **0.86**      |

FSF is the outlier: **5× higher CPU per frame** than every other mode, plus significant variance (max 0.86 ms in one sample). Other modes are well within budget — pre-allocated refs, version-based dirty tracking, stable empty arrays, and WASM-accelerated rotation math (`src/rendering/renderers/base/useRotationUpdates.ts`) keep CPU cost minimal.

On an 8 ms frame budget, 0.86 ms is 10 % — worth investigating for FSF specifically. For other modes, 0.2 ms is likely irreducible React + Zustand overhead.

## Why Not Already Done

- The single 0.86 ms reading was one sample in one run; median was 0.36 ms. Could be a warm-start artifact, a ResizeObserver firing, or a garbage-collection pause.
- Primary optimisation session was GPU-bound (Dirac batching, BEC render profile) — CPU leverage is capped at <1 ms per frame.
- Hardest problem to measure: CPU profiling in headless Chrome + Playwright is not reliable (no microprofile hooks, perf traces are noisy). Needs a bespoke instrumentation harness.

## Investigation Plan

### Step 1 — Confirm FSF outlier is reproducible

Run `perf-benchmark.spec.ts -g "Free Scalar 3D"` 20 times. If CPU max stays < 0.5 ms across all runs, the 0.86 ms was noise — close this plan.

If the outlier reproduces:
- Does it happen on first frame only? (likely setup cost)
- Does it recur every N frames? (likely periodic work — worker result landing, diagnostics readback)
- Is it correlated with stepsPerFrame or sub-stepping? (FSF has CFL adaptive sub-stepping up to 32 substeps)

### Step 2 — Bisect the FSF frame path

FSF's per-frame CPU path (from `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`):

1. `for (const buf of this.pendingStagingBuffers) buf.destroy()` — frees previous frame's staging
2. `this.flushKSpaceData(device)` — writes density texture if worker has data
3. `this.maybeRebuild(device, config)` — hash check + conditional rebuild
4. `this.updateUniforms(...)` — 528-byte uniform write (line 243 of `FreeScalarFieldComputePassUniforms.ts`)
5. Per substep (up to 32): `writeFsfDtSlot`, `writeFsfCosmologyCoefsSlot` — small targeted uniform writes
6. Per step: phi + pi dispatches
7. Per frame: `writeGrid` dispatch + diagnostics

Add CPU timestamps around each phase. Either:
- Inline `performance.now()` bookends logged via the dev `logger.log` (use a throttled per-100-frame log to avoid spam)
- Or use the existing `WebGPUFrameStats.cpuBreakdown` structure and add more phases

Measure each phase's contribution. The expected suspects:

| phase | likely cost | why |
|-------|-------------|-----|
| `updateUniforms` | 50–200 µs | 528-byte buffer + 100 lines of JS filling typed-array slots — includes `computeFsfCosmologyCoefs` + `computeMassSquaredScale` even when disabled (both should early-return to 1) |
| `flushKSpaceData` | 0–5 ms | only when worker has data; rare event but expensive write |
| per-substep uniform writes | 0–500 µs × 32 substeps | only active under cosmology/preheating (not default benchmark) |
| `pendingStagingBuffers.destroy()` | tiny | usually empty |

### Step 3 — Cross-check other modes for hidden waste

Even though other modes report 0.17 ms median, there may be consistent inefficiency across all modes that could be trimmed. Candidates to profile:

**`useSceneFrameCallbacks.advanceSceneStateByDelta`** (`src/rendering/webgpu/useSceneFrameLoop.ts` line 104):
- `useAnimationStore.getState()` + destructuring — getState is fast but object destructuring allocates
- `animatingPlanes` iteration + `planeList.findIndex(...)` — O(n²) if dim > 3 but n ≤ 55 at dim=11, so bounded ~3 µs
- `useUIStore.getState().animationBias` — another getState
- `useExtendedObjectStore.getState()` + `.schroedinger.parameterValues` — another getState
- `getBasisVectors()` — cached, mostly no-op when rotations haven't changed

**`executeFrameAndCollectMetrics`** (`src/rendering/webgpu/scenePassConfig.ts`):
- `performance.now()` × 3 bracketing
- `graph.execute(delta)` — the main work

**`WebGPURenderGraph.execute`** (`src/rendering/webgpu/graph/WebGPURenderGraph.ts`):
- Pre-allocated frameContext, resusable render ctx — good
- `captureFrameContext` iterates `storeGetters` — 7 stores × `getState()` per frame
- `computePassOrder` runs on compile, not execute — good
- Per-pass iteration: `getPassEnabled` (cached per frame) + dispatch

### Step 4 — Identify one concrete win

From the profile data in Step 2 + Step 3, pick ONE bottleneck and fix it. Probable targets:

**Target A: Reduce `updateUniforms` cost on no-change frames**.
FSF uniforms include cosmology/preheating coefficients that ARE re-computed every frame (`computeFsfCosmologyCoefs` + `computeMassSquaredScale`) even when those features are disabled. Gate the re-computation on `config.cosmology.enabled || config.preheating.enabled` — skip the whole coef block when disabled. Saves ~50–100 µs for the common path.

**Target B: Reduce store getState() churn**.
`captureFrameContext` in the render graph pulls all registered stores every frame. Check if `useAppearanceStore`, `useEnvironmentStore`, etc. change often. If not, switch to a subscription-based cache (like `rotationsRef` already does in `useRotationUpdates`).

**Target C: Merge getState calls in advanceSceneStateByDelta**.
4+ separate `.getState()` calls per frame in `useSceneFrameLoop.ts`. Zustand's `getState()` is cheap but the pattern allocates temporary objects via destructuring. Cache the store handles in refs.

**Target D: Eliminate `Math.floor(...)` → `| 0`** and similar micro-ops — probably too small to measure but easy.

### Step 5 — Measurement Methodology

The `perf-benchmark.spec.ts` aggregates cpuTime across 120 frames. Noise floor is ~0.05 ms. To see a 0.1 ms improvement, collect ~20 samples per arm and compute median with confidence interval.

Use the existing `performance.measure` API via User Timing in the frame loop, expose via `performance.getEntriesByType('measure')`, pull the array in the playwright spec, compute stats.

Write `scripts/playwright/fsf-cpu-profile.spec.ts` following the `dirac-batch-ab.spec.ts` pattern but measuring:
- Per-phase CPU ms (updateUniforms, flushKSpace, advance, passes, submit)
- Frame-to-frame jitter (stddev)
- Distribution histogram (p50, p95, p99, max)

## Files Likely Touched

- `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts` — per-frame orchestration
- `src/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms.ts` — uniform write
- `src/rendering/webgpu/useSceneFrameLoop.ts` — frame-loop getState pattern
- `src/rendering/webgpu/graph/WebGPURenderGraph.ts` — frameContext capture
- `src/rendering/webgpu/scenePassConfig.ts` — frame execution entry

## Known Pitfalls

- **Measurement noise dominates** — consumer-laptop CPU variance can exceed 50 %. Only the median of N≥10 interleaved samples is trustworthy.
- **Zustand selectors cache poorly in render-graph context** — stores subscribed via `setStoreGetter` are called every frame by the graph; converting to an event-based update risks stale data. Keep the pattern and only optimise the `getState()` call frequency, not the freshness model.
- **React StrictMode** double-invokes effects in dev — the "cpuTime" reported in dev and prod may differ. Benchmark should run against the `vite dev` server which is what's measured currently; don't compare dev vs prod CPU numbers directly.
- **GC pauses** — a 0.86 ms outlier may be a minor GC, not code cost. V8 GC under `happy-dom` is different from real Chrome. Confirm by checking max-vs-p99 ratio; a clean improvement should bring both down.

## Correctness Guards

- Frame-loop changes MUST NOT affect simulation state. A CPU-side optimisation that accidentally delays `useRotationStore` reads by one frame creates visual lag. Run the existing `scripts/playwright/animation-controls.spec.ts` + `keyboard.spec.ts` to catch interaction regressions.
- All 7630 unit tests pass. Frame-loop tests live under `src/tests/rendering/` — check coverage.
- Screenshot-parity check: take one screenshot per mode before/after; compare for drift.

## Definition of Done

1. FSF outlier reproducibility confirmed (or dismissed as noise). Document with numbers.
2. Per-phase CPU breakdown published in the task state log.
3. One optimisation landed with ≥15 % CPU median reduction on affected mode, measured via ≥10-sample interleaved A/B.
4. No visual / functional regression (animation controls, keyboard, screenshots).
5. All 7630 unit tests pass.
6. If no measurable win is found after profiling, close the plan with a "verified already optimal" note and move on — a negative result is still useful documentation.
