# Preset lighting scalar normalization on load (2026-02-21)

## Problem
`presetManagerStore.loadStyle/loadScene` directly hydrated lighting state with `setState`, bypassing `lightingSlice` action-level normalization. Imported finite out-of-range values for lighting scalar controls were applied raw.

## Fix
In `src/stores/presetManagerStore.ts`:
- Added `normalizeLightingLoadData(rawLighting)`.
- Applied it before `useLightingStore.setState(...)` in both `loadStyle` and `loadScene`.

## Enforced contracts
- `lightHorizontalAngle` normalized to `[0, 360)`
- `lightVerticalAngle` clamped to `[-90, 90]`
- `ambientIntensity` clamped to `[0, 1]`
- `lightStrength` clamped to `[0, 3]`
- `exposure` clamped to `[0.1, 3]`
- non-finite/invalid scalar fields dropped

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `normalizes imported style lighting scalar fields to store invariants on load`

## Verification
- Fail-first targeted test failed pre-fix (`lightHorizontalAngle` remained `-450`).
- Post-fix targeted + related suites passed.
- ESLint passed for touched files.
