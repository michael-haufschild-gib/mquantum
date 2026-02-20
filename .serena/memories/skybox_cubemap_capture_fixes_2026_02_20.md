# Skybox Cubemap Capture Fixes (2026-02-20)

## Issues fixed
1. `CubemapCapturePass.createPipeline()` incorrectly used `ctx.format` (canvas format, usually `bgra8unorm`) for cubemap capture pipeline targets while capture textures are `rgba16float`.
   - Fix: introduced `CUBEMAP_CAPTURE_FORMAT` constant (`'rgba16float'`) and used it for both pipeline target format and cubemap texture creation.
2. `CubemapCapturePass.isSkyboxAnimating()` checked non-existent `env.skyboxTimeScale`.
   - Fix: read procedural animation speed from `env.proceduralSettings?.timeScale`.

## Regression tests added
- `src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts`
  - Asserts pipeline target format is `rgba16float` even if setup context format is `bgra8unorm`.
  - Asserts procedural animation detection follows `proceduralSettings.timeScale`.

## Verification command
- `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/passes/CubemapCapturePass.test.ts src/tests/stores/environmentStore.test.ts src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts src/tests/rendering/webgpu/WebGPUScene.casSharpening.test.ts src/tests/rendering/webgpu/wgslCompilation.test.ts`
- Result: 5 files passed, 135 tests passed.