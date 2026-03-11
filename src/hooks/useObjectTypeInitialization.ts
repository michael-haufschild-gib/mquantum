/**
 * useObjectTypeInitialization Hook
 *
 * Handles initialization of Schroedinger-specific settings when the
 * dimension changes.
 *
 * Responsibilities:
 * - Initialize Schroedinger settings for the current dimension
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

  // Initialize Schroedinger settings when dimension changes.
  // Skip during scene load — loadScene restores extended state after geometry,
  // and this effect would clobber the just-loaded parameterValues/center/densityGain.
  useEffect(() => {
    if (objectType === 'schroedinger') {
      if (usePerformanceStore.getState().isLoadingScene) return
      initializeSchroedingerForDimension(dimension)
    }
  }, [objectType, dimension, initializeSchroedingerForDimension])
}
