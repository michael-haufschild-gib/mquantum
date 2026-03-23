/**
 * Custom hook encapsulating all video export runtime logic for the WebGPU scene.
 *
 * Extracted from WebGPUScene.ts to reduce component size and isolate export
 * state management from the render loop.
 *
 * @module rendering/webgpu/useExportRuntime
 */

import { useCallback } from 'react'

import { VideoRecorder } from '@/lib/export/video'
import {
  computeRenderDimensions,
  computeSegmentDurationFrames,
  ensureEvenDimensions,
  resolveExportDimensions,
} from '@/lib/export/videoExportPlanning'
import { useExportStore } from '@/stores/exportStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useRotationStore } from '@/stores/rotationStore'

import {
  cloneExportSettings,
  createExportRecorder,
  createInitialExportLoopState,
  isExportRuntimeActive,
  resolveRuntimeExportMode,
  triggerSegmentDownload,
  type UseExportRuntimeParams,
  type UseExportRuntimeReturn,
  validateExportSettings,
  waitForPaint,
} from './sceneExportRuntime'

// Re-export interfaces for consumers
export type { UseExportRuntimeParams, UseExportRuntimeReturn } from './sceneExportRuntime'

// ============================================================================
// Hook
// ============================================================================

/**
 * Encapsulates all video export orchestration: start, cancel, finish,
 * segment download, error handling, and per-frame batch processing.
 */
export function useExportRuntime({
  canvas,
  device,
  graph,
  cameraRef,
  size,
  advanceSceneStateByDelta,
  executeSceneFrame,
  exportRuntimeRef,
}: UseExportRuntimeParams): UseExportRuntimeReturn {
  // --------------------------------------------------------------------------
  // resetExportRuntime
  // --------------------------------------------------------------------------
  const resetExportRuntime = useCallback(
    (preserveAbortFlag = false) => {
      const runtime = exportRuntimeRef.current
      const abortRequested = preserveAbortFlag && runtime.abortRequested

      runtime.starting = false
      runtime.started = false
      runtime.processing = false
      runtime.finishing = false
      runtime.canceling = false
      runtime.abortRequested = abortRequested
      runtime.mode = null
      runtime.settings = null
      runtime.recorder = null
      runtime.rotationSnapshot = null
      runtime.originalCanvasWidth = 0
      runtime.originalCanvasHeight = 0
      runtime.originalCameraAspect = 1
      runtime.exportWidth = 0
      runtime.exportHeight = 0
      runtime.renderWidth = 0
      runtime.renderHeight = 0
      runtime.originalPerf = {
        progressiveRefinementEnabled: true,
        renderResolutionScale: 1,
      }
      runtime.loop = createInitialExportLoopState()
    },
    [exportRuntimeRef]
  )

  // --------------------------------------------------------------------------
  // restoreRuntimeState
  // --------------------------------------------------------------------------
  const restoreRuntimeState = useCallback(() => {
    const runtime = exportRuntimeRef.current

    const restoreWidth = runtime.originalCanvasWidth > 0 ? runtime.originalCanvasWidth : size.width
    const restoreHeight =
      runtime.originalCanvasHeight > 0 ? runtime.originalCanvasHeight : size.height

    if (restoreWidth > 0 && restoreHeight > 0) {
      canvas.width = restoreWidth
      canvas.height = restoreHeight
      graph.setSize(restoreWidth, restoreHeight)
    }

    if (cameraRef.current && runtime.originalCameraAspect > 0) {
      cameraRef.current.setAspect(runtime.originalCameraAspect)
    }

    const perfStore = usePerformanceStore.getState()
    perfStore.setProgressiveRefinementEnabled(runtime.originalPerf.progressiveRefinementEnabled)
    perfStore.setRenderResolutionScale(runtime.originalPerf.renderResolutionScale)
    perfStore.setRefinementStage('final')

    runtime.rotationSnapshot = null
  }, [canvas, cameraRef, exportRuntimeRef, graph, size.height, size.width])

  // --------------------------------------------------------------------------
  // handleExportError
  // --------------------------------------------------------------------------
  const handleExportError = useCallback(
    async (error: unknown) => {
      const runtime = exportRuntimeRef.current
      const exportStore = useExportStore.getState()

      if (runtime.recorder) {
        try {
          await runtime.recorder.cancel()
        } catch {
          runtime.recorder.dispose()
        } finally {
          runtime.recorder = null
        }
      }

      restoreRuntimeState()
      resetExportRuntime()

      exportStore.setEta(null)
      exportStore.setError(error instanceof Error ? error.message : 'Video export failed')
      exportStore.setStatus('error')
      exportStore.setIsExporting(false)
    },
    [exportRuntimeRef, resetExportRuntime, restoreRuntimeState]
  )

  // --------------------------------------------------------------------------
  // finishExport
  // --------------------------------------------------------------------------
  const finishExport = useCallback(async () => {
    const runtime = exportRuntimeRef.current
    if (runtime.finishing || runtime.canceling || !runtime.mode || !runtime.settings) {
      return
    }

    runtime.finishing = true
    const exportStore = useExportStore.getState()
    let handledError = false
    let cleanedEarly = false

    try {
      if (runtime.abortRequested) {
        if (runtime.recorder) {
          try {
            await runtime.recorder.cancel()
          } catch {
            runtime.recorder.dispose()
          } finally {
            runtime.recorder = null
          }
        }

        restoreRuntimeState()
        resetExportRuntime()
        cleanedEarly = true

        if (!exportStore.isExporting) {
          exportStore.setStatus('idle')
        }
        return
      }

      exportStore.setStatus('encoding')
      const blob = runtime.recorder ? await runtime.recorder.finalize() : null

      if (runtime.mode === 'in-memory') {
        if (!blob) {
          throw new Error('No video output was produced for in-memory export')
        }
        const url = URL.createObjectURL(blob)
        exportStore.setPreviewUrl(url)
        exportStore.setProgress(1)
        exportStore.setCompletionDetails({ type: 'in-memory' })
        exportStore.setStatus('completed')
      } else if (runtime.mode === 'stream') {
        exportStore.setProgress(1)
        exportStore.setCompletionDetails({ type: 'stream' })
        exportStore.setStatus('completed')
      } else {
        if (blob) {
          triggerSegmentDownload(blob, runtime.loop.currentSegment, runtime.settings.format)
        }
        exportStore.setProgress(1)
        exportStore.setCompletionDetails({
          type: 'segmented',
          segmentCount: runtime.loop.currentSegment,
        })
        exportStore.setStatus('completed')
      }
    } catch (error) {
      handledError = true
      await handleExportError(error)
    } finally {
      if (runtime.recorder) {
        runtime.recorder.dispose()
      }
      runtime.recorder = null

      if (!handledError && !cleanedEarly && !runtime.canceling) {
        restoreRuntimeState()
        resetExportRuntime()
        exportStore.setIsExporting(false)
      }
    }
  }, [exportRuntimeRef, handleExportError, resetExportRuntime, restoreRuntimeState])

  // --------------------------------------------------------------------------
  // cancelExport
  // --------------------------------------------------------------------------
  const cancelExport = useCallback(async () => {
    const runtime = exportRuntimeRef.current
    if (runtime.canceling) {
      return
    }

    runtime.abortRequested = true
    runtime.canceling = true

    const exportStore = useExportStore.getState()
    exportStore.setProgress(0)
    exportStore.setEta(null)

    try {
      if (runtime.recorder) {
        try {
          await runtime.recorder.cancel()
        } catch {
          runtime.recorder.dispose()
        } finally {
          runtime.recorder = null
        }
      }
    } finally {
      restoreRuntimeState()
      resetExportRuntime()
      exportStore.setStatus('idle')
    }
  }, [exportRuntimeRef, resetExportRuntime, restoreRuntimeState])

  // --------------------------------------------------------------------------
  // startExport
  // --------------------------------------------------------------------------
  const startExport = useCallback(async () => {
    const runtime = exportRuntimeRef.current
    if (runtime.starting || runtime.started || runtime.canceling || runtime.finishing) {
      return
    }

    const exportStore = useExportStore.getState()
    if (exportStore.status !== 'idle') {
      return
    }

    runtime.starting = true
    runtime.abortRequested = false

    exportStore.setProgress(0)
    exportStore.setEta(null)
    exportStore.setError(null)
    exportStore.setCompletionDetails(null)

    const settings = cloneExportSettings(exportStore.settings)
    const mode = resolveRuntimeExportMode(
      exportStore.exportModeOverride ?? exportStore.exportMode,
      exportStore.browserType,
      settings
    )
    runtime.mode = mode
    runtime.settings = settings

    let streamHandle: FileSystemFileHandle | undefined

    try {
      if (mode === 'stream') {
        if (!('showSaveFilePicker' in window)) {
          throw new Error(
            'File System Access API is not supported in this browser. Use Chrome/Edge or select another export mode.'
          )
        }

        exportStore.setStatus('rendering')

        try {
          const extension = settings.format === 'webm' ? '.webm' : '.mp4'
          const description = settings.format === 'webm' ? 'WebM Video' : 'MP4 Video'
          const mimeType = settings.format === 'webm' ? 'video/webm' : 'video/mp4'

          streamHandle = await window.showSaveFilePicker({
            suggestedName: `mquantum-${Date.now()}${extension}`,
            types: [
              {
                description,
                accept: { [mimeType]: [extension] },
              },
            ],
          })
        } catch (pickerError) {
          const err = pickerError as { name?: string }
          if (err?.name === 'AbortError') {
            exportStore.setIsExporting(false)
            exportStore.setStatus('idle')
            resetExportRuntime()
            return
          }
          throw pickerError
        }
      } else {
        exportStore.setStatus('rendering')
      }

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

      await waitForPaint()
      if (runtime.abortRequested) {
        restoreRuntimeState()
        resetExportRuntime()
        return
      }

      validateExportSettings(settings)

      const resolved = resolveExportDimensions(
        settings.resolution,
        settings.customWidth,
        settings.customHeight
      )
      const exportDimensions = ensureEvenDimensions(resolved.width, resolved.height)
      const maxTextureDimension2D = device.getCapabilities()?.maxTextureDimension2D ?? 4096
      const renderDimensions = computeRenderDimensions({
        exportWidth: exportDimensions.width,
        exportHeight: exportDimensions.height,
        originalAspect: runtime.originalCameraAspect,
        maxTextureDimension2D,
        crop: settings.crop,
      })

      runtime.exportWidth = exportDimensions.width
      runtime.exportHeight = exportDimensions.height
      runtime.renderWidth = renderDimensions.width
      runtime.renderHeight = renderDimensions.height

      canvas.width = renderDimensions.width
      canvas.height = renderDimensions.height
      graph.setSize(renderDimensions.width, renderDimensions.height)

      if (cameraRef.current) {
        if (settings.crop.enabled) {
          cameraRef.current.setAspect(runtime.originalCameraAspect)
        } else {
          cameraRef.current.setAspect(renderDimensions.width / renderDimensions.height)
        }
      }

      await waitForPaint()
      if (runtime.abortRequested) {
        restoreRuntimeState()
        resetExportRuntime()
        return
      }

      const totalFrames = Math.max(1, Math.ceil(settings.duration * settings.fps))
      const segmentDurationFrames =
        mode === 'segmented'
          ? computeSegmentDurationFrames({
              durationSeconds: settings.duration,
              fps: settings.fps,
              bitrateMbps: settings.bitrate,
            })
          : totalFrames

      runtime.loop = {
        phase: 'warmup',
        frameId: 0,
        warmupFrame: 0,
        startTime: performance.now(),
        totalFrames,
        frameDuration: 1 / settings.fps,
        exportStartTime: Date.now(),
        lastEtaUpdate: 0,
        mainStreamHandle: streamHandle,
        segmentDurationFrames,
        currentSegment: 1,
        framesInCurrentSegment: 0,
        segmentStartTimeVideo: 0,
      }

      if (mode !== 'stream') {
        const firstRecorderDuration =
          mode === 'segmented' ? segmentDurationFrames / settings.fps : settings.duration
        const recorder = createExportRecorder(
          canvas,
          settings,
          runtime.exportWidth,
          runtime.exportHeight,
          firstRecorderDuration
        )
        await recorder.initialize()
        runtime.recorder = recorder
      }

      runtime.started = true
    } catch (error) {
      await handleExportError(error)
    } finally {
      runtime.starting = false
    }
  }, [
    canvas,
    cameraRef,
    device,
    exportRuntimeRef,
    graph,
    handleExportError,
    resetExportRuntime,
    restoreRuntimeState,
    size.height,
    size.width,
  ])

  // --------------------------------------------------------------------------
  // processExportBatch
  // --------------------------------------------------------------------------
  const processExportBatch = useCallback(async () => {
    const runtime = exportRuntimeRef.current
    if (
      !runtime.started ||
      runtime.processing ||
      runtime.finishing ||
      runtime.canceling ||
      !runtime.mode ||
      !runtime.settings
    ) {
      return
    }

    runtime.processing = true

    try {
      const maxBlockingTimeMs = 30
      const batchStartMs = performance.now()
      const shouldYield = () => performance.now() - batchStartMs > maxBlockingTimeMs

      const loop = runtime.loop
      const settings = runtime.settings
      const mode = runtime.mode
      const exportStore = useExportStore.getState()

      while (loop.phase === 'warmup') {
        if (runtime.abortRequested) {
          await finishExport()
          return
        }

        if (loop.warmupFrame >= settings.warmupFrames) {
          if (mode === 'stream') {
            runtime.rotationSnapshot = new Map(useRotationStore.getState().rotations)

            const previewDuration = Math.min(3, settings.duration)
            loop.phase = 'preview'
            loop.frameId = 0
            loop.totalFrames = Math.max(1, Math.ceil(previewDuration * settings.fps))

            const previewRecorder = createExportRecorder(
              canvas,
              settings,
              runtime.exportWidth,
              runtime.exportHeight,
              previewDuration
            )
            await previewRecorder.initialize()
            runtime.recorder = previewRecorder
            exportStore.setStatus('previewing')
          } else {
            loop.phase = 'recording'
            loop.frameId = 0
          }
          continue
        }

        advanceSceneStateByDelta(loop.frameDuration)
        executeSceneFrame(loop.frameDuration)
        loop.warmupFrame++

        if (shouldYield()) {
          return
        }
      }

      while (loop.phase === 'preview') {
        if (runtime.abortRequested) {
          await finishExport()
          return
        }

        if (loop.frameId >= loop.totalFrames) {
          if (runtime.recorder) {
            const previewBlob = await runtime.recorder.finalize()
            if (previewBlob) {
              exportStore.setPreviewUrl(URL.createObjectURL(previewBlob))
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
            onProgress: (progress) => exportStore.setProgress(progress),
            hardwareAcceleration: settings.hardwareAcceleration,
            bitrateMode: settings.bitrateMode,
            textOverlay: settings.textOverlay,
            crop: settings.crop,
            rotation: settings.rotation,
          })
          await mainRecorder.initialize()
          runtime.recorder = mainRecorder
          exportStore.setStatus('rendering')
          continue
        }

        advanceSceneStateByDelta(loop.frameDuration)
        executeSceneFrame(loop.frameDuration)

        if (runtime.recorder) {
          await runtime.recorder.captureFrame(loop.frameId * loop.frameDuration, loop.frameDuration)
        }
        loop.frameId++

        if (shouldYield()) {
          return
        }
      }

      while (loop.phase === 'recording' && loop.frameId < loop.totalFrames) {
        if (runtime.abortRequested) {
          await finishExport()
          return
        }

        if (mode === 'segmented' && loop.framesInCurrentSegment >= loop.segmentDurationFrames) {
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

          const nextRecorder = createExportRecorder(
            canvas,
            settings,
            runtime.exportWidth,
            runtime.exportHeight,
            nextSegmentFrames / settings.fps
          )
          await nextRecorder.initialize()
          runtime.recorder = nextRecorder
        }

        advanceSceneStateByDelta(loop.frameDuration)
        executeSceneFrame(loop.frameDuration)

        const globalVideoTime = loop.frameId * loop.frameDuration
        const relativeVideoTime = globalVideoTime - loop.segmentStartTimeVideo

        if (runtime.recorder) {
          await runtime.recorder.captureFrame(
            relativeVideoTime,
            loop.frameDuration,
            globalVideoTime
          )
        }

        loop.frameId++
        loop.framesInCurrentSegment++

        if (shouldYield()) {
          break
        }
      }

      if (loop.phase === 'recording') {
        const nowMs = Date.now()
        if (nowMs - loop.lastEtaUpdate > 500) {
          const framesDone = loop.frameId
          const framesTotal = loop.totalFrames
          const progress = framesTotal > 0 ? framesDone / framesTotal : 0
          exportStore.setProgress(progress)

          if (framesDone > 0) {
            const elapsedMs = nowMs - loop.exportStartTime
            const msPerFrame = elapsedMs / framesDone
            const remainingMs = (framesTotal - framesDone) * msPerFrame
            const remainingSec = Math.ceil(remainingMs / 1000)
            exportStore.setEta(`${remainingSec}s`)
          }
          loop.lastEtaUpdate = nowMs
        }

        if (loop.frameId >= loop.totalFrames) {
          await finishExport()
        }
      }
    } catch (error) {
      await handleExportError(error)
    } finally {
      runtime.processing = false
    }
  }, [
    advanceSceneStateByDelta,
    canvas,
    executeSceneFrame,
    exportRuntimeRef,
    finishExport,
    handleExportError,
  ])

  // --------------------------------------------------------------------------
  // tickExport — called once per rAF by renderFrame
  // --------------------------------------------------------------------------
  const tickExport = useCallback((): boolean => {
    const runtime = exportRuntimeRef.current
    const exportStore = useExportStore.getState()
    const runtimeActive = isExportRuntimeActive(runtime)

    if (
      exportStore.isExporting &&
      exportStore.status === 'idle' &&
      !runtime.starting &&
      !runtime.started
    ) {
      void startExport()
    } else if (!exportStore.isExporting && runtimeActive && !runtime.canceling) {
      void cancelExport()
    }

    if (runtimeActive) {
      if (runtime.started && !runtime.processing && !runtime.finishing && !runtime.canceling) {
        void processExportBatch()
      }
      return true
    }

    return false
  }, [cancelExport, exportRuntimeRef, processExportBatch, startExport])

  // --------------------------------------------------------------------------
  // cleanupExport — called in teardown effect
  // --------------------------------------------------------------------------
  const cleanupExport = useCallback(() => {
    const runtime = exportRuntimeRef.current
    const shouldRestoreRuntime = isExportRuntimeActive(runtime) || runtime.recorder !== null
    runtime.abortRequested = true
    if (runtime.recorder) {
      runtime.recorder.dispose()
      runtime.recorder = null
    }
    if (shouldRestoreRuntime) {
      restoreRuntimeState()
      resetExportRuntime()
    }
  }, [exportRuntimeRef, resetExportRuntime, restoreRuntimeState])

  return { tickExport, cleanupExport }
}
