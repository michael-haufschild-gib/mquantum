# Post-processing unknown-key whitelist fix (2026-02-21)

## Problem
`normalizePostProcessingLoadData` in `presetManagerStore` normalized known fields but returned a mutated clone of raw imported payload. Unknown keys survived and were written into `usePostProcessingStore` via direct `setState` during preset load.

## Fix
In `src/stores/presetManagerStore.ts`:
- Added `POST_PROCESSING_LOAD_KEYS` whitelist.
- Updated `normalizePostProcessingLoadData` to return a new object containing only whitelisted post-processing keys after normalization.
- Unknown keys are dropped before hydration.

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `drops unknown imported style post-processing fields on load`

## Verification
- Fail-first targeted test failed pre-fix (`mysteryEffect` leaked into store state).
- Post-fix targeted test passed.
- Related 10-file regression sweep passed.
- ESLint passed for touched files.