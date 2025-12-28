/**
 * Geometry state management using Zustand
 *
 * Manages the current dimension and object type for the visualizer.
 * Supports both traditional polytopes and extended objects.
 *
 * @see docs/prd/extended-objects.md
 */

import {
  getRecommendedDimension,
  getUnavailabilityReason,
  isAvailableForDimension,
  isRaymarchingFractal,
  isValidObjectType as isValidObjectTypeRegistry,
} from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import { invalidateAllTemporalDepth } from '@/rendering/core/temporalDepth'
import {
  DEFAULT_COLOR_ALGORITHM,
  isColorAlgorithmAvailable,
} from '@/rendering/shaders/palette/types'
import { flushSync } from 'react-dom'
import { create } from 'zustand'
import { useAnimationStore } from './animationStore'
import { useAppearanceStore } from './appearanceStore'
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
export const MIN_DIMENSION = 3

/** Maximum supported dimension */
export const MAX_DIMENSION = 11

/** Default dimension (3D) */
export const DEFAULT_DIMENSION = 3

/** Default object type */
export const DEFAULT_OBJECT_TYPE: ObjectType = 'hypercube'

export interface GeometryState {
  /** Current dimension (3-11) */
  dimension: number
  /** Current object type */
  objectType: ObjectType

  // Actions
  setDimension: (dimension: number) => void
  setObjectType: (type: ObjectType) => void
  reset: () => void
}

/**
 * Clamps a dimension value to the valid range [MIN_DIMENSION, MAX_DIMENSION]
 * @param dim - Dimension value to clamp
 * @returns Clamped dimension value
 */
function clampDimension(dim: number): number {
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
      fallbackType: 'hypercube',
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
  return validation.valid ? type : (validation.fallbackType ?? 'hypercube')
}

export const useGeometryStore = create<GeometryState>((set, get) => ({
  dimension: DEFAULT_DIMENSION,
  objectType: DEFAULT_OBJECT_TYPE,

  setDimension: (dimension: number) => {
    const clampedDimension = clampDimension(dimension)
    const currentDimension = get().dimension
    const currentType = get().objectType

    // Skip if same dimension (no change needed)
    if (clampedDimension === currentDimension) {
      return
    }

    // Check if current object type is still valid for new dimension
    const newType = getFallbackObjectType(currentType, clampedDimension)

    // Invalidate temporal depth data - dimensions change depth completely
    invalidateAllTemporalDepth()

    // Batch all store updates atomically to prevent intermediate renders
    flushSync(() => {
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
    invalidateAllTemporalDepth()

    // Check if this object type has a recommended dimension (from registry)
    const recommendedDimension = getRecommendedDimension(type)
    const targetDimension =
      recommendedDimension !== undefined && currentDimension !== recommendedDimension
        ? recommendedDimension
        : currentDimension

    // Batch all store updates atomically to prevent intermediate renders
    flushSync(() => {
      // When switching object types, validate that the current color algorithm is still supported.
      // If not, revert to the default (monochromatic) to avoid rendering artifacts or mismatch with UI.
      // IMPORTANT: This must be inside flushSync to ensure atomic update with object type change.
      const appearanceStore = useAppearanceStore.getState()
      if (!isColorAlgorithmAvailable(appearanceStore.colorAlgorithm, type)) {
        appearanceStore.setColorAlgorithm(DEFAULT_COLOR_ALGORITHM)
      }

      // Raymarched fractals require facesVisible=true to render (determineRenderMode returns 'none' otherwise)
      // Ensure it's set when switching to a raymarching type
      if (isRaymarchingFractal(type, targetDimension)) {
        if (!appearanceStore.facesVisible) {
          appearanceStore.setFacesVisible(true)
        }
      }

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
    })

    // Signal transition complete after React settles - triggers progressive refinement
    scheduleTransitionComplete()
  },

  reset: () => {
    set({
      dimension: DEFAULT_DIMENSION,
      objectType: DEFAULT_OBJECT_TYPE,
    })
  },
}))
