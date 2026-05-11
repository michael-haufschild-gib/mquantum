# Lazy chunking performance audit 2026-05-11

Context: `$l7-loop-performance` run on actively used MacBook Pro, so wall-clock/FPS/GPU timings were treated only as noisy regression smoke. Retained claims used structural evidence: production chunk graph, gzip bytes, chunk-cycle checks, and focused tests.

Retained changes:
- `src/rendering/webgpu/renderers/strategies/createStrategy.ts`: compute-mode strategies are dynamically imported; only analytic placeholder is loaded before async pipeline setup.
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`: constructor uses `createInitialModeStrategy`; `createPipeline` awaits real strategy and configures shader before pipeline creation.
- `vite.config.ts`: mode-specific compute shaders, compute passes, selected mode-only physics helpers/presets, and skybox modules are assigned to lazy chunks.
- `src/lib/physics/presetDefaults.ts`: first-preset resolver avoids importing full mode preset catalogs into initial physics chunk.
- `src/rendering/webgpu/scenePassConstruction.ts`: skybox renderer is dynamically imported only when `skyboxEnabled` is true.

Structural results from `pnpm run bundle:check`:
- `shaders-schroedinger`: baseline 201.46 KiB gzip -> 117.10 KiB.
- `rendering`: baseline 149.95 KiB gzip -> 87.16 KiB.
- `physics`: baseline 77.93 KiB gzip -> 61.07 KiB.
- New lazy chunks: `rendering-tdse-bec` 79.65 KiB, `rendering-skybox` 15.78 KiB, plus smaller mode chunks.

Verified:
- `pnpm run build:web`
- `pnpm run bundle:check`
- `pnpm exec vitest run src/tests/rendering/webgpu/scenePassConstruction.test.ts src/tests/rendering/webgpu/scenePassSetup.test.ts src/tests/lib/physics/presetDefaults.test.ts src/tests/stores/quantumModeSetters.test.ts src/tests/rendering/quantumWalkIntegration.test.ts`
- `git diff --check`

Rejected experiments:
- Dirac potential-half skip: no stable win.
- Dirac cached absorber damping: negligible/noisy win with added state.
- Broader FSF/WdW physics chunk split and AdS preset split: rejected due circular chunk deps.
