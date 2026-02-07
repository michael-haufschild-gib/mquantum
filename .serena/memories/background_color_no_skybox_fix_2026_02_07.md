## Background color bug fix (no skybox)

### Symptom
When `skyboxSelection = 'none'`, changing environment `backgroundColor` had no effect; scene background stayed black.

### Root cause
`setupRenderPasses` created `ScenePass` in the no-skybox branch without `clearColor`, so `ScenePass` defaulted to `{r:0,g:0,b:0,a:1}`.
Also, `backgroundColor` was not wired into the WebGPUScene pass setup config/dependencies.

### Fix
- Added `backgroundColor` to `environmentSelector` and to `PassConfig`.
- Passed `environment.backgroundColor` into `setupRenderPasses` config.
- Converted hex background color to linear RGB via `parseHexColorToLinearRgb`.
- Set `ScenePass.clearColor` to this converted value when `skyboxEnabled` is false.
- Added `environment.backgroundColor` as a setup dependency in WebGPUScene.

### Regression test
`src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts`
- Added test `uses configured background color for no-skybox scene clear pass`.
- Confirms no-skybox `ScenePass` clear color matches linearized configured hex color.