Context: `ExportPresetCard` UI primitive introduced during ExportPresets compliance refactor.

Issue:
- Control rendered as `<button>` without explicit `type`.
- In HTML this defaults to `submit`, causing accidental ancestor form submissions when reused inside forms.

Fail-first evidence:
- Added `src/tests/components/ui/ExportPresetCard.test.tsx` with `does not submit an ancestor form when clicked`.
- Before fix, test failed because submit event fired once.

Fix:
- Updated `src/components/ui/ExportPresetCard.tsx` to set `type="button"`.

Verification:
- Targeted vitest run (ExportPresetCard + ExportPresets + ExportModal) passed.
- Eslint on touched files passed.
- Broader export regression suite (8 files, 151 tests) passed.

Impact:
- Preset card now has safe button semantics in any container; clicking only triggers preset selection logic.