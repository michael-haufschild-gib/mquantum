# Lazy-Load Rare Quantum Mode Strategies

**Status**: Proposed
**Effort estimate**: 4–6 hours
**Expected impact**: 40–80 KB gzip off initial-load JS (≈5–10 % of 791 KB total); first-frame latency reduction proportional on slow connections

## Executive Summary

Baseline from 2026-04-17 (`node scripts/check-bundle-size.js`):

```
Total JS gzip: 791.0 KB / 795 KB budget  ← 4 KB of headroom
Largest chunks (gzip):
  shaders-schroedinger   155 KB   (625 KB raw — compute + render shaders for ALL modes)
  rendering              139 KB   (540 KB raw — ALL compute passes, ALL strategies, graph)
  components-panels      104 KB
  components              64 KB
  physics                 61 KB
  react-vendor            60 KB
```

The bundle is **already aggressively code-split** (see `vite.config.ts` `assignChunk` — 14 source-path rules + 7 vendor rules). Panels are `React.lazy`, overlays are lazy, per-mode Wigner/screenshot/export chunks are deferred.

What's **not** lazy: the quantum mode strategies. Every session loads shader code for every mode, even if the user only uses HO + Hydrogen. From `src/rendering/webgpu/renderers/strategies/createStrategy.ts`:

```ts
import { AnalyticModeStrategy } from './AnalyticModeStrategy'
import { AntiDeSitterStrategy } from './AntiDeSitterStrategy'
import { DiracStrategy } from './DiracStrategy'
import { FreeScalarFieldStrategy } from './FreeScalarFieldStrategy'
import { PauliStrategy } from './PauliStrategy'
import { QuantumWalkStrategy } from './QuantumWalkStrategy'
import { TdseBecStrategy } from './TdseBecStrategy'
import { WheelerDeWittStrategy } from './WheelerDeWittStrategy'
```

Each strategy imports its compute pass, which imports its shader blocks, which get bundled into `rendering` and `shaders-schroedinger`. Estimated split (raw, eager on current main):

| strategy            | compute-pass raw | WGSL raw | user-facing common? |
|---------------------|-----------------:|---------:|---------------------|
| AnalyticMode        |              ~5K |     ~80K | **yes — default mode** |
| TdseBecStrategy     |             ~80K |    ~120K | **yes — common** |
| DiracStrategy       |             ~60K |     ~60K | moderate |
| FreeScalarField     |             ~70K |     ~80K | moderate |
| AntiDeSitter        |             ~20K |     ~40K | **rare** |
| WheelerDeWitt       |             ~15K |     ~30K | **rare** |
| PauliStrategy       |             ~55K |     ~50K | **rare** |
| QuantumWalkStrategy |             ~30K |     ~35K | **rare** |

Lazy-loading the 4 rare modes (AdS, WdW, Pauli, QW) could move ~340 KB raw / ~85 KB gzip out of the initial bundle. The tradeoff: mode-switch delay of 50–200 ms when the user picks one of those modes for the first time — acceptable for rare modes where the user has already committed to a context switch.

## Why Not Already Done

- `createModeStrategy` is called **synchronously** inside `WebGPUSchrodingerRenderer` constructor (line 155) AND inside the already-async `createPipeline` method (line 193). The constructor call uses the result immediately to configure the shader config (`this.strategy.configureShader(this.shaderConfig, ...)` line 157). Making `createModeStrategy` async forces the constructor to defer `configureShader` — a non-trivial refactor that touches pipeline construction ordering.
- Vite's dev warning is already visible:
  ```
  appearanceStore is dynamically imported by diracSetters.ts but also statically imported ...
  dataExport.ts is dynamically imported by stateSave.ts but also statically imported ...
  ```
  These are "false lazy" imports with no bundle benefit. They suggest prior attempts that didn't plumb the async through the call chain.

## Implementation Plan

### Part 1 — Sanity Measurement

Before touching code, measure exactly how much each strategy chunk contributes. Use `rollup-plugin-visualizer`:

```bash
npm install -D rollup-plugin-visualizer
```

In `vite.config.ts`, in the `plugins:` array add:
```ts
import { visualizer } from 'rollup-plugin-visualizer'
// ...
plugins: [
  // ...existing...
  process.env.ANALYZE === '1' && visualizer({ open: false, filename: 'dist/bundle-stats.html', gzipSize: true, brotliSize: true }),
],
```

Run `ANALYZE=1 npm run build` and read `dist/bundle-stats.html`. For each strategy + its compute pass + its shader files, record the exact gzip byte count. Commit these numbers to the task state log.

**Gate**: if the combined rare-modes chunks are < 40 KB gzip, stop — the win isn't worth the refactor. Estimated from file sizes + typical gzip ratio, but confirm.

### Part 2 — Async Strategy Factory

Convert `createModeStrategy` to return a `Promise<QuantumModeStrategy>`:

```ts
// src/rendering/webgpu/renderers/strategies/createStrategy.ts
import { AnalyticModeStrategy } from './AnalyticModeStrategy'  // keep eager
import { TdseBecStrategy } from './TdseBecStrategy'             // keep eager
import { DiracStrategy } from './DiracStrategy'                 // keep eager (in benchmark)
import { FreeScalarFieldStrategy } from './FreeScalarFieldStrategy'  // keep eager? see §Eager-vs-lazy
// Lazy-load rare modes
const loadPauliStrategy = () => import('./PauliStrategy').then(m => m.PauliStrategy)
const loadQuantumWalkStrategy = () => import('./QuantumWalkStrategy').then(m => m.QuantumWalkStrategy)
const loadWheelerDeWittStrategy = () => import('./WheelerDeWittStrategy').then(m => m.WheelerDeWittStrategy)
const loadAntiDeSitterStrategy = () => import('./AntiDeSitterStrategy').then(m => m.AntiDeSitterStrategy)

export async function createModeStrategy(config: SchrodingerRendererConfig): Promise<QuantumModeStrategy> {
  if (config.isPauli) {
    const Cls = await loadPauliStrategy()
    return new Cls()
  }
  switch (config.quantumMode) {
    case 'quantumWalk':    { const Cls = await loadQuantumWalkStrategy(); return new Cls() }
    case 'wheelerDeWitt':  { const Cls = await loadWheelerDeWittStrategy(); return new Cls() }
    case 'antiDeSitter':   { const Cls = await loadAntiDeSitterStrategy(); return new Cls() }
    case 'freeScalarField': return new FreeScalarFieldStrategy()
    case 'tdseDynamics':
    case 'becDynamics':    return new TdseBecStrategy()
    case 'diracEquation':  return new DiracStrategy()
    default:               return new AnalyticModeStrategy()
  }
}
```

### Part 3 — Plumb Through Renderer Constructor

This is the hard bit. `WebGPUSchrodingerRenderer` constructor uses `strategy.configureShader` synchronously. Approach:

1. Add a **placeholder** strategy that can configureShader with the default (analytic-mode) assumptions. Use `AnalyticModeStrategy` as the placeholder.
2. In the constructor, set `this.strategy = new AnalyticModeStrategy()` (eager default).
3. Start the async load via `this.strategyLoadPromise = createModeStrategy(config).then(s => { this.strategy = s; s.configureShader(this.shaderConfig, this.rendererConfig) })`.
4. In `createPipeline` (which is already `async`), `await this.strategyLoadPromise` before using the strategy.

This keeps the synchronous constructor API but defers strategy resolution.

**Alternative** — if you can refactor callers: make the renderer construction itself async. Grep for `new WebGPUSchrodingerRenderer(` — if all callers are in already-async contexts (`setupRenderPasses` etc), an async factory is cleaner.

### Part 4 — Handle Mode Switches

`createPipeline` (line 193 of `WebGPUSchrodingerRenderer.ts`) re-calls `createModeStrategy` on every config change. Already async — just `await`:

```ts
this.strategy = await createModeStrategy(this.rendererConfig)
```

No other changes needed since `createPipeline` is already a Promise.

### Part 5 — UX: Shader Compile Overlay

When the user first switches to a rare mode, the chunk network-loads (50–500 ms) and then the shader compiles. The existing `ShaderCompilationOverlay` covers shader compile time but not the chunk fetch. Verify the overlay logic correctly covers the await on `strategyLoadPromise`.

Look for `setShaderCompiling` in `usePerformanceStore` — the existing flow calls `setShaderCompiling('pipeline', true)` in `scenePassSetup.ts`. Extend it to also wrap the strategy-load window (or add a new `'strategy-loading'` phase).

### Part 6 — Verification

1. **Bundle size**: `npm run build` → `check-bundle-size.js` must pass. Before-after gzip total should drop ~40–85 KB.
2. **Per-chunk inspection**: re-run `ANALYZE=1 npm run build`, confirm the 4 rare mode files are in separate async chunks (filename-hashed).
3. **Functional**: e2e spec that switches to each rare mode and verifies render produces pixels. Pattern: `scripts/playwright/rendering.spec.ts` already does this for all modes — run it twice, once cold (fresh dev server) to exercise chunk fetch, once warm.
4. **Unit tests**: all 7630 must still pass.

## Eager-vs-lazy Decision Matrix

| mode | keep eager? | reason |
|------|-------------|--------|
| HO / Hydrogen (AnalyticMode) | **eager** | default mode; first paint |
| TDSE / BEC (TdseBecStrategy) | **eager** | most-used dynamic mode; in benchmark |
| Dirac | **eager** | in benchmark; optimised mode |
| FSF | **borderline** — moderately common, ~150 KB raw. Lazy-load if Part 1 shows it's big. |
| Pauli | **lazy** | niche |
| QuantumWalk | **lazy** | niche |
| WheelerDeWitt | **lazy** | cosmology-specialist mode |
| AntiDeSitter | **lazy** | cosmology-specialist mode |

## Files Touched

- `src/rendering/webgpu/renderers/strategies/createStrategy.ts` — async factory
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` — constructor + createPipeline
- `src/rendering/webgpu/scenePassSetup.ts` — may need await plumbing around `setupSchrodingerPasses`
- `vite.config.ts` — optional `ANALYZE=1` visualizer
- Possibly `src/components/overlays/ShaderCompilationOverlay.tsx` — cover strategy-loading phase

## Known Pitfalls

- **Race conditions** — rapid mode switches (user clicks mode A → mode B before A finishes loading) must cancel the stale promise. The existing `setupGenerationRef` in `WebGPUScene.ts` handles this for pipeline setup; extend it to gate strategy-load completion.
- **Preset import / URL state** — on first page load with `?qm=pauliSpinor` in the URL, the strategy loads async while `useUrlState` is still running. Currently the app shows "Initializing WebGPU renderer…" — confirm that covers this window. If not, add a brief loading indicator.
- **False lazy imports** — the existing Vite warnings (`appearanceStore`, `dataExport`) show that a dynamic import is only effective if NO other file statically imports the same module. Before marking a strategy as lazy, grep for all its imports and confirm no parent has a static import chain.
- **WASM / worker chunks** — some strategies trigger web-worker chunks (`peschelWorker`, `kSpaceWorker`). These are already lazy-loaded separately. Don't accidentally eager-import them by refactoring.
- **Budget interaction** — `scripts/check-bundle-size.js` has per-chunk budgets. Lazy-loaded chunks create new chunks; add budgets for them (the file's `CHUNK_BUDGETS` map) so accidental regressions are caught.

## Out of Scope

- No new physics, no new modes.
- Do not touch the "Advanced mode" switching UX (it already lazy-loads its section).
- Do not change how compute passes are instantiated within strategies — only how strategies are imported.

## Definition of Done

1. Bundle visualiser output committed to the task state log with before-after gzip per chunk.
2. `dist/assets/` shows separate hashed chunks for each lazy mode.
3. Total JS gzip drops by at least 40 KB (hard floor — below that the refactor isn't worth it).
4. `npx playwright test scripts/playwright/rendering.spec.ts` passes for all modes.
5. Cold mode-switch to a lazy mode shows a <500 ms delay (shader compile + chunk fetch).
6. All 7630 unit tests pass.
7. `scripts/check-bundle-size.js` updated with new per-chunk budgets.
