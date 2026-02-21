# Preset PBR payload normalization (2026-02-21)

## Problem
Preset style/scene load hydrated PBR state directly (`usePBRStore.setState`), bypassing PBR action-level clamps. Imported out-of-range finite values in `pbr.face` could persist.

## Fix
In `src/stores/presetManagerStore.ts`:
- Added `normalizePbrLoadData`.
- Applied in both `loadStyle` and `loadScene` before hydrating PBR store.

## Enforced contracts
- `face.roughness`: clamp to `[0.04, 1.0]`
- `face.metallic`: clamp to `[0.0, 1.0]`
- `face.specularIntensity`: clamp to `[0.0, 2.0]`
- `face.specularColor`: string-only

Also supports legacy flat fields (`roughness`, `metallic`, `specularIntensity`, `specularColor`) by normalizing them into `face` and dropping the flat keys.

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `normalizes imported style PBR payload to store invariants on load`

## Verification
- Fail-first targeted test failed pre-fix (`roughness = -5`).
- Post-fix targeted + related suites passed.
- ESLint passed for touched files.
