Issue: import validation accepted whitespace-only names while save/rename rejected them, causing inconsistent preset naming invariants.

Root cause:
- importStyles/importScenes validated name via truthiness only.
- '   ' is truthy, so invalid names passed.

Fix:
- Added helper isNonEmptyTrimmedString in src/stores/presetManagerStore.ts.
- importStyles/importScenes validation now requires trimmed non-empty string names.
- import processing now trims names before dedupe/assignment.

Tests:
- Added in src/tests/stores/presetManagerStore.test.ts:
  - should reject style import entries with whitespace-only names
  - should reject scene import entries with whitespace-only names
- Fail-first confirmed before fix, pass after fix.

Verification:
- Targeted whitespace-name tests pass.
- 14-file related store/preset sweep passes.
- ESLint passes on touched files.