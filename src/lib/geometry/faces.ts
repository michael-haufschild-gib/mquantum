/**
 * Face detection for n-dimensional polytopes
 *
 * Detects 2D faces (polygons) from edge lists by building adjacency graphs
 * and finding cycles of length 3-4 that form closed polygons.
 *
 * Uses the Object Type Registry to determine the appropriate face detection
 * algorithm for each object type, avoiding hardcoded type checks.
 */

import { addVectors, crossProduct3D, dotProduct, scaleVector, subtractVectors } from '@/lib/math'
import type { Vector3D, VectorND } from '@/lib/math/types'
import {
  buildCliffordTorusGridFaces,
  buildGeneralizedCliffordTorusFaces,
  buildHopfTorus4DFaces,
  buildHopfTorus8DFaces,
  buildTorus10DFaces,
  buildTorus11DFaces,
  buildTorus3DGridFaces,
  buildTorus5DFaces,
  buildTorus6DFaces,
  buildTorus7DFaces,
  buildTorus9DFaces,
} from './extended/clifford-torus'
import { computeConvexHullFaces } from './extended/utils/convex-hull-faces'
import { generateHypercubeFaces } from './hypercube'
import { OBJECT_TYPE_REGISTRY } from './registry/registry'
import type { FaceDetectionMethod } from './registry/types'
import type { GeometryMetadata, ObjectType } from './types'

/**
 * Represents a 2D face (polygon) of a polytope
 */
export interface Face {
  /** Vertex indices forming the face (3 for triangle, 4 for quad) */
  vertices: number[]
  /** Optional computed normal vector in 3D */
  normal?: Vector3D
}

/**
 * Adjacency list representation for graph traversal
 */
type AdjacencyList = Map<number, Set<number>>

/**
 * Builds an adjacency list from edge pairs
 *
 * Creates a bidirectional graph where each vertex maps to its connected neighbors.
 *
 * @param edges - Array of edge pairs (vertex index tuples)
 * @returns Adjacency list mapping vertex indices to their neighbors
 *
 * @example
 * ```typescript
 * const edges: [number, number][] = [[0, 1], [1, 2], [2, 0]];
 * const adj = buildAdjacencyList(edges);
 * // adj.get(0) => Set(1, 2)
 * // adj.get(1) => Set(0, 2)
 * ```
 */
export function buildAdjacencyList(edges: [number, number][]): AdjacencyList {
  const adjacency: AdjacencyList = new Map()

  for (const [v1, v2] of edges) {
    if (!adjacency.has(v1)) {
      adjacency.set(v1, new Set())
    }
    if (!adjacency.has(v2)) {
      adjacency.set(v2, new Set())
    }
    adjacency.get(v1)!.add(v2)
    adjacency.get(v2)!.add(v1)
  }

  return adjacency
}

/**
 * Finds all triangular faces (3-cycles) in the graph
 *
 * Searches for all unique triangles where each pair of vertices is connected.
 * Returns vertices in consistent order (sorted).
 *
 * @param adjacency - Adjacency list representing the graph
 * @param vertexCount - Total number of vertices in the polytope
 * @param vertices - Vertex positions for winding order correction
 * @returns Array of triangular faces
 */
function findTriangles(
  adjacency: AdjacencyList,
  vertexCount: number,
  vertices: number[][]
): Face[] {
  const faces: Face[] = []
  const faceSet = new Set<string>()

  // Find all triangles: for each vertex v1, check if any two neighbors are also connected
  for (let v1 = 0; v1 < vertexCount; v1++) {
    const neighbors = adjacency.get(v1)
    if (!neighbors || neighbors.size < 2) continue

    const neighborArray = Array.from(neighbors)

    // Check all pairs of neighbors
    for (let i = 0; i < neighborArray.length; i++) {
      for (let j = i + 1; j < neighborArray.length; j++) {
        const v2 = neighborArray[i]!
        const v3 = neighborArray[j]!

        // Check if v2 and v3 are connected
        if (adjacency.get(v2)?.has(v3)) {
          // Use sorted key for deduplication only
          const sortedKey = [v1, v2, v3].sort((a, b) => a - b).join(',')

          if (!faceSet.has(sortedKey)) {
            faceSet.add(sortedKey)

            // Check winding order relative to origin (outward facing)
            const p1 = vertices[v1]!
            const p2 = vertices[v2]!
            const p3 = vertices[v3]!

            // Project to 3D for normal calculation
            const u = subtractVectors(to3D(p2), to3D(p1))
            const v = subtractVectors(to3D(p3), to3D(p1))
            const normal = crossProduct3D(u, v)

            // Calculate centroid
            let center = addVectors(p1, p2)
            center = addVectors(center, p3)
            center = scaleVector(center, 1.0 / 3.0)

            // Check orientation: dot(normal, center) > 0 means outward
            // (assuming center of object is origin, which is true for our simplex/cross-polytope)
            const isOutward = dotProduct(normal, to3D(center)) > 0

            if (isOutward) {
              faces.push({ vertices: [v1, v2, v3] })
            } else {
              faces.push({ vertices: [v1, v3, v2] })
            }
          }
        }
      }
    }
  }

  return faces
}

/**
 * Computes triangle faces from vertices and edges (worker-compatible)
 *
 * This is a standalone function that can be called from the web worker.
 * It builds the adjacency list and finds all triangular 3-cycles.
 *
 * @param vertices - Array of vertex positions
 * @param edges - Array of edge pairs
 * @returns Array of triangle face indices as [v0, v1, v2] tuples
 */
export function computeTriangleFaces(
  vertices: number[][],
  edges: [number, number][]
): [number, number, number][] {
  const adjacency = buildAdjacencyList(edges)
  const faces = findTriangles(adjacency, vertices.length, vertices)
  return faces.map((f) => [f.vertices[0]!, f.vertices[1]!, f.vertices[2]!])
}

/**
 * Grid face properties for worker computation
 */
export interface GridFacePropsWorker {
  visualizationMode?: string
  mode?: string
  resolutionU?: number
  resolutionV?: number
  resolutionXi1?: number
  resolutionXi2?: number
  k?: number
  stepsPerCircle?: number
  intrinsicDimension?: number
  torusCount?: number
  /** Config store key to determine grid type */
  configKey: 'cliffordTorus' | 'nestedTorus'
}

/**
 * Computes grid faces from properties (worker-compatible)
 *
 * This is a standalone function that can be called from the web worker.
 * It dispatches to the appropriate grid face builder based on the config key.
 *
 * @param props - Grid face properties
 * @returns Array of face vertex indices
 */
export function computeGridFaces(props: GridFacePropsWorker): number[][] {
  if (props.configKey === 'cliffordTorus') {
    return computeCliffordTorusGridFaces(props)
  } else if (props.configKey === 'nestedTorus') {
    return computeNestedTorusGridFaces(props)
  }
  return []
}

/**
 * Computes clifford-torus grid faces
 * @param props - Grid face computation properties
 * @returns Array of face indices
 */
function computeCliffordTorusGridFaces(props: GridFacePropsWorker): number[][] {
  const { visualizationMode, mode, resolutionU, resolutionV, k, stepsPerCircle } = props

  // Check for nested visualization mode first
  if (visualizationMode === 'nested') {
    return computeNestedVisualizationGridFaces(props)
  }

  // Flat mode or legacy mode - check internal mode
  if (mode === '3d-torus' && resolutionU && resolutionV) {
    return buildTorus3DGridFaces(resolutionU, resolutionV)
  } else if (mode === 'classic' && resolutionU && resolutionV) {
    return buildCliffordTorusGridFaces(resolutionU, resolutionV)
  } else if (mode === 'generalized' && k && stepsPerCircle) {
    return buildGeneralizedCliffordTorusFaces(k, stepsPerCircle)
  }

  return []
}

/**
 * Computes nested-torus grid faces
 * @param props - Grid face computation properties
 * @returns Array of face indices
 */
function computeNestedTorusGridFaces(props: GridFacePropsWorker): number[][] {
  return computeNestedVisualizationGridFaces(props)
}

/**
 * Shared logic for nested visualization grid faces
 * @param props - Grid face computation properties
 * @returns Array of face indices
 */
function computeNestedVisualizationGridFaces(props: GridFacePropsWorker): number[][] {
  const { intrinsicDimension, resolutionXi1, resolutionXi2, torusCount } = props

  if (!resolutionXi1 || !resolutionXi2) return []

  switch (intrinsicDimension) {
    case 4: {
      const count = torusCount ?? 1
      let faceIndices: number[][] = []
      for (let t = 0; t < count; t++) {
        const offset = t * resolutionXi1 * resolutionXi2
        const torusFaces = buildHopfTorus4DFaces(resolutionXi1, resolutionXi2, offset)
        faceIndices = faceIndices.concat(torusFaces)
      }
      return faceIndices
    }
    case 5:
      return buildTorus5DFaces(resolutionXi1, resolutionXi2)
    case 6:
      return buildTorus6DFaces(resolutionXi1, resolutionXi2)
    case 7:
      return buildTorus7DFaces(resolutionXi1, resolutionXi2)
    case 8:
      return buildHopfTorus8DFaces(resolutionXi1, resolutionXi2)
    case 9:
      return buildTorus9DFaces(resolutionXi1, resolutionXi2)
    case 10:
      return buildTorus10DFaces(resolutionXi1, resolutionXi2)
    case 11:
      return buildTorus11DFaces(resolutionXi1, resolutionXi2)
    default:
      return []
  }
}

/**
 * Extracts the first 3 coordinates of a vertex as a 3D vector
 * @param v - N-dimensional vertex
 * @returns 3D vector [x, y, z]
 */
function to3D(v: number[]): VectorND {
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0]
}

/**
 * Detects 2D faces (polygons) from an edge list of a polytope
 *
 * Uses the Object Type Registry to determine the appropriate face detection
 * algorithm for each object type. Supported methods:
 * - analytical-quad: Generates quad faces analytically (hypercube)
 * - triangles: Finds 3-cycles in adjacency graph (simplex, cross-polytope)
 * - convex-hull: Uses 3D convex hull projection (root-system, wythoff-polytope)
 * - grid: Uses UV grid structure from metadata (clifford-torus, nested-torus)
 * - none: Returns empty array (fractals, point clouds)
 *
 * @param vertices - Array of vertex positions in n-dimensional space
 * @param edges - Array of edge pairs (vertex indices)
 * @param objectType - Type of object (looked up in registry for face detection method)
 * @param metadata - Optional geometry metadata (required for grid-based detection)
 * @returns Array of detected faces with vertex indices
 *
 * @throws {Error} If vertices or edges array is empty
 * @throws {Error} If edge indices reference non-existent vertices
 *
 * @example
 * ```typescript
 * // Detect faces of a 3D cube
 * const cube = generateHypercube(3);
 * const faces = detectFaces(cube.vertices, cube.edges, 'hypercube');
 * console.log(faces.length); // 6 faces
 *
 * // Detect faces of a Wythoff polytope (uses convex-hull from registry)
 * const polytope = generateWythoffPolytope(4);
 * const faces = detectFaces(polytope.vertices, polytope.edges, 'wythoff-polytope');
 * ```
 */
export function detectFaces(
  vertices: number[][],
  edges: [number, number][],
  objectType: ObjectType,
  metadata?: GeometryMetadata
): Face[] {
  // Validate inputs
  if (vertices.length === 0) {
    throw new Error('Vertices array cannot be empty')
  }

  if (edges.length === 0) {
    throw new Error('Edges array cannot be empty')
  }

  // Validate edge indices
  for (const [v1, v2] of edges) {
    if (v1 < 0 || v1 >= vertices.length || v2 < 0 || v2 >= vertices.length) {
      throw new Error(`Edge [${v1}, ${v2}] references non-existent vertex`)
    }
  }

  // Get face detection method from registry
  const registryEntry = OBJECT_TYPE_REGISTRY.get(objectType)
  const faceDetection: FaceDetectionMethod = registryEntry?.rendering.faceDetection ?? 'none'

  // Dispatch to appropriate face detection algorithm
  return detectFacesByMethod(faceDetection, vertices, edges, objectType, metadata)
}

/**
 * Internal dispatcher that routes to the appropriate face detection algorithm
 * based on the method specified in the registry.
 *
 * @param method - Face detection method from registry
 * @param vertices - Vertex array
 * @param edges - Edge array
 * @param objectType - Object type (used for grid-based detection)
 * @param metadata - Geometry metadata (used for grid-based and metadata detection)
 * @returns Detected faces
 */
function detectFacesByMethod(
  method: FaceDetectionMethod,
  vertices: number[][],
  edges: [number, number][],
  objectType: ObjectType,
  metadata?: GeometryMetadata
): Face[] {
  switch (method) {
    case 'analytical-quad':
      return detectAnalyticalQuadFaces(vertices)

    case 'triangles':
      return detectTriangleFaces(vertices, edges)

    case 'convex-hull':
      return detectConvexHullFaces(vertices)

    case 'grid':
      return detectGridFaces(objectType, metadata)

    case 'metadata':
      return detectMetadataFaces(metadata)

    case 'metadata-or-triangles': {
      // Try metadata first (for presets with pre-computed faces like regular hypercube)
      const metadataFaces = detectMetadataFaces(metadata)
      if (metadataFaces.length > 0) {
        return metadataFaces
      }
      // Fall back to triangle detection (for presets without pre-computed faces)
      return detectTriangleFaces(vertices, edges)
    }

    case 'none':
    default:
      return []
  }
}

/**
 * Retrieves pre-computed faces from geometry metadata.
 * Used for Wythoff polytopes where faces are computed analytically during generation.
 * @param metadata - Geometry metadata containing analytical faces
 * @returns Array of Face objects
 */
function detectMetadataFaces(metadata?: GeometryMetadata): Face[] {
  if (!metadata?.properties?.analyticalFaces) {
    return []
  }

  const analyticalFaces = metadata.properties.analyticalFaces as number[][]
  return analyticalFaces.map((indices) => ({ vertices: indices }))
}

/**
 * Detects quad faces analytically (used for hypercubes).
 * Uses dimension formula to generate all quad faces without graph traversal.
 * @param vertices - Array of vertex coordinates
 * @returns Array of Face objects with quad indices
 */
function detectAnalyticalQuadFaces(vertices: number[][]): Face[] {
  const faceIndices = generateHypercubeFaces(Math.log2(vertices.length))
  return faceIndices.map((indices) => ({ vertices: indices }))
}

/**
 * Detects triangular faces by finding 3-cycles in the adjacency graph.
 * Used for simplices and cross-polytopes.
 * @param vertices - Array of vertex coordinates
 * @param edges - Array of edge index pairs
 * @returns Array of Face objects with triangle indices
 */
function detectTriangleFaces(vertices: number[][], edges: [number, number][]): Face[] {
  const adjacency = buildAdjacencyList(edges)
  return findTriangles(adjacency, vertices.length, vertices)
}

/**
 * Detects faces using 3D convex hull projection.
 * Used for root systems and Wythoff polytopes where faces are complex.
 * @param vertices - Array of vertex coordinates
 * @returns Array of Face objects with triangle indices
 */
function detectConvexHullFaces(vertices: number[][]): Face[] {
  const hullFaces = computeConvexHullFaces(vertices)
  return hullFaces.map(([v0, v1, v2]) => ({ vertices: [v0, v1, v2] }))
}

/**
 * Detects faces using UV grid structure from metadata.
 * Used for clifford-torus and nested-torus where faces follow a parametric grid.
 * Uses registry's configStoreKey to determine which grid type to use.
 * @param objectType - The type of geometry object
 * @param metadata - Geometry metadata with grid properties
 * @returns Array of Face objects
 */
function detectGridFaces(objectType: ObjectType, metadata?: GeometryMetadata): Face[] {
  if (!metadata?.properties) {
    return []
  }

  const props = metadata.properties
  let faceIndices: number[][] = []

  // Use registry to determine grid type based on configStoreKey
  const registryEntry = OBJECT_TYPE_REGISTRY.get(objectType)
  const configKey = registryEntry?.configStoreKey

  if (configKey === 'cliffordTorus') {
    faceIndices = detectCliffordTorusFaces(props)
  } else if (configKey === 'nestedTorus') {
    faceIndices = detectNestedTorusFaces(props)
  }

  return faceIndices.map((indices) => ({ vertices: indices }))
}

/**
 * Detects faces for clifford-torus based on its mode and resolution.
 * @param props - Geometry properties
 * @returns Array of face vertex indices
 */
function detectCliffordTorusFaces(props: Record<string, unknown>): number[][] {
  const visualizationMode = props.visualizationMode as string | undefined
  const mode = props.mode as string

  // Check for new visualization modes first
  if (visualizationMode === 'nested') {
    return detectNestedVisualizationFaces(props)
  }

  // Flat mode or legacy mode - check internal mode
  if (mode === '3d-torus') {
    const resU = props.resolutionU as number
    const resV = props.resolutionV as number
    return buildTorus3DGridFaces(resU, resV)
  } else if (mode === 'classic') {
    const resU = props.resolutionU as number
    const resV = props.resolutionV as number
    return buildCliffordTorusGridFaces(resU, resV)
  } else if (mode === 'generalized') {
    const k = props.k as number
    const stepsPerCircle = props.stepsPerCircle as number
    return buildGeneralizedCliffordTorusFaces(k, stepsPerCircle)
  }

  return []
}

/**
 * Detects faces for nested-torus based on dimension and resolution.
 * @param props - Geometry properties
 * @returns Array of face vertex indices
 */
function detectNestedTorusFaces(props: Record<string, unknown>): number[][] {
  return detectNestedVisualizationFaces(props)
}

/**
 * Shared logic for nested visualization mode (used by both clifford-torus and nested-torus).
 * @param props - Geometry properties
 * @returns Array of face vertex indices
 */
function detectNestedVisualizationFaces(props: Record<string, unknown>): number[][] {
  const dimension = props.intrinsicDimension as number
  const resXi1 = props.resolutionXi1 as number
  const resXi2 = props.resolutionXi2 as number

  switch (dimension) {
    case 4: {
      const torusCount = (props.torusCount as number) ?? 1
      let faceIndices: number[][] = []
      for (let t = 0; t < torusCount; t++) {
        const offset = t * resXi1 * resXi2
        const torusFaces = buildHopfTorus4DFaces(resXi1, resXi2, offset)
        faceIndices = faceIndices.concat(torusFaces)
      }
      return faceIndices
    }
    case 5:
      return buildTorus5DFaces(resXi1, resXi2)
    case 6:
      return buildTorus6DFaces(resXi1, resXi2)
    case 7:
      return buildTorus7DFaces(resXi1, resXi2)
    case 8:
      return buildHopfTorus8DFaces(resXi1, resXi2)
    case 9:
      return buildTorus9DFaces(resXi1, resXi2)
    case 10:
      return buildTorus10DFaces(resXi1, resXi2)
    case 11:
      return buildTorus11DFaces(resXi1, resXi2)
    default:
      return []
  }
}
