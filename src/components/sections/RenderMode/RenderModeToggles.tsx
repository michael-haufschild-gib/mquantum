/**
 * Render Mode Toggles Component
 *
 * Displays toggle buttons at the top of the sidebar for controlling
 * which geometry elements are rendered: Edges and Faces.
 *
 * Features:
 * - Toggle visibility for edges and faces independently
 * - Faces toggle is disabled for objects that don't support face rendering
 * - Tooltip explains when faces are unavailable
 * - Integrates with appearanceStore and geometryStore
 *
 * @example
 * ```tsx
 * <RenderModeToggles />
 * ```
 *
 * @see docs/prd/render-mode-toggles.md
 */

import { ToggleButton } from '@/components/ui/ToggleButton'
import {
  canRenderFaces as canRenderFacesFromRegistry,
  canRenderEdges as canRenderEdgesFromRegistry,
  isRaymarchingFractal,
} from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import { useGeometryStore, type GeometryState } from '@/stores/geometryStore'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React, { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 * Props for RenderModeToggles component
 */
export interface RenderModeTogglesProps {
  /** Optional CSS class name for styling */
  className?: string
}

/**
 * Checks if an object type supports face rendering
 * Uses the registry to determine capabilities.
 * @param objectType - The current object type
 * @returns true if faces can be rendered for this object type
 */
function canRenderFaces(objectType: ObjectType): boolean {
  return canRenderFacesFromRegistry(objectType)
}

/**
 * Checks if an object type supports edge rendering
 * Uses the registry to determine capabilities.
 * @param objectType - The current object type
 * @returns true if edges can be rendered for this object type
 */
function canRenderEdges(objectType: ObjectType): boolean {
  return canRenderEdgesFromRegistry(objectType)
}

/**
 * Checks if an object type is a raymarched fractal (mandelbulb 3D+ or quaternion-julia)
 * Uses the registry to determine capabilities.
 * @param objectType - The current object type
 * @param dimension - Current dimension
 * @returns true if this is a raymarched fractal type
 */
function isRaymarchedFractal(objectType: ObjectType, dimension: number): boolean {
  return isRaymarchingFractal(objectType, dimension)
}

/**
 * Render Mode Toggles Component
 *
 * Provides a row of toggle buttons for controlling geometry rendering:
 * - Edges: Shows/hides edge lines (wireframe)
 * - Faces: Shows/hides filled surfaces (when supported)
 *
 * @param props - Component props
 * @param props.className - Optional CSS class for custom styling
 *
 * @returns A row of toggle buttons for render mode control
 *
 * @remarks
 * - When switching to an incompatible object, faces auto-turn off
 * - Faces toggle automatically sets shader type (surface vs wireframe)
 */
export const RenderModeToggles: React.FC<RenderModeTogglesProps> = React.memo(
  ({ className = '' }) => {
    // Consolidate visual store selectors with useShallow to reduce subscriptions
    const appearanceSelector = useShallow((state: AppearanceSlice) => ({
      edgesVisible: state.edgesVisible,
      facesVisible: state.facesVisible,
      setEdgesVisible: state.setEdgesVisible,
      setFacesVisible: state.setFacesVisible,
    }))
    const { edgesVisible, facesVisible, setEdgesVisible, setFacesVisible } =
      useAppearanceStore(appearanceSelector)

    // Consolidate geometry store selectors with useShallow
    const geometrySelector = useShallow((state: GeometryState) => ({
      objectType: state.objectType,
      dimension: state.dimension,
    }))
    const { objectType, dimension } = useGeometryStore(geometrySelector)

    // Track if faces/edges were auto-disabled due to object type switch
    // Initialize to false - only set to true when we auto-disable, not for manual toggles
    const previousFacesState = useRef(false)
    const previousEdgesState = useRef(false)

    // Check support for current object type
    const facesSupported = canRenderFaces(objectType)
    const edgesSupported = canRenderEdges(objectType)
    const isRaymarched = isRaymarchedFractal(objectType, dimension)

    // Toggle handlers
    const handleEdgeToggle = (visible: boolean) => {
      if (visible && isRaymarched) {
        // Edges mode: enable Faces for raymarched fractals
        setEdgesVisible(true)
        setFacesVisible(true)
      } else {
        setEdgesVisible(visible)
      }
    }

    const handleFaceToggle = (visible: boolean) => {
      if (!visible && isRaymarched && edgesVisible) {
        // Cannot turn off Faces while Edges is on for raymarched fractals
        return
      }
      setFacesVisible(visible)
    }

    // Auto-disable faces when switching to incompatible object
    useEffect(() => {
      if (!facesSupported && facesVisible) {
        // Store the previous state before auto-disabling
        previousFacesState.current = true
        setFacesVisible(false)
      } else if (facesSupported && previousFacesState.current && !facesVisible) {
        // Restore faces when switching back to compatible object
        setFacesVisible(true)
        previousFacesState.current = false
      }
    }, [facesSupported, facesVisible, setFacesVisible])

    // Auto-disable edges when switching to incompatible object
    useEffect(() => {
      if (!edgesSupported && edgesVisible) {
        previousEdgesState.current = true
        setEdgesVisible(false)
      } else if (edgesSupported && previousEdgesState.current && !edgesVisible) {
        setEdgesVisible(true)
        previousEdgesState.current = false
      }
    }, [edgesSupported, edgesVisible, setEdgesVisible])

    // Enforce mutual exclusivity for raymarched fractals (Mandelbulb 3D+, Quaternion Julia) on object type switch
    // Rule: Edges ON → Faces must be ON
    useEffect(() => {
      if (isRaymarched && edgesVisible && !facesVisible) {
        // Edges requires faces to be on
        setFacesVisible(true)
      }
    }, [isRaymarched, facesVisible, edgesVisible, setFacesVisible])

    // Ensure at least one render mode is always active
    useEffect(() => {
      const noModeActive = !edgesVisible && !facesVisible
      if (noModeActive) {
        // Default to edges
        setEdgesVisible(true)
      }
    }, [edgesVisible, facesVisible, setEdgesVisible])

    return (
      <div className={`flex gap-2 ${className}`} data-testid="render-mode-toggles">
        <div title={!edgesSupported ? 'Edges not available for this object type' : undefined}>
          <ToggleButton
            pressed={edgesVisible}
            onToggle={handleEdgeToggle}
            ariaLabel="Toggle edge visibility"
            disabled={!edgesSupported}
            data-testid="toggle-edges"
          >
            Edges
          </ToggleButton>
        </div>

        <div title={!facesSupported ? 'Faces not available for this object type' : undefined}>
          <ToggleButton
            pressed={facesVisible}
            onToggle={handleFaceToggle}
            ariaLabel="Toggle face visibility"
            disabled={!facesSupported}
            data-testid="toggle-faces"
          >
            Faces
          </ToggleButton>
        </div>
      </div>
    )
  }
)
