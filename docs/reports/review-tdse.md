# TDSE Code Review

Date: 2026-03-11

Scope reviewed: TDSE-related functionality implemented under `schroedinger.quantumMode === 'tdseDynamics'`, including store/config, UI controls, renderer integration, WebGPU compute path, WGSL shaders, presets, URL/preset loading, and diagnostics.

Tests run: None, per request.

## Summary

Verdict: `FAIL`

The TDSE path is broadly wired through the app, but several user-facing behaviors do not match what the code actually computes. The most serious issues are a broken driven-potential implementation, scientifically misleading diagnostics, and store/UI invariants that drift away from the actual render path.

## Findings

### 1. Critical: the `driven` potential does not actually drive the barrier

The TDSE UI and shader comments describe `driven` as a time-dependent barrier. In the shader, the oscillatory drive term is added everywhere in space, not just inside the barrier region. Outside the barrier, the potential is still `drive`; inside, it is `barrierHeight + drive`.

Impact:
- The relative barrier height is unchanged over time.
- The simulated dynamics are effectively a static barrier plus a global scalar potential offset.
- The advertised “driven barrier” behavior is not what the solver evolves.

Evidence:
- `src/components/sections/Geometry/SchroedingerControls/TDSEPotentialControls.tsx`
- `src/rendering/webgpu/shaders/schroedinger/compute/tdsePotential.wgsl.ts`

### 2. High: TDSE analysis reports `R/T` for scenarios where those quantities are not physically defined

The diagnostics shader partitions probability only by whether a lattice site lies left or right of `barrierCenter` along axis 0. The analysis panel always presents those two aggregates as reflection/transmission coefficients.

That interpretation only makes sense for a narrow class of 1D scattering setups. It is misleading for wells, harmonic traps, periodic lattices, double-slit, higher-dimensional configurations, or packets launched from the right.

Impact:
- The Analysis panel can present scientifically incorrect observables with authoritative labels.
- Users may interpret generic left/right occupancy as scattering coefficients.

Evidence:
- `src/rendering/webgpu/shaders/schroedinger/compute/tdseDiagnostics.wgsl.ts`
- `src/rendering/webgpu/passes/TDSEComputePass.ts`
- `src/components/sections/Advanced/TDSEAnalysisSection.tsx`

### 3. High: absorber loss and norm loss are hidden by the reported `R/T`

`computeReflectionTransmission()` divides by `normLeft + normRight` rather than total norm. That renormalizes away probability absorbed at the boundaries, as well as any numerical norm loss.

Impact:
- The UI can show `R + T ≈ 1` even when substantial probability has been absorbed or lost.
- The reported coefficients look cleaner than the actual evolution.
- This is especially misleading because the same panel also shows norm drift, implying the coefficients are directly comparable to the physical state.

Evidence:
- `src/lib/physics/tdse/diagnostics.ts`
- `src/rendering/webgpu/passes/TDSEComputePass.ts`
- `src/components/sections/Advanced/TDSEAnalysisSection.tsx`

### 4. High: TDSE can enter invalid representation state in the store while the renderer silently forces position space

The top-bar representation toggle still cycles `position -> momentum -> wigner -> position` with no TDSE guard. Meanwhile, `WebGPUScene` normalizes all compute modes back to `representation: 'position'` before constructing the renderer.

Impact:
- Store/UI state can say TDSE is in `momentum` or `wigner` while the renderer is actually showing position-space density-grid output.
- Invalid state can be persisted into saved scenes until some later normalization path corrects it.
- This creates hard-to-debug discrepancies between controls, saved state, and rendering.

Evidence:
- `src/components/layout/TopBarControls.tsx`
- `src/rendering/webgpu/WebGPUScene.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`

### 5. Medium: minimum-dimension enforcement for TDSE is fragmented and not owned by the mode setter

`tdseDynamics` requires the compute/density-grid path, which the renderer treats as volumetric 3D. But `setSchroedingerQuantumMode('tdseDynamics')` itself does not enforce `dimension >= 3`. Instead, several callers patch this separately, and the renderer later clamps again.

Impact:
- Direct callers can leave store state, controls, and renderer assumptions out of sync.
- The invariant is duplicated in multiple places, increasing future drift risk.
- This is already visible in inconsistent caller coverage across UI, URL application, and scene load logic.

Evidence:
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/components/sections/ObjectTypes/ObjectTypeExplorer.tsx`
- `src/hooks/useUrlState.ts`
- `src/stores/presetManagerStore.ts`
- `src/rendering/webgpu/WebGPUScene.ts`

### 6. Medium: TDSE diagnostics are over-specialized to barrier scattering, but exposed as generic mode analysis

The diagnostics implementation is tightly coupled to `barrierCenter`, axis-0 splitting, and scattering language, yet the TDSE controls expose many non-scattering scenarios such as `finiteWell`, `harmonicTrap`, `periodicLattice`, and `doubleWell`.

Impact:
- The app exposes a generic “Analysis” section whose metrics are only valid for a subset of presets.
- Future TDSE preset additions are likely to inherit misleading diagnostics automatically.

Evidence:
- `src/components/sections/Geometry/SchroedingerControls/TDSEPotentialControls.tsx`
- `src/components/sections/Advanced/TDSEAnalysisSection.tsx`
- `src/lib/physics/tdse/presets.ts`
- `src/rendering/webgpu/shaders/schroedinger/compute/tdseDiagnostics.wgsl.ts`

## Testing Gaps

I did not find an end-to-end TDSE integration test that covers the full path from UI/store state into renderer setup, compute dispatch, GPU diagnostics readback, and analysis display.

Notable uncovered areas:
- driven potential semantics
- representation normalization vs stored representation state
- minimum-dimension enforcement outside the explorer UI
- TDSE diagnostics meaning across non-scattering presets
- scene load / URL load invariants for TDSE mode

## Notes

- There is no standalone `tdse` object type in this repository.
- TDSE is implemented as the Schrödinger compute mode `tdseDynamics`.
