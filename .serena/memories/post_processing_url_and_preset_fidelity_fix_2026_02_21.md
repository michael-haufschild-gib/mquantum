# Post-processing URL + Preset Fidelity Fix (2026-02-21)

## Scope
- URL share/hydration paths for post-processing and lighting state.
- Preset/default sanitization for removed post-processing fields.

## Defects
1. Shared URL used `appearance.backgroundColor`, but render output uses `environment.backgroundColor`; hydration only wrote background to appearance.
2. Serializer supported `tm/ta/ex/sc` but share/hydration path was partial:
   - ShareButton omitted these fields.
   - useUrlState did not apply `toneMappingAlgorithm` (`ta`) or `specularColor` (`sc`).
3. Legacy default/import payloads still contained removed post-processing fields (`objectOnlyDepth`, `gravity*`) and sanitizer did not remove them.

## Fixes
- `src/components/controls/ShareButton.tsx`
  - Serialize background from `useEnvironmentStore`.
  - Include `toneMappingEnabled`, `toneMappingAlgorithm`, `exposure`, `specularColor` in shared URL payload.
- `src/hooks/useUrlState.ts`
  - Apply URL `backgroundColor` to `useEnvironmentStore` (and keep `useAppearanceStore` background synchronized).
  - Apply `toneMappingAlgorithm` to lighting store.
  - Apply `specularColor` to PBR store (`setFaceSpecularColor`).
- `src/stores/utils/presetSerialization.ts`
  - Added legacy `objectOnlyDepth` + `gravity*` keys to `TRANSIENT_FIELDS` for strip-on-save/import/load behavior.

## Tests Added/Updated
- `src/tests/hooks/useUrlState.test.ts`
  - Verifies background + tone mapping + specular hydration from parsed URL.
- `src/tests/components/ShareButton.test.tsx`
  - Verifies shared URL includes environment bg, tm/ta/ex, and sc.
- `src/tests/stores/presetManagerStore.test.ts`
  - Verifies style/scene import strips removed gravity/object-depth fields and they are not applied at runtime.

## Verification Commands
- `npx vitest run --maxWorkers=4 src/tests/hooks/useUrlState.test.ts src/tests/components/ShareButton.test.tsx`
- `npx vitest run --maxWorkers=4 src/tests/stores/presetManagerStore.test.ts src/tests/hooks/useUrlState.test.ts src/tests/components/ShareButton.test.tsx src/tests/lib/url/state-serializer.test.ts`
- `npx eslint src/components/controls/ShareButton.tsx src/hooks/useUrlState.ts src/stores/utils/presetSerialization.ts src/tests/components/ShareButton.test.tsx src/tests/hooks/useUrlState.test.ts src/tests/stores/presetManagerStore.test.ts`