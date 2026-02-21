/**
 * WebGPU Scene Component
 *
 * Main scene component for WebGPU rendering that sets up render passes
 * and manages the rendering pipeline. Mirrors the WebGL scene setup.
 *
 * @module rendering/webgpu/WebGPUScene
 */

import React, { useEffect, useRef, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWebGPU } from './WebGPUCanvas'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import type { WebGPUFrameStats, WebGPURenderPass } from './core/types'
import { WebGPUCamera } from './core/WebGPUCamera'
import { WebGPUStatsCollector } from './WebGPUPerformanceCollector'

// Stores
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { useAnimationStore } from '@/stores/animationStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useTransformStore } from '@/stores/transformStore'
import { usePBRStore } from '@/stores/pbrStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useUIStore } from '@/stores/uiStore'
import { useScreenshotCaptureStore } from '@/stores/screenshotCaptureStore'
import { useCameraStore } from '@/stores/cameraStore'

// Passes (import as needed for the pipeline)
import { ScenePass } from './passes/ScenePass'
import { BloomPass } from './passes/BloomPass'
import { ToneMappingCinematicPass } from './passes/ToneMappingCinematicPass'
import { FXAAPass } from './passes/FXAAPass'
import { SMAAPass } from './passes/SMAAPass'
import { ToScreenPass } from './passes/ToScreenPass'
import { EnvironmentCompositePass } from './passes/EnvironmentCompositePass'
import { PaperTexturePass } from './passes/PaperTexturePass'
import { FrameBlendingPass } from './passes/FrameBlendingPass'
// CinematicPass merged into ToneMappingCinematicPass
import { BufferPreviewPass } from './passes/BufferPreviewPass'
import { WebGPUTemporalCloudPass } from './passes/WebGPUTemporalCloudPass'
import { parseHexColorToLinearRgb } from './utils/color'
import { evaluateFpsLimit } from './utils/fpsLimiter'
import { WebGPUCanvasCapture } from './utils/WebGPUCanvasCapture'
import { VideoRecorder } from '@/lib/export/video'
import {
  computeRenderDimensions,
  computeSegmentDurationFrames,
  ensureEvenDimensions,
  resolveExportDimensions,
} from '@/lib/export/videoExportPlanning'
import { useExportStore, type ExportMode, type ExportSettings } from '@/stores/exportStore'

/**
 * Wait for the browser to complete at least one paint cycle.
 * Double-rAF guarantees the DOM has been painted (first rAF fires
 * before next paint, second fires after that paint completes).
 */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

// Object Renderers
import { WebGPUSchrodingerRenderer } from './renderers/WebGPUSchrodingerRenderer'
import { WebGPUSkyboxRenderer } from './renderers/WebGPUSkyboxRenderer'
import type { ObjectType } from '@/lib/geometry/types'
import type { SkyboxMode } from '@/stores/defaults/visualDefaults'
import {
  COLOR_ALGORITHM_TO_INT,
  getAvailableColorAlgorithms,
  type ColorAlgorithm as PaletteColorAlgorithm,
} from '@/rendering/shaders/palette/types'
import type { ColorAlgorithm as WGSLColorAlgorithm } from './shaders/types'

// Rotation hooks for Schroedinger basis vectors
import { useRotationUpdates } from '@/rendering/renderers/base'

// Animation bias
import { getRotationPlanes } from '@/lib/math/rotation'
import { getPlaneMultiplier } from '@/lib/animation/biasCalculation'

// ============================================================================
// Types
// ============================================================================

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
  robustEigenInterpolationEnabled: state.robustEigenInterpolationEnabled,
})

const postProcessingSelector = (state: ReturnType<typeof usePostProcessingStore.getState>) => ({
  bloomEnabled: state.bloomEnabled,
  antiAliasingMethod: state.antiAliasingMethod,
  // Paper texture
  paperEnabled: state.paperEnabled,
  // Frame blending
  frameBlendingEnabled: state.frameBlendingEnabled,
})

// Schrodinger isosurface selector (compile-time shader flag, triggers renderer recreation)
const schroedingerIsoSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) =>
  state.schroedinger?.isoEnabled ?? false

const schroedingerCompileSelector = (
  state: ReturnType<typeof useExtendedObjectStore.getState>
) => ({
  quantumMode: state.schroedinger?.quantumMode ?? 'harmonicOscillator',
  termCount: (state.schroedinger?.termCount ?? 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
  nodalEnabled: state.schroedinger?.nodalEnabled ?? false,
  phaseMaterialityEnabled: state.schroedinger?.phaseMaterialityEnabled ?? false,
  interferenceEnabled: state.schroedinger?.interferenceEnabled ?? false,
  uncertaintyBoundaryEnabled: state.schroedinger?.uncertaintyBoundaryEnabled ?? false,
  representation: (state.schroedinger?.representation ?? 'position') as 'position' | 'momentum' | 'wigner',
})

// Schrodinger selector for rotation updates (like WebGL SchroedingerMesh.tsx line 108)
// Stable empty array to avoid new reference on every render when parameterValues is undefined
const EMPTY_PARAM_VALUES: number[] = []
const schroedingerSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) =>
  state.schroedinger?.parameterValues ?? EMPTY_PARAM_VALUES

type ExportPhase = 'warmup' | 'preview' | 'recording'
type RuntimeExportMode = Exclude<ExportMode, 'auto'>

interface ExportLoopState {
  phase: ExportPhase
  frameId: number
  warmupFrame: number
  startTime: number
  totalFrames: number
  frameDuration: number
  exportStartTime: number
  lastEtaUpdate: number
  mainStreamHandle?: FileSystemFileHandle
  segmentDurationFrames: number
  currentSegment: number
  framesInCurrentSegment: number
  segmentStartTimeVideo: number
}

interface ExportPerformanceSnapshot {
  progressiveRefinementEnabled: boolean
  fractalAnimationLowQuality: boolean
  renderResolutionScale: number
}

interface ExportRuntimeState {
  starting: boolean
  started: boolean
  processing: boolean
  finishing: boolean
  canceling: boolean
  abortRequested: boolean
  mode: RuntimeExportMode | null
  settings: ExportSettings | null
  recorder: VideoRecorder | null
  rotationSnapshot: Map<string, number> | null
  originalCanvasWidth: number
  originalCanvasHeight: number
  originalCameraAspect: number
  exportWidth: number
  exportHeight: number
  renderWidth: number
  renderHeight: number
  originalPerf: ExportPerformanceSnapshot
  loop: ExportLoopState
}

export function isExportRuntimeActive(
  runtime: Pick<
    ExportRuntimeState,
    'starting' | 'started' | 'processing' | 'finishing' | 'canceling'
  >
): boolean {
  return (
    runtime.starting ||
    runtime.started ||
    runtime.processing ||
    runtime.finishing ||
    runtime.canceling
  )
}

function createInitialExportLoopState(): ExportLoopState {
  return {
    phase: 'warmup',
    frameId: 0,
    warmupFrame: 0,
    startTime: 0,
    totalFrames: 0,
    frameDuration: 0,
    exportStartTime: 0,
    lastEtaUpdate: 0,
    mainStreamHandle: undefined,
    segmentDurationFrames: 0,
    currentSegment: 0,
    framesInCurrentSegment: 0,
    segmentStartTimeVideo: 0,
  }
}

function createInitialExportRuntimeState(): ExportRuntimeState {
  return {
    starting: false,
    started: false,
    processing: false,
    finishing: false,
    canceling: false,
    abortRequested: false,
    mode: null,
    settings: null,
    recorder: null,
    rotationSnapshot: null,
    originalCanvasWidth: 0,
    originalCanvasHeight: 0,
    originalCameraAspect: 1,
    exportWidth: 0,
    exportHeight: 0,
    renderWidth: 0,
    renderHeight: 0,
    originalPerf: {
      progressiveRefinementEnabled: true,
      fractalAnimationLowQuality: true,
      renderResolutionScale: 1,
    },
    loop: createInitialExportLoopState(),
  }
}

function cloneExportSettings(settings: ExportSettings): ExportSettings {
  return {
    ...settings,
    textOverlay: { ...settings.textOverlay },
    crop: { ...settings.crop },
  }
}

function estimateExportSizeMb(settings: ExportSettings): number {
  return (settings.duration * settings.bitrate) / 8
}

function resolveRuntimeExportMode(
  mode: ExportMode,
  browserType: ReturnType<typeof useExportStore.getState>['browserType'],
  settings: ExportSettings
): RuntimeExportMode {
  if (mode !== 'auto') {
    return mode
  }

  const estimatedSizeMb = estimateExportSizeMb(settings)
  if (estimatedSizeMb < 100) {
    return 'in-memory'
  }

  return browserType === 'chromium-capable' ? 'stream' : 'segmented'
}

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
  const initialFrameTimeRef = useRef<number>(performance.now())
  const animationFrameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(initialFrameTimeRef.current)
  const fpsThrottleAnchorRef = useRef<number>(initialFrameTimeRef.current)
  const currentObjectTypeRef = useRef<ObjectType | null>(null)
  const setupGenerationRef = useRef(0)
  const setupTaskRef = useRef<Promise<void>>(Promise.resolve())
  const statsCollectorRef = useRef<WebGPUStatsCollector>(new WebGPUStatsCollector())
  const exportRuntimeRef = useRef<ExportRuntimeState>(createInitialExportRuntimeState())

  // Selective pass rebuild tracking
  const lastSchrodingerConfigRef = useRef<SchrodingerPassConfig | null>(null)
  const lastPPConfigRef = useRef<PPPassConfig | null>(null)
  const needsFullRebuildRef = useRef(true)

  // WebGPU camera for view/projection matrices (since we don't have THREE.js camera)
  const cameraRef = useRef<WebGPUCamera | null>(null)
  if (!cameraRef.current) {
    cameraRef.current = new WebGPUCamera({
      position: [0, 3.125, 7.5], // Match WebGL default camera position from App.tsx
      target: [0, 0, 0],
      fov: 60, // Match WebGL camera fov from App.tsx
      near: 0.1,
      far: 1000,
      aspect: size.width / size.height || 1,
    })
  }

  // Register camera with Zustand store so presets/shortcuts can read/write camera state
  useEffect(() => {
    if (cameraRef.current) {
      useCameraStore.getState().registerCamera(cameraRef.current)
    }
    return () => {
      useCameraStore.getState().registerCamera(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- camera is created once via ref

  // Camera control state
  const isDraggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const overlayRef = useRef<HTMLDivElement>(null)
  // Dimension ref for mouse handlers (avoids stale closure over prop)
  const dimensionRef = useRef(dimension)
  dimensionRef.current = dimension

  // Interaction state for progressive refinement
  const interactionTimerRef = useRef<number | null>(null)
  const INTERACTION_RESTORE_DELAY = 150

  const startInteraction = useCallback(() => {
    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current)
      interactionTimerRef.current = null
    }
    usePerformanceStore.getState().setIsInteracting(true)
  }, [])

  const scheduleEndInteraction = useCallback(() => {
    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current)
    }
    interactionTimerRef.current = window.setTimeout(() => {
      interactionTimerRef.current = null
      usePerformanceStore.getState().setIsInteracting(false)
    }, INTERACTION_RESTORE_DELAY)
  }, [INTERACTION_RESTORE_DELAY])

  // Camera control handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true
    lastMouseRef.current = { x: e.clientX, y: e.clientY }
    startInteraction()
  }, [startInteraction])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
    scheduleEndInteraction()
  }, [scheduleEndInteraction])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !cameraRef.current) return

    const dx = e.clientX - lastMouseRef.current.x
    const dy = e.clientY - lastMouseRef.current.y
    lastMouseRef.current = { x: e.clientX, y: e.clientY }

    if (dimensionRef.current === 2) {
      // 2D mode: pan instead of orbit (top-down orthographic view)
      const panSensitivity = 0.01
      cameraRef.current.pan(-dx * panSensitivity, dy * panSensitivity)
    } else {
      // 3D mode: orbit
      const sensitivity = 0.005
      cameraRef.current.orbit(-dx * sensitivity, -dy * sensitivity)
    }
  }, [])

  // Attach wheel listener with { passive: false } to allow preventDefault()
  // React's onWheel uses passive listeners by default, which blocks preventDefault()
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const handleWheel = (e: WheelEvent) => {
      if (!cameraRef.current) return
      e.preventDefault()

      // Zoom sensitivity
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9
      cameraRef.current.zoom(zoomFactor)

      startInteraction()
      scheduleEndInteraction()
    }

    overlay.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      overlay.removeEventListener('wheel', handleWheel)
    }
  }, [startInteraction, scheduleEndInteraction])

  // Initialize collector with adapter metadata for GPU name.
  useEffect(() => {
    const collector = statsCollectorRef.current
    collector.initialize(device.getAdapter())

    return () => {
      collector.reset()
    }
  }, [device])

  useEffect(() => {
    const capture = new WebGPUCanvasCapture(device.getDevice())

    graph.registerBeforeSubmitHook('screenshot-capture', ({ encoder, canvasTexture, size }) => {
      const state = useScreenshotCaptureStore.getState()
      if (state.status !== 'capturing') return

      capture.queueCapture({
        encoder,
        texture: canvasTexture,
        width: size.width,
        height: size.height,
        format: device.getFormat(),
        requestId: state.requestId,
        onSuccess: (dataUrl, requestId) => {
          useScreenshotCaptureStore.getState().setCapturedImage(dataUrl, requestId)
        },
        onError: (error, requestId) => {
          useScreenshotCaptureStore.getState().setError(error, requestId)
        },
      })
    })

    return () => {
      graph.unregisterBeforeSubmitHook('screenshot-capture')
      capture.dispose()
    }
  }, [device, graph])

  // Store subscriptions with shallow comparison
  const appearance = useAppearanceStore(useShallow(appearanceSelector))
  const environment = useEnvironmentStore(useShallow(environmentSelector))
  const performance_ = usePerformanceStore(useShallow(performanceSelector))
  const renderResolutionScale = usePerformanceStore((state) => state.renderResolutionScale)
  const postProcessing = usePostProcessingStore(useShallow(postProcessingSelector))
  // Schroedinger isosurface flag (compile-time shader selection, triggers renderer recreation)
  const schroedingerIsoEnabled = useExtendedObjectStore(schroedingerIsoSelector)
  const schroedingerCompile = useExtendedObjectStore(useShallow(schroedingerCompileSelector))
  // Schroedinger parameterValues for rotation updates (like WebGL SchroedingerMesh.tsx line 108)
  const schroedingerParamValues = useExtendedObjectStore(schroedingerSelector)

  // Rotation basis vectors for Schrodinger renderer (matches WebGL SchroedingerMesh.tsx lines 111, 912)
  // Computes rotated basis vectors from rotation store for N-D slicing
  const schroedingerRotation = useRotationUpdates({
    dimension,
    parameterValues: schroedingerParamValues,
  })

  // Cache for computed Schrodinger basis vectors - updated in render loop, read by store getter
  // Using Float32Array to avoid creating new arrays every frame
  const schroedingerBasisCacheRef = useRef({
    basisX: new Float32Array(11), // MAX_DIM = 11
    basisY: new Float32Array(11),
    basisZ: new Float32Array(11),
  })
  const cameraStoreCacheRef = useRef({
    viewMatrix: { elements: new Float32Array(16) },
    projectionMatrix: { elements: new Float32Array(16) },
    viewProjectionMatrix: { elements: new Float32Array(16) },
    inverseViewMatrix: { elements: new Float32Array(16) },
    inverseProjectionMatrix: { elements: new Float32Array(16) },
    position: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    near: 0.1,
    far: 1000,
    fov: 60,
  })
  const extendedStoreCacheRef = useRef<{
    sourceState: ReturnType<typeof useExtendedObjectStore.getState> | null
    mergedState: unknown
  }>({
    sourceState: null,
    mergedState: null,
  })

  // Initialize passes - rebuild when dependencies change.
  // Uses selective rebuild: only the pass group whose config changed is rebuilt,
  // avoiding unnecessary GPU pipeline compilations.
  useEffect(() => {
    let cancelled = false
    const setupGeneration = ++setupGenerationRef.current
    const shouldAbortSetup = () => cancelled || setupGeneration !== setupGenerationRef.current
    const previousSetupTask = setupTaskRef.current

    // Build the full PassConfig from current values
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
      temporalReprojectionEnabled: (
        schroedingerCompile.quantumMode === 'freeScalarField' ||
        schroedingerCompile.quantumMode === 'tdseDynamics'
      ) ? false : performance_.temporalReprojectionEnabled,
      eigenfunctionCacheEnabled: performance_.eigenfunctionCacheEnabled,
      analyticalGradientEnabled: performance_.analyticalGradientEnabled,
      robustEigenInterpolationEnabled: performance_.robustEigenInterpolationEnabled,
      renderResolutionScale: usePerformanceStore.getState().renderResolutionScale,
      colorAlgorithm: appearance.colorAlgorithm,
      representation: schroedingerCompile.representation,
      skyboxEnabled: environment.skyboxEnabled,
      skyboxMode: environment.skyboxMode as SkyboxMode,
      backgroundColor: environment.backgroundColor,
    }

    // Extract group-level configs for comparison
    const schrodingerConfig = extractSchrodingerConfig(fullConfig)
    const ppConfig = extractPPConfig(fullConfig)

    // Determine which groups changed
    const schrodingerChanged = !shallowEqual(lastSchrodingerConfigRef.current, schrodingerConfig)
    const ppChanged = !shallowEqual(lastPPConfigRef.current, ppConfig)
    const forceFullRebuildForModeTransition = shouldForceFullRebuildForQuantumModeTransition(
      lastSchrodingerConfigRef.current,
      schrodingerConfig
    )
    const isFullRebuild = needsFullRebuildRef.current || forceFullRebuildForModeTransition

    const setupPasses = async () => {
      // Serialize async pass setup to prevent stale setup races creating duplicate passes.
      console.log(`[WebGPUScene] setupPasses: awaiting previous task (gen=${setupGeneration})`,
        `schrodingerChanged=${schrodingerChanged} ppChanged=${ppChanged} fullRebuild=${isFullRebuild}`,
        `forceFull=${forceFullRebuildForModeTransition}`,
        `iso=${schrodingerConfig.isosurface} qm=${schrodingerConfig.quantumMode}`)
      await previousSetupTask
      if (shouldAbortSetup()) {
        console.log(`[WebGPUScene] setupPasses: ABORTED after await (gen=${setupGeneration})`)
        return
      }

      currentObjectTypeRef.current = objectType

      // Always show the compilation overlay so the user knows what is displayed.
      // For a scientific application, deterministic feedback is more important than
      // seamless background swaps — the user must know when the view has updated.
      const perfStore = usePerformanceStore.getState()

      perfStore.setShaderCompiling('pipeline', true)
      await waitForPaint()
      if (shouldAbortSetup()) {
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        return
      }
      perfStore.resetRefinement()

      try {
        if (isFullRebuild) {
          // Full rebuild: clear everything, set up from scratch
          graph.clearPasses()
          if (shouldAbortSetup()) return

          console.log('[WebGPUScene] Full pass rebuild for:', objectType)

          setupSharedResources(graph, fullConfig)
          if (shouldAbortSetup()) return

          await setupSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return

          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        } else if (schrodingerChanged && ppChanged) {
          // Both groups changed — warm swap Schrodinger, then rebuild PP
          console.log('[WebGPUScene] Rebuilding both pass groups (warm swap)')

          // Pre-swap: only ADD temporal resources (old passes keep their resources)
          ensureTemporalResources(graph, fullConfig)
          if (shouldAbortSetup()) return

          // Warm swap: old Schrodinger renders while new one compiles
          await warmSwapSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return

          // Post-swap: safe to remove stale resources — new pass is in place
          removeStaleTemporalResources(graph, fullConfig)
          cleanupSchrodingerPasses(graph, fullConfig)
          cleanupPPPasses(graph, fullConfig)

          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        } else if (schrodingerChanged) {
          // Only Schrodinger group changed — warm swap (old pass renders during compilation)
          console.log('[WebGPUScene] Warm swap: Schrodinger passes only',
            `iso=${fullConfig.isosurface} qm=${fullConfig.quantumMode}`)

          // Pre-swap: only ADD temporal resources (old passes keep their resources)
          ensureTemporalResources(graph, fullConfig)
          if (shouldAbortSetup()) return

          // Warm swap: old Schrodinger renders while new one compiles
          await warmSwapSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          console.log('[WebGPUScene] Warm swap COMPLETE',
            `aborted=${shouldAbortSetup()} gen=${setupGeneration}`)
          if (shouldAbortSetup()) return

          // Post-swap: safe to remove stale resources — new pass is in place
          removeStaleTemporalResources(graph, fullConfig)
          cleanupSchrodingerPasses(graph, fullConfig)
        } else if (ppChanged) {
          // Only PP group changed — skip Schrodinger pipeline compilations
          console.log('[WebGPUScene] Selective rebuild: PP passes only')

          cleanupPPPasses(graph, fullConfig)
          if (shouldAbortSetup()) return

          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        }
      } catch (err) {
        console.error('[WebGPUScene] CRITICAL: pass setup failed:', err)
        // Recovery: force full rebuild on next attempt.
        // Return early — do NOT update config tracking or compile graph,
        // so the next config change triggers a proper full rebuild.
        needsFullRebuildRef.current = true
        lastSchrodingerConfigRef.current = null
        lastPPConfigRef.current = null
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        // Compile the graph to render whatever old passes remain
        graph.compile()
        return
      } finally {
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
      }

      if (shouldAbortSetup()) {
        // Abort mid-selective-rebuild: clear graph to prevent auto-compile
        // of partially mutated state, then force full rebuild on next attempt.
        console.warn(`[WebGPUScene] ABORT mid-rebuild (gen=${setupGeneration}), clearing graph`)
        graph.clearPasses()
        needsFullRebuildRef.current = true
        lastSchrodingerConfigRef.current = null
        lastPPConfigRef.current = null
        return
      }

      // Compile the graph
      graph.compile()
      console.log(`[WebGPUScene] Graph compiled OK (gen=${setupGeneration})`)

      // Update config tracking on success ONLY — not after error
      needsFullRebuildRef.current = false
      lastSchrodingerConfigRef.current = { ...schrodingerConfig }
      lastPPConfigRef.current = { ...ppConfig }

      // Force-sync canvas pixel dimensions and graph/pool size after rebuild.
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

      console.log('[WebGPUScene] Passes initialized, graph compiled')
    }

    const setupTask = setupPasses().catch((err) => {
      console.error('[WebGPUScene] setupPasses task failed:', err)
      // Recovery: force full rebuild on next attempt
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
    environment.skyboxEnabled,
    environment.skyboxMode,
    appearance.colorAlgorithm,
    schroedingerIsoEnabled,
    schroedingerCompile.quantumMode,
    schroedingerCompile.termCount,
    schroedingerCompile.nodalEnabled,
    schroedingerCompile.phaseMaterialityEnabled,
    schroedingerCompile.interferenceEnabled,
    schroedingerCompile.uncertaintyBoundaryEnabled,
    schroedingerCompile.representation,
    performance_.temporalReprojectionEnabled,
    performance_.eigenfunctionCacheEnabled,
    performance_.analyticalGradientEnabled,
    performance_.robustEigenInterpolationEnabled,
  ])

  // Runtime scene clear-color update (avoids full pass rebuild for background color changes).
  useEffect(() => {
    console.warn(
      `[WebGPUScene] BG COLOR UPDATE: ${environment.backgroundColor}`,
      `\n  canvas: ${canvas?.width}×${canvas?.height}, client: ${canvas?.clientWidth}×${canvas?.clientHeight}`,
      `\n  context size: ${size.width}×${size.height}`,
      `\n  DPR: ${window.devicePixelRatio}`,
    )
    updateScenePassBackgroundColor({
      graph,
      skyboxEnabled: environment.skyboxEnabled,
      backgroundColor: environment.backgroundColor,
    })
  }, [graph, environment.skyboxEnabled, environment.backgroundColor])

  // Runtime CAS sharpening update (avoids full pass rebuild for render resolution changes).
  useEffect(() => {
    updateToScreenPassSharpness({
      graph,
      renderResolutionScale,
    })
  }, [graph, renderResolutionScale])

  // Update camera aspect ratio when canvas size changes
  useEffect(() => {
    if (cameraRef.current && size.width > 0 && size.height > 0) {
      cameraRef.current.setAspect(size.width / size.height)
    }
  }, [size.width, size.height])

  // Reset camera to top-down view when switching to 2D mode
  useEffect(() => {
    if (dimension === 2 && cameraRef.current) {
      // Top-down orthographic-like view: camera looking straight down Z axis
      cameraRef.current.setPosition(0, 0, 8)
      cameraRef.current.setTarget(0, 0, 0)
    }
  }, [dimension])

  // Set up store getters for uniform updates
  useEffect(() => {
    graph.setStoreGetter('appearance', () => useAppearanceStore.getState())
    graph.setStoreGetter('environment', () => useEnvironmentStore.getState())
    graph.setStoreGetter('lighting', () => useLightingStore.getState())
    graph.setStoreGetter('performance', () => usePerformanceStore.getState())
    graph.setStoreGetter('postProcessing', () => usePostProcessingStore.getState())
    // Camera: provide actual matrices from WebGPUCamera (not OrbitControls state)
    // IMPORTANT: Sync camera aspect with graph render dimensions every frame.
    // The React context `size` and graph dimensions can desync (post-rebuild, resize race).
    // The graph width/height are the authoritative render dimensions.
    graph.setStoreGetter('camera', () => {
      if (!cameraRef.current) return null
      // Sync aspect ratio with graph render dimensions (authoritative source of truth)
      const graphW = graph.getWidth()
      const graphH = graph.getHeight()
      if (graphW > 0 && graphH > 0) {
        cameraRef.current.setAspect(graphW / graphH)
      }
      const matrices = cameraRef.current.getMatrices()
      const cameraStoreCache = cameraStoreCacheRef.current
      cameraStoreCache.viewMatrix.elements.set(matrices.viewMatrix)
      cameraStoreCache.projectionMatrix.elements.set(matrices.projectionMatrix)
      cameraStoreCache.viewProjectionMatrix.elements.set(matrices.viewProjectionMatrix)
      cameraStoreCache.inverseViewMatrix.elements.set(matrices.inverseViewMatrix)
      cameraStoreCache.inverseProjectionMatrix.elements.set(matrices.inverseProjectionMatrix)
      cameraStoreCache.position.x = matrices.cameraPosition.x
      cameraStoreCache.position.y = matrices.cameraPosition.y
      cameraStoreCache.position.z = matrices.cameraPosition.z
      // Camera target for 2D pan/zoom model matrix derivation
      const cameraState = cameraRef.current.getState()
      cameraStoreCache.target.x = cameraState.target[0]
      cameraStoreCache.target.y = cameraState.target[1]
      cameraStoreCache.target.z = cameraState.target[2]
      cameraStoreCache.near = matrices.cameraNear
      cameraStoreCache.far = matrices.cameraFar
      cameraStoreCache.fov = matrices.fov
      return cameraStoreCache
    })
    graph.setStoreGetter('animation', () => useAnimationStore.getState())
    // Extended store with computed basis vectors for Schrodinger
    // Cache merged object and only rebuild when source store reference changes.
    graph.setStoreGetter('extended', () => {
      const state = useExtendedObjectStore.getState()
      if (objectType !== 'schroedinger') {
        return state
      }

      const extendedCache = extendedStoreCacheRef.current
      if (extendedCache.sourceState !== state || !extendedCache.mergedState) {
        extendedCache.sourceState = state
        extendedCache.mergedState = {
          ...state,
          schroedinger: {
            ...state.schroedinger,
            basisX: schroedingerBasisCacheRef.current.basisX,
            basisY: schroedingerBasisCacheRef.current.basisY,
            basisZ: schroedingerBasisCacheRef.current.basisZ,
          },
        }
      }

      return extendedCache.mergedState
    })
    graph.setStoreGetter('rotation', () => useRotationStore.getState())
    graph.setStoreGetter('transform', () => useTransformStore.getState())
    graph.setStoreGetter('pbr', () => usePBRStore.getState())
    graph.setStoreGetter('geometry', () => useGeometryStore.getState())
    // Buffer preview: maps UI toggle flags to pass configuration
    graph.setStoreGetter('bufferPreview', () => {
      const ui = useUIStore.getState()
      if (ui.showDepthBuffer)
        return {
          bufferType: 'depth' as const,
          bufferInput: 'depth-buffer',
          depthMode: 'linear' as const,
        }
      if (ui.showNormalBuffer)
        return { bufferType: 'normal' as const, bufferInput: 'normal-buffer' }
      if (ui.showTemporalDepthBuffer)
        return { bufferType: 'temporalDepth' as const, bufferInput: 'quarter-position' }
      return null
    })
  }, [graph, objectType])

  // Reusable Map for rotation updates (avoid allocating per frame)
  const rotationUpdatesRef = useRef<Map<string, number>>(new Map())

  const resetExportRuntime = useCallback((preserveAbortFlag = false) => {
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
      fractalAnimationLowQuality: true,
      renderResolutionScale: 1,
    }
    runtime.loop = createInitialExportLoopState()
  }, [])

  const restoreRuntimeState = useCallback(() => {
    const runtime = exportRuntimeRef.current

    const restoreWidth =
      runtime.originalCanvasWidth > 0 ? runtime.originalCanvasWidth : size.width
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
    perfStore.setFractalAnimationLowQuality(runtime.originalPerf.fractalAnimationLowQuality)
    perfStore.setRenderResolutionScale(runtime.originalPerf.renderResolutionScale)
    perfStore.setRefinementStage('final')

    runtime.rotationSnapshot = null
  }, [canvas, graph, size.height, size.width])

  const triggerSegmentDownload = useCallback(
    (blob: Blob, segmentIndex: number, format: ExportSettings['format']) => {
      const ext = format === 'webm' ? 'webm' : 'mp4'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `mdimension-${Date.now()}-part${segmentIndex}.${ext}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },
    []
  )

  const advanceSceneStateByDelta = useCallback(
    (deltaTime: number) => {
      const deltaTimeMs = deltaTime * 1000
      const animationState = useAnimationStore.getState()
      const { isPlaying, animatingPlanes, getRotationDelta, updateAccumulatedTime } = animationState

      if (isPlaying && deltaTimeMs > 0 && deltaTimeMs < 100) {
        updateAccumulatedTime(deltaTime)

        if (animatingPlanes.size > 0) {
          const rotationState = useRotationStore.getState()
          const rotationDelta = getRotationDelta(deltaTimeMs)
          const updates = rotationUpdatesRef.current
          updates.clear()

          const bias = useUIStore.getState().animationBias
          const planeList = getRotationPlanes(dimension)
          const totalPlanes = planeList.length

          for (const plane of animatingPlanes) {
            const planeIndex = planeList.findIndex(p => p.name === plane)
            const multiplier = bias > 0 && planeIndex >= 0
              ? getPlaneMultiplier(planeIndex, totalPlanes, bias)
              : 1.0
            const currentAngle = rotationState.rotations.get(plane) ?? 0
            updates.set(plane, currentAngle + rotationDelta * multiplier)
          }

          if (updates.size > 0) {
            rotationState.updateRotations(updates)
          }
        }
      }

      if (objectType === 'schroedinger') {
        const { basisX, basisY, basisZ, changed } = schroedingerRotation.getBasisVectors(false)
        if (changed) {
          schroedingerBasisCacheRef.current.basisX.set(basisX)
          schroedingerBasisCacheRef.current.basisY.set(basisY)
          schroedingerBasisCacheRef.current.basisZ.set(basisZ)
        }
      }
    },
    [objectType, dimension, schroedingerRotation]
  )

  const executeSceneFrame = useCallback(
    (deltaTime: number) => {
      // Per-frame size sync: ensure drawing buffer matches CSS layout before painting.
      // ResizeObserver can lag by one frame on sudden layout changes (e.g. dev-tools toggle),
      // causing the old buffer to be stretched into the new CSS rect. Catching it here
      // guarantees the buffer is correct before every paint.
      const cw = canvas.clientWidth
      const ch = canvas.clientHeight
      if (cw > 0 && ch > 0) {
        const renderScale = usePerformanceStore.getState().renderResolutionScale
        const dpr = window.devicePixelRatio * renderScale
        const targetW = Math.floor(cw * dpr)
        const targetH = Math.floor(ch * dpr)
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW
          canvas.height = targetH
          graph.setSize(targetW, targetH)
        }
      }

      const frameSize = {
        width: canvas.width > 0 ? canvas.width : size.width,
        height: canvas.height > 0 ? canvas.height : size.height,
      }

      const effectiveDpr =
        canvas.clientWidth > 0
          ? frameSize.width / canvas.clientWidth
          : typeof window !== 'undefined'
            ? window.devicePixelRatio
            : 1

      executeFrameAndCollectMetrics({
        graph,
        collector: statsCollectorRef.current,
        deltaTime,
        size: frameSize,
        dpr: effectiveDpr,
      })

      onFrame?.(deltaTime)
    },
    [canvas, graph, onFrame, size.height, size.width]
  )

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
    [resetExportRuntime, restoreRuntimeState]
  )

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
  }, [handleExportError, resetExportRuntime, restoreRuntimeState, triggerSegmentDownload])

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
  }, [resetExportRuntime, restoreRuntimeState])

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
            suggestedName: `mdimension-${Date.now()}${extension}`,
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
        fractalAnimationLowQuality: perfStore.fractalAnimationLowQuality,
        renderResolutionScale: perfStore.renderResolutionScale,
      }

      perfStore.setProgressiveRefinementEnabled(false)
      perfStore.setFractalAnimationLowQuality(false)
      perfStore.setRefinementStage('final')
      perfStore.setRenderResolutionScale(1)

      await waitForPaint()
      if (runtime.abortRequested) {
        restoreRuntimeState()
        resetExportRuntime()
        return
      }

      if (!Number.isFinite(settings.fps) || settings.fps <= 0) {
        throw new Error(`Invalid FPS: ${settings.fps}`)
      }
      if (!Number.isFinite(settings.duration) || settings.duration <= 0) {
        throw new Error(`Invalid duration: ${settings.duration}`)
      }
      if (!Number.isFinite(settings.bitrate) || settings.bitrate <= 0) {
        throw new Error(`Invalid bitrate: ${settings.bitrate}`)
      }

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
        const recorder = new VideoRecorder(canvas, {
          width: runtime.exportWidth,
          height: runtime.exportHeight,
          fps: settings.fps,
          duration: firstRecorderDuration,
          totalDuration: settings.duration,
          bitrate: settings.bitrate,
          format: settings.format,
          codec: settings.codec,
          onProgress: (progress) => {
            if (mode !== 'segmented') {
              useExportStore.getState().setProgress(progress)
            }
          },
          hardwareAcceleration: settings.hardwareAcceleration,
          bitrateMode: settings.bitrateMode,
          textOverlay: settings.textOverlay,
          crop: settings.crop,
          rotation: settings.rotation,
        })
        await recorder.initialize()
        runtime.recorder = recorder
      }

      runtime.started = true
    } catch (error) {
      await handleExportError(error)
    } finally {
      runtime.starting = false
    }
  }, [canvas, device, graph, handleExportError, resetExportRuntime, restoreRuntimeState, size.height, size.width])

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

            const previewRecorder = new VideoRecorder(canvas, {
              width: runtime.exportWidth,
              height: runtime.exportHeight,
              fps: settings.fps,
              duration: previewDuration,
              bitrate: settings.bitrate,
              format: settings.format,
              codec: settings.codec,
              hardwareAcceleration: settings.hardwareAcceleration,
              bitrateMode: settings.bitrateMode,
              textOverlay: settings.textOverlay,
              crop: settings.crop,
              rotation: settings.rotation,
            })
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

          const nextRecorder = new VideoRecorder(canvas, {
            width: runtime.exportWidth,
            height: runtime.exportHeight,
            fps: settings.fps,
            duration: nextSegmentFrames / settings.fps,
            totalDuration: settings.duration,
            bitrate: settings.bitrate,
            format: settings.format,
            codec: settings.codec,
            hardwareAcceleration: settings.hardwareAcceleration,
            bitrateMode: settings.bitrateMode,
            textOverlay: settings.textOverlay,
            crop: settings.crop,
            rotation: settings.rotation,
          })
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
  }, [advanceSceneStateByDelta, canvas, executeSceneFrame, finishExport, handleExportError, triggerSegmentDownload])

  // Animation loop
  const renderFrame = useCallback(() => {
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
    } else if (
      !exportStore.isExporting &&
      runtimeActive &&
      !runtime.canceling
    ) {
      void cancelExport()
    }

    if (runtimeActive) {
      if (runtime.started && !runtime.processing && !runtime.finishing && !runtime.canceling) {
        void processExportBatch()
      }
      animationFrameRef.current = requestAnimationFrame(renderFrame)
      return
    }

    const now = performance.now()
    const fpsDecision = evaluateFpsLimit({
      nowMs: now,
      throttleAnchorMs: fpsThrottleAnchorRef.current,
      maxFps: performance_.maxFps,
    })
    fpsThrottleAnchorRef.current = fpsDecision.nextThrottleAnchorMs

    if (!fpsDecision.shouldRender) {
      animationFrameRef.current = requestAnimationFrame(renderFrame)
      return
    }

    const deltaTime = (now - lastTimeRef.current) / 1000
    lastTimeRef.current = now

    advanceSceneStateByDelta(deltaTime)
    executeSceneFrame(deltaTime)

    animationFrameRef.current = requestAnimationFrame(renderFrame)
  }, [
    advanceSceneStateByDelta,
    cancelExport,
    executeSceneFrame,
    performance_.maxFps,
    processExportBatch,
    startExport,
  ])

  // Start/stop animation loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(renderFrame)
    const runtime = exportRuntimeRef.current

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      // Clear interaction debounce timer
      if (interactionTimerRef.current !== null) {
        window.clearTimeout(interactionTimerRef.current)
        interactionTimerRef.current = null
      }

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
    }
  }, [renderFrame, resetExportRuntime, restoreRuntimeState])

  // Render event capture overlay for camera controls
  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor: isDraggingRef.current ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseUp}
    />
  )
}

// ============================================================================
// Pass Setup
// ============================================================================

interface FrameMetricsArgs {
  graph: WebGPURenderGraph
  collector: WebGPUStatsCollector
  deltaTime: number
  size: { width: number; height: number }
  dpr: number
}

/**
 * Execute one render-graph frame and publish the resulting metrics to the
 * performance monitor store.
 */
export function executeFrameAndCollectMetrics({
  graph,
  collector,
  deltaTime,
  size,
  dpr,
}: FrameMetricsArgs): WebGPUFrameStats {
  const cpuStartMs = performance.now()
  const frameStats = graph.execute(deltaTime)
  const cpuTimeMs = performance.now() - cpuStartMs
  collector.recordFrame(cpuTimeMs, frameStats, graph, size, dpr)
  return frameStats
}

export interface PassConfig {
  objectType: ObjectType
  dimension: number
  bloomEnabled: boolean
  antiAliasingMethod: 'none' | 'fxaa' | 'smaa'
  // Paper texture overlay
  paperEnabled: boolean
  // Frame blending for smoother motion
  frameBlendingEnabled: boolean
  // Schrodinger isosurface mode (compile-time shader selection)
  isosurface: boolean
  quantumMode: 'harmonicOscillator' | 'hydrogenND' | 'freeScalarField' | 'tdseDynamics'
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  nodalEnabled: boolean
  phaseMaterialityEnabled: boolean
  interferenceEnabled: boolean
  uncertaintyBoundaryEnabled: boolean
  temporalReprojectionEnabled: boolean
  eigenfunctionCacheEnabled: boolean
  analyticalGradientEnabled: boolean
  robustEigenInterpolationEnabled: boolean
  renderResolutionScale?: number
  colorAlgorithm: PaletteColorAlgorithm
  // Wavefunction representation (compile-time: momentum mode uses density grid, wigner uses 2D pipeline)
  representation: 'position' | 'momentum' | 'wigner'
  // Skybox settings
  skyboxEnabled: boolean
  skyboxMode: SkyboxMode
  backgroundColor: string
}

// ============================================================================
// Selective Rebuild Types
// ============================================================================

/** Fields that require Schrodinger renderer rebuild when changed */
interface SchrodingerPassConfig {
  objectType: ObjectType
  dimension: number
  quantumMode: 'harmonicOscillator' | 'hydrogenND' | 'freeScalarField' | 'tdseDynamics'
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  colorAlgorithm: PaletteColorAlgorithm
  isosurface: boolean
  nodalEnabled: boolean
  phaseMaterialityEnabled: boolean
  interferenceEnabled: boolean
  uncertaintyBoundaryEnabled: boolean
  representation: 'position' | 'momentum' | 'wigner'
  eigenfunctionCacheEnabled: boolean
  analyticalGradientEnabled: boolean
  robustEigenInterpolationEnabled: boolean
  temporalReprojectionEnabled: boolean
}

/** Fields that require post-processing pass rebuild when changed */
interface PPPassConfig {
  bloomEnabled: boolean
  antiAliasingMethod: 'none' | 'fxaa' | 'smaa'
  paperEnabled: boolean
  frameBlendingEnabled: boolean
  skyboxEnabled: boolean
  skyboxMode: SkyboxMode
  temporalReprojectionEnabled: boolean
}

function normalizeColorAlgorithmForQuantumMode(
  quantumMode: PassConfig['quantumMode'],
  colorAlgorithm: PaletteColorAlgorithm
): PaletteColorAlgorithm {
  const isAvailable = getAvailableColorAlgorithms(quantumMode).some(
    (option) => option.value === colorAlgorithm
  )
  return isAvailable ? colorAlgorithm : 'diverging'
}

function extractSchrodingerConfig(config: PassConfig): SchrodingerPassConfig {
  const isFreeScalar = config.quantumMode === 'freeScalarField'
  const isTdse = config.quantumMode === 'tdseDynamics'
  // Both free scalar and TDSE use GPU compute pipelines with density grid output,
  // so they disable analytic-only features and force position representation.
  const isComputeMode = isFreeScalar || isTdse
  const normalizedColorAlgorithm = normalizeColorAlgorithmForQuantumMode(
    config.quantumMode,
    config.colorAlgorithm
  )
  return {
    objectType: config.objectType,
    // Compute modes force dimension >= 3 and disable features unsupported by their pipeline.
    // Normalize these values here so toggling them in the UI while in compute mode
    // does not trigger wasteful renderer rebuilds.
    dimension: isComputeMode ? Math.max(config.dimension, 3) : config.dimension,
    quantumMode: config.quantumMode,
    termCount: isComputeMode ? 1 : config.termCount,
    colorAlgorithm: normalizedColorAlgorithm,
    isosurface: config.isosurface,
    nodalEnabled: isComputeMode ? false : config.nodalEnabled,
    phaseMaterialityEnabled: isComputeMode ? false : config.phaseMaterialityEnabled,
    interferenceEnabled: isComputeMode ? false : config.interferenceEnabled,
    uncertaintyBoundaryEnabled: isComputeMode ? false : config.uncertaintyBoundaryEnabled,
    representation: isComputeMode ? 'position' : config.representation,
    eigenfunctionCacheEnabled: isComputeMode ? false : config.eigenfunctionCacheEnabled,
    analyticalGradientEnabled: isComputeMode ? false : config.analyticalGradientEnabled,
    robustEigenInterpolationEnabled: isComputeMode ? false : config.robustEigenInterpolationEnabled,
    temporalReprojectionEnabled: isComputeMode ? false : config.temporalReprojectionEnabled,
  }
}

function extractPPConfig(config: PassConfig): PPPassConfig {
  return {
    bloomEnabled: config.bloomEnabled,
    antiAliasingMethod: config.antiAliasingMethod,
    paperEnabled: config.paperEnabled,
    frameBlendingEnabled: config.frameBlendingEnabled,
    skyboxEnabled: config.skyboxEnabled,
    skyboxMode: config.skyboxMode,
    temporalReprojectionEnabled: config.temporalReprojectionEnabled,
  }
}

function shallowEqual<T extends object>(a: T | null, b: T): boolean {
  if (!a) return false
  const keys = Object.keys(b) as (keyof T)[]
  return keys.every((k) => a[k] === b[k])
}

/**
 * Free-scalar mode has a distinct rendering data path (lattice compute grid).
 * Warm-swapping between free-scalar and non-free-scalar keeps stale visuals visible
 * during async compilation, so these transitions should force a cold rebuild.
 */
export function shouldForceFullRebuildForQuantumModeTransition(
  previous: Pick<SchrodingerPassConfig, 'quantumMode'> | null,
  next: Pick<SchrodingerPassConfig, 'quantumMode'>
): boolean {
  if (!previous) return false
  if (previous.quantumMode === next.quantumMode) return false

  const computeModes = new Set(['freeScalarField', 'tdseDynamics'])
  return computeModes.has(previous.quantumMode) || computeModes.has(next.quantumMode)
}

interface ScenePassBackgroundColorUpdateArgs {
  graph: Pick<WebGPURenderGraph, 'getPass'>
  skyboxEnabled: boolean
  backgroundColor: string
}

interface ToScreenPassSharpnessUpdateArgs {
  graph: Pick<WebGPURenderGraph, 'getPass'>
  renderResolutionScale: number
}

/**
 * Compute CAS sharpening intensity from render resolution scale.
 *
 * Below 95% render scale, sharpening increases as scale decreases:
 * `min(0.7, (1 - scale) * 1.5)`.
 */
export function computeCasSharpnessFromRenderScale(renderResolutionScale: number): number {
  const normalizedScale = Number.isFinite(renderResolutionScale)
    ? Math.max(0, Math.min(1, renderResolutionScale))
    : 1

  if (normalizedScale >= 0.95) return 0

  return Math.min(0.7, (1 - normalizedScale) * 1.5)
}

/**
 * Update ScenePass clear color at runtime without rebuilding passes/pipelines.
 */
export function updateScenePassBackgroundColor({
  graph,
  skyboxEnabled,
  backgroundColor,
}: ScenePassBackgroundColorUpdateArgs): void {
  if (skyboxEnabled) return

  const scenePass = graph.getPass('scene')
  if (!(scenePass instanceof ScenePass)) return

  const backgroundLinear = parseHexColorToLinearRgb(backgroundColor, [0, 0, 0])
  scenePass.setClearColor({
    r: backgroundLinear[0],
    g: backgroundLinear[1],
    b: backgroundLinear[2],
    a: 1,
  })
}

/**
 * Update ToScreen CAS sharpness at runtime without rebuilding passes/pipelines.
 */
export function updateToScreenPassSharpness({
  graph,
  renderResolutionScale,
}: ToScreenPassSharpnessUpdateArgs): void {
  const toScreenPass = graph.getPass('toScreen')
  if (!(toScreenPass instanceof ToScreenPass)) return

  toScreenPass.setSharpness(computeCasSharpnessFromRenderScale(renderResolutionScale))
}

/**
 * Set up render passes for the WebGPU pipeline.
 *
 * Pass order:
 * 1. Object Renderer - Render main object to MRT (color, normal, depth/quarter buffers)
 * 2. Temporal Cloud Accumulation (optional) - Reconstruct full-res object-color from quarter-res
 * 3. ScenePass - Render environment/clear target
 * 4. EnvironmentCompositePass - Composite environment with main object
 * 5. BloomPass (optional) - Bloom effect
 * 6. FrameBlendingPass (optional) - Temporal smoothing
 * 7. ToneMappingCinematicPass - HDR→LDR + cinematic effects (vignette, aberration, grain)
 * 8. PaperTexturePass (optional) - Paper texture overlay
 * 9. FXAA/SMAAPass (optional) - Anti-aliasing
 * 10. ToScreenPass - Copy to canvas
 */
/** Safely add a pass -- logs and continues on failure instead of aborting the pipeline. */
async function safeAddPass(
  graph: WebGPURenderGraph,
  pass: WebGPURenderPass,
  label: string,
  shouldAbort?: () => boolean
): Promise<boolean> {
  if (shouldAbort?.()) return false

  const graphLike = graph as unknown as {
    getPass?: (id: string) => WebGPURenderPass | undefined
    removePass?: (id: string) => void
  }
  const getPass = typeof graphLike.getPass === 'function' ? graphLike.getPass.bind(graphLike) : null
  const removePass =
    typeof graphLike.removePass === 'function' ? graphLike.removePass.bind(graphLike) : null

  try {
    // Replace any existing pass with the same id to make setup deterministic.
    const existing = getPass?.(pass.id)
    if (existing && removePass) {
      removePass(pass.id)
      if (shouldAbort?.()) return false
    }

    await graph.addPass(pass)

    if (shouldAbort?.()) {
      if (getPass && removePass && getPass(pass.id) === pass) {
        removePass(pass.id)
      }
      return false
    }

    return getPass ? getPass(pass.id) === pass : true
  } catch (err) {
    console.error(`[WebGPU setupRenderPasses] Failed to add pass '${label}':`, err)
    return false
  }
}

/**
 * Register always-present GPU resources needed by both pass groups.
 * Called once on initial setup or after a full rebuild.
 */
function setupSharedResources(graph: WebGPURenderGraph, config: PassConfig): void {
  const useTemporalCloudAccumulation =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  graph.addResource('scene-render', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // Always include COPY_SRC to avoid resource recreation on temporal toggle
  graph.addResource('object-color', {
    type: 'texture',
    format: 'rgba16float',
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  })

  if (useTemporalCloudAccumulation) {
    graph.addResource('quarter-color', {
      type: 'texture',
      size: { mode: 'fraction', fraction: 0.5 },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    graph.addResource('quarter-position', {
      type: 'texture',
      size: { mode: 'fraction', fraction: 0.5 },
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
  }

  graph.addResource('hdr-color', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  graph.addResource('normal-buffer', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  graph.addResource('depth-buffer', {
    type: 'texture',
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  graph.addResource('ldr-color', {
    type: 'texture',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  graph.addResource('final-color', {
    type: 'texture',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })
}

/**
 * Set up Schrodinger-group passes: object renderer + temporal cloud accumulation.
 */
async function setupSchrodingerPasses(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  if (shouldAbort?.()) return

  const useTemporalCloudAccumulation =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  // 1. Object renderer
  const objectRenderer = createObjectRenderer(config.objectType, config)
  if (objectRenderer) {
    await safeAddPass(graph, objectRenderer, `object-renderer(${config.objectType})`, shouldAbort)
  }

  // 2. Temporal cloud accumulation (optional)
  if (useTemporalCloudAccumulation) {
    await safeAddPass(
      graph,
      new WebGPUTemporalCloudPass({
        quarterColorInput: 'quarter-color',
        quarterPositionInput: 'quarter-position',
        outputResource: 'object-color',
      }),
      'temporal-cloud',
      shouldAbort
    )
  }
}

/**
 * Warm swap: pre-initialize Schrodinger passes while old passes keep rendering,
 * then atomically swap them in. Eliminates visible freeze during shader compilation.
 */
async function warmSwapSchrodingerPasses(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  if (shouldAbort?.()) return

  const setupCtx = graph.getSetupContext()
  if (!setupCtx) {
    // Fallback to cold swap if setup context unavailable
    await setupSchrodingerPasses(graph, config, shouldAbort)
    return
  }

  const useTemporalCloudAccumulation =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  // 1. Create new passes (fast — just constructors)
  const newRenderer = createObjectRenderer(config.objectType, config)
  const newTemporalPass = useTemporalCloudAccumulation
    ? new WebGPUTemporalCloudPass({
        quarterColorInput: 'quarter-color',
        quarterPositionInput: 'quarter-position',
        outputResource: 'object-color',
      })
    : null

  // 2. Initialize passes in background (SLOW: shader compilation happens here).
  //    The old passes remain in the graph and keep rendering during this await.
  try {
    if (newRenderer) {
      console.log('[WebGPU warmSwap] Initializing new renderer for dim:', config.dimension)
      await newRenderer.initialize(setupCtx)
      if (shouldAbort?.()) {
        newRenderer.dispose()
        newTemporalPass?.dispose()
        return
      }
    }
    if (newTemporalPass) {
      await newTemporalPass.initialize(setupCtx)
      if (shouldAbort?.()) {
        newRenderer?.dispose()
        newTemporalPass.dispose()
        return
      }
    }
  } catch (err) {
    console.error('[WebGPU warmSwap] Pass pre-initialization failed:', err)
    newRenderer?.dispose()
    newTemporalPass?.dispose()
    throw err
  }

  // 3. Atomic swap: remove old, insert new (fast — no compilation)
  if (newRenderer) {
    graph.addInitializedPass(newRenderer)
    console.log('[WebGPU warmSwap] Swap complete for dim:', config.dimension)
  }
  if (newTemporalPass) {
    graph.addInitializedPass(newTemporalPass)
  }
}

/**
 * Set up post-processing passes: skybox/scene, environment composite, bloom,
 * frame blending, tonemapping, paper, AA, to-screen, buffer preview.
 */
async function setupPPPasses(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  if (shouldAbort?.()) return

  const useTemporalCloudAccumulation =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled
  const backgroundLinear = parseHexColorToLinearRgb(config.backgroundColor, [0, 0, 0])

  // 3. Skybox or scene clear pass
  if (config.skyboxEnabled) {
    await safeAddPass(
      graph,
      new WebGPUSkyboxRenderer({
        mode: config.skyboxMode,
        sun: false,
        vignette: false,
      }),
      'skybox',
      shouldAbort
    )
  } else {
    await safeAddPass(
      graph,
      new ScenePass({
        outputResource: 'scene-render',
        depthResource: 'depth-buffer',
        mode: 'clear',
        clearColor: {
          r: backgroundLinear[0],
          g: backgroundLinear[1],
          b: backgroundLinear[2],
          a: 1,
        },
      }),
      'scene-pass',
      shouldAbort
    )
  }

  // 4. Environment composite
  await safeAddPass(
    graph,
    new EnvironmentCompositePass({
      lensedEnvironmentInput: 'scene-render',
      mainObjectInput: 'object-color',
      mainObjectDepthInput: 'depth-buffer',
      outputResource: 'hdr-color',
    }),
    'environment-composite',
    shouldAbort
  )

  // Track HDR buffer chain through optional passes
  let currentHDRBuffer = 'hdr-color'

  // 5. Bloom (optional)
  if (config.bloomEnabled) {
    graph.addResource('bloom-output', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    const ok = await safeAddPass(
      graph,
      new BloomPass({
        inputResource: currentHDRBuffer,
        bloomInputResource: 'object-color',
        outputResource: 'bloom-output',
      }),
      'bloom',
      shouldAbort
    )
    if (ok) currentHDRBuffer = 'bloom-output'
  }

  // 6. Frame Blending (optional)
  if (config.frameBlendingEnabled) {
    graph.addResource('frame-blend-output', {
      type: 'texture',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    })

    const ok = await safeAddPass(
      graph,
      new FrameBlendingPass({
        colorInput: currentHDRBuffer,
        outputResource: 'frame-blend-output',
        blendFactor: 0.15,
      }),
      'frame-blending',
      shouldAbort
    )
    if (ok) currentHDRBuffer = 'frame-blend-output'
  }

  // 7. Tone mapping + cinematic (always required)
  await safeAddPass(
    graph,
    new ToneMappingCinematicPass({
      colorInput: currentHDRBuffer,
      outputResource: 'ldr-color',
    }),
    'tonemapping-cinematic',
    shouldAbort
  )

  let currentLDRBuffer = 'ldr-color'

  // 8. Paper Texture (optional)
  if (config.paperEnabled) {
    graph.addResource('paper-output', {
      type: 'texture',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    const ok = await safeAddPass(
      graph,
      new PaperTexturePass({
        colorInput: currentLDRBuffer,
        outputResource: 'paper-output',
      }),
      'paper-texture',
      shouldAbort
    )
    if (ok) currentLDRBuffer = 'paper-output'
  }

  // 9. Anti-aliasing (optional)
  if (config.antiAliasingMethod === 'fxaa') {
    const ok = await safeAddPass(
      graph,
      new FXAAPass({
        colorInput: currentLDRBuffer,
        outputResource: 'final-color',
        subpixelQuality: 0.75,
      }),
      'fxaa',
      shouldAbort
    )
    if (ok) currentLDRBuffer = 'final-color'
  } else if (config.antiAliasingMethod === 'smaa') {
    const ok = await safeAddPass(
      graph,
      new SMAAPass({
        colorInput: currentLDRBuffer,
        outputResource: 'final-color',
        threshold: 0.1,
        maxSearchSteps: 16,
      }),
      'smaa',
      shouldAbort
    )
    if (ok) currentLDRBuffer = 'final-color'
  }

  // 10. Copy to screen (always required)
  await safeAddPass(
    graph,
    new ToScreenPass({
      inputResource: currentLDRBuffer,
      gammaCorrection: true,
      sharpness: computeCasSharpnessFromRenderScale(config.renderResolutionScale ?? 1),
    }),
    'to-screen',
    shouldAbort
  )

  // 11. Buffer preview (debug visualization)
  const bufferPreviewInputs = ['depth-buffer', 'normal-buffer']
  if (useTemporalCloudAccumulation) {
    bufferPreviewInputs.push('quarter-position')
  }
  await safeAddPass(
    graph,
    new BufferPreviewPass({
      bufferInput: 'depth-buffer',
      additionalInputs: bufferPreviewInputs.slice(1),
      bufferType: 'depth',
      depthMode: 'linear',
    }),
    'buffer-preview',
    shouldAbort
  )
}

/** Remove Schrodinger-group passes that should no longer exist */
function cleanupSchrodingerPasses(graph: WebGPURenderGraph, config: PassConfig): void {
  if (!config.temporalReprojectionEnabled) {
    if (graph.getPass('temporal-cloud')) graph.removePass('temporal-cloud')
  }
}

/** Remove PP-group passes and resources that should no longer exist */
function cleanupPPPasses(graph: WebGPURenderGraph, config: PassConfig): void {
  if (!config.bloomEnabled) {
    if (graph.getPass('bloom')) graph.removePass('bloom')
    graph.removeResource('bloom-output')
  }
  if (!config.frameBlendingEnabled) {
    if (graph.getPass('frame-blending')) graph.removePass('frame-blending')
    graph.removeResource('frame-blend-output')
  }
  if (!config.paperEnabled) {
    if (graph.getPass('paper-texture')) graph.removePass('paper-texture')
    graph.removeResource('paper-output')
  }
  if (config.antiAliasingMethod !== 'fxaa' && graph.getPass('fxaa')) {
    graph.removePass('fxaa')
  }
  if (config.antiAliasingMethod !== 'smaa' && graph.getPass('smaa')) {
    graph.removePass('smaa')
  }
  if (config.skyboxEnabled && graph.getPass('scene')) {
    graph.removePass('scene')
  }
  if (!config.skyboxEnabled && graph.getPass('skybox')) {
    graph.removePass('skybox')
  }
}

/**
 * Pre-swap phase: only ADD temporal resources if the new config requires them.
 * Safe to call before warm swap — old passes don't reference new resources.
 * Never removes resources here, because old passes may still be rendering
 * to them during the warm swap await.
 */
function ensureTemporalResources(graph: WebGPURenderGraph, config: PassConfig): void {
  const needsTemporal =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  if (needsTemporal) {
    graph.addResource('quarter-color', {
      type: 'texture',
      size: { mode: 'fraction', fraction: 0.5 },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    graph.addResource('quarter-position', {
      type: 'texture',
      size: { mode: 'fraction', fraction: 0.5 },
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
  }
}

/**
 * Post-swap phase: remove temporal resources if no longer needed.
 * Only call AFTER the new pass has been swapped in, so no pass
 * references the removed resources.
 */
function removeStaleTemporalResources(graph: WebGPURenderGraph, config: PassConfig): void {
  const needsTemporal =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  if (!needsTemporal) {
    graph.removeResource('quarter-color')
    graph.removeResource('quarter-position')
  }
}

/**
 * Set up render passes for the WebGPU pipeline.
 *
 * Pass order:
 * 1. Object Renderer - Render main object to MRT (color, normal, depth/quarter buffers)
 * 2. Temporal Cloud Accumulation (optional) - Reconstruct full-res object-color from quarter-res
 * 3. ScenePass - Render environment/clear target
 * 4. EnvironmentCompositePass - Composite environment with main object
 * 5. BloomPass (optional) - Bloom effect
 * 6. FrameBlendingPass (optional) - Temporal smoothing
 * 7. ToneMappingCinematicPass - HDR→LDR + cinematic effects (vignette, aberration, grain)
 * 8. PaperTexturePass (optional) - Paper texture overlay
 * 9. FXAA/SMAAPass (optional) - Anti-aliasing
 * 10. ToScreenPass - Copy to canvas
 */
export async function setupRenderPasses(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  if (shouldAbort?.()) return

  setupSharedResources(graph, config)
  if (shouldAbort?.()) return

  await setupSchrodingerPasses(graph, config, shouldAbort)
  if (shouldAbort?.()) return

  await setupPPPasses(graph, config, shouldAbort)
}

/**
 * Create the appropriate object renderer based on object type.
 *
 * Only Schroedinger is supported. For any other object type, a warning
 * is logged and null is returned.
 *
 * @param objectType - The type of object to render
 * @param config - Pass configuration including shader feature flags from stores
 * @returns The Schroedinger renderer pass or null if not supported
 */
export function createObjectRenderer(objectType: ObjectType, config: PassConfig) {
  const {
    dimension,
    isosurface,
    quantumMode,
    termCount,
    nodalEnabled,
    phaseMaterialityEnabled,
    interferenceEnabled,
    uncertaintyBoundaryEnabled,
  } = config
  const normalizedColorAlgorithm = normalizeColorAlgorithmForQuantumMode(
    quantumMode,
    config.colorAlgorithm
  )
  const colorAlgorithm = COLOR_ALGORITHM_TO_INT[normalizedColorAlgorithm] as
    | WGSLColorAlgorithm
    | undefined
  const useTemporalCloudAccumulation =
    objectType === 'schroedinger' && config.temporalReprojectionEnabled

  switch (objectType) {
    case 'schroedinger':
      // SchrodingerRendererConfig: dimension, isosurface, quantumMode, termCount, temporal
      // Note: Schrodinger uses volume rendering, not PBR
      return new WebGPUSchrodingerRenderer({
        dimension,
        isosurface,
        quantumMode,
        termCount,
        colorAlgorithm,
        nodalEnabled,
        phaseMaterialityEnabled,
        interferenceEnabled,
        uncertaintyBoundaryEnabled,
        temporal: useTemporalCloudAccumulation,
        eigenfunctionCacheEnabled: config.eigenfunctionCacheEnabled,
        analyticalGradientEnabled: config.analyticalGradientEnabled,
        robustEigenInterpolationEnabled: config.robustEigenInterpolationEnabled,
        representation: config.representation,
      })

    default:
      console.warn(
        `WebGPU: No renderer for object type '${objectType}', only 'schroedinger' is supported`
      )
      return null
  }
}

export default WebGPUScene
