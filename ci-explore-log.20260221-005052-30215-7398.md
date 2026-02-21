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
