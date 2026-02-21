Issue: exportStore.updateSettings accepted invalid textOverlay patch values without sanitization.

Root cause:
- textOverlay patch was deep-merged directly into persisted settings.
- Non-finite numeric values, out-of-range values, invalid enum placements, and wrong primitive types could leak into state.

Fix:
- Added textOverlay sanitization path in src/stores/exportStore.ts updateSettings:
  - finite-check numeric fields
  - clamp ranges:
    - fontWeight [100,900] (rounded)
    - opacity [0,1]
    - fontSize >= 1
    - padding >= 0
    - shadowBlur >= 0
  - keep letterSpacing if finite
  - reject invalid enabled type
  - reject invalid string fields (text/fontFamily/color/shadowColor)
  - reject invalid placement enums (vertical/horizontal)

Test added:
- src/tests/stores/exportStore.test.ts
  - sanitizes textOverlay patch values to maintain runtime-safe ranges

Verification:
- Fail-first confirmed before fix.
- Targeted textOverlay sanitization test passes.
- Related export regression suite (exportStore + video + planning) passes.
- ESLint passes for touched files.