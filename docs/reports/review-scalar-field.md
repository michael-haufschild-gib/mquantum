# Free Scalar Field Code Review

Date: 2026-03-11

Scope reviewed: free scalar field functionality implemented under `schroedinger.quantumMode === 'freeScalarField'`, including store/config, UI controls, renderer integration, WebGPU compute path, WGSL shaders, k-space visualization, URL/preset loading, and serialization behavior.

Tests run: None, per request.

## Summary

Verdict: `FAIL`

The free scalar field path is broadly integrated across the app, but several cross-layer state transitions are unsafe. The most important issues are scene loads that can silently preserve the previous live field, stale normalization after re-enabling auto-scale, and stale texture output when switching into k-space rendering.

## Findings

### 1. High: loading a saved free-scalar scene can silently keep the previous live field

`freeScalar.needsReset` is intentionally stripped during preset serialization, but scene loading does not restore an equivalent reset trigger. The compute pass only reinitializes the field when `needsReset` is true or when its config hash changes, and that hash only includes `gridSize` and `latticeDim`.

Impact:
- Loading a scene can keep evolving the old `phi/pi` buffers instead of the loaded initial condition.
- Changes to `mass`, `initialCondition`, `modeK`, `packetCenter`, or `vacuumSeed` can be ignored when the lattice shape is unchanged.
- Saved scenes can appear to load successfully while showing stale simulation state.

Evidence:
- `src/stores/utils/presetSerialization.ts`
- `src/stores/presetManagerStore.ts`
- `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`

### 2. Medium: re-enabling `autoScale` does not refresh the normalization baseline

The store toggles `freeScalar.autoScale`, but the compute pass only recomputes `maxPhiEstimate` during initialization or reset. If the field was initialized while `autoScale` was off, the cached normalization baseline stays stale after the toggle flips back on.

Impact:
- `phi`, `pi`, and `energyDensity` views can remain visibly mis-scaled until a manual reset or some unrelated reinitialization occurs.
- The UI implies immediate normalization changes, but the render path does not honor that expectation.

Evidence:
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`

### 3. Medium: switching to `kSpaceOccupation` can show stale position-space textures for several frames

In k-space mode, the write-grid shader exits without writing either texture. The CPU readback/FFT path then waits several frames before dispatching the first k-space job. During that gap, the renderer continues sampling whatever density/analysis textures were already present.

Impact:
- The view can briefly show stale position-space content after the user switches into k-space mode.
- The mode transition is visually misleading because the displayed textures do not match the selected analysis mode.

Evidence:
- `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl.ts`
- `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`

### 4. Medium: normal UI and URL flows make 1D and 2D free-scalar states unreachable

Entering `freeScalarField` forces the global dimension to at least 3 and then resizes the free-scalar lattice to that promoted dimension. URL application delegates to the same store setter. That conflicts with the rest of the implementation, which still contains explicit low-dimensional handling and UI copy describing 2D rendering behavior.

Impact:
- Users cannot reach the advertised 1D/2D free-scalar configurations through standard mode-selection flows.
- The store invariant conflicts with shader behavior and UI messaging.
- This creates uncertainty about whether low-dimensional support is actually intended or just partially disabled.

Evidence:
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/hooks/useUrlState.ts`
- `src/components/sections/Geometry/SchroedingerControls/FreeScalarFieldControls.tsx`
- `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl.ts`

## Testing Gaps

I did not find coverage for the most failure-prone cross-layer transitions in the free-scalar path.

Notable uncovered areas:
- scene load reinitialization when free-scalar config changes but lattice shape does not
- `autoScale` toggling after initial field setup
- first-frame behavior when switching into `kSpaceOccupation`
- consistency between low-dimensional free-scalar UI claims and actual mode-entry behavior

## Notes

- There is no standalone `freeScalarField` object type in this repository.
- Free scalar field is implemented as the Schrödinger compute mode `freeScalarField`.
