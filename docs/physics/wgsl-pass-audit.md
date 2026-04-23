# WGSL Pass Shader Audit (Phase 2a)

**Purpose:** Classify every `createShaderModule` call site to plan Phase 1d (pass-level enumerator) and Phase 2b (refactor).

**Classifications:**

- **A (static import)** — imports a WGSL constant from a `.wgsl.ts` file, calls `createShaderModule` with it directly. Trivially enumerable; no refactor needed.
- **B (pure compose fn)** — imports a `compose{Name}Shader(config)` function that returns a WGSL string with no GPU dependency. Trivially enumerable; no refactor needed.
- **C (inline concat)** — WGSL string is built by concatenating imported blocks (`unifAndIndex + tdseInitBlock`, `preamble + pauliInitBlock`, etc.) inside the pass's setup function. Enumerable if we replicate the concatenation, but drift risk: if setup logic changes, the enumerator desyncs. Recommend refactor to extract a pure `compose{Name}Shader()` that setup calls.

Column *Shaders* counts distinct `createShaderModule` call sites in the file.

| File | Class | Shaders | Notes / Specialization axes |
|---|---|---|---|
| `renderers/schrodingerPipeline.ts` | B | 2 | `composeSchroedingerShader` (already covered by Phase 1a/1b enumerators) + vertex |
| `renderers/WebGPUSchrodingerRenderer.ts` | (delegates) | - | Wraps `schrodingerPipeline.ts`. |
| `renderers/WebGPUSkyboxRenderer.ts` | B | 1 | `composeSkyboxShader(config)` — covered by Phase 1d skybox enumerator. |
| `passes/AdsDensityComputePass.ts` | B | 1 | `composeAdsDensityComputeShader()` — 0 args. |
| `passes/EigenfunctionCacheComputePass.ts` | B | 1 | `composeEigenfunctionCacheComputeShader()` — 0 args. |
| `passes/DensityGridComputePass.ts` | B | 1 | `composeDensityGridComputeShader({...config})` — takes config. |
| `passes/WignerCacheComputePassSetup.ts` | B | 3 | `composeWignerCacheComputeShader`, `composeWignerSpatialComputeShader`, `composeWignerReconstructComputeShader`. |
| `passes/DisorderOverlay.ts` | B | 1 | `assembleShaderBlocks([disorderOverlayShaderBlock])` — wrap once. |
| `passes/BloomPass.ts` | A | 5 | 5 static imports from `bloom.wgsl.ts`: prefilter / downsample / upsample / composite / copy. |
| `passes/SMAAPass.ts` | A | 3 | 3 static imports from `smaa.wgsl.ts`: edge / blend / neighborhood. |
| `passes/FXAAPass.ts` | A | 1 | Static import from `fxaa.wgsl.ts`. |
| `passes/PaperTexturePass.ts` | A | 1 | Static import from `paperTextureShader.wgsl.ts`. |
| `passes/MeasurementPointCloudPass.ts` | A | 2 | Static imports: vertex + fragment from `pointCloud.wgsl.ts`. |
| `passes/ScenePass.ts` | A | 1 | Inline `COPY_SHADER` constant. |
| `passes/ToScreenPass.ts` | A | 1 | Inline `TO_SCREEN_SHADER` constant. |
| `passes/ToneMappingCinematicPass.ts` | A | 1 | Inline `TONEMAPPING_CINEMATIC_SHADER` constant. |
| `passes/FrameBlendingPass.ts` | A | 2 | Inline `FRAME_BLENDING_SHADER` + `COPY_SHADER` constants. |
| `passes/LightGizmoPass.ts` | A | 2 | Inline vertex + fragment constants. |
| `passes/DebugOverlayPass.ts` | A | 1 | Inline `DEBUG_OVERLAY_SHADER` constant. |
| `passes/BufferPreviewPass.ts` | A | 1 | Inline `BUFFER_PREVIEW_SHADER` constant. |
| `passes/EnvironmentCompositePass.ts` | A | 1 | Static shader. |
| `passes/CubemapCapturePass.ts` | A | 1 | Procedural module — static. |
| `passes/WebGPUTemporalCloudPassSetup.ts` | A | 2 | Imports reprojection + reconstruction from `temporal/*.wgsl.ts`. |
| `passes/CarpetSliceComputePass.ts` | A | 1 | Static `carpetSliceShader` import. |
| `passes/QuantumWalkDiagnostics.ts` | A | 2 | Imports `qwDiagReduceBlock` + `qwDiagFinalizeBlock`. |
| `passes/DensityGridGradientSetup.ts` | A | 1 | Static `gradientGridComputeShader` import. |
| `passes/TDSEComputePassSetup.ts` | **C** | ~15 | `unifAndIndex + tdseInitBlock`, + potentialHalf, kineticSolve, FFT, absorber, renormalize, pack/unpack, etc. Specialization: grid size, dimension, potential kind, FFT kernel choice. |
| `passes/DiracComputePassSetup.ts` | **C** | ~12 | `unifAndIndex + diracInitBlock` + potential / potentialHalf / kinetic / writeGrid / pack / unpack / renormalize / diag-reduce. |
| `passes/PauliComputePassSetup.ts` | **C** | ~8 | `preamble + pauliInitBlock` + potentialHalf / absorber / kinetic / writeGrid / pack / unpack / renormalize. |
| `passes/FreeScalarFieldComputePassSetup.ts` | **C** | ~5 | Mix of `assembleShaderBlocks(...)` and inline concat. |
| `passes/QuantumWalkPipelines.ts` | **C** | ~4 | `freeScalarNDIndexBlock + '\n' + quantumWalkShiftBlock`, etc. |
| `passes/TDSEObservablesGSPipelines.ts` | **C** | ~8 | Many inline concat calls. |
| `passes/TDSECurvedIntegrator.ts` | **C** | 4 | `unifAndIndex + tdseCurvedKineticBlock` + buildK / stage / accumulate. |
| `passes/TDSEStochasticLocalization.ts` | **C** | 3 | Inline concat — stochastic-loc + expect-reduce + expect-finalize. |
| `passes/TDSEComputePassHawking.ts` | **C** | 1 | Inline concat. |
| `passes/TDSEComputePassWormhole.ts` | **C** | 1 | Inline concat. |
| `passes/TDSEComputePassDisorder.ts` | **C** | (delegates to DisorderOverlay which is class B) | - |
| `passes/TDSEVortexDetect.ts` | **C** | 2 | `assembleShaderBlocks([...])` used inline. |
| `passes/TDSEComputePass.ts` | (orchestrator) | - | Delegates to TDSEComputePassSetup. |
| `passes/DiracComputePass.ts` | (orchestrator) | - | Delegates to DiracComputePassSetup. |
| `passes/FreeScalarFieldComputePass.ts` | (orchestrator) | - | Delegates to FreeScalarFieldComputePassSetup. |
| `passes/WignerCacheComputePass.ts` | (orchestrator) | - | Delegates to WignerCacheComputePassSetup. |
| `passes/WebGPUTemporalCloudPass.ts` | (orchestrator) | - | Delegates to WebGPUTemporalCloudPassSetup. |

## Summary

- **Class A (static):** ~24 shader module call sites across 14 files. Trivially enumerable — import the WGSL constant and feed to naga.
- **Class B (pure compose):** ~12 call sites across 7 files. Trivially enumerable — import the compose function, call with the realistic config space (or 0-args for the several 0-arg composers).
- **Class C (inline concat):** ~60+ call sites concentrated in compute-pass setup files (TDSE, Dirac, Pauli, FSF, QuantumWalk, TDSECurvedIntegrator, TDSEObservablesGSPipelines, TDSEVortexDetect, TDSEStochasticLocalization). Enumeration requires either (a) replicating the concat logic in the enumerator — fragile, drift risk; or (b) extracting each concatenation into a pure `compose{Name}(config): string` module in Phase 2b.

## Recommendation for Phase 2b

Refactor Class C files to expose pure compose functions per shader. The setup file then calls the compose function and passes the result to `createShaderModule`. No behavioral change; mechanical refactor. Roughly the work:

| File | Extract count |
|---|---|
| `TDSEComputePassSetup.ts` | ~15 compose functions |
| `DiracComputePassSetup.ts` | ~12 |
| `PauliComputePassSetup.ts` | ~8 |
| `TDSEObservablesGSPipelines.ts` | ~8 |
| `FreeScalarFieldComputePassSetup.ts` | ~5 |
| `QuantumWalkPipelines.ts` | ~4 |
| `TDSECurvedIntegrator.ts` | 4 |
| `TDSEStochasticLocalization.ts` | 3 |
| `TDSEVortexDetect.ts` | 2 |
| `TDSEComputePassHawking.ts` | 1 |
| `TDSEComputePassWormhole.ts` | 1 |
| **Total** | **~63 compose functions** |

After 2b, Phase 1d's pass-level enumerator becomes a straightforward walk over all compose functions × their documented config axes.
