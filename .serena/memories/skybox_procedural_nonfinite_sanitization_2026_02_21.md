# Skybox procedural settings non-finite sanitization (2026-02-21)

## Problem
`setProceduralSettings` in `src/stores/slices/skyboxSlice.ts` used a raw shallow merge of incoming partial settings. Non-finite values (`NaN`, `Infinity`) in nested procedural payloads were accepted, which could propagate to `WebGPUSkyboxRenderer` uniform buffers.

## Changes
- Added schema-driven sanitizer helpers in `skyboxSlice.ts`:
  - `sanitizeProceduralValue`
  - `sanitizeProceduralSettingsPatch`
  - `warnInvalidProceduralSetting`
- Added deep merge helpers:
  - `deepMergeRecord`
  - `mergeProceduralSettings`
- Updated `setProceduralSettings` to:
  - drop invalid non-finite numeric leaves,
  - keep valid leaves from mixed payloads,
  - no-op when patch has no valid fields,
  - deep-merge nested groups so partial nested patches do not erase sibling fields.

## Test added
- `src/tests/stores/environmentStore.test.ts`
  - `ignores non-finite procedural numeric updates while applying valid fields`

## Verification
- Fail-first shown before fix:
  - `npx vitest run --maxWorkers=4 src/tests/stores/environmentStore.test.ts` failed (`hue` became `NaN`).
- Post-fix checks passed:
  - `npx vitest run --maxWorkers=4 src/tests/stores/environmentStore.test.ts`
  - `npx vitest run --maxWorkers=4 src/tests/stores/environmentStore.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
  - `npx eslint src/stores/slices/skyboxSlice.ts src/tests/stores/environmentStore.test.ts`
