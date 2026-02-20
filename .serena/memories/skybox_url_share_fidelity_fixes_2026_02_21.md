# Skybox URL/share fidelity fixes (2026-02-21)

## Problem
Share URLs did not preserve skybox state end-to-end.

Initially:
- URL serializer/hydrator had no skybox field at all.
- ShareButton did not include skybox state in generated URLs.
- useUrlState did not apply skybox params to environment store.

After first fix, `skyboxSelection` was preserved, but core skybox controls were still omitted.

## Fixes implemented

### Iteration 3: unified selection support
- `src/lib/url/state-serializer.ts`
  - Added `skyboxSelection` to `ShareableState`.
  - Added URL token `sb` (serialize non-default selection, parse+validate on load).
- `src/components/controls/ShareButton.tsx`
  - Included `skyboxSelection` in `generateShareUrl()` payload.
- `src/hooks/useUrlState.ts`
  - Applied `skyboxSelection` with `useEnvironmentStore.getState().setSkyboxSelection(...)`.

### Iteration 4: core skybox control fidelity
- `src/lib/url/state-serializer.ts`
  - Added fields to `ShareableState`:
    - `skyboxIntensity`
    - `skyboxRotation`
    - `skyboxAnimationMode`
    - `skyboxAnimationSpeed`
    - `skyboxHighQuality`
  - Added validated URL tokens:
    - `sbi` (intensity, 0..10)
    - `sbr` (rotation, finite)
    - `sbm` (animation mode enum)
    - `sbs` (animation speed, 0..5)
    - `sbh` (high quality bool)
- `src/components/controls/ShareButton.tsx`
  - Included all core skybox controls in share payload.
- `src/hooks/useUrlState.ts`
  - Applied all parsed core skybox controls via environment store setters.

## Tests added/updated
- `src/tests/lib/url/state-serializer.test.ts`
  - `sb` serialize/deserialize/roundtrip coverage.
  - Core skybox controls serialize/deserialize/roundtrip coverage.
  - Invalid value rejection coverage for core control params.
- `src/tests/hooks/useUrlState.test.ts`
  - Verifies hydration applies selection + core skybox controls.
- `src/tests/components/ShareButton.test.tsx`
  - Verifies generated URL includes selection + core skybox control tokens.

## Verification commands
- `npx vitest run --maxWorkers=4 src/tests/lib/url/state-serializer.test.ts src/tests/hooks/useUrlState.test.ts src/tests/components/ShareButton.test.tsx`
- `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts src/tests/rendering/webgpu/WebGPUScene.casSharpening.test.ts src/tests/rendering/webgpu/wgslCompilation.test.ts src/tests/stores/environmentStore.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/lib/url/state-serializer.test.ts src/tests/hooks/useUrlState.test.ts src/tests/components/ShareButton.test.tsx`
- Result: all tests passed.