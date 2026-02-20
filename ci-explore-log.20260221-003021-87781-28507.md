## Active Target
- Feature: free-scalar physics utilities (`src/lib/physics/freeScalar`)
- Mission: validate k-space analysis and vacuum-spectrum sampling correctness for free scalar mode (`quantumMode='freeScalarField'`) end-to-end.

## Task Queue Details
- [in_progress] Understand purpose of free-scalar physics utilities feature (src/lib/physics/freeScalar)
- [pending] Analyze src/lib/physics/freeScalar/kSpaceDisplayTransforms.ts
- [pending] Analyze src/lib/physics/freeScalar/kSpaceOccupation.ts
- [pending] Analyze src/lib/physics/freeScalar/kSpaceRadialSpectrum.ts
- [pending] Analyze src/lib/physics/freeScalar/vacuumSpectrum.ts
- [pending] Trace free-scalar k-space analysis flow (raw occupancy -> display transforms -> radial spectrum)
- [pending] Trace vacuum sampling flow (dispersion -> mode sampling -> inverse FFT -> field arrays)
- [pending] Evaluate free-scalar physics utilities feature against intended behavior

## Issues Found

## Issues Fixed

## Deferred for Developer

Purpose summary (2026-02-21):
- `src/lib/physics/freeScalar` provides the CPU-side scientific analysis utilities for free scalar mode: exact lattice vacuum sampler + FFT-derived k-space occupation observables.
- Intended behavior: preserve physics invariants (`<|phi_k|^2>=1/(2ω_k)`, `<|pi_k|^2>=ω_k/2`) and feed educational visualization without altering core occupation physics.
- Pipeline contract: raw stage computes physically defined `n_k`, `|k|`, `ω`; display stage applies only visualization transforms (fft-shift, exposure, broadening, packing).

## Analysis Notes
- [completed] Purpose gate evidence collected from module headers and free-scalar planning docs.
- [completed] Analyze src/lib/physics/freeScalar/kSpaceDisplayTransforms.ts
  - Symbols reviewed: `projectToDisplayGrid`, `projectDirect3D`, `projectMarginalize`, `applyExposureTransfer`, `applyBroadening`, `blurAxis`, `packDisplayTextures`, `buildKSpaceDisplayTextures`.
  - Callers traced: `FreeScalarFieldComputePass.readbackAndComputeKSpace()` and dedicated transform tests.
  - Data contract confirmed: this module is display-only and should not alter raw occupancy physics definitions.
- [completed] Analyze src/lib/physics/freeScalar/kSpaceOccupation.ts
  - Symbols reviewed: `float32ToFloat16`, `packRGBA16F`, `computeStrides`, `linearToNDCoords`, `ndToLinearIdx`, `computeRawKSpaceData`.
  - Call path validated: `FreeScalarFieldComputePass.readbackAndComputeKSpace()` passes active dims/spacing slices before FFT occupancy computation.

- [completed] Analyze src/lib/physics/freeScalar/kSpaceRadialSpectrum.ts
  - Symbols reviewed: `computeRadialShells`, `buildRadialDisplayGrid`.
  - Cross-path inconsistency found: `nkOmega` is documented as `n*omega`, but radial path computes it from normalized `omegaNorm`.

## Issues Found

1. Radial k-space display writes `nkOmega` using normalized omega units.
   - Location: `src/lib/physics/freeScalar/kSpaceRadialSpectrum.ts` (line using `nkOmega[outIdx] = n * shells.shellOmegaCenter[bin]!`).
   - Impact: `analysis.a` semantics differ between display modes; radial mode under-scales energy proxy by approximately `omegaMax`, causing inconsistent interpretation across `displayMode`.
   - Root cause: `shellOmegaCenter` is normalized in `computeRadialShells`, but used directly as physical omega in `buildRadialDisplayGrid`.
- [completed] Analyze src/lib/physics/freeScalar/vacuumSpectrum.ts
  - Symbols reviewed: `computeOmegaK`, `isPowerOf2`, `computeStrides`, `linearToNDCoords`, `ndToLinearIdx`, `sampleVacuumSpectrum`, `estimateVacuumMaxPhi`.
  - Traced callers: free-scalar compute pass initialization and vacuum-spectrum tests.
  - Validation summary: Hermitian-constrained k-space sampling + IFFT extraction path is internally consistent with stated lattice dispersion relation.
- [completed] Trace free-scalar k-space analysis flow (raw occupancy -> display transforms -> radial spectrum)
  - Flow: `FreeScalarFieldComputePass.readbackAndComputeKSpace()` -> `computeRawKSpaceData()` -> `buildKSpaceDisplayTextures()` -> (`projectToDisplayGrid` or `buildRadialDisplayGrid`) -> exposure/broadening -> packed textures for next-frame upload.
  - Decision points: async readback cadence (`kSpaceEveryNFrames`), projection mode switch (`displayMode`), FFT shift toggle, exposure mode, broadening toggle.
  - Failure mode observed: radial projection path writes `nkOmega` in normalized omega units while non-radial path writes physical omega units.

- [completed] Trace vacuum sampling flow (dispersion -> mode sampling -> inverse FFT -> field arrays)
  - Flow: `sampleVacuumSpectrum()` validates power-of-2 active dims -> computes lattice dispersion via `computeOmegaK()` -> samples independent/self-conjugate k-modes with Hermitian symmetry -> inverse FFT -> real `phi/pi` buffers.
  - Consumer path: `FreeScalarFieldComputePass.executeField()` uses this only for `initialCondition='vacuumNoise'`, otherwise WGSL init path.

- [completed] Evaluate free-scalar physics utilities feature against intended behavior
  - Purpose alignment: raw occupancy and vacuum sampler largely match intended physical contracts.
  - Defect retained for fix: `nkOmega` semantics mismatch in radial display path violates cross-mode consistency of analysis texture channel meanings.

## Issues Fixed

1. Radial display path now keeps `nkOmega` in physical `n*omega` units.
   - Code: `src/lib/physics/freeScalar/kSpaceRadialSpectrum.ts`
   - Change: multiply shell-normalized omega by `raw.omegaMax` when writing `nkOmega`.
   - Rationale: align channel semantics with non-radial paths and `KSpaceDisplayGrid` contract.

2. Added regression test for radial `nkOmega` unit consistency.
   - Code: `src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts`
   - Assertion: for occupied voxels, `nkOmega ≈ nk * omegaNorm * raw.omegaMax`.

Verification (all passing):
- `npx vitest run --maxWorkers=4 src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts`
- `npx vitest run --maxWorkers=4 src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts src/tests/lib/physics/freeScalar/vacuumSpectrum.test.ts src/tests/rendering/webgpu/shaders/freeScalar.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts`

---

## Active Target
- Feature: free-scalar WGSL compute shader module (`src/rendering/webgpu/shaders/schroedinger/compute/freeScalar*.wgsl.ts`)
- Mission: validate compute-shader correctness for init/update/writeGrid and analysis texture contracts.

## Task Queue Details
- [in_progress] Understand purpose of free-scalar WGSL compute shader module (src/rendering/webgpu/shaders/schroedinger/compute/freeScalar*.wgsl.ts)
- [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl.ts
- [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarNDIndex.wgsl.ts
- [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePhi.wgsl.ts
- [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePi.wgsl.ts
- [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl.ts
- [pending] Trace free-scalar compute execution flow (init/reset -> leapfrog updates -> writeGrid outputs)
- [pending] Trace free-scalar analysis-mode data flow (analysisMode uniform -> analysis texture channel contracts)
- [pending] Evaluate free-scalar WGSL compute shader module against intended behavior

WGSL purpose summary (2026-02-21):
- `freeScalar*.wgsl.ts` defines GPU compute kernels for free scalar dynamics: initialization, leapfrog updates (`pi` then `phi`), and 3D density/analysis texture writes for rendering.
- Intended constraints: N-D lattice support via shared index helpers, periodic boundaries, and analysis-mode channel contracts consistent with educational color algorithms.
- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl.ts
  - Reviewed `freeScalarUniformsBlock` + `freeScalarInitBlock` and composition usage in `FreeScalarFieldComputePass`.

- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarNDIndex.wgsl.ts
  - Reviewed `freeScalarNDIndexBlock`; traced reuse in both FreeScalar and TDSE compute passes.

- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePhi.wgsl.ts
  - Reviewed `freeScalarUpdatePhiBlock`; verified leapfrog phi update path.

- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePi.wgsl.ts
  - Reviewed `freeScalarUpdatePiBlock`; verified periodic Laplacian usage.

- [completed] Analyze src/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl.ts
  - Reviewed `freeScalarWriteGridBlock`; traced field-view and analysis-mode branching.

## Issues Found

2. `freeScalarWriteGrid` can read uninitialized `gradPhi[d]` values in flux mode.
   - Location: `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl.ts`
   - Impact: when any active axis has `gridSize[d] <= 1`, `analysisMode == 2` may accumulate undefined values into `(Sx,Sy,Sz)` and `Smag`.
   - Root cause: `gradPhi[d]` is only assigned when `gridSize[d] > 1` during gradient pass, but later read unconditionally for all active dimensions during flux projection.
- [completed] Trace free-scalar compute execution flow (init/reset -> leapfrog updates -> writeGrid outputs)
  - Composition: `freeScalarUniformsBlock + freeScalarNDIndexBlock` prepended to init/updatePi/writeGrid; updatePhi uses uniforms-only composition.
  - Runtime order in pass: reset/init (CPU vacuum or WGSL init) -> leapfrog drift/kick loop -> writeGrid dispatch.

- [completed] Trace free-scalar analysis-mode data flow (analysisMode uniform -> analysis texture channel contracts)
  - `FreeScalarFieldComputePass.updateUniforms()` sets `analysisMode` from color algorithm (`12/13 -> 1`, `14 -> 2`, `15 -> 3`).
  - `analysisMode==3` routes to async CPU k-space textures; `freeScalarWriteGrid` returns early for GPU writes.
  - `analysisMode==1/2` writes educational observables in WGSL to analysis texture channels.

- [completed] Evaluate free-scalar WGSL compute shader module against intended behavior
  - Main defect: flux path can consume uninitialized `gradPhi[d]` values on degenerate axes, violating deterministic analysis output expectations.
3. Flux-mode gradient buffer safety fix in free-scalar write-grid shader.
   - Code: `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl.ts`
   - Change: initialize `gradPhi[d] = 0.0` before degenerate-axis early-continue.
   - Effect: prevents undefined `Sx/Sy/Sz` contributions when `analysisMode == 2` and any active axis has `gridSize[d] <= 1`.

4. Regression test added for degenerate-axis gradPhi initialization.
   - Code: `src/tests/rendering/webgpu/shaders/freeScalar.test.ts`
   - Assertion: shader source contains explicit `gradPhi[d] = 0.0` initialization in gradient loop.

Additional verification (all passing):
- `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/shaders/freeScalar.test.ts`
- `npx vitest run --maxWorkers=4 src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts src/tests/lib/physics/freeScalar/vacuumSpectrum.test.ts src/tests/rendering/webgpu/shaders/freeScalar.test.ts src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts src/tests/stores/extendedObjectStore.freeScalar.test.ts`

---

## Active Target
- Feature: FreeScalarFieldComputePass runtime orchestration
- Module: `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`

## Task Queue Details
- [in_progress] Understand purpose of FreeScalarFieldComputePass runtime orchestration (src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts)
- [pending] Analyze src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts
- [pending] Trace uniform packing contract (TS offsets -> FreeScalarUniforms WGSL layout)
- [pending] Trace async k-space readback lifecycle (encoder copy -> mapAsync -> pending texture upload)
- [pending] Evaluate FreeScalarFieldComputePass against intended behavior

FreeScalarFieldComputePass purpose summary (2026-02-21):
- This pass is the runtime bridge between free-scalar physics state and renderable 3D textures.
- It owns compute pipeline composition, per-frame leapfrog stepping, and asynchronous k-space readback/transform/upload cadence for analysis mode 3.
