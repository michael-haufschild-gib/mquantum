## Active Target
- Feature: Post-processing persistence/hydration flow (URL, presets, defaults, bootstrap)
- Scope file count: 13 analysis files + flow tracing
- Status: Issue-fix cycle completed for this target
- Purpose: Shared URLs and preset/default loads must faithfully restore rendered post-processing/lighting appearance without injecting legacy fields.

## Task Queue Details
- [completed] Understand purpose of post-processing persistence/hydration flow (URL, presets, defaults, bootstrap)
- [completed] Analyze src/hooks/useUrlState.ts
- [completed] Analyze src/lib/url/state-serializer.ts
- [completed] Analyze src/components/controls/ShareButton.tsx
- [completed] Analyze src/main.tsx
- [completed] Analyze src/stores/presetManagerStore.ts
- [completed] Analyze src/stores/utils/presetSerialization.ts
- [completed] Analyze src/stores/index.ts
- [completed] Analyze src/stores/slices/index.ts
- [completed] Analyze src/assets/defaults/styles.json
- [completed] Analyze src/assets/defaults/scenes.json
- [completed] Analyze src/tests/lib/url/state-serializer.test.ts
- [completed] Analyze src/tests/hooks/useUrlState.test.ts
- [completed] Analyze src/tests/stores/presetManagerStore.test.ts
- [completed] Trace share URL -> serialize -> deserialize -> store apply flow for post-processing fields
- [completed] Trace preset save/load/import flow for post-processing fields
- [completed] Trace defaults bootstrap flow for post-processing fields
- [completed] Evaluate post-processing persistence/hydration against intended behavior
- [completed] Fix URL background hydration/source mismatch (render background)
- [completed] Fix URL tone-mapping/specular serialization-hydration gaps
- [completed] Strip removed gravity/object-depth legacy post-processing fields during preset sanitize/load

## Issues Found
1. URL background mismatch: `ShareButton` serialized `appearance.backgroundColor` while render output uses `environment.backgroundColor`; URL hydration applied `bg` only to appearance.
   - Impact: Shared links could restore a different clear/background color than the source render.
2. Partial enhanced-lighting URL pipeline:
   - `ShareButton` omitted `tm/ta/ex/sc` despite serializer support.
   - `useUrlState` did not apply `ta` and `sc` even when parsed.
   - Impact: Shared links lost tone-mapping algorithm and specular-color fidelity.
3. Legacy post-processing fields from bundled defaults/imports were not stripped:
   - `objectOnlyDepth`, `gravityEnabled`, `gravityStrength`, `gravityDistortionScale`, `gravityFalloff`, `gravityChromaticAberration`.
   - Impact: Removed fields could leak into persisted/loaded store payloads, polluting runtime state shape.

## Issues Fixed
1. URL background fidelity fix:
   - `src/components/controls/ShareButton.tsx`: source share background from `useEnvironmentStore`.
   - `src/hooks/useUrlState.ts`: apply URL `backgroundColor` to environment store (and keep appearance store in sync).
2. Enhanced-lighting URL fidelity fix:
   - `src/components/controls/ShareButton.tsx`: include `toneMappingEnabled`, `toneMappingAlgorithm`, `exposure`, `specularColor` in `generateShareUrl` payload.
   - `src/hooks/useUrlState.ts`: apply parsed `toneMappingAlgorithm` and `specularColor` (`usePBRStore.setFaceSpecularColor`).
3. Legacy post-processing field sanitization fix:
   - `src/stores/utils/presetSerialization.ts`: add removed gravity/object-depth keys to `TRANSIENT_FIELDS` so sanitize/import/load strips them.

## Verification
- `npx vitest run --maxWorkers=4 src/tests/hooks/useUrlState.test.ts src/tests/components/ShareButton.test.tsx`
- `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/hooks/useUrlState.test.ts src/tests/components/ShareButton.test.tsx src/tests/lib/url/state-serializer.test.ts`
- `npx eslint src/components/controls/ShareButton.tsx src/hooks/useUrlState.ts src/stores/utils/presetSerialization.ts src/tests/components/ShareButton.test.tsx src/tests/hooks/useUrlState.test.ts src/tests/stores/presetManagerStore.test.ts`

## Deferred for Developer
- None.
