# Plan: Open Quantum Systems (Density Matrix + Decoherence) - Single-Pass Implementation

Date: 2026-02-20  
Status: Proposed  
Scope: `ObjectType = 'schroedinger'`, WebGPU renderer, WGSL shaders, Zustand stores, UI controls, and diagnostics in one integrated delivery

## 1. Goal

Implement open quantum system dynamics end-to-end in one go, with production quality and no staged rollout:

1. Density-matrix state evolution with GKLS/Lindblad dynamics.
2. Physically meaningful decoherence channels.
3. Purity and entropy diagnostics with live visualization.
4. Natural UI placement across Geometry, Timeline, Surface, and Diagnostics.
5. FPS-safe implementation reusing existing renderer/store optimization patterns.

## 2. Final Feature Scope (All Included Together)

The completed feature must ship with all of the following at once:

1. Mixed-state simulation (`rho`, not only pure `psi` coefficients).
2. Lindblad channels:
   - dephasing
   - amplitude damping (relaxation)
   - thermalized up/down transitions
3. Metrics:
   - purity `Tr(rho^2)`
   - linear entropy `1 - Tr(rho^2)`
   - von Neumann entropy `-Tr(rho log rho)`
   - coherence magnitude from off-diagonal weight
4. Rendering outputs:
   - density remains stable in existing volumetric path
   - purity/entropy/coherence color modes
5. UX:
   - model/channel controls
   - temporal/decoherence speed controls
   - live diagnostics panel and chart
6. Validation:
   - physics correctness tests
   - shader/render wiring tests
   - Playwright GPU/console gates

## 3. Physics and Numerical Specification

## 3.1 State

1. Represent state in the existing finite basis (`K <= 8`, tied to current term system).
2. Store `rho` as complex Hermitian matrix (`K x K`).
3. Enforce physical constraints continuously:
   - Hermitian
   - positive semidefinite
   - trace = 1

## 3.2 Dynamics

Use GKLS equation:

`d rho / dt = -i [H, rho] + sum_j (L_j rho L_j^dagger - 0.5 {L_j^dagger L_j, rho})`

with:

1. `H` from current per-term energies.
2. `L_j` from channel settings in UI.

## 3.3 Channels

Implement all three channels in the same delivery:

1. Dephasing:
   `L_k = sqrt(gamma_phi_k) |k><k|`
2. Relaxation:
   `L_{k->g} = sqrt(gamma_down_k) |g><k|`
3. Thermal transitions:
   `L_{g->k} = sqrt(gamma_up_k) |k><g|`
   with controlled up/down ratio settings.

## 3.4 Integrator and Physicality Guards

Use positivity-friendly stepping from day one:

1. Split step:
   - unitary commutator part
   - dissipative channel-map part
2. After each step:
   - Hermitian symmetrization
   - trace renormalization
3. Positivity safety:
   - eigenvalue floor to `eps`
   - renormalize

## 3.5 CPU Placement

Place density-matrix evolution in TypeScript for this delivery:

1. `K <= 8` makes compute cost small.
2. Current project WASM path is synchronous math-kernel oriented, not a dedicated open-system worker pipeline.
3. Keep data layout and API compatible with future Rust/WASM promotion if profiling demands it.

## 4. Code Architecture Changes

## 4.1 New Physics Modules

Add:

1. `src/lib/physics/openQuantum/types.ts`
2. `src/lib/physics/openQuantum/channels.ts`
3. `src/lib/physics/openQuantum/lindblad.ts`
4. `src/lib/physics/openQuantum/integrator.ts`
5. `src/lib/physics/openQuantum/metrics.ts`
6. `src/lib/physics/openQuantum/statePacking.ts`

Responsibilities:

1. Build channel operators from config.
2. Evolve `rho` per simulation tick.
3. Compute and expose metrics.
4. Pack GPU upload buffers without per-frame allocation churn.

## 4.2 Store and Type Extensions

Update:

1. `src/lib/geometry/extended/types.ts`
2. `src/stores/slices/geometry/types.ts`
3. `src/stores/slices/geometry/schroedingerSlice.ts`

Add `schroedinger.openQuantum` config:

1. `enabled`
2. `dt`, `substeps`
3. channel toggles + rates
4. thermal parameters
5. visualization selector (`density`, `purity`, `entropy`, `coherence`)
6. diagnostics selector (chart window, overlays)

Add runtime diagnostics store:

1. `src/stores/openQuantumDiagnosticsStore.ts`
2. fixed-size ring buffer for metric history
3. decoupled write cadence from draw cadence

Update serialization:

1. URL serializer/deserializer
2. preset serialization so open-system settings are scene-restorable

## 4.3 Renderer and Render Graph Integration

Update:

1. `src/rendering/webgpu/WebGPUScene.tsx`
2. `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
3. `src/rendering/webgpu/passes/DensityGridComputePass.ts` (or dedicated open-quantum density pass if cleaner)

Behavior:

1. Simulate `rho` each tick on CPU.
2. Upload compact open-quantum uniform/texture data only when version changes.
3. Reuse density-grid flow so raymarch hot loop samples cached quantities.
4. Keep selective pass rebuild logic aligned with current `extractSchrodingerConfig` patterns.

## 4.4 WGSL and Shader Composition Changes

Update:

1. `src/rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts`
2. `src/rendering/webgpu/shaders/schroedinger/compose.ts`
3. `src/rendering/webgpu/shaders/schroedinger/compute/densityGrid.wgsl.ts`
4. `src/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl.ts`
5. `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`
6. `src/rendering/webgpu/shaders/types.ts`
7. `src/rendering/shaders/palette/types.ts`

Add:

1. Open-quantum compile-time flags and runtime uniforms.
2. Purity/entropy/coherence shader branches.
3. Bind-group-safe resource wiring (stay within 4 bind groups).
4. Algorithm IDs for new color modes with strict mapping parity across TS/WGSL.

## 5. UI/UX Placement (Natural Workflow)

## 5.1 Left Panel -> Geometry -> Quantum State

Add `OpenQuantumControls` inside existing Schrodinger controls:

1. Open-system master toggle.
2. Channel enables and rates.
3. Integrator controls (advanced collapsed by default).
4. Thermal model controls.

Location:

1. `src/components/sections/Geometry/SchroedingerControls/OpenQuantumControls.tsx`
2. Wire into `src/components/sections/Geometry/SchroedingerControls/index.tsx`

## 5.2 Bottom Timeline Drawer

Add dynamic controls where users already manage time behavior:

1. Decoherence rate multiplier.
2. Open-system pause/resume.
3. Reset to pure-state baseline.

Location:

1. `src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx`

## 5.3 Right Panel -> Object Tab

Add diagnostics section near existing quantum analysis controls:

1. Live purity, entropy, coherence values.
2. Rolling chart.
3. Formula/help text toggle for teaching context.

Location:

1. `src/components/sections/Advanced/OpenQuantumDiagnosticsSection.tsx`
2. Mount in `src/components/layout/EditorRightPanel.tsx`

## 5.4 Right Panel -> Surface -> Colors

Add visualization algorithms to existing selector flow:

1. `Purity Map`
2. `Entropy Map`
3. `Coherence Map`

Location:

1. `src/components/sections/Faces/ColorAlgorithmSelector.tsx`
2. `src/components/sections/Faces/ColorPreview.tsx`
3. `src/rendering/shaders/palette/types.ts`

## 6. Performance Strategy (Max FPS)

Reuse current optimization architecture instead of introducing new complexity:

1. Versioned updates:
   - open-quantum version counters for strict dirty updates.
2. No hot-path allocations:
   - preallocate all CPU buffers and upload staging arrays.
3. Cached density-grid usage:
   - never do `O(K^2)` density-matrix math inside raymarch sample loop.
4. Decimated expensive metrics:
   - entropy eigendecomposition at fixed reduced cadence.
5. Automatic quality response:
   - if FPS drops, reduce open-system update substeps before touching global visual quality.

## 7. Single Execution Checklist

Execute this checklist as one continuous implementation:

1. Add and test open-quantum physics core in `src/lib/physics/openQuantum`.
2. Extend Schrodinger config/store/actions/selectors.
3. Add diagnostics runtime store and ring buffer.
4. Wire render graph and renderer upload path for open-quantum data.
5. Extend WGSL compose/uniform/emission/density-grid modules.
6. Add new color algorithms and mapping parity tests.
7. Add Geometry, Timeline, and Diagnostics UI controls.
8. Wire URL/preset serialization.
9. Run full test set (unit + integration + Playwright GPU gates).
10. Run lint/format and verify no performance regressions in representative scenes.

## 8. Testing and Verification Requirements

## 8.1 Physics Tests

Add under `src/tests/lib/physics/openQuantum/`:

1. `Tr(rho)` invariance near 1.
2. Hermiticity preservation.
3. Positivity (`lambda_min >= -eps`).
4. Dephasing decreases off-diagonal coherence.
5. Relaxation increases ground population.
6. Entropy increase / purity decrease behavior under nonzero decoherence.

## 8.2 Store/Serialization Tests

Add under `src/tests/stores/` and URL serializer tests:

1. action clamps and mode gating.
2. open-system config round-trip through URL.
3. preset save/load fidelity for all new fields.

## 8.3 Shader/Renderer Tests

Add under `src/tests/rendering/webgpu/`:

1. WGSL contains expected bindings/defines.
2. color algorithm integer mappings remain synchronized.
3. pass enable/disable logic is correct.
4. bind group counts and formats stay valid.

## 8.4 E2E Tests

Add/update Playwright specs:

1. UI flow and control visibility.
2. no WebGPU/WGSL/render-graph console errors.
3. diagnostics values update when channels are active.
4. basic performance smoke check.

## 9. Done Criteria

Feature is complete only when all are true:

1. Open-system mode behaves physically (trace, positivity, entropy/purity trends).
2. Channels and rates produce clear, expected visual and metric behavior.
3. Purity/entropy/coherence visualizations are available and stable.
4. UI feels native to existing editor layout, no control duplication/confusion.
5. FPS remains acceptable and degradation is controlled by existing quality pathways.
6. Existing Schrodinger scenes still load/render correctly.
7. Test suite and Playwright gates pass.

## 10. Risks and Mitigations

1. Risk: numerical instability.
   Mitigation: positivity-preserving stepping + post-step physicality guards + eigenvalue tests.
2. Risk: shader regression from new branches.
   Mitigation: compile-time specialization and mapping parity tests.
3. Risk: UI overload.
   Mitigation: compact defaults and advanced collapsible controls.
4. Risk: frame-time spikes.
   Mitigation: decimated entropy updates, strict dirty writes, preallocated buffers.

## 11. Primary References

1. GKLS and Lindblad foundations:
   - [Gorini et al., 1976](https://www.sciencedirect.com/science/article/pii/0375960176900058)
   - [Lindblad, 1976](https://www.sciencedirect.com/science/article/pii/0003491676900414)
2. Practical Lindblad simulation reference:
   - [QuTiP master equation guide](https://qutip.readthedocs.io/en/latest/guide/dynamics/dynamics-master.html)
3. Purity definitions/API reference:
   - [Qiskit quantum_info purity](https://qiskit.qotlabs.org/docs/api/qiskit/quantum_info)
4. Von Neumann entropy implementation reference:
   - [QuTiP entropy module](https://qutip.org/docs/4.6/modules/qutip/entropy.html)
5. Positivity-preserving integrator discussion:
   - [ExpEul positivity-preserving analysis](https://arxiv.org/html/2408.13601v1)
