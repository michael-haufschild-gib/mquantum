/**
 * Geometry state management using Zustand
 *
 * Manages the current dimension (3-11) and object type for the
 * Schroedinger quantum wavefunction visualizer.
 */

import {
  getRecommendedDimension,
  getUnavailabilityReason,
  isAvailableForDimension,
  isValidObjectType as isValidObjectTypeRegistry,
} from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import { invalidateAllTemporalDepthWebGPU } from '@/rendering/webgpu/passes'
import { create } from 'zustand'
import { useAnimationStore } from './animationStore'
import { usePerformanceStore } from './performanceStore'
import { useRotationStore } from './rotationStore'
import { useTransformStore } from './transformStore'

/**
 * Pending rAF ID for scene transition completion.
 * Used to cancel stale callbacks when rapid changes occur.
 */
let pendingTransitionRafId: number | null = null

/**
 * Schedules scene transition completion after React settles.
 * Cancels any pending callback to prevent race conditions.
 */
function scheduleTransitionComplete(): void {
  // Cancel any pending callback to prevent premature completion
  if (pendingTransitionRafId !== null) {
    cancelAnimationFrame(pendingTransitionRafId)
  }

  pendingTransitionRafId = requestAnimationFrame(() => {
    pendingTransitionRafId = null
    usePerformanceStore.getState().setSceneTransitioning(false)
    usePerformanceStore.getState().setCameraTeleported(false)
  })
}

/** Minimum supported dimension */
export const MIN_DIMENSION = 2

/** Maximum supported dimension */
export const MAX_DIMENSION = 11

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
    const clampedDimension = clampDimension(dimension, currentDimension)
    const currentType = get().objectType

    if (!Number.isFinite(dimension)) {
      if (import.meta.env.DEV) {
        console.warn(`[geometryStore] Ignoring non-finite dimension: ${dimension}`)
      }
      return
    }

    // Skip if same dimension (no change needed)
    if (clampedDimension === currentDimension) {
      return
    }

    // Check if current object type is still valid for new dimension
    const newType = getFallbackObjectType(currentType, clampedDimension)

    // Invalidate temporal depth data - dimensions change depth completely
    invalidateAllTemporalDepthWebGPU()

    // All store updates execute synchronously and are batched by React 18's automatic batching
    // Trigger progressive refinement: start at low quality during dimension switch
    usePerformanceStore.getState().setSceneTransitioning(true)
    usePerformanceStore.getState().setCameraTeleported(true)

    // Update all dimension-dependent stores BEFORE setting geometry state
    // This filters out invalid planes for the new dimension (e.g., "XV" doesn't exist in 4D)
    useAnimationStore.getState().setDimension(clampedDimension)
    useRotationStore.getState().setDimension(clampedDimension)
    useTransformStore.getState().setDimension(clampedDimension)

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
      // Don't allow setting invalid type - keep current
      console.warn(
        `Object type ${type} is not valid for dimension ${currentDimension}: ${validation.message}`
      )
      return
    }

    // Skip if same type (no change needed)
    if (type === currentType) {
      return
    }

    // Invalidate temporal data - object types have completely different depth/accumulation values
    invalidateAllTemporalDepthWebGPU()

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
      // Update all dimension-dependent stores BEFORE setting geometry state
      // This filters out invalid planes for the new dimension (e.g., "XV" doesn't exist in 4D)
      useAnimationStore.getState().setDimension(targetDimension)
      useRotationStore.getState().setDimension(targetDimension)
      useTransformStore.getState().setDimension(targetDimension)

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

    if (!Number.isFinite(dimension) && import.meta.env.DEV) {
      console.warn(
        `[geometryStore] Non-finite scene dimension ${dimension}; using default ${DEFAULT_DIMENSION}`
      )
    }

    // Validate that objectType is valid for dimension
    if (!isValidObjectType(objectType)) {
      console.warn(`Invalid object type for scene load: ${objectType}, using schroedinger`)
      objectType = 'schroedinger'
    }

    const validation = validateObjectTypeForDimension(objectType, clampedDimension)
    if (!validation.valid) {
      console.warn(
        `Object type ${objectType} is not valid for dimension ${clampedDimension} during scene load: ${validation.message}`
      )
      objectType = validation.fallbackType ?? 'schroedinger'
    }

    // Skip if nothing changed
    if (clampedDimension === currentDimension && objectType === currentType) {
      return
    }

    // Invalidate temporal depth data
    invalidateAllTemporalDepthWebGPU()

    // Update dimension-dependent stores for new dimension
    if (clampedDimension !== currentDimension) {
      useAnimationStore.getState().setDimension(clampedDimension)
      useRotationStore.getState().setDimension(clampedDimension)
      useTransformStore.getState().setDimension(clampedDimension)
    }

    // Set both atomically - no auto-adjustments
    set({
      dimension: clampedDimension,
      objectType: objectType,
    })

    // Note: Caller (loadScene) handles scheduleSceneLoadComplete
  },

  reset: () => {
    set({
      dimension: DEFAULT_DIMENSION,
      objectType: DEFAULT_OBJECT_TYPE,
    })
  },
}))
