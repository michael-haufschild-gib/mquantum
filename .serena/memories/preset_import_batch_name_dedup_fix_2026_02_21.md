Issue: duplicate style/scene names inside the same import batch were not deduplicated.

Root cause:
- importStyles/importScenes compared incoming names only against names already stored before import.
- names assigned earlier within the same imported array were not tracked, so collisions in batch remained.

Fix:
- Added makeUniqueImportedName(baseName, usedNames) in src/stores/presetManagerStore.ts.
- importStyles/importScenes now maintain a mutable Set of used names and generate unique names per entry.
- Supports incremental suffixing: (imported), (imported 2), ...
- raw import names are normalized to string before dedupe.

Tests:
- Added to src/tests/stores/presetManagerStore.test.ts:
  - deduplicates duplicate style names within the same import batch
  - deduplicates duplicate scene names within the same import batch
- Fail-first confirmed before fix; pass after fix.

Verification:
- Targeted duplicate-handling suite passed.
- 14-file related store/preset regression sweep passed.
- ESLint passed for touched files.