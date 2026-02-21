# Preset appearance payload normalization (2026-02-21)

## Problem
`presetManagerStore.loadStyle/loadScene` hydrated appearance with direct `useAppearanceStore.setState(sanitizeLoadedState(...))`. This bypassed appearance slice action-level constraints for finite-range clamps and enum/boolean validation.

## Fix
In `src/stores/presetManagerStore.ts`:
- Added `normalizeAppearanceLoadData`.
- Added helper utilities `clampFiniteOrFallback` and `normalizeCosineVector`.
- Added enum sets for validation (`COLOR_ALGORITHM_SET`, `DOMAIN_COLORING_MODULUS_MODE_SET`, `DIVERGING_COMPONENT_SET`, `SHADER_TYPE_SET`).
- Applied normalization before appearance `setState` in both `loadStyle` and `loadScene`.

## Normalization coverage
- Colors and basic appearance toggles/types
- Color algorithm enum
- Cosine coefficients and distribution settings
- Multi-source weights
- LCH controls
- Domain coloring settings and diverging config
- Material emission controls
- Shader type and shader settings
- Advanced SSS controls

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `normalizes imported style appearance payload to store invariants on load`

## Verification
- Fail-first targeted test failed pre-fix (`colorAlgorithm` accepted invalid imported string).
- Post-fix targeted + related suite sweep passed.
- ESLint passed for touched files.