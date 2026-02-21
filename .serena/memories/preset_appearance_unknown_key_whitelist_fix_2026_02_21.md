# Appearance unknown-key whitelist fix (2026-02-21)

## Problem
`normalizeAppearanceLoadData` in `presetManagerStore` enforced value contracts but returned a clone including unknown imported keys, which leaked into `useAppearanceStore` via direct `setState` on preset load.

## Fix
In `src/stores/presetManagerStore.ts`:
- Added `APPEARANCE_LOAD_KEYS` whitelist.
- Updated `normalizeAppearanceLoadData` to return only canonical appearance keys after normalization.
- Unknown keys are now dropped before hydration.

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `drops unknown imported style appearance fields on load`

## Verification
- Fail-first targeted test failed pre-fix (`mysteryAppearance` leaked into store state).
- Post-fix targeted test passed.
- Related 10-file regression sweep passed.
- ESLint passed for touched files.