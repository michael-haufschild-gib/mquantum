## Active Target

Free scalar field object type feature bundle (configuration, UI controls, compute pipeline, shader composition, rendering integration, serialization, and tests).

## Task Queue Details

- [completed] Understand purpose of free scalar field object type feature (documented intended physics and UX invariants)
- [completed] Analyze scripts/playwright/free-scalar-capture.spec.ts
- [completed] Analyze src/components/layout/EditorTopBar/index.tsx
- [completed] Analyze src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx
- [completed] Analyze src/components/sections/Advanced/SchroedingerCrossSectionSection.tsx
- [completed] Analyze src/components/sections/Advanced/SchroedingerQuantumEffectsSection.tsx
- [completed] Analyze src/components/sections/Faces/KSpaceVizControls.tsx
- [completed] Analyze src/components/sections/Geometry/SchroedingerControls/FreeScalarFieldControls.tsx
- [completed] Analyze src/components/sections/Geometry/SchroedingerControls/index.tsx
- [completed] Analyze src/components/sections/Geometry/SchroedingerControls/types.ts
- [completed] Analyze src/components/sections/ObjectTypes/ObjectTypeExplorer.tsx
- [completed] Analyze src/lib/geometry/extended/types.ts
- [completed] Analyze src/lib/physics/freeScalar/kSpaceDisplayTransforms.ts
- [completed] Analyze src/lib/physics/freeScalar/kSpaceOccupation.ts
- [completed] Analyze src/lib/physics/freeScalar/kSpaceRadialSpectrum.ts
- [completed] Analyze src/lib/physics/freeScalar/vacuumSpectrum.ts
- [completed] Analyze src/rendering/shaders/palette/types.ts
- [completed] Analyze src/rendering/webgpu/WebGPUScene.tsx
- [completed] Analyze src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts
- [completed] Analyze src/rendering/webgpu/passes/TDSEComputePass.ts
- [completed] Analyze src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compose.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/compose.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarNDIndex.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePhi.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePi.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseAbsorber.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseApplyKinetic.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseInit.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdsePotential.wgsl.ts
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl.ts
- [completed] Analyze src/stores/presetManagerStore.ts
- [completed] Analyze src/stores/slices/geometry/schroedingerSlice.ts
- [completed] Analyze src/stores/slices/geometry/types.ts
- [completed] Analyze src/stores/utils/presetSerialization.ts
- [completed] Analyze src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts
- [completed] Analyze src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts
- [completed] Analyze src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts
- [completed] Analyze src/tests/lib/physics/freeScalar/vacuumSpectrum.test.ts
- [completed] Analyze src/tests/rendering/shaders/colorAlgorithmGating.test.ts
- [completed] Analyze src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts
- [completed] Analyze src/tests/rendering/webgpu/shaders/freeScalar.test.ts
- [completed] Analyze src/tests/rendering/webgpu/wgslCompilation.test.ts
- [completed] Analyze src/tests/stores/extendedObjectStore.freeScalar.test.ts
- [completed] Trace UI controls -> geometry slice free scalar actions -> reset/version behavior (validated store actions, needsReset lifecycle, and UI control wiring)
- [completed] Trace preset/url/load-save invariants for free scalar mode (verified load-time dimension guard and transient field stripping)
- [completed] Trace WebGPU free scalar compute pipeline (init -> updatePi/updatePhi -> writeGrid -> volume render) (validated pass wiring, shader composition, and renderer bind-group path)
- [completed] Trace free scalar k-space and educational color gating flow (validated k-space transform pipeline + color algorithm availability gating)
- [completed] Evaluate free scalar field feature against intended behavior (identified and fixed renderer color-algorithm normalization gap)


Purpose summary (2026-02-20):
- freeScalarField is a Schroedinger quantumMode (not a separate object type) for real Klein-Gordon lattice dynamics with state variables phi and pi.
- Intended update scheme is leapfrog/staggered integration with periodic boundaries, exposing phi/pi/energyDensity views and stable dt constraints.
- Rendering should reuse volumetric/cross-section tooling while sourcing actual free-scalar grid state, not HO psi evaluation shortcuts.
- k-space educational controls (fft shift, radial shells, exposure, broadening) are visualization-only; raw occupation physics invariants must remain unchanged.
## Issues Found

1. Renderer accepted unsupported color algorithms for active quantum mode during object renderer creation.
   - Location: src/rendering/webgpu/WebGPUScene.tsx
   - Impact: Non-free-scalar modes could still run free-scalar-only algorithm IDs (notably kSpaceOccupation) if loaded via preset/URL state before UI correction, causing inconsistent shader behavior and confusing output.
   - Root cause: Mode-aware algorithm gating was only applied in UI/selective-rebuild paths, not in the actual renderer creation path.

## Issues Fixed

1. Added mode-aware color algorithm normalization in runtime renderer path.
   - Code: src/rendering/webgpu/WebGPUScene.tsx
   - Change: Added normalizeColorAlgorithmForQuantumMode() using getAvailableColorAlgorithms(), and applied it in both extractSchrodingerConfig() and createObjectRenderer().
   - Effect: Unsupported algorithms now deterministically fall back to diverging for the active quantum mode before renderer instantiation.

2. Added regression tests for mode-aware normalization.
   - Code: src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts
   - Added assertions:
     a) non-free-scalar + kSpaceOccupation -> diverging (int 9)
     b) freeScalarField + relativePhase -> diverging (int 9)
     c) freeScalarField + kSpaceOccupation remains supported (int 15)

3. Verification executed (all passing):
   - npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts
   - npx vitest run --maxWorkers=4 src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts src/tests/lib/physics/freeScalar/vacuumSpectrum.test.ts src/tests/rendering/shaders/colorAlgorithmGating.test.ts src/tests/rendering/webgpu/shaders/freeScalar.test.ts src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts

## Deferred for Developer

None.

## Continuation (2026-02-21)

### Additional issue found

1. Per-frame Schrödinger uniform upload could override the renderer's compile-time color algorithm with `appearance.colorAlgorithm`.
   - Location: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
   - Impact: During warm-swap windows and persisted invalid states, the active uniform algorithm could drift from the compiled renderer specialization/mode gating (including free-scalar educational algorithms), causing inconsistent runtime behavior.
   - Root cause: `updateSchroedingerUniforms()` used `appearance.colorAlgorithm` directly instead of prioritizing `rendererConfig.colorAlgorithm`.

### Additional fix

1. Locked uniform color algorithm to the renderer's compiled config when available.
   - Code: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
   - Change: `updateSchroedingerUniforms()` now writes `rendererConfig.colorAlgorithm` first, with appearance mapping only as fallback.
   - Effect: Runtime uniform algorithm stays aligned with mode-normalized compile-time selection.

2. Added renderer-level regression tests.
   - Code: `src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`
   - Added assertions:
     a) compile-time diverging (9) remains in uniforms even if appearance requests `kSpaceOccupation`
     b) compile-time free-scalar `kSpaceOccupation` (15) remains in uniforms even if appearance requests `relativePhase`

3. Verification executed (all passing):
   - `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`
   - `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts`
   - `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts src/tests/lib/physics/freeScalar/vacuumSpectrum.test.ts src/tests/rendering/shaders/colorAlgorithmGating.test.ts src/tests/rendering/webgpu/shaders/freeScalar.test.ts src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts`
