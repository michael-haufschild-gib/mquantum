/**
 * Performance Manager Component
 *
 * Integrates performance optimization hooks:
 * - Interaction state detection
 * - Progressive refinement
 *
 * This component should be placed inside the Canvas to access Three.js context.
 */

import { useInteractionState } from '@/hooks/useInteractionState'
import { useProgressiveRefinement } from '@/hooks/useProgressiveRefinement'
import React from 'react'

/**
 * Performance manager that activates all performance optimization hooks.
 * Must be placed inside a Canvas component.
 * @returns null - this component doesn't render anything visible
 */
export const PerformanceManager: React.FC = () => {
  // Interaction state detection (updates store)
  useInteractionState()

  // Progressive refinement (manages quality stages)
  useProgressiveRefinement()

  // This component doesn't render anything
  return null
}
