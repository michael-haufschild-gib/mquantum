/**
 * Debug Layer Group Component
 *
 * A wrapper component that ensures all children are rendered on
 * RENDER_LAYERS.DEBUG (layer 4), which is processed by DebugOverlayPass
 * AFTER all post-processing effects.
 *
 * WHY THIS EXISTS:
 * ----------------
 * The main render graph uses MRT (Multiple Render Targets) which requires ALL
 * shaders to output to 3 color attachments (gColor, gNormal, gPosition).
 * Standard Three.js materials (MeshBasicMaterial, LineBasicMaterial) and
 * helpers (AxesHelper, ArrowHelper, TransformControls, Line from drei) only
 * output to a single attachment, causing GL_INVALID_OPERATION errors.
 *
 * SOLUTION:
 * ---------
 * Objects wrapped in this component are placed on the DEBUG layer, which is:
 * 1. Excluded from all MRT render passes
 * 2. Rendered by DebugOverlayPass after post-processing
 * 3. Directly rendered to screen (single attachment target)
 *
 * USAGE:
 * ------
 * ```tsx
 * <DebugLayerGroup>
 *   <axesHelper args={[5]} />
 *   <arrowHelper ... />
 * </DebugLayerGroup>
 * ```
 *
 * @module components/canvas/DebugLayerGroup
 */

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'

import { RENDER_LAYERS } from '@/rendering/core/layers'

interface DebugLayerGroupProps {
  children: ReactNode
}

/**
 * Wrapper component that assigns all children to the DEBUG render layer.
 *
 * Uses useLayoutEffect to set layers synchronously before first paint,
 * preventing any frames where objects render on the wrong layer.
 *
 * Re-runs on every render (no dependency array) to catch dynamically
 * added children like TransformControls internal meshes.
 * @param root0 - Component props
 * @param root0.children - Child elements to render on the debug layer
 * @returns React element wrapping children in a debug layer group
 */
export function DebugLayerGroup({ children }: DebugLayerGroupProps) {
  const groupRef = useRef<THREE.Group>(null)

  // Use useLayoutEffect to set layer BEFORE first paint
  // No dependency array = runs every render to catch dynamic children
  useLayoutEffect(() => {
    if (groupRef.current) {
      groupRef.current.traverse((obj) => {
        obj.layers.set(RENDER_LAYERS.DEBUG)
      })
    }
  })

  return <group ref={groupRef}>{children}</group>
}

export default DebugLayerGroup
