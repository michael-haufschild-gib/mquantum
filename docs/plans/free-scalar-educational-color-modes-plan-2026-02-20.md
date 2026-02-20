# Plan: Free Scalar Field Educational Color Modes (4 QFT-Focused Modes)

Date: 2026-02-20
Status: Proposed
Scope: `quantumMode = freeScalarField` only

## 1. Objective

Add four free-scalar-specific color/analysis modes that teach core QFT and lattice-field concepts directly from simulation data, instead of reusing wavefunction-centric palettes.

Target modes:
1. Hamiltonian Decomposition
2. Mode Character Map
3. Energy Flux Map
4. k-Space Occupation Map

## 2. Student Learning Goals

Each mode should help students answer one concrete physics question:

1. Hamiltonian Decomposition: where is local energy stored (`pi^2`, gradient, mass term)?
2. Mode Character Map: is a region wave-like (gradient/kinetic dominated) or mass-dominated?
3. Energy Flux Map: where and in what direction does field energy propagate?
4. k-Space Occupation Map: which momentum modes are populated, and how far from vacuum behavior?

## 3. Physics Definitions (Canonical)

For real Klein-Gordon field on lattice:

- `K(x) = 0.5 * pi(x)^2`
- `G(x) = 0.5 * |grad phi(x)|^2` (discrete finite difference, matching current update stencil)
- `V(x) = 0.5 * m^2 * phi(x)^2`
- `E(x) = K + G + V`

Flux (educational convention):

- `S_i(x) = -pi(x) * grad_i phi(x)`

(If sign convention is flipped by metric convention in docs, keep renderer and docs consistent.)

Free-field mode occupation (per lattice mode):

- `omega_k^2 = m^2 + sum_i [ 2*sin(pi*n_i/N_i)/a_i ]^2`
- `n_k = (|pi_k|^2 + omega_k^2 * |phi_k|^2) / (2*omega_k) - 1/2`

## 4. Mode-by-Mode Specification

## 4.1 Hamiltonian Decomposition

What to encode:
- Hue/chroma from energy composition fractions:
  - `fK = K / (E + eps)`
  - `fG = G / (E + eps)`
  - `fV = V / (E + eps)`
- Brightness from `E` (linear or log)

Recommended mapping:
- `RGB = normalize([fK, fG, fV]) * brightness(E)`
- optional colorblind-safe alternative palette with fixed anchors for K/G/V

UI controls:
- Brightness source: `E` or `log(E+eps)`
- Energy normalization: `global` vs `local percentile`
- Legend toggle (mandatory default: on)

## 4.2 Mode Character Map

What to encode:
- Character ratios:
  - `R_wave = G / (V + eps)`
  - `R_dyn = K / (V + eps)`
- Single scalar educational index (example):
  - `C = atan2(R_dyn, R_wave)` or bounded combination

Recommended mapping:
- Hue from `C`
- Value from `E` (or `sqrt(E)`)
- Saturation from confidence `min(1, E / E_ref)`

UI controls:
- Ratio basis selector: `G/V`, `K/V`, combined
- Clamp strategy: hard clamp vs soft log clamp
- Show formula overlay toggle

## 4.3 Energy Flux Map

What to encode:
- Direction from projected 3D flux vector `S_proj`
- Magnitude from `|S_proj|`

Recommended mapping:
- Direction color wheel (cyclic) for orientation
- Brightness/intensity from `|S|` with log option
- Optional streamline/LIC overlay (phase 2)

UI controls:
- Magnitude scale and log toggle
- Arrow/streamline overlay enable
- Density threshold for flux visibility

## 4.4 k-Space Occupation Map

What to encode:
- `n_k` and optionally `n_k * omega_k` (energy-weighted occupation)

Important representation decision:
- This mode is fundamentally spectral, not local-in-x color.
- Implement as a dedicated panel/overlay (2D spectral view), not only voxel color.

Recommended presentation:
- 2D slice of k-space (`kx-ky`, fixed `kz`/extra-dim selection)
- radial spectrum summary chart `n(|k|)`
- optional comparison baseline for exact vacuum

UI controls:
- plane selection (`kx-ky`, `ky-kz`, etc.)
- log/linear scale
- occupancy vs energy-weighted occupancy
- vacuum baseline subtraction toggle

## 5. Pipeline and Shader Architecture Changes

## 5.1 Data-flow extension

Current free scalar output packs `[rho, logRho, signPhaseProxy, _]` into one 3D texture. New educational modes need additional per-voxel observables.

Plan:
1. Add `FreeScalarAnalysisComputePass` after field update and before volume render.
2. Compute per-voxel observables into analysis texture(s):
   - texture A (`rgba16float`): `K, G, V, E`
   - texture B (`rgba16float`): `Sx, Sy, Sz, |S|`
3. Keep existing density texture for backward-compatible modes.

k-space path:
1. Add `FreeScalarSpectrumPass` (CPU/WASM FFT first milestone, GPU later).
2. Produce 2D spectrum textures/buffers for UI panel and optional overlay.

## 5.2 Shader changes

Files to update:
- `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/compose.ts`

Plan:
1. Add new algorithm IDs for free-scalar educational modes (or a free-scalar-only submode switch).
2. Add bindings for analysis textures and sampling helpers.
3. Add branch implementations for modes 1-3 in emission path.
4. Keep k-space mode mostly UI/panel driven; only optional in-volume tint hook.

## 5.3 Renderer integration

Files:
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`

Plan:
1. Instantiate/bind new analysis pass resources only for `freeScalarField`.
2. Extend object bind group layout for analysis textures/samplers.
3. Ensure 2D/3D free-scalar path consistency with current forced volumetric behavior.
4. Maintain compatibility with existing density-grid path for legacy algorithms.

## 6. Store and Type Changes

## 6.1 Free-scalar-specific settings (recommended location)

Put new educational color mode settings under `freeScalar` config rather than global appearance settings.

Files:
- `src/lib/geometry/extended/types.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/stores/slices/geometry/types.ts`

Proposed additions:
- `freeScalar.educationalColorMode: 'hamiltonianDecomposition' | 'modeCharacter' | 'energyFlux' | 'kSpaceOccupation' | 'off'`
- `freeScalar.educationalColorSettings` object with per-mode params
- actions: `setFreeScalarEducationalColorMode`, `setFreeScalarEducationalColorSettings`

## 6.2 Appearance store interaction

Keep `appearance.colorAlgorithm` for shared generic algorithms, but when `quantumMode === 'freeScalarField'` and educational mode is enabled:
- either override active shader branch
- or expose a dual selector in UI (`General Palette` + `Educational Layer`)

This avoids overloading HO/hydrogen semantics.

## 7. UI Plan (Intentionally Expanded for Teaching)

## 7.1 Geometry tab (free scalar)

Add a new section: `QFT Analysis Color Modes`

Controls:
1. Mode selector (4 modes + Off)
2. Mode-specific controls block
3. "Show equation" toggle (inline formula card)
4. "Show legend" toggle (persistent color legend)
5. "Show diagnostics" toggle (summary numbers)

## 7.2 Faces/Surface tab

When in free scalar:
1. Keep generic algorithm selector under `General Palette` (optional)
2. Add `Educational Layer` selector and explain precedence
3. Disable irrelevant psi-specific controls when educational mode is active

## 7.3 New student-facing panel (allowed UI bloat)

Add right-side detachable panel: `Free Scalar Analyzer`

Widgets:
1. Hamiltonian pie/bars (`K,G,V` percentages in hovered voxel/region)
2. Flux vector mini-view and magnitude histogram
3. k-space heatmap (main)
4. radial/1D spectrum plot `n(|k|)`
5. optional "compare to exact vacuum" baseline

## 7.4 Interaction design

1. Hover voxel readout: `(phi, pi, K, G, V, E, |S|)`
2. Probe tool with pinned sampling points
3. Time scrub while paused for mode evolution study

## 8. Testing and Verification Plan

## 8.1 Physics unit tests

Add tests for:
1. `K+G+V=E` identity per sampled lattice point
2. flux direction/magnitude sanity on known traveling-wave setup
3. mode-character ratio stability under scaling conventions
4. `n_k` against analytical single-mode initialization

## 8.2 Shader/renderer tests

1. new uniform packing offsets
2. bind-group layout/resource presence in free-scalar mode
3. algorithm gating behavior in selector
4. fallback behavior when educational mode disabled

## 8.3 UI tests

1. mode selector visibility only in free scalar
2. mode-specific controls appear/disappear correctly
3. k-space panel controls update data source
4. legends and equations toggle reliably

## 8.4 Performance checks

1. frame time impact for each mode (3D, 4D+, 2D)
2. memory overhead from extra textures
3. FFT/spectrum update cadence under play/pause

## 9. Documentation Deliverables

1. New doc: `docs/physics/free-scalar-educational-color-modes.md`
2. Update `docs/architecture.md` with new analysis pass/data flow
3. Update `docs/frontend.md` with new UI sections and panel behavior
4. Add "student lab exercises" appendix using each mode

## 10. Phased Rollout

Phase 1 (core educational voxel modes):
1. Hamiltonian Decomposition
2. Mode Character Map
3. Energy Flux Map
4. Geometry-tab controls + legends

Phase 2 (spectral mode):
1. k-space Occupation panel (CPU/WASM FFT)
2. baseline comparison tools
3. panel interactions (plane/radial toggles)

Phase 3 (advanced UX):
1. hover probe/pinned probes
2. optional streamlines for flux
3. richer diagnostics and export-ready screenshots/data

## 11. Risks and Mitigations

1. Risk: UI complexity overload.
   Mitigation: progressive disclosure + educational defaults + presets.

2. Risk: performance regression from extra compute and textures.
   Mitigation: mode-conditional pass execution and update throttling.

3. Risk: conceptual confusion between generic palettes and educational modes.
   Mitigation: explicit sectioning and precedence labels in UI.

4. Risk: k-space mode interpreted as local color mode.
   Mitigation: present primarily as dedicated spectral panel.

## 12. Definition of Done

1. All 4 educational modes are available in free-scalar workflow.
2. Modes 1-3 render physically meaningful voxel colors in volume view.
3. Mode 4 provides interactive k-space occupation panel with validated `n_k`.
4. UI includes legends/equations/diagnostics to support student interpretation.
5. Tests cover formulas, wiring, and mode gating.
6. Docs explain physics meaning, limitations, and teaching usage.
