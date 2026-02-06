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

  // Initialize Schroedinger settings when dimension changes
  useEffect(() => {
    if (objectType === 'schroedinger') {
      initializeSchroedingerForDimension(dimension)
    }
  }, [objectType, dimension, initializeSchroedingerForDimension])
}
