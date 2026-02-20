## Active Target
Iteration 2 target: `src/rendering/webgpu/shaders/schroedinger/quantum`

Mission: validate hydrogen orbital correctness and numerical robustness in WGSL quantum blocks used by the WebGPU Schroedinger renderer.

Purpose findings:
- The quantum module is the dependency core for fragment and compute shader composition.
- Hydrogen vs HO families are compile-time specialized via defines and generated per-dimension dispatch blocks.
- Runtime uniforms control quantum-number/representation behavior; composition-level binding consistency is therefore critical.

Per-file findings (iteration 2):
- `analyticalGradient.wgsl.ts`: no defect identified.
- `complex.wgsl.ts`: no defect identified.
- `density.wgsl.ts`: no defect identified.
- `eigenfunctionCache.wgsl.ts`: no defect identified.
- `hermite.wgsl.ts`: no defect identified.
- `ho1d.wgsl.ts`: no defect identified.
- `hoNDVariants.wgsl.ts`: no defect identified.
- `hoSuperpositionVariants.wgsl.ts`: no defect identified.
- `hydrogenFallback.wgsl.ts`: no defect identified.
- `hydrogenNDCommon.wgsl.ts`: no defect identified.
- `hydrogenNDVariants.wgsl.ts`: no defect identified.
- `hydrogenRadial.wgsl.ts`: no defect identified.
- `index.ts`: no defect identified.
- `laguerre.wgsl.ts`: no defect identified.
- `legendre.wgsl.ts`: no defect identified.
- `psi.wgsl.ts`: no defect identified.
- `sphericalHarmonics.wgsl.ts`: no defect identified.
- `wignerHO.wgsl.ts`: no defect identified.
- `wignerHydrogen.wgsl.ts`: no defect identified.

## Task Queue Details
- [completed] Understand purpose of quantum shader module (src/rendering/webgpu/shaders/schroedinger/quantum) for hydrogen and HO modes
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/analyticalGradient.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/complex.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/density.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/eigenfunctionCache.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/hermite.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/ho1d.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/hoNDVariants.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/hoSuperpositionVariants.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/hydrogenFallback.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/hydrogenNDCommon.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/hydrogenNDVariants.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/hydrogenRadial.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/index.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/laguerre.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/legendre.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/psi.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/sphericalHarmonics.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/wignerHO.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/quantum/wignerHydrogen.wgsl.ts
- [completed] Trace flow: compose.ts/compute compose -> quantum block inclusion conditions -> hydrogen runtime behavior
- [completed] Trace flow: hydrogen radial/angular evaluation -> density/wigner usage and numeric stability limits
- [completed] Evaluate quantum shader module against intended hydrogen behavior and add issue tasks
- [completed] Fix verified quantum-shader issues with tests and verification

## Issues Found
- `composeSchroedingerShader` allowed simultaneous Wigner cache and eigenfunction-cache bindings at `@group(2) @binding(2/3)` when `isWigner=true` and `useEigenfunctionCache=true`, causing conflicting resource declarations.
- Same underlying incompatibility applied to native 2D mode when eigencache was forced on.

## Issues Fixed
- Disabled eigencache usage in 2D/Wigner composition paths:
  - `src/rendering/webgpu/shaders/schroedinger/compose.ts`
- Disabled eigencache in renderer shader-config normalization for 2D pipelines:
  - `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- Added regression tests:
  - `src/tests/rendering/webgpu/wgslCompilation.test.ts`

Verification:
- `npx vitest run src/tests/rendering/webgpu/wgslCompilation.test.ts -t "Wigner cache|suppresses eigenfunction cache bindings"`
  - Passed: 5 tests (102 skipped in file scope)

## Deferred for Developer
- None.
