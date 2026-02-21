Issue: importing legacy style/scene payloads without explicit pbr data produced stale runtime PBR values after load.

Root cause:
- sanitizeStyleData/sanitizeSceneData materialize missing pbr as {}.
- loadStyle/loadScene treated truthy pbr objects as present and called normalizePbrLoadData({}), which yielded no updates.
- Existing PBR state therefore persisted instead of resetting.

Fix:
- In src/stores/presetManagerStore.ts loadStyle/loadScene:
  - sanitize pbr payload to stylePbrData/scenePbrData
  - if Object.keys(...) > 0, apply normalizePbrLoadData payload
  - else call usePBRStore.getState().resetPBR()

Tests:
- Added in src/tests/stores/presetManagerStore.test.ts:
  - resets PBR to defaults when loading imported style without pbr payload
  - resets PBR to defaults when loading imported scene without pbr payload
- Fail-first confirmed before fix, passing after fix.

Verification:
- Targeted pass for new tests
- 14-file related regression sweep passed
- ESLint passed for touched files.