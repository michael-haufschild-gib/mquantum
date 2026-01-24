import type { NdGeometry, ObjectType } from '@/lib/geometry/types'
import { determineRenderMode as determineRenderModeFromRegistry } from '@/lib/geometry/registry'

/**
 * Render mode types
 */
export type RenderMode =
  | 'polytope'
  | 'raymarch-mandelbulb'
  | 'raymarch-quaternion-julia'
  | 'raymarch-schroedinger'
  | 'raymarch-blackhole'
  | 'none'

/**
 * Determines the appropriate render mode based on object type and settings
 *
 * Uses the registry to determine rendering capabilities for each object type.
 *
 * @param geometry - The geometry being rendered
 * @param objectType - Type of object being rendered
 * @param dimension - Current dimension
 * @param facesVisible - Whether faces are visible
 * @returns The appropriate render mode
 */
export function determineRenderMode(
  geometry: NdGeometry,
  objectType: ObjectType,
  dimension: number,
  facesVisible: boolean
): RenderMode {
  // Use registry-based determination
  const mode = determineRenderModeFromRegistry(objectType, dimension, facesVisible)

  // If registry returns 'polytope', verify we have vertices
  if (mode === 'polytope' && geometry.vertices.length === 0) {
    return 'none'
  }

  return mode
}
