# Lighting unknown-key whitelist fix (2026-02-21)

## Problem
`normalizeLightingLoadData` in `presetManagerStore` normalized known fields but returned a raw clone object, allowing unknown imported keys to leak into `useLightingStore` state via direct `setState` during preset load.

## Fix
In `src/stores/presetManagerStore.ts`:
- Added `LIGHTING_LOAD_KEYS` whitelist.
- Updated `normalizeLightingLoadData` to return a new object containing only whitelisted lighting fields after normalization.
- Unknown keys are now dropped before hydration.

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `drops unknown imported style lighting fields on load`

## Verification
- Fail-first targeted test failed pre-fix (`mysteryLighting` leaked into store state).
- Post-fix targeted test passed.
- Related 10-file regression sweep passed.
- ESLint passed for touched files.