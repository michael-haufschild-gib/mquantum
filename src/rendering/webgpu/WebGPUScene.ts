/**
 * WebGPU Scene Component
 *
 * Thin composition layer that wires together the camera controller,
 * gizmo interaction, store wiring, frame loop, and pass setup.
 *
 * @module rendering/webgpu/WebGPUScene
 */

import React, { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { ObjectType } from '@/lib/geometry/types'
import { useRotationUpdates } from '@/rendering/renderers/base'
import { useAppearanceStore } from '@/stores/appearanceStore'
import type { SkyboxMode } from '@/stores/defaults/visualDefaults'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { useScreenshotCaptureStore } from '@/stores/screenshotCaptureStore'

import {
  createInitialExportRuntimeState,
  isExportRuntimeActive,
  waitForPaint,
} from './sceneExportRuntime'
import { useExportRuntime } from './useExportRuntime'
import { useGizmoInteraction } from './useGizmoInteraction'
import { useSceneCameraController } from './useSceneCameraController'
import { useSceneFrameCallbacks, useSceneFrameLoop } from './useSceneFrameLoop'
import { useSceneStoreWiring } from './useSceneStoreWiring'
import { WebGPUCanvasCapture } from './utils/WebGPUCanvasCapture'
import { useWebGPU } from './WebGPUContext'
import { WebGPUStatsCollector } from './WebGPUPerformanceCollector'

// Re-export for backward compat (tests import from this module path)
export { isExportRuntimeActive }

// ============================================================================
// Types
// ============================================================================

/** Props for the main WebGPU scene component that manages the render pipeline. */
export interface WebGPUSceneProps {
  /** Current object type to render */
  objectType: ObjectType
  /** Current dimension */
  dimension: number
  /** Optional callback when frame renders */
  onFrame?: (deltaTime: number) => void
}

// ============================================================================
// Store Selectors
// ============================================================================

const appearanceSelector = (state: ReturnType<typeof useAppearanceStore.getState>) => ({
  colorAlgorithm: state.colorAlgorithm,
})

const environmentSelector = (state: ReturnType<typeof useEnvironmentStore.getState>) => ({
  skyboxEnabled: state.skyboxEnabled,
  skyboxMode: state.skyboxMode,
  backgroundColor: state.backgroundColor,
})

const performanceSelector = (state: ReturnType<typeof usePerformanceStore.getState>) => ({
  maxFps: state.maxFps,
  temporalReprojectionEnabled: state.temporalReprojectionEnabled,
  eigenfunctionCacheEnabled: state.eigenfunctionCacheEnabled,
  analyticalGradientEnabled: state.analyticalGradientEnabled,
  fastEigenInterpolationEnabled: state.fastEigenInterpolationEnabled,
})

const postProcessingSelector = (state: ReturnType<typeof usePostProcessingStore.getState>) => ({
  bloomEnabled: state.bloomEnabled,
  antiAliasingMethod: state.antiAliasingMethod,
  paperEnabled: state.paperEnabled,
  frameBlendingEnabled: state.frameBlendingEnabled,
})

const schroedingerIsoSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) =>
  state.schroedinger?.isoEnabled ?? false

const schroedingerCompileSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) => {
  const quantumMode = state.schroedinger?.quantumMode ?? 'harmonicOscillator'
  const representation = (state.schroedinger?.representation ?? 'position') as
    | 'position'
    | 'momentum'
    | 'wigner'
  const openQuantumEnabled = state.schroedinger?.openQuantum?.enabled ?? false
  const openQuantumSupported =
    (quantumMode === 'harmonicOscillator' || quantumMode === 'hydrogenND') &&
    representation !== 'wigner'

  const diracFieldView =
    quantumMode === 'diracEquation'
      ? (state.schroedinger?.dirac?.fieldView ?? 'totalDensity')
      : undefined

  const pauliFieldView = state.pauliSpinor?.fieldView ?? 'spinDensity'

  return {
    quantumMode,
    termCount: (state.schroedinger?.termCount ?? 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
    nodalEnabled: state.schroedinger?.nodalEnabled ?? false,
    phaseMaterialityEnabled: state.schroedinger?.phaseMaterialityEnabled ?? false,
    interferenceEnabled: state.schroedinger?.interferenceEnabled ?? false,
    uncertaintyBoundaryEnabled: state.schroedinger?.uncertaintyBoundaryEnabled ?? false,
    representation,
    openQuantumEnabled: openQuantumEnabled && openQuantumSupported,
    diracFieldView,
    pauliFieldView,
  }
}

// Stable empty array to avoid new reference on every render when parameterValues is undefined
const EMPTY_PARAM_VALUES: number[] = []
const schroedingerSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) =>
  state.schroedinger?.parameterValues ?? EMPTY_PARAM_VALUES

// ============================================================================
// Component
// ============================================================================

/**
 * WebGPU Scene component.
 *
 * Sets up the complete render pipeline with all necessary passes.
 * Connects to Zustand stores for uniforms and settings.
 */
export const WebGPUScene: React.FC<WebGPUSceneProps> = ({ objectType, dimension, onFrame }) => {
  const { graph, size, canvas, device } = useWebGPU()

  // ── Camera controller ──
  const { cameraRef, dimensionRef, startInteraction, scheduleEndInteraction, interactionTimerRef } =
    useSceneCameraController({ size, dimension })

  // ── Gizmo interaction (produces mouse handlers) ──
  const { overlayRef, handleMouseDown, handleMouseUp, handleMouseMove } = useGizmoInteraction({
    cameraRef,
    dimensionRef,
    startInteraction,
    scheduleEndInteraction,
  })

  // ── Wheel handler (passive: false for preventDefault) ──
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const handleWheel = (e: WheelEvent) => {
      if (!cameraRef.current) return
      e.preventDefault()
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9
      cameraRef.current.zoom(zoomFactor)
      startInteraction()
      scheduleEndInteraction()
    }

    overlay.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      overlay.removeEventListener('wheel', handleWheel)
    }
  }, [cameraRef, overlayRef, startInteraction, scheduleEndInteraction])

  // ── Stats collector initialization ──
  const statsCollectorRef = useRef<WebGPUStatsCollector>(new WebGPUStatsCollector())
  useEffect(() => {
    const collector = statsCollectorRef.current
    collector.initialize(device.getAdapter())
    return () => {
      collector.reset()
    }
  }, [device])

  // ── Screenshot capture hook ──
  useEffect(() => {
    const capture = new WebGPUCanvasCapture(device.getDevice())

    graph.registerBeforeSubmitHook(
      'screenshot-capture',
      ({ encoder, canvasTexture, size: frameSize }) => {
        const state = useScreenshotCaptureStore.getState()
        if (state.status !== 'capturing') return

        capture.queueCapture({
          encoder,
          texture: canvasTexture,
          width: frameSize.width,
          height: frameSize.height,
          format: device.getFormat(),
          requestId: state.requestId,
          onSuccess: (dataUrl, requestId) => {
            useScreenshotCaptureStore.getState().setCapturedImage(dataUrl, requestId)
          },
          onError: (error, requestId) => {
            useScreenshotCaptureStore.getState().setError(error, requestId)
          },
        })
      }
    )

    return () => {
      graph.unregisterBeforeSubmitHook('screenshot-capture')
      capture.dispose()
    }
  }, [device, graph])

  // ── Store subscriptions ──
  const appearance = useAppearanceStore(useShallow(appearanceSelector))
  const environment = useEnvironmentStore(useShallow(environmentSelector))
  const performance_ = usePerformanceStore(useShallow(performanceSelector))
  const renderResolutionScale = usePerformanceStore((state) => state.renderResolutionScale)
  const postProcessing = usePostProcessingStore(useShallow(postProcessingSelector))
  const schroedingerIsoEnabled = useExtendedObjectStore(schroedingerIsoSelector)
  const schroedingerCompile = useExtendedObjectStore(useShallow(schroedingerCompileSelector))
  const schroedingerParamValues = useExtendedObjectStore(schroedingerSelector)

  // ── Schrödinger rotation basis vectors ──
  const schroedingerRotation = useRotationUpdates({
    dimension,
    parameterValues: schroedingerParamValues,
  })

  const schroedingerBasisCacheRef = useRef({
    basisX: new Float32Array(11),
    basisY: new Float32Array(11),
    basisZ: new Float32Array(11),
    origin: new Float32Array(11),
  })

  // ── Store wiring ──
  useSceneStoreWiring({ graph, objectType, cameraRef, schroedingerBasisCacheRef })

  // ── Export runtime state ──
  const exportRuntimeRef = useRef(createInitialExportRuntimeState())

  // ── Frame callbacks (shared by frame loop and export runtime) ──
  const { advanceSceneStateByDelta, executeSceneFrame } = useSceneFrameCallbacks({
    graph,
    canvas,
    size,
    objectType,
    dimension,
    schroedingerRotation,
    schroedingerBasisCacheRef,
    exportRuntimeRef,
    onFrame,
  })

  // ── Export runtime ──
  const { tickExport, cleanupExport } = useExportRuntime({
    canvas,
    device,
    graph,
    cameraRef,
    size,
    advanceSceneStateByDelta,
    executeSceneFrame,
    exportRuntimeRef,
  })

  // ── Frame loop ──
  useSceneFrameLoop({
    maxFps: performance_.maxFps,
    advanceSceneStateByDelta,
    executeSceneFrame,
    tickExport,
    cleanupExport,
    interactionTimerRef,
  })

  // ── Pass setup ──
  const setupGenerationRef = useRef(0)
  const setupTaskRef = useRef<Promise<void>>(Promise.resolve())
  const currentObjectTypeRef = useRef<ObjectType | null>(null)
  const lastSchrodingerConfigRef = useRef<SchrodingerPassConfig | null>(null)
  const lastPPConfigRef = useRef<PPPassConfig | null>(null)
  const needsFullRebuildRef = useRef(true)
  const lastGraphRef = useRef<typeof graph | null>(null)

  // Reset rebuild state when the graph instance changes (e.g. WebGPUCanvas re-init).
  // A new graph has an empty resource pool — warm swap would fail without a full rebuild.
  if (lastGraphRef.current !== graph) {
    lastGraphRef.current = graph
    needsFullRebuildRef.current = true
    lastSchrodingerConfigRef.current = null
    lastPPConfigRef.current = null
    setupTaskRef.current = Promise.resolve()
  }

  useEffect(() => {
    let cancelled = false
    const setupGeneration = ++setupGenerationRef.current
    const shouldAbortSetup = () => cancelled || setupGeneration !== setupGenerationRef.current
    const previousSetupTask = setupTaskRef.current

    const fullConfig: PassConfig = {
      objectType,
      dimension,
      bloomEnabled: postProcessing.bloomEnabled,
      antiAliasingMethod: postProcessing.antiAliasingMethod,
      paperEnabled: postProcessing.paperEnabled,
      frameBlendingEnabled: postProcessing.frameBlendingEnabled,
      isosurface: schroedingerIsoEnabled,
      quantumMode: schroedingerCompile.quantumMode,
      termCount: schroedingerCompile.termCount,
      nodalEnabled: schroedingerCompile.nodalEnabled,
      phaseMaterialityEnabled: schroedingerCompile.phaseMaterialityEnabled,
      interferenceEnabled: schroedingerCompile.interferenceEnabled,
      uncertaintyBoundaryEnabled: schroedingerCompile.uncertaintyBoundaryEnabled,
      temporalReprojectionEnabled:
        // Temporal reprojection is incompatible with compute modes (they use density grids)
        // and 2D pipelines (fullscreen triangle, no depth/MRT)
        schroedingerCompile.quantumMode === 'freeScalarField' ||
        schroedingerCompile.quantumMode === 'tdseDynamics' ||
        schroedingerCompile.quantumMode === 'becDynamics' ||
        schroedingerCompile.quantumMode === 'diracEquation' ||
        objectType === 'pauliSpinor' ||
        dimension === 2 ||
        schroedingerCompile.representation === 'wigner'
          ? false
          : performance_.temporalReprojectionEnabled,
      eigenfunctionCacheEnabled: performance_.eigenfunctionCacheEnabled,
      analyticalGradientEnabled: performance_.analyticalGradientEnabled,
      fastEigenInterpolationEnabled: performance_.fastEigenInterpolationEnabled,
      renderResolutionScale: usePerformanceStore.getState().renderResolutionScale,
      colorAlgorithm: appearance.colorAlgorithm,
      diracFieldView: schroedingerCompile.diracFieldView,
      pauliFieldView:
        objectType === 'pauliSpinor'
          ? pauliFieldViewForColorAlgorithm(appearance.colorAlgorithm)
          : schroedingerCompile.pauliFieldView,
      representation: schroedingerCompile.representation,
      openQuantumEnabled: schroedingerCompile.openQuantumEnabled,
      skyboxEnabled: environment.skyboxEnabled,
      skyboxMode: environment.skyboxMode as SkyboxMode,
      backgroundColor: environment.backgroundColor,
    }

    const schrodingerConfig = extractSchrodingerConfig(fullConfig)
    const ppConfig = extractPPConfig(fullConfig)

    const setupPasses = async () => {
      await previousSetupTask
      if (shouldAbortSetup()) return

      // Compute rebuild decisions AFTER awaiting the previous task.
      // The previous task's abort handler may have set needsFullRebuildRef
      // and nulled the config refs — we must read the up-to-date values.
      const schrodingerChanged = !shallowEqual(lastSchrodingerConfigRef.current, schrodingerConfig)
      const ppChanged = !shallowEqual(lastPPConfigRef.current, ppConfig)
      const forceFullRebuildForModeTransition = shouldForceFullRebuildForQuantumModeTransition(
        lastSchrodingerConfigRef.current,
        schrodingerConfig
      )
      const isFullRebuild = needsFullRebuildRef.current || forceFullRebuildForModeTransition

      if (import.meta.env.DEV) {
        logger.log(
          `[WebGPUScene] pass-setup: isFullRebuild=${isFullRebuild} schrodingerChanged=${schrodingerChanged} ppChanged=${ppChanged} forceMode=${forceFullRebuildForModeTransition} needsRebuild=${needsFullRebuildRef.current}`
        )
      }

      currentObjectTypeRef.current = objectType

      const perfStore = usePerformanceStore.getState()
      perfStore.setShaderCompiling('pipeline', true)
      await waitForPaint()
      if (shouldAbortSetup()) {
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        return
      }
      perfStore.resetRefinement()

      // Track whether this setup touched the graph. If it did and gets aborted,
      // we must force a full rebuild so the next setup doesn't warm-swap on a
      // partially-constructed (or cleared) graph.
      let graphTouched = false

      try {
        if (isFullRebuild) {
          graph.clearPasses()
          graphTouched = true
          if (shouldAbortSetup()) return
          setupSharedResources(graph, fullConfig)
          if (shouldAbortSetup()) return
          await setupSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return
          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        } else if (schrodingerChanged && ppChanged) {
          ensureTemporalResources(graph, fullConfig)
          graphTouched = true
          if (shouldAbortSetup()) return
          await warmSwapSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return
          removeStaleTemporalResources(graph, fullConfig)
          cleanupSchrodingerPasses(graph, fullConfig)
          cleanupPPPasses(graph, fullConfig)
          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        } else if (schrodingerChanged) {
          ensureTemporalResources(graph, fullConfig)
          graphTouched = true
          if (shouldAbortSetup()) return
          await warmSwapSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return
          removeStaleTemporalResources(graph, fullConfig)
          cleanupSchrodingerPasses(graph, fullConfig)
        } else if (ppChanged) {
          cleanupPPPasses(graph, fullConfig)
          graphTouched = true
          if (shouldAbortSetup()) return
          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        }
      } catch (err) {
        logger.error('[WebGPUScene] CRITICAL: pass setup failed:', err)
        needsFullRebuildRef.current = true
        lastSchrodingerConfigRef.current = null
        lastPPConfigRef.current = null
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        graph.compile()
        return
      } finally {
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        // If this setup modified the graph and is being aborted, force a full
        // rebuild so the successor doesn't attempt a warm swap on a broken graph.
        if (graphTouched && shouldAbortSetup()) {
          needsFullRebuildRef.current = true
          lastSchrodingerConfigRef.current = null
          lastPPConfigRef.current = null
        }
      }

      if (shouldAbortSetup()) {
        if (import.meta.env.DEV) {
          logger.warn(`[WebGPUScene] ABORT mid-rebuild (gen=${setupGeneration}), clearing graph`)
        }
        graph.clearPasses()
        needsFullRebuildRef.current = true
        lastSchrodingerConfigRef.current = null
        lastPPConfigRef.current = null
        return
      }

      graph.compile()
      needsFullRebuildRef.current = false
      lastSchrodingerConfigRef.current = { ...schrodingerConfig }
      lastPPConfigRef.current = { ...ppConfig }

      // E2E testability: expose pipeline generation on the canvas so tests can
      // wait for the new pipeline to be active instead of polling isShaderCompiling.
      canvas.setAttribute('data-pipeline-gen', String(setupGeneration))

      if (import.meta.env.DEV) {
        logger.log(
          `[WebGPUScene] setup COMPLETE (gen=${setupGeneration}), isFullRebuild=${isFullRebuild}`
        )
      }

      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        const renderScale = usePerformanceStore.getState().renderResolutionScale
        const effectiveDpr = window.devicePixelRatio * renderScale
        const w = Math.floor(canvas.clientWidth * effectiveDpr)
        const h = Math.floor(canvas.clientHeight * effectiveDpr)
        canvas.width = w
        canvas.height = h
        graph.setSize(w, h)
        if (cameraRef.current) {
          cameraRef.current.setAspect(w / h)
        }
      }
    }

    const setupTask = setupPasses().catch((err) => {
      logger.error('[WebGPUScene] setupPasses task failed:', err)
      needsFullRebuildRef.current = true
      lastSchrodingerConfigRef.current = null
      lastPPConfigRef.current = null
    })
    setupTaskRef.current = setupTask

    return () => {
      cancelled = true
    }
  }, [
    graph,
    objectType,
    dimension,
    postProcessing.bloomEnabled,
    postProcessing.antiAliasingMethod,
    postProcessing.paperEnabled,
    postProcessing.frameBlendingEnabled,
    canvas,
    environment.skyboxEnabled,
    environment.skyboxMode,
    environment.backgroundColor,
    appearance.colorAlgorithm,
    schroedingerIsoEnabled,
    schroedingerCompile.quantumMode,
    schroedingerCompile.termCount,
    schroedingerCompile.nodalEnabled,
    schroedingerCompile.phaseMaterialityEnabled,
    schroedingerCompile.interferenceEnabled,
    schroedingerCompile.uncertaintyBoundaryEnabled,
    schroedingerCompile.representation,
    schroedingerCompile.diracFieldView,
    schroedingerCompile.pauliFieldView,
    performance_.temporalReprojectionEnabled,
    performance_.eigenfunctionCacheEnabled,
    performance_.analyticalGradientEnabled,
    performance_.fastEigenInterpolationEnabled,
    schroedingerCompile.openQuantumEnabled,
    cameraRef,
  ])

  // ── Runtime scene clear-color update ──
  useEffect(() => {
    updateScenePassBackgroundColor({
      graph,
      skyboxEnabled: environment.skyboxEnabled,
      backgroundColor: environment.backgroundColor,
    })
  }, [graph, environment.skyboxEnabled, environment.backgroundColor])

  // ── Runtime CAS sharpening update ──
  useEffect(() => {
    updateToScreenPassSharpness({ graph, renderResolutionScale })
  }, [graph, renderResolutionScale])

  // ── Render event capture overlay ──
  return React.createElement('div', {
    ref: overlayRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      cursor: 'grab',
    },
    onMouseDown: handleMouseDown,
    onMouseUp: handleMouseUp,
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseUp,
  })
}

// ============================================================================
// Pass Setup (imported from scenePassSetup.ts)
// ============================================================================

import { logger } from '@/lib/logger'

import {
  extractPPConfig,
  extractSchrodingerConfig,
  type PassConfig,
  pauliFieldViewForColorAlgorithm,
  type PPPassConfig,
  type SchrodingerPassConfig,
  shallowEqual,
  shouldForceFullRebuildForQuantumModeTransition,
  updateScenePassBackgroundColor,
  updateToScreenPassSharpness,
} from './scenePassConfig'
import {
  cleanupPPPasses,
  cleanupSchrodingerPasses,
  ensureTemporalResources,
  removeStaleTemporalResources,
  setupPPPasses,
  setupSchrodingerPasses,
  setupSharedResources,
  warmSwapSchrodingerPasses,
} from './scenePassSetup'

export default WebGPUScene
