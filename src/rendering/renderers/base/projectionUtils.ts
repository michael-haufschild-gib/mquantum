/**
 * Projection Distance Utilities for N-D Renderers
 *
 * Provides utilities for calculating safe projection distances that ensure
 * all vertices remain visible without singularities. Used by N-D renderers
 * to avoid vertices crossing the projection plane.
 *
 * @module rendering/renderers/base/projectionUtils
 */

import { useRef } from 'react'

import { DEFAULT_PROJECTION_DISTANCE } from '@/lib/math/projection'
import type { VectorND } from '@/lib/math/types'

// Re-export for convenience
export { DEFAULT_PROJECTION_DISTANCE }

/**
 * Safety margin added to projection distance to prevent near-singularities.
 * This ensures vertices don't get too close to the projection plane.
 */
const PROJECTION_MARGIN = 2.0

/**
 * Calculate a safe projection distance that ensures all vertices are visible.
 *
 * ROTATION-SAFE CALCULATION:
 * When N-D objects rotate with all planes active, coordinates from any dimension
 * can rotate into the "depth" dimensions (4+). The maximum possible effective depth
 * after any rotation equals the vertex's N-dimensional norm.
 *
 * Mathematical basis:
 * - effectiveDepth_raw = sum of coordinates in dimensions 4+ after rotation
 * - By Cauchy-Schwarz: |effectiveDepth_raw| ≤ ||v|| × sqrt(numHigherDims)
 * - After normalization by sqrt(numHigherDims): |effectiveDepth_normalized| ≤ ||v||
 *
 * The calculation:
 * 1. Find the maximum N-dimensional norm of any vertex
 * 2. Use this as the worst-case effective depth after rotation
 * 3. Add safety margin
 *
 * NOTE: Scale is now applied AFTER projection to 3D (like camera zoom), so it
 * no longer affects projection distance calculation. This prevents extreme values
 * during rotation animation.
 *
 * @param vertices - Array of N-dimensional vertices
 * @param dimension - Current dimension of the object
 * @param _scales - DEPRECATED: Scale no longer affects projection distance
 * @returns Safe projection distance that works for any rotation state
 */
export function calculateSafeProjectionDistance(
  vertices: VectorND[],
  dimension: number,
  _scales?: number[]
): number {
  // Early exit for 3D objects or empty vertex arrays
  if (vertices.length === 0 || dimension <= 3) {
    return DEFAULT_PROJECTION_DISTANCE
  }

  const firstVertex = vertices[0]
  if (!firstVertex || firstVertex.length <= 3) {
    return DEFAULT_PROJECTION_DISTANCE
  }

  // Find maximum vertex norm - this bounds the effective depth after any rotation
  // After rotation, the effective depth (normalized by sqrt(numHigherDims)) can be
  // at most the vertex's L2 norm when the vertex aligns with depth dimensions.
  let maxNormSquared = 0
  for (const vertex of vertices) {
    let normSquared = 0
    for (let d = 0; d < vertex.length; d++) {
      const val = vertex[d] ?? 0
      normSquared += val * val
    }
    maxNormSquared = Math.max(maxNormSquared, normSquared)
  }
  const maxNorm = Math.sqrt(maxNormSquared)

  // The max effective depth after any rotation is bounded by the vertex norm
  const maxEffectiveDepth = maxNorm

  // Calculate distance with margin
  // Note: Scale is applied AFTER projection (like camera zoom), so it doesn't
  // affect projection distance calculation.
  return Math.max(DEFAULT_PROJECTION_DISTANCE, maxEffectiveDepth + PROJECTION_MARGIN)
}

/**
 * Cache entry for projection distance calculations.
 */
interface ProjectionDistanceCache {
  /** Vertex count when distance was calculated */
  count: number
  /** Cached projection distance */
  distance: number
}

/**
 * Result from useProjectionDistanceCache hook.
 */
export interface UseProjectionDistanceCacheResult {
  /**
   * Get the current projection distance.
   * Recalculates only when vertex count changes (geometry changed).
   *
   * NOTE: Scale no longer affects projection distance since it's applied
   * AFTER projection to 3D (like camera zoom).
   *
   * @param vertices - Current vertices
   * @param dimension - Current dimension
   * @param _scales - DEPRECATED: Scale no longer affects projection distance
   * @returns Cached or newly calculated projection distance
   */
  getProjectionDistance: (vertices: VectorND[], dimension: number, _scales?: number[]) => number

  /**
   * Force recalculation on next call.
   */
  invalidate: () => void
}

/**
 * Hook for caching projection distance calculations.
 *
 * Projection distance only needs to be recalculated when vertex count changes
 * (geometry changed). Scale is now applied AFTER projection to 3D (like camera
 * zoom), so it no longer affects projection distance.
 *
 * This avoids O(N) vertex iteration every frame.
 *
 * @returns Projection distance cache utilities
 *
 * @example
 * ```tsx
 * function MyRenderer({ vertices, dimension }) {
 *   const projCache = useProjectionDistanceCache();
 *
 *   useFrame(() => {
 *     const projectionDistance = projCache.getProjectionDistance(vertices, dimension);
 *     // Use projectionDistance in uniform updates
 *   });
 * }
 * ```
 */
export function useProjectionDistanceCache(): UseProjectionDistanceCacheResult {
  const cacheRef = useRef<ProjectionDistanceCache>({
    count: -1,
    distance: DEFAULT_PROJECTION_DISTANCE,
  })

  const getProjectionDistance = (
    vertices: VectorND[],
    dimension: number,
    _scales?: number[]
  ): number => {
    const cache = cacheRef.current
    const numVertices = vertices.length

    // Check if we need to recalculate (only when vertex count changes)
    // Scale is now applied AFTER projection, so it doesn't affect projection distance
    if (numVertices !== cache.count) {
      const distance = calculateSafeProjectionDistance(vertices, dimension)

      cache.count = numVertices
      cache.distance = distance

      return distance
    }

    return cache.distance
  }

  const invalidate = () => {
    cacheRef.current.count = -1
  }

  return {
    getProjectionDistance,
    invalidate,
  }
}
