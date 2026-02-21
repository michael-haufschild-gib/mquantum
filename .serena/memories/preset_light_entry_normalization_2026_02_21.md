# Preset light entry normalization (2026-02-21)

## Problem
After scalar lighting normalization, imported `lighting.lights[]` payload entries were still hydrated raw. This allowed out-of-range per-light values and malformed shapes to bypass runtime light constraints.

## Fix
In `src/stores/presetManagerStore.ts`:
- Added helpers:
  - `isLightType`
  - `isFiniteVec3`
  - `normalizeLoadedLight`
- Extended `normalizeLightingLoadData` to sanitize `lights[]` entries:
  - clamp `intensity`, `coneAngle`, `penumbra`, `range`, `decay`
  - normalize rotation tuples with `normalizeRotationTupleSigned`
  - validate type/position/rotation and fallback to generated defaults
  - cap light count at `MAX_LIGHTS`
  - reconcile `selectedLightId` against normalized lights
  - validate `transformMode` and booleans (`showLightGizmos`, `isDraggingLight`)

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `normalizes imported style light entries to runtime light constraints on load`

## Verification
- Fail-first test failed pre-fix (`intensity` stayed `-5`).
- Post-fix targeted test passed.
- Related suites passed across preset/lighting/animation/environment/presetSerialization/cubemap tests.
- ESLint passed for touched files.
