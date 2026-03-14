/**
 * useObjectTypeInitialization Hook
 *
 * Handles initialization of object type-specific settings when the
 * dimension or object type changes.
 *
 * Responsibilities:
 * - Initialize Schroedinger settings for the current dimension
 * - Initialize Pauli Spinor settings for the current dimension
 */

import { useEffect } from 'react'
import type { ObjectType } from '@/lib/geometry/types'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { usePerformanceStore } from '@/stores/performanceStore'

/**
 * Hook to initialize object type-specific settings.
 *
 * @param objectType - Current object type
 * @param dimension - Current dimension
 */
export function useObjectTypeInitialization(objectType: ObjectType, dimension: number): void {
  const initializeSchroedingerForDimension = useExtendedObjectStore(
    (state) => state.initializeSchroedingerForDimension
  )
  const initializePauliForDimension = useExtendedObjectStore(
    (state) => state.initializePauliForDimension
  )

  // Initialize object type settings when dimension changes.
  // Skip during scene load — loadScene restores extended state after geometry,
  // and this effect would clobber the just-loaded parameterValues/center/densityGain.
  useEffect(() => {
    if (usePerformanceStore.getState().isLoadingScene) return

    if (objectType === 'schroedinger') {
      initializeSchroedingerForDimension(dimension)
    } else if (objectType === 'pauliSpinor') {
      initializePauliForDimension(dimension)
    }
  }, [objectType, dimension, initializeSchroedingerForDimension, initializePauliForDimension])
}
