# Plan: Free Scalar Field with Compact Extra Dimensions (Kaluza-Klein)

Date: 2026-02-19  
Status: Proposed  
Scope: `freeScalarField` extension to 3+n dimensions with compact extra axes via KK tower truncation

## 1. Objective

Support higher-dimensional free scalar physics without exponential lattice blowup by modeling:

```text
Minkowski_3+1 × K_n
```

where `K_n` are compact spatial dimensions (e.g., n-torus), reduced to a finite Kaluza-Klein (KK) mode tower in 3D.

This keeps the physically rendered space 3D while adding higher-dimensional dynamics through mode amplitudes and effective masses.

## 2. Why This Fits the Current Architecture

Current free-scalar rendering is already a 3D density-grid pipeline:

- free-scalar compute output is a 3D texture for raymarching
  - `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`
- fragment pipeline samples precomputed 3D grid
  - `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl.ts`

Therefore, KK reduction is a strong architectural fit:

- preserve 3D texture and volume renderer contracts
- move “extra dimensions” into additional coupled mode fields in compute
- avoid direct 4D+ lattice texture storage

## 3. Physics Target

## 3.1 Starting action

For scalar field on compact product space:

```text
S = ∫ d^4x d^n y [ 1/2 (∂_M Φ ∂^M Φ - m^2 Φ^2) ]
```

with compact coordinates `y_i ~ y_i + 2πR_i`.

## 3.2 KK decomposition

Expand:

```text
Φ(x, y) = Σ_{n⃗} φ_{n⃗}(x) e^{i n⃗·y/R}
```

Each 3D mode `φ_{n⃗}(x)` behaves as a free scalar with effective mass:

```text
m_eff(n⃗)^2 = m^2 + Σ_i (n_i^2 / R_i^2)
```

## 3.3 Lattice equations for each retained mode

For each retained `n⃗`:

```text
d_t φ_{n⃗} = π_{n⃗}
d_t π_{n⃗} = ∇_3D^2 φ_{n⃗} - m_eff(n⃗)^2 φ_{n⃗}
```

using the same 3D leapfrog and lattice Laplacian style already implemented for current free scalar.

## 4. High-Level Design

## 4.1 Data model additions

Extend `freeScalar` config with compact-dimension settings:

- `compactDims: 0..8` (or bounded by UI policy)
- `compactRadii: number[]` length = `compactDims`
- `kkCutoffPerDim: number[]` (mode index truncation per compact dimension)
- `modeSelection: 'allWithinCutoff' | 'manualSubset'`
- `modeWeights` or initialization policy for selected modes
- `fieldAggregation: 'singleMode' | 'sumDensity' | 'coherentSuperposition'`

Touchpoints:

- `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/types.ts`
- `/Users/Spare/Documents/code/mquantum/src/stores/slices/geometry/types.ts`
- `/Users/Spare/Documents/code/mquantum/src/stores/slices/geometry/schroedingerSlice.ts`

## 4.2 Compute pass architecture

Introduce a dedicated pass:

- `FreeScalarKKComputePass`

Responsibilities:

1. Maintain mode-bank buffers:
   - `phi[mode][site]`
   - `pi[mode][site]`
2. Precompute per-mode `m_eff^2` from `(m, radii, mode index)`.
3. Run leapfrog update per mode on shared 3D lattice.
4. Aggregate selected mode outputs into one 3D density texture compatible with current renderer.

Optional phase-2:

- `FreeScalarKKObservablesPass` for mode occupation spectrum and energy partition by KK level.

## 4.3 Shader and buffer changes

Keep storage texture target unchanged (`rgba16float`, 3D).  
Generalize uniforms and kernels:

- mode count
- mode index table
- per-mode mass-squared table
- aggregation strategy

Likely touchpoints:

- `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl.ts`
- `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePi.wgsl.ts`
- `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePhi.wgsl.ts`
- `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl.ts`

## 4.4 Renderer integration

Integrate KK pass into existing free-scalar branch:

- `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

Behavior:

- if `compactDims == 0`, use current single-field path
- if `compactDims > 0`, run KK pass and aggregate to density grid

## 4.5 UI and semantics

When `freeScalarField` is active, expose:

1. `Physical model`
   - `3D only`
   - `3D + compact dimensions (KK)`
2. `Compact geometry`
   - number of compact dims
   - radii `R_i`
3. `Mode truncation`
   - cutoff per dimension
   - estimated mode count / memory cost
4. `Aggregation view`
   - dominant mode
   - total energy density
   - signed field view of selected mode

This preserves meaningful higher-dimensional controls without requiring direct `4D+` lattice visualization.

## 5. Numerical and Performance Strategy

## 5.1 Complexity control

Total cost scales with:

```text
O(num_modes × Nx × Ny × Nz)
```

Mitigations:

- enforce mode budget caps
- adaptive defaults by device tier
- optional sparse/manual mode subsets

## 5.2 Stability

`dt` must satisfy worst-case mode mass:

```text
m_eff,max^2 = m^2 + Σ_i (n_i,max^2 / R_i^2)
```

Use this in `dt` clamp logic, not base mass `m` alone.

## 5.3 Memory policy

- hard cap on `num_modes * totalSites`
- graceful fallback to reduced cutoff
- explicit UI warnings before applying expensive settings

## 6. Scientific Validation Plan

## 6.1 Mode-frequency checks

For isolated selected modes:

- measure oscillation frequency
- compare to predicted `ω_k^2 = k_3D^2 + m_eff^2` (lattice-corrected form)

## 6.2 Radius-scaling checks

At fixed mode indices:

- increasing `R_i` lowers KK mass contribution
- decreasing `R_i` raises KK mass contribution

verify monotonic behavior in measured spectra.

## 6.3 Energy diagnostics

- total energy conservation within drift tolerance
- energy decomposition by mode remains stable
- aggregation view reflects sum of per-mode contributions

## 7. Implementation Phases

Phase 1 (minimal KK path):

1. Add compact-dimension config fields and store actions.
2. Implement per-mode effective mass table.
3. Implement small fixed mode-bank evolution and aggregate density output.

Phase 2 (scalable mode management):

1. Add cutoff-driven dynamic mode enumeration.
2. Add mode budget enforcement and device-tier policies.
3. Add diagnostics for mode count, memory, and step time.

Phase 3 (education/analysis):

1. Add per-mode and grouped observables panel.
2. Add presets demonstrating KK mass splitting and radius dependence.
3. Add explanatory tooltips and formula overlays.

## 8. Risks and Mitigations

1. Mode explosion from large cutoffs.  
   Mitigation: strict budget caps + auto-reduced cutoffs.

2. Instability from large effective masses.  
   Mitigation: `dt` clamp based on `m_eff,max`.

3. User confusion between global dimension and compact dimensions.  
   Mitigation: explicit model selector and labeled semantics.

4. Aggregation artifacts masking individual mode behavior.  
   Mitigation: selectable single-mode view and per-mode diagnostics.

## 9. Definition of Done

1. Users can enable compact dimensions and evolve a truncated KK mode tower.
2. Effective-mass behavior follows `m_eff^2 = m^2 + Σ n_i^2 / R_i^2`.
3. Aggregated output remains compatible with current 3D density-grid raymarcher.
4. Stability, energy, and mode-frequency tests pass for representative settings.
5. Existing non-KK free-scalar behavior is unchanged when `compactDims = 0`.

## 10. Reference

- Compactified extra dimension / KK mass shift example: https://arxiv.org/abs/1704.08435

