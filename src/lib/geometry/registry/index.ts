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
  getAvailableTypesForDimension,
  // Store config helpers
  getConfigStoreKey,
  // UI helpers
  getControlsComponentKey,
  // Dimension constraint helpers
  getDimensionConstraints,
  // Core lookups
  getObjectTypeEntry,
  getRecommendedDimension,
  getUnavailabilityReason,
  hasTimelineControls,
  isAvailableForDimension,
  // Rendering capability helpers
  isRaymarchingType,
  // Validation helpers
  isValidObjectType,
} from './helpers'

// Component loader
export { getControlsComponent, hasControlsComponent } from './components'
