# Free Scalar Field Lattice Module Code Review

Date: 2026-02-15
Reviewer: Codex
Scope: End-to-end review of `freeScalarField` integration across UI, stores, renderer, compute/WGSL, and related tests.

## Verification Executed

- `npx vitest run src/tests/stores/extendedObjectStore.freeScalar.test.ts src/tests/rendering/webgpu/shaders/freeScalar.test.ts src/tests/rendering/shaders/colorAlgorithmGating.test.ts --maxWorkers=4`
  - Result: 49/49 tests passed.
- `npx vitest run src/tests/lib/url/state-serializer.test.ts src/tests/stores/appearanceStore.enhanced.test.ts src/tests/stores/postProcessingStore.test.ts src/tests/rendering/webgpu/passes/BloomPass.test.ts --maxWorkers=4`
  - Result: 47/47 tests passed.
- `npx vitest run src/tests/components/sections/ObjectTypeExplorer.test.tsx --maxWorkers=4`
  - Result: 2/2 tests passed.
- `npx vitest run src/tests/rendering/webgpu/wgslCompilation.test.ts --maxWorkers=4`
  - Result: 99/99 tests passed.

## Findings (Ordered by Severity)

### P1 - Free-scalar mode can enter inconsistent 2D/Wigner pipeline state

**Evidence**
- `setSchroedingerQuantumMode` is a plain value setter with no normalization/reset of representation or geometry dimension: `src/stores/slices/geometry/schroedingerSlice.ts:306`.
- Free-scalar mode hides the representation controls, so users cannot recover from a previously selected `wigner` representation: `src/components/sections/Geometry/SchroedingerControls/index.tsx:225`.
- Free-scalar mode disables dimension selectors instead of normalizing dimension: `src/components/layout/EditorLeftPanel.tsx:90`, `src/components/sections/Geometry/GeometrySection.tsx:28`.
- Renderer still derives `pipelineIs2D` from `dimension===2 || representation==='wigner'`: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts:331`, `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts:472`.
- In the same constructor path, free-scalar forcibly sets `shaderConfig.isWigner = false`: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts:426`.

**Impact**
- Switching into free-scalar from a Wigner or 2D prior state can produce incompatible pipeline/shader mode assumptions and incorrect rendering behavior.

**Recommendation**
- On entering `freeScalarField`, force canonical rendering state (at minimum `representation='position'`; likely normalize geometry dimension to a supported volumetric mode), or make renderer normalization authoritative for this mode.

### P1 - Write-grid kernel tiles lattice data instead of resampling it

**Evidence**
- Output texture resolution is fixed at `64^3`: `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts:32` and dispatch at `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts:520`.
- Mapping in write kernel uses modulo:
  - `ix = gid.x % nx`
  - `iy = ... gid.y % ny`
  - `iz = ... gid.z % nz`
  - `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl.ts:44`

**Impact**
- For `gridSize != 64`, field data is repeated (tiled) rather than mapped once to the render grid. Example: `nx=32` repeats twice across X. This distorts spatial interpretation and can visually alias dynamics.

**Recommendation**
- Replace modulo mapping with normalized coordinate remap (nearest/linear sample from simulation lattice into the 64³ render grid).

### P1 - Single-mode initialization uses continuum omega instead of lattice dispersion

**Evidence**
- Initial condition computes `omega = sqrt(k^2 + m^2)`: `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl.ts:115`.
- The module’s own lattice model defines the target dispersion as:
  - `omega_k^2 = m^2 + sum_i [(2/a_i) sin(k_i a_i/2)]^2`
  - `docs/plans/free-scalar-field-lattice-module.md:68`.

**Impact**
- `singleMode` initialization is not an eigenmode of the discretized update equation, causing immediate phase/frequency mismatch and undermining scientific validation workflows.

**Recommendation**
- Use lattice dispersion in initialization for `pi` (or explicitly label/guard the current behavior as an approximation).

### P2 - Top-bar mode label does not handle free-scalar mode

**Evidence**
- Mode label uses binary mapping (`hydrogenND` else `Harmonic Oscillator`): `src/components/layout/EditorTopBar/index.tsx:172`.

**Impact**
- Free-scalar sessions/export text are mislabeled as Harmonic Oscillator.

**Recommendation**
- Add explicit `freeScalarField` branch in mode labeling.

### P2 - Store/API exposes free-scalar controls that are not reachable in UI

**Evidence**
- Actions include spacing and packet-center setters: `src/components/sections/Geometry/SchroedingerControls/types.ts:115`, `src/components/sections/Geometry/SchroedingerControls/types.ts:121`.
- `FreeScalarFieldControls` does not render controls for spacing or packet center; these actions are not wired in this component: `src/components/sections/Geometry/SchroedingerControls/FreeScalarFieldControls.tsx:35`.

**Impact**
- Core physical parameters exist in model/store but are not user-configurable from UI, reducing reproducibility and educational exploration.

**Recommendation**
- Either expose these controls in UI or remove dead surface area until phase-2.

### P2 - `setFreeScalarGridSize` can violate documented inactive-dimension convention

**Evidence**
- Grid setter clamps Y/Z but does not enforce inactive dimensions to `1`: `src/stores/slices/geometry/schroedingerSlice.ts:700`.
- The lattice-dimension setter does enforce collapse to `1`: `src/stores/slices/geometry/schroedingerSlice.ts:684`.
- Plan expectation states unused dimensions should be `1`: `docs/plans/free-scalar-field-lattice-module.md:127`.

**Impact**
- In 1D/2D mode, programmatic or persisted writes can reintroduce hidden large Y/Z grids, inflating compute cost and changing effective dynamics.

**Recommendation**
- Enforce lattice-dimension consistency inside `setFreeScalarGridSize` (and optionally `setFreeScalarSpacing`).

## Test Coverage Gaps

- No direct tests for `FreeScalarFieldComputePass` behavior/lifecycle (resource rebuild, reset path, write-grid mapping).
- No regression test for mode switching into free-scalar from Wigner/2D prior state.
- Existing mode coverage tests still enumerate only HO/Hydrogen in key places:
  - `src/tests/rendering/webgpu/wgslCompilation.test.ts:157`
  - `src/tests/components/sections/ObjectTypeExplorer.test.tsx:16`

## Overall Verdict

FAIL (must-fix issues before considering free-scalar integration robust for scientific use).
