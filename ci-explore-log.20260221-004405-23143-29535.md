## Active Target
- URL state serialization (`src/lib/url`)
- Mission: Accurate, shareable, deterministic serialization/hydration of Schrödinger scene state.

## Task Queue Details
- [completed] Understand purpose of URL state serialization feature
  - Evidence: `docs/api.md` contract + `src/lib/url/state-serializer.ts` JSDoc + `src/hooks/useUrlState.ts` usage.
  - Intended behavior: Encode selected scene/store parameters to query params; decode with validation and apply to stores without hydration races.
- [completed] Analyze `src/lib/url/index.ts`
  - File content is barrel re-export only.
  - No executable logic, no side effects, no additional runtime risk.
- [completed] Analyze `src/lib/url/state-serializer.ts`
  - Exported functions read: `serializeState`, `deserializeState`, `generateShareUrl`, `parseCurrentUrl`.
  - Long internal functions read: serializer/deserializer `forEach` callbacks for shader settings.
  - Dependency trace: consumed by `ShareButton` and `useUrlState`; covered by serializer/hook tests.
- [completed] Trace URL state encode/decode flow across stores and UI hydration
  - Encode path: `ShareButton.handleShare` -> `generateShareUrl` -> `serializeState` -> clipboard URL.
  - Decode path: `useUrlState` effect -> `parseCurrentUrl` -> `deserializeState` -> `applyUrlStateParams` -> Zustand setters.
  - Scene path: `?scene=` short-circuits parameter application and waits for preset hydration when needed.
  - Failure mode confirmed: parsed non-finite `sbr` reaches `setSkyboxRotation` normalization and can become `NaN`.
- [in_progress] Evaluate URL state serialization feature against intended behavior
- [pending] Fix URL deserialization accepting non-finite skybox rotation values

## Issues Found
- `deserializeState` accepts non-finite `sbr` (e.g. `Infinity`) because it checks only `!isNaN(parsed)`.
- Impact path: `useUrlState` passes parsed rotation to `setSkyboxRotation`; modulo normalization with `Infinity` yields `NaN`, corrupting skybox rotation state.

## Issues Fixed
- None yet.

## Deferred for Developer
- None.
