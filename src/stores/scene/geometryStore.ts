/**
 * Geometry state management using Zustand
 *
 * Manages the current dimension (3-11) and object type for the
 * Schroedinger quantum wavefunction visualizer.
 */

import { create } from 'zustand'

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import {
  getDimensionConstraints,
  getRecommendedDimension,
  getUnavailabilityReason,
  isAvailableForDimension,
  isValidObjectType as isValidObjectTypeRegistry,
  QUANTUM_MODES_3D_ONLY,
} from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import { logger } from '@/lib/logger'

import { usePerformanceStore } from '../runtime/performanceStore'
import { useAnimationStore } from './animationStore'
import { useExtendedObjectStore } from './extendedObjectStore'
import { useRotationStore } from './rotationStore'
import { useTransformStore } from './transformStore'

/**
 * Propagate a dimension change to all dimension-dependent stores.
 * Must be called BEFORE updating geometry state so dependent stores
 * can filter invalid planes/transforms for the new dimension.
 * @param dimension - New dimension value
 */
function propagateDimensionToStores(dimension: number): void {
  useAnimationStore.getState().setDimension(dimension)
  useRotationStore.getState().setDimension(dimension)
  useTransformStore.getState().setDimension(dimension)

  // Sync compute-mode lattice dimensions so they don't desync from the global
  // dimension. Without this, changing dimension while in a compute mode leaves
  // latticeDim stale, causing bounding radius mismatches and broken rendering.
  // Covers all compute modes (TDSE, BEC, Dirac, FSF, QW) via the central resize
  // map in the schroedinger slice. Analytic modes are a no-op.
  useExtendedObjectStore.getState().syncActiveComputeModeLatticeDim(dimension)
}

/**
 * Pending rAF ID for scene transition completion.
 * Used to cancel stale callbacks when rapid changes occur.
 */
let pendingTransitionRafId: number | null = null

/**
 * Cancels any pending transition rAF callback.
 * Called by reset() to prevent stale callbacks firing between tests.
 */
function cancelPendingTransition(): void {
  if (pendingTransitionRafId !== null) {
    cancelAnimationFrame(pendingTransitionRafId)
    pendingTransitionRafId = null
  }
}

/**
 * Schedules scene transition completion after React settles.
 * Cancels any pending callback to prevent race conditions.
 */
function scheduleTransitionComplete(): void {
  cancelPendingTransition()

  pendingTransitionRafId = requestAnimationFrame(() => {
    pendingTransitionRafId = null
    usePerformanceStore.getState().setSceneTransitioning(false)
    usePerformanceStore.getState().setCameraTeleported(false)
  })
}

/** Default dimension (3D) */
export const DEFAULT_DIMENSION = 3

/** Default object type */
export const DEFAULT_OBJECT_TYPE: ObjectType = 'schroedinger'

/**
 * Geometry store state and actions.
 */
export interface GeometryState {
  /** Current dimension (3-11) */
  dimension: number
  /** Current object type */
  objectType: ObjectType

  // Actions
  setDimension: (dimension: number) => void
  setObjectType: (type: ObjectType) => void
  /**
   * Loads geometry state from a saved scene.
   *
   * Unlike setDimension/setObjectType, this action:
   * - Sets both dimension and objectType atomically
   * - Does NOT auto-switch to "recommended" dimension
   * - Does NOT trigger internal flushSync (caller handles batching)
   * - Does NOT schedule transition completion (caller handles it)
   *
   * This is specifically for scene loading where we want to restore
   * exact saved state without any auto-adjustments.
   *
   * @param dimension - The saved dimension value
   * @param objectType - The saved object type
   */
  loadGeometry: (dimension: number, objectType: ObjectType) => void
  reset: () => void
}

/**
 * Clamps a dimension value to the valid range [MIN_DIMENSION, MAX_DIMENSION]
 * @param dim - Dimension value to clamp
 * @param fallback - Fallback used when dim is non-finite
 * @returns Clamped dimension value
 */
function clampDimension(dim: number, fallback: number = DEFAULT_DIMENSION): number {
  if (!Number.isFinite(dim)) {
    return fallback
  }
  return Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, Math.floor(dim)))
}

/**
 * Validates that an object type is supported
 * @param type - Object type string to validate
 * @returns True if type is a valid ObjectType
 */
function isValidObjectType(type: string): type is ObjectType {
  // Use registry for validation
  return isValidObjectTypeRegistry(type)
}

/**
 * Checks if an object type is valid for a given dimension
 *
 * Uses the registry to determine dimension constraints.
 *
 * @param type - Object type to check
 * @param dimension - Current dimension
 * @returns Object with valid flag and fallback type if invalid
 */
export function validateObjectTypeForDimension(
  type: ObjectType,
  dimension: number
): { valid: boolean; fallbackType?: ObjectType; message?: string } {
  // Use registry to check if type is available for dimension
  if (!isAvailableForDimension(type, dimension)) {
    const reason = getUnavailabilityReason(type, dimension)
    return {
      valid: false,
      fallbackType: 'schroedinger',
      message: reason ?? `${type} is not available for dimension ${dimension}`,
    }
  }

  return { valid: true }
}

/**
 * Gets the fallback object type when current type is invalid for dimension
 * @param type - Current object type
 * @param dimension - Current dimension
 * @returns Valid object type for the dimension
 */
function getFallbackObjectType(type: ObjectType, dimension: number): ObjectType {
  const validation = validateObjectTypeForDimension(type, dimension)
  return validation.valid ? type : (validation.fallbackType ?? 'schroedinger')
}

export const useGeometryStore = create<GeometryState>((set, get) => ({
  dimension: DEFAULT_DIMENSION,
  objectType: DEFAULT_OBJECT_TYPE,

  setDimension: (dimension: number) => {
    const currentDimension = get().dimension
    let clampedDimension = clampDimension(dimension, currentDimension)
    const currentType = get().objectType

    if (!Number.isFinite(dimension)) {
      logger.warn(`[geometryStore] Ignoring non-finite dimension: ${dimension}`)
      return
    }

    // Enforce minimum dim=3 for quantum modes that lack a 2D rendering path
    const quantumMode = useExtendedObjectStore.getState().schroedinger?.quantumMode
    if (quantumMode && QUANTUM_MODES_3D_ONLY.has(quantumMode) && clampedDimension < 3) {
      clampedDimension = 3
    }

    // Skip if same dimension (no change needed)
    if (clampedDimension === currentDimension) {
      return
    }

    // Check if current object type is still valid for new dimension
    const newType = getFallbackObjectType(currentType, clampedDimension)

    // All store updates execute synchronously and are batched by React 18's automatic batching
    // Trigger progressive refinement: start at low quality during dimension switch
    usePerformanceStore.getState().setSceneTransitioning(true)
    usePerformanceStore.getState().setCameraTeleported(true)

    propagateDimensionToStores(clampedDimension)

    set({
      dimension: clampedDimension,
      objectType: newType,
    })

    // Signal transition complete after React settles - triggers progressive refinement
    scheduleTransitionComplete()
  },

  setObjectType: (type: ObjectType) => {
    if (!isValidObjectType(type)) {
      throw new Error(`Invalid object type: ${type}`)
    }

    const currentDimension = get().dimension
    const currentType = get().objectType
    const validation = validateObjectTypeForDimension(type, currentDimension)

    if (!validation.valid) {
      // Dimension out of range for the target type — auto-adjust to recommended
      const constraints = getDimensionConstraints(type)
      const recommended = getRecommendedDimension(type)
      if (
        constraints &&
        (currentDimension < constraints.min || currentDimension > constraints.max)
      ) {
        const targetDim =
          recommended ?? Math.max(constraints.min, Math.min(currentDimension, constraints.max))
        logger.log(
          `[geometryStore] Auto-adjusting dimension ${currentDimension} → ${targetDim} for ${type} (range ${constraints.min}-${constraints.max})`
        )
        propagateDimensionToStores(targetDim)
        set({ dimension: targetDim, objectType: type })
        usePerformanceStore.getState().setSceneTransitioning(true)
        usePerformanceStore.getState().setCameraTeleported(true)
        scheduleTransitionComplete()
        return
      }
      logger.warn(
        `Object type ${type} is not valid for dimension ${currentDimension}: ${validation.message}`
      )
      return
    }

    // Skip if same type (no change needed)
    if (type === currentType) {
      return
    }

    // Check if this object type has a recommended dimension (from registry)
    const recommendedDimension = getRecommendedDimension(type)
    const targetDimension =
      recommendedDimension !== undefined && currentDimension !== recommendedDimension
        ? recommendedDimension
        : currentDimension

    // Trigger progressive refinement: start at low quality during content type switch
    usePerformanceStore.getState().setSceneTransitioning(true)
    usePerformanceStore.getState().setCameraTeleported(true)

    if (targetDimension !== currentDimension) {
      propagateDimensionToStores(targetDimension)

      // Auto-switch to recommended dimension for optimal visualization
      set({
        objectType: type,
        dimension: targetDimension,
      })
    } else {
      set({ objectType: type })
    }

    // Signal transition complete after React settles - triggers progressive refinement
    scheduleTransitionComplete()
  },

  loadGeometry: (dimension: number, objectType: ObjectType) => {
    const clampedDimension = clampDimension(dimension, DEFAULT_DIMENSION)
    const currentDimension = get().dimension
    const currentType = get().objectType

    if (!Number.isFinite(dimension)) {
      logger.warn(
        `[geometryStore] Non-finite scene dimension ${dimension}; using default ${DEFAULT_DIMENSION}`
      )
    }

    // Validate that objectType is valid for dimension
    if (!isValidObjectType(objectType)) {
      logger.warn(`Invalid object type for scene load: ${objectType}, using schroedinger`)
      objectType = 'schroedinger'
    }

    const validation = validateObjectTypeForDimension(objectType, clampedDimension)
    if (!validation.valid) {
      logger.warn(
        `Object type ${objectType} is not valid for dimension ${clampedDimension} during scene load: ${validation.message}`
      )
      objectType = validation.fallbackType ?? 'schroedinger'
    }

    // Skip if nothing changed
    if (clampedDimension === currentDimension && objectType === currentType) {
      return
    }

    // Update dimension-dependent stores for new dimension
    if (clampedDimension !== currentDimension) {
      propagateDimensionToStores(clampedDimension)
    }

    // Set both atomically - no auto-adjustments
    set({
      dimension: clampedDimension,
      objectType: objectType,
    })

    // Note: Caller (loadScene) handles scheduleSceneLoadComplete
  },

  reset: () => {
    // Cancel any pending transition rAF to prevent stale callbacks
    // firing after reset (e.g. between tests).
    cancelPendingTransition()
    propagateDimensionToStores(DEFAULT_DIMENSION)
    set({
      dimension: DEFAULT_DIMENSION,
      objectType: DEFAULT_OBJECT_TYPE,
    })
  },
}))
