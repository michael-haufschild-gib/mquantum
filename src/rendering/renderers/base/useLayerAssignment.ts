/**
 * Hook for managing render layer assignment on meshes.
 *
 * Assigns meshes to specific render layers for depth-based effects
 * (SSR, refraction, bokeh) and handles cleanup on unmount.
 *
 * @module rendering/renderers/base/useLayerAssignment
 */

import { RENDER_LAYERS } from '@/rendering/core/layers'
import type { RefObject } from 'react'
import { useEffect } from 'react'
import type * as THREE from 'three'

/**
 * Options for the useLayerAssignment hook.
 */
export interface UseLayerAssignmentOptions {
  /**
   * The render layer to assign to the mesh.
   * @default RENDER_LAYERS.MAIN_OBJECT
   */
  layer?: number

  /**
   * Whether layer assignment is enabled.
   * When false, the mesh keeps its default layer.
   * @default true
   */
  enabled?: boolean
}

/**
 * Hook for assigning a mesh to a specific render layer.
 *
 * This hook handles the assignment of meshes to render layers,
 * which is necessary for post-processing effects that need to
 * distinguish between different types of objects in the scene.
 *
 * The layer assignment is cleaned up automatically on unmount.
 *
 * @param meshRef - Reference to the mesh to assign layers to
 * @param options - Layer assignment options
 *
 * @example
 * ```tsx
 * const meshRef = useRef<THREE.Mesh>(null);
 *
 * // Assign to main object layer for depth-based effects
 * useLayerAssignment(meshRef);
 *
 * // Or assign to a specific layer
 * useLayerAssignment(meshRef, { layer: RENDER_LAYERS.CUSTOM });
 *
 * return <mesh ref={meshRef}>...</mesh>;
 * ```
 */
export function useLayerAssignment(
  meshRef: RefObject<THREE.Mesh | null>,
  options: UseLayerAssignmentOptions = {}
): void {
  const { layer = RENDER_LAYERS.MAIN_OBJECT, enabled = true } = options

  useEffect(() => {
    if (!enabled) return

    const mesh = meshRef.current
    if (mesh?.layers) {
      mesh.layers.set(layer)
    }

    // Reset to default layer on unmount to prevent stale layer assignments
    // when component remounts or mesh is reused
    return () => {
      if (mesh?.layers) {
        mesh.layers.set(0) // Reset to default layer
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- meshRef is a stable ref object
  }, [layer, enabled])
}

/**
 * Hook for conditionally assigning a mesh to the volumetric layer.
 *
 * This is a specialized version of useLayerAssignment for volumetric
 * objects that need separate rendering for temporal accumulation.
 *
 * @param meshRef - Reference to the mesh
 * @param needsSeparation - Whether the mesh needs volumetric separation
 *
 * @example
 * ```tsx
 * const meshRef = useRef<THREE.Mesh>(null);
 * const needsSeparation = needsVolumetricSeparation(renderMode, temporalAccum);
 *
 * useVolumetricLayerAssignment(meshRef, needsSeparation);
 * ```
 */
export function useVolumetricLayerAssignment(
  meshRef: RefObject<THREE.Mesh | null>,
  needsSeparation: boolean
): void {
  useEffect(() => {
    const mesh = meshRef.current
    if (mesh?.layers) {
      if (needsSeparation) {
        mesh.layers.set(RENDER_LAYERS.VOLUMETRIC)
      } else {
        mesh.layers.set(RENDER_LAYERS.MAIN_OBJECT)
      }
    }

    // Reset to default layer on unmount
    return () => {
      if (mesh?.layers) {
        mesh.layers.set(0) // Reset to default layer
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- meshRef is a stable ref object
  }, [needsSeparation])
}
