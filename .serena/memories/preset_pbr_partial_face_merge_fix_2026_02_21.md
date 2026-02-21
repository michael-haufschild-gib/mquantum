# PBR partial-face merge fix on preset load (2026-02-21)

## Problem
`normalizePbrLoadData` in `presetManagerStore` previously produced only provided valid `face` keys. During `usePBRStore.setState`, this replaced the full nested `face` object and dropped unspecified siblings to `undefined` when imported payloads were partial.

## Fix
In `src/stores/presetManagerStore.ts`:
- Updated `normalizePbrLoadData` to merge with `usePBRStore.getState().face` fallback values.
- When any face field is present in imported payload, normalization now emits a complete `face` object:
  - `roughness` clamped `[0.04, 1.0]`
  - `metallic` clamped `[0.0, 1.0]`
  - `specularIntensity` clamped `[0.0, 2.0]`
  - `specularColor` string-only
- Unspecified/invalid fields fall back to current valid state, preventing nested field loss.

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `preserves missing PBR face fields when imported payload is partial`

## Verification
- Fail-first targeted test failed pre-fix (`metallic` became `undefined`).
- Post-fix targeted test passed.
- Related 10-file regression sweep passed.
- ESLint passed for touched files.