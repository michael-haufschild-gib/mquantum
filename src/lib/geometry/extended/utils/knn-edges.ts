/**
 * K-Nearest Neighbor Edge Builder
 *
 * Connects each point to its k nearest neighbors to create a wireframe
 * structure from a point cloud.
 *
 * @see docs/research/nd-extended-objects-guide.md Section 1.5
 */

import type { VectorND } from '@/lib/math/types'

/**
 * Computes squared Euclidean distance between two n-dimensional points
 *
 * @param a - First point
 * @param b - Second point
 * @returns Squared distance
 */
function distanceSquared(a: VectorND, b: VectorND): number {
  let sum = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const d = a[i]! - b[i]!
    sum += d * d
  }
  return sum
}

/**
 * Builds edges connecting each point to its k nearest neighbors
 *
 * Performance note: This is O(N^2) for N points. For large point counts
 * (> 2000), this may be slow. Consider using spatial hashing or
 * approximate nearest neighbors for better performance.
 *
 * @param points - Array of n-dimensional points
 * @param k - Number of nearest neighbors to connect to each point
 * @returns Array of edge pairs (vertex indices)
 *
 * @example
 * ```typescript
 * const edges = buildKnnEdges(points, 4);
 * // Each point connects to its 4 nearest neighbors
 * ```
 */
export function buildKnnEdges(points: VectorND[], k: number): [number, number][] {
  const n = points.length
  if (n === 0 || k <= 0) {
    return []
  }

  // Cap k to n-1 (can't have more neighbors than other points)
  const effectiveK = Math.min(k, n - 1)

  // Use a Set to avoid duplicate edges
  const edgeSet = new Set<string>()
  const edges: [number, number][] = []

  for (let i = 0; i < n; i++) {
    // Compute distances to all other points
    const distances: Array<{ j: number; d2: number }> = []

    for (let j = 0; j < n; j++) {
      if (j === i) continue
      distances.push({
        j,
        d2: distanceSquared(points[i]!, points[j]!),
      })
    }

    // Sort by distance and take k nearest
    distances.sort((a, b) => a.d2 - b.d2)
    const neighbors = distances.slice(0, effectiveK)

    // Add edges (ensuring no duplicates and i < j ordering)
    for (const { j } of neighbors) {
      const minIdx = Math.min(i, j)
      const maxIdx = Math.max(i, j)
      const key = `${minIdx},${maxIdx}`

      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push([minIdx, maxIdx])
      }
    }
  }

  return edges
}
