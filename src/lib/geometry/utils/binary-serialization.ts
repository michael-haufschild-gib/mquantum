/**
 * Binary Serialization for Polytope Geometry
 *
 * Converts polytope geometry to/from compact binary format for efficient
 * IndexedDB storage. Uses TypedArrays for ~2-3x storage reduction and
 * faster serialization compared to JSON.
 *
 * Binary format:
 * - Vertices: Float64Array (dimension * vertexCount floats)
 * - Edges: Uint32Array (2 * edgeCount integers)
 * - Metadata: JSON string (for flexibility)
 */

import type { VectorND } from '@/lib/math'
import { BINARY_FORMAT_VERSION } from '../config'
import type { PolytopeGeometry } from '../types'

/**
 * Binary representation of polytope geometry
 */
export interface BinaryPolytopeData {
  /** Number of dimensions */
  dimension: number
  /** Number of vertices */
  vertexCount: number
  /** Number of edges */
  edgeCount: number
  /** Packed vertex coordinates as Float64Array buffer */
  vertices: ArrayBuffer
  /** Packed edge indices as Uint32Array buffer */
  edges: ArrayBuffer
  /** JSON-encoded metadata */
  metadata: string
  /** Format version for future compatibility */
  version: number
}

/**
 * Serialize polytope geometry to compact binary format.
 *
 * @param geometry - Polytope geometry to serialize
 * @returns Binary representation
 */
export function serializeToBinary(geometry: PolytopeGeometry): BinaryPolytopeData {
  const { vertices, edges, metadata } = geometry
  const vertexCount = vertices.length
  const edgeCount = edges.length
  const dimension = vertices[0]?.length ?? 0

  // Pack vertices into Float64Array
  const vertexBuffer = new Float64Array(vertexCount * dimension)
  for (let i = 0; i < vertexCount; i++) {
    const vertex = vertices[i]!
    for (let j = 0; j < dimension; j++) {
      vertexBuffer[i * dimension + j] = vertex[j] ?? 0
    }
  }

  // Pack edges into Uint32Array
  const edgeBuffer = new Uint32Array(edgeCount * 2)
  for (let i = 0; i < edgeCount; i++) {
    const [v1, v2] = edges[i]!
    edgeBuffer[i * 2] = v1
    edgeBuffer[i * 2 + 1] = v2
  }

  return {
    dimension,
    vertexCount,
    edgeCount,
    vertices: vertexBuffer.buffer,
    edges: edgeBuffer.buffer,
    metadata: JSON.stringify(metadata ?? {}),
    version: BINARY_FORMAT_VERSION,
  }
}

/**
 * Deserialize binary data back to polytope geometry.
 *
 * @param data - Binary representation
 * @returns Polytope geometry
 */
export function deserializeFromBinary(data: BinaryPolytopeData): PolytopeGeometry {
  const { dimension, vertexCount, edgeCount, metadata } = data

  // Unpack vertices
  const vertexBuffer = new Float64Array(data.vertices)
  const vertices: VectorND[] = []
  for (let i = 0; i < vertexCount; i++) {
    const vertex: number[] = []
    for (let j = 0; j < dimension; j++) {
      vertex.push(vertexBuffer[i * dimension + j] ?? 0)
    }
    vertices.push(vertex)
  }

  // Unpack edges
  const edgeBuffer = new Uint32Array(data.edges)
  const edges: [number, number][] = []
  for (let i = 0; i < edgeCount; i++) {
    const v1 = edgeBuffer[i * 2] ?? 0
    const v2 = edgeBuffer[i * 2 + 1] ?? 0
    edges.push([v1, v2])
  }

  // Parse metadata
  let parsedMetadata: PolytopeGeometry['metadata']
  try {
    parsedMetadata = JSON.parse(metadata)
  } catch {
    parsedMetadata = undefined
  }

  return {
    type: 'wythoff-polytope',
    dimension,
    vertices,
    edges,
    metadata: parsedMetadata,
  }
}

/**
 * Check if data is in binary format with basic validation.
 *
 * Validates:
 * - All required fields exist with correct types
 * - Version is supported
 * - Dimension is in valid range (3-11)
 * - Counts are non-negative
 * - Buffer sizes match expected sizes
 *
 * @param data - Data to check
 * @returns True if valid binary format
 */
export function isBinaryFormat(data: unknown): data is BinaryPolytopeData {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>

  // Check types
  if (
    typeof obj.version !== 'number' ||
    typeof obj.dimension !== 'number' ||
    typeof obj.vertexCount !== 'number' ||
    typeof obj.edgeCount !== 'number' ||
    !(obj.vertices instanceof ArrayBuffer) ||
    !(obj.edges instanceof ArrayBuffer) ||
    typeof obj.metadata !== 'string'
  ) {
    return false
  }

  // Validate version
  if (obj.version !== BINARY_FORMAT_VERSION) {
    console.warn(
      `[BinarySerialization] Unknown version: ${obj.version}, expected ${BINARY_FORMAT_VERSION}`
    )
    return false
  }

  // Validate ranges
  if (obj.dimension < 3 || obj.dimension > 11) {
    return false
  }
  if (obj.vertexCount < 0 || obj.edgeCount < 0) {
    return false
  }

  // Validate buffer sizes match counts
  const expectedVertexBytes = obj.vertexCount * obj.dimension * 8 // Float64 = 8 bytes
  const expectedEdgeBytes = obj.edgeCount * 2 * 4 // Uint32 = 4 bytes

  if (obj.vertices.byteLength !== expectedVertexBytes) {
    console.warn(
      `[BinarySerialization] Vertex buffer size mismatch: ${obj.vertices.byteLength} vs expected ${expectedVertexBytes}`
    )
    return false
  }
  if (obj.edges.byteLength !== expectedEdgeBytes) {
    console.warn(
      `[BinarySerialization] Edge buffer size mismatch: ${obj.edges.byteLength} vs expected ${expectedEdgeBytes}`
    )
    return false
  }

  return true
}

/**
 * Calculate approximate size reduction from binary format.
 *
 * JSON representation: ~20 bytes per coordinate (number as string + commas)
 * Binary representation: 8 bytes per coordinate (Float64)
 * Ratio: ~2.5x reduction for vertices
 *
 * @param geometry - Geometry to estimate
 * @returns Object with JSON and binary sizes
 */
export function estimateStorageSizes(geometry: PolytopeGeometry): {
  jsonBytes: number
  binaryBytes: number
  ratio: number
} {
  const vertexCount = geometry.vertices.length
  const dimension = geometry.vertices[0]?.length ?? 0
  const edgeCount = geometry.edges.length

  // JSON estimate: ~20 bytes per number (including formatting)
  const jsonBytes =
    vertexCount * dimension * 20 + // vertex coordinates
    edgeCount * 2 * 8 + // edge indices
    500 // metadata overhead

  // Binary: 8 bytes per float64, 4 bytes per uint32
  const binaryBytes =
    vertexCount * dimension * 8 + // Float64Array for vertices
    edgeCount * 2 * 4 + // Uint32Array for edges
    200 // metadata JSON overhead

  return {
    jsonBytes,
    binaryBytes,
    ratio: jsonBytes / binaryBytes,
  }
}
