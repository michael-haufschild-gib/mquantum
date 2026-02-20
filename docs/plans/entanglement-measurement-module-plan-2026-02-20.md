# Plan: Entanglement + Measurement Module (Ideal End-State, Performance-First)

Date: 2026-02-20  
Status: Proposed  
Scope: `ObjectType = 'schroedinger'` only

## 1. Mission

Implement one complete, final architecture for entanglement + measurement in a single pass, with no intermediate compatibility layers:

1. Bipartite state construction.
2. Reduced density matrices via partial trace.
3. Entanglement entropy.
4. Bell/CHSH experiment engine (exact + shot-based).
5. Integrated UI in natural user location.
6. Optional low-cost visual overlay path in shaders.

The implementation should be production-grade for teaching, numerically stable, and FPS-safe by design.

## 2. End-State Product Behavior

A student should be able to:

1. Choose a state preset (product, Bell, partial entanglement).
2. See `rho_A`, `rho_B`, purity, and entropy update immediately.
3. Choose CHSH measurement settings and read `E` terms + `S` instantly.
4. Run finite-shot simulation and compare sampled vs exact CHSH.
5. Keep rendering smooth while all analysis runs.

No mode-switch detours, no temporary data models, and no planned refactors.

## 3. Canonical Math Architecture

## 3.1 State model (single canonical representation)

Use one internal representation for all entanglement calculations:

- Bipartite pure state `|psi>` in `C^(dA*dB)`.
- Basis index mapping: `i = a*dB + b`.
- Complex amplitudes stored as interleaved typed arrays for low allocation.

Default UI starts at `dA=2`, `dB=2` (qubits), but math API remains generic over `dA`, `dB`.

## 3.2 Density matrices and reduced states

Core formulas:

- `rho = |psi><psi|`
- `rho_A[a,a'] = sum_b psi[a,b] * conj(psi[a',b])`
- `rho_B[b,b'] = sum_a psi[a,b] * conj(psi[a,b'])`

Required invariants (asserted in tests and debug checks):

- Hermitian symmetry.
- `Tr(rho_A)=1`, `Tr(rho_B)=1`.
- Non-negative eigenvalues up to tolerance.

## 3.3 Entanglement entropy

Compute:

- `S_A = -Tr(rho_A log2 rho_A)`
- `S_B = -Tr(rho_B log2 rho_B)`

Numerical strategy:

1. Closed-form eigenvalue path for 2x2 Hermitian matrices (fast and stable for qubit default).
2. Generic Hermitian eigensolver fallback for larger dimensions.
3. Epsilon clamp and renormalize eigenvalues before entropy.

This avoids unstable `NaN` behavior near zero eigenvalues and keeps the hot path very cheap for the common case.

## 3.4 Measurement + CHSH engine

For qubits, represent local observables by Bloch directions:

- `A = a_hat · sigma`
- `B = b_hat · sigma`
- `E(a,b) = <psi| A tensor B |psi>`

CHSH:

- `S = E(a,b) + E(a,b') + E(a',b) - E(a',b')`

Output must always show:

- Four correlators.
- `S` value.
- Threshold references at `2` (classical) and `2*sqrt(2)` (Tsirelson).

## 3.5 Shot-based experiment engine

Implement deterministic, high-throughput sampling:

1. Compute exact 4-outcome probabilities per setting.
2. Draw outcomes with seeded PRNG.
3. Aggregate correlators and CHSH estimate.
4. Return confidence interval/error bar.

Execution model:

- Main thread for small shot counts.
- Worker offload for large shot counts.
- Cancelable runs (new run cancels old run).

## 4. Store Architecture (No Renderer Coupling)

Create a dedicated store for this module:

- `src/stores/entanglementStore.ts`

Do not place analysis inputs/results into `extendedObjectStore.schroedinger`.

Reason:

- `schroedingerVersion` increments trigger uniform updates and can cascade into rendering work.
- Entanglement analysis is mostly CPU math + UI and should not invalidate rendering paths.

Store responsibilities:

1. User-configurable inputs (state + measurement + sampling config).
2. Derived exact results cache.
3. Sampling runtime state (`idle/running/done/error`).
4. Hash/version-based memo invalidation.

Selector strategy:

- `useShallow` grouped selectors.
- Stable callbacks from store actions.
- No broad subscriptions.

## 5. UI Architecture (Natural Human Placement)

## 5.1 Placement

Primary control surface:

- Right panel -> `Object` tab -> `Analysis` section in `src/components/sections/Advanced/SchroedingerCrossSectionSection.tsx`.

Add a dedicated `ControlGroup`:

- `Entanglement & Measurement`

This is the correct mental-model location: users tune state on the left and inspect physics meaning on the right.

## 5.2 Control layout

In one vertically ordered block:

1. `State`:
- Preset selector (`Product`, Bell family, tunable partial entanglement).
- Simple slider for `theta` in `cos(theta)|00> + sin(theta)|11>`.
- Advanced manual amplitude editor inside collapsed subsection.

2. `Measurement`:
- CHSH preset selector (`Optimal`, `Aligned`, `Custom`).
- Controls for `a`, `a'`, `b`, `b'`.
- Exact/sampling mode toggle.
- Shots + seed controls when sampling is enabled.

3. `Results`:
- Compact `rho_A`/`rho_B` tables.
- Entropy + purity cards.
- Correlator table.
- CHSH card with clear classical/quantum threshold markers.

## 5.3 Usability defaults

- Module starts collapsed.
- Default preset is a simple product state.
- "Optimal CHSH" quick action shows a known violation immediately.
- Advanced controls hidden unless requested.

## 6. Shader and Renderer Integration (Low-Cost, Optional Visual Layer)

Entanglement calculations remain CPU-side; shaders receive only compact summary scalars when visual overlay is enabled.

## 6.1 Uniform additions (small and stable)

Extend Schrödinger uniform block with a tiny entanglement overlay payload:

- `entanglementOverlayEnabled`
- `entanglementEntropy`
- `chshS`
- `chshViolationStrength`
- `entanglementOverlayMode`

Touchpoints:

- `src/rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

## 6.2 Shader usage

Add cheap runtime compositing hooks only:

- `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/main.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/compose.ts`

Rules:

1. No per-sample matrix operations.
2. No new heavy branches in raymarch loop.
3. Prefer post-color tinting or subtle outline cues.
4. Keep compile-time specialization unchanged unless absolutely required.

Result: visible educational feedback without measurable render cost when overlay is off.

## 7. Performance Design (Max FPS)

## 7.1 Hot-path constraints

1. Compute exact metrics only on relevant input changes.
2. Reuse typed arrays for all math intermediates.
3. Avoid object allocation in inner loops.
4. Keep qubit path branch-optimized (2x2 analytic formulas).

## 7.2 Sampling throughput constraints

1. Chunked execution for responsiveness.
2. Worker offload above threshold.
3. Incremental progress updates at capped frequency.
4. Cancel stale jobs immediately on input change.

## 7.3 React/store constraints

1. `useShallow` selectors for grouped reads.
2. No derived recompute inside render when hash unchanged.
3. No writes to renderer-coupled stores for analysis-only state.

## 7.4 Renderer constraints

1. Uniform writes only on overlay-related change.
2. No shader recompilation triggered by analysis value changes.
3. Keep existing dirty-flag optimization behavior intact.

## 7.5 Charting and visual widgets

Use lightweight in-house bars/tables (same style as second-quantization cards), not heavy chart libraries.

## 8. File-Level Implementation Map

## New files

- `src/lib/math/entanglementMeasurement.ts`
- `src/tests/lib/math/entanglementMeasurement.test.ts`
- `src/stores/entanglementStore.ts`
- `src/tests/stores/entanglementStore.test.ts`
- `src/components/sections/Advanced/EntanglementMeasurementSection.tsx`
- `src/tests/components/sections/Advanced/EntanglementMeasurementSection.test.tsx`
- `src/workers/chshSampler.worker.ts` (worker path)

## Updated files

- `src/components/sections/Advanced/SchroedingerCrossSectionSection.tsx`
- `src/components/layout/EditorRightPanel.tsx` (only if standalone section insertion is preferred)
- `src/rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/main.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/compose.ts`
- `src/stores/utils/presetSerialization.ts` (only if entanglement config must persist in presets)

## 9. Verification and Acceptance

The implementation is accepted only when all are true:

1. Math correctness:
- Product states yield near-zero entropy.
- Bell states yield near-maximal qubit entropy.
- `S_A ~= S_B`.
- CHSH exact path reproduces classical and quantum reference values.

2. Sampling correctness:
- Sampled CHSH converges to exact value with increasing shots.
- Confidence intervals shrink with shots.
- Seeded runs are reproducible.

3. Performance:
- No observable FPS drop when module is collapsed/idle.
- No renderer rebuild spikes from analysis-only interactions.
- UI remains responsive during large shot experiments.

4. UX quality:
- A beginner can produce and recognize CHSH violation in under one minute.
- Control placement feels coherent with existing Analysis/education sections.

## References

- IBM Quantum Learning (density matrices, reduced states): <https://learning.quantum.ibm.com/course/general-formulation-of-quantum-information/density-matrices>
- Qiskit quantum_info API (`partial_trace`, `entropy`): <https://qiskit.qotlabs.org/api/qiskit/quantum_info>
- IBM CHSH learning module: <https://quantum.cloud.ibm.com/learning/modules/quantum-mechanics/bells-inequality-with-qiskit>
- CHSH original paper: <https://doi.org/10.1103/PhysRevLett.23.880>
- Tsirelson bound: <https://doi.org/10.1007/BF00417500>
