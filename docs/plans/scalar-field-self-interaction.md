# Self-Interaction Potential for Free Scalar Field

## Status: IMPLEMENTED

## Context

The free scalar field mode simulates the Klein-Gordon equation `d²φ/dt² = ∇²φ − m²φ`.
Adding an optional self-interaction V(φ) = λ(φ²−v²)² turns it into the proper field-theoretic
equation for false vacuum decay. The force term is dV/dφ = 4λφ(φ²−v²), producing a "Mexican hat"
potential with minima at φ = ±v. This enables bubble nucleation as a proper scalar field theory
simulation rather than the single-particle QM analogy in the TDSE mode.

## Changes Made

### 1. Types: `types.ts`
- Added `'kinkProfile'` to `FreeScalarInitialCondition` union
- Added 3 fields to `FreeScalarConfig`: `selfInteractionEnabled`, `selfInteractionLambda`, `selfInteractionVev`
- Added defaults to `DEFAULT_FREE_SCALAR_CONFIG`: `false`, `0.5`, `1.0`

### 2. WGSL Uniforms: `freeScalarInit.wgsl.ts`
- Extended `FreeScalarUniforms` struct with `selfInteractionEnabled`, `selfInteractionLambda`, `selfInteractionVev`, `_padSI`
- Struct size: 480 → 496 bytes
- Added kink initial condition (`initCondition == 3u`): `phi = v * tanh((x - center) / width)`

### 3. Shader: `freeScalarUpdatePi.wgsl.ts`
- Added self-interaction force term: `force -= 4λφ(φ²−v²)` when enabled
- Refactored single-line pi update into `var force` + conditional + final update

### 4. Shader: `freeScalarWriteGrid.wgsl.ts`
- Added λ(φ²−v²)² to energy density view (fieldView == 2u)
- Added same to analysis mode V component (Hamiltonian character mode)

### 5. Compute Pass: `FreeScalarFieldComputePass.ts`
- `UNIFORM_SIZE`: 480 → 496
- Added `kinkProfile: 3` to `initConditionMap`
- Writes 3 new uniforms at indices 120-122
- `computeInitHash` includes lambda/vev when self-interaction is enabled
- `maxPhiEstimate` handles `kinkProfile` → `selfInteractionVev`
- `estimateMaxFieldValue` adds λv⁴ for energy density normalization

### 6. Store: `schroedingerSlice.ts` + `types.ts`
- Added 3 setters with validation: lambda clamped [0.01, 10.0], vev clamped [0.1, 5.0]

### 7. UI: `FreeScalarFieldControls.tsx` + `types.ts` + `index.tsx`
- Added Self-Interaction section: Switch + λ Slider + v (VEV) Slider + formula text
- `kinkProfile` initial condition appears only when self-interaction is enabled
- Wired 3 new store actions through component hierarchy

## Verification

1. Toggle self-interaction on → λ/v sliders appear, 'Kink (tanh)' option in initial conditions
2. Select kink initial condition → tanh step profile visible in phi view
3. Run simulation → domain wall / bubble propagation
4. Energy density view includes V(φ) contribution
5. Analysis mode (Hamiltonian character) shows self-interaction in V component
6. Toggle off → standard Klein-Gordon behavior restored
7. `npx vitest run` — all existing tests pass
