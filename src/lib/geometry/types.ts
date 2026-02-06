/**
 * Type definitions for n-dimensional geometry
 *
 * Supports Schroedinger quantum objects rendered via WebGPU.
 */

import type { VectorND } from '@/lib/math'

/**
 * All supported object types
 */
export type ObjectType = 'schroedinger'

/**
 * Type guard for polytope types (none remaining)
 * @param type - String to check
 * @returns Always false - no polytope types remain
 */
export function isPolytopeType(_type: string): _type is never {
  return false
}

/**
 * Type guard for extended object types
 * @param type - String to check
 * @returns True if type is an extended object type
 */
export function isExtendedObjectType(type: string): type is ObjectType {
  return type === 'schroedinger'
}

/**
 * Metadata for geometry objects
 */
export interface GeometryMetadata {
  /** Display name for the object */
  name?: string
  /** Mathematical formula or description */
  formula?: string
  /** Additional properties specific to the object type */
  properties?: Record<string, unknown>
}

/**
 * Unified geometry representation for all n-dimensional objects
 */
export interface NdGeometry {
  /** Dimensionality of the object */
  dimension: number
  /** Type of object */
  type: ObjectType
  /** Array of vertex/point positions in n-dimensional space */
  vertices: VectorND[]
  /** Array of edge pairs (vertex indices) - may be empty for point clouds */
  edges: [number, number][]
  /** Optional metadata about the geometry */
  metadata?: GeometryMetadata
}
