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
import { useNDTransformUpdates, useProjectionDistanceCache, useRotationUpdates } from '@/rendering/renderers/base'
import type { NdGeometry } from '@/lib/geometry/types'
import type { VectorND } from '@/lib/math/types'
import { SCREEN_SPACE_NORMAL_MIN_DIMENSION } from '@/rendering/shaders/constants'

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
import { SSRPass } from './passes/SSRPass'
import { BokehPass } from './passes/BokehPass'
import { GodRaysPass } from './passes/GodRaysPass'
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
import { WebGPUGroundPlaneRenderer } from './renderers/WebGPUGroundPlaneRenderer'
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
  // Shader feature flags (affect shader compilation, not just uniforms)
  sssEnabled: state.sssEnabled,
  edgesVisible: state.edgesVisible,
  // Edge thickness controls whether to use TubeWireframe (>1) or line edges (<=1)
  edgeThickness: state.edgeThickness,
})

const environmentSelector = (state: ReturnType<typeof useEnvironmentStore.getState>) => ({
  skyboxEnabled: state.skyboxEnabled,
  skyboxMode: state.skyboxMode,
  groundEnabled: state.groundEnabled,
  activeWalls: state.activeWalls,
  groundPlaneOffset: state.groundPlaneOffset,
  groundPlaneColor: state.groundPlaneColor,
  groundPlaneSizeScale: state.groundPlaneSizeScale,
  showGroundGrid: state.showGroundGrid,
  groundGridColor: state.groundGridColor,
  groundGridSpacing: state.groundGridSpacing,
  iblQuality: state.iblQuality,
})

const performanceSelector = (state: ReturnType<typeof usePerformanceStore.getState>) => ({
  renderResolutionScale: state.renderResolutionScale,
  // Shader feature flag (affects shader compilation)
  temporalEnabled: state.temporalReprojectionEnabled,
})

const lightingSelector = (state: ReturnType<typeof useLightingStore.getState>) => ({
  // Shader feature flag (affects shader compilation)
  shadowEnabled: state.shadowEnabled,
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

const blackholeSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) => ({
  jetsGodRaysEnabled: state.blackhole?.jetsGodRaysEnabled ?? false,
})

// Schrodinger selector for rotation updates (like WebGL SchroedingerMesh.tsx line 108)
const schroedingerSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) =>
  state.schroedinger?.parameterValues ?? []

// ============================================================================
// Geometry Buffer Building
// ============================================================================

/**
 * Build WebGPU vertex buffers from NdGeometry and face data.
 *
 * MATCHES WebGL PolytopeScene.tsx normal computation strategy (lines 605-737):
 * - For dimensions < SCREEN_SPACE_NORMAL_MIN_DIMENSION (5):
 *   Uses geometry-based normals computed in vertex shader from neighbor data.
 *   Vertex layout: 30 floats = 120 bytes (thisVertex + neighbor1 + neighbor2)
 * - For dimensions >= 5:
 *   Uses screen-space normals computed in fragment shader via dFdx/dFdy.
 *   Vertex layout: 10 floats = 40 bytes (thisVertex only)
 *
 * Vertex data block (10 floats per vertex):
 * - position (vec3f): N-D coordinates 0-2 (first 3 dimensions)
 * - extraDims0_3 (vec4f): N-D coordinates 3-6 (dimensions 4-7)
 * - extraDims4_6 (vec3f): N-D coordinates 7-9 (dimensions 8-10)
 *
 * @param geometry - The N-D geometry with vertices and edges
 * @param faces - Array of face vertex indices
 * @param dimension - Current dimension (determines normal computation strategy)
 * @returns Face and edge buffer data with useGeometryNormals flag
 */
function buildWebGPUGeometryBuffers(
  geometry: NdGeometry,
  faces: number[][],
  dimension: number
): {
  faceData: { vertices: Float32Array; indices: Uint16Array } | null
  edgeData: { vertices: Float32Array; indices: Uint16Array } | null
  useGeometryNormals: boolean
} {
  const baseVertices = geometry.vertices
  const edges = geometry.edges

  // Matches WebGL SCREEN_SPACE_NORMAL_MIN_DIMENSION threshold
  const useGeometryNormals = dimension < SCREEN_SPACE_NORMAL_MIN_DIMENSION

  // Face buffer layout depends on normal computation strategy
  const FACE_FLOATS_PER_VERTEX = useGeometryNormals
    ? 30 // position(3) + extra(7) + neighbor1(10) + neighbor2(10)
    : 10 // position(3) + extra(7) for screen-space normals

  // Edge buffer always uses simple layout (no normals needed)
  const EDGE_FLOATS_PER_VERTEX = 10

  /**
   * Write a single N-D vertex data block (10 floats) to buffer at given offset.
   */
  const writeVertexData = (buffer: Float32Array, offset: number, v: VectorND) => {
    // Position (vec3f) - coordinates 0-2
    buffer[offset + 0] = v[0] ?? 0
    buffer[offset + 1] = v[1] ?? 0
    buffer[offset + 2] = v[2] ?? 0

    // extraDims0_3 (vec4f) - coordinates 3-6
    buffer[offset + 3] = v[3] ?? 0
    buffer[offset + 4] = v[4] ?? 0
    buffer[offset + 5] = v[5] ?? 0
    buffer[offset + 6] = v[6] ?? 0

    // extraDims4_6 (vec3f) - coordinates 7-9
    buffer[offset + 7] = v[7] ?? 0
    buffer[offset + 8] = v[8] ?? 0
    buffer[offset + 9] = v[9] ?? 0
  }

  /**
   * Write triangle vertex with neighbor data for geometry-based normals.
   * Matches WebGL writeTriangleVertex() lines 637-691.
   * Each vertex stores: thisVertex(10) + neighbor1(10) + neighbor2(10) = 30 floats
   */
  const writeTriangleVertexWithNeighbors = (
    buffer: Float32Array,
    outIdx: number,
    thisIdx: number,
    neighbor1Idx: number,
    neighbor2Idx: number
  ) => {
    const base = outIdx * FACE_FLOATS_PER_VERTEX
    const v = baseVertices[thisIdx]!
    const n1 = baseVertices[neighbor1Idx]!
    const n2 = baseVertices[neighbor2Idx]!

    // This vertex (offset 0-9)
    writeVertexData(buffer, base, v)

    // Neighbor 1 (offset 10-19)
    writeVertexData(buffer, base + 10, n1)

    // Neighbor 2 (offset 20-29)
    writeVertexData(buffer, base + 20, n2)
  }

  /**
   * Write simple vertex without neighbor data for screen-space normals.
   */
  const writeSimpleVertex = (buffer: Float32Array, outIdx: number, v: VectorND) => {
    const base = outIdx * FACE_FLOATS_PER_VERTEX
    writeVertexData(buffer, base, v)
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
      const faceVertices = new Float32Array(vertexCount * FACE_FLOATS_PER_VERTEX)
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
          if (useGeometryNormals) {
            // Triangle: each vertex stores itself + 2 neighbors for normal computation
            // Matches WebGL lines 706-709
            writeTriangleVertexWithNeighbors(faceVertices, outIdx, vis[0]!, vis[1]!, vis[2]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeTriangleVertexWithNeighbors(faceVertices, outIdx, vis[1]!, vis[2]!, vis[0]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeTriangleVertexWithNeighbors(faceVertices, outIdx, vis[2]!, vis[0]!, vis[1]!)
            faceIndices[outIdx] = outIdx
            outIdx++
          } else {
            // Screen-space normals: just write vertex positions
            writeSimpleVertex(faceVertices, outIdx, baseVertices[vis[0]!]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeSimpleVertex(faceVertices, outIdx, baseVertices[vis[1]!]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeSimpleVertex(faceVertices, outIdx, baseVertices[vis[2]!]!)
            faceIndices[outIdx] = outIdx
            outIdx++
          }
        } else if (vis.length === 4) {
          // Quad: split into 2 triangles (0,1,2) and (0,2,3) - matches WebGL line 711
          if (useGeometryNormals) {
            // Triangle 1: v0, v1, v2 (matches WebGL lines 712-714)
            writeTriangleVertexWithNeighbors(faceVertices, outIdx, vis[0]!, vis[1]!, vis[2]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeTriangleVertexWithNeighbors(faceVertices, outIdx, vis[1]!, vis[2]!, vis[0]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeTriangleVertexWithNeighbors(faceVertices, outIdx, vis[2]!, vis[0]!, vis[1]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            // Triangle 2: v0, v2, v3 (matches WebGL lines 715-717)
            writeTriangleVertexWithNeighbors(faceVertices, outIdx, vis[0]!, vis[2]!, vis[3]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeTriangleVertexWithNeighbors(faceVertices, outIdx, vis[2]!, vis[3]!, vis[0]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeTriangleVertexWithNeighbors(faceVertices, outIdx, vis[3]!, vis[0]!, vis[2]!)
            faceIndices[outIdx] = outIdx
            outIdx++
          } else {
            // Screen-space normals: simple vertex write
            // Triangle 1: v0, v1, v2
            writeSimpleVertex(faceVertices, outIdx, baseVertices[vis[0]!]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeSimpleVertex(faceVertices, outIdx, baseVertices[vis[1]!]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeSimpleVertex(faceVertices, outIdx, baseVertices[vis[2]!]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            // Triangle 2: v0, v2, v3
            writeSimpleVertex(faceVertices, outIdx, baseVertices[vis[0]!]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeSimpleVertex(faceVertices, outIdx, baseVertices[vis[2]!]!)
            faceIndices[outIdx] = outIdx
            outIdx++

            writeSimpleVertex(faceVertices, outIdx, baseVertices[vis[3]!]!)
            faceIndices[outIdx] = outIdx
            outIdx++
          }
        }
      }

      faceData = { vertices: faceVertices, indices: faceIndices }
    }
  }

  // Build edge data
  // Matches WebGL edgeGeometry useMemo lines 739-753 which uses buildNDGeometry
  // Edges always use simple 10-float layout (no normals needed)
  let edgeData: { vertices: Float32Array; indices: Uint16Array } | null = null
  if (edges.length > 0 && baseVertices.length > 0) {
    const edgeVertexCount = edges.length * 2
    const edgeVertices = new Float32Array(edgeVertexCount * EDGE_FLOATS_PER_VERTEX)
    const edgeIndices = new Uint16Array(edgeVertexCount)

    let outIdx = 0
    for (const [a, b] of edges) {
      const vA = baseVertices[a]
      const vB = baseVertices[b]
      if (vA && vB) {
        writeVertexData(edgeVertices, outIdx * EDGE_FLOATS_PER_VERTEX, vA)
        edgeIndices[outIdx] = outIdx
        outIdx++

        writeVertexData(edgeVertices, outIdx * EDGE_FLOATS_PER_VERTEX, vB)
        edgeIndices[outIdx] = outIdx
        outIdx++
      }
    }

    edgeData = { vertices: edgeVertices, indices: edgeIndices }
  }

  return { faceData, edgeData, useGeometryNormals }
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

  // Store subscriptions with shallow comparison
  const appearance = useAppearanceStore(useShallow(appearanceSelector))
  const environment = useEnvironmentStore(useShallow(environmentSelector))
  const performance_ = usePerformanceStore(useShallow(performanceSelector))
  const lighting = useLightingStore(useShallow(lightingSelector))
  const postProcessing = usePostProcessingStore(useShallow(postProcessingSelector))
  const blackholeSettings = useExtendedObjectStore(useShallow(blackholeSelector))
  // Schroedinger parameterValues for rotation updates (like WebGL SchroedingerMesh.tsx line 108)
  const schroedingerParamValues = useExtendedObjectStore(schroedingerSelector)

  // Animation state
  const isPlaying = useAnimationStore((state) => state.isPlaying)

  // Generate geometry for polytope types
  const { geometry } = useGeometryGenerator()

  // Detect faces for surface rendering (polytopes only)
  const { faces } = useFaceDetection(geometry, objectType)

  // N-D transform for polytope rotation and projection (matches WebGL PolytopeScene)
  const ndTransform = useNDTransformUpdates()

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

  // Projection distance caching - computed dynamically like WebGL PolytopeScene.tsx line 872
  const projDistCache = useProjectionDistanceCache()

  // Check if this is a type that needs geometry buffers (polytopes AND torus types)
  // All these types generate NdGeometry with vertices and edges
  const needsGeometryBuffers = useMemo(() => {
    return (
      objectType === 'hypercube' ||
      objectType === 'simplex' ||
      objectType === 'cross-polytope' ||
      objectType === 'wythoff-polytope' ||
      objectType === 'root-system' ||
      objectType === 'clifford-torus' ||
      objectType === 'nested-torus'
    )
  }, [objectType])

  // Check if this is a polytope type (has faces and edges via geometry)
  // Includes standard polytopes and extended types that support faces
  const isStandardPolytope = useMemo(() => {
    return (
      objectType === 'hypercube' ||
      objectType === 'simplex' ||
      objectType === 'cross-polytope' ||
      objectType === 'wythoff-polytope' ||
      objectType === 'root-system' ||
      objectType === 'clifford-torus' ||
      objectType === 'nested-torus'
    )
  }, [objectType])

  // Use TubeWireframe for thick edges (>1), line primitives for thin edges (<=1)
  // Matches WebGL PolytopeScene.tsx line 415
  const useFatWireframe = appearance.edgeThickness > 1

  // Build geometry buffers when geometry, faces, or dimension change
  // Convert Face[] to number[][] (extract vertices array from each Face)
  // Dimension affects buffer layout: geometry-based normals (dim < 5) vs screen-space (dim >= 5)
  const geometryBuffers = useMemo(() => {
    if (!needsGeometryBuffers || !geometry) return null
    // faces is Face[], we need number[][] - extract face.vertices
    // For torus types without faces, this will be empty
    const faceIndices = faces.map((face) => face.vertices)
    return buildWebGPUGeometryBuffers(geometry, faceIndices, dimension)
  }, [needsGeometryBuffers, geometry, faces, dimension])

  // Update renderer with geometry data
  // Depends on objectType and useFatWireframe to re-run when renderer type changes
  useEffect(() => {
    console.log('[WebGPUScene] Geometry update effect triggered:', {
      needsGeometryBuffers,
      isStandardPolytope,
      useFatWireframe,
      hasGeometryBuffers: !!geometryBuffers,
      hasGeometry: !!geometry,
      hasFaces: faces.length,
      hasEdges: geometry?.edges?.length ?? 0,
      objectType,
    })

    if (!needsGeometryBuffers || !geometryBuffers || !geometry) {
      console.log('[WebGPUScene] Skipping geometry update - not geometry type or no buffers')
      return
    }

    // Get device from the WebGPUDevice singleton
    let device: GPUDevice
    try {
      device = WebGPUDevice.getInstance().getDevice()
    } catch (e) {
      console.warn('[WebGPUScene] Device not ready:', e)
      return
    }

    // Helper to build tube instances from geometry edges
    const buildTubeInstances = () => {
      const edges = geometry.edges
      const vertices = geometry.vertices
      return edges.map(([a, b]) => {
        const vA = vertices[a]
        const vB = vertices[b]
        if (!vA || !vB) return null
        return {
          start: {
            x: vA[0] ?? 0,
            y: vA[1] ?? 0,
            z: vA[2] ?? 0,
            extraA: [vA[3] ?? 0, vA[4] ?? 0, vA[5] ?? 0, vA[6] ?? 0] as [number, number, number, number],
            extraB: [vA[7] ?? 0, vA[8] ?? 0, vA[9] ?? 0, vA[10] ?? 0] as [number, number, number, number],
          },
          end: {
            x: vB[0] ?? 0,
            y: vB[1] ?? 0,
            z: vB[2] ?? 0,
            extraA: [vB[3] ?? 0, vB[4] ?? 0, vB[5] ?? 0, vB[6] ?? 0] as [number, number, number, number],
            extraB: [vB[7] ?? 0, vB[8] ?? 0, vB[9] ?? 0, vB[10] ?? 0] as [number, number, number, number],
          },
        }
      }).filter((e): e is NonNullable<typeof e> => e !== null)
    }

    // Determine which renderer(s) to update based on object type and edge thickness
    if (isStandardPolytope) {
      // Standard polytopes: Always update face geometry in Polytope renderer
      const polytopeRenderer = graph.getPass('polytope') as WebGPUPolytopeRenderer | undefined
      if (polytopeRenderer) {
        console.log('[WebGPUScene] Updating polytope geometry:', {
          faceVertexCount: geometryBuffers.faceData?.vertices.length ?? 0,
          faceIndexCount: geometryBuffers.faceData?.indices.length ?? 0,
          edgeVertexCount: useFatWireframe ? 0 : (geometryBuffers.edgeData?.vertices.length ?? 0),
          edgeIndexCount: useFatWireframe ? 0 : (geometryBuffers.edgeData?.indices.length ?? 0),
        })

        polytopeRenderer.updateGeometry(
          device,
          geometryBuffers.faceData ?? undefined,
          useFatWireframe ? undefined : geometryBuffers.edgeData ?? undefined // Only pass edge data if NOT using fat wireframe
        )
      } else {
        console.warn('[WebGPUScene] Polytope pass not found - passes may not be initialized yet')
      }

      // If thick edges, also update TubeWireframe renderer
      if (useFatWireframe) {
        const tubeRenderer = graph.getPass('tube-wireframe') as WebGPUTubeWireframeRenderer | undefined
        if (tubeRenderer) {
          const instances = buildTubeInstances()
          console.log('[WebGPUScene] Updating tube wireframe instances for thick edges:', instances.length)
          tubeRenderer.updateInstances(device, instances)
        } else {
          console.warn('[WebGPUScene] TubeWireframe pass not found for thick edges')
        }
      }
    }
  }, [graph, needsGeometryBuffers, isStandardPolytope, useFatWireframe, geometryBuffers, objectType, geometry, faces])

  // Initialize passes - rebuild when dependencies change
  useEffect(() => {
    let cancelled = false

    const setupPasses = async () => {
      // Always clear existing passes before setting up new ones
      // This ensures no duplicate passes when dependencies change
      graph.clearPasses()

      currentObjectTypeRef.current = objectType

      console.log('[WebGPUScene] Setting up render passes for:', objectType)

      await setupRenderPasses(graph, {
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
        jetsGodRaysEnabled: blackholeSettings.jetsGodRaysEnabled,
        // Ground plane settings
        groundEnabled: environment.groundEnabled,
        activeWalls: environment.activeWalls,
        groundPlaneOffset: environment.groundPlaneOffset,
        groundPlaneColor: environment.groundPlaneColor,
        groundPlaneSizeScale: environment.groundPlaneSizeScale,
        showGroundGrid: environment.showGroundGrid,
        groundGridColor: environment.groundGridColor,
        groundGridSpacing: environment.groundGridSpacing,
        // Shader feature flags (from stores, affect shader compilation)
        shadowEnabled: lighting.shadowEnabled,
        temporalEnabled: performance_.temporalEnabled,
        sssEnabled: appearance.sssEnabled,
        fresnelEnabled: appearance.edgesVisible,
        iblQuality: environment.iblQuality,
        // Edge thickness: >1 uses TubeWireframe, <=1 uses line edges
        edgeThickness: appearance.edgeThickness,
      })

      if (cancelled) return

      // Compile the graph
      graph.compile()

      console.log('[WebGPUScene] Passes initialized, graph compiled')

      // Update geometry right after pass setup (if geometry type and geometry ready)
      if (needsGeometryBuffers && geometryBuffers && geometry) {
        try {
          const device = WebGPUDevice.getInstance().getDevice()
          const useFat = appearance.edgeThickness > 1

          // Helper to build tube instances
          const buildTubeInstancesForSetup = () => {
            const edges = geometry.edges
            const vertices = geometry.vertices
            return edges.map(([a, b]) => {
              const vA = vertices[a]
              const vB = vertices[b]
              if (!vA || !vB) return null
              return {
                start: {
                  x: vA[0] ?? 0,
                  y: vA[1] ?? 0,
                  z: vA[2] ?? 0,
                  extraA: [vA[3] ?? 0, vA[4] ?? 0, vA[5] ?? 0, vA[6] ?? 0] as [number, number, number, number],
                  extraB: [vA[7] ?? 0, vA[8] ?? 0, vA[9] ?? 0, vA[10] ?? 0] as [number, number, number, number],
                },
                end: {
                  x: vB[0] ?? 0,
                  y: vB[1] ?? 0,
                  z: vB[2] ?? 0,
                  extraA: [vB[3] ?? 0, vB[4] ?? 0, vB[5] ?? 0, vB[6] ?? 0] as [number, number, number, number],
                  extraB: [vB[7] ?? 0, vB[8] ?? 0, vB[9] ?? 0, vB[10] ?? 0] as [number, number, number, number],
                },
              }
            }).filter((e): e is NonNullable<typeof e> => e !== null)
          }

          if (isStandardPolytope) {
            // Standard polytopes: Always update face geometry in Polytope renderer
            const polytopeRenderer = graph.getPass('polytope') as WebGPUPolytopeRenderer | undefined
            if (polytopeRenderer) {
              console.log('[WebGPUScene] Updating polytope geometry after pass setup:', {
                faceCount: geometryBuffers.faceData?.indices.length ?? 0,
                edgeCount: useFat ? 0 : (geometryBuffers.edgeData?.indices.length ?? 0),
              })
              polytopeRenderer.updateGeometry(
                device,
                geometryBuffers.faceData ?? undefined,
                useFat ? undefined : geometryBuffers.edgeData ?? undefined
              )
            } else {
              console.warn('[WebGPUScene] Polytope pass not found after setup')
            }

            // If thick edges, also update TubeWireframe renderer
            if (useFat) {
              const tubeRenderer = graph.getPass('tube-wireframe') as WebGPUTubeWireframeRenderer | undefined
              if (tubeRenderer) {
                const instances = buildTubeInstancesForSetup()
                console.log('[WebGPUScene] Updating tube instances for thick polytope edges after setup:', instances.length)
                tubeRenderer.updateInstances(device, instances)
              }
            }
          } else {
            // Torus types: Always use TubeWireframe
            const tubeRenderer = graph.getPass('tube-wireframe') as WebGPUTubeWireframeRenderer | undefined
            if (tubeRenderer) {
              const instances = buildTubeInstancesForSetup()
              console.log('[WebGPUScene] Updating tube instances for torus after pass setup:', instances.length)
              tubeRenderer.updateInstances(device, instances)
            }
          }
        } catch (e) {
          console.warn('[WebGPUScene] Device not ready yet:', e)
        }
      }
    }

    setupPasses()

    return () => {
      cancelled = true
    }
  }, [graph, objectType, dimension, needsGeometryBuffers, isStandardPolytope, geometryBuffers, geometry, postProcessing.bloomEnabled, postProcessing.ssaoEnabled, postProcessing.ssrEnabled, postProcessing.antiAliasingMethod, postProcessing.bokehEnabled, postProcessing.refractionEnabled, postProcessing.gravityEnabled, postProcessing.paperEnabled, postProcessing.frameBlendingEnabled, postProcessing.cinematicEnabled, blackholeSettings.jetsGodRaysEnabled, environment.groundEnabled, environment.activeWalls, environment.groundPlaneSizeScale, environment.iblQuality, lighting.shadowEnabled, performance_.temporalEnabled, appearance.sssEnabled, appearance.edgesVisible, appearance.edgeThickness])

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
    // Extended store with computed basis vectors for Schrodinger
    // The basis vectors are computed in the render loop and cached in schroedingerBasisCacheRef
    // We merge them into the schroedinger slice so the renderer can read them
    graph.setStoreGetter('extended', () => {
      const state = useExtendedObjectStore.getState()
      // For Schrodinger, add cached basis vectors (computed in render loop)
      // This returns the cached Float32Arrays directly - NO new array creation
      if (objectType === 'schroedinger') {
        return {
          ...state,
          schroedinger: {
            ...state.schroedinger,
            basisX: schroedingerBasisCacheRef.current.basisX,
            basisY: schroedingerBasisCacheRef.current.basisY,
            basisZ: schroedingerBasisCacheRef.current.basisZ,
          },
        }
      }
      return state
    })
    graph.setStoreGetter('rotation', () => useRotationStore.getState())
    graph.setStoreGetter('transform', () => useTransformStore.getState())
    graph.setStoreGetter('pbr', () => usePBRStore.getState())
    graph.setStoreGetter('geometry', () => useGeometryStore.getState())
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
  }, [graph, ndTransform, geometry, dimension, projDistCache, objectType])

  // Reusable Map for rotation updates (avoid allocating per frame)
  const rotationUpdatesRef = useRef<Map<string, number>>(new Map())

  // Animation loop
  const renderFrame = useCallback(() => {
    const now = performance.now()
    const deltaTime = (now - lastTimeRef.current) / 1000 // Convert to seconds
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

    // Update N-D transform matrices from rotation store (matches WebGL PolytopeScene useFrame)
    if (needsGeometryBuffers) {
      ndTransform.update()
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

    // Execute render graph
    graph.execute(deltaTime)

    onFrame?.(deltaTime)

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(renderFrame)
  }, [graph, objectType, dimension, isPlaying, onFrame, needsGeometryBuffers, ndTransform, schroedingerRotation])

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
  // Jets god rays (black hole only)
  jetsGodRaysEnabled: boolean
  // Ground plane settings
  groundEnabled: boolean
  activeWalls: Set<string>
  groundPlaneOffset: number
  groundPlaneColor: string
  groundPlaneSizeScale: number
  showGroundGrid: boolean
  groundGridColor: string
  groundGridSpacing: number
  // Shader feature flags (affect shader compilation, read from stores)
  shadowEnabled: boolean
  temporalEnabled: boolean
  sssEnabled: boolean
  fresnelEnabled: boolean // edgesVisible in appearance store
  iblQuality: 'off' | 'low' | 'high' // IBL quality from environment store
  // Edge thickness: >1 uses TubeWireframe, <=1 uses line edges (Polytope renderer)
  edgeThickness: number
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
async function setupRenderPasses(graph: WebGPURenderGraph, config: PassConfig): Promise<void> {
  // ============================================================================
  // Define Resources
  // ============================================================================

  // Initial scene render (before post-processing)
  graph.addResource('scene-render', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // Object render buffer (Julia/Mandelbulb output, composited over environment)
  graph.addResource('object-color', {
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
  // Uses shader feature flags from config (read from stores) for shader compilation
  const objectRenderer = createObjectRenderer(config.objectType, config)
  if (objectRenderer) {
    await graph.addPass(objectRenderer)
  }

  // 1.5. Add TubeWireframe for standard polytopes with thick edges
  // Standard polytopes use PolytopeRenderer for faces, but need TubeWireframe for thick edges (>1)
  // This is separate from torus types which ONLY use TubeWireframe (no faces)
  const isStandardPolytope = ['hypercube', 'simplex', 'cross-polytope', 'wythoff-polytope'].includes(config.objectType)
  const useFatWireframe = config.edgeThickness > 1
  if (isStandardPolytope && useFatWireframe) {
    await graph.addPass(new WebGPUTubeWireframeRenderer({
      dimension: config.dimension,
      // Match WebGL: radius = edgeThickness * 0.015
      radius: config.edgeThickness * 0.015,
      shadows: config.shadowEnabled,
      // Don't clear - preserve face geometry from Polytope renderer
      clearBuffer: false,
    }))
  }

  // 2. Scene pass (environment) - outputs to scene-render buffer
  await graph.addPass(
    new ScenePass({
      outputResource: 'scene-render',
      depthResource: 'depth-buffer',
      mode: 'clear',
    })
  )

  // 2.5. Ground plane (optional) - renders walls/floor into the scene
  if (config.groundEnabled && config.activeWalls.size > 0) {
    // Calculate ground size based on scale
    const baseSize = 20
    const groundSize = baseSize * config.groundPlaneSizeScale

    const groundPlanePass = new WebGPUGroundPlaneRenderer({
      size: groundSize,
      shadows: false, // TODO: Wire up shadow settings
    })

    await graph.addPass(groundPlanePass)
  }

  // 3. GTAO (optional) - Ambient occlusion
  if (config.ssaoEnabled) {
    graph.addResource('aoBuffer', {
      type: 'texture',
      format: 'r8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    await graph.addPass(
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

    await graph.addPass(
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

    await graph.addPass(
      new ScreenSpaceLensingPass({
        colorInput: 'scene-render',
        depthInput: 'depth-buffer',
        outputResource: 'lensed-scene',
      })
    )

    // Also apply gravitational lensing to environment/skybox
    await graph.addPass(
      new GravitationalLensingPass({
        environmentInput: 'scene-render',
        outputResource: 'lensed-environment',
      })
    )
  }

  // 6. Jets rendering (black hole only) - render relativistic jets
  if (isBlackhole) {
    await graph.addPass(
      new JetsRenderPass({
        sceneDepthInput: 'depth-buffer',
        outputResource: 'jets-buffer',
      })
    )
  }

  // 7. Environment composite - composites object over environment, outputs to hdr-color
  // Use lensed scene if gravitational lensing was applied
  const envInput = isBlackhole && config.gravityEnabled ? 'lensed-scene' : 'scene-render'
  await graph.addPass(
    new EnvironmentCompositePass({
      lensedEnvironmentInput: isBlackhole && config.gravityEnabled ? 'lensed-environment' : envInput,
      mainObjectInput: 'object-color', // Read from object renderer output
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

    await graph.addPass(
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

    await graph.addPass(
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

    await graph.addPass(
      new BokehPass({
        colorInput: currentHDRBuffer,
        depthInput: 'depth-buffer',
        outputResource: 'bokeh-output',
      })
    )

    currentHDRBuffer = 'bokeh-output'
  }

  // 11. God Rays (optional, black hole only) - volumetric light scattering
  if (isBlackhole && config.jetsGodRaysEnabled) {
    graph.addResource('god-rays-output', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    await graph.addPass(
      new GodRaysPass({
        colorInput: currentHDRBuffer,
        outputResource: 'god-rays-output',
        lightPosition: [0, 0.5], // Center-top for jets
        exposure: 0.34,
        decay: 0.96,
        density: 0.6,
        weight: 0.4,
        samples: 64,
      })
    )

    currentHDRBuffer = 'god-rays-output'
  }

  // 12. Bloom (optional)
  // Note: BloomPass uses hardcoded resource names: input='hdr-color', output='bloom-output'
  // If we've modified currentHDRBuffer, we need to copy to hdr-color first
  if (config.bloomEnabled) {
    // If current buffer isn't hdr-color, we need the bloom to read from where we are
    // For now, bloom reads from hdr-color so effects after env composite go into bloom
    await graph.addPass(
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
      // COPY_SRC needed for FrameBlendingPass to copy output to history buffer
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    })

    await graph.addPass(
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
  await graph.addPass(
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

    await graph.addPass(
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

    await graph.addPass(
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
    await graph.addPass(
      new FXAAPass({
        subpixelQuality: 0.75,
      })
    )
  } else if (config.antiAliasingMethod === 'smaa') {
    await graph.addPass(
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

  await graph.addPass(
    new ToScreenPass({
      inputResource: finalInput,
    })
  )
}

/**
 * Create the appropriate object renderer based on object type and edge thickness.
 *
 * Uses shader feature flags from config (read from stores) rather than
 * hardcoded values. This matches WebGL behavior where stores drive rendering.
 *
 * Edge thickness logic (matches WebGL PolytopeScene.tsx line 415):
 * - edgeThickness > 1: Use TubeWireframe for thick 3D tube edges
 * - edgeThickness <= 1: Use Polytope renderer with line primitives
 *
 * Note: Each renderer has different config properties - we only pass
 * what each renderer's config interface supports.
 *
 * @param objectType - The type of object to render
 * @param config - Pass configuration including shader feature flags from stores
 * @returns The appropriate renderer pass or null if not supported
 */
function createObjectRenderer(objectType: ObjectType, config: PassConfig) {
  const { dimension, shadowEnabled, temporalEnabled, sssEnabled, ssaoEnabled, iblQuality, edgeThickness } = config
  // Note: fresnelEnabled (edgesVisible) is handled at uniform level, not shader compilation
  // IBL is controlled by iblQuality from environment store ('off' | 'low' | 'high')
  const iblEnabled = iblQuality !== 'off'
  // Use TubeWireframe for thick edges (>1), line primitives for thin edges (<=1)
  const useFatWireframe = edgeThickness > 1

  switch (objectType) {
    case 'mandelbulb':
      // MandelbulbRendererConfig: dimension, shadows, ambientOcclusion, sss, ibl, temporal
      return new WebGPUMandelbulbRenderer({
        dimension,
        shadows: shadowEnabled,
        ambientOcclusion: ssaoEnabled,
        sss: sssEnabled,
        temporal: temporalEnabled,
        ibl: iblEnabled,
      })

    case 'quaternion-julia':
      // JuliaRendererConfig: dimension, shadows, ambientOcclusion, sss, ibl, temporal
      return new WebGPUQuaternionJuliaRenderer({
        dimension,
        shadows: shadowEnabled,
        ambientOcclusion: ssaoEnabled,
        sss: sssEnabled,
        temporal: temporalEnabled,
        ibl: iblEnabled,
      })

    case 'schroedinger':
      // SchrodingerRendererConfig: dimension, isosurface, quantumMode, termCount, temporal
      // Note: Schrodinger uses volume rendering, not PBR - no shadows/sss/ibl support
      // DISABLED: Temporal accumulation requires quarter-res resources (quarter-color,
      // quarter-position) and WebGPUTemporalCloudPass which are not yet implemented.
      // Until the full temporal pipeline is wired up, force temporal: false.
      return new WebGPUSchrodingerRenderer({
        dimension,
        temporal: false, // Disabled - missing quarter-res resources and TemporalCloudPass
      })

    case 'blackhole':
      // BlackHoleRendererConfig: dimension, doppler, envMap, motionBlur
      // Note: Black hole uses its own physics-based lighting model
      return new WebGPUBlackHoleRenderer({
        dimension,
        doppler: true,
        envMap: true,
      })

    case 'hypercube':
    case 'simplex':
    case 'cross-polytope':
    case 'wythoff-polytope':
      // Standard polytopes: Always use Polytope renderer for faces
      // Edge rendering is handled by the renderer itself (thin edges via line primitives)
      // For thick edges (edgeThickness > 1), edges are disabled here and
      // TubeWireframe is added separately in setupRenderPasses
      // Use geometry-based normals for dimensions < 5 (matches WebGL SCREEN_SPACE_NORMAL_MIN_DIMENSION)
      return new WebGPUPolytopeRenderer({
        dimension,
        faces: true,
        edges: !useFatWireframe, // Disable line edges when using TubeWireframe
        useGeometryNormals: dimension < SCREEN_SPACE_NORMAL_MIN_DIMENSION,
      })

    case 'root-system':
    case 'clifford-torus':
    case 'nested-torus':
      // Extended polytope types: Use Polytope renderer for faces and edges (like standard polytopes)
      // For thick edges (edgeThickness > 1), TubeWireframe is added separately in setupRenderPasses
      // Use geometry-based normals for dimensions < 5 (matches WebGL SCREEN_SPACE_NORMAL_MIN_DIMENSION)
      return new WebGPUPolytopeRenderer({
        dimension,
        faces: true,
        edges: !useFatWireframe, // Disable line edges when using TubeWireframe
        useGeometryNormals: dimension < SCREEN_SPACE_NORMAL_MIN_DIMENSION,
      })

    default:
      console.warn(`WebGPU: No renderer for object type '${objectType}'`)
      return null
  }
}

export default WebGPUScene
