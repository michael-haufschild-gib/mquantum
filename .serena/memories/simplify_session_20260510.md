# Simplify session 2026-05-10 — major architectural simplification

## What changed (uncommitted at session end; tests + lint + tsc all pass)

### T1: SinglePassComputeStrategy abstract base class
**Location:** `src/rendering/webgpu/renderers/strategies/SinglePassComputeStrategy.ts`

Eliminated ~600 LOC of structurally-identical scaffolding across 4 strategies
(Pauli, Dirac, QuantumWalk, FreeScalarField). Each concrete strategy now provides:
- `createPass(densityGridResolution): TPass` — pass factory
- `getConfig(extended): TConfig | undefined` — config field accessor
- `stateIOModeKeys: string[]` getter — for handleSimulationStateIO
- `configSubKey: string` getter — for clearComputeNeedsReset
- `executePass(pass, ctx, config, args): void` — mode-specific dispatch
Optional overrides:
- `deriveEffectiveConfig` — color-algorithm field-view overrides (Pauli/Dirac/QW)
- `stateIOOrder: 'before' | 'after'` — FSF needs 'before'
- `augmentSetup` — extra bind-group entries (FSF binding 6 analysis + binding 7 normal)
- `afterExecute` — post-dispatch hook (FSF dev diagnostics)
- `computeBoundingRadius` — Dirac/QW/FSF use computeLatticeBoundingRadius

Adoption uses `Object.getPrototypeOf` identity check (one site for prototype-equality
adoption guard). Tests pokë `pass` (not the old per-mode field name).

**NOT migrated:** TdseBecStrategy, AnalyticModeStrategy, WheelerDeWittStrategy,
AntiDeSitterStrategy — their semantics differ enough that the base would be the
wrong abstraction.

### T2: Excised ghost rendering folders
`src/rendering/{lights, renderers/base, shaders}` REMOVED — they were outside
`src/rendering/webgpu/` despite docs declaring "WebGPU only, single renderer."

Moves:
- `src/rendering/lights/types.ts` → `src/lib/lighting/lightSource.ts`
- `src/rendering/renderers/base/types.ts` → split: `src/lib/math/rotationApply.ts`
  (rotation math) + `src/constants/rendering.ts` (`QUALITY_RESTORE_DELAY_MS`).
  `MAX_DIMENSION` re-export removed; callers import from `@/constants/dimension`.
- `src/rendering/renderers/base/useRotationUpdates.ts` → `src/hooks/useRotationUpdates.ts`
- `src/rendering/shaders/types.ts` → `src/lib/rendering/shaderTypes.ts`
- `src/rendering/shaders/palette/` (6 files) → `src/lib/colors/palette/`

`src/rendering/` now contains ONLY `webgpu/`. Folder structure now matches docs.

### T4: Reorganized `src/stores/` into purpose-folders
Was 35 files flat. Now:
- `scene/` (11) — geometry, animation, camera, lighting, pbr, postProcessing, environment, transform, rotation, appearance, extendedObject
- `ui/` (6) — layout, dropdown, dismissedDialogs, msgBox, theme, ui
- `diagnostics/` (14) — anderson, monitoring, srmt, heller, quantumnessAtlas, wormhole, pageCurve, carpet, wavefunctionSlice, srmtSweep, srmtDiagnostic, diagnostics, performanceMetrics, measurement, coordinateEntanglement
- `runtime/` (7) — exportStore, performance, presetManager, renderer, screenshotCapture, screenshot, simulationState

Slices/utils/defaults stay UNCHANGED. 432 source files updated (865 import replacements).

### T8: Extracted dispatchQuantumCarpetSlice helper from WebGPUSchrodingerRenderer
30-line inline carpet-slice block → private method with JSDoc. execute() body
becomes one statement at the call site.

## Tasks deliberately deferred (with reasoning)

### T3: Lattice compute pass state value object — DEFERRED
Moving lifecycle fields from 4 compute passes to a sub-object would change
hundreds of internal call-sites in dense physics-evolution code for marginal benefit.
The eslintGuard test EXPLICITLY says compute passes are cohesive units — past attempts
produced "fake decomposition into helper files passing typed *Fields interface bags."
Polymorphic uniformity at the strategy boundary is already captured by the
`SinglePassComputePass` interface in T1.

### Sweep store dedup — already correct
`createSweepStore` is correctly used by Anderson + Monitoring. SRMT sweep is a
fundamentally different streaming worker-driven state machine (with error states,
landmarks, pendingSweep, workerTotalLocked, version counter for React) that should
NOT be coerced into the same abstraction.

### ts-prune cleanup — no actionable removals
358 candidates were almost all false positives (barrel re-exports, generated WASM
bindings, TypeScript keyword tokens). Spot checks confirmed top candidates were used.

## Final verification
- `pnpm exec tsc --noEmit --pretty false` — clean
- `pnpm run lint` — clean (`--max-warnings 0`)
- `pnpm exec vitest run` — 621 files / 9812 tests pass (matches baseline exactly)
- Net diff: ~491 files changed, ~2835 insertions, ~7762 deletions (~5000 LOC removed)

## What remains for a Staff Engineer to still want to improve
1. The 4 large compute pass classes (TDSE 1137, Pauli 905, Dirac 821, FSF 891) have
   internal complexity that's intrinsic to physics semantics. Per the eslintGuard
   ruling, these are correct as cohesive units.
2. The 9 inline custom ESLint rules in `eslint.config.js` (1244 LOC) could be split
   into 9 files. User has chosen cohesion via the eslintGuard test's design.
3. `WebGPUScene.ts` setup useEffect (~155 LOC) handles full-rebuild vs warm-swap vs
   partial rebuild branches with abort handling — each branch is meaningful and the
   complexity is intrinsic.
