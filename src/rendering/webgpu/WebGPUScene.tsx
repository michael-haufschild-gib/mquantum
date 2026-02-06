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

// Passes (import as needed for the pipeline)
import { ScenePass } from './passes/ScenePass'
import { BloomPass } from './passes/BloomPass'
import { TonemappingPass } from './passes/TonemappingPass'
import { FXAAPass } from './passes/FXAAPass'
import { SMAAPass } from './passes/SMAAPass'
import { ToScreenPass } from './passes/ToScreenPass'
import { EnvironmentCompositePass } from './passes/EnvironmentCompositePass'
import { GTAOPass } from './passes/GTAOPass'
import { BokehPass } from './passes/BokehPass'
import { PaperTexturePass } from './passes/PaperTexturePass'
import { FrameBlendingPass } from './passes/FrameBlendingPass'
import { CinematicPass } from './passes/CinematicPass'
import { WebGPUTemporalCloudPass } from './passes/WebGPUTemporalCloudPass'

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
})

const performanceSelector = (state: ReturnType<typeof usePerformanceStore.getState>) => ({
  maxFps: state.maxFps,
  temporalReprojectionEnabled: state.temporalReprojectionEnabled,
})

const postProcessingSelector = (state: ReturnType<typeof usePostProcessingStore.getState>) => ({
  bloomEnabled: state.bloomEnabled,
  ssaoEnabled: state.ssaoEnabled,
  antiAliasingMethod: state.antiAliasingMethod,
  // Depth of field
  bokehEnabled: state.bokehEnabled,
  // Paper texture
  paperEnabled: state.paperEnabled,
  // Frame blending
  frameBlendingEnabled: state.frameBlendingEnabled,
  // Cinematic
  cinematicEnabled: state.cinematicEnabled,
})

// Schrodinger isosurface selector (compile-time shader flag, triggers renderer recreation)
const schroedingerIsoSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) =>
  state.schroedinger?.isoEnabled ?? false

const schroedingerCompileSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) => ({
  quantumMode: state.schroedinger?.quantumMode ?? 'harmonicOscillator',
  termCount: (state.schroedinger?.termCount ?? 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
  useDensityGrid: state.schroedinger?.useDensityGrid ?? false,
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

      try {
        await setupRenderPasses(graph, {
          objectType,
          dimension,
          bloomEnabled: postProcessing.bloomEnabled,
          ssaoEnabled: postProcessing.ssaoEnabled,
          antiAliasingMethod: postProcessing.antiAliasingMethod,
          bokehEnabled: postProcessing.bokehEnabled,
          paperEnabled: postProcessing.paperEnabled,
          frameBlendingEnabled: postProcessing.frameBlendingEnabled,
          cinematicEnabled: postProcessing.cinematicEnabled,
          isosurface: schroedingerIsoEnabled,
          quantumMode: schroedingerCompile.quantumMode,
          termCount: schroedingerCompile.termCount,
          useDensityGrid: schroedingerCompile.useDensityGrid,
          temporalReprojectionEnabled: performance_.temporalReprojectionEnabled,
          colorAlgorithm: appearance.colorAlgorithm,
          // Skybox settings
          skyboxEnabled: environment.skyboxEnabled,
          skyboxMode: environment.skyboxMode as SkyboxMode,
        }, shouldAbortSetup)
      } catch (err) {
        console.error('[WebGPUScene] CRITICAL: setupRenderPasses failed:', err)
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
    postProcessing.ssaoEnabled,
    postProcessing.antiAliasingMethod,
    postProcessing.bokehEnabled,
    postProcessing.paperEnabled,
    postProcessing.frameBlendingEnabled,
    postProcessing.cinematicEnabled,
    environment.skyboxEnabled,
    appearance.colorAlgorithm,
    schroedingerIsoEnabled,
    schroedingerCompile.quantumMode,
    schroedingerCompile.termCount,
    schroedingerCompile.useDensityGrid,
    performance_.temporalReprojectionEnabled,
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

      if (animatingPlanes.size > 0) {
        const rotationState = useRotationStore.getState()
        updateAccumulatedTime(deltaTime)

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
  ssaoEnabled: boolean
  antiAliasingMethod: 'none' | 'fxaa' | 'smaa'
  // Depth of field
  bokehEnabled: boolean
  // Paper texture overlay
  paperEnabled: boolean
  // Frame blending for smoother motion
  frameBlendingEnabled: boolean
  // Cinematic effects (vignette, chromatic aberration, film grain)
  cinematicEnabled: boolean
  // Schrodinger isosurface mode (compile-time shader selection)
  isosurface: boolean
  quantumMode: 'harmonicOscillator' | 'hydrogenND'
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  useDensityGrid: boolean
  temporalReprojectionEnabled: boolean
  colorAlgorithm: PaletteColorAlgorithm
  // Skybox settings
  skyboxEnabled: boolean
  skyboxMode: SkyboxMode
}

/**
 * Set up render passes for the WebGPU pipeline.
 *
 * Pass order:
 * 1. Object Renderer - Render main object to MRT (color, normal, depth/quarter buffers)
 * 2. Temporal Cloud Accumulation (optional) - Reconstruct full-res object-color from quarter-res
 * 3. ScenePass - Render environment/clear target
 * 4. GTAOPass (optional) - Ambient occlusion
 * 5. EnvironmentCompositePass - Composite environment with main object
 * 6. BloomPass (optional) - Bloom effect
 * 7. BokehPass (optional) - Depth of field
 * 8. FrameBlendingPass (optional) - Temporal smoothing
 * 9. TonemappingPass - HDR to LDR conversion
 * 10. CinematicPass (optional) - Vignette, chromatic aberration, film grain
 * 11. PaperTexturePass (optional) - Paper texture overlay
 * 12. FXAA/SMAAPass (optional) - Anti-aliasing
 * 13. ToScreenPass - Copy to canvas
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
    // No skybox: just clear the scene-render buffer to black
    await safeAddPass(
      graph,
      new ScenePass({
        outputResource: 'scene-render',
        depthResource: 'depth-buffer',
        mode: 'clear',
      }),
      'scene-pass',
      shouldAbort
    )
  }

  // 4. GTAO (optional) - Ambient occlusion
  if (config.ssaoEnabled) {
    graph.addResource('aoBuffer', {
      type: 'texture',
      format: 'r8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    await safeAddPass(
      graph,
      new GTAOPass({
        depthInput: 'depth-buffer',
        normalInput: 'normal-buffer',
        outputResource: 'aoBuffer',
      }),
      'gtao',
      shouldAbort
    )
  }

  // 5. Environment composite - composites object over environment, outputs to hdr-color
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

  // 7. Bokeh / Depth of Field (optional)
  if (config.bokehEnabled) {
    graph.addResource('bokeh-output', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    const ok = await safeAddPass(
      graph,
      new BokehPass({
        colorInput: currentHDRBuffer,
        depthInput: 'depth-buffer',
        outputResource: 'bokeh-output',
      }),
      'bokeh',
      shouldAbort
    )

    if (ok) currentHDRBuffer = 'bokeh-output'
  }

  // 8. Frame Blending (optional) - temporal smoothing
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

  // 9. Tonemapping - HDR to LDR conversion (CRITICAL -- always required)
  await safeAddPass(
    graph,
    new TonemappingPass({
      inputResource: currentHDRBuffer,
      exposure: 1.0,
    }),
    'tonemapping',
    shouldAbort
  )

  // Track current LDR buffer for post-tonemapping effects
  let currentLDRBuffer = 'ldr-color'

  // 10. Cinematic effects (optional) - vignette, chromatic aberration, film grain
  if (config.cinematicEnabled) {
    graph.addResource('cinematic-output', {
      type: 'texture',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    const ok = await safeAddPass(
      graph,
      new CinematicPass({
        colorInput: currentLDRBuffer,
        outputResource: 'cinematic-output',
      }),
      'cinematic',
      shouldAbort
    )

    if (ok) currentLDRBuffer = 'cinematic-output'
  }

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
  const { dimension, isosurface, quantumMode, termCount, useDensityGrid } = config
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
        useDensityGrid,
        temporal: useTemporalCloudAccumulation,
      })

    default:
      console.warn(`WebGPU: No renderer for object type '${objectType}', only 'schroedinger' is supported`)
      return null
  }
}

export default WebGPUScene
