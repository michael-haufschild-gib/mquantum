# BEC Raymarcher Render-Path Optimisation

**Status**: Proposed
**Effort estimate**: 4–8 hours (investigation-heavy — may terminate without a measurable win)
**Expected impact**: unknown on M3 Max (VSync-capped); potentially 10–25 % render-pass time on weaker GPUs (Intel iGPU, older NVIDIA laptop)

## Executive Summary

Baseline measurement from 2026-04-17, `perf-benchmark.spec.ts` BEC 3D default (4-run median):

| metric                       | value       |
|------------------------------|-------------|
| FPS                          | 110 (VSync-capped at ~110 on M3 Max headless) |
| schroedinger pass total      | 3.51 ms (median) / 3.09 ms (min) |
| — compute portion            | 1.88 ms     |
| — render portion             | 3.04 ms     |
| GPU total (all passes)       | 13.97 ms    |

**The render side dominates BEC's schroedinger pass by ~1.6×** despite compute doing the heavy physics (Strang splitting + FFT). All other compute modes (TDSE, FSF, Dirac) are compute-dominant. BEC's nonlinear density coupling forces the raymarcher to sample a denser, higher-contrast field than TDSE's smoother wavefunctions, which likely blunts the existing empty-skip optimisation.

The raymarcher is **already heavily optimised** (see `src/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl.ts`):
- Early termination on `transmittance < MIN_TRANSMITTANCE = 0.01`
- Adaptive step size based on log-density
- Empty-skip with 2-probe lookahead at `rho < 1e-7`
- Pre-computed normals grid (1 fetch vs 6-fetch central difference), enabled for TDSE/BEC (2026-04-12)
- Front-to-back compositing with Beer–Lambert absorption

The remaining leverage is **not** in adding more tricks, but in identifying where BEC specifically defeats the existing ones.

## Why Not Already Done

- On M3 Max at 960×600, BEC already hits VSync. No frame drops.
- Optimising a VSync-capped scenario produces "improvement" that users can't observe.
- The real failure mode is on weaker GPUs, which the primary dev machine cannot represent. Verifying a win requires either:
  - A Windows/Intel iGPU test machine, OR
  - Forcing the GPU budget tight via resolution scaling (4K viewport → ~4× GPU work)

## Investigation Plan

### Step 0 — Confirm the render-vs-compute split is real

The `schroedinger` pass timestamp is wall-clock: compute begin → render end. If compute and render overlap on the GPU the numbers are misleading. Check by:

1. Add a split timestamp in the Schrödinger renderer — insert a query between the compute dispatches (handled by the compute pass) and the fullscreen raymarch draw call. See `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` for where compute and render are invoked. The render graph's `RenderContextImpl` already separates compute and render timestamps (`computeBegin`/`renderBegin` in `src/rendering/webgpu/graph/WebGPUTimestampCollector.ts`) — verify the reported `computeGpuTimeMs` and `renderGpuTimeMs` are accurate by temporarily disabling one phase and re-running the benchmark.

2. If the 3.04 ms render-side number is actually capturing compute latency (via end-to-end barrier), pivot. The real bottleneck is then compute, not raymarch.

### Step 1 — Reproduce GPU-bound conditions

Force BEC to drop frames on the dev machine so improvements are measurable:

- Bump resolution: run Chrome with `--window-size=2560x1600` and let the renderer run at full DPR. Target: BEC schro render > 8 ms.
- Or: add a `?viewportScale=2.0` URL knob (already in `usePerformanceStore.renderResolutionScale`) that forces 2× resolution. Existing; just set it in the benchmark spec.

Add a new scenario to `perf-benchmark.spec.ts` once reproducible: `BEC 3D @ 2x res`. Run 5-sample median to establish variance.

### Step 2 — Profile the raymarcher

Use the **PROFILING_STRIP_*** compile-time flags already in `volumeRaymarchGrid.wgsl.ts` (see lines 14–21):
- `PROFILING_STRIP_GRADIENT` — replaces the gradient fetch with a constant normal. Measures: how much does the normal fetch + shading cost?
- `PROFILING_STRIP_LIGHTING` — replaces lit emission with flat baseColor. Measures: PBR lighting cost.
- `PROFILING_STRIP_EMPTY_SKIP` — forces every sample to evaluate. Measures: empty-skip's effective win.
- `PROFILING_STRIP_ADAPTIVE_STEP` — forces uniform stepping. Measures: adaptive step's win.
- `PROFILING_HALF_SAMPLES` — cap at 64 samples instead of 128. Measures: worst-case sample count cost.

Write a `scripts/playwright/bec-raymarch-profile.spec.ts` that enables each flag in isolation and measures schro render time. Output: table of per-feature cost contribution. This identifies which optimisation is most defeated by BEC's density profile.

Pattern to follow: clone `scripts/playwright/dirac-batch-ab.spec.ts`. For each flag toggle, use a runtime `window.__SHADER_PROFILING_FLAGS` pattern, or recompile the pipeline with flag values injected at WGSL compose time (preferred — shader compiles are one-time and don't affect per-frame cost).

### Step 3 — Target the worst-offending feature

Once the profile identifies the biggest cost, pick ONE target. Likely candidates:

**Hypothesis A: BEC's smooth, wide density field defeats empty-skip**.
BEC ground states fill most of the trap. If `rho < 1e-7` rarely triggers, the 2-probe lookahead runs every sample without skipping. Fix: specialise the raymarcher for "dense" modes (BEC, TDSE with wide packets) — skip the empty-skip branch entirely (saves 1 comparison + 2 texture fetches per iteration when the skip doesn't fire).

**Hypothesis B: adaptive step is too conservative for smooth fields**.
`computeAdaptiveStep(sCenter, stepLen, tFar - t)` in `src/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl.ts` (or integration.wgsl.ts). If BEC's log-density varies slowly, aggressive step scaling could halve the iteration count. Tune the step factor — measure iteration count in the profile to see if BEC hits MAX_VOLUME_SAMPLES=128 often.

**Hypothesis C: PBR lighting (`computeEmissionLit`) is the dominant cost**.
128 samples × full PBR eval = 128 GGX computations per ray. If `PROFILING_STRIP_LIGHTING` shows a huge drop on BEC, move to a simpler lighting model for volumetric samples (e.g. Lambertian with ambient + single directional) — reserve full PBR for isosurface mode.

**Hypothesis D: texture sampling is bandwidth-bound, not ALU-bound**.
Two `textureSampleLevel` per iteration on `rgba16float` 3D texture. At 960×600 pixels × 128 samples × 2 fetches = 147 M texture fetches per frame. On weaker GPUs the L2 texture cache thrashes. Fix: reduce density grid precision from `rgba16float` to `rgba8unorm` (halves bandwidth) — verify precision loss is acceptable by running the physics correctness tests.

### Step 4 — Implement + measure

Pick one hypothesis, implement the change, re-run the `bec-raymarch-profile.spec.ts` with the change toggled via another runtime flag (`window.__BEC_OPTIMISATION_ENABLED`), 5-sample interleaved A/B. Gate: ≥10 % schro render improvement on the 2× resolution scenario. Below that threshold, revert.

## Files to Touch

Likely candidates (will narrow once profile data is in):
- `src/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl.ts` — the Simple variant (~line 35, `generateVolumeRaymarchGridSimpleBlock`) is the one rendering BEC.
- `src/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl.ts` — adaptive step, sample helpers.
- `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts` / `emissionLit.wgsl.ts` — lighting.
- `src/rendering/webgpu/shaders/schroedinger/composeBlockBuilders.ts` — flag plumbing.

## Correctness Guards

- Compare a 20-step BEC simulation before/after change by reading the density grid via `TDSEStateSaveLoad` and diffing numerically. Differences > 1 % at any voxel = break.
- Run all existing playwright specs under `scripts/playwright/bec-*.spec.ts` to catch visual regressions.
- Take a screenshot of groundState, singleVortex, quantumTurbulence presets before and after; visual diff. The raymarcher is a visual feature — a "faster" render that looks different is a regression.

## Known Pitfalls

- **Metal shader compiler miscompilation** — the simple variant exists precisely because the Full variant crashed on Apple Silicon for compute modes (comment at top of `volumeRaymarchGrid.wgsl.ts`). Any restructuring of the loop body must be tested on all three backends. If symbol stripping triggers the bug, you'll see density reads returning zero inside the loop even though standalone calls work.
- **`textureSample` vs `textureLoad`** — `textureSample` requires uniform control flow. Any new branch in the main loop must be carefully structured. Don't add `if (...) { sampleDensity... }` inside a divergent branch.
- **VSync capping hides wins** — if the benchmark still shows 110 FPS after your change, the test environment is not GPU-bound. Increase resolution until FPS drops below 60 before claiming improvement.
- **`rgba16float` → `rgba8unorm` precision** — BEC densities span ~6 orders of magnitude (vortex cores ≈ 0, bulk ≈ peak). `unorm8` quantises to 256 levels; this is visibly catastrophic for the density log scale. If you attempt this, compute log-density on the compute side and store that — then the 8-bit precision maps onto log space.

## Out of Scope

- No changes to the compute pass itself (TDSE split-step, BEC nonlinearity). That is the `compute` half of the schroedinger pass and is not the bottleneck per the hypothesis.
- No changes to post-processing passes (bloom, tone mapping). Those are separate timing entries.
- Isosurface mode shares code but has different costs — do not regress it; guard changes behind the `gridOnly` path only.

## Definition of Done

1. 2× resolution scenario added to benchmark with reproducible ≥8 ms schro render baseline.
2. `bec-raymarch-profile.spec.ts` identifies the biggest cost contributor (per-feature table).
3. One chosen optimisation implemented with ≥10 % schro render improvement at 2× resolution.
4. No visual regression on groundState / singleVortex / quantumTurbulence (screenshot diff).
5. All existing BEC playwright specs pass.
6. Physics invariants preserved (density integrates to 1 within tolerance).
