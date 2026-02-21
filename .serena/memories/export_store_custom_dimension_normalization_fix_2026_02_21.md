Issue: exportStore.updateSettings allowed non-integer and extremely large customWidth/customHeight values.

Root cause:
- updateSettings only validated custom dimensions as finite positive numbers; no integer normalization or upper bound.

Fix:
- In src/stores/exportStore.ts updateSettings:
  - normalize customWidth/customHeight with Math.round
  - clamp each dimension to [2, 8192]
  - applied after finite-positive validation step

Test added:
- src/tests/stores/exportStore.test.ts
  - normalizes custom dimensions to safe integer bounds

Verification:
- Fail-first confirmed before fix.
- Targeted custom-dimension test passes after fix.
- Related export regression suite (exportStore + video + planning) passes.
- ESLint passes for touched files.