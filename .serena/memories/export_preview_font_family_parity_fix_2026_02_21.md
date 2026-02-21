Root cause: ExportPreview hardcoded Inter font while VideoRecorder used textOverlay.fontFamily, causing preview/export typography mismatch for non-default fonts.
Fix: in src/components/overlays/export/ExportPreview.tsx, use textOverlay.fontFamily (fallback Inter) when styling preview text.
Fail-first test: src/tests/components/overlays/export/ExportPreview.test.tsx -> 'uses textOverlay.fontFamily when rendering preview text' failed before fix, passes after.
Verification: overlay+export suite passes (150 tests); eslint passes for touched preview files.