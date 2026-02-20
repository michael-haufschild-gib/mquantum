# Harmonic Oscillator Eigencache Fidelity Plan (2026-02-20)

## Goal
Implement three changes for harmonic-oscillator rendering fidelity and control:

1. Decouple eigencache from analytical gradient and expose analytical gradient as a separate performance toggle (default ON).
2. Increase eigencache sampling density from 1024 to 2048.
3. Add a robust interpolation/extrapolation mode (toggle, default ON) that uses safer behavior near extrema and outside cache range.

## Scope
- WebGPU Schrödinger path only.
- Performance section UI in right editor.
- Shader composition flags and renderer pipeline keys.
- Eigen cache shader logic and compute constants.
- Store + wiring + tests.

Out of scope:
- New visualization modes.
- Non-Schrödinger renderers.
- Runtime auto-tuning heuristics beyond the requested toggles.

## Implementation Steps

### 1. Extend Performance Store
Files:
- `src/stores/performanceStore.ts`

Changes:
- Add state fields:
  - `analyticalGradientEnabled: boolean` (default `true`)
  - `robustEigenInterpolationEnabled: boolean` (default `true`)
- Add actions:
  - `setAnalyticalGradientEnabled(enabled: boolean)`
  - `setRobustEigenInterpolationEnabled(enabled: boolean)`
- Include both fields in `reset()`.
- Keep existing persisted keys untouched unless explicit persistence is needed later.

### 2. Update Performance Section UI
Files:
- `src/components/sections/Performance/EigenfunctionCacheControls.tsx`
- `src/components/sections/Performance/PerformanceSection.tsx` (only if spacing/order adjustments are needed)

Changes:
- Under existing `Eigenfunction Cache` switch, add:
  - `Analytical Gradient` switch (`data-testid="analytical-gradient-toggle"`)
  - `Robust Eigen Interpolation` switch (`data-testid="robust-eigen-interpolation-toggle"`)
- Both default ON via store defaults.
- Disable the two new switches when eigencache is OFF (state remains stored).
- Update descriptive text:
  - cache text should no longer imply all quality changes come from caching alone.

### 3. Plumb New Flags Through WebGPU Scene Config
Files:
- `src/rendering/webgpu/WebGPUScene.tsx`

Changes:
- Extend `performanceSelector` with new flags.
- Extend `PassConfig` and `SchrodingerPassConfig` with:
  - `analyticalGradientEnabled: boolean`
  - `robustEigenInterpolationEnabled: boolean`
- Populate these in `fullConfig`.
- Include them in `extractSchrodingerConfig`.
- Ensure dependency lists that trigger Schrodinger pass rebuild include both.
- Pass through to `createObjectRenderer(...)` and then `WebGPUSchrodingerRenderer` config.

### 4. Extend Renderer and Pipeline Cache Keys
Files:
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

Changes:
- Extend `SchrodingerRendererConfig` with:
  - `analyticalGradientEnabled?: boolean`
  - `robustEigenInterpolationEnabled?: boolean`
- Map to shader config fields in constructor.
- Extend pipeline cache key (`computePipelineCacheKey`) to include both toggles so shader variants rebuild correctly.
- Keep existing 2D/wigner/free-scalar overrides consistent (disable incompatible flags in those modes).

### 5. Decouple Analytical Gradient Define from Cache Define
Files:
- `src/rendering/webgpu/shaders/schroedinger/compose.ts`

Changes:
- Extend `SchroedingerWGSLShaderConfig`:
  - `useAnalyticalGradient?: boolean`
  - `useRobustEigenInterpolation?: boolean`
- Replace coupling logic:
  - from `useAnalyticalGradient = useCache && includeHarmonic`
  - to `useAnalyticalGradient = useCache && includeHarmonic && useAnalyticalGradientFlag`
- Emit compile-time defines:
  - `USE_ANALYTICAL_GRADIENT`
  - `USE_ROBUST_EIGEN_INTERPOLATION`

### 6. Increase Eigencache Sample Count to 2048
Files:
- `src/rendering/webgpu/shaders/schroedinger/quantum/eigenfunctionCache.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/compute/eigenfunctionCache.wgsl.ts`
- `src/rendering/webgpu/passes/EigenfunctionCacheComputePass.ts`

Changes:
- Set `EIGEN_CACHE_SAMPLES = 2048`.
- Ensure compute shader `WORKGROUPS_PER_FUNC` is derived from sample count (no hardcoded 4).
- Verify dispatch count remains derived and correct in compute pass.
- Update comments/documentation referencing size/workgroups.

Expected memory change:
- Cache storage buffer doubles from ~0.688 MiB to ~1.375 MiB.

### 7. Implement Robust Interpolation/Extrapolation Policy
Files:
- `src/rendering/webgpu/shaders/schroedinger/quantum/eigenfunctionCache.wgsl.ts`

Changes:
- Keep current Catmull-Rom path for legacy/fast mode.
- Add robust mode (guarded by `USE_ROBUST_EIGEN_INTERPOLATION`):
  - Outside `[xMin, xMax]`: use linear extrapolation from endpoint `(phi, dphi)`.
  - Near extrema / sign-change-sensitive regions: use linear segment fallback to avoid cubic overshoot.
  - Else: use monotone-limited cubic Hermite interpolation for smoother but less overshooting behavior.
- Ensure both `ho1DCached` and `ho1DDerivCached` consume the selected policy consistently.

### 8. Test Updates and Verification
Files:
- `src/tests/stores/performanceStore.test.ts`
- `src/tests/rendering/webgpu/wgslCompilation.test.ts`
- `src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts`
- `src/tests/rendering/webgpu/WebGPUScene.casSharpening.test.ts`

Test additions:
- Store defaults and setters for the two new flags.
- Reset behavior for both flags.
- Shader composition checks:
  - cache ON + analytical OFF => `USE_EIGENFUNCTION_CACHE=true`, `USE_ANALYTICAL_GRADIENT=false`
  - robust interpolation ON/OFF define switching.
- WebGPUScene config shape/helper tests updated for new config fields.

Verification commands:
- `npx vitest run src/tests/stores/performanceStore.test.ts`
- `npx vitest run src/tests/rendering/webgpu/wgslCompilation.test.ts -t "Eigenfunction Cache"`
- `npx vitest run src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts src/tests/rendering/webgpu/WebGPUScene.casSharpening.test.ts`

## Rollout Notes
- This change introduces new shader variants and therefore pipeline cache key expansion.
- Expect one-time shader recompiles when toggles change.
- Keep defaults ON to preserve current performance profile while enabling targeted fidelity debugging.

## Acceptance Criteria
- New toggles appear below eigencache in Performance section and default to ON.
- Toggling analytical gradient no longer requires disabling eigencache.
- Cache sample density is 2048 end-to-end (constants, compute dispatch, metadata range mapping).
- Robust interpolation toggle switches between legacy and robust policies.
- All targeted tests pass.
