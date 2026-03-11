# BEC Code Review

Date: 2026-03-11

Scope reviewed: BEC-related functionality implemented under `schroedinger.quantumMode === 'becDynamics'`, including store/config, UI controls, renderer integration, shared TDSE compute path, WGSL init/potential/write-grid logic, presets, URL integration, and diagnostics.

Tests run: None, per request.

## Summary

Verdict: `FAIL`

The BEC path is broadly integrated, but several user-facing promises do not hold end to end. The most serious issues are broken URL round-tripping, preset state leakage, a preset whose advertised physics is not what the code produces, and a dead `Auto-Scale` control.

## Findings

### 1. High: BEC does not round-trip through share URLs, and minimum-dimension enforcement is inconsistent

`serializeState()` writes `qm=becDynamics`, but `deserializeState()` rejects that value because `becDynamics` is missing from `VALID_QUANTUM_MODES`. Separately, `useUrlState()` only auto-promotes `freeScalarField` and `tdseDynamics` to 3D, while `setSchroedingerQuantumMode('becDynamics')` accepts the current dimension as-is.

Impact:
- Shared BEC URLs silently reload into a different quantum mode.
- Non-UI callers can still put the app into BEC at dimension `< 3`, even though the explorer UI guards against that.

Evidence:
- `src/lib/url/state-serializer.ts`
- `src/hooks/useUrlState.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/components/sections/ObjectTypes/ObjectTypeExplorer.tsx`

### 2. High: BEC preset application leaks previous state into later presets

`applyBecPreset()` merges preset overrides onto the current BEC config instead of rebuilding from defaults. That means fields absent from the next preset remain active.

Concrete failure:
- `breathingMode` sets `initTrapOmega`.
- Selecting a later preset that does not mention `initTrapOmega` leaves the quench active.
- There is no BEC UI control to clear that hidden state.

Impact:
- Preset changes are not reproducible.
- Users can get dynamics that do not match the selected preset.

Evidence:
- `src/lib/physics/bec/presets.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

### 3. High: The advertised `vortexDipole` preset cannot produce a vortex-antivortex dipole

The preset claims to be a 2D opposite-charge pair, but the implementation path does not support that:

- preset application strips `latticeDim`, `gridSize`, and `spacing`, so the authored 2D setup is discarded
- the renderer maps `vortexLattice` to the shared `vortexImprint` init code path
- the WGSL multi-vortex branch applies one shared `charge` to every vortex in the ring

Actual behavior:
- same-sign vortices in a ring in the current global dimension
- not an opposite-charge dipole

Impact:
- The preset is mislabeled and physically misleading.

Evidence:
- `src/lib/physics/bec/presets.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/rendering/webgpu/shaders/schroedinger/compute/tdseInit.wgsl.ts`

### 4. High: The BEC `Auto-Scale` toggle is dead UI

The BEC controls expose `Auto-Scale`, and the renderer forwards `bec.autoScale` into the shared TDSE config, but the TDSE/BEC shader path has no uniform or branch that consumes it. `tdseWriteGrid.wgsl.ts` always normalizes by `params.maxDensity`.

Impact:
- The control appears functional but cannot change rendering behavior.
- This is especially risky because users may trust it when comparing density-driven views.

Evidence:
- `src/components/sections/Geometry/SchroedingerControls/BECControls.tsx`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/rendering/webgpu/passes/TDSEComputePass.ts`
- `src/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl.ts`

### 5. Medium: BEC diagnostics can remain stale after reset or preset changes

The BEC diagnostics store exposes `reset()`, but the runtime path only calls `update()`. `BECAnalysisSection` keys its UI off `hasData`, so old values can remain visible until a later diagnostics readback arrives.

Impact:
- Immediately after reset or preset switch, the panel can show stale `mu`, `xi`, `c_s`, and `R_TF`.
- Users may interpret old observables as belonging to the new state.

Evidence:
- `src/stores/becDiagnosticsStore.ts`
- `src/components/sections/Advanced/BECAnalysisSection.tsx`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

### 6. Medium: BEC CFL clamping is incomplete

`setBecDt()` clamps against a CFL-style stability limit, but `setBecSpacing()` and `setBecMass()` do not recompute or clamp `dt` after changing the same bound.

Impact:
- A previously safe `dt` can become unsafe after reducing spacing or increasing mass.
- The store can end up in a numerically unstable state without user feedback.

Evidence:
- `src/stores/slices/geometry/schroedingerSlice.ts`

### 7. Medium: Anisotropic traps are not handled consistently in sizing and analysis

The solver supports `trapAnisotropy`, but several supporting paths still assume isotropy:

- `resizeBecArrays()` derives spacing from an isotropic Thomas-Fermi radius
- `BECAnalysisSection` plots only `trapOmega`
- renderer-side `R_TF` diagnostics also use isotropic `omega`

Impact:
- Weakly confined axes can be undersized by the lattice choice.
- The analysis panel can display a trap and radius that are not the system being evolved.

Evidence:
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/components/sections/Advanced/BECAnalysisSection.tsx`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

## Testing Gaps

I did not find BEC-specific test files under `src/tests`.

Notable uncovered areas:
- URL parsing and serialization for `becDynamics`
- minimum-dimension enforcement outside the explorer UI
- `applyBecPreset()` behavior and preset isolation
- renderer translation from `BecConfig` to shared TDSE dispatch config
- BEC diagnostics store lifecycle
- vortex lattice / dipole semantics

## Notes

- There is no standalone `bec` object type in this repository.
- BEC is implemented as the Schrödinger compute mode `becDynamics`.
