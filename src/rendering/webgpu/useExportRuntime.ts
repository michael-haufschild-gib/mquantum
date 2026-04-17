/**
 * Custom hook encapsulating all video export runtime logic for the WebGPU scene.
 *
 * Extracted from WebGPUScene.ts to reduce component size and isolate export
 * state management from the render loop.
 *
 * @module rendering/webgpu/useExportRuntime
 */

import { useCallback } from 'react'

import {
  computeRenderDimensions,
  computeSegmentDurationFrames,
  ensureEvenDimensions,
  resolveExportDimensions,
} from '@/lib/export/videoExportPlanning'
import { getConfigStoreKey } from '@/lib/geometry/registry'
import { useExportStore } from '@/stores/exportStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceStore } from '@/stores/performanceStore'

import {
  acquireStreamHandle,
  applyCompletionByMode,
  type BatchContext,
  captureExportEnvironment,
  processPreviewPhase,
  processRecordingPhase,
  processWarmupPhase,
  teardownRecorder,
} from './exportBatchHelpers'
import {
  cloneExportSettings,
  createExportRecorder,
  createInitialExportLoopState,
  isExportRuntimeActive,
  resolveRuntimeExportMode,
  type UseExportRuntimeParams,
  type UseExportRuntimeReturn,
  validateExportSettings,
  waitForPaint,
} from './sceneExportRuntime'

// Re-export interfaces for consumers
export type { UseExportRuntimeParams, UseExportRuntimeReturn } from './sceneExportRuntime'

// ============================================================================
// Canvas configuration helper
// ============================================================================

/**
 * Resize the canvas, render graph, and camera aspect for export dimensions.
 */
function configureExportCanvas(
  runtime: Parameters<typeof captureExportEnvironment>[0],
  settings: Parameters<typeof cloneExportSettings>[0],
  canvas: HTMLCanvasElement,
  graph: UseExportRuntimeParams['graph'],
  cameraRef: UseExportRuntimeParams['cameraRef'],
  device: UseExportRuntimeParams['device']
): void {
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

  if (!cameraRef.current) {
    return
  }
  if (settings.crop.enabled) {
    cameraRef.current.setAspect(runtime.originalCameraAspect)
  } else {
    cameraRef.current.setAspect(renderDimensions.width / renderDimensions.height)
  }
}

// ============================================================================
// Wave evolution reset (mirrors TimelineControls handleReset)
// ============================================================================

/**
 * Reset the wavefunction/evolution to its initial state.
 *
 * Dispatches the same reset actions as the timeline reset button,
 * reading the current object type and quantum mode imperatively.
 */
function resetWaveEvolution(): void {
  const { objectType } = useGeometryStore.getState()
  const configStoreKey = getConfigStoreKey(objectType)
  const state = useExtendedObjectStore.getState()

  if (configStoreKey === 'pauliSpinor') {
    state.resetPauliField()
    return
  }

  if (configStoreKey !== 'schroedinger') return

  const { quantumMode } = state.schroedinger

  switch (quantumMode) {
    case 'harmonicOscillator':
    case 'hydrogenND':
    case 'hydrogenNDCoupled':
      state.resetSchroedingerParameters()
      state.requestOpenQuantumStateReset()
      break
    case 'freeScalarField':
      state.resetFreeScalarField()
      break
    case 'tdseDynamics':
      state.resetTdseField()
      break
    case 'becDynamics':
      state.resetBecField()
      break
    case 'diracEquation':
      state.setDiracNeedsReset()
      break
    case 'quantumWalk':
      state.resetQuantumWalk()
      break
    case 'wheelerDeWitt':
      state.triggerWdwRecompute()
      break
    case 'antiDeSitter':
      state.triggerAdsRecompute()
      break
    default: {
      const _exhaustive: never = quantumMode
      void _exhaustive
    }
  }
}

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

      runtime.recorder = await teardownRecorder(runtime.recorder)

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
        runtime.recorder = await teardownRecorder(runtime.recorder)
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
      applyCompletionByMode(runtime.mode, blob, runtime.loop, runtime.settings)
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
      runtime.recorder = await teardownRecorder(runtime.recorder)
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

    try {
      let streamHandle: FileSystemFileHandle | undefined

      if (mode === 'stream') {
        exportStore.setStatus('rendering')
        streamHandle = await acquireStreamHandle(settings.format)
        if (!streamHandle) {
          exportStore.setIsExporting(false)
          exportStore.setStatus('idle')
          resetExportRuntime()
          return
        }
      } else {
        exportStore.setStatus('rendering')
      }

      captureExportEnvironment(runtime, canvas, cameraRef, size)

      await waitForPaint()
      if (runtime.abortRequested) {
        restoreRuntimeState()
        resetExportRuntime()
        return
      }

      validateExportSettings(settings)
      configureExportCanvas(runtime, settings, canvas, graph, cameraRef, device)

      await waitForPaint()
      if (runtime.abortRequested) {
        restoreRuntimeState()
        resetExportRuntime()
        return
      }

      if (settings.resetEvolution) {
        resetWaveEvolution()
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
        const recorder = await createExportRecorder(
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
    size,
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
      const batchStartMs = performance.now()
      const ctx: BatchContext = {
        runtime,
        settings: runtime.settings,
        mode: runtime.mode,
        canvas,
        advanceSceneStateByDelta,
        executeSceneFrame,
        shouldYield: () => performance.now() - batchStartMs > 30,
        finishExport,
      }

      const warmupResult = await processWarmupPhase(ctx)
      if (warmupResult !== 'done') {
        return
      }

      const previewResult = await processPreviewPhase(ctx)
      if (previewResult !== 'done') {
        return
      }

      await processRecordingPhase(ctx)
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
