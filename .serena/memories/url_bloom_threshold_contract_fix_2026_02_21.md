CI-explore patrol target `src/lib/url` completed on 2026-02-21.

Finding fixed:
- In `src/lib/url/state-serializer.ts`, `deserializeState` accepted bloom threshold (`bt`) in range [-1, 20], while runtime contract elsewhere is 0..5 (`postProcessingSlice` clamp, `BloomControls` slider, `BloomPass` clamp, defaults comments).
- Impact was invalid URLs being parsed and then coerced to extremes via downstream clamps.

Fix:
- Updated `deserializeState` validation for `bt` to `parsed >= 0 && parsed <= 5`.

Regression test added:
- `src/tests/lib/url/state-serializer.test.ts`
- Test: `should reject bloom threshold outside the 0..5 contract` (rejects `bt=-0.5` and `bt=5.1`).

Verification:
- `npx vitest run src/tests/lib/url/state-serializer.test.ts`
- `npx vitest run src/tests/lib/url/state-serializer.test.ts src/tests/hooks/useUrlState.test.ts src/tests/components/ShareButton.test.tsx`
- `npx eslint src/lib/url/state-serializer.ts src/tests/lib/url/state-serializer.test.ts`
All passed.