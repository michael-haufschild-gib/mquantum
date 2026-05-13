# BEC Fast Grid Emission Performance Audit (2026-05-10)

Task: `$l7-loop-performance 8` in `mquantum`.

Measured bottleneck: BEC DPR=2 raymarch render path, especially `quantumTurbulence`, was dominated by per-sample emission/lighting/compositing in `src/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGridSimple.wgsl.ts`.

Baseline DPR=2 BEC raymarch (`logs/bec_raymarch_profile_baseline_20260510_223953.txt`):
- groundState: schroedinger 15.868 ms, render 13.926 ms, compute 1.942 ms, FPS 55.
- singleVortex: schroedinger 11.760 ms, render 9.022 ms, compute 2.739 ms, FPS 74.
- quantumTurbulence: schroedinger 25.760 ms, render 23.188 ms, compute 2.572 ms, FPS 33.
- Ablations showed `no-compositing` and `no-lighting` removed most render cost.

Failed optimization: coalescing Dirac Strang substeps into one compute pass passed type/test checks but regressed measured Dirac A/B, so product changes were reverted.

Kept optimization:
- Added `fastGridEmission?: boolean` to `SchroedingerWGSLShaderConfig` and WGSL `FAST_GRID_EMISSION` define.
- `rendererConfigUtils.buildShaderConfig()` enables it only for `rendererConfig.quantumMode === 'becDynamics'`.
- Pipeline cache key includes `config.fastGridEmission`.
- Simple grid raymarcher calls `computeEmission(...)` instead of computing grid gradient + `computeEmissionLit(...)` when `FAST_GRID_EMISSION` is true.

After DPR=2 BEC raymarch (`logs/bec_raymarch_profile_fast_emission_20260510_223953.txt`):
- groundState: schroedinger 5.115 ms, render 2.850 ms.
- singleVortex: schroedinger 3.773 ms, render 2.863 ms.
- quantumTurbulence: schroedinger 5.565 ms, render 3.481 ms, FPS 98.

Broad benchmark (`logs/perf_benchmark_fast_emission_20260510_223953.txt`): BEC 3D @2x schroedinger 4.047 ms, render 2.491 ms, compute 1.556 ms, FPS 104. TDSE unaffected by scope. Dirac remains top compute bottleneck.

Harness fixes in touched specs: replaced stale `/src/stores/*Store.ts` imports with DEV window store bridge or current paths (`/src/stores/runtime/performanceStore.ts`, `/src/stores/ui/uiStore.ts`).

Verification passed:
- `pnpm exec tsc -b --pretty false`
- `pnpm test:shaders:fast`
- targeted WGSL/render packing Vitest suite: 8 files, 76 tests
- Playwright: perf benchmark 12/12, BEC raymarch profile 21/21, compute-mode profile 33/33, rendering VRAM stability targeted 1/1

Tradeoff: BEC fast path uses ambient-only emission, so per-light volumetric lighting no longer affects BEC grid raymarch samples. Ambient lighting still applies. If user-facing lighting fidelity for BEC becomes important, add a performance/quality toggle or auto-disable fast path when custom lights are active.
