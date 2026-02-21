Issue: exportStore.updateSettings accepted non-finite crop patch values, allowing NaN/Infinity to pollute crop state.

Root cause:
- updateSettings deep-merged crop patches with no validation for x/y/width/height or enabled type.

Fix:
- In src/stores/exportStore.ts updateSettings:
  - sanitize crop patch when present
  - ignore non-finite numeric updates for x/y/width/height
  - clamp finite crop numeric values to [0,1]
  - ignore non-boolean crop.enabled values

Test added:
- src/tests/stores/exportStore.test.ts
  - ignores non-finite crop patch values while clamping finite ranges

Verification:
- Fail-first confirmed before fix.
- Targeted crop-patch test passes after fix.
- Related export regression suite (exportStore + video + planning) passes.
- ESLint passes for touched files.