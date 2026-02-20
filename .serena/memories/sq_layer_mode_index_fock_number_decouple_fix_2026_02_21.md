# SQ Layer k vs n Decoupling Fix (2026-02-21)

## Problem
Second-quantization UI used `sqLayerSelectedModeIndex` (mode index `k`) as `SecondQuantParams.n` for Fock computations in `SecondQuantizationSection`, conflating inspected mode selection with Fock occupation quantum number.

## Fix
Added explicit Fock quantum number state/action and decoupled metrics wiring:
- New config field: `sqLayerFockQuantumNumber` (default `0`)
- New setter: `setSchroedingerSqLayerFockQuantumNumber(n)` clamped to `[0, 10]`
- `SecondQuantParams.n` now uses `sqLayerFockQuantumNumber`
- Added Fock-only UI slider `sq-layer-fock-n`
- Vacuum preset now resets Fock `n` to `0`

## Wiring updated
- `src/lib/geometry/extended/types.ts`
- `src/stores/slices/geometry/types.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/components/sections/Geometry/SchroedingerControls/types.ts`
- `src/components/sections/Advanced/SchroedingerCrossSectionSection.tsx`
- `src/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection.tsx`

## Persistence/transience
SQ layer remains transient (not serialized into presets/scenes):
- Added `sqLayerFockQuantumNumber` to `TRANSIENT_FIELDS` in `src/stores/utils/presetSerialization.ts`.

## Regression tests
Updated tests verify:
- Fock `n` slider visibility by mode
- Fock occupation is independent from mode index `k`
- Vacuum preset resets Fock `n`
- Fock setter clamping
- Transient stripping for preset serialization and legacy scene load

## Verification command
`npx vitest run --maxWorkers=4 src/tests/components/sections/SecondQuantizationSection.test.tsx src/tests/stores/slices/geometry/schroedingerSqLayer.test.ts src/tests/stores/utils/presetSerialization.test.ts src/tests/stores/presetManagerStore.test.ts src/tests/lib/math/secondQuantization.test.ts`

Result: PASS (89 tests)
