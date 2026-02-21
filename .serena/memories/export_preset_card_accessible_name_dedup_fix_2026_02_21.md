Context: Export preset UI primitive had duplicated screen-reader naming.

Issue:
- `ExportPresetCard` icon used `alt={label}` while button already contained label text.
- Computed accessible name duplicated label token (e.g., `Instagram Instagram ...`).

Fail-first evidence:
- Added test `does not duplicate the preset label in the button accessible name` in `src/tests/components/ui/ExportPresetCard.test.tsx`.
- Before fix, test failed with duplicated accessible name.

Fix:
- Updated `src/components/ui/ExportPresetCard.tsx` icon semantics to decorative: `alt=""` and `aria-hidden="true"`.

Verification:
- Targeted UI tests (ExportPresetCard + ExportPresets + ExportModal) passed.
- Eslint on touched files passed.
- Broader export suite (8 files, 152 tests) passed.

Impact:
- Preset card buttons now have cleaner accessible names without redundant icon-label duplication.