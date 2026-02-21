/**
 * Object Type Registry - Barrel Export
 *
 * Central registry for the 'schroedinger' object type metadata,
 * capabilities, and configurations.
 *
 * @example
 * ```typescript
 * import {
 *   getAvailableTypesForDimension,
 *   getControlsComponent,
 * } from '@/lib/geometry/registry';
 * ```
 */

// Types
export type {
  AnimationCapabilities,
  AnimationSystemDef,
  AvailableTypeInfo,
  DimensionConstraints,
  ObjectTypeEntry,
  RenderingCapabilities,
} from './types'

// Registry
export { OBJECT_TYPE_REGISTRY } from './registry'

// Helper functions
export {
  // Core lookups
  getObjectTypeEntry,
  // Rendering capability helpers
  isRaymarchingType,
  // Dimension constraint helpers
  getDimensionConstraints,
  getRecommendedDimension,
  isAvailableForDimension,
  getUnavailabilityReason,
  getAvailableTypesForDimension,
  // UI helpers
  getControlsComponentKey,
  hasTimelineControls,
  // Validation helpers
  isValidObjectType,
  // Store config helpers
  getConfigStoreKey,
} from './helpers'

// Component loader
export { getControlsComponent, hasControlsComponent } from './components'
