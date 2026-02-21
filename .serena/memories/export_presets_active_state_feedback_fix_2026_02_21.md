Root cause: ExportPresets hardcoded isActive={false} for all cards, so no preset selection feedback was ever shown.
Fix: added PRESET_MATCHERS + isPresetActive in src/components/overlays/export/ExportPresets.tsx, derived activePresetId from current export settings, and passed isActive based on match.
Fail-first test: src/tests/components/overlays/export/ExportPresets.test.tsx -> 'shows one active preset indicator for matching current settings' failed before fix (0 indicators), passes after fix.
Verification: export overlay/runtime suite passes (149 tests).
Note: src/components/overlays/export/ExportPresets.tsx has pre-existing project-rule lint violations (asset imports/raw button) not introduced by this fix.