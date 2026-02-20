# TDSE Runtime + Preset Coverage Fixes (2026-02-21)

## Iteration 3
- Replaced `scripts/playwright/free-scalar-capture.spec.ts` diagnostic dump script with assertion-based compute runtime tests.
- New coverage includes:
  - Free scalar baseline runtime sanity (WebGPU preferred, critical console/pageerror gating).
  - TDSE scenarios: tunneling, scattering, driven.
  - Non-black and stability checks via canvas-center luma sampling using `sharp`.
- Verification command: `npx playwright test scripts/playwright/free-scalar-capture.spec.ts`
  - Result in current environment: tests executed but skipped because WebGPU runtime/canvas unavailable.

## Iteration 4
- Added TDSE-focused preset serialization regression tests in `src/tests/stores/utils/presetSerialization.test.ts`.
- New assertions verify:
  - `sanitizeExtendedLoadedState` preserves `quantumMode: 'tdseDynamics'` while stripping nested `tdse.needsReset`.
  - `serializeExtendedState` preserves TDSE nested config fields while excluding `tdse.needsReset`.
- Verification command: `npx vitest run src/tests/stores/utils/presetSerialization.test.ts` (passed).