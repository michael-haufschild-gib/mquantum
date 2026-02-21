# Skybox direct setter invariant enforcement (2026-02-21)

## Problem
`skyboxSelection` is documented as the unified skybox source-of-truth, but direct setters (`setSkyboxEnabled`, `setSkyboxMode`, `setSkyboxTexture`) previously mutated only individual fields, creating inconsistent combinations between selection/enabled/mode/texture.

## Fix
In `src/stores/slices/skyboxSlice.ts`:
- Added `deriveSelectionFromModeAndTexture`.
- Updated direct setters to derive and apply a canonical `skyboxSelection`, then recompute all derived fields via `deriveStateFromSelection`.
  - `setSkyboxEnabled(false)` => selection `none`.
  - `setSkyboxEnabled(true)` => derive from mode+texture, fallback `space_blue`.
  - `setSkyboxMode(procedural*)` => selection procedural mode.
  - `setSkyboxMode('classic')` => selection from texture, fallback `space_blue`.
  - `setSkyboxTexture('none')` => selection `none`, otherwise selection texture.

## Test
Added in `src/tests/stores/environmentStore.test.ts`:
- `keeps unified skybox selection and derived fields in sync for direct setters`

## Verification
- Fail-first targeted test failed pre-fix.
- Post-fix:
  - `src/tests/stores/environmentStore.test.ts` passes.
  - Related suites pass with preset and cubemap tests.
  - ESLint passes on touched files.
