## Active Target
- Feature: math type definitions (`src/lib/math/types.ts`).
- Completed targets this run: freeScalar k-space physics, animation bias, TDSE diagnostics, color, education, audio, WASM, trig/rng/fft/transform/hydrogen/second-quantization/vector math modules.

## Task Queue Details
- [in_progress] Understand purpose of math type definitions in `src/lib/math/types.ts`.
- [pending] Analyze `src/lib/math/types.ts`.
- [pending] Trace type-definition usage across math/geometry modules.
- [pending] Evaluate type-definition consistency against runtime assumptions.

## Issues Found
- [P1] freeScalar hidden-dimension k-space aggregation used unweighted omega averaging.
- [P2] TDSE diagnostics history ignored capacity=0 semantics.
- [P2] invalid hex parsing produced NaN HSV values.
- [P2] education metadata missing for supported 7D-11D.
- [P2] audio init could throw/fail permanently on missing/flaky AudioContext.
- [P2] WASM flattenVertices accepted ragged/non-finite input silently.
- [P2] hydrogen radial norm accepted invalid/non-physical input without sanitization.
- [P2] FFT utilities accepted non-integer sizes and undersized buffers without validation.
- [P2] transform scale matrix accepted non-finite scale factors.
- [P2] second-quantization metrics accepted invalid Fock n (negative/fractional).

## Issues Fixed
- `src/lib/physics/freeScalar/kSpaceDisplayTransforms.ts`: occupancy-weighted hidden-mode aggregation and exact `nkOmega` sum.
- `src/lib/physics/tdse/diagnostics.ts`: capacity<=0 no-store semantics.
- `src/lib/colors/colorUtils.ts`: robust invalid-hex handling.
- `src/lib/education/content.ts`: support for all 3D-11D educational metadata.
- `src/lib/audio/SoundManager.ts`: resilient lazy audio initialization and retry.
- `src/lib/wasm/animation-wasm.ts`: strict flattenVertices input validation.
- `src/lib/math/hydrogenRadialProbability.ts`: sanitized quantum/radius inputs.
- `src/lib/math/fft.ts`: strict size/dimension/buffer validation.
- `src/lib/math/transform.ts`: finite-scale validation.
- `src/lib/math/secondQuantization.ts`: normalized Fock quantum number handling.
- No additional defects found in: `src/lib/animation`, `src/lib/math/trig.ts`, `src/lib/math/rng.ts`, `src/lib/math/vector.ts`.

## Deferred for Developer
- None.

## Iteration Update: Matrix Type Contract (2026-02-21)

### Root-Cause Summary
- `MatrixND` is an unshaped `Float32Array`, but several APIs assume square shape (`n×n`).
- For non-square lengths (e.g., 6), `Math.sqrt(length)` is fractional and loops/index math can become nonsensical.
- `transposeMatrix` and `getMatrixDimensions` did not enforce square length; `multiplyMatricesInto` generic path also lacked explicit square assertion.

### Fix Implemented
- Added shared helper `squareDimensionFromLength(length)` in `src/lib/math/matrix.ts`.
- Applied square validation to:
  - `multiplyMatrices`
  - `multiplyMatricesInto`
  - `multiplyMatrixVector`
  - `transposeMatrix`
  - `determinant`
  - `getMatrixDimensions`
- Added regression tests in `src/tests/lib/math/matrix.test.ts` for non-square rejection in:
  - `multiplyMatricesInto`
  - `transposeMatrix`
  - `getMatrixDimensions`

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/lib/math/matrix.test.ts`
  - Result: 3 new tests failed before implementation.
- Post-fix checks:
  - `npx vitest run src/tests/lib/math/matrix.test.ts`
  - `npx vitest run src/tests/lib/math/rotation.test.ts src/tests/lib/math/transform.test.ts src/tests/lib/math/vector.test.ts src/tests/lib/math/matrix.test.ts`
  - `npx eslint src/lib/math/matrix.ts src/tests/lib/math/matrix.test.ts`
  - Result: all pass.

## Iteration Update: Rotation Input Contracts (2026-02-21)

### Root-Cause Summary
- Rotation helpers accepted invalid numeric contracts in several public APIs:
  - non-integer dimensions (`getRotationPlaneCount`, `getRotationPlanes`)
  - non-integer axis indices (`createRotationMatrix`)
  - non-finite angles (`createRotationMatrix`, `composeRotations`)
- With fractional indices/angles, matrix writes could target non-integer keys or propagate `NaN`, producing invalid transforms.

### Fix Implemented
- `src/lib/math/rotation.ts`
  - Added `assertRotationDimension(dimension)` (`integer >= 2`).
  - Added `assertFiniteAngle(angleRadians)`.
  - Strengthened `getAxisName` input validation to require non-negative integer.
  - `createRotationMatrix` now validates integer plane indices and finite angle.
  - `composeRotations` now validates dimension and enforces finite angles:
    - DEV: throws explicit error
    - Production: skips non-finite angle entries defensively
- `src/tests/lib/math/rotation.test.ts`
  - Added regressions for non-integer dimensions, non-integer plane indices, and non-finite angles.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/lib/math/rotation.test.ts`
  - Result: 5 new tests failed before implementation.
- Post-fix checks:
  - `npx vitest run src/tests/lib/math/rotation.test.ts`
  - `npx vitest run src/tests/lib/math/rotation.test.ts src/tests/lib/math/matrix.test.ts src/tests/lib/math/transform.test.ts src/tests/lib/math/vector.test.ts`
  - `npx eslint src/lib/math/rotation.ts src/tests/lib/math/rotation.test.ts src/lib/math/matrix.ts src/tests/lib/math/matrix.test.ts`
  - Result: all pass.

## Iteration Update: Math Barrel Export Audit (2026-02-21)

### Scope
- `src/lib/math/index.ts` export surface
- Importers across app/tests using `@/lib/math`

### Findings
- No runtime defect found.
- Export surface used by app (`getRotationPlanes`, `createScaleMatrix`) is consistent.
- Tests import through barrel and remain green after previous contract hardening.

### Verification Evidence
- `rg -n "from '@/lib/math'|from \"@/lib/math\"" src/lib src/components src/stores src/hooks src/tests`
- `npx vitest run src/tests/lib/math/rotation.test.ts src/tests/lib/math/matrix.test.ts src/tests/lib/math/transform.test.ts src/tests/lib/math/vector.test.ts`

## Iteration Update: Free-Scalar k-Space Occupancy Active-Dim Contract (2026-02-21)

### Root-Cause Summary
- `computeRawKSpaceData` computed `totalSites` from full `gridSize` instead of active dimensions (`gridSize.slice(0, latticeDim)`).
- For mixed grids where `latticeDim < gridSize.length`, this inflated array sizes and produced inconsistent metadata/FFT inputs.
- The function also lacked explicit contract checks for `latticeDim`, spacing sufficiency/validity, and phi/pi minimum buffer lengths.

### Fix Implemented
- `src/lib/physics/freeScalar/kSpaceOccupation.ts`
  - Compute `activeDims` first, then derive `totalSites` from active dimensions only.
  - Added validation:
    - `latticeDim` integer in valid range
    - `gridSize` active entries are positive integers
    - `spacing` has enough entries and each active spacing is finite and > 0
    - `mass` finite
    - `phi`/`pi` lengths are at least `totalSites`
- `src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts`
  - Added regression proving active-dimension site count is used when `latticeDim < gridSize.length`.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts`
  - Result: new regression failed before implementation (`totalSites` was 32 instead of 16).
- Post-fix checks:
  - `npx vitest run src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts`
  - `npx vitest run src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts`
  - `npx eslint src/lib/physics/freeScalar/kSpaceOccupation.ts src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts`
  - Result: all pass.

## Iteration Update: Radial Spectrum Bin-Count Sanitization (2026-02-21)

### Root-Cause Summary
- `computeRadialShells` derived `bins` via `Math.round(binCount)` without guarding `NaN`.
- With `binCount = NaN`, `bins` became `NaN`, shell arrays were created with length 0, and returned metadata had `binCount: NaN`.
- This produced invalid downstream radial mapping behavior instead of deterministic clamped bins.

### Fix Implemented
- `src/lib/physics/freeScalar/kSpaceRadialSpectrum.ts`
  - Sanitized bin count: non-finite values now fallback to `1`; finite values are rounded and clamped to `[1, 128]`.
- `src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts`
  - Added regression ensuring NaN bin count is handled and resolved to `binCount = 1`.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts`
  - Result: new regression failed before implementation (`binCount` returned `NaN`).
- Post-fix checks:
  - `npx vitest run src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts`
  - `npx vitest run src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts`
  - `npx eslint src/lib/physics/freeScalar/kSpaceRadialSpectrum.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts src/lib/physics/freeScalar/kSpaceOccupation.ts src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts`
  - Result: all pass.

## Iteration Update: Exposure Transfer NaN-Safety (2026-02-21)

### Root-Cause Summary
- `applyExposureTransfer` used raw `lowPercentile`, `highPercentile`, and `gamma` without finite checks.
- Non-finite config values (e.g., from malformed URL/state) propagated `NaN` through quantile indices and mapping math, contaminating `grid.nk`.

### Fix Implemented
- `src/lib/physics/freeScalar/kSpaceDisplayTransforms.ts`
  - Sanitized percentiles to finite values with clamping to `[0, 100]`.
  - Enforced percentile ordering (`pLow <= pHigh`).
  - Sanitized gamma to positive finite value; fallback to `1.0`.
- `src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts`
  - Added regression ensuring non-finite percentile/gamma inputs still produce finite `[0,1]` mapped outputs.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts`
  - Result: new regression failed before implementation (non-finite mapped values observed).
- Post-fix checks:
  - `npx vitest run src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts`
  - `npx vitest run src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts`
  - `npx eslint src/lib/physics/freeScalar/kSpaceDisplayTransforms.ts src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts src/lib/physics/freeScalar/kSpaceRadialSpectrum.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts src/lib/physics/freeScalar/kSpaceOccupation.ts src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts`
  - Result: all pass.

## Iteration Update: Vacuum Spectrum Input Contracts (2026-02-21)

### Root-Cause Summary
- `sampleVacuumSpectrum` accepted malformed active-dimension configuration without deterministic early failure.
- `isPowerOf2` did not enforce integer input explicitly, so non-integer grid sizes were not rejected by the exact-vacuum precheck.
- Missing active-dimension spacing entries could propagate undefined divisors into dispersion and Gaussian amplitudes, yielding invalid sampled fields instead of a clear configuration error.

### Fix Implemented
- `src/lib/physics/freeScalar/vacuumSpectrum.ts`
  - Hardened `isPowerOf2` to require integer values.
  - Added `validateVacuumConfig(gridSize, spacing, latticeDim, mass)` and applied it to:
    - `sampleVacuumSpectrum`
    - `estimateVacuumMaxPhi`
  - Validation now enforces:
    - `latticeDim` is positive integer
    - `gridSize` and `spacing` contain at least `latticeDim` entries
    - active `gridSize` entries are power-of-2 integers
    - active `spacing` entries are finite positive values
    - `mass` is finite
- `src/tests/lib/physics/freeScalar/vacuumSpectrum.test.ts`
  - Added regressions for:
    - non-integer grid size rejection
    - insufficient active spacing rejection

### Verification Evidence
- Failing-first confirmations:
  - `npx vitest run src/tests/lib/physics/freeScalar/vacuumSpectrum.test.ts`
  - New regressions failed before implementation (late/missing validation paths).
- Post-fix checks:
  - `npx vitest run src/tests/lib/physics/freeScalar/vacuumSpectrum.test.ts`
  - `npx vitest run src/tests/lib/physics/freeScalar/vacuumSpectrum.test.ts src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts`
  - `npx eslint src/lib/physics/freeScalar/vacuumSpectrum.ts src/tests/lib/physics/freeScalar/vacuumSpectrum.test.ts src/lib/physics/freeScalar/kSpaceOccupation.ts src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts src/lib/physics/freeScalar/kSpaceRadialSpectrum.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts src/lib/physics/freeScalar/kSpaceDisplayTransforms.ts src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts`
  - Result: all pass.

## Iteration Update: Export Render-Dimension NaN Guard (2026-02-21)

### Root-Cause Summary
- `computeRenderDimensions` accepted `originalAspect <= 0` when crop mode was enabled.
- This caused invalid math (`height / originalAspect`), producing non-finite intermediate values and ultimately invalid output dimensions (`{ width: 2, height: NaN }`).
- Resulting dimensions can break export pipeline assumptions and downstream encoder setup.

### Fix Implemented
- `src/lib/export/videoExportPlanning.ts`
  - `computeRenderDimensions` now treats non-positive/invalid `originalAspect` as a fallback case and returns export dimensions via `ensureEvenDimensions`.
  - `ensureEvenDimensions` now sanitizes non-finite width/height inputs before even-rounding.
- `src/tests/lib/export/videoExportPlanning.test.ts`
  - Added regression test for crop mode with `originalAspect = 0` to ensure deterministic fallback.
- JSDoc compliance updates for export interfaces:
  - `src/lib/export/image.ts` (`ExportOptions`)
  - `src/lib/export/video.ts` (`VideoExportOptions`)
  - `src/lib/export/videoExportPlanning.ts` (exported planning interfaces)

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: new regression failed before implementation (`{ width: 2, height: NaN }`).
- Post-fix checks:
  - `npx vitest run src/tests/lib/export/image.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - `npx eslint src/lib/export/image.ts src/lib/export/video.ts src/lib/export/videoExportPlanning.ts src/tests/lib/export/image.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass.

## Iteration Update: Camera Store State Validation (2026-02-21)

### Root-Cause Summary
- `useCameraStore.applyState` and pending-state flush path accepted unchecked tuples.
- Malformed data (wrong tuple length, `NaN`/`Infinity`) could be forwarded to `camera.setPosition/setTarget`, producing invalid camera state during scene load/preset restore.

### Fix Implemented
- `src/stores/cameraStore.ts`
  - Added `isFiniteVec3` and `normalizeCameraState` validation helpers.
  - Hardened `applyState` to reject invalid camera states (no setter calls, clears pending invalid state).
  - Hardened `registerCamera` pending-state flush to drop invalid pending data safely.
  - Hardened `captureState` to return `null` when camera reports invalid coordinates.
  - Added JSDoc for exported `CameraState` interface to satisfy lint rules.
- `src/tests/stores/cameraStore.test.ts`
  - Added regressions for invalid pending state flush and malformed `applyState` input.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/cameraStore.test.ts`
  - Result: new regressions failed before implementation (malformed coordinates were applied).
- Post-fix checks:
  - `npx vitest run src/tests/stores/cameraStore.test.ts src/tests/components/layout/CanvasContextMenu.test.tsx`
  - `npx eslint src/stores/cameraStore.ts src/tests/stores/cameraStore.test.ts`
  - Result: all pass.

## Iteration Update: Performance Store Non-Finite Setter Guards (2026-02-21)

### Root-Cause Summary
- `setRenderResolutionScale` and `setMaxFps` accepted non-finite values (`NaN`/`Infinity`).
- Clamp logic (`Math.max/Math.min`) with non-finite input produced `NaN` state and persisted invalid localStorage values.
- This could poison runtime render throttling/scale behavior after malformed inputs.

### Fix Implemented
- `src/stores/performanceStore.ts`
  - Added finite-input guards to:
    - `setRenderResolutionScale`
    - `setMaxFps`
  - On invalid input, setters now no-op (and emit DEV warning) instead of mutating/persisting invalid state.
  - Added JSDoc for exported `SampleQualityLevel` type (lint compliance).
- `src/tests/stores/performanceStore.test.ts`
  - Added regressions ensuring non-finite setter inputs are ignored and persisted values remain unchanged.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/performanceStore.test.ts`
  - Result: new regressions failed before implementation (`maxFps`/`renderResolutionScale` became `NaN`).
- Post-fix checks:
  - `npx vitest run src/tests/stores/performanceStore.test.ts src/tests/hooks/useDeviceCapabilities.test.ts`
  - `npx eslint src/stores/performanceStore.ts src/tests/stores/performanceStore.test.ts`
  - Result: all pass.

## Iteration Update: Export Store Canvas-Aspect Validation (2026-02-21)

### Root-Cause Summary
- `setCanvasAspectRatio` accepted non-finite/invalid values.
- `applyPreset` crop math depends on `canvasAspectRatio`; invalid ratio propagated into crop calculations, yielding non-finite crop coordinates.
- This can break export crop editor and downstream render/export planning.

### Fix Implemented
- `src/stores/exportStore.ts`
  - Hardened `setCanvasAspectRatio` to reject non-finite or non-positive inputs.
  - Added DEV warning on rejected values.
  - Added concise JSDoc for exported types/interfaces to satisfy lint in this target.
- `src/tests/stores/exportStore.test.ts`
  - Added regression ensuring non-finite aspect ratio updates are ignored and preset crop remains finite/bounded.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/exportStore.test.ts`
  - Result: new regression failed before implementation (non-finite crop coordinates).
- Post-fix checks:
  - `npx vitest run src/tests/stores/exportStore.test.ts src/tests/components/overlays/ExportModal.test.tsx`
  - `npx vitest run src/tests/stores/exportStore.test.ts src/tests/lib/export/image.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts src/tests/components/overlays/ExportModal.test.tsx`
  - `npx eslint src/stores/exportStore.ts src/tests/stores/exportStore.test.ts`
  - Result: all pass.

## Iteration Update: Geometry Store Non-Finite Dimension Guard (2026-02-21)

### Root-Cause Summary
- `geometryStore` used `Math.floor`-based clamping without finite checks.
- `setDimension(NaN)` propagated invalid dimension to dependent stores (`animation`, `rotation`, `transform`), causing downstream runtime errors.

### Fix Implemented
- `src/stores/geometryStore.ts`
  - `clampDimension` now handles non-finite input via explicit fallback.
  - `setDimension` now rejects non-finite input (no-op with DEV warning).
  - `loadGeometry` now falls back to `DEFAULT_DIMENSION` for non-finite loaded scene dimensions.
  - Added JSDoc for exported `GeometryState` (lint compliance).
- `src/tests/stores/geometryStore.test.ts`
  - Added regression ensuring non-finite `setDimension` updates are ignored and do not alter dependent store dimension.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/geometryStore.test.ts`
  - Result: new regression failed before implementation due downstream rotation/animation dimension failure.
- Post-fix checks:
  - `npx vitest run src/tests/stores/geometryStore.test.ts src/tests/hooks/useUrlState.test.ts src/tests/hooks/useKeyboardShortcuts.test.ts src/tests/components/sections/Geometry/DimensionSelector.test.tsx`
  - `npx eslint src/stores/geometryStore.ts src/tests/stores/geometryStore.test.ts`
  - Result: all pass.

## Iteration Update: Transform Store Input Contract Hardening (2026-02-21)

### Root-Cause Summary
- `setUniformScale` and `setAxisScale` accepted non-finite scale inputs (`NaN`/`±Infinity`).
- `clampScale` uses `Math.max/Math.min`; with `NaN`, the clamped value stayed `NaN` and was written into store state.
- `setAxisScale` axis validation only checked numeric range (`axis < 0 || axis >= dimension`), so `NaN` and fractional indices bypassed validation and could mutate array shape (`perAxisScale['1.2'] = ...`) or trigger unintended locked-scale updates.
- `setDimension` did not validate integer/finiteness. Non-integer/non-finite values reached `createDefaultScales(dimension)` and could throw `RangeError: Invalid array length`.

### Fix Implemented
- `src/stores/transformStore.ts`
  - Added `isValidScaleInput(value)` finite-input guard.
  - Added `isValidAxisIndex(axis, dimension)` integer + range guard.
  - Hardened `setUniformScale` to reject non-finite inputs (DEV warning + no-op).
  - Hardened `setAxisScale` to reject non-finite scale input and invalid axis index shape.
  - Hardened `setDimension` to reject non-finite/non-integer dimensions before range checks.
- `src/tests/stores/transformStore.test.ts`
  - Added fail-first regressions for:
    - non-finite scale inputs are ignored,
    - invalid axis indexes (`NaN`, fractional) are ignored,
    - non-integer/non-finite dimensions are ignored without throws/state corruption.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/transformStore.test.ts`
  - Result: 3 new regressions failed before implementation:
    - non-finite scale propagated `NaN`,
    - fractional axis mutated array shape,
    - non-integer dimension threw `RangeError`.
- Post-fix checks:
  - `npx vitest run src/tests/stores/transformStore.test.ts`
  - `npx vitest run src/tests/stores/transformStore.test.ts src/tests/stores/geometryStore.test.ts src/tests/hooks/useKeyboardShortcuts.test.ts`
  - `npx eslint src/stores/transformStore.ts src/tests/stores/transformStore.test.ts`
  - Result: all pass.

## Iteration Update: Rotation Store Input Contract Hardening (2026-02-21)

### Root-Cause Summary
- `setRotation` and `updateRotations` accepted non-finite angles (`NaN`/`±Infinity`) and wrote them into `rotations` state.
- Downstream rotation composition code expects finite angles; non-finite values can produce invalid rotation matrices or DEV-time exceptions in strict validation paths.
- `setDimension` did not validate integer/finiteness, so malformed input (e.g., `NaN`, fractional) could poison `dimension` state.

### Fix Implemented
- `src/stores/rotationStore.ts`
  - Added `isValidRotationAngle(angle)` helper.
  - Hardened `setRotation` to reject non-finite angles (DEV warning + no-op).
  - Hardened `updateRotations` to filter out non-finite angle entries while still applying valid finite updates.
  - Hardened `setDimension` to reject non-finite/non-integer dimensions before range checks.
  - Added top-level JSDoc for exported `RotationState` (lint compliance).
- `src/tests/stores/rotationStore.test.ts`
  - Added fail-first regressions for:
    - non-finite `setRotation` inputs,
    - mixed finite/non-finite `updateRotations` payloads,
    - non-integer/non-finite `setDimension` inputs.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/rotationStore.test.ts`
  - Result: 3 new regressions failed before implementation:
    - non-finite angles were stored,
    - non-finite batch entries were stored,
    - invalid dimension input corrupted dimension state.
- Post-fix checks:
  - `npx vitest run src/tests/stores/rotationStore.test.ts`
  - `npx vitest run src/tests/stores/rotationStore.test.ts src/tests/stores/geometryStore.test.ts src/tests/components/sections/Geometry/DimensionSelector.test.tsx src/tests/hooks/useKeyboardShortcuts.test.ts`
  - `npx eslint src/stores/rotationStore.ts src/tests/stores/rotationStore.test.ts`
  - Result: all pass.

## Iteration Update: Scene Load Store-Invariant Hydration (2026-02-21)

### Root-Cause Summary
- `loadScene` restored transform/rotation using direct `setState(...)` with sanitized-but-unvalidated payloads.
- Direct transform hydration could overwrite `transform.dimension` from imported scene data, diverging from geometry dimension established moments earlier.
- This produced cross-store invariant drift (e.g., `geometry.dimension = 4`, `transform.dimension = 11`) and could destabilize downstream matrix/scaling logic.
- Direct rotation hydration could also carry malformed rotation payloads (non-number entries, mismatched dimension metadata), bypassing store action guards.

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Replaced direct transform `setState(...)` hydration with action-based restore:
    - `resetAll()`
    - optional `setScaleLocked(...)`
    - optional `setUniformScale(...)`
    - optional per-axis replay via `setAxisScale(...)` when unlocked
  - This preserves geometry-driven dimension invariants by ignoring imported `transform.dimension` metadata.
  - Replaced direct rotation `setState(...)` hydration with action-based restore:
    - `resetAllRotations()`
    - `updateRotations(...)` from parsed finite numeric entries only
  - Added JSDoc blocks for exported preset interfaces to satisfy lint policy.
- `src/tests/stores/presetManagerStore.test.ts`
  - Added fail-first regression ensuring imported scene data with mismatched transform/rotation dimensions does NOT desynchronize stores.
  - Regression also verifies malformed rotation value entries are filtered while valid entries are restored.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/presetManagerStore.test.ts -t "keeps transform dimension aligned with loaded geometry when importing scenes"`
  - Result: failed before implementation (`transform.dimension` became `11` instead of loaded geometry `4`).
- Post-fix checks:
  - `npx vitest run src/tests/stores/presetManagerStore.test.ts`
  - `npx vitest run src/tests/stores/presetManagerStore.test.ts src/tests/stores/transformStore.test.ts src/tests/stores/rotationStore.test.ts src/tests/stores/geometryStore.test.ts`
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts src/stores/transformStore.ts src/tests/stores/transformStore.test.ts src/stores/rotationStore.ts src/tests/stores/rotationStore.test.ts`
  - Result: all pass.

### Follow-up Hardening: Animation Plane Filtering on Scene Load
- Confirmed additional hydration gap: `loadScene` restored animation state via direct `setState`, allowing imported `animatingPlanes` to include planes invalid for the loaded dimension.
- Implemented post-hydration invariant enforcement in `src/stores/presetManagerStore.ts`:
  - After animation restore, call `useAnimationStore.getState().setDimension(useGeometryStore.getState().dimension)`.
  - This reuses existing animation-store filtering logic to remove invalid planes and maintain dimensional consistency.
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `filters imported animation planes to the loaded geometry dimension`
  - Failing-first observed (`XW` persisted in 3D), then passed after fix.
- Re-verified with:
  - `npx vitest run src/tests/stores/presetManagerStore.test.ts src/tests/stores/transformStore.test.ts src/tests/stores/rotationStore.test.ts src/tests/stores/geometryStore.test.ts src/tests/stores/animationStore.test.ts`
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts src/stores/transformStore.ts src/tests/stores/transformStore.test.ts src/stores/rotationStore.ts src/tests/stores/rotationStore.test.ts`
  - Result: all pass.

## Iteration Update: Animation Store Numeric Contract Hardening (2026-02-21)

### Root-Cause Summary
- `setSpeed` used raw clamp math (`Math.max/Math.min`) without finite checks, allowing non-finite inputs to mutate speed unexpectedly.
- `setDimension` forwarded malformed dimensions to `getRotationPlanes`, which throws for non-integer/non-finite values.
- `updateAccumulatedTime` accepted non-finite deltas, allowing `accumulatedTime` to become `NaN`.

### Fix Implemented
- `src/stores/animationStore.ts`
  - Added `isValidSpeedInput(speed)` finite guard.
  - Added `isValidDimensionInput(dimension)` (`finite + integer + >=2`) guard.
  - Hardened `setSpeed`, `setDimension`, and `updateAccumulatedTime` to reject invalid inputs with DEV warnings and no-op behavior.
  - Added top-level JSDoc for exported `AnimationState` interface.
- `src/tests/stores/animationStore.test.ts`
  - Added fail-first regressions for:
    - non-finite speed inputs ignored,
    - non-integer/non-finite dimensions ignored without throw,
    - non-finite accumulated-time deltas ignored.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/animationStore.test.ts`
  - Result: 3 new regressions failed before implementation.
- Post-fix checks:
  - `npx vitest run src/tests/stores/animationStore.test.ts`
  - `npx vitest run src/tests/stores/animationStore.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/geometryStore.test.ts src/tests/hooks/useKeyboardShortcuts.test.ts`
  - `npx eslint src/stores/animationStore.ts src/tests/stores/animationStore.test.ts src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts src/stores/transformStore.ts src/tests/stores/transformStore.test.ts src/stores/rotationStore.ts src/tests/stores/rotationStore.test.ts`
  - Result: all pass.

## Iteration Update: Refinement Progress Non-Finite Guard (2026-02-21)

### Root-Cause Summary
- `setRefinementProgress` in `performanceStore` clamped with `Math.max/Math.min` but did not guard non-finite values.
- Non-finite inputs (`NaN`, `±Infinity`) could force invalid or unintended refinement progress state, impacting progressive-refinement UI/logic.

### Fix Implemented
- `src/stores/performanceStore.ts`
  - Added finite-input guard to `setRefinementProgress`.
  - Invalid values now no-op with DEV warning; valid values continue clamped to `[0, 100]`.
- `src/tests/stores/performanceStore.test.ts`
  - Added fail-first regression: non-finite refinement progress updates are ignored.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/performanceStore.test.ts`
  - Result: new regression failed before implementation.
- Post-fix checks:
  - `npx vitest run src/tests/stores/performanceStore.test.ts`
  - `npx vitest run src/tests/stores/performanceStore.test.ts src/tests/hooks/useDeviceCapabilities.test.ts src/tests/components/canvas/RefinementIndicator.test.tsx src/tests/components/sections/Performance/EigenfunctionCacheControls.test.tsx`
  - `npx eslint src/stores/performanceStore.ts src/tests/stores/performanceStore.test.ts`
  - Result: all pass.

## Iteration Update: Layout Sidebar Width NaN Guard (2026-02-21)

### Root-Cause Summary
- `clampSidebarWidth` and `getMaxSidebarWidth` accepted non-finite inputs; `Math.min/Math.max` with `NaN` produced `NaN` width.
- `setSidebarWidth` applied clamped value without validating inputs, allowing invalid width state mutations from malformed width/viewport values.

### Fix Implemented
- `src/stores/layoutStore.ts`
  - `getMaxSidebarWidth` now normalizes non-finite viewport input to a safe fallback breakpoint.
  - `clampSidebarWidth` now returns a finite fallback width when width/viewport are non-finite.
  - `setSidebarWidth` now rejects non-finite input pairs (DEV warning + no-op).
  - Added JSDoc for exported layout types/interfaces to satisfy lint policy.
- Added `src/tests/stores/layoutStore.test.ts` with fail-first regressions:
  - helper returns finite values for non-finite inputs,
  - store action ignores non-finite inputs,
  - valid width update behavior remains unchanged.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/layoutStore.test.ts`
  - Result: 2 new regressions failed before implementation (`NaN` clamp result and unexpected width mutation).
- Post-fix checks:
  - `npx vitest run src/tests/stores/layoutStore.test.ts`
  - `npx vitest run src/tests/stores/layoutStore.test.ts src/tests/components/ui/ControlPanel.test.tsx src/tests/components/layout/TopBarControls.test.tsx`
  - `npx eslint src/stores/layoutStore.ts src/tests/stores/layoutStore.test.ts`
  - Result: all pass.

## Iteration Update: UI Animation-Bias Non-Finite Guard (2026-02-21)

### Root-Cause Summary
- `setAnimationBias` in `uiSlice` used clamp math without finite checks.
- Non-finite inputs (`NaN`, `±Infinity`) could mutate `animationBias` to invalid/unintended values, affecting timeline interpolation behavior.

### Fix Implemented
- `src/stores/slices/uiSlice.ts`
  - Added finite-input guard in `setAnimationBias` with DEV warning + no-op for invalid values.
  - Added JSDoc for exported UI slice types/interfaces to satisfy lint policy.
- `src/tests/stores/uiStore.test.ts`
  - Added fail-first regression asserting non-finite animation-bias updates are ignored.
  - Added explicit clamp behavior test for `[0, 1]` bounds.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/uiStore.test.ts`
  - Result: new non-finite regression failed before implementation.
- Post-fix checks:
  - `npx vitest run src/tests/stores/uiStore.test.ts`
  - `npx vitest run src/tests/stores/uiStore.test.ts src/tests/components/layout/editor/TimelineControls.test.tsx src/tests/stores/presetManagerStore.test.ts`
  - `npx eslint src/stores/slices/uiSlice.ts src/tests/stores/uiStore.test.ts`
  - Result: all pass.

## Iteration Update: Skybox Numeric Setter Non-Finite Guards (2026-02-21)

### Root-Cause Summary
- `skyboxSlice` numeric setters (`setSkyboxIntensity`, `setSkyboxRotation`, `setSkyboxAnimationSpeed`) lacked finite-input checks.
- Non-finite values could produce invalid state (`NaN` rotation) or unintended clamped maxima (`Infinity -> 10/5`), bypassing intended control semantics.

### Fix Implemented
- `src/stores/slices/skyboxSlice.ts`
  - Added shared finite-input helper and guards for numeric skybox setters.
  - Invalid numeric inputs now no-op with DEV warnings.
  - Added JSDoc for exported skybox slice types/interfaces to satisfy lint policy.
- `src/tests/stores/environmentStore.test.ts`
  - Added fail-first regression asserting non-finite skybox numeric updates are ignored while valid state remains unchanged.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/environmentStore.test.ts`
  - Result: new regression failed before implementation.
- Post-fix checks:
  - `npx vitest run src/tests/stores/environmentStore.test.ts`
  - `npx vitest run src/tests/stores/environmentStore.test.ts src/tests/stores/presetManagerStore.test.ts`
  - `npx eslint src/stores/slices/skyboxSlice.ts src/tests/stores/environmentStore.test.ts`
  - Result: all pass.

## Iteration Update: Lighting Slice Non-Finite Setter Guards (2026-02-21)

### Root-Cause Summary
- Core numeric lighting setters in `lightingSlice` (`setLightHorizontalAngle`, `setLightVerticalAngle`, `setAmbientIntensity`, `setLightStrength`, `setExposure`) lacked finite-input guards.
- Non-finite values could produce invalid state (e.g., `NaN` angle via modulo) or unintended extreme clamps (e.g., `Infinity` -> max), degrading lighting uniform stability.

### Fix Implemented
- `src/stores/slices/lightingSlice.ts`
  - Added shared finite-number guard for core numeric setters.
  - Invalid values now no-op with DEV warnings.
  - Added JSDoc for exported lighting slice action/type exports (lint compliance).
- `src/tests/stores/lightingStore.test.ts`
  - Added fail-first regression ensuring non-finite updates for core numeric controls are ignored.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/lightingStore.test.ts`
  - Result: new regression failed before implementation (`lightHorizontalAngle` became `NaN`).
- Post-fix checks:
  - `npx vitest run src/tests/stores/lightingStore.test.ts`
  - `npx vitest run src/tests/stores/lightingStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/presetManagerStore.test.ts`
  - `npx eslint src/stores/slices/lightingSlice.ts src/tests/stores/lightingStore.test.ts`
  - Result: all pass.

## Iteration Update: Post-Processing Slice Numeric Contract Hardening (2026-02-21)

### Root-Cause Summary
- `postProcessingSlice` numeric setters relied on `Math.max/Math.min` clamping without finite-input guards.
- Non-finite inputs (`NaN`, `±Infinity`) propagated invalid state in bloom/cinematic/paper controls or coerced to unintended clamp edges.
- Initial fail-first regressions confirmed:
  - bloom setters accepted non-finite values (`NaN` persisted),
  - frame blending factor accepted non-finite values (`Infinity` coerced to 1, `-Infinity` to 0),
  - cinematic and paper numeric setters accepted non-finite values.

### Fix Implemented
- `src/stores/slices/postProcessingSlice.ts`
  - Added `isFinitePostProcessingInput(value)` helper.
  - Hardened all numeric post-processing setters to reject non-finite inputs with DEV warning + no-op:
    - Bloom: `setBloomGain`, `setBloomThreshold`, `setBloomKnee`, `setBloomRadius`
    - Cinematic: `setCinematicAberration`, `setCinematicVignette`, `setCinematicGrain`
    - Paper: `setPaperContrast`, `setPaperRoughness`, `setPaperFiber`, `setPaperFiberSize`, `setPaperCrumples`, `setPaperCrumpleSize`, `setPaperFolds`, `setPaperFoldCount`, `setPaperDrops`, `setPaperFade`, `setPaperSeed`, `setPaperIntensity`
    - Frame blending: `setFrameBlendingFactor`
  - Added missing JSDoc for exported post-processing slice interfaces/types (lint compliance).
- `src/tests/stores/postProcessingStore.test.ts`
  - Added fail-first regressions:
    - `ignores non-finite bloom updates`
    - `ignores non-finite frame blending factor updates`
    - `ignores non-finite cinematic updates`
    - `ignores non-finite paper numeric updates`

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/postProcessingStore.test.ts`
  - Result before full fix: new cinematic/paper non-finite regressions failed (state became `NaN`).
- Post-fix checks:
  - `npx vitest run src/tests/stores/postProcessingStore.test.ts`
  - `npx eslint src/stores/slices/postProcessingSlice.ts src/tests/stores/postProcessingStore.test.ts`
  - `npx vitest run src/tests/stores/postProcessingStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/rendering/webgpu/passes/temporalFrameCaching.test.ts src/tests/rendering/webgpu/passes/BloomPass.test.ts`
  - Result: all pass.

## Iteration Update: Material Slice Emission Non-Finite Guard (2026-02-21)

### Root-Cause Summary
- `materialSlice` emission setters (`setFaceEmission`, `setFaceEmissionThreshold`, `setFaceEmissionColorShift`) clamped with `Math.max/Math.min` but had no finite-input guard.
- Non-finite values (`NaN`, `±Infinity`) could propagate invalid emission uniforms (or coerce to unintended clamp edges), destabilizing appearance state.

### Fix Implemented
- `src/stores/slices/visual/materialSlice.ts`
  - Added `isFiniteMaterialInput(value)` helper.
  - Hardened emission numeric setters to reject non-finite values with DEV warning + no-op behavior.
- `src/tests/stores/appearanceStore.enhanced.test.ts`
  - Added fail-first invariant test:
    - `ignores non-finite material emission controls`

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts`
  - Result before fix: new regression failed (`faceEmission` became `NaN`).
- Post-fix checks:
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts`
  - `npx eslint src/stores/slices/visual/materialSlice.ts src/tests/stores/appearanceStore.enhanced.test.ts`
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: all pass.

## Iteration Update: PBR Slice Non-Finite Numeric Guards (2026-02-21)

### Root-Cause Summary
- `pbrSlice` clamp utilities (`clampRoughness`, `clampMetallic`, `clampSpecularIntensity`) were used without finite checks.
- Non-finite inputs in direct setters and `setFacePBR` partial updates could inject `NaN` into PBR face state.
- No dedicated store tests existed for PBR numeric input contracts.

### Fix Implemented
- `src/stores/slices/visual/pbrSlice.ts`
  - Added `isFinitePBRInput(value)` helper.
  - Hardened direct numeric setters:
    - `setFaceRoughness`, `setFaceMetallic`, `setFaceSpecularIntensity`
    - Invalid numeric inputs now no-op with DEV warning.
  - Hardened `setFacePBR(config)` field-wise:
    - Numeric fields are applied only when finite; non-finite numeric fields are ignored with DEV warnings.
    - Valid non-numeric fields (e.g., `specularColor`) continue to apply.
    - If no valid fields remain, setter returns current state (no effective mutation).
  - Added missing JSDoc for exported PBR state/actions/type (lint compliance).
- Added `src/tests/stores/pbrStore.test.ts` with fail-first regressions:
  - direct numeric clamping behavior,
  - non-finite direct numeric updates ignored,
  - non-finite numeric fields in `setFacePBR` ignored while valid fields still apply.

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/pbrStore.test.ts`
  - Result before fix: 2 regressions failed (`roughness` became `NaN`).
- Post-fix checks:
  - `npx vitest run src/tests/stores/pbrStore.test.ts`
  - `npx eslint src/stores/slices/visual/pbrSlice.ts src/tests/stores/pbrStore.test.ts`
  - `npx vitest run src/tests/stores/pbrStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`
  - Result: all pass.

## Iteration Update: Render Slice Non-Finite Numeric Setting Guards (2026-02-21)

### Root-Cause Summary
- `renderSlice` merged partial settings and clamped numeric fields (`wireframe.lineThickness`, `surface.specularIntensity`) without finite checks.
- Non-finite inputs could write `NaN` into shader settings, risking invalid render uniforms.

### Fix Implemented
- `src/stores/slices/visual/renderSlice.ts`
  - Added `isFiniteRenderSettingValue(value)` helper.
  - Hardened `setWireframeSettings` and `setSurfaceSettings`:
    - Non-finite numeric values are ignored with DEV warnings.
    - Existing state value is preserved when invalid numeric input is provided.
    - Existing partial-merge behavior for other fields remains unchanged.
- `src/tests/stores/appearanceStore.enhanced.test.ts`
  - Added fail-first invariant regression:
    - `ignores non-finite render numeric setting updates`

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts`
  - Result before fix: new regression failed (`wireframe.lineThickness` became `NaN`).
- Post-fix checks:
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts`
  - `npx eslint src/stores/slices/visual/renderSlice.ts src/tests/stores/appearanceStore.enhanced.test.ts`
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`
  - Result: all pass.

## Iteration Update: Color Slice Numeric Contract Hardening (2026-02-21)

### Root-Cause Summary
- `colorSlice` numeric setters used clamp-only logic without finite guards, so non-finite inputs (`NaN`, `±Infinity`) could leak into appearance state.
- `setCosineCoefficient` accepted arbitrary numeric indexes and wrote `arr[index]`, allowing tuple-shape corruption (e.g., index `99` expanding coefficient array length to 100).
- Fail-first regressions confirmed both issues:
  - distribution power became `NaN` after invalid updates,
  - cosine coefficient tuple expanded and stored invalid values.

### Fix Implemented
- `src/stores/slices/visual/colorSlice.ts`
  - Added shared helpers:
    - `isFiniteColorInput(value)`
    - `clampColorValue(value, min, max)`
    - `isValidCosineIndex(index)`
  - Hardened numeric pathways:
    - `setCosineCoefficients`: per-element finite validation + clamping; invalid elements preserve previous values.
    - `setCosineCoefficient`: rejects invalid index and non-finite values.
    - `setDistribution`: finite guards for `power`, `cycles`, `offset`.
    - `setMultiSourceWeights`: finite guards for `depth`, `orbitTrap`, `normal`.
    - `setLchLightness`, `setLchChroma`: finite guards + no-op for invalid input.
    - `setDomainColoringSettings`: finite guards for `contourDensity`, `contourWidth`, `contourStrength`.
    - `setDivergingPsiSettings`: finite guard for `intensityFloor`.
- `src/tests/stores/appearanceStore.enhanced.test.ts`
  - Added fail-first regressions:
    - `ignores non-finite color-slice numeric updates`
    - `ignores invalid cosine coefficient updates`

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts`
  - Result before fix:
    - `distribution.power` became `NaN`,
    - `cosineCoefficients.a` expanded to length 100 with invalid entries.
- Post-fix checks:
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts`
  - `npx eslint src/stores/slices/visual/colorSlice.ts src/tests/stores/appearanceStore.enhanced.test.ts`
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/geometryStore.test.ts src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`
  - Result: all pass.

## Iteration Update: Advanced Rendering SSS Numeric Guarding (2026-02-21)

### Root-Cause Summary
- `advancedRenderingSlice` accepted raw SSS numeric values (`sssIntensity`, `sssThickness`, `sssJitter`) with no finite checks or range clamping.
- This allowed non-finite values and out-of-range values to flow into appearance uniforms, despite shader contract ranges:
  - `sssIntensity` expected `0.0-2.0`
  - `sssThickness` expected `0.1-5.0`
  - `sssJitter` expected `0.0-1.0`

### Fix Implemented
- `src/stores/slices/visual/advancedRenderingSlice.ts`
  - Added helpers:
    - `isFiniteAdvancedRenderingInput(value)`
    - `clampAdvancedRenderingValue(value, min, max)`
  - Hardened SSS numeric setters:
    - `setSssIntensity` clamps to `[0.0, 2.0]` and rejects non-finite input.
    - `setSssThickness` clamps to `[0.1, 5.0]` and rejects non-finite input.
    - `setSssJitter` clamps to `[0.0, 1.0]` and rejects non-finite input.
  - Invalid numeric inputs now no-op with DEV warnings.
- `src/tests/stores/appearanceStore.enhanced.test.ts`
  - Added fail-first invariants:
    - `clamps advanced SSS controls to shader-safe ranges`
    - `ignores non-finite advanced SSS updates`

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts`
  - Result before fix:
    - `sssIntensity` remained `999` (no clamp),
    - non-finite updates wrote `NaN`.
- Post-fix checks:
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts`
  - `npx eslint src/stores/slices/visual/advancedRenderingSlice.ts src/stores/slices/visual/colorSlice.ts src/tests/stores/appearanceStore.enhanced.test.ts`
  - `npx vitest run src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/geometryStore.test.ts src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`
  - Result: all pass.

## Iteration Update: Export Store Progress Numeric Guarding (2026-02-21)

### Root-Cause Summary
- `exportStore.setProgress` wrote raw values directly to state despite `progress` contract being normalized `[0,1]`.
- Non-finite inputs (`NaN`, `±Infinity`) and out-of-range values could corrupt export progress UI state.

### Fix Implemented
- `src/stores/exportStore.ts`
  - Hardened `setProgress`:
    - Reject non-finite values (DEV warning + no-op).
    - Clamp finite values to `[0,1]`.
- `src/tests/stores/exportStore.test.ts`
  - Added fail-first coverage:
    - `clamps progress to [0, 1]`
    - `ignores non-finite progress updates`

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/exportStore.test.ts`
  - Result before fix:
    - `setProgress(-1)` remained `-1`,
    - non-finite updates set progress to `-Infinity`.
- Post-fix checks:
  - `npx vitest run src/tests/stores/exportStore.test.ts`
  - `npx eslint src/stores/exportStore.ts src/tests/stores/exportStore.test.ts`
  - `npx vitest run src/tests/stores/exportStore.test.ts src/tests/components/overlays/ExportModal.test.tsx src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/geometryStore.test.ts src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`
  - Result: all pass.

## Iteration Update: Export Settings Numeric Patch Sanitization (2026-02-21)

### Root-Cause Summary
- `exportStore.updateSettings` merged incoming numeric patches directly, allowing non-finite values in core bitrate-driving fields (`fps`, `bitrate`, `customWidth`, `customHeight`, etc.).
- This could poison persisted export settings and downstream bitrate planning.

### Fix Implemented
- `src/stores/exportStore.ts`
  - Added numeric patch sanitization inside `updateSettings` before merge:
    - Reject non-finite/non-positive updates for `fps`, `duration`, `bitrate`, `customWidth`, `customHeight`.
    - Reject non-finite/negative `warmupFrames` updates.
    - Invalid values are dropped from patch with DEV warnings.
  - Auto-bitrate recalculation now operates on sanitized numeric inputs.
- `src/tests/stores/exportStore.test.ts`
  - Added fail-first regression:
    - `ignores non-finite numeric updateSettings patches for bitrate-driving fields`

### Verification Evidence
- Failing-first confirmation:
  - `npx vitest run src/tests/stores/exportStore.test.ts`
  - Result before fix: `fps` became `NaN` after `updateSettings` patch.
- Post-fix checks:
  - `npx vitest run src/tests/stores/exportStore.test.ts`
  - `npx eslint src/stores/exportStore.ts src/tests/stores/exportStore.test.ts`
  - `npx vitest run src/tests/stores/exportStore.test.ts src/tests/components/overlays/ExportModal.test.tsx src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/geometryStore.test.ts src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`
  - Result: all pass.

## Target Queue Reset: Geometry Slice Module (2026-02-21)

### Active Target
- Feature: geometry slice contracts (`src/stores/slices/geometry`).
- Scope files: `src/stores/slices/geometry/types.ts`, `src/stores/slices/geometry/schroedingerSlice.ts`.

### Task Queue Details
- [in_progress] Understand purpose of geometry slice module (Schroedinger state/action contracts).
- [pending] Analyze `src/stores/slices/geometry/types.ts`.
- [pending] Analyze `src/stores/slices/geometry/schroedingerSlice.ts`.
- [pending] Trace geometry slice flow through extendedObjectStore, URL/preset hydration, and renderer consumers.
- [pending] Evaluate geometry slice behavior against intended contracts and identify actionable defects.

### Geometry Slice Analysis Notes (2026-02-21)
- `types.ts` defines a wide action surface (Schroedinger core + freeScalar + TDSE), making this module the primary state contract boundary for quantum simulation controls.
- `schroedingerSlice.ts` centralizes action implementations and increments `schroedingerVersion` for render invalidation.
- Traced flow:
  - UI/hooks call `useExtendedObjectStore` actions.
  - Render/runtime consumes `schroedinger` config via `WebGPUScene` and simulation modules.
  - Preset load can use direct setState paths; setter-level validation remains critical for runtime interaction and recovery paths.
- Evaluation finding: several integer-clamp setters in `schroedingerSlice.ts` still allow `NaN` through clamp math (`Math.floor/round + min/max`), yielding persisted `NaN` in key fields (e.g., `freeScalar.latticeDim`, `tdse.gridSize`, `wignerDimensionIndex`, `wignerQuadPoints`, `probabilityCurrentSteps`).
- Impact: invalid lattice and Wigner metadata can poison simulation sizing/indexing assumptions and propagate unstable numeric state to renderer/simulation code.

## Iteration Update: Geometry Slice Discrete Numeric Guarding (2026-02-21)

### Root-Cause Summary
- Several discrete/integer-style setters in `schroedingerSlice` used `Math.floor/Math.round` + clamp without finite-input guards.
- Non-finite payloads (`NaN`, `±Infinity`) from malformed runtime inputs could mutate key configuration fields to invalid values or unintended clamp edges.
- High-impact paths confirmed by fail-first tests:
  - `freeScalar.latticeDim`, `freeScalar.gridSize`
  - `tdse.latticeDim`, `tdse.gridSize`
  - `wignerDimensionIndex`, `wignerQuadPoints`, `wignerCacheResolution`
  - `probabilityCurrentSteps`

### Fix Implemented
- `src/stores/slices/geometry/schroedingerSlice.ts`
  - Added shared helpers:
    - `hasOnlyFiniteNumbers(values)`
    - `warnNonFiniteSchroedingerInput(name, value)`
  - Hardened setters to reject non-finite inputs (DEV warning + no-op):
    - `setFreeScalarLatticeDim`
    - `setFreeScalarGridSize`
    - `setTdseLatticeDim`
    - `setTdseGridSize`
    - `setSchroedingerWignerDimensionIndex`
    - `setSchroedingerWignerQuadPoints`
    - `setSchroedingerWignerCacheResolution`
    - `setSchroedingerProbabilityCurrentSteps`
  - Also normalized `setSchroedingerWignerDimensionIndex` to discrete integer indexing via `Math.floor(...)`.

- Added regressions:
  - `src/tests/stores/extendedObjectStore.freeScalar.test.ts`
    - `ignores non-finite lattice and grid-size updates`
  - `src/tests/stores/extendedObjectStore.tdse.test.ts`
    - `ignores non-finite lattice and grid-size updates`
  - `src/tests/stores/extendedObjectStore.test.ts`
    - `ignores non-finite discrete Wigner and probability-current step updates`

### Verification Evidence
- Fail-first confirmation:
  - `npx vitest run src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts`
  - Result before fix: 3 failures (all new regressions failed).
- Post-fix targeted checks:
  - `npx vitest run src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts`
  - Result: all pass.
- Related regression sweep:
  - `npx vitest run src/tests/stores/presetManagerStore.test.ts src/tests/hooks/useUrlState.test.ts src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/stores/slices/geometry/*.test.ts`
  - Result: all pass (11 files, 158 tests).
- Lint:
  - `npx eslint src/stores/slices/geometry/schroedingerSlice.ts src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts`
  - Result: pass.

## Follow-up Target Queue: Geometry Slice Scalar Numeric Setters (2026-02-21)
- [in_progress] Understand remaining scalar numeric setter contracts in `schroedingerSlice` (freeScalar/TDSE/k-space).
- [pending] Add fail-first regressions for non-finite scalar numeric updates.
- [pending] Implement finite-input guards for validated scalar setter subset.
- [pending] Re-run targeted + related suites and lint.

## Iteration Update: Geometry Slice Scalar Numeric Guarding (2026-02-21)

### Root-Cause Summary
- Free-scalar and TDSE scalar numeric setters still accepted non-finite values in multiple paths (spacing arrays, mass/dt/steps, potential/drive/absorber parameters, k-space display controls, slice positions).
- Clamp math without finite checks allowed `NaN` to persist in state (`Math.min/max` with `NaN`), violating simulation/renderer numeric invariants.

### Fix Implemented
- `src/stores/slices/geometry/schroedingerSlice.ts`
  - Added finite guards (DEV warning + no-op) for free-scalar scalar setters:
    - `setFreeScalarSpacing`, `setFreeScalarMass`, `setFreeScalarDt`, `setFreeScalarStepsPerFrame`,
    - `setFreeScalarPacketWidth`, `setFreeScalarPacketAmplitude`, `setFreeScalarVacuumSeed`, `setFreeScalarSlicePosition`,
    - `setFreeScalarKSpaceLowPercentile`, `setFreeScalarKSpaceHighPercentile`, `setFreeScalarKSpaceGamma`,
    - `setFreeScalarKSpaceBroadeningRadius`, `setFreeScalarKSpaceBroadeningSigma`, `setFreeScalarKSpaceRadialBinCount`.
  - Added finite guards (DEV warning + no-op) for TDSE scalar setters:
    - `setTdseSpacing`, `setTdseMass`, `setTdseHbar`, `setTdseDt`, `setTdseStepsPerFrame`,
    - `setTdsePacketWidth`, `setTdsePacketAmplitude`,
    - `setTdseBarrierHeight`, `setTdseBarrierWidth`, `setTdseBarrierCenter`,
    - `setTdseWellDepth`, `setTdseWellWidth`, `setTdseHarmonicOmega`, `setTdseStepHeight`,
    - `setTdseDriveFrequency`, `setTdseDriveAmplitude`,
    - `setTdseAbsorberWidth`, `setTdseAbsorberStrength`,
    - `setTdseDiagnosticsInterval`, `setTdseSlicePosition`.

- Added fail-first regressions:
  - `src/tests/stores/extendedObjectStore.freeScalar.test.ts`
    - `ignores non-finite scalar numeric updates`
  - `src/tests/stores/extendedObjectStore.tdse.test.ts`
    - `ignores non-finite scalar numeric updates`

### Verification Evidence
- Fail-first confirmation:
  - `npx vitest run src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts`
  - Result before fix: 2 failures (both new non-finite regressions failed).
- Post-fix targeted checks:
  - `npx vitest run src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts`
  - Result: all pass.
- Related regression sweep:
  - `npx vitest run src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/stores/slices/geometry/*.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/hooks/useUrlState.test.ts`
  - Result: all pass (11 files, 160 tests).
- Lint:
  - `npx eslint src/stores/slices/geometry/schroedingerSlice.ts src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts`
  - Result: pass.

## Iteration Update: Geometry Slice Top-Level Numeric Guarding (2026-02-21)

### Root-Cause Summary
- Additional top-level Schroedinger setters still accepted non-finite values in clamp paths, including extent/seed/quantum controls, hydrogen-ND extra-dimension frequencies, and cross-section window bounds.
- This allowed invalid state (`NaN`/`Infinity`) in core fields that drive quantum parameter generation and visualization windows.

### Fix Implemented
- `src/stores/slices/geometry/schroedingerSlice.ts`
  - Added finite-input guards (DEV warning + no-op) for:
    - `setSchroedingerExtent`
    - `setSchroedingerSeed`
    - `setSchroedingerTermCount`
    - `setSchroedingerMaxQuantumNumber`
    - `setSchroedingerFrequencySpread`
    - `setSchroedingerBohrRadiusScale`
    - `setSchroedingerExtraDimOmega`
    - `setSchroedingerExtraDimOmegaAll`
    - `setSchroedingerExtraDimFrequencySpread`
    - `setSchroedingerCrossSectionWindowMin`
    - `setSchroedingerCrossSectionWindowMax`

- Added fail-first regression:
  - `src/tests/stores/extendedObjectStore.test.ts`
    - `ignores non-finite top-level schroedinger numeric updates`

### Verification Evidence
- Fail-first confirmation:
  - `npx vitest run src/tests/stores/extendedObjectStore.test.ts`
  - Result before fix: new regression failed (`extent` became `NaN`).
- Post-fix targeted checks:
  - `npx vitest run src/tests/stores/extendedObjectStore.test.ts`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/stores/slices/geometry/*.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/hooks/useUrlState.test.ts`
  - Result: all pass (11 files, 161 tests).
- Lint:
  - `npx eslint src/stores/slices/geometry/schroedingerSlice.ts src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts`
  - Result: pass.

### Ongoing Audit Notes (next queue, in progress)
- Remaining unguarded candidates identified in top segment of `schroedingerSlice`:
  - `setSchroedingerResolution`
  - `setSchroedingerVisualizationAxis`
  - `setSchroedingerParameterValue` / `setSchroedingerParameterValues`
  - `setSchroedingerPrincipalQuantumNumber` / `setSchroedingerAzimuthalQuantumNumber` / `setSchroedingerMagneticQuantumNumber`
  - `setSchroedingerExtraDimQuantumNumber` / `setSchroedingerExtraDimQuantumNumbers`
- Next cycle will fail-first these paths and close remaining non-finite/index contract gaps.

## Iteration Update: Geometry Setter Contract Closure (Resolution/Axes/Parameters/Quantum Numbers) (2026-02-21)

### Root-Cause Summary
- Remaining top-segment setters in `schroedingerSlice` still accepted non-finite inputs and/or non-integer indices in core quantum controls:
  - `resolution`, `visualizationAxis`, parameter setters, hydrogen 3D quantum numbers, extra-dimension quantum numbers.
- Fail-first regression confirmed `setSchroedingerResolution(Number.NaN)` mutated state unpredictably (`64 -> 16`) and similar non-finite paths could inject invalid values.

### Fix Implemented
- `src/stores/slices/geometry/schroedingerSlice.ts`
  - Added finite guards (DEV warning + no-op) for:
    - `setSchroedingerResolution`
    - `setSchroedingerVisualizationAxis`
    - `setSchroedingerParameterValue` (plus integer index validation)
    - `setSchroedingerParameterValues`
    - `setSchroedingerPrincipalQuantumNumber`
    - `setSchroedingerAzimuthalQuantumNumber`
    - `setSchroedingerMagneticQuantumNumber`
    - `setSchroedingerExtraDimQuantumNumber` (plus integer index validation)
    - `setSchroedingerExtraDimQuantumNumbers`

- Added fail-first regression:
  - `src/tests/stores/extendedObjectStore.test.ts`
    - `ignores non-finite resolution, axis, parameter, and quantum-number updates`

### Verification Evidence
- Fail-first confirmation:
  - `npx vitest run src/tests/stores/extendedObjectStore.test.ts`
  - Result before fix: failed (`resolution` changed to 16 on NaN input).
- Post-fix targeted check:
  - `npx vitest run src/tests/stores/extendedObjectStore.test.ts`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/stores/slices/geometry/*.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/hooks/useUrlState.test.ts`
  - Result: all pass (11 files, 162 tests).
- Lint:
  - `npx eslint src/stores/slices/geometry/schroedingerSlice.ts src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/stores/slices/geometry/hydrogenNDActions.test.ts`
  - Result: pass.

## Target Queue Reset: Lighting Update Contract (2026-02-21)

### Active Target
- Feature: multi-light update numeric contract (`src/stores/slices/lightingSlice.ts` + `src/rendering/lights/types.ts`).

### Task Queue Details
- [in_progress] Understand purpose of lighting state contracts and updateLight normalization behavior.
- [pending] Analyze `src/stores/slices/lightingSlice.ts`.
- [pending] Analyze `src/rendering/lights/types.ts`.
- [pending] Trace `updateLight` flow from store actions to renderer-consumed light data.
- [pending] Evaluate lighting numeric contract behavior and isolate actionable defect(s).
- [pending] Add fail-first regression(s) for non-finite `updateLight` payload fields and verify failure.
- [pending] Implement finite-input hardening in lighting update path and clamp helpers; rerun targeted + related tests and eslint.

### Lighting Analysis Notes (2026-02-21)
- `lightingSlice.updateLight` delegates numeric sanitization to helper clamps (`clampIntensity`, `clampConeAngle`, `clampPenumbra`) and rotation normalizer (`normalizeRotationTupleSigned`).
- Current helper implementation uses raw `Math.max/Math.min` and modulo math without finite guards.
- Non-finite payloads in `updateLight` therefore propagate as `NaN` (intensity/cone/penumbra/rotation), violating light uniform numeric contracts and risking renderer instability.

## Iteration Update: Lighting updateLight Non-Finite Hardening (2026-02-21)

### Root-Cause Summary
- `lightingSlice.updateLight` trusted clamp/normalize helpers for numeric sanitization, but those helpers (`clampIntensity`, `clampConeAngle`, `clampPenumbra`, `normalizeRotationSigned`) did not guard non-finite input.
- Non-finite payloads in `updateLight` (e.g., malformed control payloads) propagated `NaN` into light state fields consumed by renderer uniforms.

### Fix Implemented
- `src/stores/slices/lightingSlice.ts`
  - Added `isValidRotationTuple` helper.
  - Hardened `updateLight` to drop non-finite per-field updates (`intensity`, `coneAngle`, `penumbra`, `rotation`) while still applying valid fields in the same payload.
  - Added DEV warnings for ignored invalid update fields.
- `src/rendering/lights/types.ts`
  - Hardened helper contracts for non-finite inputs:
    - `clampIntensity` -> fallback `0.1`
    - `clampConeAngle` -> fallback `1`
    - `clampPenumbra` -> fallback `0`
    - `clampRange` -> fallback `1`
    - `clampDecay` -> fallback `0.1`
    - `normalizeRotationSigned` -> fallback `0`

- Added fail-first regressions:
  - `src/tests/stores/lightingStore.test.ts`
    - `updateLight ignores non-finite numeric and rotation updates while applying valid fields`
  - `src/tests/lib/lights/types.test.ts`
    - non-finite behavior for `clampIntensity`, `clampConeAngle`, `clampPenumbra`, `normalizeRotationSigned`.

### Verification Evidence
- Fail-first confirmation:
  - `npx vitest run src/tests/stores/lightingStore.test.ts src/tests/lib/lights/types.test.ts`
  - Result before fix: 5 failures (new regressions).
- Post-fix targeted checks:
  - `npx vitest run src/tests/stores/lightingStore.test.ts src/tests/lib/lights/types.test.ts`
  - Result: all pass.
- Related regression sweep:
  - `npx vitest run src/tests/stores/lightingStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts src/tests/lib/lights/types.test.ts`
  - Result: all pass (5 files, 116 tests).
- Lint:
  - `npx eslint src/stores/slices/lightingSlice.ts src/rendering/lights/types.ts src/tests/stores/lightingStore.test.ts src/tests/lib/lights/types.test.ts`
  - Result: pass.

## Iteration Update: Skybox Procedural Settings Non-Finite Sanitization (2026-02-21)

### Root-Cause Summary
- `setProceduralSettings` in `src/stores/slices/skyboxSlice.ts` performed a raw shallow merge.
- Non-finite numeric payload values (`NaN`, `Infinity`) were accepted and persisted in `environment.proceduralSettings`.
- `WebGPUSkyboxRenderer` consumes these values directly into uniform buffers, so invalid numeric state could propagate to GPU uniforms.

### Fix Implemented
- `src/stores/slices/skyboxSlice.ts`
  - Added schema-driven sanitizer utilities for procedural settings patches:
    - `sanitizeProceduralValue`
    - `sanitizeProceduralSettingsPatch`
    - DEV warnings for invalid paths/values
  - Added deep merge utilities:
    - `deepMergeRecord`
    - `mergeProceduralSettings`
  - Updated `setProceduralSettings` to:
    - drop invalid numeric leaves (including tuple entries),
    - keep valid fields in the same update,
    - no-op when an update contains no valid fields,
    - deep-merge nested procedural groups to avoid replacing nested objects with partial payloads.

- `src/tests/stores/environmentStore.test.ts`
  - Added fail-first regression:
    - `ignores non-finite procedural numeric updates while applying valid fields`

### Verification Evidence
- Fail-first confirmation:
  - `npx vitest run --maxWorkers=4 src/tests/stores/environmentStore.test.ts`
  - Result before fix: failed (`hue` became `NaN`).

- Post-fix targeted check:
  - `npx vitest run --maxWorkers=4 src/tests/stores/environmentStore.test.ts`
  - Result: pass (18 tests).

- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/environmentStore.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
  - Result: all pass (4 files, 77 tests).

- Lint:
  - `npx eslint src/stores/slices/skyboxSlice.ts src/tests/stores/environmentStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue environment-side hardening audit for `setSkyboxEnabled` / `setSkyboxMode` / `setSkyboxTexture` invariant drift potential (selection-derived canonical state).
- Audit URL/preset hydration paths for remaining non-finite ingress points not routed through guarded setters.

## Iteration Update: Preset Import Non-Finite Numeric Sanitization (2026-02-21)

### Root-Cause Summary
- Preset load/import path applies payloads via direct `setState` across stores.
- `JSON.parse` accepts large-exponent numeric literals (e.g. `1e309`) as `Infinity`.
- Existing `sanitizeLoadedState` stripped transient fields but did not reject non-finite numerics.
- Result: imported scenes/styles could hydrate `Infinity` into runtime state, bypassing guarded store setters.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `ignores non-finite numeric fields from imported scene payloads`
- Used raw JSON payload containing `1e309` for:
  - `environment.skyboxIntensity`
  - `animation.speed`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "ignores non-finite numeric fields from imported scene payloads"`
- Result before fix: failed (`skyboxIntensity` became `Infinity`).

### Fix Implemented
- `src/stores/utils/presetSerialization.ts`
  - Added recursive sanitizer:
    - `sanitizeFiniteLoadedValue`
    - `warnDroppedNonFinitePresetValue`
  - `sanitizeLoadedState` now:
    - strips transient fields as before,
    - recursively drops non-finite numeric values (`NaN`, `Infinity`) across nested objects,
    - drops arrays when any element is invalid to preserve array shape invariants.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "ignores non-finite numeric fields from imported scene payloads"`
  - Result: pass.
- Related suite sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/stores/environmentStore.test.ts src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
  - Result: all pass (4 files, 78 tests).
- Lint:
  - `npx eslint src/stores/utils/presetSerialization.ts src/tests/stores/presetManagerStore.test.ts src/stores/slices/skyboxSlice.ts src/tests/stores/environmentStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Public skybox API consistency: verify if `setSkyboxEnabled` / `setSkyboxMode` / `setSkyboxTexture` should preserve unified `skyboxSelection` invariants when called directly.
- If no production call sites remain, decide whether to:
  - enforce invariant behavior defensively, or
  - deprecate/remove dead actions and update types/tests accordingly.

## Iteration Update: Skybox Direct Setter Invariant Enforcement (2026-02-21)

### Root-Cause Summary
- `SkyboxSlice` documents `skyboxSelection` as the unified source of truth.
- Direct setters (`setSkyboxEnabled`, `setSkyboxMode`, `setSkyboxTexture`) previously mutated only one field each, allowing drift between:
  - `skyboxSelection`
  - `skyboxEnabled`
  - `skyboxMode`
  - `skyboxTexture`
- This made store state internally contradictory when these public actions were called directly.

### Fail-First Evidence
- Added regression in `src/tests/stores/environmentStore.test.ts`:
  - `keeps unified skybox selection and derived fields in sync for direct setters`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/environmentStore.test.ts -t "keeps unified skybox selection and derived fields in sync for direct setters"`
- Result before fix: failed (`skyboxSelection` remained `space_blue` after `setSkyboxMode('procedural_aurora')`).

### Fix Implemented
- `src/stores/slices/skyboxSlice.ts`
  - Added helper:
    - `deriveSelectionFromModeAndTexture`
  - Reworked direct setters to flow through canonical selection derivation:
    - `setSkyboxEnabled`
      - `false` -> selection `none`
      - `true` -> derive from current mode/texture; fallback to `space_blue` when derived selection is `none`
    - `setSkyboxMode`
      - procedural mode -> selection = procedural mode
      - `classic` -> selection from current texture (fallback `space_blue`)
    - `setSkyboxTexture`
      - texture `'none'` -> selection `none`
      - otherwise selection = texture
  - All three now update full derived skybox state via `deriveStateFromSelection`.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/environmentStore.test.ts`
  - Result: pass (19 tests).
- Related suite sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/environmentStore.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
  - Result: all pass (4 files, 79 tests).
- Lint:
  - `npx eslint src/stores/slices/skyboxSlice.ts src/stores/utils/presetSerialization.ts src/tests/stores/environmentStore.test.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue scanning preset/store hydration paths for strict runtime type sanitization gaps beyond non-finite numerics (e.g., malformed tuple/array shapes and invalid enum-like string values in imported payloads).

## Iteration Update: Scene Animation Payload Normalization (2026-02-21)

### Root-Cause Summary
- `loadScene` hydrated animation payload via direct `useAnimationStore.setState(animState)`.
- This bypassed animation setter invariants (`setSpeed` clamps and type constraints).
- Invalid-but-finite payloads (e.g., `speed: -100`, `direction: 0`, `isPlaying: 'yes'`) could corrupt runtime animation state types/limits.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `normalizes imported animation payload fields to store invariants`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported animation payload fields to store invariants"`
- Result before fix: failed (`speed` stayed `-100`).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Imported `MIN_SPEED` / `MAX_SPEED` from `animationStore`.
  - Added `normalizeAnimationLoadData` helper.
  - `loadScene` animation hydration now normalizes:
    - `speed` finite + clamped to `[MIN_SPEED, MAX_SPEED]`, otherwise dropped.
    - `direction` constrained to `1 | -1`, otherwise dropped.
    - `isPlaying` constrained to boolean, otherwise dropped.
    - `accumulatedTime` constrained to finite number, otherwise dropped.
    - `animatingPlanes` constrained to string array (then converted to `Set` as before).

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported animation payload fields to store invariants"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
  - Result: all pass (5 files, 107 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue preset hydration hardening for other direct `setState` paths where domain-specific contracts exist (e.g., enum-like fields and tuple shape enforcement in loaded payloads).

## Iteration Update: Preset Lighting Scalar Normalization (2026-02-21)

### Root-Cause Summary
- `loadStyle`/`loadScene` hydrated lighting state via direct `useLightingStore.setState(...)`.
- This bypassed action-level normalization in `lightingSlice` for scalar controls:
  - `lightHorizontalAngle`
  - `lightVerticalAngle`
  - `ambientIntensity`
  - `lightStrength`
  - `exposure`
- Imported finite out-of-range values were applied raw.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `normalizes imported style lighting scalar fields to store invariants on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported style lighting scalar fields to store invariants on load"`
- Result before fix: failed (`lightHorizontalAngle` stayed `-450` instead of normalized `270`).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added `normalizeLightingLoadData` helper.
  - Applied normalization in both `loadStyle` and `loadScene` before lighting `setState`.
  - Enforced same scalar contracts as store actions:
    - horizontal angle normalized to `[0, 360)`
    - vertical angle clamped to `[-90, 90]`
    - ambient intensity clamped to `[0, 1]`
    - light strength clamped to `[0, 3]`
    - exposure clamped to `[0.1, 3]`
    - invalid/non-finite values dropped.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported style lighting scalar fields to store invariants on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
  - Result: all pass (6 files, 113 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Extend load-time normalization from scalar fields to lighting `lights[]` entry shape/value contracts (type, tuples, and per-light numeric clamps) to fully align imported payloads with runtime light invariants.

## Iteration Update: Preset Light Entry Normalization (2026-02-21)

### Root-Cause Summary
- Lighting scalar normalization was added, but imported `lighting.lights[]` entries were still hydrated raw.
- Out-of-range per-light fields (`intensity`, `coneAngle`, `penumbra`, `range`, `decay`) and malformed entry shapes could bypass runtime light invariants when loading style/scene presets.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `normalizes imported style light entries to runtime light constraints on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported style light entries to runtime light constraints on load"`
- Result before fix: failed (`intensity` remained `-5`).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added lighting payload helpers:
    - `isLightType`
    - `isFiniteVec3`
    - `normalizeLoadedLight`
  - Extended `normalizeLightingLoadData` to:
    - sanitize `lights[]` entries and cap to `MAX_LIGHTS`,
    - normalize/clamp per-light numeric fields using light helpers:
      - `clampIntensity`
      - `clampConeAngle`
      - `clampPenumbra`
      - `clampRange`
      - `clampDecay`
    - normalize rotation tuples via `normalizeRotationTupleSigned`,
    - reconcile `selectedLightId` against normalized lights,
    - validate `transformMode`, `showLightGizmos`, and `isDraggingLight` types.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported style light entries to runtime light constraints on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
  - Result: all pass (6 files, 114 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue preset-load contract alignment for remaining directly hydrated stores where action-level invariants exist (appearance/post-processing scalar and enum constraints).

## Iteration Update: Preset Post-Processing Payload Normalization (2026-02-21)

### Root-Cause Summary
- `loadStyle`/`loadScene` applied post-processing payloads with direct `setState`.
- This bypassed `postProcessingSlice` action-level constraints, allowing invalid boolean/enum values and out-of-range finite numerics from imported presets.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `normalizes imported style post-processing payload to store invariants on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported style post-processing payload to store invariants on load"`
- Result before fix: failed (`bloomEnabled` was hydrated as string `'yes'`).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added `normalizePostProcessingLoadData` (plus shared `clampToRange`).
  - Applied normalization in both `loadStyle` and `loadScene` before post-processing `setState`.
  - Normalization covers:
    - booleans: `bloomEnabled`, `cinematicEnabled`, `paperEnabled`, `frameBlendingEnabled`
    - enums: `antiAliasingMethod` (`none|fxaa|smaa`), `paperQuality` (`low|medium|high`)
    - numeric clamps matching slice actions (bloom/cinematic/paper/frame blending)
    - string type checks for paper colors.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported style post-processing payload to store invariants on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
  - Result: all pass (7 files, 131 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue with appearance/pbr load-path normalization for direct `setState` hydration, focusing on out-of-range finite values and invalid enum-like fields that bypass action-level guards.

## Iteration Update: Preset PBR Payload Normalization (2026-02-21)

### Root-Cause Summary
- `loadStyle`/`loadScene` applied `pbr` via direct `usePBRStore.setState(...)`.
- This bypassed PBR slice clamps and allowed imported finite out-of-range values in `face` config.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `normalizes imported style PBR payload to store invariants on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported style PBR payload to store invariants on load"`
- Result before fix: failed (`roughness` loaded as `-5`).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added `normalizePbrLoadData`.
  - Applied normalization in both `loadStyle` and `loadScene` for PBR hydration.
  - Enforced PBR face contracts:
    - `roughness`: clamp `[0.04, 1.0]`
    - `metallic`: clamp `[0.0, 1.0]`
    - `specularIntensity`: clamp `[0.0, 2.0]`
    - `specularColor`: keep string only
  - Supports legacy flat PBR keys by normalizing into `face` and dropping legacy flats.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported style PBR payload to store invariants on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
  - Result: all pass (8 files, 135 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue hydration hardening for remaining direct `setState` load paths, prioritizing appearance/color/store sections with enum and bounded numeric contracts.

## Active Target
- Appearance preset hydration invariants (style/scene load paths)

## Task Queue Details
- [in_progress] Understand purpose of appearance preset hydration feature
- [pending] Analyze src/stores/appearanceStore.ts
- [pending] Analyze src/stores/slices/visual/colorSlice.ts
- [pending] Analyze src/stores/slices/visual/materialSlice.ts
- [pending] Analyze src/stores/slices/visual/renderSlice.ts
- [pending] Analyze src/stores/slices/visual/advancedRenderingSlice.ts
- [pending] Analyze src/stores/presetManagerStore.ts appearance hydration path
- [pending] Trace style/scene load flow for appearance data
- [pending] Evaluate appearance hydration against invariants
- [pending] Fix discovered appearance hydration issues
- [pending] Add or update tests for appearance load normalization
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Appearance Preset Hydration Invariants (analysis phase)

### Purpose confirmation
- Scene/style preset loading is intended to restore visual state deterministically while preserving runtime contracts that prevent invalid shader uniforms and render regressions.
- `useAppearanceStore` uses wrapped setters that auto-increment `appearanceVersion`; direct `setState` bypasses action-level guards and version bumping, so load paths must sanitize inputs and manually bump version.

### Per-file analysis results
- `src/stores/appearanceStore.ts`
  - Wrapped setter enforces `appearanceVersion` increments for action-driven updates.
  - `bumpVersion` exists specifically for direct `setState` paths (e.g., preset load).
- `src/stores/slices/appearanceSlice.ts`
  - Appearance state composes color/material/render/advanced slices; `reset` applies aggregated initial state.
- `src/stores/slices/visual/types.ts`
  - Defines appearance shape and enums used by setters; runtime JSON imports can violate these compile-time contracts.
- `src/stores/slices/visual/colorSlice.ts`
  - Numeric contracts/clamps: cosine coefficients [0,2], distribution (power/cycles/offset), multiSource weights [0,1], LCH lightness/chroma, domain-coloring contour fields, divergingPsi intensityFloor.
  - Enum/boolean/string contracts are implied by action signatures (e.g., `colorAlgorithm`, `modulusMode`, `component`, `contoursEnabled`, color strings), but direct store hydration currently bypasses action path.
- `src/stores/slices/visual/materialSlice.ts`
  - Clamps `faceEmission` [0,5], `faceEmissionThreshold` [0,1], `faceEmissionColorShift` [-1,1].
- `src/stores/slices/visual/renderSlice.ts`
  - Clamps `shaderSettings.wireframe.lineThickness` [1,5], `shaderSettings.surface.specularIntensity` [0,2].
- `src/stores/slices/visual/advancedRenderingSlice.ts`
  - Clamps `sssIntensity` [0,2], `sssThickness` [0.1,5], `sssJitter` [0,1].
- `src/tests/stores/appearanceStore.enhanced.test.ts`
  - Existing tests explicitly codify clamp/non-finite invariants for all numeric appearance controls.

### Initial issue hypothesis
- `presetManagerStore.loadStyle/loadScene` currently calls:
  - `useAppearanceStore.setState(sanitizeLoadedState(...appearance...))`
- This bypasses appearance action-level clamping/guards for finite but out-of-range values and invalid enum/boolean/string shapes.
- Sanitization currently removes non-finite numbers, but does not normalize finite out-of-range values or invalid enum-like fields.

## Iteration Update: Appearance Payload Normalization (2026-02-21)

### Root-Cause Summary
- `loadStyle`/`loadScene` hydrated appearance with direct `useAppearanceStore.setState(sanitizeLoadedState(...))`.
- `sanitizeLoadedState` removes transient/non-finite data, but does not enforce appearance finite-range clamps or enum/boolean/string shape constraints.
- Result: imported finite out-of-range values and invalid enum-like values bypassed appearance action-level invariants.

### Fail-First Evidence
- Added regression test in `src/tests/stores/presetManagerStore.test.ts`:
  - `normalizes imported style appearance payload to store invariants on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported style appearance payload to store invariants on load"`
- Result before fix: failed (`appearance.colorAlgorithm` became invalid imported string instead of preserving valid state).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added appearance normalization helpers:
    - `clampFiniteOrFallback`
    - `normalizeCosineVector`
    - `normalizeAppearanceLoadData`
  - Added enum sets for appearance contract checks:
    - `COLOR_ALGORITHM_SET`
    - `DOMAIN_COLORING_MODULUS_MODE_SET`
    - `DIVERGING_COMPONENT_SET`
    - `SHADER_TYPE_SET`
  - Applied `normalizeAppearanceLoadData(...)` in both:
    - `loadStyle`
    - `loadScene`
- Normalization coverage includes:
  - Color fields/types, algorithm enum, per-dimension toggle
  - Cosine coefficients, distribution, multi-source weights
  - LCH controls
  - Domain coloring + diverging config
  - Material emission controls
  - Shader type/settings
  - Advanced SSS controls

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported style appearance payload to store invariants on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/utils/presetSerialization.test.ts`
  - Result: all pass (8 files, 149 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue preset hydration hardening for remaining direct scene/style hydrations that still bypass action-level contracts, starting with `ui` load path (`useUIStore.setState(uiData)` currently only normalizes `animationBias`).

## Active Target
- UI preset hydration invariants (scene load path)

## Task Queue Details
- [in_progress] Understand purpose of UI preset hydration feature
- [pending] Analyze src/stores/uiStore.ts
- [pending] Analyze src/stores/slices/uiSlice.ts
- [pending] Analyze src/stores/defaults/visualDefaults.ts UI-related constants
- [pending] Analyze src/stores/presetManagerStore.ts UI hydration path
- [pending] Analyze src/tests/stores/uiStore.test.ts contracts
- [pending] Trace scene load flow for ui payload and action invariants
- [pending] Evaluate UI hydration against invariants
- [pending] Fix discovered UI hydration issues
- [pending] Add or update tests for UI load normalization
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: UI Payload Whitelisting on Scene Load (2026-02-21)

### Root-Cause Summary
- `loadScene` sanitized and clamped `ui.animationBias`, but then applied the full `uiData` object via direct `useUIStore.setState(uiData)`.
- Unknown imported keys not in the UI slice contract were therefore injected into store state.
- This violates state-shape integrity for untrusted imported payloads.

### Fail-First Evidence
- Added regression test in `src/tests/stores/presetManagerStore.test.ts`:
  - `normalizes imported scene UI payload fields to store invariants on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported scene UI payload fields to store invariants on load"`
- Result before fix: failed (`mysteryFlag` leaked into `useUIStore` state).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added `normalizeUiLoadData` helper that whitelists canonical UI load fields.
  - Currently keeps only `animationBias` (clamped to `[0,1]` when finite).
  - Drops unknown keys and non-canonical/transient payload fields.
  - Replaced inline UI normalization in `loadScene` with `normalizeUiLoadData(...)`.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "normalizes imported scene UI payload fields to store invariants on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/utils/presetSerialization.test.ts`
  - Result: all pass (9 files, 156 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue preset/load contract audit for remaining direct store hydrations with broad `setState` payloads (camera and extended-object ingress points).

## Active Target
- Camera payload hydration invariants (scene load path)

## Task Queue Details
- [in_progress] Understand purpose of camera preset hydration feature
- [pending] Analyze src/stores/cameraStore.ts
- [pending] Analyze src/stores/presetManagerStore.ts camera hydration path
- [pending] Analyze src/stores/utils/presetSerialization.ts camera sanitization behavior
- [pending] Analyze src/tests/stores/cameraStore.test.ts contracts
- [pending] Analyze src/tests/stores/presetManagerStore.test.ts camera-related coverage
- [pending] Trace scene load camera ingress flow
- [pending] Evaluate camera hydration against invariants
- [pending] Fix discovered camera hydration issues
- [pending] Add or update tests for camera load normalization
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Camera Ingress Audit (2026-02-21)

### Scope reviewed
- `src/stores/cameraStore.ts`
- `src/stores/presetManagerStore.ts` camera load block
- `src/stores/utils/presetSerialization.ts` camera path through `sanitizeLoadedState`
- `src/tests/stores/cameraStore.test.ts`
- `src/tests/stores/presetManagerStore.test.ts` camera coverage points

### Findings
- No correctness defect found in camera ingress:
  - `cameraStore.applyState` and `normalizeCameraState` enforce strict finite `[number, number, number]` tuples for both `position` and `target`.
  - Malformed camera payloads from scene load are rejected by `applyState` and not applied.

### Residual note
- Integration coverage in `presetManagerStore.test.ts` is currently indirect for malformed camera payloads; core validator behavior is already covered directly in `cameraStore.test.ts`.

### Next Patrol Queue
- Continue load/preset hydration audit with focus on partial nested payload replacement risks in direct `setState` paths.

## Active Target
- PBR preset hydration completeness (partial nested face payloads)

## Task Queue Details
- [in_progress] Understand purpose of PBR preset hydration feature
- [pending] Analyze src/stores/pbrStore.ts and src/stores/slices/visual/pbrSlice.ts invariants
- [pending] Analyze src/stores/presetManagerStore.ts PBR load normalization path
- [pending] Analyze src/tests/stores/pbrStore.test.ts and presetManagerStore PBR coverage
- [pending] Trace style/scene load flow for partial pbr.face payloads
- [pending] Evaluate PBR hydration for nested field replacement risks
- [pending] Fix discovered PBR hydration issues
- [pending] Add or update tests for partial PBR load payloads
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: PBR Partial-Face Hydration Completeness (2026-02-21)

### Root-Cause Summary
- `normalizePbrLoadData` previously emitted only the subset of valid keys found in imported `pbr.face`.
- `usePBRStore.setState` performs shallow top-level merge; assigning `face` replaced the whole nested object.
- Result: importing partial `pbr.face` payloads could drop sibling fields (`metallic`, `specularIntensity`, `specularColor`) to `undefined`.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `preserves missing PBR face fields when imported payload is partial`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "preserves missing PBR face fields when imported payload is partial"`
- Result before fix: failed (`pbr.face.metallic` became `undefined`).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Updated `normalizePbrLoadData` to merge imported values with fallback `usePBRStore.getState().face` values.
  - For any present face field set, emits a complete `face` object with clamped/validated values.
  - Preserves sibling PBR fields when imported payload is partial.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "preserves missing PBR face fields when imported payload is partial"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/stores/cameraStore.test.ts`
  - Result: all pass (10 files, 170 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue preset/load hydration contract audit for nested payload replacement in remaining direct `setState` paths.

## Active Target
- Post-processing preset hydration whitelisting (unknown key ingress)

## Task Queue Details
- [in_progress] Understand purpose of post-processing preset hydration feature
- [pending] Analyze src/stores/postProcessingStore.ts and src/stores/slices/postProcessingSlice.ts invariants
- [pending] Analyze src/stores/presetManagerStore.ts normalizePostProcessingLoadData behavior
- [pending] Analyze src/tests/stores/postProcessingStore.test.ts and presetManagerStore coverage
- [pending] Trace style/scene load flow for unknown post-processing keys
- [pending] Evaluate post-processing hydration for state-shape pollution risks
- [pending] Fix discovered post-processing hydration issues
- [pending] Add or update tests for unknown-key post-processing payloads
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Post-Processing Unknown-Key Whitelisting (2026-02-21)

### Root-Cause Summary
- `normalizePostProcessingLoadData` sanitized known fields but returned a clone of the raw payload.
- Unknown imported keys remained and were applied via direct `usePostProcessingStore.setState(...)` during style/scene load.
- This allowed state-shape pollution from untrusted preset JSON.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `drops unknown imported style post-processing fields on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported style post-processing fields on load"`
- Result before fix: failed (`mysteryEffect` leaked into post-processing store state).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added `POST_PROCESSING_LOAD_KEYS` whitelist.
  - Updated `normalizePostProcessingLoadData` to return only whitelisted keys after normalization.
  - Unknown fields are now dropped before hydration.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported style post-processing fields on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/stores/cameraStore.test.ts`
  - Result: all pass (10 files, 171 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue hydration ingress hardening for remaining normalized domains (lighting/environment) to prevent unknown-key store pollution.

## Active Target
- Lighting preset hydration whitelisting (unknown key ingress)

## Task Queue Details
- [in_progress] Understand purpose of lighting preset hydration feature
- [pending] Analyze src/stores/lightingStore.ts and src/stores/slices/lightingSlice.ts invariants
- [pending] Analyze src/stores/presetManagerStore.ts normalizeLightingLoadData behavior
- [pending] Analyze src/tests/stores/lightingStore.test.ts and presetManagerStore coverage
- [pending] Trace style/scene load flow for unknown lighting keys
- [pending] Evaluate lighting hydration for state-shape pollution risks
- [pending] Fix discovered lighting hydration issues
- [pending] Add or update tests for unknown-key lighting payloads
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Lighting Unknown-Key Whitelisting (2026-02-21)

### Root-Cause Summary
- `normalizeLightingLoadData` sanitized known fields but returned a mutable clone of raw payload.
- Unknown imported keys survived and were applied via direct `useLightingStore.setState(...)` on style/scene load.
- This caused lighting store state-shape pollution from untrusted import data.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `drops unknown imported style lighting fields on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported style lighting fields on load"`
- Result before fix: failed (`mysteryLighting` leaked into lighting store state).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added `LIGHTING_LOAD_KEYS` whitelist.
  - Updated `normalizeLightingLoadData` to return only whitelisted canonical lighting fields.
  - Unknown keys are now dropped prior to hydration.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported style lighting fields on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/stores/cameraStore.test.ts`
  - Result: all pass (10 files, 172 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue hydration ingress hardening for remaining normalization domains (environment).

## Active Target
- Environment preset hydration whitelisting (unknown key ingress)

## Task Queue Details
- [in_progress] Understand purpose of environment preset hydration feature
- [pending] Analyze src/stores/environmentStore.ts and src/stores/slices/skyboxSlice.ts invariants
- [pending] Analyze src/stores/presetManagerStore.ts normalizeEnvironmentLoadData behavior
- [pending] Analyze src/tests/stores/environmentStore.test.ts and presetManagerStore coverage
- [pending] Trace style/scene load flow for unknown environment keys
- [pending] Evaluate environment hydration for state-shape pollution risks
- [pending] Fix discovered environment hydration issues
- [pending] Add or update tests for unknown-key environment payloads
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Environment Unknown-Key Whitelisting (2026-02-21)

### Root-Cause Summary
- `normalizeEnvironmentLoadData` used `...environment` in its return value, preserving unknown imported keys.
- Direct `useEnvironmentStore.setState(...)` then injected these keys into environment store state.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `drops unknown imported style environment fields on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported style environment fields on load"`
- Result before fix: failed (`mysteryEnvironment` leaked into environment state).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added `ENVIRONMENT_LOAD_KEYS` whitelist.
  - Updated `normalizeEnvironmentLoadData` to pick only whitelisted canonical environment keys before applying unified skybox derivation.
  - Unknown keys now dropped before hydration.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported style environment fields on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/stores/cameraStore.test.ts`
  - Result: all pass (10 files, 173 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue hydration ingress hardening for any remaining direct setState domains with broad payload acceptance.

## Active Target
- Appearance payload whitelisting (unknown key ingress)

## Task Queue Details
- [in_progress] Understand purpose of appearance payload whitelisting on preset load
- [pending] Analyze normalizeAppearanceLoadData output behavior for unknown keys
- [pending] Analyze appearance store field set for whitelist completeness
- [pending] Add fail-first regression for unknown appearance key ingress
- [pending] Fix appearance unknown-key hydration leak
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Appearance Unknown-Key Whitelisting (2026-02-21)

### Root-Cause Summary
- `normalizeAppearanceLoadData` validated/clamped known fields but returned a raw mutable clone.
- Unknown imported appearance keys survived and were applied via direct `useAppearanceStore.setState(...)`.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `drops unknown imported style appearance fields on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported style appearance fields on load"`
- Result before fix: failed (`mysteryAppearance` leaked into appearance state).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added `APPEARANCE_LOAD_KEYS` whitelist.
  - Updated `normalizeAppearanceLoadData` to return only canonical appearance keys post-normalization.
  - Unknown keys now dropped before hydration.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported style appearance fields on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/stores/cameraStore.test.ts`
  - Result: all pass (10 files, 174 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue load-path integrity review for remaining direct hydration domains not yet key-whitelisted.

## Active Target
- PBR payload whitelisting (unknown top-level key ingress)

## Task Queue Details
- [in_progress] Understand purpose of PBR payload whitelisting on preset load
- [pending] Analyze normalizePbrLoadData output behavior for unknown top-level keys
- [pending] Add fail-first regression for unknown PBR key ingress
- [pending] Fix PBR unknown-key hydration leak
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Scene Animation Unknown-Key Whitelisting (2026-02-21)

### Root-Cause Summary
- `normalizeAnimationLoadData` validated known fields but returned a clone of the raw payload.
- During `loadScene`, `useAnimationStore.setState(...)` consumed that object directly.
- Unknown imported keys leaked into animation store state shape (e.g., `mysteryAnimation`).

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `drops unknown imported scene animation fields on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported scene animation fields on load"`
- Result before fix: failed (`mysteryAnimation` remained in animation store state).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added `ANIMATION_LOAD_KEYS` whitelist.
  - Updated `normalizeAnimationLoadData` to return only canonical animation keys:
    - `speed`, `direction`, `isPlaying`, `accumulatedTime`, `animatingPlanes`
  - Unknown imported animation keys are now dropped before hydration.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported scene animation fields on load"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/stores/cameraStore.test.ts`
  - Result: all pass (10 files, 176 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Investigate extended configuration hydration for unknown-key ingress in `mergeExtendedObjectStateForType` / `deepMerge` path.

## Active Target
- Extended config payload whitelisting (unknown key ingress)

## Task Queue Details
- [in_progress] Understand purpose of extended config hydration invariants on scene load
- [pending] Analyze src/stores/utils/mergeWithDefaults.ts deepMerge semantics for unknown keys
- [pending] Analyze src/stores/extendedObjectStore.ts canonical state shape for loaded object type
- [pending] Analyze scene load path (`sanitizeExtendedLoadedState` + `mergeExtendedObjectStateForType` + `setState`)
- [pending] Add fail-first regression for unknown extended key ingress on scene load
- [pending] Fix extended hydration unknown-key leak
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Extended Config Unknown-Key Whitelisting (2026-02-21)

### Root-Cause Summary
- Scene load applies extended config using:
  - `sanitizeExtendedLoadedState(...)`
  - `mergeExtendedObjectStateForType(...)`
  - `useExtendedObjectStore.setState(...)`
- `deepMerge` in `mergeWithDefaults.ts` merged every key from loaded payload, including keys not present in defaults.
- Unknown imported keys under `extended.schroedinger` leaked into runtime store state shape.

### Fail-First Evidence
- Added regression in `src/tests/stores/presetManagerStore.test.ts`:
  - `drops unknown imported scene extended schroedinger fields on load`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "drops unknown imported scene extended schroedinger fields on load"`
- Result before fix: failed (`mysteryExtended` leaked into `schroedinger` config).

### Fix Implemented
- `src/stores/utils/mergeWithDefaults.ts`
  - Updated `deepMerge` to only merge keys present on defaults (recursive key whitelist by schema).
  - Unknown loaded keys are now dropped at all nested levels.
- Added utility regression in `src/tests/stores/utils/mergeWithDefaults.test.ts`:
  - `drops unknown loaded keys that are not part of defaults`

### Verification Evidence
- Focused verification:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/utils/mergeWithDefaults.test.ts`
  - Result: pass (2 files, 75 tests).
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/utils/mergeWithDefaults.test.ts src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/cameraStore.test.ts`
  - Result: all pass (13 files, 248 tests).
- Lint:
  - `npx eslint src/stores/utils/mergeWithDefaults.ts src/tests/stores/utils/mergeWithDefaults.test.ts src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Investigate scene rotation hydration for non-finite angle ingress (`typeof angle === 'number'` currently accepts `NaN`/`Infinity`).

## Active Target
- Scene rotation payload non-finite sanitization on load

## Task Queue Details
- [in_progress] Understand purpose of rotation hydration invariants on scene load
- [pending] Analyze src/stores/presetManagerStore.ts rotation import path
- [pending] Analyze src/stores/rotationStore.ts updateRotations invariant handling
- [pending] Add fail-first regression for non-finite rotation angles on scene load
- [pending] Implement fix to reject non-finite imported rotation values
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Missing-PBR Import Determinism (2026-02-21)

### Root-Cause Summary
- Import sanitization materializes absent PBR payloads as empty objects (`pbr: {}`) for legacy style/scene imports.
- `loadStyle` and `loadScene` previously treated any truthy `pbr` object as present and attempted partial hydration.
- `normalizePbrLoadData({})` yields no updates, so prior runtime PBR values persisted (stale state leak).

### Fail-First Evidence
- Added regressions in `src/tests/stores/presetManagerStore.test.ts`:
  - `resets PBR to defaults when loading imported style without pbr payload`
  - `resets PBR to defaults when loading imported scene without pbr payload`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "resets PBR to defaults when loading imported"`
- Result before fix: both failed (stale custom PBR values remained).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - In both `loadStyle` and `loadScene`, PBR load now:
    - Sanitizes payload to `stylePbrData` / `scenePbrData`
    - Applies normalized payload only when object is non-empty (`Object.keys(...).length > 0`)
    - Otherwise calls `usePBRStore.getState().resetPBR()`
- Result: legacy imports without PBR now hydrate deterministically to canonical defaults.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "resets PBR to defaults when loading imported"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/cameraStore.test.ts src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/stores/utils/mergeWithDefaults.test.ts src/tests/stores/utils/presetSerialization.test.ts`
  - Result: all pass (14 files, 256 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Rotation Target Note (no defect)
- Investigated non-finite rotation ingress during scene load.
- Conclusion: no correctness defect found; `rotationStore.updateRotations(...)` already ignores non-finite angles, and load flow resets then applies filtered updates.

### Next Patrol Queue
- Investigate duplicate import name handling for same-batch entries (styles/scenes).

## Active Target
- Import duplicate-name deduplication within the same batch

## Task Queue Details
- [in_progress] Understand import name uniqueness intent for styles/scenes
- [pending] Analyze importStyles/importScenes duplicate handling for intra-batch collisions
- [pending] Add fail-first regressions for same-batch duplicate names
- [pending] Implement robust unique-name generation for imported entries
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Intra-Batch Import Name Deduplication (2026-02-21)

### Root-Cause Summary
- `importStyles` / `importScenes` only checked duplicates against pre-existing saved names.
- During a single import batch with repeated names, later entries did not see names assigned earlier in the same batch.
- Result: duplicate imported names persisted (e.g., two `Batch Style`).

### Fail-First Evidence
- Added regressions in `src/tests/stores/presetManagerStore.test.ts`:
  - `deduplicates duplicate style names within the same import batch`
  - `deduplicates duplicate scene names within the same import batch`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "deduplicates duplicate"`
- Result before fix: both failed (second entries kept the same name).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added `makeUniqueImportedName(baseName, usedNames)` helper.
  - Updated `importStyles` and `importScenes` to:
    - track used names with a mutable `Set`
    - generate unique names incrementally per imported item
    - support suffix progression (`(imported)`, `(imported 2)`, ...)
    - normalize raw import name to string before dedupe logic

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "import duplicate handling"`
  - Result: pass (6 tests).
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/cameraStore.test.ts src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/stores/utils/mergeWithDefaults.test.ts src/tests/stores/utils/presetSerialization.test.ts`
  - Result: all pass (14 files, 258 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Investigate import validation consistency for whitespace-only names (save/rename forbid these; import currently accepts them).

## Active Target
- Import name validation consistency (whitespace-only style/scene names)

## Task Queue Details
- [in_progress] Understand naming invariants across save/rename/import flows
- [pending] Analyze importStyles/importScenes validation for trimmed-name enforcement
- [pending] Add fail-first regressions for whitespace-only imported names
- [pending] Implement fix to reject/normalize invalid imported names consistently
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: Import Whitespace-Name Validation Consistency (2026-02-21)

### Root-Cause Summary
- Save/rename flows reject empty or whitespace-only names.
- Import validation only required truthy `name`, so `'   '` passed validation and could create unusable imported presets.
- This created inconsistent naming invariants across lifecycle operations.

### Fail-First Evidence
- Added regressions in `src/tests/stores/presetManagerStore.test.ts`:
  - `should reject style import entries with whitespace-only names`
  - `should reject scene import entries with whitespace-only names`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "whitespace-only names"`
- Result before fix: both failed (imports incorrectly succeeded).

### Fix Implemented
- `src/stores/presetManagerStore.ts`
  - Added helper `isNonEmptyTrimmedString`.
  - Updated import validation (`importStyles` / `importScenes`) to require trimmed non-empty names.
  - Updated import processing to use trimmed names when deduplicating.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts -t "whitespace-only names"`
  - Result: pass.
- Related regression sweep:
  - `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/stores/pbrStore.test.ts src/tests/stores/animationStore.test.ts src/tests/stores/uiStore.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/lightingStore.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/stores/cameraStore.test.ts src/tests/stores/extendedObjectStore.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/stores/utils/mergeWithDefaults.test.ts src/tests/stores/utils/presetSerialization.test.ts`
  - Result: all pass (14 files, 260 tests).
- Lint:
  - `npx eslint src/stores/presetManagerStore.ts src/tests/stores/presetManagerStore.test.ts`
  - Result: pass.

### Next Patrol Queue
- Shift patrol to export planning: `src/lib/export/videoExportPlanning.ts`.

## Active Target
- videoExportPlanning numeric and duration invariants

## Task Queue Details
- [in_progress] Understand purpose and contracts of video export planning
- [pending] Analyze src/lib/export/videoExportPlanning.ts edge-case handling
- [pending] Analyze src/tests/lib/export/videoExportPlanning.test.ts coverage gaps
- [pending] Add fail-first regression if a real defect is found
- [pending] Implement focused fix and verify

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: videoExportPlanning Non-Finite Input Hardening (2026-02-21)

### Root-Cause Summary
- `computeRenderDimensions` used `maxTextureDimension2D` directly in limit math.
- Non-finite `maxTextureDimension2D` produced `safeLimit = NaN`, disabling clamp behavior and allowing oversized render dimensions.
- `computeSegmentDurationFrames` used raw `durationSeconds`/`fps`/`bitrateMbps` in arithmetic.
- Non-finite inputs produced `NaN` frame counts.

### Fail-First Evidence
- Added regressions in `src/tests/lib/export/videoExportPlanning.test.ts`:
  - `falls back to internal 8192 clamp when max texture limit is non-finite`
  - `returns a finite minimum frame count for non-finite timing inputs`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/videoExportPlanning.test.ts`
- Result before fix: both tests failed.

### Fix Implemented
- `src/lib/export/videoExportPlanning.ts`
  - `computeRenderDimensions` now sanitizes texture limit:
    - non-finite/non-positive `maxTextureDimension2D` falls back to `8192`.
  - `computeSegmentDurationFrames` now sanitizes all numeric inputs:
    - `durationSeconds`, `fps`, `bitrateMbps`, `targetSegmentMB`, `minSegmentSeconds`
    - guarantees finite, bounded frame output with minimum `1`.

### Verification Evidence
- Targeted file:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass (11 tests).
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/videoExportPlanning.test.ts src/tests/lib/export/video.test.ts src/tests/stores/exportStore.test.ts`
  - Result: all pass (3 files, 128 tests).
- Lint:
  - `npx eslint src/lib/export/videoExportPlanning.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue export module patrol in `src/lib/export/video.ts` for timing/duration edge-case guards.

## Active Target
- Video recorder timing/duration invariant checks

## Task Queue Details
- [in_progress] Understand `VideoRecorder` timing contracts and frame add path
- [pending] Analyze src/lib/export/video.ts non-finite guard coverage
- [pending] Analyze src/tests/lib/export/video.test.ts for uncovered edge cases
- [pending] Add fail-first regression if defect found
- [pending] Implement fix and verify

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: VideoRecorder Progress Guard Hardening (2026-02-21)

### Root-Cause Summary
- `VideoRecorder.captureFrame` computed progress as `Math.min(timestamp / totalDuration, 0.99)`.
- This only upper-clamped progress and did not sanitize invalid duration/timestamp values.
- Negative timestamps produced negative progress; non-finite duration produced non-finite progress.

### Fail-First Evidence
- Added regressions in `src/tests/lib/export/video.test.ts`:
  - `should clamp progress to a minimum of 0 for negative timestamps`
  - `should report finite progress when total duration is non-finite`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/video.test.ts -t "progress"`
- Result before fix: both failed.

### Fix Implemented
- `src/lib/export/video.ts`
  - Progress reporting now:
    - validates `options.duration` (`finite && > 0`)
    - returns progress `0` when duration is invalid
    - clamps valid progress to `[0, 0.99]`
    - falls back to `0` if computed progress is non-finite

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/video.test.ts -t "progress"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts src/tests/stores/exportStore.test.ts`
  - Result: all pass (3 files, 130 tests).
- Lint:
  - `npx eslint src/lib/export/video.ts src/tests/lib/export/video.test.ts src/lib/export/videoExportPlanning.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue export patrol in image export path (`src/lib/export/image.ts`) for dimension/scale edge cases.

## Active Target
- Image export scale/dimension invariants

## Task Queue Details
- [in_progress] Understand image export scaling contract and output dimensions
- [pending] Analyze src/lib/export/image.ts edge-case handling
- [pending] Analyze src/tests/lib/export/image.test.ts (or nearest coverage) for gaps
- [pending] Add fail-first regression if defect is found
- [pending] Implement fix and verify

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: getRecommendedBitrate Runtime-Safety Hardening (2026-02-21)

### Root-Cause Summary
- `getRecommendedBitrate` assumed valid enum resolution and finite `fps`.
- Runtime-corrupted values (e.g., `fps = NaN`, unknown resolution string) produced `NaN` bitrates.
- This could propagate invalid bitrate values to export planning paths.

### Fail-First Evidence
- Added regressions in `src/tests/stores/exportStore.test.ts`:
  - `returns finite bitrate for non-finite fps input`
  - `falls back to a safe base bitrate for unknown runtime resolution values`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "getRecommendedBitrate"`
- Result before fix: both failed.

### Fix Implemented
- `src/stores/exportStore.ts` (`getRecommendedBitrate`):
  - Sanitizes `fps` (fallback to 30 if invalid)
  - Guards runtime `resolution` key with safe fallback to `'1080p'`
  - Applies custom-dimension scaling only when width/height are finite positive numbers
  - Returns finite fallback (`12`) if intermediate bitrate math is non-finite

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "getRecommendedBitrate"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (3 files, 132 tests).
- Lint:
  - `npx eslint src/stores/exportStore.ts src/tests/stores/exportStore.test.ts src/lib/export/video.ts src/tests/lib/export/video.test.ts src/lib/export/videoExportPlanning.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass.

### Next Patrol Queue
- Harden `updateSettings` crop patch sanitization for non-finite and out-of-range values.

## Active Target
- exportStore crop patch sanitization

## Task Queue Details
- [in_progress] Understand crop invariants and updateSettings merge behavior
- [pending] Add fail-first regression for non-finite crop patch ingestion
- [pending] Implement crop patch sanitization (ignore non-finite, clamp finite ranges)
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: exportStore Crop Patch Sanitization (2026-02-21)

### Root-Cause Summary
- `updateSettings` deep-merged crop patches without numeric validation.
- Non-finite crop updates (e.g., `x: NaN`, `width: Infinity`) polluted persisted store state.
- Out-of-range finite crop values were not normalized to `[0,1]`.

### Fail-First Evidence
- Added regression in `src/tests/stores/exportStore.test.ts`:
  - `ignores non-finite crop patch values while clamping finite ranges`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "crop patch values"`
- Result before fix: failed (`crop.x` became `NaN`).

### Fix Implemented
- `src/stores/exportStore.ts` (`updateSettings`):
  - Added crop patch sanitization path:
    - ignore non-finite numeric updates for `x`, `y`, `width`, `height`
    - clamp finite values into `[0,1]`
    - ignore non-boolean `crop.enabled`

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "crop patch values"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (3 files, 133 tests).
- Lint:
  - `npx eslint src/stores/exportStore.ts src/tests/stores/exportStore.test.ts src/lib/export/video.ts src/tests/lib/export/video.test.ts src/lib/export/videoExportPlanning.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass.

### Next Patrol Queue
- Harden `textOverlay` patch ingestion in `updateSettings` (non-finite numeric fields and out-of-range clamps).

## Active Target
- exportStore text overlay patch sanitization

## Task Queue Details
- [in_progress] Understand text overlay numeric invariants and valid ranges
- [pending] Add fail-first regression for non-finite/out-of-range text overlay patches
- [pending] Implement text overlay sanitization in updateSettings
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: exportStore Text Overlay Patch Sanitization (2026-02-21)

### Root-Cause Summary
- `updateSettings` merged `textOverlay` patches without validation.
- Invalid values (non-finite numbers, out-of-range opacity/weight/padding, invalid placement enums) could leak into persisted overlay settings.

### Fail-First Evidence
- Added regression in `src/tests/stores/exportStore.test.ts`:
  - `sanitizes textOverlay patch values to maintain runtime-safe ranges`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "textOverlay patch values"`
- Result before fix: failed (`opacity` remained `-0.5`, invalid fields were not sanitized).

### Fix Implemented
- `src/stores/exportStore.ts` (`updateSettings`):
  - Added textOverlay patch sanitization:
    - numeric fields finite-check + clamps
    - `fontWeight` rounded/clamped to `[100, 900]`
    - `opacity` clamped to `[0, 1]`
    - `fontSize >= 1`, `padding >= 0`, `shadowBlur >= 0`
    - invalid enum values for placement are dropped
    - non-string text/color/font fields are dropped
    - non-boolean `enabled` is dropped

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "textOverlay patch values"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (3 files, 134 tests).
- Lint:
  - `npx eslint src/stores/exportStore.ts src/tests/stores/exportStore.test.ts src/lib/export/video.ts src/tests/lib/export/video.test.ts src/lib/export/videoExportPlanning.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue exportStore hardening on custom dimension normalization (float/invalid shape protection for `customWidth/customHeight`).

## Active Target
- exportStore custom dimension normalization

## Task Queue Details
- [in_progress] Understand custom dimension constraints expected by encoder/planner
- [pending] Add fail-first regression for float/invalid custom dimension ingestion
- [pending] Implement dimension normalization to safe integer bounds
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: exportStore Custom Dimension Normalization (2026-02-21)

### Root-Cause Summary
- `updateSettings` accepted any finite positive `customWidth/customHeight` values.
- Non-integer and excessively large values propagated directly into settings.
- This increased risk of unstable encoder/planner behavior and oversized canvas allocations.

### Fail-First Evidence
- Added regression in `src/tests/stores/exportStore.test.ts`:
  - `normalizes custom dimensions to safe integer bounds`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "custom dimensions to safe integer bounds"`
- Result before fix: failed (`customWidth` remained `100000.9`).

### Fix Implemented
- `src/stores/exportStore.ts` (`updateSettings`):
  - Added normalization for `customWidth/customHeight` after finite-positive validation:
    - round to integer
    - clamp to `[2, 8192]`

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "custom dimensions to safe integer bounds"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (3 files, 135 tests).
- Lint:
  - `npx eslint src/stores/exportStore.ts src/tests/stores/exportStore.test.ts src/lib/export/video.ts src/tests/lib/export/video.test.ts src/lib/export/videoExportPlanning.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass.

### Next Patrol Queue
- Continue exportStore numeric contract hardening for `warmupFrames` integer semantics.

## Active Target
- exportStore warmupFrames normalization

## Task Queue Details
- [in_progress] Understand expected warmup frame semantics (integer frame count)
- [pending] Add fail-first regression for non-integer warmupFrames patch
- [pending] Implement warmupFrames integer normalization
- [pending] Run targeted verification (vitest + eslint)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

## Iteration Update: exportStore Warmup Frames Normalization (2026-02-21)

### Root-Cause Summary
- `updateSettings` only rejected invalid `warmupFrames` values but did not normalize finite decimals.
- Fractional warmup counts leaked into settings even though warmup is consumed as a frame count.

### Fail-First Evidence
- Added regression in `src/tests/stores/exportStore.test.ts`:
  - `normalizes warmupFrames to a non-negative integer`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "warmupFrames"`
- Result before fix: failed (`7.8` persisted, expected integer normalization).

### Fix Implemented
- `src/stores/exportStore.ts` (`updateSettings`):
  - finite non-negative `warmupFrames` now normalized with `Math.round` and clamped to `>= 0`.
  - invalid/non-finite/negative values continue to be rejected.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "warmupFrames"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass.

## Iteration Update: exportStore Runtime Enum Sanitization (2026-02-21)

### Root-Cause Summary
- `updateSettings` accepted runtime-invalid enum values (`format`, `codec`, `resolution`, `bitrateMode`, `hardwareAcceleration`, `rotation`) and merged them into persisted settings.
- TypeScript unions did not protect runtime payloads from casts/imported data.

### Fail-First Evidence
- Added regression in `src/tests/stores/exportStore.test.ts`:
  - `rejects invalid runtime enum patches and preserves existing values`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "rejects invalid runtime enum patches"`
- Result before fix: failed (`format` changed to `avi`).

### Fix Implemented
- `src/stores/exportStore.ts` (`updateSettings`):
  - added runtime validation and rejection for:
    - `format`: `mp4 | webm`
    - `codec`: `avc | hevc | vp9 | av1`
    - `resolution`: `720p | 1080p | 4k | custom`
    - `bitrateMode`: `constant | variable`
    - `hardwareAcceleration`: `no-preference | prefer-hardware | prefer-software`
    - `rotation`: `0 | 90 | 180 | 270`

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "rejects invalid runtime enum patches"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass.
- Lint:
  - `npx eslint src/stores/exportStore.ts src/tests/stores/exportStore.test.ts`
  - Result: pass.

## Iteration Update: VideoRecorder Rotation Defense in Depth (2026-02-21)

### Root-Cause Summary
- `VideoRecorder.initialize` forwarded `options.rotation` directly using nullish fallback only.
- Runtime invalid rotation values (e.g. `45`) propagated into track metadata.

### Fail-First Evidence
- Added regression in `src/tests/lib/export/video.test.ts`:
  - `coerces invalid runtime rotation metadata to 0 degrees`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/video.test.ts -t "coerces invalid runtime rotation metadata"`
- Result before fix: failed (received `45`, expected `0`).

### Fix Implemented
- `src/lib/export/video.ts` (`initialize`):
  - added `normalizedRotation` guard to allow only `0 | 90 | 180 | 270`, fallback `0`.
  - `addVideoTrack` now uses `normalizedRotation`.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/video.test.ts -t "coerces invalid runtime rotation metadata"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (3 files, 138 tests).
- Lint:
  - `npx eslint src/stores/exportStore.ts src/lib/export/video.ts src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts`
  - Result: pass.

## Next Patrol Queue
- Continue export pipeline defense-in-depth by validating persisted export settings rehydration path (`persist.merge`) against runtime-invalid payloads.

## Iteration Update: exportStore Persist Rehydration Sanitization (2026-02-21)

### Root-Cause Summary
- `persist.merge` deep-merged persisted settings into defaults without runtime validation.
- Corrupted localStorage payloads bypassed `updateSettings` guards and injected invalid enums/types/ranges directly into active settings.

### Fail-First Evidence
- Added regression in `src/tests/stores/exportStore.test.ts`:
  - `sanitizes invalid persisted export settings on rehydrate`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "sanitizes invalid persisted export settings on rehydrate"`
- Result before fix: failed (`format` hydrated as `avi` instead of safe fallback).

### Fix Implemented
- `src/stores/exportStore.ts`:
  - Added shared runtime guard helpers (`isExportFormat`, `isVideoCodec`, `isExportResolution`, `isBitrateMode`, `isHardwareAcceleration`, `isRotation`, numeric clamps).
  - Added `sanitizeHydratedTextOverlay`, `sanitizeHydratedCrop`, and `sanitizeHydratedSettings` to enforce full settings contracts during hydration.
  - Updated `persist.merge` to route through `sanitizeHydratedSettings` instead of raw deep merge.
  - Aligned `updateSettings` enum checks to use shared guard helpers.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "sanitizes invalid persisted export settings on rehydrate"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (3 files, 139 tests).
- Lint:
  - `npx eslint src/stores/exportStore.ts src/tests/stores/exportStore.test.ts src/lib/export/video.ts src/tests/lib/export/video.test.ts`
  - Result: pass.

## Next Patrol Queue
- Continue export path patrol for additional runtime contract gaps around recorder init inputs and cross-store call sites.

## Iteration Update: VideoRecorder Numeric Input Validation (2026-02-21)

### Root-Cause Summary
- `VideoRecorder.initialize` accepted runtime-invalid numeric options for width/height/fps/bitrate.
- This allowed unsafe encoder setup values to flow into composition canvas dimensions and MediaBunny config.

### Fail-First Evidence
- Added regression in `src/tests/lib/export/video.test.ts`:
  - `rejects non-positive numeric runtime options during initialize`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/video.test.ts -t "rejects non-positive numeric runtime options"`
- Result before fix: failed (initialize resolved instead of rejecting invalid values).

### Fix Implemented
- `src/lib/export/video.ts` (`initialize`):
  - Added runtime validation for positive-finite `width`, `height`, `fps`, `bitrate`.
  - Width/height are normalized to integer `>=2`.
  - Added runtime normalization/fallbacks for `format`, `codec`, `bitrateMode`, `hardwareAcceleration`.
  - Reused sanitized values for composition canvas sizing, encoder config, and track frameRate.
- Kept existing non-finite duration progress fallback behavior by not adding strict duration rejection in initialize.

### Verification Evidence
- Targeted regressions:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/video.test.ts -t "rejects non-positive numeric runtime options"`
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/video.test.ts -t "should report finite progress when total duration is non-finite|rejects non-positive numeric runtime options"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (3 files, 140 tests).
- Lint:
  - `npx eslint src/stores/exportStore.ts src/lib/export/video.ts src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts`
  - Result: pass.

## Next Patrol Queue
- Continue export pipeline patrol around cross-store caller contracts (WebGPUScene export start path) for additional runtime-defense opportunities.

## Iteration Update: exportStore Bitrate Contract Alignment (2026-02-21)

### Root-Cause Summary
- Export UI constrains bitrate to `[2, 100]` Mbps, but store runtime paths accepted any positive bitrate.
- This mismatch allowed out-of-contract values via runtime patches or corrupted persisted state.

### Fail-First Evidence
- Added regression in `src/tests/stores/exportStore.test.ts`:
  - `clamps bitrate updates to the supported [2, 100] Mbps range`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "clamps bitrate updates to the supported"`
- Result before fix: failed (`0.5` persisted instead of clamping to `2`).

### Fix Implemented
- `src/stores/exportStore.ts`:
  - `updateSettings`: after finite-positive validation, clamp `bitrate` to `[2, 100]`.
  - `sanitizeHydratedSettings`: clamp persisted `bitrate` to `[2, 100]` when finite/positive.

### Verification Evidence
- Targeted regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts -t "clamps bitrate updates to the supported"`
  - Result: pass.
- Related export regression:
  - `npx vitest run --maxWorkers=4 src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (3 files, 141 tests).
- Lint:
  - `npx eslint src/stores/exportStore.ts src/lib/export/video.ts src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts`
  - Result: pass.

## Next Patrol Queue
- Continue export pipeline patrol around WebGPUScene export-start boundary checks for runtime-invalid enum payloads sourced outside store updates.

## Active Target
- Export module runtime contracts (`src/lib/export`)

## Task Queue Details
- [in_progress] Understand purpose of export module (`src/lib/export`)
- [pending] Analyze `src/lib/export/index.ts`
- [pending] Analyze `src/lib/export/videoExportPlanning.ts`
- [pending] Analyze `src/lib/export/video.ts`
- [pending] Analyze `src/lib/export/image.ts`
- [pending] Trace export planner -> recorder init flow
- [pending] Evaluate export module behavior vs intended purpose

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

### Purpose Findings: Export module runtime contracts (`src/lib/export`)
- Intended behavior from UI + architecture:
  - Export feature supports screenshots and videos from the WebGPU canvas (`docs/architecture.md`, `src/components/overlays/ExportModal.tsx`).
  - Video export modes have explicit semantics: `in-memory` for short exports, `stream` direct-to-disk (Chromium), `segmented` multi-file fallback for large exports (`src/components/overlays/ExportModal.tsx`).
  - Core module responsibility split:
    - `image.ts`: screenshot/export image path
    - `videoExportPlanning.ts`: deterministic dimension/segment planning
    - `video.ts`: MediaBunny/WebCodecs recording/composition lifecycle
    - `index.ts`: barrel exports for module boundary
- Contract expectation for this patrol:
  - Runtime-invalid values must be sanitized or rejected before encoder/planner side effects.
  - Planner and recorder should remain deterministic and finite across non-ideal runtime inputs.

### Analysis: `src/lib/export/index.ts`
- File role: thin module boundary barrel for image exports only (`exportSceneToPNG`, `generateTimestampFilename`, and `ExportOptions` type).
- Runtime logic: none.
- Risk notes: `video.ts` / `videoExportPlanning.ts` are intentionally not re-exported here; this appears deliberate and not a defect.

### Analysis: `src/lib/export/videoExportPlanning.ts`
- Exports 4 core planner functions used by `WebGPUScene.startExport`.
- Call sites verified via references:
  - `resolveExportDimensions` -> export preset dimensions mapping.
  - `ensureEvenDimensions` -> codec-friendly even dimensions.
  - `computeRenderDimensions` -> crop-aware internal render size with texture-limit clamp.
  - `computeSegmentDurationFrames` -> segmented-mode frame budgeting.
- Current finite-safety hardening is present for texture limits and timing inputs; planner returns bounded finite values under non-finite inputs.
- No new defect identified in this file during this pass.

### Analysis: `src/lib/export/video.ts`
- `VideoRecorder` lifecycle reviewed end-to-end: `initialize` -> `captureFrame` -> `finalize/cancel` -> `dispose`.
- Recent hardening is active:
  - runtime validation for width/height/fps/bitrate and enum-like recorder options during `initialize`.
  - progress guard returns finite clamped values.
  - rotation metadata normalized to allowed discrete set.
- Remaining risk noted for evaluation:
  - `initialize` validates width/height > 0 but currently does not upper-bound them. Direct runtime callers outside store contracts can request extremely large composition dimensions, risking memory pressure spikes.

### Analysis: `src/lib/export/image.ts`
- `exportSceneToPNG` delegates to async screenshot capture and opens screenshot modal; returns initiation status only.
- Error handling routes capture failures through MsgBox and includes CORS-specific message for `SecurityError`.
- `generateTimestampFilename` currently truncates to second precision (`toISOString().slice(0, 19)`), so rapid same-second calls can collide.
- Candidate issue for evaluation:
  - filename collisions possible for repeated export triggers in the same second, reducing determinism for downstream save flows.

### Trace: export planner -> recorder init flow
- Flow path:
  - `WebGPUScene.startExport` clones store settings, resolves runtime mode, validates fps/duration/bitrate, computes export/render dimensions (`resolveExportDimensions` -> `ensureEvenDimensions` -> `computeRenderDimensions`).
  - Runtime loop initialized with warmup + optional preview + recording phases; segmented mode derives chunk size via `computeSegmentDurationFrames`.
  - `VideoRecorder` is initialized per phase/segment with settings snapshot (format/codec/bitrate/hardware/crop/text/rotation).
  - `processExportBatch` advances animation, captures frames, updates progress/ETA, finalizes outputs, and triggers downloads.
- Decision points and failure handling:
  - Stream mode gated by File System Access API and picker abort handling.
  - Abort requests short-circuit all phases and restore runtime state.
  - Recorder init/finalize/capture errors bubble to `handleExportError`.
- Additional user-facing mismatch found outside planner/recorder chain:
  - `exportSceneToPNG` initiates async capture but returns `true` immediately, so synchronous success checks at call sites can report optimistic status even when capture eventually fails.

### Evaluation: export module vs intended behavior
- Module generally matches intended architecture and runtime flow.
- Confirmed defect:
  - `exportSceneToPNG` always returns `true` before async capture completes.
  - `ExportButton` uses this return value to show optimistic "Opening screenshot preview..." toast.
  - On async capture failure, user receives contradictory success-like toast followed by error modal.
- Impact:
  - misleading UX and inconsistent status signaling for screenshot export failures.

## Issues Found
- [open] `exportSceneToPNG` optimistic success boolean is not tied to async capture outcome.
  - Location: `src/lib/export/image.ts` and caller feedback path `src/components/controls/ExportButton.tsx`.
  - User-visible effect: success-style toast can appear even when capture fails.

## Iteration Update: PNG Export Async Result Contract (2026-02-21)

### Root-Cause Summary
- `exportSceneToPNG` initiated async capture but returned `true` immediately.
- `ExportButton` consumed this boolean for user feedback, causing optimistic success-style toast even when capture later failed.

### Fail-First Evidence
- Added regression in `src/tests/lib/export/image.test.ts`:
  - `returns false when async screenshot capture fails`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/image.test.ts -t "returns false when async screenshot capture fails"`
- Result before fix: failed (`true` returned on failure).

### Fix Implemented
- `src/lib/export/image.ts`:
  - changed `exportSceneToPNG` to `async` and return `Promise<boolean>` bound to real capture outcome.
  - returns `true` on successful capture + modal open.
  - returns `false` on capture failure after showing error MsgBox.
- `src/components/controls/ExportButton.tsx`:
  - `await` export result before deciding toast feedback.
  - added missing JSDoc on props/component to satisfy file-level lint.

### Verification Evidence
- Targeted image tests:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/image.test.ts`
  - Result: pass.
- Related export regression suite:
  - `npx vitest run --maxWorkers=4 src/tests/lib/export/image.test.ts src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (4 files, 145 tests).
- Lint (touched files):
  - `npx eslint src/lib/export/image.ts src/components/controls/ExportButton.tsx src/tests/lib/export/image.test.ts`
  - Result: pass.

## Issues Fixed
- [fixed] `exportSceneToPNG` optimistic success boolean was not tied to async capture outcome.
  - Updated async result contract and caller feedback handling.

## Active Target
- Export overlay UI module (`src/components/overlays/export`)

## Task Queue Details
- [in_progress] Understand purpose of export overlay UI module (`src/components/overlays/export`)
- [pending] Analyze `src/components/overlays/export/ExportPreview.tsx`
- [pending] Analyze `src/components/overlays/export/ExportGeneralTab.tsx`
- [pending] Analyze `src/components/overlays/export/ExportAdvancedTab.tsx`
- [pending] Analyze `src/components/overlays/export/ExportTextTab.tsx`
- [pending] Analyze `src/components/overlays/export/ExportPresets.tsx`
- [pending] Trace export modal tabs -> store update flow
- [pending] Evaluate export overlay UI behavior vs intended purpose

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

### Purpose Findings: Export overlay UI module (`src/components/overlays/export`)
- Intended role: provide the user-facing control surface for configuring video export settings and preview composition before export starts.
- UX split by tabs:
  - `Presets`: one-click setting bundles.
  - `Settings/General`: format, resolution, fps, duration, crop toggles/editor entry.
  - `Text`: overlay text and placement controls.
  - `Advanced`: bitrate/codec/encoder options.
  - `Preview`: mobile-focused composition preview.
- Store contract:
  - UI updates are expected to flow through `useExportStore.updateSettings` and remain deterministic under user interaction.

### Analysis: `src/components/overlays/export/ExportPreview.tsx`
- Purpose: visual preview of crop frame and text overlay placement over captured screenshot.
- Key behavior:
  - derives preview scale from crop box width vs export width.
  - renders crop mask and text overlay positioning markers.
- Observation:
  - hardcoded preview text font family (`Inter`) instead of `textOverlay.fontFamily` (minor fidelity mismatch if fontFamily diverges from default).

### Analysis: `src/components/overlays/export/ExportGeneralTab.tsx`
- Purpose: core export settings editor (container/resolution/custom dims/fps/duration/crop controls).
- Uses `updateSettings` for all mutations and opens crop editor via store actions.
- Noted duplicated codec-support probing logic (also in advanced tab); architectural duplication, not immediate correctness defect.

### Analysis: `src/components/overlays/export/ExportAdvancedTab.tsx`
- Purpose: bitrate/codec/hardware/bitrate mode controls.
- Bitrate slider contract `[2,100]` aligns with hardened store clamp.
- Same codec-support probing duplication as general tab.

### Analysis: `src/components/overlays/export/ExportTextTab.tsx`
- Purpose: configure text overlay content/style/placement and drive nested `textOverlay` patches.
- All updates route through store patching, now safeguarded by runtime sanitization in `updateSettings`.

### Analysis: `src/components/overlays/export/ExportPresets.tsx`
- Purpose: preset picker UI for one-click export configurations.
- Confirmed correctness issue:
  - `PresetCard` supports active visual state but `ExportPresets` always passes `isActive={false}`.
  - Result: no preset is ever visually selected, despite selectable behavior and active-state styling code.

### Trace: export modal tabs -> store update flow
- `ExportModal` hosts tab content and drives export lifecycle start.
- Tab mutation paths:
  - `ExportPresets.handleSelect` -> `useExportStore.applyPreset` -> `updateSettings`.
  - `ExportGeneralTab` / `ExportAdvancedTab` / `ExportTextTab` -> direct `updateSettings` patches.
  - `ExportPreview` is read-only and reflects current settings + screenshot preview.
- Mode override controls (`in-memory`/`stream`/`segmented`) are applied via `setExportModeOverride` and consumed at export start.
- Confirmed UI-state defect in traced path:
  - preset cards never receive active state (`isActive={false}` hardcoded), so selected preset has no visual feedback.

### Evaluation: export overlay UI vs intended behavior
- Overall tab-to-store wiring is coherent and aligned with modal lifecycle.
- Confirmed defect for immediate fix:
  - preset grid cannot indicate current selection because `ExportPresets` always passes `isActive={false}`.
  - active styling/check icon paths are effectively dead UI code.

## Issues Found
- [open] Export preset selection has no active visual feedback.
  - Location: `src/components/overlays/export/ExportPresets.tsx`.
  - Impact: users cannot tell which preset is currently applied; increases misconfiguration risk.

## Iteration Update: Export Preset Active-State Feedback (2026-02-21)

### Root-Cause Summary
- `ExportPresets` rendered all cards with `isActive={false}`.
- Active styling and check icon were never shown, even when settings matched a preset.

### Fail-First Evidence
- Added component regression in `src/tests/components/overlays/export/ExportPresets.test.tsx`:
  - `shows one active preset indicator for matching current settings`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/components/overlays/export/ExportPresets.test.tsx`
- Result before fix: failed (0 active indicators).

### Fix Implemented
- `src/components/overlays/export/ExportPresets.tsx`:
  - Added preset matching contracts (`PRESET_MATCHERS`) aligned with store preset definitions.
  - Added `isPresetActive` matcher against current `settings` (including crop enabled-state semantics).
  - Derived `activePresetId` and passed `isActive={p.id === activePresetId}` to `PresetCard`.

### Verification Evidence
- Targeted preset component test:
  - `npx vitest run --maxWorkers=4 src/tests/components/overlays/export/ExportPresets.test.tsx`
  - Result: pass.
- Related export UI + export runtime regression suite:
  - `npx vitest run --maxWorkers=4 src/tests/components/overlays/export/ExportPresets.test.tsx src/tests/components/overlays/ExportModal.test.tsx src/tests/lib/export/image.test.ts src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (6 files, 149 tests).
- Lint:
  - `npx eslint src/tests/components/overlays/export/ExportPresets.test.tsx src/lib/export/image.ts src/components/controls/ExportButton.tsx src/tests/lib/export/image.test.ts`
  - Result: pass.
  - `npx eslint src/components/overlays/export/ExportPresets.tsx` currently fails on pre-existing project-rule violations unrelated to this change (direct asset imports + raw button usage in baseline component).

## Issues Fixed
- [fixed] Export preset selection had no active visual feedback.

## Active Target
- Export text overlay preview/runtime parity

## Task Queue Details
- [in_progress] Understand purpose of export text overlay preview/runtime parity
- [pending] Analyze `src/components/overlays/export/ExportPreview.tsx`
- [pending] Analyze `src/lib/export/video.ts`
- [pending] Trace text overlay settings flow (TextTab -> Preview -> Recorder)
- [pending] Evaluate parity behavior and fix confirmed mismatch(es)

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

### Purpose Findings: Export text overlay preview/runtime parity
- Intended behavior: text overlay controls should produce a preview that faithfully represents encoded output placement and styling.
- Source of truth:
  - `ExportTextTab` edits `settings.textOverlay`.
  - `ExportPreview` visualizes this config pre-export.
  - `VideoRecorder.captureFrame` renders final overlay onto composed frames during export.
- Parity requirement for this target:
  - preview and recorder should consume the same relevant text style fields (font, size/weight, spacing, opacity, shadow, placement).

### Analysis: `src/components/overlays/export/ExportPreview.tsx`
- Preview applies most `textOverlay` fields (placement, size, weight, spacing, opacity, shadow).
- Confirmed parity mismatch candidate:
  - preview hardcodes `fontFamily: 'Inter, sans-serif'` instead of using `textOverlay.fontFamily`.
- Potential impact:
  - preview typography can diverge from encoded video when non-default fontFamily is present.

### Analysis: `src/lib/export/video.ts` (text overlay parity focus)
- Recorder text overlay renderer uses `textOverlay.fontFamily` in final encoded output (`ctx.font = ... ${fontFamily}`).
- Therefore preview/runtime mismatch is confirmed: preview hardcodes font family while recorder respects configured family.

### Trace: text overlay settings flow (TextTab -> Preview -> Recorder)
- `ExportTextTab` patches `settings.textOverlay` via `updateSettings` on every control change.
- `ExportPreview` reads `settings.textOverlay` and renders preview typography/placement.
- `WebGPUScene` passes the same `settings.textOverlay` object to `VideoRecorder` for encode-time composition.
- `VideoRecorder.captureFrame` uses `textOverlay.fontFamily`; `ExportPreview` currently does not.
- Confirmed mismatch is in preview layer only.

### Evaluation: text overlay preview/runtime parity
- Confirmed defect:
  - preview typography is not fully faithful to exported video when `fontFamily` deviates from default.
  - root cause: preview hardcoded font family.

## Issues Found
- [open] Export preview hardcodes text overlay font family, diverging from recorder output.
  - Location: `src/components/overlays/export/ExportPreview.tsx`.
  - Impact: users may approve typography in preview that differs in final video.

## Iteration Update: Export Text Overlay Font Parity (2026-02-21)

### Root-Cause Summary
- Preview text renderer hardcoded `fontFamily: 'Inter, sans-serif'`.
- Encoder path (`VideoRecorder`) uses `textOverlay.fontFamily`.
- Result: preview typography could diverge from final encoded output.

### Fail-First Evidence
- Added regression in `src/tests/components/overlays/export/ExportPreview.test.tsx`:
  - `uses textOverlay.fontFamily when rendering preview text`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/components/overlays/export/ExportPreview.test.tsx`
- Result before fix: failed (preview font remained Inter).

### Fix Implemented
- `src/components/overlays/export/ExportPreview.tsx`:
  - switched preview text style to `fontFamily: textOverlay.fontFamily || 'Inter, sans-serif'`.

### Verification Evidence
- Targeted preview test:
  - `npx vitest run --maxWorkers=4 src/tests/components/overlays/export/ExportPreview.test.tsx`
  - Result: pass.
- Related export + overlay regression suite:
  - `npx vitest run --maxWorkers=4 src/tests/components/overlays/export/ExportPreview.test.tsx src/tests/components/overlays/export/ExportPresets.test.tsx src/tests/components/overlays/ExportModal.test.tsx src/tests/lib/export/image.test.ts src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: all pass (7 files, 150 tests).
- Lint:
  - `npx eslint src/components/overlays/export/ExportPreview.tsx src/tests/components/overlays/export/ExportPreview.test.tsx`
  - Result: pass.

## Issues Fixed
- [fixed] Export preview font family diverged from final recorder output.

## Active Target
- ExportPresets style-rule compliance with behavior parity

## Task Queue Details
- [in_progress] Understand purpose of ExportPresets style-rule compliance target
- [pending] Analyze `src/components/overlays/export/ExportPresets.tsx`
- [pending] Analyze relevant UI primitives for compliant replacement patterns (`Button`, icon handling)
- [pending] Trace preset card interaction + asset rendering flow
- [pending] Evaluate and implement scoped compliance fixes with regression coverage

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

### Purpose Findings: ExportPresets style-rule compliance
- Project lint rules enforce:
  - no direct asset imports outside `src/components/ui/` (`project-rules/no-direct-asset-imports`).
  - no raw HTML form controls outside UI primitives (`project-rules/no-raw-html-controls`).
- Target objective:
  - keep `ExportPresets` behavior (preset selection + active indicator) while removing lint violations via compliant UI-layer abstractions.

### Analysis: `src/components/overlays/export/ExportPresets.tsx` (compliance focus)
- Current lint violations in this file:
  - direct asset imports for preset icons.
  - raw `<button>` usage in `PresetCard`.
- Behavioral constraints to preserve:
  - hover sound on preset card hover.
  - click sound + `applyPreset(id)` on selection.
  - active-state rendering added in previous iteration.

### Analysis: relevant UI primitives
- `Button` primitive already encapsulates raw button control and built-in hover/click sounds.
- `Icon` primitive demonstrates approved pattern for asset imports inside `src/components/ui/`.
- Compliance strategy should relocate raw control + direct asset import responsibilities into UI layer abstractions.

### Trace: preset card interaction + asset rendering flow
- `ExportPresets` maps preset definitions -> card component.
- Card renders asset icon and emits hover/click effects.
- Click path updates store via `applyPreset(id)` and active-state derives from current settings.

### Evaluation: ExportPresets style-rule compliance with behavior parity
- Confirmed style-rule violations were real and user-visible in CI lint:
  - `project-rules/no-direct-asset-imports` (icon assets imported directly in overlay file).
  - `project-rules/no-raw-html-controls` (raw `<button>` in overlay file).
- Behavioral parity constraints preserved:
  - active preset indicator,
  - click-to-apply preset,
  - hover/click audio behavior.

## Issues Found
- [open] `ExportPresets` violated UI-layer boundary rules for assets and raw controls.
  - Location: `src/components/overlays/export/ExportPresets.tsx`.
  - Impact: lint failures and architectural drift from UI primitive boundaries.

## Iteration Update: ExportPresets Style-Rule Compliance (2026-02-21)

### Root-Cause Summary
- `ExportPresets` mixed feature-layer logic with responsibilities reserved for UI primitives:
  - direct asset imports,
  - raw HTML button rendering.

### Fix Implemented
- Added UI primitive:
  - `src/components/ui/ExportPresetCard.tsx`
  - Hosts preset icon map, asset imports, and raw button control in allowed UI layer.
- Updated overlay component:
  - `src/components/overlays/export/ExportPresets.tsx`
  - Replaced inline card implementation with `ExportPresetCard` usage.
  - Preserved active-state matching logic and click path to `applyPreset`.
  - Tightened preset identifier typing with `ExportPresetCardId`.

### Verification Evidence
- Targeted behavior checks:
  - `npx vitest run --maxWorkers=4 src/tests/components/overlays/export/ExportPresets.test.tsx src/tests/components/overlays/ExportModal.test.tsx`
  - Result: pass (2 files, 4 tests).
- Broader export regressions:
  - `npx vitest run --maxWorkers=4 src/tests/components/overlays/export/ExportPreview.test.tsx src/tests/components/overlays/export/ExportPresets.test.tsx src/tests/components/overlays/ExportModal.test.tsx src/tests/lib/export/image.test.ts src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass (7 files, 150 tests).
- Lint:
  - `npx eslint src/components/overlays/export/ExportPresets.tsx src/components/ui/ExportPresetCard.tsx src/tests/components/overlays/export/ExportPresets.test.tsx`
  - Result: pass.

## Issues Fixed
- [fixed] `ExportPresets` UI-layer style-rule violations while preserving preset behavior and active-state feedback.

## Active Target
- Export preset card keyboard and form-safety semantics

## Task Queue Details
- [in_progress] Understand purpose of export preset card keyboard and form-safety semantics
- [pending] Analyze `src/components/ui/ExportPresetCard.tsx`
- [pending] Analyze `src/components/overlays/export/ExportPresets.tsx`
- [pending] Trace keyboard activation + click propagation paths for preset selection
- [pending] Evaluate and implement fixes/tests for confirmed accessibility or form-submit defects

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

### Purpose Findings: export preset card keyboard and form-safety semantics
- Preset cards are interactive controls intended to apply export presets only.
- They are not form-submit actions; expected behavior is side-effect limited to `onClick` preset application.

### Analysis: `src/components/ui/ExportPresetCard.tsx`
- Card is rendered as raw `<button>` in UI layer (compliant boundary).
- Confirmed semantic gap: no explicit `type` attribute on button, so browser default is `type="submit"`.

### Analysis: `src/components/overlays/export/ExportPresets.tsx`
- Selection flow delegates click via `onClick={() => handleSelect(p.id)}`.
- No form context in current overlay, but primitive should remain safe in any container.

### Trace: keyboard/click activation path
- Activation path: button click -> `onClick` prop -> `handleSelect` -> `applyPreset` + click sound.
- When nested under form contexts, default submit behavior can add unintended submit side-effects.

### Evaluation: preset card semantics
- Confirmed defect: `ExportPresetCard` can submit ancestor forms due to implicit submit type.

## Issues Found
- [open] `ExportPresetCard` button implicitly submits ancestor forms.
  - Location: `src/components/ui/ExportPresetCard.tsx`.
  - Impact: accidental form submission in reuse contexts; unexpected side effects outside preset selection.

## Iteration Update: ExportPresetCard Form-Safety Semantics (2026-02-21)

### Root-Cause Summary
- UI primitive used `<button>` without explicit `type`.
- HTML default makes it `submit` in form contexts.

### Fail-First Evidence
- Added regression test in `src/tests/components/ui/ExportPresetCard.test.tsx`:
  - `does not submit an ancestor form when clicked`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/components/ui/ExportPresetCard.test.tsx`
- Result before fix: failed (submit event fired once).

### Fix Implemented
- `src/components/ui/ExportPresetCard.tsx`:
  - set `type="button"` on preset card control.

### Verification Evidence
- Targeted checks:
  - `npx vitest run --maxWorkers=4 src/tests/components/ui/ExportPresetCard.test.tsx src/tests/components/overlays/export/ExportPresets.test.tsx src/tests/components/overlays/ExportModal.test.tsx`
  - Result: pass (3 files, 5 tests).
- Lint:
  - `npx eslint src/components/ui/ExportPresetCard.tsx src/components/overlays/export/ExportPresets.tsx src/tests/components/ui/ExportPresetCard.test.tsx src/tests/components/overlays/export/ExportPresets.test.tsx`
  - Result: pass.
- Broader export regressions:
  - `npx vitest run --maxWorkers=4 src/tests/components/ui/ExportPresetCard.test.tsx src/tests/components/overlays/export/ExportPreview.test.tsx src/tests/components/overlays/export/ExportPresets.test.tsx src/tests/components/overlays/ExportModal.test.tsx src/tests/lib/export/image.test.ts src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass (8 files, 151 tests).

## Issues Fixed
- [fixed] `ExportPresetCard` no longer triggers implicit form submission.

## Active Target
- ExportPresetCard accessible-name clarity

## Task Queue Details
- [in_progress] Understand purpose of ExportPresetCard accessible-name clarity
- [pending] Analyze icon accessibility semantics in `src/components/ui/ExportPresetCard.tsx`
- [pending] Add fail-first test for non-duplicative preset button accessible name
- [pending] Implement minimal icon semantics fix and verify targeted + regression suites

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

### Purpose Findings: ExportPresetCard accessible-name clarity
- Preset cards are keyboard/screen-reader reachable buttons.
- Accessible name should describe the preset once, without redundant icon label duplication.

### Analysis: icon accessibility semantics in `ExportPresetCard`
- Icon image sat inside button with `alt={label}`.
- Button already includes textual preset label + description.
- Result: icon alt text duplicated the label in button accessible name.

### Evaluation: accessible-name behavior
- Confirmed defect:
  - button accessible name included duplicated token (`Instagram Instagram ...`).
  - unnecessary verbosity for assistive tech users.

## Issues Found
- [open] Preset card icon alt text duplicates button label in accessible name.
  - Location: `src/components/ui/ExportPresetCard.tsx`.
  - Impact: noisier, less clear screen-reader output for preset controls.

## Iteration Update: ExportPresetCard Accessible-Name De-duplication (2026-02-21)

### Root-Cause Summary
- Decorative icon used non-empty alt text equal to label.
- Because icon sits inside button, its alt text contributes to computed accessible name.

### Fail-First Evidence
- Added regression in `src/tests/components/ui/ExportPresetCard.test.tsx`:
  - `does not duplicate the preset label in the button accessible name`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/components/ui/ExportPresetCard.test.tsx`
- Result before fix: failed (`Instagram Instagram 1080x1080 • 1:1 Square`).

### Fix Implemented
- `src/components/ui/ExportPresetCard.tsx`:
  - changed icon to decorative semantics: `alt=""` and `aria-hidden="true"`.

### Verification Evidence
- Targeted checks:
  - `npx vitest run --maxWorkers=4 src/tests/components/ui/ExportPresetCard.test.tsx src/tests/components/overlays/export/ExportPresets.test.tsx src/tests/components/overlays/ExportModal.test.tsx`
  - Result: pass (3 files, 6 tests).
- Lint:
  - `npx eslint src/components/ui/ExportPresetCard.tsx src/tests/components/ui/ExportPresetCard.test.tsx src/components/overlays/export/ExportPresets.tsx src/tests/components/overlays/export/ExportPresets.test.tsx`
  - Result: pass.
- Broader export regressions:
  - `npx vitest run --maxWorkers=4 src/tests/components/ui/ExportPresetCard.test.tsx src/tests/components/overlays/export/ExportPreview.test.tsx src/tests/components/overlays/export/ExportPresets.test.tsx src/tests/components/overlays/ExportModal.test.tsx src/tests/lib/export/image.test.ts src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass (8 files, 152 tests).

## Issues Fixed
- [fixed] Preset card accessible names no longer duplicate label text through decorative icon alt text.

## Active Target
- ExportButton async failure recovery robustness

## Task Queue Details
- [in_progress] Understand purpose of ExportButton async failure recovery robustness
- [pending] Analyze `src/components/controls/ExportButton.tsx` async state lifecycle
- [pending] Analyze `src/lib/export/image.ts` call contract from button layer
- [pending] Add fail-first test for button state/toast recovery when export call rejects
- [pending] Implement minimal defensive fix and verify targeted + regression suites

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)

### Purpose Findings: ExportButton async failure recovery robustness
- Export button should never leave UI stuck in exporting state.
- User feedback should remain deterministic: success info toast on success, error toast on any failure path.

### Analysis: `src/components/controls/ExportButton.tsx`
- Original flow set `isExporting(true)` then awaited delay + export call.
- No `try/finally`; thrown async rejection skipped reset path.

### Analysis: `src/lib/export/image.ts` call contract
- Current implementation catches and returns `false`, but button should remain resilient to unexpected throws from integration boundaries/mocks/future changes.

### Evaluation: async rejection handling
- Confirmed defect:
  - unexpected rejection leaves button in `Exporting...` state.
  - error toast is not guaranteed for thrown path.

## Issues Found
- [open] `ExportButton` does not recover UI state when export call rejects unexpectedly.
  - Location: `src/components/controls/ExportButton.tsx`.
  - Impact: button can remain disabled/stuck; unhandled rejection path bypasses error feedback.

## Iteration Update: ExportButton Async Rejection Recovery (2026-02-21)

### Root-Cause Summary
- `handleExport` lacked `try/catch/finally` around asynchronous workflow.
- Rejections bypassed both error toast and `setIsExporting(false)`.

### Fail-First Evidence
- Added regression test in `src/tests/components/controls/ExportButton.test.tsx`:
  - `recovers UI state and shows error toast when PNG export rejects unexpectedly`
- Fail-first command:
  - `npx vitest run --maxWorkers=4 src/tests/components/controls/ExportButton.test.tsx`
- Result before fix: failed (`Exporting...` persisted + unhandled rejection).

### Fix Implemented
- `src/components/controls/ExportButton.tsx`:
  - added re-entry guard (`if (isExporting) return`).
  - wrapped async flow in `try/catch/finally`.
  - ensured thrown path shows `Export failed. Please try again.` toast.
  - guaranteed `setIsExporting(false)` in `finally`.

### Verification Evidence
- Targeted test:
  - `npx vitest run --maxWorkers=4 src/tests/components/controls/ExportButton.test.tsx`
  - Result: pass.
- Lint:
  - `npx eslint src/components/controls/ExportButton.tsx src/tests/components/controls/ExportButton.test.tsx`
  - Result: pass.
- Broader regression suite:
  - `npx vitest run --maxWorkers=4 src/tests/components/controls/ExportButton.test.tsx src/tests/components/ui/ExportPresetCard.test.tsx src/tests/components/overlays/export/ExportPreview.test.tsx src/tests/components/overlays/export/ExportPresets.test.tsx src/tests/components/overlays/ExportModal.test.tsx src/tests/lib/export/image.test.ts src/tests/stores/exportStore.test.ts src/tests/lib/export/video.test.ts src/tests/lib/export/videoExportPlanning.test.ts`
  - Result: pass (9 files, 153 tests).

## Issues Fixed
- [fixed] `ExportButton` now recovers and shows error toast on rejected export calls.

## Active Target
- ShareButton fallback state consistency

## Task Queue Details
- [in_progress] Understand purpose of ShareButton fallback state consistency
- [pending] Analyze `src/components/controls/ShareButton.tsx` success/failure state transitions
- [pending] Analyze `src/tests/components/ShareButton.test.tsx` coverage gaps for fallback path
- [pending] Add fail-first test for stale copied-state when clipboard copy fails after prior success
- [pending] Implement minimal state fix and verify targeted + regression suites

## Issues Found
- (none yet for this target)

## Issues Fixed
- (none yet for this target)

## Deferred for Developer
- (none)
