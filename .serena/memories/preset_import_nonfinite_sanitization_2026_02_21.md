# Preset import non-finite numeric sanitization (2026-02-21)

## Problem
Preset load/import uses direct store `setState`, bypassing guarded setters. `JSON.parse` can parse large exponent numbers (e.g. `1e309`) as `Infinity`. Existing `sanitizeLoadedState` removed transient fields but did not sanitize non-finite numerics.

## Reproduction
In `presetManagerStore.test.ts`, import a raw JSON scene payload containing:
- `environment.skyboxIntensity: 1e309`
- `animation.speed: 1e309`
Then `loadScene` hydrates `Infinity` values into runtime state.

## Fix
Updated `src/stores/utils/presetSerialization.ts`:
- Added recursive numeric sanitizer:
  - `sanitizeFiniteLoadedValue`
  - `warnDroppedNonFinitePresetValue`
- `sanitizeLoadedState` now recursively drops non-finite numeric values (`NaN`, `Infinity`) in nested objects.
- Arrays are dropped when any member is invalid to avoid partial malformed vectors/tuples.

## Test
Added regression in `src/tests/stores/presetManagerStore.test.ts`:
- `ignores non-finite numeric fields from imported scene payloads`

## Verification
- Fail-first: targeted test failed before fix (`skyboxIntensity` became `Infinity`).
- Post-fix:
  - targeted test passes
  - related suites pass:
    - `src/tests/stores/presetManagerStore.test.ts`
    - `src/tests/stores/utils/presetSerialization.test.ts`
    - `src/tests/stores/environmentStore.test.ts`
    - `src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
- ESLint passed for touched files.
