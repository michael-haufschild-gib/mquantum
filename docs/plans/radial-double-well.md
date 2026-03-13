# Radial Double Well Potential for TDSE

## Status: IMPLEMENTED

## Context

The original `doubleWell` potential (type 8) uses `V(x) = λ(x²−a²)² − εx` along axis 0.
Converting this naively to radial coordinates `V(r) = λ(r²−a²)² − εr` produces only one minimum
for r > 0 — the second well at negative x doesn't exist in radial space. This makes it unsuitable
for bubble nucleation simulations.

## Solution

Keep `doubleWell` (type 8) as directional along axis 0. Add a new `radialDoubleWell` (type 10) with
a formula that has two explicit radial minima:

```
V(r) = λ(r − r₁)²(r − r₂)² − εr
```

where `r₁` is the inner minimum radius, `r₂` is the outer minimum radius, `λ` scales the barrier
height, and `ε` tilts the potential to make the outer well deeper (driving bubble nucleation).

## Changes Made

### 1. WGSL Uniforms: `tdseUniforms.wgsl.ts`
- Added `radialWellInner`, `radialWellOuter`, `radialWellDepth`, `radialWellTilt` (f32 each)
- Added type 10 to `potentialType` comment
- Struct size: 688 → 704 bytes

### 2. Shader: `tdsePotential.wgsl.ts`
- Reverted type 8 back to directional `V(pos0) = λ(pos0²−a²)² − ε·pos0`
- Added type 10: radial `V(r) = λ(r−r₁)²(r−r₂)² − ε·r` with N-dimensional r

### 3. TypeScript types: `types.ts`
- Added `'radialDoubleWell'` to `TdsePotentialType` union
- Added 4 fields to `TdseConfig`: `radialWellInner`, `radialWellOuter`, `radialWellDepth`, `radialWellTilt`
- Added defaults to `DEFAULT_TDSE_CONFIG`

### 4. Store: `schroedingerSlice.ts` + `types.ts`
- Added 4 setters with validation and clamping

### 5. Compute pass: `TDSEComputePass.ts`
- `UNIFORM_SIZE`: 688 → 704
- Added `radialDoubleWell: 10` to potMap
- Writes 4 new uniforms at indices 171-174
- Added new params to potHash for dirty tracking

### 6. Presets: `presets.ts`
- Reverted `falseVacuumDecay` back to directional doubleWell params
- Added new `bubbleNucleation` preset using `radialDoubleWell`

### 7. UI: `TDSEPotentialControls.tsx` + constants + types
- Added `'Radial Double Well'` to potential type dropdown
- Added 4 sliders: Inner Radius, Outer Radius, Well Depth, Tilt
- Wired store actions through component hierarchy

## Verification

1. Hard-refresh, select `Bubble Nucleation` preset in 2D, 3D, 4D
2. Wavefunction should start at inner minimum (r₁), tunnel through barrier, expand to outer minimum (r₂)
3. `False Vacuum Decay` preset should still work as directional double well along axis 0
4. All other presets unaffected
