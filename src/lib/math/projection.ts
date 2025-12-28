/**
 * N-dimensional to 3D projection operations
 * Uses perspective projection for proper depth perception
 *
 * Uses WASM acceleration when available for improved performance.
 */

import type { Vector3D, VectorND } from './types'
import {
  isAnimationWasmReady,
  projectVerticesWasm,
  projectEdgesWasm,
  flattenVertices,
  flattenEdges,
} from '@/lib/wasm'

/**
 * Default projection distance for perspective projection
 * A larger value creates less extreme perspective effects
 */
export const DEFAULT_PROJECTION_DISTANCE = 4.0

/**
 * Minimum safe distance from projection plane to avoid division issues
 */
export const MIN_SAFE_DISTANCE = 0.01

/**
 * Projects an n-dimensional point to 3D using perspective projection
 *
 * Uses a SINGLE-STEP projection as recommended in the math guide:
 * - First 3 coordinates (x, y, z) are used directly
 * - All higher dimensions are combined into ONE effective depth value
 * - Perspective division is applied ONCE
 *
 * For nD → 3D:
 *   effectiveDepth = sum of all coordinates in dimensions 4+
 *   Formula: (x', y', z') = (x/(d-w), y/(d-w), z/(d-w))
 *   where w = effectiveDepth / sqrt(n-3) to normalize across dimensions
 *
 * This avoids the exponential shrinking that occurs with recursive projection.
 *
 * @param vertex - N-dimensional vertex (n ≥ 3)
 * @param projectionDistance - Distance from projection plane (default: 4.0)
 * @param out - Optional output vector to avoid allocation
 * @param normalizationFactor - Optional pre-calculated Math.sqrt(n-3) for performance
 * @returns 3D projected point
 * @throws {Error} If vertex has less than 3 dimensions (DEV only)
 * @note Validation is DEV-only for performance in production hot paths
 */
export function projectPerspective(
  vertex: VectorND,
  projectionDistance: number = DEFAULT_PROJECTION_DISTANCE,
  out?: Vector3D,
  normalizationFactor?: number
): Vector3D {
  if (import.meta.env.DEV) {
    if (vertex.length < 3) {
      throw new Error(`Cannot project ${vertex.length}D vertex to 3D: need at least 3 dimensions`)
    }
    if (projectionDistance <= 0) {
      throw new Error('Projection distance must be positive')
    }
  }

  const result = out ?? [0, 0, 0]

  const x = vertex[0]!
  const y = vertex[1]!
  const z = vertex[2]!

  // Calculate effective depth from all higher dimensions (0 for 3D)
  // Use signed sum to preserve direction (like standard 4D projection uses w directly)
  // Normalize by number of extra dimensions to keep consistent scale
  const numHigherDims = vertex.length - 3
  let effectiveDepth = 0

  if (numHigherDims > 0) {
    for (let d = 3; d < vertex.length; d++) {
      effectiveDepth += vertex[d]!
    }

    // Normalize: divide by sqrt of number of higher dimensions
    // This keeps the effective depth in a similar range regardless of dimension count
    const norm = normalizationFactor ?? Math.sqrt(numHigherDims)
    effectiveDepth = effectiveDepth / norm
  }

  // Apply single perspective division
  const denominator = projectionDistance - effectiveDepth

  // Check for singularity
  if (Math.abs(denominator) < MIN_SAFE_DISTANCE) {
    const safeDistance = denominator >= 0 ? MIN_SAFE_DISTANCE : -MIN_SAFE_DISTANCE
    const scale = 1 / safeDistance
    result[0] = x * scale
    result[1] = y * scale
    result[2] = z * scale
    return result
  }

  const scale = 1 / denominator
  result[0] = x * scale
  result[1] = y * scale
  result[2] = z * scale
  return result
}

/**
 * Projects an array of n-dimensional vertices to 3D using perspective projection
 * Applies the same projection to all vertices
 *
 * @param vertices - Array of n-dimensional vertices
 * @param projectionDistance - Distance from projection plane
 * @param out - Optional output array to avoid allocation
 * @returns Array of 3D projected points
 * @throws {Error} If any vertex has less than 3 dimensions (DEV only)
 * @note Validation is DEV-only for performance in production hot paths
 */
export function projectVertices(
  vertices: VectorND[],
  projectionDistance: number = DEFAULT_PROJECTION_DISTANCE,
  out?: Vector3D[]
): Vector3D[] {
  const len = vertices.length
  if (len === 0) {
    return []
  }

  // Validate all vertices have same dimension (DEV only)
  const firstVertex = vertices[0]
  if (!firstVertex) {
    return []
  }
  const dimension = firstVertex.length
  if (import.meta.env.DEV) {
    for (let i = 1; i < len; i++) {
      const vertex = vertices[i]
      if (!vertex || vertex.length !== dimension) {
        throw new Error(
          `All vertices must have same dimension: vertex 0 has ${dimension}, vertex ${i} has ${vertex?.length ?? 'undefined'}`
        )
      }
    }
  }

  // Use provided output or allocate new array
  const result = out ?? new Array(len)

  // Ensure output array has Vector3D elements
  for (let i = 0; i < len; i++) {
    if (!result[i]) {
      result[i] = [0, 0, 0]
    }
  }

  // Pre-calculate normalization factor once
  const normalizationFactor = dimension > 3 ? Math.sqrt(dimension - 3) : 1

  // Project each vertex with perspective projection
  for (let i = 0; i < len; i++) {
    projectPerspective(vertices[i]!, projectionDistance, result[i], normalizationFactor)
  }

  return result
}

/**
 * Calculates the depth of a point in n-dimensional space
 * For perspective rendering, points further from the viewer should be drawn first
 *
 * Depth is calculated as the Euclidean distance in the higher dimensions (4D+)
 * For 3D, returns 0 (no higher dimensions)
 * For 4D+, returns √(w² + v² + u² + ...)
 *
 * @param vertex - N-dimensional vertex
 * @returns Depth value (0 for 3D, distance in higher dims for 4D+)
 */
export function calculateDepth(vertex: VectorND): number {
  if (vertex.length <= 3) {
    return 0
  }

  let sumSquares = 0
  for (let i = 3; i < vertex.length; i++) {
    sumSquares += vertex[i]! * vertex[i]!
  }

  return Math.sqrt(sumSquares)
}

// Module-level scratch array for depth sorting (avoids allocation per call)
let depthScratch: { index: number; depth: number }[] = []

/**
 * Comparator for sorting by depth (furthest first)
 * @param a - First object with depth
 * @param a.depth - Depth value of first object
 * @param b - Second object with depth
 * @param b.depth - Depth value of second object
 * @returns Negative if b is closer, positive if a is closer
 */
function depthComparator(a: { depth: number }, b: { depth: number }): number {
  return b.depth - a.depth
}

/**
 * Sorts vertices by depth (furthest first) for proper rendering order
 * In perspective rendering, distant objects should be drawn before near objects
 *
 * Uses module-level scratch buffers to avoid allocation in hot paths.
 *
 * @param vertices - Array of n-dimensional vertices
 * @param out - Optional output array to avoid allocation
 * @returns Array of indices sorted by depth (furthest first)
 */
export function sortByDepth(vertices: VectorND[], out?: number[]): number[] {
  const len = vertices.length

  if (len === 0) {
    return out ?? []
  }

  // Resize scratch array if needed
  if (depthScratch.length < len) {
    const oldLen = depthScratch.length
    depthScratch.length = len
    for (let i = oldLen; i < len; i++) {
      depthScratch[i] = { index: 0, depth: 0 }
    }
  }

  // Fill scratch array with depth calculations
  for (let i = 0; i < len; i++) {
    depthScratch[i]!.index = i
    depthScratch[i]!.depth = calculateDepth(vertices[i]!)
  }

  // Sort in-place using a custom sort that only considers the first `len` elements
  // We sort the entire scratch but only use the first `len` entries
  // This avoids the slice() allocation
  depthScratch.length = len
  depthScratch.sort(depthComparator)

  // Use provided output or allocate new array
  // Note: We always allocate if no `out` provided because the result must be
  // a stable array the caller can keep. For true zero-alloc, caller must provide `out`.
  const result = out ?? new Array(len)

  // Extract indices into result array
  for (let i = 0; i < len; i++) {
    result[i] = depthScratch[i]!.index
  }

  return result
}

/**
 * Calculates an appropriate projection distance based on the bounding box of vertices
 * The projection distance should be larger than the maximum extent in higher dimensions
 * to avoid singularities
 *
 * @param vertices - Array of n-dimensional vertices
 * @param margin - Safety margin factor (default: 2.0)
 * @returns Recommended projection distance
 */
export function calculateProjectionDistance(vertices: VectorND[], margin = 2.0): number {
  if (vertices.length === 0) {
    return DEFAULT_PROJECTION_DISTANCE
  }

  const dimension = vertices[0]!.length

  if (dimension <= 3) {
    return DEFAULT_PROJECTION_DISTANCE
  }

  // Find maximum absolute value in higher dimensions (4D+)
  let maxHigherDim = 0
  for (const vertex of vertices) {
    for (let i = 3; i < vertex.length; i++) {
      maxHigherDim = Math.max(maxHigherDim, Math.abs(vertex[i]!))
    }
  }

  // Add margin to ensure we don't get too close to singularities
  return maxHigherDim * margin + 1.0
}

/**
 * Clips a line segment against the projection plane to prevent rendering artifacts
 * If a line crosses the projection plane, it should be clipped
 *
 * @param v1 - First vertex
 * @param v2 - Second vertex
 * @param projectionDistance - Distance from projection plane
 * @returns Tuple of [shouldDraw, clippedV1, clippedV2] or null if line should not be drawn
 */
export function clipLine(
  v1: VectorND,
  v2: VectorND,
  projectionDistance: number
): { shouldDraw: boolean; v1: VectorND; v2: VectorND } | null {
  if (v1.length !== v2.length) {
    throw new Error('Vertices must have same dimension')
  }

  if (v1.length <= 3) {
    // No clipping needed for 3D
    return { shouldDraw: true, v1, v2 }
  }

  // Check if both vertices are on the visible side
  // For simplicity, we check the highest dimension coordinate
  const dim = v1.length - 1
  const w1 = v1[dim]!
  const w2 = v2[dim]!

  const d1 = projectionDistance - w1
  const d2 = projectionDistance - w2

  // Both behind projection plane - don't draw
  if (d1 <= MIN_SAFE_DISTANCE && d2 <= MIN_SAFE_DISTANCE) {
    return null
  }

  // Both in front - draw as is
  if (d1 > MIN_SAFE_DISTANCE && d2 > MIN_SAFE_DISTANCE) {
    return { shouldDraw: true, v1, v2 }
  }

  // Line crosses projection plane - would need clipping
  // For now, we'll skip drawing lines that cross the plane
  // A full implementation would interpolate to find the intersection point
  return null
}

// ============================================================================
// HIGH-PERFORMANCE BUFFER PROJECTION API
// ============================================================================
// These functions write directly into Float32Array buffers for Three.js
// BufferAttribute.array, eliminating intermediate Vector3D[] allocations.

/**
 * Projects an array of n-dimensional vertices directly into a Float32Array.
 * This is the high-performance API for Three.js buffer updates.
 *
 * Instead of creating intermediate Vector3D[] arrays, this writes projected
 * (x, y, z) values directly into a Float32Array suitable for BufferAttribute.
 *
 * Uses WASM acceleration when available for improved performance.
 *
 * @param vertices - Array of n-dimensional vertices to project
 * @param positions - Target Float32Array to write into (must have length >= vertices.length * 3)
 * @param projectionDistance - Distance from projection plane (default: 4.0)
 * @param offset - Starting offset in the positions array (default: 0)
 * @returns Number of vertices written (same as vertices.length on success)
 * @throws {Error} If positions array is too small or vertices have < 3 dimensions (DEV only)
 * @note Validation is DEV-only for performance in production hot paths
 *
 * @example
 * ```ts
 * const positions = new Float32Array(vertices.length * 3);
 * projectVerticesToPositions(vertices, positions, 4.0);
 * geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
 * ```
 */
export function projectVerticesToPositions(
  vertices: VectorND[],
  positions: Float32Array,
  projectionDistance: number = DEFAULT_PROJECTION_DISTANCE,
  offset = 0
): number {
  const len = vertices.length
  if (len === 0) return 0

  if (import.meta.env.DEV) {
    const requiredSize = offset + len * 3
    if (positions.length < requiredSize) {
      throw new Error(`Positions array too small: need ${requiredSize}, got ${positions.length}`)
    }
  }

  const firstVertex = vertices[0]
  if (import.meta.env.DEV && (!firstVertex || firstVertex.length < 3)) {
    throw new Error('Vertices must have at least 3 dimensions')
  }

  const dimension = firstVertex!.length

  // Try WASM path if available and offset is 0 (most common case)
  if (isAnimationWasmReady() && offset === 0) {
    const flatVerts = flattenVertices(vertices)
    const wasmResult = projectVerticesWasm(flatVerts, dimension, projectionDistance)
    if (wasmResult && wasmResult.length === len * 3) {
      positions.set(wasmResult)
      return len
    }
    // WASM failed, fall through to JS implementation
  }

  // OPT-PROJ-1: Specialized paths for common dimensions (unrolled loops)
  switch (dimension) {
    case 3:
      projectVertices3D(vertices, positions, projectionDistance, offset, len)
      break
    case 4:
      projectVertices4D(vertices, positions, projectionDistance, offset, len)
      break
    case 5:
      projectVertices5D(vertices, positions, projectionDistance, offset, len)
      break
    default:
      projectVerticesND(vertices, positions, projectionDistance, offset, len, dimension)
      break
  }

  return len
}

/**
 * 3D projection - no higher dims, just perspective divide.
 * @param vertices - Array of N-dimensional vertices
 * @param positions - Output Float32Array for 3D positions
 * @param projectionDistance - Distance for perspective projection
 * @param offset - Starting offset in positions array
 * @param len - Number of vertices to project
 */
function projectVertices3D(
  vertices: VectorND[],
  positions: Float32Array,
  projectionDistance: number,
  offset: number,
  len: number
): void {
  const scale = 1 / projectionDistance
  for (let i = 0; i < len; i++) {
    const v = vertices[i]!
    const idx = offset + i * 3
    positions[idx] = v[0]! * scale
    positions[idx + 1] = v[1]! * scale
    positions[idx + 2] = v[2]! * scale
  }
}

/**
 * 4D projection - single higher dim, unrolled.
 * @param vertices - Array of N-dimensional vertices
 * @param positions - Output Float32Array for 3D positions
 * @param projectionDistance - Distance for perspective projection
 * @param offset - Starting offset in positions array
 * @param len - Number of vertices to project
 */
function projectVertices4D(
  vertices: VectorND[],
  positions: Float32Array,
  projectionDistance: number,
  offset: number,
  len: number
): void {
  // numHigherDims = 1, normalizationFactor = 1.0
  for (let i = 0; i < len; i++) {
    const v = vertices[i]!
    const x = v[0]!
    const y = v[1]!
    const z = v[2]!
    const w = v[3]!  // Direct access, no loop
    
    let denom = projectionDistance - w
    if (Math.abs(denom) < MIN_SAFE_DISTANCE) {
      denom = denom >= 0 ? MIN_SAFE_DISTANCE : -MIN_SAFE_DISTANCE
    }
    const scale = 1 / denom
    
    const idx = offset + i * 3
    positions[idx] = x * scale
    positions[idx + 1] = y * scale
    positions[idx + 2] = z * scale
  }
}

/**
 * 5D projection - two higher dims, unrolled.
 * @param vertices - Array of N-dimensional vertices
 * @param positions - Output Float32Array for 3D positions
 * @param projectionDistance - Distance for perspective projection
 * @param offset - Starting offset in positions array
 * @param len - Number of vertices to project
 */
function projectVertices5D(
  vertices: VectorND[],
  positions: Float32Array,
  projectionDistance: number,
  offset: number,
  len: number
): void {
  const SQRT2_INV = 0.7071067811865475  // 1 / sqrt(2)
  for (let i = 0; i < len; i++) {
    const v = vertices[i]!
    const x = v[0]!
    const y = v[1]!
    const z = v[2]!
    // Direct access to both higher dims, no loop
    const effectiveDepth = (v[3]! + v[4]!) * SQRT2_INV
    
    let denom = projectionDistance - effectiveDepth
    if (Math.abs(denom) < MIN_SAFE_DISTANCE) {
      denom = denom >= 0 ? MIN_SAFE_DISTANCE : -MIN_SAFE_DISTANCE
    }
    const scale = 1 / denom
    
    const idx = offset + i * 3
    positions[idx] = x * scale
    positions[idx + 1] = y * scale
    positions[idx + 2] = z * scale
  }
}

/**
 * Generic N-D projection fallback.
 * @param vertices - Array of N-dimensional vertices
 * @param positions - Output Float32Array for 3D positions
 * @param projectionDistance - Distance for perspective projection
 * @param offset - Starting offset in positions array
 * @param len - Number of vertices to project
 * @param dimension - The dimension of the source vertices
 */
function projectVerticesND(
  vertices: VectorND[],
  positions: Float32Array,
  projectionDistance: number,
  offset: number,
  len: number,
  dimension: number
): void {
  const numHigherDims = dimension - 3
  const normalizationFactor = Math.sqrt(numHigherDims)
  
  for (let i = 0; i < len; i++) {
    const vertex = vertices[i]!
    const x = vertex[0]!
    const y = vertex[1]!
    const z = vertex[2]!

    let effectiveDepth = 0
    for (let d = 3; d < dimension; d++) {
      effectiveDepth += vertex[d]!
    }
    effectiveDepth = effectiveDepth / normalizationFactor

    let denominator = projectionDistance - effectiveDepth
    if (Math.abs(denominator) < MIN_SAFE_DISTANCE) {
      denominator = denominator >= 0 ? MIN_SAFE_DISTANCE : -MIN_SAFE_DISTANCE
    }
    const scale = 1 / denominator

    const idx = offset + i * 3
    positions[idx] = x * scale
    positions[idx + 1] = y * scale
    positions[idx + 2] = z * scale
  }
}

/**
 * Projects edge pairs directly into a Float32Array for LineSegments2 geometry.
 * Each edge is written as 6 floats: [x1, y1, z1, x2, y2, z2].
 *
 * This eliminates the need for intermediate Vector3D[] buffers when updating
 * fat line geometry in the animation loop.
 *
 * Uses WASM acceleration when available for improved performance.
 *
 * @param vertices - Array of n-dimensional vertices (source positions)
 * @param edges - Array of edge pairs as [startIndex, endIndex]
 * @param positions - Target Float32Array (must have length >= edges.length * 6)
 * @param projectionDistance - Distance from projection plane (default: 4.0)
 * @param offset - Starting offset in the positions array (default: 0)
 * @returns Number of edges written (same as edges.length on success)
 * @throws {Error} If positions array is too small or vertices have < 3 dimensions (DEV only)
 * @note Validation is DEV-only for performance in production hot paths
 *
 * @example
 * ```ts
 * const positions = new Float32Array(edges.length * 6);
 * projectEdgesToPositions(vertices, edges, positions, 4.0);
 * fatLineGeometry.setPositions(positions);
 * ```
 */
export function projectEdgesToPositions(
  vertices: VectorND[],
  edges: ReadonlyArray<readonly [number, number]> | [number, number][],
  positions: Float32Array,
  projectionDistance: number = DEFAULT_PROJECTION_DISTANCE,
  offset = 0
): number {
  const numEdges = edges.length
  if (numEdges === 0) return 0

  if (import.meta.env.DEV) {
    const requiredSize = offset + numEdges * 6
    if (positions.length < requiredSize) {
      throw new Error(`Positions array too small: need ${requiredSize}, got ${positions.length}`)
    }
  }

  if (vertices.length === 0) return 0

  const firstVertex = vertices[0]
  if (import.meta.env.DEV && (!firstVertex || firstVertex.length < 3)) {
    throw new Error('Vertices must have at least 3 dimensions')
  }

  const dimension = firstVertex!.length

  // Try WASM path if available and offset is 0 (most common case)
  if (isAnimationWasmReady() && offset === 0) {
    const flatVerts = flattenVertices(vertices)
    const flatEdgeIndices = flattenEdges(edges as [number, number][])
    const wasmResult = projectEdgesWasm(flatVerts, dimension, flatEdgeIndices, projectionDistance)
    if (wasmResult && wasmResult.length === numEdges * 6) {
      positions.set(wasmResult)
      return numEdges
    }
    // WASM failed, fall through to JS implementation
  }

  const numHigherDims = dimension - 3
  const normalizationFactor = numHigherDims > 0 ? Math.sqrt(numHigherDims) : 1

  // Perspective projection for all edges (JS fallback)
  for (let e = 0; e < numEdges; e++) {
    const [startIdx, endIdx] = edges[e]!
    const v1 = vertices[startIdx]
    const v2 = vertices[endIdx]

    const idx = offset + e * 6

    if (!v1 || !v2) {
      // Write zeros for invalid edges
      positions[idx] = 0
      positions[idx + 1] = 0
      positions[idx + 2] = 0
      positions[idx + 3] = 0
      positions[idx + 4] = 0
      positions[idx + 5] = 0
      continue
    }

    // Project first vertex
    let effectiveDepth1 = 0
    if (numHigherDims > 0) {
      for (let d = 3; d < dimension; d++) {
        effectiveDepth1 += v1[d]!
      }
      effectiveDepth1 = effectiveDepth1 / normalizationFactor
    }
    let denom1 = projectionDistance - effectiveDepth1
    if (Math.abs(denom1) < MIN_SAFE_DISTANCE) {
      denom1 = denom1 >= 0 ? MIN_SAFE_DISTANCE : -MIN_SAFE_DISTANCE
    }
    const scale1 = 1 / denom1

    positions[idx] = v1[0]! * scale1
    positions[idx + 1] = v1[1]! * scale1
    positions[idx + 2] = v1[2]! * scale1

    // Project second vertex
    let effectiveDepth2 = 0
    if (numHigherDims > 0) {
      for (let d = 3; d < dimension; d++) {
        effectiveDepth2 += v2[d]!
      }
      effectiveDepth2 = effectiveDepth2 / normalizationFactor
    }
    let denom2 = projectionDistance - effectiveDepth2
    if (Math.abs(denom2) < MIN_SAFE_DISTANCE) {
      denom2 = denom2 >= 0 ? MIN_SAFE_DISTANCE : -MIN_SAFE_DISTANCE
    }
    const scale2 = 1 / denom2

    positions[idx + 3] = v2[0]! * scale2
    positions[idx + 4] = v2[1]! * scale2
    positions[idx + 5] = v2[2]! * scale2
  }

  return numEdges
}
