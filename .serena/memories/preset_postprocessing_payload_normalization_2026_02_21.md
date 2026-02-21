# Preset post-processing payload normalization (2026-02-21)

## Problem
`presetManagerStore.loadStyle/loadScene` directly hydrated post-processing state, bypassing `postProcessingSlice` action-level constraints. Imported presets could set invalid booleans/enums and out-of-range finite numeric values.

## Fix
In `src/stores/presetManagerStore.ts`:
- Added `normalizePostProcessingLoadData` and `clampToRange`.
- Applied normalization before post-processing `setState` in both style and scene load paths.

## Normalization coverage
- Booleans: `bloomEnabled`, `cinematicEnabled`, `paperEnabled`, `frameBlendingEnabled`
- Enums:
  - `antiAliasingMethod` in `none|fxaa|smaa`
  - `paperQuality` in `low|medium|high`
- Numeric clamp alignment with slice contracts:
  - Bloom: gain, threshold, knee, radius
  - Cinematic: aberration, vignette, grain
  - Paper: contrast/roughness/fiber/fiberSize/crumples/crumpleSize/folds/foldCount/drops/fade/seed/intensity
  - Frame blending factor
- String type checks for paper colors

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `normalizes imported style post-processing payload to store invariants on load`

## Verification
- Fail-first targeted test failed pre-fix (`bloomEnabled` became `'yes'`).
- Post-fix targeted and related suites passed.
- ESLint passed for touched files.
