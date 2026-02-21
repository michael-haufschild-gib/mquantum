Issue: unknown imported keys under scene.data.extended.schroedinger leaked into runtime store state during loadScene.

Root cause:
- presetManager loadScene uses mergeExtendedObjectStateForType(sanitizeExtendedLoadedState(...), objectType).
- mergeWithDefaults.deepMerge merged all loaded keys, including keys not present in defaults, so unknown keys propagated into schroedinger config.

Fix:
- Updated src/stores/utils/mergeWithDefaults.ts deepMerge to merge only keys that exist on defaults (Object.prototype.hasOwnProperty.call(defaults, key)); applies recursively.
- Added regression tests:
  - src/tests/stores/presetManagerStore.test.ts: drops unknown imported scene extended schroedinger fields on load
  - src/tests/stores/utils/mergeWithDefaults.test.ts: drops unknown loaded keys that are not part of defaults

Verification:
- Fail-first repro: new presetManager regression failed before fix (mysteryExtended leaked).
- Post-fix targeted passes and broader 13-file store/preset sweep passes.
- ESLint pass on touched files.