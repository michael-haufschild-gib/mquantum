# WebGPU video export runtime integration (2026-02-08)

Implemented export orchestration directly in `src/rendering/webgpu/WebGPUScene.tsx` using a runtime state machine (warmup -> preview (stream-only) -> recording), replacing missing controller behavior from legacy WebGL.

## Key behaviors
- Trigger: starts when `useExportStore.isExporting` is true and status is `idle`.
- Modes: resolves `auto` to `in-memory` (<100MB) or `stream`/`segmented` depending on browser capability.
- Deterministic stepping: export frames advance scene state with fixed `1/fps` delta and capture through `VideoRecorder`.
- Crop parity: computes render dimensions using `computeRenderDimensions` while preserving original camera aspect when crop is enabled.
- Stream mode: opens file picker first, records short preview, restores post-warmup rotations, then records main stream.
- Segmented mode: finalizes and auto-downloads segments at computed frame boundaries.
- Cleanup: restores canvas size, graph size, camera aspect, and performance settings on complete/cancel/error.

## Related files
- Runtime logic: `src/rendering/webgpu/WebGPUScene.tsx`
- Dimension/segmentation helpers: `src/lib/export/videoExportPlanning.ts`
- UI effective mode fix: `src/components/overlays/ExportModal.tsx`
- Tests: `src/tests/lib/export/videoExportPlanning.test.ts`, `src/tests/components/overlays/ExportModal.test.tsx`

## Verification run
- `npx vitest run src/tests/components/overlays/ExportModal.test.tsx src/tests/lib/export/videoExportPlanning.test.ts src/tests/lib/export/video.test.ts src/tests/rendering/webgpu/WebGPUScene.performanceMetrics.test.ts` passed.
