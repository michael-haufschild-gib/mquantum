# URL State Hydration Fidelity Fix (2026-02-20)

## Scope
- Target feature: URL state serialization (`src/lib/url`)
- Investigated files:
  - `src/lib/url/index.ts`
  - `src/lib/url/state-serializer.ts`

## Defects Found
1. `ss` (shader settings) could be serialized without `sh` (default shader type), but deserialization only parsed `ss` when `state.shaderType` was already set.
2. `useUrlState` parsed URL `uniformScale` and `shaderSettings` but did not apply them to stores.

## Fixes
- `src/lib/url/state-serializer.ts`
  - In `deserializeState`, parse `ss` with `effectiveShaderType = state.shaderType ?? DEFAULT_SHADER_TYPE`.
  - Infer `state.shaderType` when settings are parsed but `sh` was omitted.
- `src/hooks/useUrlState.ts`
  - Apply `uniformScale` via transform store setter.
  - Apply `shaderSettings` via appearance store setters (`setWireframeSettings` / `setSurfaceSettings`) with default shader fallback.

## Tests Added
- `src/tests/lib/url/state-serializer.test.ts`
  - `should preserve default surface shader settings when sh param is omitted`
- `src/tests/hooks/useUrlState.test.ts`
  - `applies uniformScale and shaderSettings from parsed URL state`

## Verification
- `npx vitest run src/tests/components/ShareButton.test.tsx src/tests/lib/url/state-serializer.test.ts src/tests/hooks/useUrlState.test.ts` -> pass
- Targeted lint on changed files passed.
