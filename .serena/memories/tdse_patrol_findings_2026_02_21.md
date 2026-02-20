# TDSE Patrol Findings (2026-02-21)

## Confirmed defects fixed
1. TDSE fieldView was a no-op in write-grid output path.
   - Fixed by branching in `tdseWriteGrid.wgsl.ts` on `params.fieldView` and wiring potential buffer into write-grid bind group in `TDSEComputePass.ts`.
2. TDSE lattice dim UI capped at 6 despite TDSE/store support up to 11.
   - Fixed in `TDSEControls.tsx` to cap at `min(dimension, 11)`.
3. TDSE UI omitted supported parameters (`hbar`, diagnostics interval).
   - Added controls in `TDSEControls.tsx`.
4. UI range mismatches corrected:
   - absorber width UI now aligns with store clamp [0.05, 0.3]
   - steps/frame UI now aligns with store clamp max 16

## Regression coverage added
- `src/tests/rendering/webgpu/shaders/tdse.test.ts` now asserts:
  - potential buffer binding in write-grid shader
  - fieldView branch presence

## Verification
- `npx vitest run src/tests/rendering/webgpu/shaders/tdse.test.ts src/tests/stores/extendedObjectStore.tdse.test.ts src/tests/lib/physics/tdse/diagnostics.test.ts` passed.
- Full `npm run lint` remains red due broad pre-existing baseline unrelated to TDSE patch.
