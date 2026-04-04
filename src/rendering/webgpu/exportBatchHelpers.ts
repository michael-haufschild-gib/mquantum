/**
 * Module-scope helpers for the video export pipeline.
 *
 * Extracted from useExportRuntime to reduce file size and cognitive complexity.
 * These are pure functions (no React hooks) that operate on the export runtime state.
 *
 * @module rendering/webgpu/exportBatchHelpers
 */

import type { ExportSettings } from '@/stores/exportStore'
import { useExportStore } from '@/stores/exportStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useRotationStore } from '@/stores/rotationStore'

import {
  createExportRecorder,
  type ExportLoopState,
  type ExportRecorder,
  type ExportRuntimeState,
  type RuntimeExportMode,
  triggerSegmentDownload,
  type UseExportRuntimeParams,
} from './sceneExportRuntime'

// ============================================================================
// Recorder lifecycle
// ============================================================================

/**
 * Safely cancel and dispose an export recorder.
 * @param recorder - The recorder to tear down (may be null)
 * @returns null — always clears the reference
 */
export async function teardownRecorder(recorder: ExportRecorder | null): Promise<null> {
  if (!recorder) {
    return null
  }
  try {
    await recorder.cancel()
  } catch {
    recorder.dispose()
  }
  return null
}

// ============================================================================
// Completion
// ============================================================================

/**
 * Apply mode-specific completion state to the export store.
 * @param mode - Resolved export mode
 * @param blob - Finalized video blob (may be null for stream mode)
 * @param loop - Current loop state (for segment count)
 * @param settings - Export settings (for format)
 */
export function applyCompletionByMode(
  mode: RuntimeExportMode,
  blob: Blob | null,
  loop: ExportLoopState,
  settings: ExportSettings
): void {
  const exportStore = useExportStore.getState()
  exportStore.setProgress(1)

  if (mode === 'in-memory') {
    if (!blob) {
      throw new Error('No video output was produced for in-memory export')
    }
    exportStore.setPreviewUrl(URL.createObjectURL(blob))
    exportStore.setCompletionDetails({ type: 'in-memory' })
  } else if (mode === 'stream') {
    exportStore.setCompletionDetails({ type: 'stream' })
  } else {
    if (blob) {
      triggerSegmentDownload(blob, loop.currentSegment, settings.format)
    }
    exportStore.setCompletionDetails({
      type: 'segmented',
      segmentCount: loop.currentSegment,
    })
  }
  exportStore.setStatus('completed')
}

// ============================================================================
// File picker
// ============================================================================

/** File picker format descriptor, keyed by export format. */
const FORMAT_DESCRIPTORS: Record<string, { extension: string; description: string; mime: string }> =
  {
    webm: { extension: '.webm', description: 'WebM Video', mime: 'video/webm' },
    mp4: { extension: '.mp4', description: 'MP4 Video', mime: 'video/mp4' },
  }

/**
 * Show the system file picker for stream export mode.
 * @param format - Video format (webm or mp4)
 * @returns File handle, or undefined if user cancelled
 * @throws If the File System Access API is unavailable or picker fails
 */
export async function acquireStreamHandle(
  format: ExportSettings['format']
): Promise<FileSystemFileHandle | undefined> {
  if (!('showSaveFilePicker' in window)) {
    throw new Error(
      'File System Access API is not supported in this browser. Use Chrome/Edge or select another export mode.'
    )
  }

  // mp4 always exists — non-null assertion is safe for the fallback
  const descriptor = (FORMAT_DESCRIPTORS[format] ?? FORMAT_DESCRIPTORS['mp4'])!
  try {
    return await window.showSaveFilePicker({
      suggestedName: `mquantum-${Date.now()}${descriptor.extension}`,
      types: [
        {
          description: descriptor.description,
          accept: { [descriptor.mime]: [descriptor.extension] },
        },
      ],
    })
  } catch (pickerError) {
    const err = pickerError as { name?: string }
    if (err?.name === 'AbortError') {
      return undefined
    }
    throw pickerError
  }
}

// ============================================================================
// Canvas / environment setup
// ============================================================================

/**
 * Snapshot current canvas/camera/perf state and lock perf to export quality.
 */
export function captureExportEnvironment(
  runtime: ExportRuntimeState,
  canvas: HTMLCanvasElement,
  cameraRef: UseExportRuntimeParams['cameraRef'],
  size: { width: number; height: number }
): void {
  const perfStore = usePerformanceStore.getState()
  runtime.originalCanvasWidth = canvas.width
  runtime.originalCanvasHeight = canvas.height
  runtime.originalCameraAspect =
    cameraRef.current?.getState().aspect ||
    (size.width > 0 && size.height > 0 ? size.width / size.height : 1)
  runtime.originalPerf = {
    progressiveRefinementEnabled: perfStore.progressiveRefinementEnabled,
    renderResolutionScale: perfStore.renderResolutionScale,
  }

  perfStore.setProgressiveRefinementEnabled(false)
  perfStore.setRefinementStage('final')
  perfStore.setRenderResolutionScale(1)
}

// ============================================================================
// Phase transitions
// ============================================================================

/**
 * Transition from warmup to the next phase.
 */
export async function transitionFromWarmup(
  loop: ExportLoopState,
  runtime: ExportRuntimeState,
  settings: ExportSettings,
  canvas: HTMLCanvasElement,
  mode: RuntimeExportMode
): Promise<void> {
  if (mode !== 'stream') {
    loop.phase = 'recording'
    loop.frameId = 0
    return
  }

  runtime.rotationSnapshot = new Map(useRotationStore.getState().rotations)
  const previewDuration = Math.min(3, settings.duration)
  loop.phase = 'preview'
  loop.frameId = 0
  loop.totalFrames = Math.max(1, Math.ceil(previewDuration * settings.fps))

  const previewRecorder = await createExportRecorder(
    canvas,
    settings,
    runtime.exportWidth,
    runtime.exportHeight,
    previewDuration
  )
  await previewRecorder.initialize()
  runtime.recorder = previewRecorder
  useExportStore.getState().setStatus('previewing')
}

/**
 * Finalize the preview phase and transition to recording.
 */
export async function finalizePreviewAndStartRecording(
  loop: ExportLoopState,
  runtime: ExportRuntimeState,
  settings: ExportSettings,
  canvas: HTMLCanvasElement
): Promise<void> {
  if (runtime.recorder) {
    const previewBlob = await runtime.recorder.finalize()
    if (previewBlob) {
      useExportStore.getState().setPreviewUrl(URL.createObjectURL(previewBlob))
    }
    runtime.recorder.dispose()
    runtime.recorder = null
  }

  loop.phase = 'recording'
  loop.frameId = 0
  loop.totalFrames = Math.max(1, Math.ceil(settings.duration * settings.fps))
  loop.startTime = performance.now()
  loop.exportStartTime = Date.now()
  loop.lastEtaUpdate = 0

  if (runtime.rotationSnapshot) {
    useRotationStore.getState().updateRotations(runtime.rotationSnapshot)
  }

  const { VideoRecorder } = await import('@/lib/export/video')
  const mainRecorder = new VideoRecorder(canvas, {
    width: runtime.exportWidth,
    height: runtime.exportHeight,
    fps: settings.fps,
    duration: settings.duration,
    totalDuration: settings.duration,
    bitrate: settings.bitrate,
    format: settings.format,
    codec: settings.codec,
    streamHandle: loop.mainStreamHandle,
    onProgress: (progress) => useExportStore.getState().setProgress(progress),
    hardwareAcceleration: settings.hardwareAcceleration,
    bitrateMode: settings.bitrateMode,
    textOverlay: settings.textOverlay,
    crop: settings.crop,
    rotation: settings.rotation,
  })
  await mainRecorder.initialize()
  runtime.recorder = mainRecorder
  useExportStore.getState().setStatus('rendering')
}

/**
 * Handle segment boundary in segmented recording mode.
 * Finalizes current segment, downloads it, creates the next recorder.
 */
export async function rolloverSegment(
  loop: ExportLoopState,
  runtime: ExportRuntimeState,
  settings: ExportSettings,
  canvas: HTMLCanvasElement
): Promise<void> {
  if (runtime.recorder) {
    const segmentBlob = await runtime.recorder.finalize()
    if (segmentBlob) {
      triggerSegmentDownload(segmentBlob, loop.currentSegment, settings.format)
    }
    runtime.recorder.dispose()
    runtime.recorder = null
  }

  loop.currentSegment += 1
  loop.framesInCurrentSegment = 0
  loop.segmentStartTimeVideo = loop.frameId * loop.frameDuration

  const remainingFrames = loop.totalFrames - loop.frameId
  const nextSegmentFrames = Math.min(loop.segmentDurationFrames, remainingFrames)

  const nextRecorder = await createExportRecorder(
    canvas,
    settings,
    runtime.exportWidth,
    runtime.exportHeight,
    nextSegmentFrames / settings.fps
  )
  await nextRecorder.initialize()
  runtime.recorder = nextRecorder
}

// ============================================================================
// ETA
// ============================================================================

/**
 * Update ETA and progress in the export store (throttled to 500ms).
 */
export function updateExportEta(loop: ExportLoopState): void {
  const nowMs = Date.now()
  if (nowMs - loop.lastEtaUpdate <= 500) {
    return
  }

  const exportStore = useExportStore.getState()
  const progress = loop.totalFrames > 0 ? loop.frameId / loop.totalFrames : 0
  exportStore.setProgress(progress)

  if (loop.frameId > 0) {
    const elapsedMs = nowMs - loop.exportStartTime
    const msPerFrame = elapsedMs / loop.frameId
    const remainingMs = (loop.totalFrames - loop.frameId) * msPerFrame
    exportStore.setEta(`${Math.ceil(remainingMs / 1000)}s`)
  }
  loop.lastEtaUpdate = nowMs
}

// ============================================================================
// Batch phase processors
// ============================================================================

/** Context needed by all batch phase processors. */
export interface BatchContext {
  runtime: ExportRuntimeState
  settings: ExportSettings
  mode: RuntimeExportMode
  canvas: HTMLCanvasElement
  advanceSceneStateByDelta: (dt: number) => void
  executeSceneFrame: (dt: number) => void
  shouldYield: () => boolean
  finishExport: () => Promise<void>
}

/**
 * Process warmup frames until done or yield.
 * @returns 'yield' to return to event loop, 'abort' if finishing, 'done' when warmup complete
 */
export async function processWarmupPhase(ctx: BatchContext): Promise<'yield' | 'abort' | 'done'> {
  const { runtime, settings, mode, canvas } = ctx
  const loop = runtime.loop

  while (loop.phase === 'warmup') {
    if (runtime.abortRequested) {
      await ctx.finishExport()
      return 'abort'
    }
    if (loop.warmupFrame >= settings.warmupFrames) {
      await transitionFromWarmup(loop, runtime, settings, canvas, mode)
      continue
    }

    ctx.advanceSceneStateByDelta(loop.frameDuration)
    ctx.executeSceneFrame(loop.frameDuration)
    loop.warmupFrame++

    if (ctx.shouldYield()) {
      return 'yield'
    }
  }
  return 'done'
}

/**
 * Process preview frames until done or yield.
 * @returns 'yield' to return to event loop, 'abort' if finishing, 'done' when preview complete
 */
export async function processPreviewPhase(ctx: BatchContext): Promise<'yield' | 'abort' | 'done'> {
  const { runtime, settings, canvas } = ctx
  const loop = runtime.loop

  while (loop.phase === 'preview') {
    if (runtime.abortRequested) {
      await ctx.finishExport()
      return 'abort'
    }
    if (loop.frameId >= loop.totalFrames) {
      await finalizePreviewAndStartRecording(loop, runtime, settings, canvas)
      continue
    }

    ctx.advanceSceneStateByDelta(loop.frameDuration)
    ctx.executeSceneFrame(loop.frameDuration)

    if (runtime.recorder) {
      await runtime.recorder.captureFrame(loop.frameId * loop.frameDuration, loop.frameDuration)
    }
    loop.frameId++

    if (ctx.shouldYield()) {
      return 'yield'
    }
  }
  return 'done'
}

/**
 * Process recording frames until done or yield.
 * @returns 'yield' to return to event loop, 'abort' if finishing, 'done' when recording complete
 */
export async function processRecordingPhase(
  ctx: BatchContext
): Promise<'yield' | 'abort' | 'done'> {
  const { runtime, settings, mode, canvas } = ctx
  const loop = runtime.loop

  while (loop.phase === 'recording' && loop.frameId < loop.totalFrames) {
    if (runtime.abortRequested) {
      await ctx.finishExport()
      return 'abort'
    }

    if (mode === 'segmented' && loop.framesInCurrentSegment >= loop.segmentDurationFrames) {
      await rolloverSegment(loop, runtime, settings, canvas)
    }

    ctx.advanceSceneStateByDelta(loop.frameDuration)
    ctx.executeSceneFrame(loop.frameDuration)

    const globalVideoTime = loop.frameId * loop.frameDuration
    const relativeVideoTime = globalVideoTime - loop.segmentStartTimeVideo

    if (runtime.recorder) {
      await runtime.recorder.captureFrame(relativeVideoTime, loop.frameDuration, globalVideoTime)
    }

    loop.frameId++
    loop.framesInCurrentSegment++

    if (ctx.shouldYield()) {
      break
    }
  }

  if (loop.phase !== 'recording') {
    return 'done'
  }

  updateExportEta(loop)
  if (loop.frameId >= loop.totalFrames) {
    await ctx.finishExport()
    return 'abort'
  }
  return 'done'
}
