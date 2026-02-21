# Environment unknown-key whitelist fix (2026-02-21)

## Problem
`normalizeEnvironmentLoadData` in `presetManagerStore` returned `{ ...environment, ...derivedSkybox }`, preserving unknown imported keys and allowing them to leak into `useEnvironmentStore` via direct `setState`.

## Fix
In `src/stores/presetManagerStore.ts`:
- Added `ENVIRONMENT_LOAD_KEYS` whitelist.
- Updated `normalizeEnvironmentLoadData` to pick only canonical environment keys before applying unified skybox selection derivation.
- Unknown keys are now dropped before hydration.

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `drops unknown imported style environment fields on load`

## Verification
- Fail-first targeted test failed pre-fix (`mysteryEnvironment` leaked into store state).
- Post-fix targeted test passed.
- Related 10-file regression sweep passed.
- ESLint passed for touched files.