/**
 * Shared base module for raymarched renderers.
 *
 * This module provides common types, utilities, and hooks used across
 * N-dimensional renderers to eliminate code duplication.
 *
 * @module rendering/renderers/base
 */

// Types and utilities
export {
  MAX_DIMENSION,
  QUALITY_RESTORE_DELAY_MS,
  applyRotationInPlace,
  createWorkingArrays,
  type QualityState,
  type RotationState,
  type WorkingArrays,
} from './types'

// Hooks
export {
  useQualityTracking,
  type UseQualityTrackingOptions,
  type UseQualityTrackingResult,
} from './useQualityTracking'

export {
  useRotationUpdates,
  type BasisVectorsResult,
  type OriginResult,
  type UseRotationUpdatesOptions,
  type UseRotationUpdatesResult,
} from './useRotationUpdates'

export {
  calculateSafeProjectionDistance,
  DEFAULT_PROJECTION_DISTANCE,
  useProjectionDistanceCache,
  type UseProjectionDistanceCacheResult,
} from './projectionUtils'
