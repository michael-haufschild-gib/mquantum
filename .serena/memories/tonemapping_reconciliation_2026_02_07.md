# Tonemapping Reconciliation (2026-02-07)

## Summary
Consolidated separate `TonemappingPass` + `CinematicPass` back into a single `ToneMappingCinematicPass`.

## Bugs Fixed in the Separate TonemappingPass (tonemapping.wgsl.ts)
1. **AgX AGX_INPUT_MATRIX**: Wrong multiplication order — was `LINEAR_SRGB_TO_LINEAR_REC2020 * AgXInsetMatrix`, should be `AgXInsetMatrix * LINEAR_SRGB_TO_LINEAR_REC2020`
2. **AgX AGX_OUTSET_MATRIX**: Transposed vs Three.js source
3. **AgX LINEAR_REC2020_TO_LINEAR_SRGB**: Transposed vs Three.js source
4. **Cineon**: Removed `pow(2.2)` causing double gamma (formula has built-in ~pow(1/2.2), removing pow(2.2) + sRGB output = double gamma)
5. **ACES**: Used simplified Narkowicz fit instead of full RRT+ODT with matrices

## Changes Made
- **ToneMappingCinematicPass.ts**: Added `Filmic = 5` (Uncharted 2) mode, fixed pipeline format to `rgba8unorm`, updated priority to 900, added `cinematicEnabled` check, added `toneMappingEnabled` check, added `ALGORITHM_TO_MODE` lookup
- **WebGPUScene.tsx**: Replaced both separate pass imports/instantiations with single combined pass. Removed `cinematicEnabled` from PassConfig (no longer triggers pipeline rebuild — handled dynamically via store)
- **Deleted**: `TonemappingPass.ts`, `CinematicPass.ts`, `tonemapping.wgsl.ts`
- **index.ts**: Updated exports

## Pipeline Change
Before: `hdr → TonemappingPass → ldr-color → CinematicPass → cinematic-output`
After:  `hdr → ToneMappingCinematicPass → ldr-color`

Saves one render target switch and texture fetch per frame.

## Key Design: Cinematic Enable/Disable
`cinematicEnabled` no longer triggers pipeline rebuild. The combined pass reads it from the postProcessing store and zeros out aberration/vignette/grain when disabled. This means toggling cinematic effects is now instant (no pipeline recompilation).
