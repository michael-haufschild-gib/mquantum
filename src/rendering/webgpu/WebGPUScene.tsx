/**
 * WebGPU Scene Component
 *
 * Main scene component for WebGPU rendering that sets up render passes
 * and manages the rendering pipeline. Mirrors the WebGL scene setup.
 *
 * @module rendering/webgpu/WebGPUScene
 */

import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWebGPU } from './WebGPUCanvas'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import { WebGPUDevice } from './core/WebGPUDevice'
import { WebGPUCamera } from './core/WebGPUCamera'

// Geometry hooks
import { useGeometryGenerator } from '@/hooks/useGeometryGenerator'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { useNDTransformUpdates, useProjectionDistanceCache } from '@/rendering/renderers/base'
import type { NdGeometry } from '@/lib/geometry/types'
import type { VectorND } from '@/lib/math/types'

// Stores
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
// Note: useCameraStore removed - WebGPU uses its own WebGPUCamera for matrices
// import { useCameraStore } from '@/stores/cameraStore'
import { useAnimationStore } from '@/stores/animationStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useTransformStore } from '@/stores/transformStore'
import { usePBRStore } from '@/stores/pbrStore'

// Passes (import as needed for the pipeline)
import { ScenePass } from './passes/ScenePass'
import { BloomPass } from './passes/BloomPass'
import { TonemappingPass } from './passes/TonemappingPass'
import { FXAAPass } from './passes/FXAAPass'
import { SMAAPass } from './passes/SMAAPass'
import { ToScreenPass } from './passes/ToScreenPass'
import { EnvironmentCompositePass } from './passes/EnvironmentCompositePass'
import { GTAOPass } from './passes/GTAOPass'
import { SSRPass } from './passes/SSRPass'
import { BokehPass } from './passes/BokehPass'
// import { GodRaysPass } from './passes/GodRaysPass'  // TODO: Wire when godRaysEnabled added to store
import { RefractionPass } from './passes/RefractionPass'
import { ScreenSpaceLensingPass } from './passes/ScreenSpaceLensingPass'
import { GravitationalLensingPass } from './passes/GravitationalLensingPass'
import { JetsRenderPass } from './passes/JetsRenderPass'
import { JetsCompositePass } from './passes/JetsCompositePass'
import { PaperTexturePass } from './passes/PaperTexturePass'
import { FrameBlendingPass } from './passes/FrameBlendingPass'
import { CinematicPass } from './passes/CinematicPass'

// Object Renderers
import { WebGPUMandelbulbRenderer } from './renderers/WebGPUMandelbulbRenderer'
import { WebGPUQuaternionJuliaRenderer } from './renderers/WebGPUQuaternionJuliaRenderer'
import { WebGPUSchrodingerRenderer } from './renderers/WebGPUSchrodingerRenderer'
import { WebGPUBlackHoleRenderer } from './renderers/WebGPUBlackHoleRenderer'
import { WebGPUPolytopeRenderer } from './renderers/WebGPUPolytopeRenderer'
import { WebGPUTubeWireframeRenderer } from './renderers/WebGPUTubeWireframeRenderer'
import type { ObjectType } from '@/lib/geometry/types'

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
  cosineCoefficients: state.cosineCoefficients,
})

const environmentSelector = (state: ReturnType<typeof useEnvironmentStore.getState>) => ({
  skyboxEnabled: state.skyboxEnabled,
  skyboxMode: state.skyboxMode,
  groundEnabled: state.groundEnabled,
})

const performanceSelector = (state: ReturnType<typeof usePerformanceStore.getState>) => ({
  renderResolutionScale: state.renderResolutionScale,
})

const postProcessingSelector = (state: ReturnType<typeof usePostProcessingStore.getState>) => ({
  bloomEnabled: state.bloomEnabled,
  bloomIntensity: state.bloomIntensity,
  ssaoEnabled: state.ssaoEnabled,
  ssrEnabled: state.ssrEnabled,
  antiAliasingMethod: state.antiAliasingMethod,
  // Depth of field
  bokehEnabled: state.bokehEnabled,
  // Refraction
  refractionEnabled: state.refractionEnabled,
  // Gravitational lensing
  gravityEnabled: state.gravityEnabled,
  // Paper texture
  paperEnabled: state.paperEnabled,
  // Frame blending
  frameBlendingEnabled: state.frameBlendingEnabled,
  // Cinematic
  cinematicEnabled: state.cinematicEnabled,
})

// ============================================================================
// Geometry Buffer Building
// ============================================================================

/**
 * Build WebGPU vertex buffers from NdGeometry and face data.
 *
 * MATCHES WebGL PolytopeScene.tsx screen-space normals mode (lines 605-737):
 * - Normals computed in fragment shader via dFdx/dFdy (screen-space derivatives)
 * - No normal attribute needed in vertex buffer
 *
 * Vertex layout (10 floats = 40 bytes per vertex):
 * - position (vec3f): N-D coordinates 0-2 (first 3 dimensions)
 * - extraDims0_3 (vec4f): N-D coordinates 3-6 (dimensions 4-7)
 * - extraDims4_6 (vec3f): N-D coordinates 7-9 (dimensions 8-10)
 *
 * WebGL uses separate attribute arrays; WebGPU uses interleaved buffer.
 * Same data, different memory layout.
 */
function buildWebGPUGeometryBuffers(
  geometry: NdGeometry,
  faces: number[][]
): {
  faceData: { vertices: Float32Array; indices: Uint16Array } | null
  edgeData: { vertices: Float32Array; indices: Uint16Array } | null
} {
  const baseVertices = geometry.vertices
  const edges = geometry.edges
  const FLOATS_PER_VERTEX = 10 // position(3) + extraDims0_3(4) + extraDims4_6(3)

  /**
   * Write a single vertex to the interleaved buffer.
   * Matches WebGL writeTriangleVertex() lines 637-658 (screen-space mode).
   */
  const writeVertex = (buffer: Float32Array, outIdx: number, v: VectorND) => {
    const base = outIdx * FLOATS_PER_VERTEX

    // Position (vec3f) - coordinates 0-2
    buffer[base + 0] = v[0] ?? 0
    buffer[base + 1] = v[1] ?? 0
    buffer[base + 2] = v[2] ?? 0

    // extraDims0_3 (vec4f) - coordinates 3-6 (matching WebGL aExtraDims0_3)
    buffer[base + 3] = v[3] ?? 0
    buffer[base + 4] = v[4] ?? 0
    buffer[base + 5] = v[5] ?? 0
    buffer[base + 6] = v[6] ?? 0

    // extraDims4_6 (vec3f) - coordinates 7-9 (matching WebGL aExtraDims4_6)
    buffer[base + 7] = v[7] ?? 0
    buffer[base + 8] = v[8] ?? 0
    buffer[base + 9] = v[9] ?? 0
  }

  // Build face data if we have faces
  // Matches WebGL faceGeometry useMemo lines 605-737
  let faceData: { vertices: Float32Array; indices: Uint16Array } | null = null
  if (faces.length > 0 && baseVertices.length > 0) {
    // Count triangles - matches WebGL lines 608-614
    let triangleCount = 0
    for (const face of faces) {
      if (face.length === 3) triangleCount += 1
      else if (face.length === 4) triangleCount += 2
    }

    if (triangleCount > 0) {
      const vertexCount = triangleCount * 3 // Non-indexed, 3 vertices per triangle
      const faceVertices = new Float32Array(vertexCount * FLOATS_PER_VERTEX)
      const faceIndices = new Uint16Array(vertexCount) // Sequential indices

      let outIdx = 0
      const vertexBound = baseVertices.length

      // Triangulation matches WebGL lines 697-718
      for (const face of faces) {
        const vis = face

        // Skip faces with out-of-bounds indices (matches WebGL line 702-703)
        const hasValidIndices = vis.every((idx) => idx >= 0 && idx < vertexBound)
        if (!hasValidIndices) continue

        if (vis.length === 3) {
          // Triangle: write 3 vertices
          writeVertex(faceVertices, outIdx, baseVertices[vis[0]!]!)
          faceIndices[outIdx] = outIdx
          outIdx++

          writeVertex(faceVertices, outIdx, baseVertices[vis[1]!]!)
          faceIndices[outIdx] = outIdx
          outIdx++

          writeVertex(faceVertices, outIdx, baseVertices[vis[2]!]!)
          faceIndices[outIdx] = outIdx
          outIdx++
        } else if (vis.length === 4) {
          // Quad: split into 2 triangles (0,1,2) and (0,2,3) - matches WebGL line 711
          // Triangle 1: v0, v1, v2
          writeVertex(faceVertices, outIdx, baseVertices[vis[0]!]!)
          faceIndices[outIdx] = outIdx
          outIdx++

          writeVertex(faceVertices, outIdx, baseVertices[vis[1]!]!)
          faceIndices[outIdx] = outIdx
          outIdx++

          writeVertex(faceVertices, outIdx, baseVertices[vis[2]!]!)
          faceIndices[outIdx] = outIdx
          outIdx++

          // Triangle 2: v0, v2, v3
          writeVertex(faceVertices, outIdx, baseVertices[vis[0]!]!)
          faceIndices[outIdx] = outIdx
          outIdx++

          writeVertex(faceVertices, outIdx, baseVertices[vis[2]!]!)
          faceIndices[outIdx] = outIdx
          outIdx++

          writeVertex(faceVertices, outIdx, baseVertices[vis[3]!]!)
          faceIndices[outIdx] = outIdx
          outIdx++
        }
      }

      faceData = { vertices: faceVertices, indices: faceIndices }
    }
  }

  // Build edge data
  // Matches WebGL edgeGeometry useMemo lines 739-753 which uses buildNDGeometry
  let edgeData: { vertices: Float32Array; indices: Uint16Array } | null = null
  if (edges.length > 0 && baseVertices.length > 0) {
    // For edges, we expand edge pairs to vertex pairs (like WebGL)
    const edgeVertexCount = edges.length * 2
    const edgeVertices = new Float32Array(edgeVertexCount * FLOATS_PER_VERTEX)
    const edgeIndices = new Uint16Array(edgeVertexCount)

    let outIdx = 0
    for (const [a, b] of edges) {
      const vA = baseVertices[a]
      const vB = baseVertices[b]
      if (vA && vB) {
        writeVertex(edgeVertices, outIdx, vA)
        edgeIndices[outIdx] = outIdx
        outIdx++

        writeVertex(edgeVertices, outIdx, vB)
        edgeIndices[outIdx] = outIdx
        outIdx++
      }
    }

    edgeData = { vertices: edgeVertices, indices: edgeIndices }
  }

  return { faceData, edgeData }
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
export const WebGPUScene: React.FC<WebGPUSceneProps> = ({
  objectType,
  dimension,
  onFrame,
}) => {
  const { graph, size } = useWebGPU()
  const animationFrameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(performance.now())
  const passesInitializedRef = useRef(false)
  const currentObjectTypeRef = useRef<ObjectType | null>(null)

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

  // Store subscriptions with shallow comparison
  const appearance = useAppearanceStore(useShallow(appearanceSelector))
  const environment = useEnvironmentStore(useShallow(environmentSelector))
  const performance_ = usePerformanceStore(useShallow(performanceSelector))
  const postProcessing = usePostProcessingStore(useShallow(postProcessingSelector))

  // Animation state
  const isPlaying = useAnimationStore((state) => state.isPlaying)

  // Generate geometry for polytope types
  const { geometry } = useGeometryGenerator()

  // Detect faces for surface rendering (polytopes only)
  const { faces } = useFaceDetection(geometry, objectType)

  // N-D transform for polytope rotation and projection (matches WebGL PolytopeScene)
  const ndTransform = useNDTransformUpdates()

  // Projection distance caching - computed dynamically like WebGL PolytopeScene.tsx line 872
  const projDistCache = useProjectionDistanceCache()

  // Check if this is a polytope type that needs geometry buffers
  const isPolytopeType = useMemo(() => {
    return (
      objectType === 'hypercube' ||
      objectType === 'simplex' ||
      objectType === 'cross-polytope' ||
      objectType === 'wythoff-polytope'
    )
  }, [objectType])

  // Build geometry buffers when geometry or faces change
  // Convert Face[] to number[][] (extract vertices array from each Face)
  const geometryBuffers = useMemo(() => {
    if (!isPolytopeType || !geometry) return null
    // faces is Face[], we need number[][] - extract face.vertices
    const faceIndices = faces.map((face) => face.vertices)
    return buildWebGPUGeometryBuffers(geometry, faceIndices)
  }, [isPolytopeType, geometry, faces])

  // Update polytope renderer with geometry data
  // Depends on objectType to re-run after pass setup (which also depends on objectType)
  useEffect(() => {
    if (!isPolytopeType || !geometryBuffers) return

    const polytopeRenderer = graph.getPass('polytope') as WebGPUPolytopeRenderer | undefined
    if (!polytopeRenderer) {
      // Pass not added yet - this is expected on first render before pass setup
      return
    }

    // Get device from the WebGPUDevice singleton
    let device: GPUDevice
    try {
      device = WebGPUDevice.getInstance().getDevice()
    } catch {
      return
    }

    // Update geometry on the renderer
    polytopeRenderer.updateGeometry(
      device,
      geometryBuffers.faceData ?? undefined,
      geometryBuffers.edgeData ?? undefined
    )

    if (import.meta.env.DEV) {
      console.log('[WebGPUScene] Updated polytope geometry:', {
        faceVertexCount: geometryBuffers.faceData?.vertices.length ?? 0,
        faceIndexCount: geometryBuffers.faceData?.indices.length ?? 0,
        edgeVertexCount: geometryBuffers.edgeData?.vertices.length ?? 0,
        edgeIndexCount: geometryBuffers.edgeData?.indices.length ?? 0,
      })
    }
  }, [graph, isPolytopeType, geometryBuffers, objectType])

  // Initialize passes - rebuild when objectType changes
  useEffect(() => {
    const needsRebuild = !passesInitializedRef.current || currentObjectTypeRef.current !== objectType

    if (!needsRebuild) return

    // Clear existing passes if rebuilding
    if (passesInitializedRef.current) {
      graph.clearPasses()
    }

    passesInitializedRef.current = true
    currentObjectTypeRef.current = objectType

    setupRenderPasses(graph, {
      objectType,
      dimension,
      bloomEnabled: postProcessing.bloomEnabled,
      ssaoEnabled: postProcessing.ssaoEnabled,
      ssrEnabled: postProcessing.ssrEnabled,
      antiAliasingMethod: postProcessing.antiAliasingMethod,
      bokehEnabled: postProcessing.bokehEnabled,
      refractionEnabled: postProcessing.refractionEnabled,
      gravityEnabled: postProcessing.gravityEnabled,
      paperEnabled: postProcessing.paperEnabled,
      frameBlendingEnabled: postProcessing.frameBlendingEnabled,
      cinematicEnabled: postProcessing.cinematicEnabled,
    })

    // Compile the graph
    graph.compile()

    // Update polytope geometry right after pass setup (if polytope and geometry ready)
    if (isPolytopeType && geometryBuffers) {
      const polytopeRenderer = graph.getPass('polytope') as WebGPUPolytopeRenderer | undefined
      if (polytopeRenderer) {
        try {
          const device = WebGPUDevice.getInstance().getDevice()
          polytopeRenderer.updateGeometry(
            device,
            geometryBuffers.faceData ?? undefined,
            geometryBuffers.edgeData ?? undefined
          )
        } catch {
          // Device not ready yet
        }
      }
    }

    return () => {
      // Cleanup passes
      passesInitializedRef.current = false
    }
  }, [graph, objectType, dimension, isPolytopeType, geometryBuffers, postProcessing.bloomEnabled, postProcessing.ssaoEnabled, postProcessing.ssrEnabled, postProcessing.antiAliasingMethod, postProcessing.bokehEnabled, postProcessing.refractionEnabled, postProcessing.gravityEnabled, postProcessing.paperEnabled, postProcessing.frameBlendingEnabled, postProcessing.cinematicEnabled])

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
      return {
        viewMatrix: { elements: Array.from(matrices.viewMatrix) },
        projectionMatrix: { elements: Array.from(matrices.projectionMatrix) },
        viewProjectionMatrix: { elements: Array.from(matrices.viewProjectionMatrix) },
        inverseViewMatrix: { elements: Array.from(matrices.inverseViewMatrix) },
        inverseProjectionMatrix: { elements: Array.from(matrices.inverseProjectionMatrix) },
        position: matrices.cameraPosition,
        near: matrices.cameraNear,
        far: matrices.cameraFar,
        fov: matrices.fov,
      }
    })
    graph.setStoreGetter('animation', () => useAnimationStore.getState())
    graph.setStoreGetter('extended', () => useExtendedObjectStore.getState())
    graph.setStoreGetter('rotation', () => useRotationStore.getState())
    graph.setStoreGetter('transform', () => useTransformStore.getState())
    graph.setStoreGetter('pbr', () => usePBRStore.getState())
    // N-D transform GPU data for polytope rendering (matches WebGL PolytopeScene)
    graph.setStoreGetter('ndTransform', () => {
      const gpuData = ndTransform.source.getGPUData()
      // Compute projection distance dynamically like WebGL PolytopeScene.tsx line 872
      const projectionDistance = geometry?.vertices
        ? projDistCache.getProjectionDistance(geometry.vertices, dimension)
        : 5.0
      return {
        rotationMatrix4D: gpuData.rotationMatrix4D.elements as unknown as number[],
        extraRotationCols: Array.from(gpuData.extraRotationCols),
        depthRowSums: Array.from(gpuData.depthRowSums),
        projectionDistance,
      }
    })
  }, [graph, ndTransform, geometry, dimension, projDistCache])

  // Animation loop
  const renderFrame = useCallback(() => {
    const now = performance.now()
    const deltaTime = (now - lastTimeRef.current) / 1000 // Convert to seconds
    lastTimeRef.current = now

    // Update N-D transform matrices from rotation store (matches WebGL PolytopeScene useFrame)
    if (isPolytopeType) {
      ndTransform.update()
    }

    // Execute render graph
    graph.execute(deltaTime)

    onFrame?.(deltaTime)

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(renderFrame)
  }, [graph, objectType, dimension, isPlaying, onFrame, isPolytopeType, ndTransform])

  // Start/stop animation loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(renderFrame)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [renderFrame])

  // This component doesn't render any DOM - it manages the WebGPU pipeline
  return null
}

// ============================================================================
// Pass Setup
// ============================================================================

interface PassConfig {
  objectType: ObjectType
  dimension: number
  bloomEnabled: boolean
  ssaoEnabled: boolean
  ssrEnabled: boolean
  antiAliasingMethod: 'none' | 'fxaa' | 'smaa'
  // Depth of field
  bokehEnabled: boolean
  // Refraction
  refractionEnabled: boolean
  // Gravitational lensing (environment-only distortion)
  gravityEnabled: boolean
  // Paper texture overlay
  paperEnabled: boolean
  // Frame blending for smoother motion
  frameBlendingEnabled: boolean
  // Cinematic effects (vignette, chromatic aberration, film grain)
  cinematicEnabled: boolean
}

/**
 * Set up render passes for the WebGPU pipeline.
 *
 * Pass order:
 * 1. Object Renderer - Render main object to MRT (color, normal, depth)
 * 2. ScenePass - Render environment (skybox, ground)
 * 3. GTAOPass (optional) - Ambient occlusion
 * 4. SSRPass (optional) - Screen-space reflections
 * 5. ScreenSpaceLensingPass (black hole only) - Distort scene around black hole
 * 6. GravitationalLensingPass (black hole only) - Environment lensing
 * 7. JetsRenderPass (black hole only) - Render relativistic jets
 * 8. EnvironmentCompositePass - Composite environment with main object
 * 9. JetsCompositePass (black hole only) - Blend jets with scene
 * 10. RefractionPass (optional) - Screen-space refraction
 * 11. BokehPass (optional) - Depth of field
 * 12. BloomPass (optional) - Bloom effect
 * 13. FrameBlendingPass (optional) - Temporal smoothing
 * 14. TonemappingPass - HDR to LDR conversion
 * 15. CinematicPass (optional) - Vignette, chromatic aberration, film grain
 * 16. PaperTexturePass (optional) - Paper texture overlay
 * 17. FXAA/SMAAPass (optional) - Anti-aliasing
 * 18. ToScreenPass - Copy to canvas
 */
function setupRenderPasses(graph: WebGPURenderGraph, config: PassConfig): void {
  // ============================================================================
  // Define Resources
  // ============================================================================

  // Initial scene render (before post-processing)
  graph.addResource('scene-render', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

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

  // BloomPass expects this output name
  graph.addResource('bloom-output', {
    type: 'texture',
    format: 'rgba16float',
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

  // Black hole specific resources
  const isBlackhole = config.objectType === 'blackhole'
  if (isBlackhole) {
    // Jets render target
    graph.addResource('jets-buffer', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    // Lensed environment for gravitational lensing
    graph.addResource('lensed-environment', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
  }

  // Intermediate buffers for HDR post-processing chain
  // We use hdr-color-a and hdr-color-b for ping-pong when multiple HDR effects are enabled
  let currentHDRBuffer = 'hdr-color'

  // ============================================================================
  // Add Passes in Execution Order
  // ============================================================================

  // 1. Object renderer - add appropriate renderer based on objectType
  const objectRenderer = createObjectRenderer(config.objectType, config.dimension)
  if (objectRenderer) {
    graph.addPass(objectRenderer)
  }

  // 2. Scene pass (environment) - outputs to scene-render buffer
  graph.addPass(
    new ScenePass({
      outputResource: 'scene-render',
      depthResource: 'depth-buffer',
      mode: 'clear',
    })
  )

  // 3. GTAO (optional) - Ambient occlusion
  if (config.ssaoEnabled) {
    graph.addResource('aoBuffer', {
      type: 'texture',
      format: 'r8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new GTAOPass({
        depthInput: 'depth-buffer',
        normalInput: 'normal-buffer',
        outputResource: 'aoBuffer',
      })
    )
  }

  // 4. SSR (optional) - Screen-space reflections
  if (config.ssrEnabled) {
    graph.addResource('ssrBuffer', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new SSRPass({
        colorInput: 'hdr-color',
        depthInput: 'depth-buffer',
        normalInput: 'normal-buffer',
        outputResource: 'ssrBuffer',
      })
    )
  }

  // 5. Screen-space lensing (black hole only) - distorts the scene around black hole
  if (isBlackhole && config.gravityEnabled) {
    graph.addResource('lensed-scene', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new ScreenSpaceLensingPass({
        colorInput: 'scene-render',
        depthInput: 'depth-buffer',
        outputResource: 'lensed-scene',
      })
    )

    // Also apply gravitational lensing to environment/skybox
    graph.addPass(
      new GravitationalLensingPass({
        environmentInput: 'scene-render',
        outputResource: 'lensed-environment',
      })
    )
  }

  // 6. Jets rendering (black hole only) - render relativistic jets
  if (isBlackhole) {
    graph.addPass(
      new JetsRenderPass({
        sceneDepthInput: 'depth-buffer',
        outputResource: 'jets-buffer',
      })
    )
  }

  // 7. Environment composite - reads scene-render, outputs to hdr-color
  // Use lensed scene if gravitational lensing was applied
  const envInput = isBlackhole && config.gravityEnabled ? 'lensed-scene' : 'scene-render'
  graph.addPass(
    new EnvironmentCompositePass({
      lensedEnvironmentInput: isBlackhole && config.gravityEnabled ? 'lensed-environment' : envInput,
      mainObjectInput: envInput,
      mainObjectDepthInput: 'depth-buffer',
      outputResource: 'hdr-color',
    })
  )

  // 8. Jets composite (black hole only) - blend jets with scene
  if (isBlackhole) {
    graph.addResource('jets-composited', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new JetsCompositePass({
        sceneInput: 'hdr-color',
        jetsInput: 'jets-buffer',
        outputResource: 'jets-composited',
      })
    )

    currentHDRBuffer = 'jets-composited'
  }

  // 9. Refraction (optional) - screen-space refraction effects
  if (config.refractionEnabled) {
    graph.addResource('refraction-output', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new RefractionPass({
        colorInput: currentHDRBuffer,
        normalInput: 'normal-buffer',
        depthInput: 'depth-buffer',
        outputResource: 'refraction-output',
      })
    )

    currentHDRBuffer = 'refraction-output'
  }

  // 10. Bokeh / Depth of Field (optional)
  if (config.bokehEnabled) {
    graph.addResource('bokeh-output', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new BokehPass({
        colorInput: currentHDRBuffer,
        depthInput: 'depth-buffer',
        outputResource: 'bokeh-output',
      })
    )

    currentHDRBuffer = 'bokeh-output'
  }

  // 11. God Rays (optional) - volumetric light scattering
  // Note: God rays work best with a strong directional light source
  // TODO: Add store check for godRaysEnabled when added to postProcessingStore

  // 12. Bloom (optional)
  // Note: BloomPass uses hardcoded resource names: input='hdr-color', output='bloom-output'
  // If we've modified currentHDRBuffer, we need to copy to hdr-color first
  if (config.bloomEnabled) {
    // If current buffer isn't hdr-color, we need the bloom to read from where we are
    // For now, bloom reads from hdr-color so effects after env composite go into bloom
    graph.addPass(
      new BloomPass({
        threshold: 1.0,
        intensity: 0.5,
      })
    )
  }

  // 13. Frame Blending (optional) - temporal smoothing
  if (config.frameBlendingEnabled) {
    graph.addResource('frame-blend-output', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new FrameBlendingPass({
        colorInput: currentHDRBuffer,
        outputResource: 'frame-blend-output',
        blendFactor: 0.15,
      })
    )

    currentHDRBuffer = 'frame-blend-output'
  }

  // 14. Tonemapping - HDR to LDR conversion
  // Note: TonemappingPass hardcodes input='hdr-color', output='ldr-color'
  graph.addPass(
    new TonemappingPass({
      exposure: 1.0,
    })
  )

  // Track current LDR buffer for post-tonemapping effects
  let currentLDRBuffer = 'ldr-color'

  // 15. Cinematic effects (optional) - vignette, chromatic aberration, film grain
  if (config.cinematicEnabled) {
    graph.addResource('cinematic-output', {
      type: 'texture',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new CinematicPass({
        colorInput: currentLDRBuffer,
        outputResource: 'cinematic-output',
      })
    )

    currentLDRBuffer = 'cinematic-output'
  }

  // 16. Paper Texture (optional) - paper/parchment overlay effect
  if (config.paperEnabled) {
    graph.addResource('paper-output', {
      type: 'texture',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new PaperTexturePass({
        colorInput: currentLDRBuffer,
        outputResource: 'paper-output',
      })
    )

    currentLDRBuffer = 'paper-output'
  }

  // 17. Anti-aliasing (optional) - FXAA or SMAA
  // Both read from 'ldr-color' and write to 'final-color' by default
  const hasAntiAliasing = config.antiAliasingMethod === 'fxaa' || config.antiAliasingMethod === 'smaa'

  if (config.antiAliasingMethod === 'fxaa') {
    graph.addPass(
      new FXAAPass({
        subpixelQuality: 0.75,
      })
    )
  } else if (config.antiAliasingMethod === 'smaa') {
    graph.addPass(
      new SMAAPass({
        threshold: 0.1,
        maxSearchSteps: 16,
      })
    )
  }

  // 18. Copy to screen
  // Determine final input based on what passes ran
  let finalInput: string
  if (hasAntiAliasing) {
    finalInput = 'final-color'
  } else if (config.paperEnabled) {
    finalInput = 'paper-output'
  } else if (config.cinematicEnabled) {
    finalInput = 'cinematic-output'
  } else {
    finalInput = 'ldr-color'
  }

  graph.addPass(
    new ToScreenPass({
      inputResource: finalInput,
    })
  )
}

/**
 * Create the appropriate object renderer based on object type.
 *
 * @param objectType - The type of object to render
 * @param dimension - The dimension of the object
 * @returns The appropriate renderer pass or null if not supported
 */
function createObjectRenderer(objectType: ObjectType, dimension: number) {
  switch (objectType) {
    case 'mandelbulb':
      return new WebGPUMandelbulbRenderer({
        dimension,
        shadows: true,
        ambientOcclusion: true,
        sss: false,
        temporal: false,
        ibl: true,
      })

    case 'quaternion-julia':
      return new WebGPUQuaternionJuliaRenderer({
        dimension,
        shadows: true,
        ambientOcclusion: true,
        sss: false,
        temporal: false,
        ibl: true,
      })

    case 'schroedinger':
      return new WebGPUSchrodingerRenderer({
        dimension,
        shadows: true,
        ambientOcclusion: true,
        sss: false,
        temporal: false,
        ibl: true,
      })

    case 'blackhole':
      return new WebGPUBlackHoleRenderer({
        dimension,
        shadows: false,
        ambientOcclusion: false,
        sss: false,
        temporal: false,
        ibl: false,
      })

    case 'hypercube':
    case 'simplex':
    case 'cross-polytope':
    case 'wythoff-polytope':
      return new WebGPUPolytopeRenderer({
        dimension,
        shadows: true,
        ambientOcclusion: true,
        ibl: true,
      })

    case 'root-system':
    case 'clifford-torus':
    case 'nested-torus':
      // These use tube wireframe rendering
      return new WebGPUTubeWireframeRenderer({
        dimension,
        shadows: true,
        ambientOcclusion: false,
        ibl: false,
      })

    default:
      console.warn(`WebGPU: No renderer for object type '${objectType}'`)
      return null
  }
}

export default WebGPUScene
