/**
 * Type definitions for n-dimensional geometry
 *
 * Supports Schroedinger quantum objects rendered via WebGPU.
 */

/**
 * All supported object types
 */
export type ObjectType = 'schroedinger'

/**
 * Type guard for extended object types
 * @param type - String to check
 * @returns True if type is an extended object type
 */
export function isExtendedObjectType(type: string): type is ObjectType {
  return type === 'schroedinger'
}
