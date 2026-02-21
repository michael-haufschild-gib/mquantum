Issue: video export planning helpers produced invalid outputs for non-finite inputs.

Root cause:
- computeRenderDimensions used maxTextureDimension2D directly; NaN produced NaN safeLimit and bypassed clamp.
- computeSegmentDurationFrames used raw duration/fps/bitrate/segment params; non-finite values propagated to NaN frame counts.

Fix:
- src/lib/export/videoExportPlanning.ts
  - computeRenderDimensions now sanitizes maxTextureDimension2D (finite + >0 else fallback 8192).
  - computeSegmentDurationFrames now sanitizes durationSeconds/fps/bitrateMbps/targetSegmentMB/minSegmentSeconds and guarantees finite output with minimum 1 frame.

Tests added:
- src/tests/lib/export/videoExportPlanning.test.ts
  - falls back to internal 8192 clamp when max texture limit is non-finite
  - returns a finite minimum frame count for non-finite timing inputs

Verification:
- Fail-first confirmed before fix on full planning test file.
- Post-fix: planning test file passes.
- Related export regression passes (videoExportPlanning.test.ts, video.test.ts, exportStore.test.ts).
- ESLint passes on touched files.