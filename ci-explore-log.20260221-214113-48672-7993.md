## Active Target
- Feature: URL state serialization and restoration
- Module: `src/lib/url`
- Files in scope (2):
  - `src/lib/url/index.ts`
  - `src/lib/url/state-serializer.ts`

## Task Queue Details
- [completed] Understand purpose of URL state serialization feature (`src/lib/url`) and intended user-facing behavior
  - Evidence:
    - `docs/api.md` defines URL-state roundtrip for shareable exact configurations.
    - `src/hooks/useUrlState.ts` applies parsed URL fields to stores on initial mount.
  - Intended behavior:
    - Encode relevant simulator params into URL query parameters for sharing.
    - Parse partial or full URL payload defensively (invalid fields ignored, no crash).
    - `scene` query parameter is prioritized and mutually exclusive with direct parameter payload.
- [completed] Analyze `src/lib/url/index.ts`
  - File role: Pure barrel for URL utility exports.
  - Symbols: no local function implementations; only re-export surface from `state-serializer.ts`.
  - Risk check: no logic path; low defect surface.
- [completed] Analyze `src/lib/url/state-serializer.ts`
  - Functions analyzed (full bodies): `serializeState`, `deserializeState`, `generateShareUrl`, `parseCurrentUrl`.
  - Validation behavior:
    - Dimension parsed only for strict integer tokens and constrained to `[MIN_DIMENSION, MAX_DIMENSION]`.
    - Object type validated via `isValidObjectType`.
    - Quantum mode validated against explicit allow-list.
    - Open-quantum rates parsed only when `oq=1`, finite-check + clamp to `[0,5]`.
  - Cross-file note:
    - Serializer/deserializer include open-quantum fields, requiring downstream apply path to consume them.
- [completed] Trace flow: app state -> compressed URL payload -> history update
  - Flow found:
    - `ShareableState` -> `serializeState(...)` -> `generateShareUrl(...)`.
  - No history update call path found in app code (`history.replaceState`/`pushState` absent).
  - Uncertainty note:
    - Could be intentional (URL generator used only by external caller), but no direct in-app writer integration was found in current source tree.
- [in_progress] Trace flow: URL payload -> decoded state merge -> store restoration safeguards
  - Current trace:
    - `useUrlState` -> `parseCurrentUrl` -> `deserializeState` -> `applyUrlStateParams`.
    - `applyUrlStateParams` currently applies only `dimension`, `objectType`, `quantumMode`.
- [pending] Fix defect: apply open-quantum URL params in `src/hooks/useUrlState.ts`
- [pending] Add regression tests for open-quantum URL restoration in `src/tests/hooks/useUrlState.test.ts`
- [pending] Evaluate URL state serialization feature against intended behavior and add issue items if defects exist

## Issues Found
- [ISSUE-001] Open-quantum URL parameters are parsed but never applied.
  - Evidence:
    - Parser emits `openQuantumEnabled`, `openQuantumDephasingRate`, `openQuantumRelaxationRate`, `openQuantumThermalUpRate` in `src/lib/url/state-serializer.ts`.
    - `applyUrlStateParams` in `src/hooks/useUrlState.ts` does not consume those fields.
  - Impact:
    - Shared URLs containing `oq=1` and rate params do not restore the intended open-quantum simulation state.

## Issues Fixed
- None yet.

## Deferred for Developer
- None yet.
