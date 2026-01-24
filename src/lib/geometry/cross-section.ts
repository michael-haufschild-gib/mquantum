/**
 * Cross-Section Computation
 * Computes the intersection of n-dimensional polytopes with hyperplanes
 */

import type { VectorND } from '@/lib/math/types'
import type { PolytopeGeometry, NdGeometry } from './types'
import type { Face } from './faces'

/**
 * Result of a cross-section computation
 */
export interface CrossSectionResult {
  /** 3D points forming the cross-section (W coordinate dropped) */
  points: VectorND[]
  /** Edges connecting the cross-section points */
  edges: [number, number][]
  /** Whether the slice intersects the polytope */
  hasIntersection: boolean
}

/**
 * Computes the cross-section of a geometry at a given W position
 *
 * For each edge of the geometry, checks if it crosses the hyperplane W = sliceW.
 * If so, computes the intersection point using linear interpolation.
 *
 * @param geometry - The geometry (polytope or root system, must be 4D or higher)
 * @param sliceW - The W coordinate of the slicing hyperplane
 * @param faces - Optional array of faces to correctly reconstruct connectivity
 * @returns CrossSectionResult with intersection points and edges
 */
export function computeCrossSection(
  geometry: PolytopeGeometry | NdGeometry,
  sliceW: number,
  faces?: Face[]
): CrossSectionResult {
  if (geometry.dimension < 4) {
    return { points: [], edges: [], hasIntersection: false }
  }

  const intersectionPoints: VectorND[] = []
  const edgeToPointIndex = new Map<string, number>() // Edge key -> point index

  // Helper to get edge key
  const getEdgeKey = (v1: number, v2: number) => (v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`)

  // For each edge, check if it crosses the W = sliceW plane
  for (const [v1Idx, v2Idx] of geometry.edges) {
    const v1 = geometry.vertices[v1Idx]
    const v2 = geometry.vertices[v2Idx]

    if (!v1 || !v2) continue

    const w1 = v1[3] ?? 0 // W coordinate of first vertex
    const w2 = v2[3] ?? 0 // W coordinate of second vertex

    // Check if edge crosses the slice plane
    if ((w1 <= sliceW && w2 >= sliceW) || (w1 >= sliceW && w2 <= sliceW)) {
      // Skip if both points are exactly on the plane (edge lies in plane)
      if (Math.abs(w1 - sliceW) < 1e-8 && Math.abs(w2 - sliceW) < 1e-8) {
        continue
      }

      // Compute intersection point using linear interpolation
      // Use 1e-8 epsilon to handle near-parallel edges with better floating-point tolerance
      const t = Math.abs(w2 - w1) < 1e-8 ? 0 : (sliceW - w1) / (w2 - w1)

      // Clamp t to [0, 1] for numerical stability
      const tClamped = Math.max(0, Math.min(1, t))

      // Interpolate all coordinates (we'll use X, Y, Z for the 3D result)
      const intersectionPoint: VectorND = []
      for (let i = 0; i < geometry.dimension; i++) {
        const coord1 = v1[i] ?? 0
        const coord2 = v2[i] ?? 0
        intersectionPoint[i] = coord1 + tClamped * (coord2 - coord1)
      }

      const edgeKey = getEdgeKey(v1Idx, v2Idx)
      if (!edgeToPointIndex.has(edgeKey)) {
        edgeToPointIndex.set(edgeKey, intersectionPoints.length)
        intersectionPoints.push(intersectionPoint)
      }
    }
  }

  if (intersectionPoints.length === 0) {
    return { points: [], edges: [], hasIntersection: false }
  }

  const crossSectionEdges: [number, number][] = []

  // Method 1: Face-based reconstruction (Correct)
  if (faces && faces.length > 0) {
    for (const face of faces) {
      const faceIntersectionIndices: number[] = []

      // Iterate through edges of the face
      // A face with vertices [v1, v2, v3, ...] has edges (v1,v2), (v2,v3), ..., (vn,v1)
      const len = face.vertices.length
      for (let i = 0; i < len; i++) {
        const v1 = face.vertices[i]!
        const v2 = face.vertices[(i + 1) % len]!

        const key = getEdgeKey(v1, v2)
        if (edgeToPointIndex.has(key)) {
          faceIntersectionIndices.push(edgeToPointIndex.get(key)!)
        }
      }

      // If a face is intersected by a plane, it typically results in a line segment (2 points)
      // If the face is non-convex or the slice is perfectly aligned, it could be more,
      // but for convex polytope faces, 2 points mean 1 edge.
      if (faceIntersectionIndices.length === 2) {
        crossSectionEdges.push([faceIntersectionIndices[0]!, faceIntersectionIndices[1]!])
      }
    }
  } else {
    // Method 2: Heuristic (Fallback - Flawed but kept for legacy/fallback)
    // Connect points that came from edges sharing a vertex.
    // This only works correctly for Simplex faces (triangles), not Hypercubes (quads).
    const edgeKeys = Array.from(edgeToPointIndex.keys())
    for (let i = 0; i < edgeKeys.length; i++) {
      for (let j = i + 1; j < edgeKeys.length; j++) {
        const key1 = edgeKeys[i]!
        const key2 = edgeKeys[j]!

        const [a1, b1] = key1.split('-').map(Number)
        const [a2, b2] = key2.split('-').map(Number)

        if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) {
          const idx1 = edgeToPointIndex.get(key1)!
          const idx2 = edgeToPointIndex.get(key2)!
          crossSectionEdges.push([idx1, idx2])
        }
      }
    }
  }

  return {
    points: intersectionPoints,
    edges: crossSectionEdges,
    hasIntersection: true,
  }
}

/**
 * Projects cross-section points to 3D by dropping the W coordinate
 *
 * @param result - Cross-section result
 * @returns Array of 3D points [x, y, z]
 */
export function projectCrossSectionTo3D(result: CrossSectionResult): VectorND[] {
  return result.points.map((point) => [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0])
}

/**
 * Computes the W-coordinate range of a geometry
 *
 * @param geometry - The geometry (polytope or extended object)
 * @returns [minW, maxW] tuple
 */
export function getWRange(geometry: PolytopeGeometry | NdGeometry): [number, number] {
  if (geometry.dimension < 4 || geometry.vertices.length === 0) {
    return [0, 0]
  }

  let minW = Infinity
  let maxW = -Infinity

  for (const vertex of geometry.vertices) {
    const w = vertex[3] ?? 0
    minW = Math.min(minW, w)
    maxW = Math.max(maxW, w)
  }

  return [minW, maxW]
}
