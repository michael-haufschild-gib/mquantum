# Harmonic Oscillator frequencySpread regeneration dead-zone fix (2026-02-21)

## Problem
In `WebGPUSchrodingerRenderer.updateSchroedingerUniforms`, cached HO preset regeneration used:
`Math.abs(prev.frequencySpread - next.frequencySpread) > 0.001`.

UI slider step for frequencySpread is `0.0001`, so many user adjustments were ignored and did not regenerate HO preset coefficients.

## Fix
- Added `frequencySpreadChanged` check with epsilon `1e-6`.
- `needsPresetRegen` now uses this fine-grained check, eliminating slider dead zones.

## Files
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`

## Regression test
Added test:
- `regenerates cached preset when frequencySpread changes by UI slider step (0.0001)`

It confirmed pre-fix failure and post-fix pass by checking `cachedPresetConfig.frequencySpread` updates from `0.01` to `0.0101`.

## Verification
`npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts src/tests/stores/slices/geometry/schroedingerPresets.test.ts`

Result: PASS (9 tests)
