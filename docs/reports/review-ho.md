# Harmonic Oscillator Review

Date: 2026-03-11

Scope reviewed: harmonic-oscillator functionality implemented under `objectType === 'schroedinger'` and `schroedinger.quantumMode === 'harmonicOscillator'`, including store/config, UI controls, URL/preset loading, renderer integration, WebGPU shader composition, density-grid/open-quantum paths, and harmonic-oscillator math/preset generation.

Tests run: None, per request.

## Summary

Verdict: `FAIL`

The harmonic-oscillator path is broadly integrated across the app, but several important behaviors are either physically incorrect or vulnerable to state drift. The most serious issues are that open-quantum harmonic-oscillator rendering still falls back to pure-state sampling, the density-grid cache assumes time-invariant density for time-dependent superpositions, and generated harmonic-oscillator superpositions are not normalized.

## Findings

### 1. Critical: open-quantum harmonic-oscillator rendering does not use the density-matrix result

The renderer creates and updates a `DensityGridComputePass` with `useDensityMatrix: true` for open-quantum runs, but harmonic oscillator mode does not enable `useDensityGrid` in the fragment path. As a result, the HO volumetric shader still uses direct raymarching based on `evalPsi(...)`, which represents a pure-state wavefunction, not the mixed-state density `Tr(ρ|x><x|)`.

Impact:
- Harmonic-oscillator mixed-state visuals are physically wrong.
- The app computes density-matrix data on the GPU but then bypasses it during actual HO rendering.
- Open-quantum HO output can look plausible while representing the wrong object mathematically.

Evidence:
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/rendering/webgpu/shaders/schroedinger/main.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/quantum/density.wgsl.ts`

### 2. High: the density-grid cache assumes HO density is time-invariant even though the shader samples time-dependent superpositions

The density-grid compute shader explicitly evaluates density at `t = schroedinger.time * schroedinger.timeScale`, but `DensityGridComputePass.needsUpdate()` refuses to invalidate on time and documents the grid as time-independent. That assumption is only true for stationary eigenstates, not for generic harmonic-oscillator superpositions.

Impact:
- Uncertainty-boundary extraction and any other density-grid-derived feature can become stale as the animation evolves.
- Animated HO superpositions can render with a density-grid snapshot from an earlier time.
- The visual output can silently drift away from the actual `|psi(x,t)|^2`.

Evidence:
- `src/rendering/webgpu/passes/DensityGridComputePass.ts`
- `src/rendering/webgpu/shaders/schroedinger/compute/densityGrid.wgsl.ts`

### 3. High: derived compute passes can use stale higher-dimensional slice bases

`updateBasisVectors()` rebuilds basis/origin data from Schrödinger state, including `parameterValues`, slice animation, and other mode-specific basis inputs. But the density-grid pass dirty key only incorporates `rotationVersion` and a time bucket, while the Wigner cache basis update is keyed only by `rotationVersion`.

Impact:
- Changing harmonic-oscillator slice positions or related basis state without rotating can leave density-grid or Wigner compute passes sampling the old basis.
- The main render path and compute-derived auxiliary paths can disagree about which N-D slice is being shown.
- This is especially risky for 4D+ HO views where slice origin is a core part of the state.

Evidence:
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/rendering/webgpu/passes/DensityGridComputePass.ts`
- `src/rendering/webgpu/passes/WignerCacheComputePass.ts`

### 4. High: generated harmonic-oscillator superpositions are not normalized

`generateQuantumPreset()` generates complex coefficients with an energy-biased amplitude and random phase, but never rescales them so that `Σ|c_k|² = 1`. Since the HO basis is orthonormal, those generated states are generally not valid normalized wavefunctions.

Impact:
- Density, opacity, and probability-derived effects depend on arbitrary preset amplitude scale rather than only on the physical state shape.
- Presets with more terms or different sampled energies can differ in norm for non-physical reasons.
- Any logic assuming coefficients describe a normalized pure state starts from the wrong premise.

Evidence:
- `src/lib/geometry/extended/schroedinger/presets.ts`

### 5. Medium: scene restoration can clobber persisted HO slice/view state after dimension changes

`useObjectTypeInitialization()` always calls `initializeSchroedingerForDimension()` whenever the current object type is `schroedinger` and the dimension changes. That initializer rewrites harmonic-oscillator state such as `parameterValues`, `center`, `visualizationAxes`, and `densityGain`. Scene loading restores geometry first and the extended Schrödinger config second, so saved HO slice/view state is exposed to being overwritten by the initialization effect during hydration.

Impact:
- Saved scenes can fail to reproduce the exact higher-dimensional HO slice the user saved.
- URL/scene restoration can lose user-configured view state without an obvious error.
- The initialization policy is too aggressive for a mode with meaningful persisted slice coordinates.

Evidence:
- `src/hooks/useObjectTypeInitialization.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/stores/presetManagerStore.ts`
- `src/components/sections/ObjectTypes/ObjectTypeExplorer.tsx`
- `src/components/sections/Geometry/ObjectTypeSelector.tsx`

### 6. Medium: open-quantum share URLs do not round-trip their own settings

The URL serializer/deserializer supports open-quantum parameters like `oq`, `oq_dp`, `oq_rx`, and `oq_th`, but `applyUrlStateParams()` only applies dimension, object type, and quantum mode. A shared harmonic-oscillator URL can therefore claim open quantum is enabled with specific rates while the app loads without applying those settings.

Impact:
- Shared HO open-quantum links are not reproducible.
- The URL state format advertises more fidelity than the app actually restores.
- This is likely to confuse debugging and scientific comparison between shared scenes.

Evidence:
- `src/lib/url/state-serializer.ts`
- `src/hooks/useUrlState.ts`

## Testing Gaps

I did not run tests, per request.

Notable uncovered or under-covered areas:
- harmonic-oscillator open-quantum rendering using density-matrix output rather than pure-state fallback
- time invalidation for density-grid recomputation in animated HO superpositions
- basis/slice synchronization between main rendering and density-grid/Wigner compute passes
- coefficient normalization for generated HO presets
- scene load and URL load preservation of higher-dimensional HO slice state
- open-quantum URL round-tripping for harmonic oscillator mode

## Notes

- The core harmonic-oscillator basis math itself looked substantially better than the surrounding integration logic.
- In particular, the Hermite / 1D HO shader path and the eigenfunction-cache formulas appeared internally consistent from the reviewed code paths.
