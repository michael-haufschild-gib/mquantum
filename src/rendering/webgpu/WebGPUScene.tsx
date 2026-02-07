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
import { COLOR_ALGORITHM_TO_INT, type ColorAlgorithm as PaletteColorAlgorithm } from '@/rendering/shaders/palette/types'
import type { ColorAlgorithm as WGSLColorAlgorithm } from './shaders/types'

// Rotation hooks for Schroedinger basis vectors
import { useRotationUpdates } from '@/rendering/renderers/base'

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

const schroedingerCompileSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) => ({
  quantumMode: state.schroedinger?.quantumMode ?? 'harmonicOscillator',
  termCount: (state.schroedinger?.termCount ?? 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
  nodalEnabled: state.schroedinger?.nodalEnabled ?? false,
  dispersionEnabled: state.schroedinger?.dispersionEnabled ?? false,
  phaseMaterialityEnabled: state.schroedinger?.phaseMaterialityEnabled ?? false,
  interferenceEnabled: state.schroedinger?.interferenceEnabled ?? false,
  representation: (state.schroedinger?.representation ?? 'position') as 'position' | 'momentum',
})

// Schrodinger selector for rotation updates (like WebGL SchroedingerMesh.tsx line 108)
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
  const animationFrameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(performance.now())
  const currentObjectTypeRef = useRef<ObjectType | null>(null)
  const setupGenerationRef = useRef(0)
  const setupTaskRef = useRef<Promise<void>>(Promise.resolve())
  const statsCollectorRef = useRef<WebGPUStatsCollector>(new WebGPUStatsCollector())

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

  // Camera control state
  const isDraggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const overlayRef = useRef<HTMLDivElement>(null)

  // Camera control handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true
    lastMouseRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !cameraRef.current) return

    const dx = e.clientX - lastMouseRef.current.x
    const dy = e.clientY - lastMouseRef.current.y
    lastMouseRef.current = { x: e.clientX, y: e.clientY }

    // Orbit sensitivity
    const sensitivity = 0.005
    cameraRef.current.orbit(-dx * sensitivity, -dy * sensitivity)
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
    }

    overlay.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      overlay.removeEventListener('wheel', handleWheel)
    }
  }, [])

  // Initialize collector with adapter metadata for GPU name.
  useEffect(() => {
    const collector = statsCollectorRef.current
    collector.initialize(device.getAdapter())

    return () => {
      collector.reset()
    }
  }, [device])

  // Store subscriptions with shallow comparison
  const appearance = useAppearanceStore(useShallow(appearanceSelector))
  const environment = useEnvironmentStore(useShallow(environmentSelector))
  const performance_ = usePerformanceStore(useShallow(performanceSelector))
  const postProcessing = usePostProcessingStore(useShallow(postProcessingSelector))
  // Schroedinger isosurface flag (compile-time shader selection, triggers renderer recreation)
  const schroedingerIsoEnabled = useExtendedObjectStore(schroedingerIsoSelector)
  const schroedingerCompile = useExtendedObjectStore(useShallow(schroedingerCompileSelector))
  // Schroedinger parameterValues for rotation updates (like WebGL SchroedingerMesh.tsx line 108)
  const schroedingerParamValues = useExtendedObjectStore(schroedingerSelector)

  // Animation state
  const isPlaying = useAnimationStore((state) => state.isPlaying)

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

  // Initialize passes - rebuild when dependencies change
  useEffect(() => {
    let cancelled = false
    const setupGeneration = ++setupGenerationRef.current
    const shouldAbortSetup = () =>
      cancelled || setupGeneration !== setupGenerationRef.current
    const previousSetupTask = setupTaskRef.current

    const setupPasses = async () => {
      // Serialize async pass setup to prevent stale setup races creating duplicate passes.
      await previousSetupTask
      if (shouldAbortSetup()) return

      // Always clear existing passes before setting up new ones
      // This ensures no duplicate passes when dependencies change
      graph.clearPasses()
      if (shouldAbortSetup()) return

      currentObjectTypeRef.current = objectType

      console.log('[WebGPUScene] Setting up render passes for:', objectType)

      // Signal the shader compilation overlay before any GPU work.
      // waitForPaint() guarantees the overlay is rendered to screen
      // before createShaderModule() blocks the main thread.
      const perfStore = usePerformanceStore.getState()
      perfStore.setShaderCompiling('pipeline', true)

      await waitForPaint()
      if (shouldAbortSetup()) {
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        graph.clearPasses()
        return
      }

      try {
        await setupRenderPasses(graph, {
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
          dispersionEnabled: schroedingerCompile.dispersionEnabled,
          phaseMaterialityEnabled: schroedingerCompile.phaseMaterialityEnabled,
          interferenceEnabled: schroedingerCompile.interferenceEnabled,
          temporalReprojectionEnabled: performance_.temporalReprojectionEnabled,
          eigenfunctionCacheEnabled: performance_.eigenfunctionCacheEnabled,
          colorAlgorithm: appearance.colorAlgorithm,
          representation: schroedingerCompile.representation,
          // Skybox settings
          skyboxEnabled: environment.skyboxEnabled,
          skyboxMode: environment.skyboxMode as SkyboxMode,
          backgroundColor: environment.backgroundColor,
        }, shouldAbortSetup)
      } catch (err) {
        console.error('[WebGPUScene] CRITICAL: setupRenderPasses failed:', err)
      } finally {
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
      }

      if (shouldAbortSetup()) {
        // Drop stale partial setup before the next serialized setup starts.
        graph.clearPasses()
        return
      }

      // Compile the graph
      graph.compile()

      console.log('[WebGPUScene] Passes initialized, graph compiled')
    }

    const setupTask = setupPasses().catch((err) => {
      console.error('[WebGPUScene] setupPasses task failed:', err)
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
    environment.backgroundColor,
    appearance.colorAlgorithm,
    schroedingerIsoEnabled,
    schroedingerCompile.quantumMode,
    schroedingerCompile.termCount,
    schroedingerCompile.nodalEnabled,
    schroedingerCompile.dispersionEnabled,
    schroedingerCompile.phaseMaterialityEnabled,
    schroedingerCompile.interferenceEnabled,
    schroedingerCompile.representation,
    performance_.temporalReprojectionEnabled,
    performance_.eigenfunctionCacheEnabled,
  ])

  // Update camera aspect ratio when canvas size changes
  useEffect(() => {
    if (cameraRef.current && size.width > 0 && size.height > 0) {
      cameraRef.current.setAspect(size.width / size.height)
    }
  }, [size.width, size.height])

  // Set up store getters for uniform updates
  useEffect(() => {
    graph.setStoreGetter('appearance', () => useAppearanceStore.getState())
    graph.setStoreGetter('environment', () => useEnvironmentStore.getState())
    graph.setStoreGetter('lighting', () => useLightingStore.getState())
    graph.setStoreGetter('performance', () => usePerformanceStore.getState())
    graph.setStoreGetter('postProcessing', () => usePostProcessingStore.getState())
    // Camera: provide actual matrices from WebGPUCamera (not OrbitControls state)
    graph.setStoreGetter('camera', () => {
      if (!cameraRef.current) return null
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
      if (ui.showDepthBuffer) return { bufferType: 'depth' as const, bufferInput: 'depth-buffer', depthMode: 'linear' as const }
      if (ui.showNormalBuffer) return { bufferType: 'normal' as const, bufferInput: 'normal-buffer' }
      if (ui.showTemporalDepthBuffer) return { bufferType: 'temporalDepth' as const, bufferInput: 'quarter-position' }
      return null
    })
  }, [graph, objectType])

  // Reusable Map for rotation updates (avoid allocating per frame)
  const rotationUpdatesRef = useRef<Map<string, number>>(new Map())

  // Animation loop
  const renderFrame = useCallback(() => {
    const now = performance.now()
    const targetFrameIntervalMs = performance_.maxFps > 0 ? 1000 / performance_.maxFps : 0
    const elapsedMs = now - lastTimeRef.current

    if (targetFrameIntervalMs > 0 && elapsedMs < targetFrameIntervalMs) {
      animationFrameRef.current = requestAnimationFrame(renderFrame)
      return
    }

    const deltaTime = elapsedMs / 1000 // Convert to seconds
    lastTimeRef.current = now
    const deltaTimeMs = deltaTime * 1000

    // Update rotation animation (matches WebGL useAnimationLoop)
    if (isPlaying && deltaTimeMs > 0 && deltaTimeMs < 100) {
      const animState = useAnimationStore.getState()
      const { animatingPlanes, getRotationDelta, updateAccumulatedTime } = animState
      updateAccumulatedTime(deltaTime)

      if (animatingPlanes.size > 0) {
        const rotationState = useRotationStore.getState()
        const rotationDelta = getRotationDelta(deltaTimeMs)
        const updates = rotationUpdatesRef.current
        updates.clear()

        for (const plane of animatingPlanes) {
          const currentAngle = rotationState.rotations.get(plane) ?? 0
          updates.set(plane, currentAngle + rotationDelta)
        }

        if (updates.size > 0) {
          rotationState.updateRotations(updates)
        }
      }
    }

    // Update Schrodinger basis vectors from rotation store (matches WebGL SchroedingerMesh.tsx line 912)
    // Only do this for schroedinger object type to avoid unnecessary computation
    if (objectType === 'schroedinger') {
      // getBasisVectors uses internal version tracking - passing false is fine,
      // it will still detect actual rotation changes via version numbers
      const { basisX, basisY, basisZ, changed } = schroedingerRotation.getBasisVectors(false)
      if (changed) {
        // Copy to cached arrays (basisX/Y/Z are pre-allocated working arrays from the hook)
        schroedingerBasisCacheRef.current.basisX.set(basisX)
        schroedingerBasisCacheRef.current.basisY.set(basisY)
        schroedingerBasisCacheRef.current.basisZ.set(basisZ)
      }
    }

    // Execute render graph and publish performance metrics to the monitor store.
    const effectiveDpr =
      canvas.clientWidth > 0
        ? size.width / canvas.clientWidth
        : typeof window !== 'undefined'
          ? window.devicePixelRatio
          : 1

    executeFrameAndCollectMetrics({
      graph,
      collector: statsCollectorRef.current,
      deltaTime,
      size,
      dpr: effectiveDpr,
    })

    onFrame?.(deltaTime)

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(renderFrame)
  }, [
    canvas,
    graph,
    isPlaying,
    objectType,
    onFrame,
    performance_.maxFps,
    schroedingerRotation,
    size,
  ])

  // Start/stop animation loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(renderFrame)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [renderFrame])

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
  quantumMode: 'harmonicOscillator' | 'hydrogenND'
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  nodalEnabled: boolean
  dispersionEnabled: boolean
  phaseMaterialityEnabled: boolean
  interferenceEnabled: boolean
  temporalReprojectionEnabled: boolean
  eigenfunctionCacheEnabled: boolean
  colorAlgorithm: PaletteColorAlgorithm
  // Wavefunction representation (compile-time: momentum mode uses density grid)
  representation: 'position' | 'momentum'
  // Skybox settings
  skyboxEnabled: boolean
  skyboxMode: SkyboxMode
  backgroundColor: string
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

export async function setupRenderPasses(
  graph: WebGPURenderGraph,
  config: PassConfig,
  shouldAbort?: () => boolean
): Promise<void> {
  if (shouldAbort?.()) return

  const useTemporalCloudAccumulation =
    config.objectType === 'schroedinger' &&
    config.temporalReprojectionEnabled &&
    !config.isosurface

  const backgroundLinear = parseHexColorToLinearRgb(config.backgroundColor, [0, 0, 0])

  // ============================================================================
  // Define Resources
  // ============================================================================

  // Initial scene render (before post-processing)
  graph.addResource('scene-render', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // Object render buffer (Schroedinger output, composited over environment)
  graph.addResource('object-color', {
    type: 'texture',
    format: 'rgba16float',
    // COPY_SRC needed when temporal cloud accumulation is enabled
    // (reconstructed output is copied to the internal history buffer).
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      (useTemporalCloudAccumulation ? GPUTextureUsage.COPY_SRC : 0),
  })

  // Quarter-resolution temporal resources for Schrödinger volumetric accumulation
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

  // Final HDR buffer (TonemappingPass reads from this)
  graph.addResource('hdr-color', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // Normal buffer for screen-space effects
  graph.addResource('normal-buffer', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // Depth buffer
  graph.addResource('depth-buffer', {
    type: 'texture',
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // TonemappingPass expects this output name (LDR buffer)
  graph.addResource('ldr-color', {
    type: 'texture',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // Final color buffer (after anti-aliasing)
  graph.addResource('final-color', {
    type: 'texture',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // Intermediate buffers for HDR post-processing chain
  // We use hdr-color-a and hdr-color-b for ping-pong when multiple HDR effects are enabled
  let currentHDRBuffer = 'hdr-color'

  // ============================================================================
  // Add Passes in Execution Order
  // ============================================================================

  // 1. Object renderer - Schroedinger only
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

  // 3. Skybox or scene clear pass - outputs to scene-render buffer
  if (config.skyboxEnabled) {
    // Skybox renderer clears scene-render + depth-buffer and renders procedural skybox
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
    // No skybox: clear the scene-render buffer to the configured background color
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

  // 4. Environment composite - composites object over environment, outputs to hdr-color
  await safeAddPass(
    graph,
    new EnvironmentCompositePass({
      lensedEnvironmentInput: 'scene-render',
      mainObjectInput: 'object-color', // Read from object renderer output
      mainObjectDepthInput: 'depth-buffer',
      outputResource: 'hdr-color',
    }),
    'environment-composite',
    shouldAbort
  )

  // 6. Bloom (optional) - multi-scale MIP pyramid matching UnrealBloomPass
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
        outputResource: 'bloom-output',
      }),
      'bloom',
      shouldAbort
    )

    if (ok) currentHDRBuffer = 'bloom-output'
  }

  // 7. Frame Blending (optional) - temporal smoothing
  if (config.frameBlendingEnabled) {
    graph.addResource('frame-blend-output', {
      type: 'texture',
      format: 'rgba16float',
      // COPY_SRC needed for FrameBlendingPass to copy output to history buffer
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

  // 9. Tone mapping + cinematic (CRITICAL -- always required)
  // Combined pass: HDR→LDR conversion + chromatic aberration, vignette, film grain.
  // Cinematic effects are controlled via store values (0 = disabled).
  await safeAddPass(
    graph,
    new ToneMappingCinematicPass({
      colorInput: currentHDRBuffer,
      outputResource: 'ldr-color',
    }),
    'tonemapping-cinematic',
    shouldAbort
  )

  // Track current LDR buffer for post-tonemapping effects
  let currentLDRBuffer = 'ldr-color'

  // 11. Paper Texture (optional) - paper/parchment overlay effect
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

  // 12. Anti-aliasing (optional) - FXAA or SMAA
  // Reads from currentLDRBuffer (after cinematic/paper) to match WebGL pass ordering
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

  // 13. Copy to screen (CRITICAL -- always required)
  // Use currentLDRBuffer which tracks the last active pass in the chain
  const finalInput = currentLDRBuffer

  await safeAddPass(
    graph,
    new ToScreenPass({
      inputResource: finalInput,
      gammaCorrection: true,
    }),
    'to-screen',
    shouldAbort
  )

  // 14. Buffer preview (debug visualization, renders directly to canvas)
  // Always added — acts as no-op when no preview toggle is active.
  // Reads from depth-buffer, normal-buffer, or quarter-position depending on store flags.
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
    dispersionEnabled,
    phaseMaterialityEnabled,
    interferenceEnabled,
  } = config
  const colorAlgorithm = COLOR_ALGORITHM_TO_INT[config.colorAlgorithm] as WGSLColorAlgorithm | undefined
  const useTemporalCloudAccumulation =
    objectType === 'schroedinger' &&
    config.temporalReprojectionEnabled &&
    !isosurface

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
        dispersionEnabled,
        phaseMaterialityEnabled,
        interferenceEnabled,
        temporal: useTemporalCloudAccumulation,
        eigenfunctionCacheEnabled: config.eigenfunctionCacheEnabled,
        representation: config.representation,
      })

    default:
      console.warn(`WebGPU: No renderer for object type '${objectType}', only 'schroedinger' is supported`)
      return null
  }
}

export default WebGPUScene
