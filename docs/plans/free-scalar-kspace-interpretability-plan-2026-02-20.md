# Plan: Free Scalar k-Space Occupation Interpretability (Shift + Radial + Exposure + Broadening)

Date: 2026-02-20
Status: Proposed
Scope: `quantumMode = freeScalarField`, `colorAlgorithm = kSpaceOccupation` (15)

## 1. Objective

Make the k-space occupation mode scientifically useful and consistently visible for students, while preserving the physical definition of mode occupation.

This plan adds four paired capabilities:
1. FFT-shifted display coordinates (low `|k|` visually central)
2. Radial shell average view `n(|k|)`
3. Percentile/log exposure controls for sparse heavy-tail distributions
4. Optional kernel broadening (visualization-only)

## 2. Current Problem Summary

Current implementation computes valid `n_k`, but display is too sparse for most non-vacuum default states.

Observed behavior:
1. Default-like Gaussian packet populates a very small subset of bins in `64^3` display volume.
2. Volumetric alpha is driven by density channel (`rho`), so only a few tiny bright regions appear.
3. Exact vacuum appears fuller because many more modes have nonzero occupation.

Consequence:
1. Physics is mostly correct.
2. Educational interpretation is poor in default non-vacuum workflows.

## 3. Non-Negotiable Physics Invariants

The following must remain true after this work:
1. Raw occupation formula remains unchanged:
   - `n_k = (|pi_k|^2 + omega_k^2 |phi_k|^2) / (2 * omega_k * N) - 1/2`
2. Raw mode energies and shell sums are not modified by visualization controls.
3. Display transforms are strictly post-physics and optional.
4. UI labels explicitly mark non-physical transforms (broadening/exposure).

## 4. End-State User Behavior

In `k-Space Occupation Map` mode students should be able to:
1. Immediately see where low-`|k|` occupancy sits (centered view by default).
2. Switch to radial view to read isotropic spectral content quickly.
3. Adjust visibility of sparse populations without changing the underlying data.
4. Enable mild broadening to interpret sparse bins spatially in volumetric view.

Default behavior for educational usability:
1. `fftShiftEnabled = true`
2. `exposureMode = log`
3. `highPercentile = 99.0` to `99.5` (final value tuned in validation)
4. `kernelBroadening.enabled = true` with mild default radius/sigma

## 5. Architecture Strategy

## 5.1 Separate raw physics from display transforms

Refactor `computeKSpaceTextures` path into two stages:
1. Raw spectral stage: computes `n_k`, `|k|`, `omega_k` on lattice indices.
2. Display stage: remaps/filters/scales for rendering textures.

This separation is required for correctness tests and student trust.

## 5.2 Display transform pipeline order

Apply transforms in this order:
1. Coordinate mapping (FFT shift on/off)
2. Optional radial shell projection (`raw3d` vs `radial3d`)
3. Exposure mapping (linear/log + percentile window + gamma)
4. Optional kernel broadening
5. Half-float packing for GPU upload

Rationale:
1. Shift/radial define domain placement.
2. Exposure defines transfer function.
3. Broadening operates in final display domain.

## 6. Data and Store Contract

## 6.1 Type additions (`FreeScalarConfig`)

Add a dedicated block under free-scalar settings:

```ts
kSpaceViz: {
  displayMode: 'raw3d' | 'radial3d'
  fftShiftEnabled: boolean
  exposureMode: 'linear' | 'log'
  lowPercentile: number
  highPercentile: number
  gamma: number
  broadeningEnabled: boolean
  broadeningRadius: number
  broadeningSigma: number
  radialBinCount: number
}
```

Notes:
1. Keep this under free-scalar geometry config, not global appearance.
2. Persist in presets and URL state.
3. Backward compatibility: missing block gets safe defaults.

## 6.2 Slice actions and selectors

Add actions in `schroedingerSlice` for each control and one batch setter:
1. `setFreeScalarKSpaceViz(partial)`
2. Control-specific setters for slider/toggle ergonomics

Performance:
1. Use narrow selectors / `useShallow` in control components.
2. Avoid rerendering unrelated panels.

## 7. Rendering and Compute Integration

## 7.1 Physics compute path

Current file: `/Users/Spare/Documents/code/mquantum/src/lib/physics/freeScalar/kSpaceOccupation.ts`

Refactor responsibilities:
1. `computeRawKSpace(...)` -> raw arrays (`n_k`, `kMag`, `omega`, metadata)
2. `mapKSpaceToDisplayGrid(...)` -> coordinate placement (`raw3d` + shift)
3. `buildRadialShellField(...)` -> isotropic radial field (`radial3d`)
4. `applyExposureTransfer(...)` -> percentile/log/gamma mapping
5. `applyBroadening(...)` -> optional smoothing (visualization-only)
6. `packDisplayTexturesRGBA16F(...)` -> final GPU buffers

## 7.2 Pass wiring

Current file: `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`

Plan:
1. Extend k-space compute call with `kSpaceViz` config.
2. Keep render-graph-safe upload flow (no internal out-of-band submission during pass execution).
3. Preserve existing update cadence (`K_SPACE_UPDATE_INTERVAL`) and tune if needed after perf checks.

## 7.3 Shader impact

Minimal WGSL changes expected.

Reason:
1. Display transforms happen CPU-side before texture upload.
2. Existing algorithm 15 shader branch can keep reading `analysis.r/g/b`.

Potential shader adjustment (optional):
1. Add a small flag for legend/debug display mode annotation if needed.

## 8. Feature Specification Details

## 8.1 FFT-shifted display coordinates

For each active dimension `d < 3`:
1. Unshifted index: `k_d in [0, N_d-1]`
2. Shifted index: `k'_d = (k_d + floor(N_d/2)) mod N_d`

Rules:
1. Apply only to display coordinates, not to `omega_k` or `n_k` math.
2. Respect degenerate dimensions (`N_d <= 1`) by centering policy already used.
3. Support both `latticeDim <= 3` and `latticeDim > 3` paths.

## 8.2 Radial shell average view `n(|k|)`

Build bins by magnitude in lattice momentum metric:
1. `|k| = sqrt(sum_i [2*sin(pi*n_i/N_i)/a_i]^2)`
2. Bin index from normalized `|k|` in `[0, k_max]`
3. Shell value: mean occupancy over modes in each bin

`radial3d` rendering policy:
1. For each output voxel, compute its `|k|` (in shifted coordinates).
2. Fill density from shell mean corresponding to that radius.
3. Keep `analysis.g/b` as shell-averaged `|k|` and `omega` metadata.

UI coupling:
1. Expose `radialBinCount`.
2. Optional shell histogram panel in analyzer UI.

## 8.3 Percentile/log exposure control

Transfer function contract:
1. Input scalar `v` from display occupancy field.
2. Optional pre-transform: `v_log = log(v + eps)` when `exposureMode = log`.
3. Compute percentiles over strictly positive values.
4. Window: `[q_low, q_high]`.
5. Normalize and gamma:
   - `u = clamp((v_t - q_low) / max(q_high - q_low, eps), 0, 1)`
   - `out = pow(u, gamma)`

Guardrails:
1. Clamp `0 <= lowPercentile < highPercentile <= 100`.
2. Fallback to identity when not enough positive samples.
3. Keep raw values available for diagnostics/tooltips.

## 8.4 Optional kernel broadening

Purpose:
1. Improve spatial interpretability of sparse bins in volumetric rendering.

Contract:
1. Mark clearly as non-physical display aid.
2. Preserve total displayed mass (`sum(displayR)`) after broadening.

Implementation:
1. Use separable Gaussian-like convolution on `64^3` display grid.
2. Blur occupancy-weighted numerators for metadata channels:
   - Blur `N = n`
   - Blur `K = n * kNorm`
   - Blur `O = n * omegaNorm`
   - Recover `kNorm' = K / max(N, eps)`, `omegaNorm' = O / max(N, eps)`
3. Clamp maximum radius/sigma for runtime stability.

## 9. UI Implementation Plan

## 9.1 Geometry tab (`FreeScalarFieldControls`)

Add a new section: `k-Space Visualization` visible only when algorithm 15 is active.

Controls:
1. `Display Mode`: Raw 3D / Radial 3D
2. `Center Low |k| (FFT Shift)` toggle
3. `Exposure Mode`: Linear / Log
4. `Low Percentile` slider
5. `High Percentile` slider
6. `Gamma` slider
7. `Broadening` toggle
8. `Broadening Radius` slider
9. `Broadening Sigma` slider
10. `Radial Bin Count` slider (only for radial mode)

Copy text requirements:
1. Broadening label must include `(visualization-only)`.
2. Exposure tooltip must state it does not change raw occupations.

## 9.2 Faces/Surface panel

Plan:
1. Keep algorithm 15 selection where it is.
2. Add lightweight hint text when algorithm 15 is active:
   - "Visibility controlled in Geometry > k-Space Visualization."

## 9.3 Optional analyzer panel (phase 2)

Add `k-space analyzer` section with:
1. 1D radial shell plot `n(|k|)`
2. Hover readout for bin radius and occupancy

This can be shipped after core visibility controls if timeline is tight.

## 10. Color Preview and UX Consistency

File: `/Users/Spare/Documents/code/mquantum/src/components/sections/Faces/ColorPreview.tsx`

Plan:
1. Keep algorithm-15 branch (already present).
2. Add annotation that preview is palette-only unless optionally wired to exposure settings.
3. If exposure controls are wired into preview, include mode badge (`linear/log`).

Goal:
1. Avoid mismatch between chosen controls and perceived output.

## 11. File-Level Change Map

## New files (recommended)

1. `/Users/Spare/Documents/code/mquantum/src/lib/physics/freeScalar/kSpaceDisplayTransforms.ts`
2. `/Users/Spare/Documents/code/mquantum/src/lib/physics/freeScalar/kSpaceRadialSpectrum.ts`
3. `/Users/Spare/Documents/code/mquantum/src/tests/lib/physics/freeScalar/kSpaceDisplayTransforms.test.ts`
4. `/Users/Spare/Documents/code/mquantum/src/tests/lib/physics/freeScalar/kSpaceRadialSpectrum.test.ts`

## Updated files

1. `/Users/Spare/Documents/code/mquantum/src/lib/physics/freeScalar/kSpaceOccupation.ts`
2. `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/types.ts`
3. `/Users/Spare/Documents/code/mquantum/src/stores/slices/geometry/schroedingerSlice.ts`
4. `/Users/Spare/Documents/code/mquantum/src/components/sections/Geometry/SchroedingerControls/FreeScalarFieldControls.tsx`
5. `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`
6. `/Users/Spare/Documents/code/mquantum/src/components/sections/Faces/ColorPreview.tsx` (UX consistency updates)

Optional phase-2 UI files:
1. `/Users/Spare/Documents/code/mquantum/src/components/sections/Geometry/SchroedingerControls/KSpaceSpectrumPanel.tsx`
2. Matching tests under `/Users/Spare/Documents/code/mquantum/src/tests/components/`

## 12. Verification Plan

## 12.1 Physics and transform unit tests

1. Raw `n_k` invariance when toggling any display control.
2. FFT shift correctness on known single-mode synthetic input.
3. Radial shell binning correctness and shell average conservation.
4. Exposure mapping edge cases (`q_high == q_low`, empty positives, extreme gamma).
5. Broadening mass conservation and channel reconstruction checks.

## 12.2 Store and serialization tests

1. New `kSpaceViz` defaults applied on fresh state.
2. Setters clamp invalid ranges.
3. Preset/URL round-trip stability.

## 12.3 Shader/renderer integration tests

1. Algorithm 15 path remains active and bound after control changes.
2. Texture upload cadence remains stable (no stale frames, no race warnings).
3. Volumetric visibility improves for default gaussian baseline.

## 12.4 Performance checks

1. Measure k-space update latency at `32^3` and `64^3`.
2. Keep frame-time spikes within acceptable budget for default update interval.
3. If broadening is too costly, apply only every Nth k-space refresh with interpolation.

## 13. Phased Delivery

## Phase 0: Baseline and instrumentation

1. Add debug counters for nonzero bins and percentile windows.
2. Capture before/after screenshots for default gaussian and exact vacuum.

## Phase 1: FFT shift + exposure controls

1. Implement shift mapping.
2. Implement exposure transfer.
3. Wire UI and store.
4. Add tests.

## Phase 2: Radial shell mode

1. Implement shell accumulator and radial3d field mapping.
2. Add radial controls.
3. Add tests and baseline comparisons.

## Phase 3: Kernel broadening

1. Implement separable broadening with conservation.
2. Add UI controls and non-physical labeling.
3. Add perf guardrails and tests.

## Phase 4: UX polish and docs

1. Optional 1D spectrum panel.
2. Tooltips/equation cards.
3. Update user docs and presets.

## 14. Risks and Mitigations

1. Risk: Users interpret broadening as physical dynamics.
   Mitigation: Explicit non-physical labels + default mild values.

2. Risk: Percentile settings hide meaningful weak tails.
   Mitigation: Quick reset button and raw-view toggle.

3. Risk: CPU post-processing cost increases spikes.
   Mitigation: Separable kernels, bounded radius, throttled updates.

4. Risk: Store/UI complexity growth.
   Mitigation: Scope controls to algorithm 15 and free-scalar mode only.

## 15. Definition of Done

1. Default gaussian packet in algorithm 15 is visually interpretable without manual tuning.
2. Exact vacuum remains informative and not over-saturated by defaults.
3. Raw `n_k` statistics are invariant under all display controls.
4. FFT shift, radial mode, exposure, and broadening all have unit tests.
5. UI controls are fully wired, persisted, and documented.
6. No TypeScript or test regressions in affected suites.

## 16. References

Internal code references:
1. `/Users/Spare/Documents/code/mquantum/src/lib/physics/freeScalar/kSpaceOccupation.ts`
2. `/Users/Spare/Documents/code/mquantum/src/lib/physics/freeScalar/vacuumSpectrum.ts`
3. `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`
4. `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts`
5. `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`
