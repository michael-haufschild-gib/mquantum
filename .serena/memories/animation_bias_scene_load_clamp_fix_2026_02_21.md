CI-explore iteration (2026-02-21) for animation bias flow (`src/lib/animation` + consumers) found and fixed a high-priority invariant bypass.

Issue:
- `uiSlice.setAnimationBias` clamps to `[0,1]`, but `presetManagerStore.loadScene` directly called `useUIStore.setState(sanitizeLoadedState(scene.data.ui))`, bypassing that action.
- `importScenes` validates structure but not numeric ranges, so imported scene JSON with `ui.animationBias` out-of-range could enter runtime.

Fix:
- In `src/stores/presetManagerStore.ts` loadScene path:
  - Sanitize UI data as before.
  - Normalize `animationBias` if present:
    - finite number -> clamp to `[0,1]`
    - non-finite / non-number -> remove field.
  - Then apply `useUIStore.setState(uiData)`.

Regression test:
- Added in `src/tests/stores/presetManagerStore.test.ts`:
  - `clamps imported scene animationBias to the UI contract [0, 1] on load`

Verification:
- Red: `npx vitest run src/tests/stores/presetManagerStore.test.ts -t "clamps imported scene animationBias to the UI contract [0, 1] on load"`
  - failed before fix (`expected 1, received 42`).
- Green:
  - same targeted test passes.
  - `npx vitest run src/tests/stores/presetManagerStore.test.ts src/tests/lib/animation/biasCalculation.test.ts src/tests/components/layout/editor/TimelineControls.test.tsx` passes.

Note:
- `npx eslint src/stores/presetManagerStore.ts ...` reports existing pre-existing JSDoc rule violations in `presetManagerStore.ts` unrelated to this patch.