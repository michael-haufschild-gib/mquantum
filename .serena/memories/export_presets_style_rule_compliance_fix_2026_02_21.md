Context: Export preset cards in `src/components/overlays/export/ExportPresets.tsx` had project-rule violations (`no-direct-asset-imports`, `no-raw-html-controls`).

Root cause:
- Overlay layer directly imported icon assets.
- Overlay layer rendered raw `<button>` card component.

Fix:
- Added compliant UI primitive `src/components/ui/ExportPresetCard.tsx`.
- Moved preset icon mapping + asset imports + button rendering into UI primitive.
- Updated `ExportPresets` to use `ExportPresetCard` and keep active preset derivation.
- Tightened preset ID typing via `ExportPresetCardId` in matcher/select paths.

Verification:
- `npx vitest run --maxWorkers=4 src/tests/components/overlays/export/ExportPresets.test.tsx src/tests/components/overlays/ExportModal.test.tsx` passed.
- `npx eslint src/components/overlays/export/ExportPresets.tsx src/components/ui/ExportPresetCard.tsx src/tests/components/overlays/export/ExportPresets.test.tsx` passed.
- Broader export regression suite (7 files, 150 tests) passed after refactor.

Impact:
- Preserves preset behavior and active-state feedback while restoring architecture/lint compliance for this feature slice.