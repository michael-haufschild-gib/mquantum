/**
 * Types and utilities for efficient geometry transfer between workers and main thread.
 *
 * Uses TypedArrays and Transferable objects to minimize serialization overhead.
 */

import type { PolytopeGeometry, NdGeometry, ObjectType, GeometryMetadata } from './types'
import { createVector } from '@/lib/math'

/**
 * Transfer-optimized representation of PolytopeGeometry.
 * Uses flat TypedArrays instead of arrays of arrays.
 *
 * Supports both polytope types and extended object types (e.g., root-system).
 */
export interface TransferablePolytopeGeometry {
  /** Flattened vertex positions [v0_d0, v0_d1, ..., v1_d0, v1_d1, ...] */
  vertices: Float64Array
  /** Flattened edge indices [e0_start, e0_end, e1_start, e1_end, ...] */
  edges: Uint32Array
  /** Dimensionality of the vertices */
  dimension: number
  /** Type of object (polytope or extended) */
  type: ObjectType
  /** Metadata (copied, not transferred) */
  metadata?: GeometryMetadata
  /** Pre-computed face indices [f0_v0, f0_v1, f0_v2, f1_v0, ...] (optional) */
  faces?: Uint32Array
}

/**
 * Flattens a PolytopeGeometry or NdGeometry into a TransferablePolytopeGeometry.
 *
 * Extracts pre-computed faces from metadata.properties.analyticalFaces if present.
 *
 * @param geometry Source geometry (PolytopeGeometry or NdGeometry)
 * @returns Object containing the transferable geometry and the buffers to transfer
 */
export function flattenGeometry(geometry: PolytopeGeometry | NdGeometry): {
  transferable: TransferablePolytopeGeometry
  buffers: ArrayBuffer[]
} {
  const { vertices, edges, dimension, type, metadata } = geometry

  // Flatten vertices
  const numVertices = vertices.length
  const flatVertices = new Float64Array(numVertices * dimension)
  for (let i = 0; i < numVertices; i++) {
    const v = vertices[i]!
    for (let d = 0; d < dimension; d++) {
      flatVertices[i * dimension + d] = v[d] ?? 0
    }
  }

  // Flatten edges
  const numEdges = edges.length
  const flatEdges = new Uint32Array(numEdges * 2)
  for (let i = 0; i < numEdges; i++) {
    const e = edges[i]!
    flatEdges[i * 2] = e[0]
    flatEdges[i * 2 + 1] = e[1]
  }

  const buffers: ArrayBuffer[] = [flatVertices.buffer, flatEdges.buffer]
  const transferable: TransferablePolytopeGeometry = {
    vertices: flatVertices,
    edges: flatEdges,
    dimension,
    type: type as ObjectType,
    metadata,
  }

  // Extract and flatten pre-computed faces from metadata if present
  const analyticalFaces = metadata?.properties?.analyticalFaces as number[][] | undefined
  if (analyticalFaces && analyticalFaces.length > 0) {
    // Assume triangular faces (3 indices each)
    const flatFaces = new Uint32Array(analyticalFaces.length * 3)
    for (let i = 0; i < analyticalFaces.length; i++) {
      const face = analyticalFaces[i]!
      flatFaces[i * 3] = face[0]!
      flatFaces[i * 3 + 1] = face[1]!
      flatFaces[i * 3 + 2] = face[2]!
    }
    transferable.faces = flatFaces
    buffers.push(flatFaces.buffer)
  }

  return { transferable, buffers }
}

/**
 * Inflates a TransferablePolytopeGeometry back into a NdGeometry.
 *
 * Also reconstructs pre-computed faces from the flat array if present,
 * storing them in metadata.properties.analyticalFaces.
 *
 * @param transferable Transferable geometry received from worker
 * @returns Standard NdGeometry (compatible with both PolytopeGeometry and NdGeometry)
 * @throws Error if data is corrupted or indices are out of bounds
 */
export function inflateGeometry(transferable: TransferablePolytopeGeometry): NdGeometry {
  const {
    vertices: flatVertices,
    edges: flatEdges,
    faces: flatFaces,
    dimension,
    type,
    metadata,
  } = transferable

  // Validate input
  if (dimension < 1) {
    throw new Error(`Invalid dimension ${dimension}, must be >= 1`)
  }

  if (flatVertices.length % dimension !== 0) {
    throw new Error(
      `Vertex data corruption: buffer length ${flatVertices.length} is not divisible by dimension ${dimension}`
    )
  }

  if (flatEdges.length % 2 !== 0) {
    throw new Error(`Edge data corruption: buffer length ${flatEdges.length} is not divisible by 2`)
  }

  // Reconstruct vertices with bounds checking
  const numVertices = flatVertices.length / dimension
  const vertices = new Array(numVertices)
  for (let i = 0; i < numVertices; i++) {
    const v = createVector(dimension)
    for (let d = 0; d < dimension; d++) {
      const idx = i * dimension + d
      const value = flatVertices[idx]
      if (value === undefined) {
        throw new Error(`Vertex data corruption: index ${idx} out of bounds`)
      }
      v[d] = value
    }
    vertices[i] = v
  }

  // Reconstruct edges with bounds checking
  const numEdges = flatEdges.length / 2
  const edges: [number, number][] = new Array(numEdges)
  for (let i = 0; i < numEdges; i++) {
    const idx0 = i * 2
    const idx1 = i * 2 + 1
    const v0 = flatEdges[idx0]
    const v1 = flatEdges[idx1]

    if (v0 === undefined || v1 === undefined) {
      throw new Error(`Edge data corruption: edge ${i} indices out of bounds`)
    }

    // Validate edge indices reference valid vertices
    if (v0 >= numVertices || v1 >= numVertices) {
      throw new Error(
        `Edge data corruption: edge ${i} references vertex ${Math.max(v0, v1)} but only ${numVertices} vertices exist`
      )
    }

    edges[i] = [v0, v1]
  }

  // Reconstruct faces if present
  let resultMetadata = metadata
  if (flatFaces && flatFaces.length > 0) {
    if (flatFaces.length % 3 !== 0) {
      throw new Error(
        `Face data corruption: buffer length ${flatFaces.length} is not divisible by 3`
      )
    }

    const numFaces = flatFaces.length / 3
    const analyticalFaces: number[][] = new Array(numFaces)
    for (let i = 0; i < numFaces; i++) {
      const idx = i * 3
      const v0 = flatFaces[idx]
      const v1 = flatFaces[idx + 1]
      const v2 = flatFaces[idx + 2]

      if (v0 === undefined || v1 === undefined || v2 === undefined) {
        throw new Error(`Face data corruption: face ${i} has undefined indices`)
      }

      // Validate face indices reference valid vertices
      const maxIdx = Math.max(v0, v1, v2)
      if (maxIdx >= numVertices) {
        throw new Error(
          `Face data corruption: face ${i} references vertex ${maxIdx} but only ${numVertices} vertices exist`
        )
      }

      analyticalFaces[i] = [v0, v1, v2]
    }

    // Merge faces into metadata
    resultMetadata = {
      ...metadata,
      properties: {
        ...metadata?.properties,
        analyticalFaces,
        faceCount: numFaces,
      },
    }
  }

  return {
    vertices,
    edges,
    dimension,
    type,
    metadata: resultMetadata,
  }
}

// ============================================================================
// Face Transfer Utilities
// ============================================================================

/**
 * Flattens triangular faces into a Uint32Array for zero-copy transfer.
 *
 * Each triangle is stored as 3 consecutive vertex indices.
 * Total array length = faces.length * 3.
 *
 * @param faces - Array of triangular faces as [v0, v1, v2] tuples
 * @returns Flattened Uint32Array and its buffer for transfer
 *
 * @example
 * ```typescript
 * const faces: [number, number, number][] = [[0, 1, 2], [1, 2, 3]]
 * const { flatFaces, buffer } = flattenFaces(faces)
 * // flatFaces = Uint32Array([0, 1, 2, 1, 2, 3])
 * worker.postMessage({ faces: flatFaces }, [buffer])
 * ```
 */
export function flattenFaces(faces: [number, number, number][]): {
  flatFaces: Uint32Array
  buffer: ArrayBuffer
} {
  const flatFaces = new Uint32Array(faces.length * 3)

  for (let i = 0; i < faces.length; i++) {
    const face = faces[i]!
    flatFaces[i * 3] = face[0]
    flatFaces[i * 3 + 1] = face[1]
    flatFaces[i * 3 + 2] = face[2]
  }

  return {
    flatFaces,
    buffer: flatFaces.buffer,
  }
}

/**
 * Inflates a flattened Uint32Array back into triangular face tuples.
 *
 * @param flatFaces - Flattened face indices from worker
 * @returns Array of triangular faces as [v0, v1, v2] tuples
 * @throws Error if array length is not divisible by 3
 *
 * @example
 * ```typescript
 * const flatFaces = new Uint32Array([0, 1, 2, 1, 2, 3])
 * const faces = inflateFaces(flatFaces)
 * // faces = [[0, 1, 2], [1, 2, 3]]
 * ```
 */
export function inflateFaces(flatFaces: Uint32Array): [number, number, number][] {
  if (flatFaces.length % 3 !== 0) {
    throw new Error(`Face data corruption: buffer length ${flatFaces.length} is not divisible by 3`)
  }

  const numFaces = flatFaces.length / 3
  const faces: [number, number, number][] = new Array(numFaces)

  for (let i = 0; i < numFaces; i++) {
    const idx = i * 3
    const v0 = flatFaces[idx]
    const v1 = flatFaces[idx + 1]
    const v2 = flatFaces[idx + 2]

    if (v0 === undefined || v1 === undefined || v2 === undefined) {
      throw new Error(`Face data corruption: face ${i} has undefined indices`)
    }

    faces[i] = [v0, v1, v2]
  }

  return faces
}

// ============================================================================
// Vertex-Only Transfer Utilities
// ============================================================================

/**
 * Inflates a flattened Float64Array back into vertex arrays.
 *
 * Used when only vertices need to be reconstructed (e.g., for face computation
 * in worker where edges aren't needed).
 *
 * @param flatVertices - Flattened vertex positions
 * @param dimension - Dimensionality of each vertex
 * @returns Array of vertex coordinate arrays
 * @throws Error if buffer length is not divisible by dimension
 *
 * @example
 * ```typescript
 * const flatVertices = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
 * const vertices = inflateVerticesOnly(flatVertices, 3)
 * // vertices = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
 * ```
 */
export function inflateVerticesOnly(flatVertices: Float64Array, dimension: number): number[][] {
  if (dimension < 1) {
    throw new Error(`Invalid dimension ${dimension}, must be >= 1`)
  }

  if (flatVertices.length % dimension !== 0) {
    throw new Error(
      `Vertex data corruption: buffer length ${flatVertices.length} is not divisible by dimension ${dimension}`
    )
  }

  const numVertices = flatVertices.length / dimension
  const vertices: number[][] = new Array(numVertices)

  for (let i = 0; i < numVertices; i++) {
    const vertex: number[] = new Array(dimension)
    for (let d = 0; d < dimension; d++) {
      const idx = i * dimension + d
      const value = flatVertices[idx]
      if (value === undefined) {
        throw new Error(`Vertex data corruption: index ${idx} out of bounds`)
      }
      vertex[d] = value
    }
    vertices[i] = vertex
  }

  return vertices
}

/**
 * Inflates a flattened Uint32Array back into edge pairs.
 *
 * Used when edges need to be reconstructed for face computation in worker.
 *
 * @param flatEdges - Flattened edge indices [e0_v0, e0_v1, e1_v0, e1_v1, ...]
 * @returns Array of edge pairs as [v0, v1] tuples
 * @throws Error if buffer length is not divisible by 2
 *
 * @example
 * ```typescript
 * const flatEdges = new Uint32Array([0, 1, 1, 2, 2, 0])
 * const edges = inflateEdges(flatEdges)
 * // edges = [[0, 1], [1, 2], [2, 0]]
 * ```
 */
export function inflateEdges(flatEdges: Uint32Array): [number, number][] {
  if (flatEdges.length % 2 !== 0) {
    throw new Error(`Edge data corruption: buffer length ${flatEdges.length} is not divisible by 2`)
  }

  const numEdges = flatEdges.length / 2
  const edges: [number, number][] = new Array(numEdges)

  for (let i = 0; i < numEdges; i++) {
    const idx = i * 2
    const v0 = flatEdges[idx]
    const v1 = flatEdges[idx + 1]

    if (v0 === undefined || v1 === undefined) {
      throw new Error(`Edge data corruption: edge ${i} has undefined indices`)
    }

    edges[i] = [v0, v1]
  }

  return edges
}

/**
 * Flattens edge pairs into a Uint32Array for zero-copy transfer.
 *
 * Used when edges need to be sent to worker (e.g., for triangle face computation).
 *
 * @param edges - Array of edge pairs as [v0, v1] tuples
 * @returns Flattened Uint32Array and its buffer for transfer
 *
 * @example
 * ```typescript
 * const edges = [[0, 1], [1, 2], [2, 0]]
 * const { flatEdges, buffer } = flattenEdges(edges)
 * // flatEdges = Uint32Array([0, 1, 1, 2, 2, 0])
 * worker.postMessage({ edges: flatEdges }, [buffer])
 * ```
 */
export function flattenEdges(edges: [number, number][]): {
  flatEdges: Uint32Array
  buffer: ArrayBuffer
} {
  const flatEdges = new Uint32Array(edges.length * 2)

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]!
    flatEdges[i * 2] = edge[0]
    flatEdges[i * 2 + 1] = edge[1]
  }

  return {
    flatEdges,
    buffer: flatEdges.buffer,
  }
}

/**
 * Flattens vertex arrays into a Float64Array for zero-copy transfer.
 *
 * Used when only vertices need to be sent to worker (e.g., for face computation).
 *
 * @param vertices - Array of vertex coordinate arrays
 * @param dimension - Dimensionality of each vertex
 * @returns Flattened Float64Array and its buffer for transfer
 *
 * @example
 * ```typescript
 * const vertices = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
 * const { flatVertices, buffer } = flattenVerticesOnly(vertices, 3)
 * // flatVertices = Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
 * worker.postMessage({ vertices: flatVertices }, [buffer])
 * ```
 */
export function flattenVerticesOnly(
  vertices: number[][],
  dimension: number
): {
  flatVertices: Float64Array
  buffer: ArrayBuffer
} {
  const flatVertices = new Float64Array(vertices.length * dimension)

  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i]!
    for (let d = 0; d < dimension; d++) {
      flatVertices[i * dimension + d] = vertex[d] ?? 0
    }
  }

  return {
    flatVertices,
    buffer: flatVertices.buffer,
  }
}
