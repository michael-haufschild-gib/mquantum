# Hydrogen Orbitals Review

Date: 2026-03-11

Scope reviewed: hydrogen-orbital functionality implemented under `objectType === 'schroedinger'` and `schroedinger.quantumMode === 'hydrogenND'`, including store/config, UI controls, URL/preset loading, renderer integration, WebGPU shader composition, density-grid/open-quantum paths, hydrogen radial overlays, and hydrogen/open-quantum physics helpers.

Tests run: None, per request.

## Summary

Verdict: `FAIL`

The hydrogen ND path is deeply integrated across the app, but several important behaviors are physically inconsistent or drift out of sync across rendering, open-quantum evolution, and state restoration. The most serious issues are that the open-quantum hydrogen path uses a different energy scale than the main hydrogen renderer, the main shader path drops complex `Y_lm` phase information, and the open-quantum basis ignores the user’s extra-dimensional hydrogen state.

## Findings

### 1. Critical: open-quantum hydrogen uses a different energy scale than the main hydrogen renderer

`hydrogenEnergy()` returns Rydberg-style energies `-1 / n^2`, while the hydrogen shader time evolution uses Hartree-style energies `-0.5 / n^2`, and the transition-rate code is explicitly documented in atomic units. That makes the open-quantum hydrogen basis, Liouvillian, and transition frequencies inconsistent with the displayed hydrogen orbital evolution.

Impact:
- Open-quantum hydrogen transition frequencies are doubled relative to the main renderer.
- Einstein A coefficients scale as `omega^3`, so the mismatch inflates spontaneous-emission rates by about `8x`.
- The open-quantum hydrogen dynamics can look plausible while being quantitatively inconsistent with the rest of the hydrogen implementation.

Evidence:
- `src/lib/physics/openQuantum/hydrogenBasis.ts`
- `src/lib/physics/openQuantum/hydrogenRates.ts`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/rendering/webgpu/shaders/schroedinger/quantum/hydrogenNDCommon.wgsl.ts`

### 2. High: the main hydrogen renderer drops complex spherical-harmonic phase information

In the non-real-orbital path, the hydrogen shader reduces `Y_lm` to `K * abs(P)` and then treats the result as a real scalar before time evolution. That preserves a rough angular envelope but removes the azimuthal `e^{im\phi}` phase entirely.

Impact:
- Complex hydrogen orbitals lose their correct phase structure.
- Probability current and other phase-sensitive hydrogen visualizations are physically wrong.
- Complex and real orbital modes become much closer than they should be in the main hydrogen render path.

Evidence:
- `src/rendering/webgpu/shaders/schroedinger/quantum/hydrogenNDCommon.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/quantum/hydrogenNDVariants.wgsl.ts`

### 3. High: open-quantum hydrogen ignores the user’s extra-dimensional state

The open-quantum hydrogen basis builder hard-codes all extra-dimensional quantum numbers to zero, and the renderer initializes the density matrix by matching only `(n, l, m)`. Hydrogen ND presets and custom states with excited extra dimensions are therefore rendered one way in the pure-state path but reinterpreted as ground-state extra dimensions in the open-quantum path.

Impact:
- Hydrogen ND presets like `2pz_5d` are not faithfully preserved when open quantum is enabled.
- The open-quantum state can silently represent a different orbital than the UI and non-OQ renderer indicate.
- Extra-dimensional hydrogen state selection is not reliable for any mixed-state or decoherence workflow.

Evidence:
- `src/lib/physics/openQuantum/hydrogenBasis.ts`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/lib/geometry/extended/schroedinger/hydrogenNDPresets.ts`

### 4. High: open-quantum hydrogen momentum rendering still evaluates position-space orbitals

The density-matrix hydrogen basis evaluator always computes `hydrogenRadial(...)` from position-space `r3D`, and the density-grid compute path uses that evaluator directly. In momentum representation, the open-quantum hydrogen path therefore still builds a position-space density field.

Impact:
- Hydrogen open-quantum momentum views are physically incorrect.
- The pure-state hydrogen momentum path and density-matrix hydrogen momentum path disagree about what is being displayed.
- Users can switch to hydrogen momentum representation and still see position-space mixed-state output.

Evidence:
- `src/rendering/webgpu/shaders/schroedinger/quantum/singleBasis.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/compute/densityGrid.wgsl.ts`

### 5. Medium: hydrogen ND time evolution omits extra-dimensional oscillator energy

Hydrogen ND states include extra harmonic-oscillator factors in dimensions `4+`, but both the position-space and momentum-space hydrogen ND time evolution paths use only the 3D hydrogen energy `-0.5 / n^2`. The extra-dimensional `Σ ω_j (n_j + 0.5)` contribution is not included in the phase evolution.

Impact:
- Phase animation is wrong for hydrogen ND states with nontrivial extra-dimensional structure.
- Any phase-derived diagnostic or visual effect can drift from the intended ND eigenenergy.
- The implementation mixes a hybrid ND basis with incomplete time evolution.

Evidence:
- `src/rendering/webgpu/shaders/schroedinger/quantum/hydrogenNDCommon.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/quantum/psi.wgsl.ts`
- `src/lib/physics/openQuantum/hydrogenBasis.ts`

### 6. Medium: radial-probability overlays are not representation-aware and are inconsistent with field scaling

The radial-probability overlay samples `P(r)` from raw world-space radius and position-space `R_nl(r)`, while the renderer enables it for hydrogen regardless of representation. That makes the overlay physically wrong in hydrogen momentum mode, and it also misregisters shells when `fieldScale != 1`.

Impact:
- Radial shell overlays are incorrect in hydrogen momentum representation.
- Changing `fieldScale` can shift overlay shells relative to the actual sampled hydrogen orbital.
- The overlay can look precise while no longer matching the displayed state.

Evidence:
- `src/rendering/webgpu/shaders/schroedinger/volume/radialProbability.wgsl.ts`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/components/sections/Advanced/SchroedingerCrossSectionSection.tsx`

### 7. Medium: hydrogen ND preset state can drift out of sync with the actual orbital configuration

The preset picker shows presets from all dimensions, store updates like `extraDimFrequencySpread` do not switch the preset back to `custom`, and the dimension-change visibility fix can rewrite hydrogen `m` without clearing the selected preset. That lets the UI claim a named preset while the live orbital no longer matches it.

Impact:
- The selected hydrogen preset label is not trustworthy after several common edits.
- Higher-dimensional preset choices can be partially applied in lower-dimensional scenes.
- Debugging or sharing a specific hydrogen ND preset becomes harder because the visible preset name can be stale.

Evidence:
- `src/components/sections/Geometry/SchroedingerControls/HydrogenNDControls.tsx`
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/lib/geometry/extended/schroedinger/hydrogenNDPresets.ts`

### 8. Medium: hydrogen/open-quantum URL state does not round-trip cleanly

The URL serializer/deserializer supports open-quantum parameters, but `useUrlState()` only applies dimension, object type, and quantum mode. Separately, persisted state migrates legacy `hydrogenOrbital` to `hydrogenND`, but URL parsing does not, so older hydrogen share links can silently fall back to the default quantum mode.

Impact:
- Shared hydrogen open-quantum URLs are not reproducible.
- Older hydrogen links can load the wrong mode without warning.
- The URL format claims more hydrogen fidelity than the app actually restores.

Evidence:
- `src/lib/url/state-serializer.ts`
- `src/hooks/useUrlState.ts`
- `src/stores/utils/mergeWithDefaults.ts`

## Testing Gaps

I did not run tests, per request.

Notable uncovered or under-covered areas:
- hydrogen open-quantum dynamics using the same physical energy convention as the main hydrogen renderer
- complex `Y_lm` phase preservation in the non-real hydrogen render path
- open-quantum hydrogen behavior for extra-dimensional presets and custom extra-dimensional excited states
- hydrogen open-quantum momentum rendering correctness
- hydrogen ND phase evolution for extra-dimensional energies
- radial-probability overlay behavior in momentum representation and under non-default `fieldScale`
- preset/UI synchronization after dimension changes and frequency-spread edits
- URL round-tripping of hydrogen open-quantum settings and legacy hydrogen mode aliases

## Notes

- The density-matrix hydrogen basis shader looked better than the main pure-state hydrogen shader in one important respect: it does preserve full complex `Y_lm` values for per-basis evaluation.
- Most of the biggest hydrogen issues are integration mismatches between otherwise reasonable subsystems rather than a single obviously broken hydrogen math module.
