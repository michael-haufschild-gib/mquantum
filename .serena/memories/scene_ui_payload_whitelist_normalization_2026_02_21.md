# Scene UI payload whitelist normalization (2026-02-21)

## Problem
`presetManagerStore.loadScene` sanitized/clamped `animationBias` but then directly called `useUIStore.setState(uiData)`, allowing unknown keys from imported scene JSON to be injected into UI store state.

## Fix
In `src/stores/presetManagerStore.ts`:
- Added `normalizeUiLoadData`.
- Replaced inline UI normalization block in `loadScene` with `normalizeUiLoadData(...)`.
- Normalization now whitelists canonical UI load fields and currently keeps only finite `animationBias` clamped to `[0, 1]`.
- Unknown/non-canonical UI payload keys are dropped.

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `normalizes imported scene UI payload fields to store invariants on load`

The regression asserts:
- invalid/legacy UI fields do not override transient runtime UI state
- unknown key (`mysteryFlag`) is not injected into `useUIStore`
- `animationBias` remains clamped.

## Verification
- Fail-first targeted test failed pre-fix (`mysteryFlag` leaked into store).
- Post-fix targeted and related suite sweep passed.
- ESLint passed for touched files.