# Scene animation payload normalization (2026-02-21)

## Problem
`presetManagerStore.loadScene` directly hydrated animation state via `useAnimationStore.setState(animState)`. This bypassed action-level invariants and allowed invalid-but-finite values in imported scenes, such as:
- `speed: -100`
- `direction: 0`
- `isPlaying: 'yes'`

## Fix
In `src/stores/presetManagerStore.ts`:
- Imported `MIN_SPEED` and `MAX_SPEED` from `animationStore`.
- Added `normalizeAnimationLoadData(rawAnimation)`.
- Applied normalization before direct animation hydration:
  - Clamp finite speed to `[MIN_SPEED, MAX_SPEED]`, drop otherwise.
  - Keep direction only if `1` or `-1`.
  - Keep `isPlaying` only if boolean.
  - Keep `accumulatedTime` only if finite number.
  - Keep `animatingPlanes` only as string array, then convert to `Set` (existing flow).

## Test
Added in `src/tests/stores/presetManagerStore.test.ts`:
- `normalizes imported animation payload fields to store invariants`

## Verification
- Fail-first targeted test failed pre-fix (`speed` remained `-100`).
- Post-fix targeted test passed.
- Related suites passed, including:
  - `presetManagerStore.test.ts`
  - `animationStore.test.ts`
  - `environmentStore.test.ts`
  - `presetSerialization.test.ts`
  - `CubemapCapturePass.test.ts`
- ESLint passed for touched files.
