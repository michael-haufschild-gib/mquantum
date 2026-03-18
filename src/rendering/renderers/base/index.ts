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
  applyRotationInPlace,
  createWorkingArrays,
  MAX_DIMENSION,
  QUALITY_RESTORE_DELAY_MS,
  type QualityState,
  type RotationState,
  type WorkingArrays,
} from './types'

// Hooks
export {
  type BasisVectorsResult,
  type OriginResult,
  useRotationUpdates,
  type UseRotationUpdatesOptions,
  type UseRotationUpdatesResult,
} from './useRotationUpdates'
