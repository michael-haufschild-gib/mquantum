Issue: getRecommendedBitrate could return NaN for runtime-invalid inputs.

Root cause:
- Function assumed valid ExportResolution enum key and finite fps.
- fps=NaN or unknown resolution string produced non-finite intermediate values and NaN output.

Fix:
- In src/stores/exportStore.ts getRecommendedBitrate:
  - sanitize fps (finite + >0 else 30)
  - guard resolution key; fallback to '1080p' when unknown
  - only apply custom-resolution scaling for finite positive customWidth/customHeight
  - if computed bitrate is non-finite, return 12 fallback
  - keep final clamp [4, 100]

Tests:
- Added in src/tests/stores/exportStore.test.ts:
  - returns finite bitrate for non-finite fps input
  - falls back to a safe base bitrate for unknown runtime resolution values
- Fail-first confirmed before fix, pass after fix.

Verification:
- Targeted getRecommendedBitrate suite passes.
- Related export regression (exportStore + video + planning) passes.
- ESLint passes for touched export files.