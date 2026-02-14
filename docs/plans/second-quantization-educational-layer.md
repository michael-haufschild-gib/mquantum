# Plan: Second-Quantization Educational Layer on Existing Harmonic Oscillator Modes

Date: 2026-02-14
Status: Proposed
Scope: Educational/interpretive layer only (low-risk, no core renderer rewrite)

## 1. Goal

Add a second-quantization interpretation layer on top of the existing harmonic oscillator (HO) implementation so users can move from:

- wavefunction-level intuition (`psi(x)` and `W(x,p)`)

to:

- operator-level intuition (`a_k`, `a_k^\dagger`, `n_k`, coherent states, squeezed states).

The intent is to keep the current rendering pipeline intact and add mathematically correct overlays, presets, and derived observables.

## 2. Why This Fits This Codebase

Existing code already has the right primitives:

- Quantum mode and representation model:
  - `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/types.ts:240`
  - `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/types.ts:244`
- Representation selector and Wigner controls in UI:
  - `/Users/Spare/Documents/code/mquantum/src/components/sections/Geometry/SchroedingerControls/index.tsx:175`
- HO + Wigner infrastructure in WGSL and compute passes:
  - `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/quantum/wignerHO.wgsl.ts:46`
  - `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/passes/WignerCacheComputePass.ts:91`

This means we can treat second quantization primarily as a semantic and pedagogical layer over already computed states.

## 3. Physics Model (Educational Layer)

### 3.1 Core operator model (per mode)

For each decoupled oscillator mode `k`:

```text
[ a_k, a_q^\dagger ] = delta_{kq}
N_k = a_k^\dagger a_k
H = sum_k hbar * omega_k * (N_k + 1/2)
```

Interpretation:

- `a_k^\dagger` adds one excitation (quantum) to mode `k`.
- `a_k` removes one excitation from mode `k`.
- `n_k = <N_k>` is occupancy.

### 3.2 Quadratures and uncertainty

Define dimensionless quadratures for a selected mode:

```text
X_k = (a_k + a_k^\dagger)/sqrt(2)
P_k = (a_k - a_k^\dagger)/(i*sqrt(2))
Delta X_k * Delta P_k >= 1/2
```

These map directly to visual signatures in the Wigner plot.

### 3.3 State families to expose

1. Fock state (number state) `|n>`

```text
N|n> = n|n>
```

Wigner signature: oscillatory rings with sign changes/negative regions for `n > 0`.

2. Coherent state `|alpha>`

```text
a|alpha> = alpha|alpha>
|alpha> = D(alpha)|0>
```

Wigner signature: Gaussian blob displaced in phase space; minimum uncertainty.

3. Squeezed state `|zeta>` (`zeta = r e^{i theta}`)

```text
|zeta> = S(zeta)|0>
Delta X = e^{-r}/sqrt(2)
Delta P = e^{+r}/sqrt(2)
```

Wigner signature: ellipse (one axis compressed, other expanded), preserving area.

### 3.4 Mapping to existing HO representation

Current HO state is a superposition of basis terms already in code (`termCount`, coefficients/phases internal to current generator). Educational layer computes derived quantities from this representation:

- `n_k` estimates per selected mode/dimension.
- `E_k = hbar * omega_k * (n_k + 1/2)`.
- uncertainty and covariance inferred from sampled moments in phase space (or analytic for presets).

## 4. High-Level Integration Design

### 4.1 Data model additions (types/store)

Add a non-breaking nested section under `SchroedingerConfig`:

```ts
secondQuantization: {
  enabled: boolean
  educationalMode: 'off' | 'fock' | 'coherent' | 'squeezed'
  selectedModeIndex: number          // which HO mode/dimension to inspect
  showLadderOperators: boolean       // show a/a† action panel
  showNumberSpectrum: boolean
  showUncertaintyOverlay: boolean

  // coherent preset
  coherentAlphaRe: number
  coherentAlphaIm: number

  // squeezed preset
  squeezeR: number
  squeezeTheta: number

  // display settings
  normalizeOccupancies: boolean
}
```

Primary integration point:

- `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/types.ts:240`

Store actions in slice:

- `/Users/Spare/Documents/code/mquantum/src/stores/slices/geometry/schroedingerSlice.ts`

### 4.2 UI integration

Add a new section in `SchroedingerControls` beneath representation controls:

- `Section title="Second Quantization"`
- Only visible when `quantumMode === 'harmonicOscillator'`.

Primary integration point:

- `/Users/Spare/Documents/code/mquantum/src/components/sections/Geometry/SchroedingerControls/index.tsx:175`

Suggested controls:

- Toggle: `Enable Second-Quantization Layer`
- ToggleGroup: `Interpretation` (`Fock`, `Coherent`, `Squeezed`)
- Select: `Mode Index k`
- Checkbox row: `Show n_k`, `Show a/a†`, `Show uncertainty`
- Coherent controls: `alpha_re`, `alpha_im`
- Squeezed controls: `r`, `theta`
- Button presets:
  - `Vacuum |0>`
  - `Coherent (small alpha)`
  - `Strongly squeezed`

### 4.3 Rendering and compute strategy

No major pipeline rewrite.

- Reuse existing fragment/compute outputs.
- Add lightweight derived-observable computation in TS or a tiny compute pass.
- Overlay text/indicators in UI panel (not mandatory in-canvas HUD initially).
- In Wigner representation, overlay analytic contour guides (optional) against cached Wigner texture.

Potential optional pass:

- `SecondQuantizationMetricsPass`:
  - Inputs: existing basis coefficients/uniforms and (optionally) Wigner cache texture.
  - Outputs: small storage buffer with moments (`<X>`, `<P>`, variances, covariance, `n_k`).

## 5. High-Level User Experience

### 5.1 User story A: from wavefunction to occupancy

1. User is in HO mode, representation `position`.
2. User enables `Second Quantization` and selects `Fock`.
3. UI shows per-mode table:
   - `k`, `omega_k`, `n_k`, `E_k`.
4. User moves superposition sliders/presets; table updates live.

Learning outcome: user sees each mode as a quantum oscillator with countable excitations.

### 5.2 User story B: coherent state visual signature

1. User switches representation to `wigner`.
2. Selects `Coherent` preset with nonzero `alpha`.
3. Wigner map displays shifted Gaussian blob; uncertainty panel shows near-minimum product.

Learning outcome: coherent states are classical-like displaced vacuum states.

### 5.3 User story C: squeezing

1. User selects `Squeezed`, increases `r`.
2. Wigner distribution becomes elliptical.
3. Panel displays `DeltaX`, `DeltaP`, and `DeltaX*DeltaP`.

Learning outcome: squeezing redistributes uncertainty, respecting the lower bound.

## 6. UI Elements and Component Sketch

Suggested components:

- `SecondQuantizationSection.tsx`
- `FockOccupationTable.tsx`
- `UncertaintyMetricsCard.tsx`
- `StatePresetButtons.tsx`

Placement:

- Inside `/Users/Spare/Documents/code/mquantum/src/components/sections/Geometry/SchroedingerControls/index.tsx`
- Keep advanced visual toggles in existing advanced sections unchanged.

## 7. Validation Plan

### 7.1 Physics checks

- Vacuum preset yields approximately:
  - `n_k ~= 0`
  - `DeltaX ~= DeltaP ~= 1/sqrt(2)`
- Coherent state:
  - `DeltaX`, `DeltaP` near vacuum values
  - nonzero means (`<X>`, `<P>`) from `alpha`
- Squeezed state:
  - `DeltaX` decreases with `r`, `DeltaP` increases with `r`
  - product remains `>= 1/2`

### 7.2 Testing scope

- Unit tests for derived-metric math functions.
- Component tests for control visibility and action wiring.
- Existing Wigner rendering tests remain baseline; no regression expected.

## 8. Implementation Phasing

Phase 1 (MVP):

- Add config fields + store setters.
- Add UI panel + preset buttons.
- Compute and show `n_k`, `E_k`, uncertainty metrics.

Phase 2:

- Optional Wigner analytic contour overlays.
- In-canvas annotations for selected mode.

Phase 3:

- Scenario scripts/tutorial cards linking wavefunction and operator views.

## 9. Risks and Mitigations

- Risk: ambiguity in extracting `n_k` from arbitrary finite superpositions.
  - Mitigation: document estimator method and show confidence/approximation note.
- Risk: users confuse educational overlays with full QFT dynamics.
  - Mitigation: explicit label: `Educational operator interpretation of HO modes`.
- Risk: UI overload.
  - Mitigation: hide section behind one master toggle and mode-specific subpanels.

## 10. Acceptance Criteria

- HO workflows render as before when layer is disabled.
- Enabling layer adds no WebGPU errors and no frame drops beyond acceptable UI overhead.
- Users can switch among Fock/coherent/squeezed presets and immediately see consistent metrics.
- Wigner representation exhibits expected qualitative signatures for each preset.
