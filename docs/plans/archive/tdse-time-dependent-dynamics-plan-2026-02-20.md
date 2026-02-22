# Plan: TDSE Time-Dependent Dynamics (Ideal Single-Architecture Implementation)

Date: 2026-02-20  
Status: Proposed  
Scope: Add a single, production-grade TDSE implementation for wavepacket propagation, tunneling, scattering, and driven systems with maximum runtime performance and no interim architecture.

## 1. One-Shot Objective

Deliver one final TDSE architecture directly, not staged variants:

- physically meaningful time evolution (`psi(x,t)` dynamics)
- high-performance GPU-first execution path
- direct integration with existing WebGPU render graph and density-grid raymarching
- no temporary solver branch that later requires refactoring

This implementation must be the long-term system from day one.

## 2. Final Physics Model

## 2.1 Governing equation

Use TDSE in configuration space:

- `i*hbar*d_t psi = [-(hbar^2 / 2m) * Laplacian + V(x,t)] * psi`

Represent `psi` as two real fields on GPU buffers:

- `psiRe`
- `psiIm`

## 2.2 Potential model set (required)

Support these potentials natively (scenario-driven):

- free space (`V=0`)
- barrier (rectangular / Gaussian)
- step potential
- finite well
- harmonic trap
- driven potential: `V(x,t) = V0(x) + Vdrive(x) * f(t)`

## 2.3 Observables (first-class outputs)

Compute and expose:

- probability density `rho = |psi|^2`
- phase `arg(psi)`
- probability current `j = (hbar/m) * Im(conj(psi) * grad(psi))`
- total norm drift
- reflection/transmission coefficients for scattering/tunneling scenarios

## 2.4 Boundary treatment

Use complex absorbing boundary region (CAP/mask) to prevent non-physical edge reflections in finite domains.

## 2.5 Dimensional policy in this project

- TDSE evolution runs on the active spatial lattice selected by the global dimension flow.
- For dimensions above 3, rendering keeps the existing extra-dimension slice semantics so users can inspect high-dimensional states without breaking frame-time budgets.

## 3. Numerical Method (Single Chosen Method)

Use one solver architecture only: **split-operator Strang splitting (spectral TDSE)**.

Per step:

1. half-step potential in x-space
2. FFT to k-space
3. full-step kinetic in k-space
4. inverse FFT to x-space
5. half-step potential in x-space
6. apply absorbing mask

Why this is the final choice:

- unitary core evolution (excellent norm behavior)
- high arithmetic intensity on GPU
- fewer stability artifacts than explicit finite-difference stepping
- ideal for driven systems with midpoint-time operator evaluation

No fallback finite-difference solver is planned in the core architecture.

## 4. WebGPU Compute Architecture (Final)

## 4.1 New pass

Create one dedicated pass:

- `src/rendering/webgpu/passes/TDSEComputePass.ts`

This pass owns:

- simulation state buffers (`psiRe`, `psiIm`)
- potential texture/buffer resources
- FFT scratch ping-pong buffers
- diagnostics reduction buffers
- density-grid output texture(s) for the renderer

## 4.2 Render integration

Integrate into:

- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/rendering/webgpu/WebGPUScene.tsx`

Rules:

- TDSE mode uses density-grid sampling path (same object bind-group contract as free scalar)
- renderer compile/rebuild decisions continue using existing selective rebuild pipeline logic
- temporal reprojection and incompatible analytic-only features are disabled in TDSE mode at config-normalization boundary

## 4.3 Resource lifecycle and dirty rules

Reuse existing optimization patterns already proven in `FreeScalarFieldComputePass` and `WebGPUScene`:

- config-hash-based structural rebuilds only
- per-frame uniform writes only for truly time-varying values
- no per-frame GPU object creation
- no per-frame JS allocations in hot loops
- `needsReset` semantics for initialization-sensitive parameter changes

## 5. WGSL Module Contract

Add WGSL modules under `src/rendering/webgpu/shaders/schroedinger/compute/`:

- `tdseUniforms.wgsl.ts`
- `tdseInit.wgsl.ts`
- `tdsePotential.wgsl.ts`
- `tdseApplyPotentialHalf.wgsl.ts`
- `tdseFftStockham.wgsl.ts`
- `tdseApplyKinetic.wgsl.ts`
- `tdseAbsorber.wgsl.ts`
- `tdseDiagnostics.wgsl.ts`
- `tdseWriteGrid.wgsl.ts`

Output grid contract remains compatible with current shader pipeline:

- `R`: normalized density
- `G`: log-density
- `B`: phase channel for color algorithms
- `A`: reserved or selected diagnostic scalar

## 6. Store and Type Contract

## 6.1 Types

Update `src/lib/geometry/extended/types.ts`:

- extend `SchroedingerQuantumMode` with `tdseDynamics`
- add `TdseConfig`
- include:
- lattice shape and spacing
- `dt`, `stepsPerFrame`
- physical constants (`mass`, `hbar`)
- potential config
- drive config
- absorber config
- init packet config
- diagnostics toggles
- transient `needsReset`

## 6.2 Slice actions

Update:

- `src/stores/slices/geometry/types.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`

Add TDSE setter suite with strict clamping and explicit invalidation policies:

- geometry-changing values trigger full simulation reset
- runtime-safe values apply live
- all persistent changes increment `schroedingerVersion`
- transient clear action does not bump version

## 6.3 Serialization and presets

Update `src/stores/utils/presetSerialization.ts`:

- persist TDSE reproducible configuration
- strip runtime/transient fields (`needsReset`, runtime diagnostics caches)

## 7. UI Placement (Natural User Flow)

## 7.1 Mode entry

In `src/components/sections/ObjectTypes/ObjectTypeExplorer.tsx`:

- add **TDSE Dynamics** card
- description focused on “physics happening in time”

## 7.2 Configuration panel

In `src/components/sections/Geometry/SchroedingerControls/index.tsx`:

- add `TDSEControls.tsx` route when mode is `tdseDynamics`

Create `src/components/sections/Geometry/SchroedingerControls/TDSEControls.tsx` with this order:

1. scenario preset
2. packet initialization
3. potential setup
4. driven-system setup
5. domain/grid parameters
6. simulation numerics (`dt`, steps/frame, reset)
7. live diagnostics summary

Use existing UI primitives only (`Slider`, `ToggleGroup`, `Select`, `Switch`, `Button`, `Section`).

## 7.3 Timeline controls

In `src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx`:

- show TDSE runtime controls when TDSE mode is active:
- evolution speed multiplier
- drive enable/disable
- single-step button
- pause-at-next-step toggle

Keep existing global play/pause semantics intact.

## 7.4 Advanced panel gating

In advanced sections, hide or disable controls that are analytic-eigenstate specific and not physically correct for generic TDSE fields.

## 8. Performance Contract (Must-Hit)

The implementation is considered complete only if these runtime policies are present:

- fixed GPU memory budget by device tier
- hard cap on total lattice sites per tier
- adaptive simulation substep throttling when frame budget is exceeded
- decoupled simulation tick and render tick allowed (simulation can run at lower Hz under load while preserving visual continuity)
- diagnostics readback decimated (not every frame)
- zero-allocation hot loop (CPU)
- persistent bind groups and buffers
- strict compile-time feature normalization for TDSE mode
- full reuse of existing `qualityMultiplier`, `renderResolutionScale`, and fps cap controls from `performanceStore`

## 9. Verification Contract

## 9.1 Unit physics tests

Add `src/tests/lib/physics/tdse/`:

- norm conservation envelope
- free packet group velocity agreement
- tunneling/reflection trend checks
- driven response sanity checks

## 9.2 Store tests

Add `src/tests/stores/extendedObjectStore.tdse.test.ts`:

- clamping, reset semantics, version behavior, mode normalization

## 9.3 WGSL tests

Add `src/tests/rendering/webgpu/shaders/tdse.test.ts`:

- required bindings and struct layout
- FFT and operator block composition checks
- output-grid channel contract checks

## 9.4 Runtime GPU tests

Add Playwright specs under `scripts/playwright/`:

- no WebGPU/WGSL/render-graph errors in TDSE scenarios
- non-black and stable output in tunneling/scattering/driven presets
- no major frame-time spikes from TDSE parameter edits

## 10. Delivery Acceptance (Single Final Bar)

Done means all are true:

1. TDSE mode is fully selectable and usable from standard UI flow.
2. Wavepacket propagation, tunneling, scattering, and driven scenarios are all implemented with the same solver architecture.
3. Visual output uses existing density-grid volumetric renderer path without ad hoc rendering branch.
4. Norm/diagnostic telemetry is available and stable.
5. Existing harmonic/hydrogen/free-scalar modes remain intact.
6. Performance targets are met for tier-default lattice settings.
7. Test suite coverage for TDSE math/store/WGSL/runtime paths is in place.

## 11. References (Primary / Official)

- Feit, Fleck, Steiger (split-operator TDSE): [https://www.osti.gov/biblio/6654725](https://www.osti.gov/biblio/6654725)
- Strang splitting: [https://doi.org/10.1090/S0025-5718-1968-0220263-5](https://doi.org/10.1090/S0025-5718-1968-0220263-5)
- Floquet/driven systems context: [https://arxiv.org/abs/2503.17918](https://arxiv.org/abs/2503.17918)
- WebGPU spec: [https://www.w3.org/TR/webgpu/](https://www.w3.org/TR/webgpu/)
- WGSL spec: [https://www.w3.org/TR/WGSL/](https://www.w3.org/TR/WGSL/)
- MDN compute pipelines: [https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createComputePipeline](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createComputePipeline)
