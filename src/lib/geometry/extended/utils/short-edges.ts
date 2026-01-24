/**
 * Short Edge Builder for Root Systems
 *
 * Connects vertices that are at the minimum nonzero distance from each other.
 * This produces mathematically meaningful edges for root systems.
 *
 * @see docs/research/nd-extended-objects-guide.md Section 2.6
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
 * Builds edges connecting vertices at minimum nonzero distance
 *
 * Algorithm:
 * 1. Find minimum nonzero distance among all pairs
 * 2. Connect all pairs within (minDist * (1 + epsilon)) threshold
 *
 * This reveals the natural connectivity of root systems and similar
 * mathematically structured point sets.
 *
 * @param vertices - Array of n-dimensional vertices
 * @param epsilonFactor - Tolerance factor for distance matching (default 0.01)
 * @returns Array of edge pairs (vertex indices)
 *
 * @example
 * ```typescript
 * const roots = generateARoots(4, 1.0);
 * const edges = buildShortEdges(roots);
 * // Connects roots at minimum distance (natural root system structure)
 * ```
 */
export function buildShortEdges(
  vertices: VectorND[],
  epsilonFactor: number = 0.01
): [number, number][] {
  const n = vertices.length
  if (n < 2) {
    return []
  }

  // First pass: find minimum nonzero distance
  let minDistSq = Infinity
  const EPSILON_SQ = 1e-9

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d2 = distanceSquared(vertices[i]!, vertices[j]!)
      if (d2 > EPSILON_SQ && d2 < minDistSq) {
        minDistSq = d2
      }
    }
  }

  if (minDistSq === Infinity) {
    return []
  }

  // Threshold with tolerance
  const threshold = Math.sqrt(minDistSq) * (1 + epsilonFactor)
  const thresholdSq = threshold * threshold

  // Second pass: add edges under threshold
  const edges: [number, number][] = []

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d2 = distanceSquared(vertices[i]!, vertices[j]!)
      if (d2 <= thresholdSq) {
        edges.push([i, j])
      }
    }
  }

  return edges
}
