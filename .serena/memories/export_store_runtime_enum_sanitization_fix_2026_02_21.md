Root cause: exportStore.updateSettings merged runtime-invalid union values for format/codec/resolution/bitrateMode/hardwareAcceleration/rotation, despite TS types.
Fix: added explicit runtime guards in src/stores/exportStore.ts updateSettings to drop invalid enum values and keep current settings unchanged.
Fail-first test: src/tests/stores/exportStore.test.ts -> 'rejects invalid runtime enum patches and preserves existing values' failed before fix (format became 'avi'), passes after fix.
Verification: targeted test and full export suite pass; eslint on touched files passes.