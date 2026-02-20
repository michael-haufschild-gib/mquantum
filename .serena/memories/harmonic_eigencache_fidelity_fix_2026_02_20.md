# Harmonic Eigencache Fidelity Fix (2026-02-20)

## Scope
Implemented harmonic-oscillator eigencache fidelity controls and interpolation/sampling updates across store/UI/WebGPU config/renderer/shaders/tests.

## Core Changes
- Added performance store flags (default true):
  - `analyticalGradientEnabled`
  - `robustEigenInterpolationEnabled`
- Added actions:
  - `setAnalyticalGradientEnabled(enabled)`
  - `setRobustEigenInterpolationEnabled(enabled)`
- UI (`EigenfunctionCacheControls`) now has three switches:
  - Eigenfunction Cache
  - Analytical Gradient
  - Robust Eigen Interpolation
  - Subordinate switches disabled when cache is off, but state is preserved.
- WebGPU wiring:
  - Added new flags to `performanceSelector`, `PassConfig`, `SchrodingerPassConfig`, and `extractSchrodingerConfig`.
  - Propagated flags into `createObjectRenderer` and `WebGPUSchrodingerRenderer` config.
- Renderer/shader composition:
  - `SchrodingerRendererConfig` now supports both new flags.
  - Pipeline cache key includes `useAnalyticalGradient` + `useRobustEigenInterpolation` to force correct shader variants.
  - `composeSchroedingerShader` now accepts:
    - `useAnalyticalGradient?` (default true)
    - `useRobustEigenInterpolation?` (default true)
  - Defines emitted:
    - `USE_ANALYTICAL_GRADIENT`
    - `USE_ROBUST_EIGEN_INTERPOLATION`
- Eigencache fidelity:
  - `EIGEN_CACHE_SAMPLES` increased from 1024 -> 2048.
  - Compute shader workgroup coupling fixed:
    - `WORKGROUPS_PER_FUNC = (EIGEN_CACHE_SAMPLES + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE`.
  - Robust lookup mode implemented in `eigenfunctionCache.wgsl.ts`:
    - linear extrapolation outside [xMin, xMax]
    - sign-sensitive linear fallback near extrema
    - monotone-limited cubic Hermite interpolation otherwise
    - legacy Catmull-Rom path kept when robust mode is disabled.

## Tests Added/Updated
- `src/tests/stores/performanceStore.test.ts`:
  - defaults/setters/reset for new flags.
- `src/tests/components/sections/Performance/EigenfunctionCacheControls.test.tsx` (new):
  - renders all switches, disable/enable behavior, state persistence.
- `src/tests/rendering/webgpu/wgslCompilation.test.ts`:
  - eigencache compute shader constant expectations (2048 and derived workgroups).
  - define toggling for analytical gradient and robust interpolation.
  - robust define checks for HO/hydrogen cache cases.
- `src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts` and `WebGPUScene.casSharpening.test.ts`:
  - fixture types/defaults include new PassConfig fields.

## Verification
Targeted suites passed (162 tests total in combined run).