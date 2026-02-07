Added HO-only nodal plane softening toggle wired through performance store and Schroedinger uniform slot at offset 1204 (previously _nodalRenderPad0).

Implementation details:
- Performance state: `nodalPlaneSofteningEnabled` (default true), setter `setNodalPlaneSofteningEnabled` in `src/stores/performanceStore.ts`.
- UI: `src/components/sections/Performance/NodalPlaneSofteningControls.tsx`, inserted in Performance section.
- Uniform field rename in WGSL struct: `_nodalRenderPad0` -> `nodalPlaneSofteningEnabled: u32` in `src/rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts` (layout preserved).
- Host upload: `WebGPUSchrodingerRenderer.updateSchroedingerUniforms()` writes `intView[1204/4]` from performance store (defaults true).
- Shader gating in `src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts`:
  - Added `applyNodalPlaneSoftening = uniforms.quantumMode == QUANTUM_MODE_HARMONIC && uniforms.nodalPlaneSofteningEnabled != 0u` in fast/HQ/grid raymarch functions.
  - Applied softening floor with `select(...)` only when `applyNodalPlaneSoftening` is true.

Verification:
- `npx vitest run src/tests/stores/performanceStore.test.ts src/tests/rendering/webgpu/schroedingerNodalWgsl.test.ts`
- `npx vitest run src/tests/rendering/webgpu/wgslCompilation.test.ts -t "supports different quantum modes|composes WGSL fragment shader for dimension 6"`