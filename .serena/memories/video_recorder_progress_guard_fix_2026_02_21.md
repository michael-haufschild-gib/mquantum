Issue: VideoRecorder progress callback could receive invalid values.

Root cause:
- captureFrame computed progress with Math.min(timestamp / totalDuration, 0.99) only.
- Negative timestamp produced negative progress.
- Non-finite/invalid duration could produce non-finite progress.

Fix:
- src/lib/export/video.ts captureFrame progress block now:
  - validates duration (finite and > 0)
  - if invalid duration, reports 0
  - otherwise clamps finite progress to [0, 0.99]
  - non-finite computed progress falls back to 0

Tests added:
- src/tests/lib/export/video.test.ts
  - should clamp progress to a minimum of 0 for negative timestamps
  - should report finite progress when total duration is non-finite

Verification:
- Fail-first confirmed via progress-focused test run.
- Post-fix targeted progress tests pass.
- Related export regression suite (video.test.ts, videoExportPlanning.test.ts, exportStore.test.ts) passes.
- ESLint passes for touched export files.