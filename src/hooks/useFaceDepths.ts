import { useMemo } from 'react'
import type { Face } from '@/lib/geometry'

/**
 * Hook to calculate per-face depth values for palette color variation.
 *
 * Computes a normalized [0,1] depth value for each face based on:
 * - For dimension > 3: Average of W+ coordinates (indices 3+) of face vertices
 * - For dimension === 3: Y-coordinate of face centroid
 *
 * These depth values drive palette color variation in the surface shader.
 *
 * @param originalVertices - The nD vertices (before projection to 3D)
 * @param faces - Array of face definitions (vertex indices)
 * @param dimension - Current dimension (3+)
 * @returns Array of normalized depth values [0,1], one per face
 */
export function useFaceDepths(
  originalVertices: number[][],
  faces: Face[],
  dimension: number
): number[] {
  return useMemo(() => {
    if (faces.length === 0 || originalVertices.length === 0) {
      return []
    }

    // Calculate raw depth for each face while tracking min/max in single pass
    // (avoids separate Math.min/max spread operations which are O(n) each)
    let minDepth = Infinity
    let maxDepth = -Infinity

    const rawDepths = faces.map((face) => {
      const vertexIndices = face.vertices

      if (vertexIndices.length === 0) {
        return 0
      }

      let depth: number

      if (dimension > 3) {
        // For 4D+: Average the W+ coordinates (indices 3 and beyond)
        let sum = 0
        let count = 0

        for (const vIdx of vertexIndices) {
          const vertex = originalVertices[vIdx]
          if (!vertex) continue

          // Sum all coordinates from index 3 onwards
          for (let d = 3; d < dimension; d++) {
            sum += vertex[d] ?? 0
            count++
          }
        }

        depth = count > 0 ? sum / count : 0
      } else {
        // For 3D: Use Y-coordinate of face centroid
        let sumY = 0
        let validCount = 0

        for (const vIdx of vertexIndices) {
          const vertex = originalVertices[vIdx]
          if (vertex && vertex.length > 1 && vertex[1] !== undefined) {
            sumY += vertex[1] // Y coordinate
            validCount++
          }
        }

        depth = validCount > 0 ? sumY / validCount : 0
      }

      // Track min/max during iteration (single pass)
      if (depth < minDepth) minDepth = depth
      if (depth > maxDepth) maxDepth = depth

      return depth
    })

    // Normalize to [0, 1] range
    if (rawDepths.length === 0) {
      return []
    }

    const range = maxDepth - minDepth

    // Avoid division by zero if all depths are the same
    if (range < 1e-10) {
      // All faces have same depth; use 0.5 for all
      return rawDepths.map(() => 0.5)
    }

    return rawDepths.map((depth) => (depth - minDepth) / range)
  }, [originalVertices, faces, dimension])
}
