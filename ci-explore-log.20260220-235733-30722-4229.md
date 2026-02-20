## Active Target
Harmonic Oscillator Eigencache Fidelity Path (UI/store/scene/renderer/shader/compute/tests)

## Task Queue Details
- [in_progress] Understand purpose of Harmonic Oscillator Eigencache Fidelity Path
- [pending] Analyze src/stores/performanceStore.ts
- [pending] Analyze src/components/sections/Performance/EigenfunctionCacheControls.tsx
- [pending] Analyze src/rendering/webgpu/WebGPUScene.tsx
- [pending] Analyze src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts
- [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compose.ts
- [pending] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/eigenfunctionCache.wgsl.ts
- [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/eigenfunctionCache.wgsl.ts
- [pending] Analyze src/rendering/webgpu/passes/EigenfunctionCacheComputePass.ts
- [pending] Analyze src/tests/stores/performanceStore.test.ts
- [pending] Analyze src/tests/rendering/webgpu/wgslCompilation.test.ts
- [pending] Analyze src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts
- [pending] Analyze src/tests/rendering/webgpu/WebGPUScene.casSharpening.test.ts
- [pending] Trace UI -> performance store -> WebGPUScene -> renderer -> shader defines
- [pending] Trace eigencache compute sizing/dispatch and runtime sampling/interpolation flow
- [pending] Evaluate harmonic-oscillator eigencache fidelity behavior against intended purpose

## Issues Found

## Issues Fixed

## Deferred for Developer

### Progress Notes
- [completed] Understand purpose of Harmonic Oscillator Eigencache Fidelity Path:
  - Intended behavior: keep harmonic-oscillator fidelity controls independent (cache enable, analytical gradient, robust interpolation), increase eigencache density to 2048, and preserve correct shader variant rebuild + compute dispatch sizing.
  - Verification sources: docs/architecture.md and docs/plans/harmonic-oscillator-eigencache-fidelity-plan-2026-02-20.md.
- [in_progress] Analyze src/stores/performanceStore.ts
- [queue update] Added direct dependency files for thorough eigencache coverage:
  - src/components/sections/Performance/PerformanceSection.tsx
  - src/rendering/webgpu/shaders/schroedinger/compute/composeEigenCache.ts
  - src/rendering/webgpu/shaders/schroedinger/quantum/index.ts
  - src/rendering/webgpu/shaders/schroedinger/index.ts
- [completed] Analyze src/stores/performanceStore.ts
  - Store currently exposes `eigenfunctionCacheEnabled` only; no independent `analyticalGradientEnabled` or `robustEigenInterpolationEnabled` state/actions.
- [completed] Analyze src/components/sections/Performance/EigenfunctionCacheControls.tsx
  - UI has one switch + description; no subordinate toggles and no disabled-state wiring for dependent controls.
- [completed] Analyze src/components/sections/Performance/PerformanceSection.tsx
  - Performance section includes `EigenfunctionCacheControls` only; no additional eigencache fidelity controls.
- [completed] Analyze src/rendering/webgpu/WebGPUScene.tsx
  - `performanceSelector`, `PassConfig`, `SchrodingerPassConfig`, and `createObjectRenderer(...)` only carry `eigenfunctionCacheEnabled`.
- [completed] Analyze src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts
  - Renderer config/pipeline key currently vary on `useEigenfunctionCache` but not analytical/robust interpolation feature flags.
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compose.ts
  - `USE_ANALYTICAL_GRADIENT` is hard-coupled to `useEigenfunctionCache && includeHarmonic`; no external flag.
  - No robust interpolation define emitted.
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/eigenfunctionCache.wgsl.ts
  - `EIGEN_CACHE_SAMPLES` is still 1024.
  - Lookup uses Catmull-Rom-only interpolation with clamped domain and no dedicated robust extrapolation policy.
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/eigenfunctionCache.wgsl.ts
  - `WORKGROUPS_PER_FUNC` is hardcoded as `4u`, coupled to 1024 samples and 256 workgroup size.
- [completed] Analyze src/rendering/webgpu/passes/EigenfunctionCacheComputePass.ts
  - Dispatch count in TS is derived from `EIGEN_CACHE_SAMPLES`, but comments and shader-side constant are stale/coupled.
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/composeEigenCache.ts
  - Compute shader assembly is straightforward; no issue beyond consumed constants/defines from source blocks.
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/index.ts
  - Exports eigencache constants; changing sample count here propagates to all importers.
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/index.ts
  - Re-export layer includes eigencache constants and compose entry points; no local logic defect.
- [completed] Analyze src/tests/stores/performanceStore.test.ts
  - Missing test coverage for analytical-gradient/robust-interpolation store state.
- [completed] Analyze src/tests/rendering/webgpu/wgslCompilation.test.ts
  - Missing assertions for robust interpolation define and explicit analytical-gradient override behavior.
- [completed] Analyze src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts
  - PassConfig fixture omits potential new eigencache fidelity fields.
- [completed] Analyze src/tests/rendering/webgpu/WebGPUScene.casSharpening.test.ts
  - PassConfig fixture omits potential new eigencache fidelity fields.
- [in_progress] Trace UI -> performance store -> WebGPUScene -> renderer -> shader defines
- [completed] Trace UI -> performance store -> WebGPUScene -> renderer -> shader defines
  - `EigenfunctionCacheControls` toggles `usePerformanceStore.setEigenfunctionCacheEnabled`.
  - `WebGPUScene.performanceSelector` reads only `eigenfunctionCacheEnabled`.
  - `PassConfig`/`SchrodingerPassConfig` carry only this cache flag.
  - `createObjectRenderer(...)` passes only `eigenfunctionCacheEnabled` into `WebGPUSchrodingerRenderer`.
  - Renderer sets `shaderConfig.useEigenfunctionCache`; no analytical/robust flags exist.
  - `composeSchroedingerShader(...)` emits `USE_ANALYTICAL_GRADIENT` as hard-coupled expression `useCache && includeHarmonic`.
- [in_progress] Trace eigencache compute sizing/dispatch and runtime sampling/interpolation flow
- [completed] Trace eigencache compute sizing/dispatch and runtime sampling/interpolation flow
  - CPU dedup in `EigenfunctionCacheComputePass.deduplicateFromUniforms` computes `(xMin,xMax,invRange)` using `EIGEN_CACHE_SAMPLES`.
  - Compute pass dispatch count is `numUniqueFuncs * ceil(EIGEN_CACHE_SAMPLES / 256)` in TS.
  - Compute shader still hardcodes `WORKGROUPS_PER_FUNC = 4u` (valid only for 1024 samples), creating latent mismatch if sample count changes.
  - Runtime lookup in `eigenfunctionCache.wgsl.ts` clamps normalized coordinate and runs Catmull-Rom interpolation only; out-of-domain behavior is endpoint clamping instead of explicit linear extrapolation.
  - Cached values feed HO ND and hydrogen extra dimensions via generated cached dispatch blocks, and gradients route through `sampleDensityWithAnalyticalGradient` when `USE_ANALYTICAL_GRADIENT` is true.
- [in_progress] Evaluate harmonic-oscillator eigencache fidelity behavior against intended purpose

### Evaluation Outcome
- [completed] Harmonic-oscillator eigencache fidelity currently diverges from intended behavior in three areas.

## Issues Found
1. Missing independent fidelity controls (analytical gradient + robust interpolation)
   - Root cause: store/UI/scene/renderer/shader config pipeline only exposes `eigenfunctionCacheEnabled`.
   - Impact: users cannot isolate interpolation artifacts from gradient-path effects, reducing scientific debugging fidelity.
2. Eigencache sample density/workgroup coupling is stale
   - Root cause: `EIGEN_CACHE_SAMPLES` remains 1024 and compute shader hardcodes `WORKGROUPS_PER_FUNC = 4u`.
   - Impact: lower sampling fidelity than target and fragile shader dispatch mapping if sample count changes.
3. Lookup policy lacks robust interpolation/extrapolation mode
   - Root cause: Catmull-Rom-only lookup with clamped index and no explicit out-of-range policy.
   - Impact: endpoint flattening/overshoot risk near extrema and outside cached domain, causing visible shape artifacts for high-n states.

## Issues Fixed
1. Independent eigencache fidelity toggles implemented end-to-end
   - Files: `src/stores/performanceStore.ts`, `src/components/sections/Performance/EigenfunctionCacheControls.tsx`, `src/rendering/webgpu/WebGPUScene.tsx`, `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`, `src/rendering/webgpu/shaders/schroedinger/compose.ts`.
   - Added store state/actions:
     - `analyticalGradientEnabled` (default `true`)
     - `robustEigenInterpolationEnabled` (default `true`)
   - Added UI switches (`analytical-gradient-toggle`, `robust-eigen-interpolation-toggle`) and disabled them when cache is off while preserving underlying values.
   - Propagated flags through `PassConfig`/`SchrodingerPassConfig`, renderer config, shader config, and pipeline cache key.
   - Added compile-time defines:
     - `USE_ANALYTICAL_GRADIENT`
     - `USE_ROBUST_EIGEN_INTERPOLATION`

2. Eigencache density and dispatch coupling corrected
   - Files: `src/rendering/webgpu/shaders/schroedinger/quantum/eigenfunctionCache.wgsl.ts`, `src/rendering/webgpu/shaders/schroedinger/compute/eigenfunctionCache.wgsl.ts`, `src/rendering/webgpu/passes/EigenfunctionCacheComputePass.ts`.
   - Increased `EIGEN_CACHE_SAMPLES` from `1024` to `2048`.
   - Replaced hardcoded compute `WORKGROUPS_PER_FUNC = 4u` with derived formula:
     - `(EIGEN_CACHE_SAMPLES + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE`
   - Updated workgroup indexing to use `local_invocation_id` for clearer mapping.

3. Robust interpolation/extrapolation mode added
   - File: `src/rendering/webgpu/shaders/schroedinger/quantum/eigenfunctionCache.wgsl.ts`.
   - Added robust policy path (guarded by `USE_ROBUST_EIGEN_INTERPOLATION`):
     - linear extrapolation outside `[xMin, xMax]` using endpoint `(phi, dphi)`
     - sign-sensitive linear fallback near extrema
     - monotone-limited cubic Hermite interpolation otherwise
   - Retained legacy Catmull-Rom path when robust mode is disabled.

### Verification
- `npx vitest run --maxWorkers=4 src/tests/stores/performanceStore.test.ts src/tests/components/sections/Performance/EigenfunctionCacheControls.test.tsx`
  - PASS (39 tests)
- `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/wgslCompilation.test.ts -t "Eigenfunction Cache"`
  - PASS (10 tests, 95 skipped)
- `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/wgslCompilation.test.ts`
  - PASS (105 tests)
- `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts src/tests/rendering/webgpu/WebGPUScene.casSharpening.test.ts`
  - PASS (18 tests)
- Combined targeted run:
  - `npx vitest run --maxWorkers=4 src/tests/stores/performanceStore.test.ts src/tests/components/sections/Performance/EigenfunctionCacheControls.test.tsx src/tests/rendering/webgpu/wgslCompilation.test.ts src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts src/tests/rendering/webgpu/WebGPUScene.casSharpening.test.ts`
  - PASS (162 tests)

## Deferred for Developer
- None for this patrol target.

### Patrol Status
- [completed] Fix issue: add independent analytical-gradient and robust-interpolation toggles across store/UI/scene/renderer/shader composition
- [completed] Fix issue: raise eigencache sample density to 2048 and remove hardcoded workgroup coupling in compute shader
- [completed] Fix issue: implement robust interpolation/extrapolation policy in eigencache lookup and extend regression tests
- [completed] Verification run complete (targeted suites all green)

---
## Active Target
Harmonic Oscillator Controls + Second-Quantization Flow

## Task Queue Details
- [in_progress] Understand purpose of Harmonic Oscillator Controls + Second-Quantization Flow
- [pending] Analyze src/components/sections/Geometry/SchroedingerControls/HarmonicOscillatorControls.tsx
- [pending] Analyze src/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection.tsx
- [pending] Analyze src/components/sections/Geometry/SchroedingerControls/index.tsx
- [pending] Analyze src/components/sections/Geometry/SchroedingerControls/types.ts
- [pending] Analyze src/lib/math/secondQuantization.ts
- [pending] Analyze src/stores/slices/geometry/schroedingerSlice.ts
- [pending] Analyze src/tests/components/sections/SecondQuantizationSection.test.tsx
- [pending] Analyze src/tests/lib/math/secondQuantization.test.ts
- [pending] Analyze src/tests/stores/slices/geometry/schroedingerSqLayer.test.ts
- [pending] Trace HO control UI -> actions -> store mutation flow
- [pending] Trace second-quantization metric computation flow (config -> math helpers -> UI values)
- [pending] Evaluate HO controls + second-quantization behavior against intended purpose
- [completed] Understand purpose of Harmonic Oscillator Controls + Second-Quantization Flow
  - Intended behavior: preserve existing HO rendering while exposing pedagogical operator-level interpretation (Fock/coherent/squeezed) and derived metrics with correct mode gating.
  - Source: docs/plans/second-quantization-educational-layer.md.
- [in_progress] Analyze src/components/sections/Geometry/SchroedingerControls/HarmonicOscillatorControls.tsx
- [completed] Analyze src/components/sections/Geometry/SchroedingerControls/HarmonicOscillatorControls.tsx
  - HO controls are independent from SQ educational metrics; no direct metric coupling from this file.
- [completed] Analyze src/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection.tsx
  - Found semantic coupling bug: `params.n` was assigned from `sqLayerSelectedModeIndex` (mode index `k`).
- [completed] Analyze src/components/sections/Geometry/SchroedingerControls/index.tsx
  - No direct SQ rendering logic here; SQ section is wired from Analysis section.
- [completed] Analyze src/components/sections/Geometry/SchroedingerControls/types.ts
  - SQ action contract lacked dedicated setter for Fock quantum number.
- [completed] Analyze src/lib/math/secondQuantization.ts
  - Fock metrics correctly depend on `params.n`; bug origin is upstream parameter wiring.
- [completed] Analyze src/stores/slices/geometry/schroedingerSlice.ts
  - SQ store had `sqLayerSelectedModeIndex` only; no independent Fock quantum number state.
- [completed] Analyze src/tests/components/sections/SecondQuantizationSection.test.tsx
  - Tests did not guard against mode-index/Fock-number conflation.
- [completed] Analyze src/tests/lib/math/secondQuantization.test.ts
  - Math helpers are correct and already validate Fock/coherent/squeezed formulas.
- [completed] Analyze src/tests/stores/slices/geometry/schroedingerSqLayer.test.ts
  - Covered only mode-index clamping; no Fock-number setter coverage.
- [completed] Trace HO control UI -> actions -> store mutation flow
  - Confirmed SQ actions are sourced from `SchroedingerCrossSectionSection` and mutate `schroedingerSlice` setters.
- [completed] Trace second-quantization metric computation flow (config -> math helpers -> UI values)
  - `SecondQuantizationSection` builds `SecondQuantParams` then calls `computeSecondQuantMetrics`; only incorrect mapping was `n <- sqLayerSelectedModeIndex`.
- [completed] Evaluate HO controls + second-quantization behavior against intended purpose
  - Intent in docs: `selectedModeIndex` selects mode `k`; Fock number state `n` is separate. Implementation diverged.

### Evaluation Outcome
- [completed] One correctness issue identified and fixed for SQ educational semantics.

## Issues Found
4. Conflation of mode index `k` with Fock quantum number `n`
   - Root cause: `SecondQuantizationSection` passed `sqLayerSelectedModeIndex` into `SecondQuantParams.n`.
   - Impact: Fock occupation/energy and uncertainty values changed with inspected mode index instead of Fock state quantum number.

## Issues Fixed
4. Decoupled `k` and `n` in second-quantization flow
   - Files: `src/lib/geometry/extended/types.ts`, `src/stores/slices/geometry/types.ts`, `src/stores/slices/geometry/schroedingerSlice.ts`, `src/components/sections/Geometry/SchroedingerControls/types.ts`, `src/components/sections/Advanced/SchroedingerCrossSectionSection.tsx`, `src/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection.tsx`, `src/stores/utils/presetSerialization.ts`.
   - Added SQ state/action:
     - `sqLayerFockQuantumNumber` (default `0`)
     - `setSchroedingerSqLayerFockQuantumNumber(n)` with clamping `[0, 10]`
   - UI updates:
     - Added Fock-only slider: `Fock quantum number (n)` (`sq-layer-fock-n`)
     - `SecondQuantParams.n` now uses `sqLayerFockQuantumNumber`
     - Vacuum preset now explicitly resets Fock number to `0`
   - Serialization safety:
     - Marked `sqLayerFockQuantumNumber` transient in preset serialization path.

5. Regression coverage expanded for SQ decoupling
   - Files: `src/tests/components/sections/SecondQuantizationSection.test.tsx`, `src/tests/stores/slices/geometry/schroedingerSqLayer.test.ts`, `src/tests/stores/utils/presetSerialization.test.ts`, `src/tests/stores/presetManagerStore.test.ts`.
   - Added/updated assertions for:
     - Fock slider visibility by mode
     - Occupation using Fock `n` independent of mode `k`
     - Vacuum preset resets Fock `n`
     - Setter clamp behavior for `sqLayerFockQuantumNumber`
     - Transient field stripping for presets/imported legacy scenes

### Verification
- `npx vitest run --maxWorkers=4 src/tests/components/sections/SecondQuantizationSection.test.tsx src/tests/stores/slices/geometry/schroedingerSqLayer.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/lib/math/secondQuantization.test.ts`
  - PASS (89 tests)

## Deferred for Developer
- None for this patrol target.

### Patrol Status
- [completed] Fix issue: separate SQ mode index `k` from Fock quantum number `n` across config/store/UI
- [completed] Fix issue: preserve SQ transience contract for new field in preset serialization/import
- [completed] Verification run complete (targeted suites all green)

---
## Active Target
Harmonic Oscillator Preset Regeneration Sensitivity

## Task Queue Details
- [completed] Identify HO config->renderer mismatches affecting preset fidelity
- [completed] Analyze `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` preset regeneration conditions
- [completed] Add regression coverage for small `frequencySpread` updates
- [completed] Implement minimal fix for preset regeneration threshold
- [completed] Verify with targeted renderer + HO preset store tests

### Evaluation Outcome
- [completed] One HO runtime-fidelity issue found and fixed.

## Issues Found
6. HO frequencySpread slider dead zone in preset regeneration
   - Root cause: renderer preset regeneration required `|ΔfrequencySpread| > 0.001`, while UI slider step is `0.0001`.
   - Impact: valid fine-grained user adjustments did not regenerate HO preset coefficients/quantum numbers, so rendering could appear unresponsive for small changes.

## Issues Fixed
6. Removed coarse frequencySpread regen dead zone
   - Files: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`, `src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`.
   - Added `frequencySpreadChanged` check with epsilon `1e-6` (below UI step size) to ensure slider-step updates regenerate cached preset.
   - Added regression test: `regenerates cached preset when frequencySpread changes by UI slider step (0.0001)`.
   - Verified failure before fix, then pass after fix.

### Verification
- Pre-fix (expected fail):
  - `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts -t "frequencySpread"`
  - FAIL: cached `frequencySpread` stayed `0.01` instead of `0.0101`.
- Post-fix:
  - `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts src/tests/stores/slices/geometry/schroedingerPresets.test.ts`
  - PASS (9 tests).

## Deferred for Developer
- None for this patrol target.

### Patrol Status
- [completed] Fix issue: HO frequencySpread fine-step changes now trigger preset regeneration
- [completed] Verification run complete (targeted suites green)
