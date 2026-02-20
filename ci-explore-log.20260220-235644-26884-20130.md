## Active Target

- TDSE persistence/hydration path across URL serializer + URL hook + object-type init + related tests.

## Task Queue Details

- [completed] Understand purpose of TDSE object-type feature.
  Result: Confirmed intended behavior from `docs/architecture.md` and `docs/plans/tdse-time-dependent-dynamics-plan-2026-02-20.md`: split-operator TDSE, density-grid render path, no analytic-only feature leakage, and user-facing controls for core TDSE parameters.

- [completed] Analyze docs/plans/tdse-time-dependent-dynamics-plan-2026-02-20.md
  Finding: Plan requires TDSE controls for runtime numerics/diagnostics and first-class field observables.

- [completed] Analyze src/components/layout/EditorTopBar/index.tsx
  Finding: TDSE mode naming/label path is correct (`tdseDynamics`).

- [completed] Analyze src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx
  Finding: TDSE is explicitly gated out of analytic time-evolution controls, consistent with compute-driven evolution.

- [completed] Analyze src/components/sections/Advanced/SchroedingerCrossSectionSection.tsx
  Finding: TDSE correctly gated out of analytic cross-section controls.

- [completed] Analyze src/components/sections/Advanced/SchroedingerQuantumEffectsSection.tsx
  Finding: TDSE correctly gated out of analytic quantum-effects controls.

- [completed] Analyze src/components/sections/Geometry/SchroedingerControls/TDSEControls.tsx
  Findings: Found control-surface gaps and range mismatches (details in Issues Found).

- [completed] Analyze src/components/sections/Geometry/SchroedingerControls/index.tsx
  Finding: Action wiring for TDSE setters exists and is correctly routed.

- [completed] Analyze src/components/sections/Geometry/SchroedingerControls/types.ts
  Finding: TDSE action contract includes setters not exposed in TDSEControls UI (`setHbar`, `setDiagnosticsInterval`).

- [completed] Analyze src/components/sections/ObjectTypes/ObjectTypeExplorer.tsx
  Finding: Mode selection forces dimension >= 3 for TDSE; integration point is valid.

- [completed] Analyze src/lib/geometry/extended/types.ts
  Finding: TDSE config/type surface includes `fieldView` variants (`density|phase|current|potential`), `hbar`, diagnostics interval.

- [completed] Analyze src/lib/physics/tdse/diagnostics.ts
  Finding: Diagnostics history/drift helpers are coherent and covered by tests.

- [completed] Analyze src/rendering/webgpu/WebGPUScene.tsx
  Finding: TDSE mode normalization and rebuild policy are integrated with compute-mode gating.

- [completed] Analyze src/rendering/webgpu/passes/TDSEComputePass.ts
  Finding: `fieldView` was written to uniforms but not consumed by write-grid shader output path.

- [completed] Analyze src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts
  Finding: TDSE compute pass lifecycle and execution hook are wired correctly.

- [completed] Analyze TDSE compute shader modules
  Files:
  - src/rendering/webgpu/shaders/schroedinger/compute/tdseAbsorber.wgsl.ts
  - src/rendering/webgpu/shaders/schroedinger/compute/tdseApplyKinetic.wgsl.ts
  - src/rendering/webgpu/shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl.ts
  - src/rendering/webgpu/shaders/schroedinger/compute/tdseComplexPack.wgsl.ts
  - src/rendering/webgpu/shaders/schroedinger/compute/tdseDiagnostics.wgsl.ts
  - src/rendering/webgpu/shaders/schroedinger/compute/tdseInit.wgsl.ts
  - src/rendering/webgpu/shaders/schroedinger/compute/tdsePotential.wgsl.ts
  - src/rendering/webgpu/shaders/schroedinger/compute/tdseStockhamFFT.wgsl.ts
  - src/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl.ts
  - src/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl.ts
  Findings: Core split-step kernels were coherent; write-grid field-view branch was missing.

- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts
  Finding: Quantum mode enum mapping includes TDSE mode id.

- [completed] Analyze src/stores/presetManagerStore.ts
  Finding: Post-load invariant re-enforces dimension >= 3 for compute modes, including TDSE.

- [completed] Analyze src/stores/slices/geometry/schroedingerSlice.ts
  Finding: TDSE setters/clamps/reset semantics are present and mostly consistent; UI was not fully exposing them.

- [completed] Analyze src/stores/slices/geometry/types.ts
  Finding: TDSE action/type contract is comprehensive.

- [completed] Analyze TDSE-related tests
  Files:
  - src/tests/lib/physics/tdse/diagnostics.test.ts
  - src/tests/rendering/webgpu/shaders/tdse.test.ts
  - src/tests/stores/extendedObjectStore.tdse.test.ts
  Findings: Existing tests covered many primitives but lacked assertions for write-grid `fieldView` branching and write-grid potential binding contract.

- [completed] Analyze src/stores/utils/presetSerialization.ts
  Finding: `needsReset` stripping works for nested TDSE config via transient field sanitation.

- [completed] Analyze src/stores/utils/mergeWithDefaults.ts
  Finding: Deep merge keeps TDSE config defaults for partial loads.

- [completed] Trace TDSE mode activation flow (UI -> store -> renderer runtime)
  Result: `ObjectTypeExplorer` -> `setSchroedingerQuantumMode('tdseDynamics')` -> scene normalization -> renderer instantiates `TDSEComputePass`.

- [completed] Trace TDSE compute evolution flow
  Result: init/potential fill -> per-step V/FFT/T/iFFT/V/absorber -> write-grid -> optional diagnostics reduction/readback.

- [completed] Trace TDSE config lifecycle flow
  Result: defaults in extended types, clamped setters in slice, preset sanitation strips runtime fields, renderer clears `needsReset` via targeted action.

- [completed] Evaluate TDSE feature behavior vs intended design
  Result: found real defects listed below and fixed them.

- [completed] Fix issue set + verify
  Result: code patched + TDSE test suite green.

## Issues Found

1. `fieldView` no-op in TDSE render output path.
- Root cause: `TDSEComputePass` writes `fieldView` uniform, but `tdseWriteGrid.wgsl.ts` always encoded density/log/phase regardless field selection.
- Impact: TDSE field view selector did not change output semantics.

2. TDSE lattice-dimension UI cap conflicted with TDSE dimensional support.
- Root cause: `TDSEControls.tsx` limited lattice dim slider to `min(dimension, 6)` while store/types support up to 11 and mode activation syncs to current dimension.
- Impact: invalid or unusable control state for higher-dimensional TDSE sessions.

3. TDSE controls omitted exposed runtime parameters.
- Root cause: UI omitted controls for `hbar` and `diagnosticsInterval` even though action/type/store support exists.
- Impact: users could not tune supported TDSE parameters through normal controls.

## Issues Fixed

1. Wired `fieldView` into TDSE write-grid output behavior and added potential buffer binding.
- File: `src/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl.ts`
- File: `src/rendering/webgpu/passes/TDSEComputePass.ts`
- Change: write-grid now branches on `fieldView` (density, phase, current magnitude, potential mapping), and pass bind-group layout now binds potential buffer for potential view.

2. Fixed TDSE controls coverage and range alignment.
- File: `src/components/sections/Geometry/SchroedingerControls/TDSEControls.tsx`
- Change:
  - Added `current` and `potential` field view options.
  - Raised lattice-dim slider max to TDSE-supported range (`<= 11` and <= current geometry dimension).
  - Added `hbar` slider.
  - Added diagnostics interval slider gated by diagnostics toggle.
  - Aligned absorber width and steps/frame slider ranges with store clamps.

3. Added regression assertions for write-grid contract changes.
- File: `src/tests/rendering/webgpu/shaders/tdse.test.ts`
- Change: assertions for write-grid potential binding and `fieldView` branch presence.

Verification evidence:
- `npx vitest run src/tests/rendering/webgpu/shaders/tdse.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/lib/physics/tdse/diagnostics.test.ts`
  - Passed: 3 files, 63 tests.
- `npm run lint`
  - Fails due large pre-existing baseline unrelated to this patch set (hundreds of existing violations across many files, including parser config and longstanding rule violations).

## Deferred for Developer

- None for this patrol scope.

---

### Iteration 2 Queue

- [in_progress] Understand purpose of TDSE URL/state hydration behavior
- [pending] Analyze src/lib/url/state-serializer.ts
- [pending] Analyze src/lib/url/index.ts
- [pending] Analyze src/hooks/useUrlState.ts
- [pending] Analyze src/hooks/useObjectTypeInitialization.ts
- [pending] Analyze src/tests/lib/url/state-serializer.test.ts
- [pending] Analyze src/tests/hooks/useUrlState.test.ts
- [pending] Trace URL load flow (deserialize -> stores -> renderer-visible state)
- [pending] Trace URL save flow (stores -> serialize -> query params)
- [pending] Evaluate TDSE persistence/hydration behavior against intended UX

### Iteration 2 Results

- [completed] Understand purpose of TDSE URL/state hydration behavior
  Result: URL share/hydration path is intended to restore scene-relevant state from query params, with `scene` param precedence and param-based fallback.

- [completed] Analyze src/lib/url/state-serializer.ts
  Finding: Serializer/deserializer covered geometry + visual params but did not persist or parse quantum mode, so TDSE mode was dropped on share links.

- [completed] Analyze src/lib/url/index.ts
  Finding: Pure export barrel, no additional behavior.

- [completed] Analyze src/hooks/useUrlState.ts
  Finding: Hook applies parsed URL state to stores, but previously had no quantum mode application path.

- [completed] Analyze src/hooks/useObjectTypeInitialization.ts
  Finding: Dimension-based initialization only; unrelated to URL mode restore.

- [completed] Analyze src/tests/lib/url/state-serializer.test.ts
  Finding: No test coverage for quantum mode URL parameter.

- [completed] Analyze src/tests/hooks/useUrlState.test.ts
  Finding: No test coverage for quantum mode application or compute-mode dimension guard.

- [completed] Trace URL load flow
  Result: `parseCurrentUrl` -> `useUrlState` -> geometry/appearance/post-processing; quantum mode previously absent from this chain.

- [completed] Trace URL save flow
  Result: `ShareButton` -> `generateShareUrl` -> `serializeState`; quantum mode previously absent from serialized payload.

- [completed] Evaluate TDSE persistence/hydration behavior
  Result: confirmed persistence defect and fixed.

#### Additional Issues Found (Iteration 2)

4. TDSE mode not preserved in share URLs.
- Root cause: `ShareableState`/serializer omitted `quantumMode`, and `useUrlState` did not apply it.
- Impact: Shared TDSE scenes reopen as default harmonic mode, losing the TDSE object-type context.

#### Additional Issues Fixed (Iteration 2)

4. Added quantum-mode URL persistence and hydration for Schrodinger modes.
- Files:
  - `src/lib/url/state-serializer.ts`
  - `src/hooks/useUrlState.ts`
  - `src/components/controls/ShareButton.tsx`
- Change:
  - Added `qm` URL param support for non-default quantum modes.
  - Hydration now applies `quantumMode` and enforces dimension >= 3 for compute modes (`freeScalarField`, `tdseDynamics`) before mode application.
  - Share button now includes current `quantumMode` in generated URLs.

5. Added regression tests for quantum-mode URL behavior.
- Files:
  - `src/tests/lib/url/state-serializer.test.ts`
  - `src/tests/hooks/useUrlState.test.ts`
  - `src/tests/components/ShareButton.test.tsx`
- Change:
  - Serializer test for `qm` serialize/deserialize (valid + invalid).
  - Hook test for quantum-mode hydration and min-dimension guard in TDSE mode.
  - Share button test ensuring `qm=tdseDynamics` appears in copied URL.

Verification evidence (Iteration 2):
- `npx vitest run src/tests/lib/url/state-serializer.test.ts src/tests/hooks/useUrlState.test.ts src/tests/components/ShareButton.test.tsx`
  - Passed: 3 files, 28 tests.
- `npx vitest run src/tests/rendering/webgpu/shaders/tdse.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/lib/physics/tdse/diagnostics.test.ts src/tests/lib/url/state-serializer.test.ts src/tests/hooks/useUrlState.test.ts src/tests/components/ShareButton.test.tsx`
  - Passed: 6 files, 91 tests.
- `npx eslint src/lib/url/state-serializer.ts src/hooks/useUrlState.ts src/components/controls/ShareButton.tsx src/tests/lib/url/state-serializer.test.ts src/tests/hooks/useUrlState.test.ts src/tests/components/ShareButton.test.tsx`
  - Passed after adding missing JSDoc on `ShareButton` exports.

---

### Iteration 3 Queue

- [in_progress] Understand purpose of TDSE Playwright runtime coverage
- [pending] Analyze scripts/playwright/image-export.spec.ts
- [pending] Analyze scripts/playwright/schroedinger-tetrahedral-gradient.spec.ts
- [pending] Analyze scripts/playwright/dimension-selector-scroll.spec.ts
- [pending] Analyze scripts/playwright/webgpu-multi-light.spec.ts
- [pending] Analyze scripts/playwright/free-scalar-capture.spec.ts
- [pending] Analyze scripts/playwright/export-ui.spec.ts
- [pending] Analyze scripts/playwright/webglShaderCompileLinkGuard.ts
- [pending] Analyze scripts/playwright/mobile-timeline-controls.spec.ts
- [pending] Analyze scripts/playwright/screenshot-modal-responsive.spec.ts
- [pending] Trace compute-mode Playwright runtime guard flow
- [pending] Trace TDSE runtime coverage gap
- [pending] Evaluate TDSE Playwright coverage against intended behavior

### Iteration 3 Results

- [completed] Understand purpose of TDSE Playwright runtime coverage
  Result: `docs/testing.md` + `docs/plans/tdse-time-dependent-dynamics-plan-2026-02-20.md` require runtime validation for TDSE mode with no WebGPU/render-graph/runtime console errors in realistic user flow.
- [completed] Analyze scripts/playwright/image-export.spec.ts
  Finding: Uses robust pre-navigation console/pageerror collection + `verifyNoErrors` gate; this is the canonical runtime-guard pattern in current Playwright suite.

- [completed] Analyze scripts/playwright/schroedinger-tetrahedral-gradient.spec.ts
  Finding: Provides Schrödinger shader smoke coverage, but scoped to generic `t=schroedinger` render path and does not exercise TDSE mode (`qm=tdseDynamics`).

- [completed] Analyze scripts/playwright/dimension-selector-scroll.spec.ts
  Finding: UI interaction regression checks include WebGL/render-graph guarding; no TDSE-specific state or compute-mode scenario.

- [completed] Analyze scripts/playwright/webgpu-multi-light.spec.ts
  Finding: Strong WebGPU smoke with non-black luma assertion and critical error filtering; pattern is suitable template for TDSE runtime tests.

- [completed] Analyze scripts/playwright/free-scalar-capture.spec.ts
  Finding: This file is diagnostic-style (console dumps/screenshots) and currently lacks deterministic assertions for runtime health, so it does not protect regressions.

- [completed] Analyze scripts/playwright/export-ui.spec.ts
  Finding: Modal/UI behavior tests only; no GPU/runtime-error validation flow.

- [completed] Analyze scripts/playwright/webglShaderCompileLinkGuard.ts
  Finding: Guard helper is reusable and correctly injects compile/link failure escalation when WebGL fallback path is active.

- [completed] Analyze scripts/playwright/mobile-timeline-controls.spec.ts
  Finding: Mobile layout interaction coverage uses standard error collection pattern but does not target TDSE mode.

- [completed] Analyze scripts/playwright/screenshot-modal-responsive.spec.ts
  Finding: Responsive screenshot modal tests include runtime guards but are unrelated to TDSE compute scenario behavior.

- [completed] Trace compute-mode Playwright runtime guard flow
  Result: Runtime guard patterns are implemented via (a) `installWebGLShaderCompileLinkGuard(page)` before navigation, (b) console/pageerror collectors, and (c) explicit `verifyNoErrors`/`verifyNoCriticalErrors` assertions post-interaction.

- [completed] Trace TDSE runtime coverage gap
  Result: `scripts/playwright` has no spec selecting `qm=tdseDynamics`; URL usage is limited to `t=` object type. Existing compute-adjacent `free-scalar-capture.spec.ts` is diagnostic logging without assertive regression gates.

- [completed] Evaluate TDSE Playwright coverage against intended behavior
  Result: Coverage fails TDSE runtime contract in `docs/plans/tdse-time-dependent-dynamics-plan-2026-02-20.md` §9.4 (no TDSE scenario asserting no WebGPU/WGSL/render-graph errors and non-black output).

#### Additional Issues Found (Iteration 3)

6. Missing assertive TDSE runtime Playwright coverage.
- Root cause: No Playwright spec targets `qm=tdseDynamics`; existing `free-scalar-capture.spec.ts` is a debug-dump script lacking regression assertions.
- Impact: TDSE runtime GPU regressions (shader/runtime/render-graph/black-frame failures) can ship undetected despite unit/WGSL tests passing.

#### Additional Issues Fixed (Iteration 3)

6. Replaced non-assertive compute capture script with assertive runtime regression coverage including TDSE scenarios.
- File: `scripts/playwright/free-scalar-capture.spec.ts`
- Change:
  - Replaced diagnostic dump behavior with deterministic assertions.
  - Added runtime guard collection (`pageerror`, console errors/warnings) and critical failure gating.
  - Added WebGPU preference + availability/canvas guards.
  - Added non-black + stability checks via canvas luma sampling (`sharp`).
  - Added TDSE scenario coverage for `tunneling`, `scattering`, and `driven` configurations.

Verification evidence (Iteration 3):
- `npx playwright test scripts/playwright/free-scalar-capture.spec.ts`
  - Executed successfully; 2 tests skipped because WebGPU runtime was unavailable/fallback in current Playwright environment.
- `npx eslint scripts/playwright/free-scalar-capture.spec.ts`
  - File is ignored by repository lint patterns; no lint errors produced for the file itself.

---

### Iteration 4 Queue

- [in_progress] Understand purpose of TDSE preset serialization fidelity
- [pending] Analyze src/stores/utils/presetSerialization.ts
- [pending] Analyze src/stores/presetManagerStore.ts
- [pending] Analyze src/tests/stores/utils/presetSerialization.test.ts
- [pending] Trace TDSE scene save/load flow through preset serialization
- [pending] Evaluate TDSE preset fidelity and test coverage against intended behavior

### Iteration 4 Results

- [completed] Understand purpose of TDSE preset serialization fidelity
  Result: Scene/style presets must persist reproducible TDSE configuration while stripping transient runtime flags (e.g., `needsReset`) so loads are deterministic and not polluted by ephemeral compute state.
- [completed] Analyze src/stores/utils/presetSerialization.ts
  Finding: Extended config serialization recursively strips transient keys (including `needsReset`) from nested objects; TDSE config should be persisted except runtime triggers.

- [completed] Analyze src/stores/presetManagerStore.ts
  Finding: Scene save/load path uses `serializeExtendedState` + `sanitizeExtendedLoadedState`; post-load invariant enforces dimension >= 3 for `tdseDynamics` and `freeScalarField`.

- [completed] Analyze src/tests/stores/utils/presetSerialization.test.ts
  Finding: Current tests cover sqLayer stripping only; no TDSE-specific assertions for `quantumMode: tdseDynamics` or nested `tdse.needsReset` stripping.

- [completed] Trace TDSE scene save/load flow through preset serialization
  Result: `saveScene` -> `serializeExtendedState(..., 'schroedinger')` strips transient nested fields; `loadScene` -> `sanitizeExtendedLoadedState` strips transient imports and applies schroedinger config with dimension invariant guard.

- [completed] Evaluate TDSE preset fidelity and test coverage against intended behavior
  Result: Runtime behavior path exists, but regression suite misses TDSE assertions for transient stripping and mode persistence in serialization utility tests.

#### Additional Issues Found (Iteration 4)

7. Missing TDSE-specific serialization regression tests on preset utility path.
- Root cause: `src/tests/stores/utils/presetSerialization.test.ts` only verifies sqLayer transient stripping for harmonic config; it does not assert TDSE nested `needsReset` removal or `quantumMode` preservation.
- Impact: Regressions in TDSE preset fidelity can slip through CI undetected even though TDSE is a first-class object-type mode.

#### Additional Issues Fixed (Iteration 4)

7. Added TDSE-focused preset serialization regression assertions.
- File: `src/tests/stores/utils/presetSerialization.test.ts`
- Change:
  - Added `sanitizeExtendedLoadedState` test verifying `quantumMode: 'tdseDynamics'` persists while nested `tdse.needsReset` is stripped.
  - Added `serializeExtendedState` test verifying TDSE nested config fields persist while `tdse.needsReset` is excluded.

Verification evidence (Iteration 4):
- `npx vitest run src/tests/stores/utils/presetSerialization.test.ts`
  - Passed: 1 file, 6 tests.
