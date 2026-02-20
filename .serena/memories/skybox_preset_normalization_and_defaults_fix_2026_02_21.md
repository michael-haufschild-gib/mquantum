# Skybox preset normalization + defaults canonicalization (2026-02-21)

## Problems fixed
1. Default skybox constants were inconsistent:
   - `DEFAULT_SKYBOX_SELECTION='none'` but mode/texture defaults implied active skybox values.
2. Legacy style/scene loads could leave unified skybox fields contradictory because `loadStyle/loadScene` only defaulted `skyboxEnabled` and did not canonicalize `skyboxSelection/skyboxMode/skyboxTexture`.
3. Legacy environment field `classicSkyboxType` was not removed during sanitization.

## Code changes
- `src/stores/defaults/visualDefaults.ts`
  - `DEFAULT_SKYBOX_TEXTURE` changed to `'none'`
  - `DEFAULT_SKYBOX_MODE` changed to `'classic'`
- `src/stores/presetManagerStore.ts`
  - Added helpers:
    - `isSkyboxSelection`, `isProceduralSkyboxMode`, `isSkyboxTexture`
    - `deriveSkyboxStateFromSelection`
    - `normalizeEnvironmentLoadData`
  - `loadStyle` and `loadScene` now normalize environment payloads before applying.
- `src/stores/utils/presetSerialization.ts`
  - Added `'classicSkyboxType'` to `TRANSIENT_FIELDS`.

## Tests added/updated
- `src/tests/stores/environmentStore.test.ts`
  - Added canonical default invariant test for `selection=none` -> `enabled=false`, `mode=classic`, `texture=none`.
  - Reset test now checks all unified skybox fields.
- `src/tests/stores/presetManagerStore.test.ts`
  - Legacy style/scene tests now assert canonical skybox fallback and absence of `classicSkyboxType`.
  - Added test deriving `skyboxSelection` from legacy `skyboxMode/skyboxTexture` when selection is missing.
- `src/tests/stores/utils/presetSerialization.test.ts`
  - Added test confirming legacy `classicSkyboxType` is stripped.

## Verification
- `npx vitest run --maxWorkers=4 src/tests/stores/environmentStore.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/utils/presetSerialization.test.ts`
- `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts src/tests/rendering/webgpu/WebGPUScene.casSharpening.test.ts src/tests/rendering/webgpu/wgslCompilation.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/utils/presetSerialization.test.ts`
- Result: all passed.