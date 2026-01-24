/**
 * Hook for managing N-dimensional GPU transform updates.
 *
 * Handles store subscriptions and updates the NDTransformSource with
 * current rotation state. Used by vertex-based renderers (Polytope,
 * TubeWireframe) that transform vertices on the GPU.
 *
 * For raymarching renderers that use basis vectors, use useRotationUpdates instead.
 *
 * @module rendering/renderers/base/useNDTransformUpdates
 */

import { useEffect, useMemo, useRef } from 'react'

import { NDTransformSource, type NDTransformConfig } from '@/rendering/uniforms/sources'
import { useGeometryStore } from '@/stores/geometryStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useTransformStore } from '@/stores/transformStore'
import type * as THREE from 'three'

/**
 * Options for the useNDTransformUpdates hook.
 */
export interface UseNDTransformUpdatesOptions {
  /**
   * Override projection distance calculation.
   * If not provided, uses default from NDTransformSource.
   */
  projectionDistance?: number

  /**
   * Whether to force update even if inputs haven't changed.
   * Useful after material recreation.
   * @default false
   */
  forceUpdate?: boolean
}

/**
 * Result from useNDTransformUpdates hook.
 */
export interface UseNDTransformUpdatesResult {
  /**
   * The NDTransformSource instance.
   * Can be used to apply uniforms to materials.
   */
  source: NDTransformSource

  /**
   * Update the source with current state.
   * Call this in useFrame before applying to materials.
   *
   * @param overrides - Optional overrides for projection distance, scales
   * @returns Whether the source was updated (version changed)
   */
  update: (overrides?: { projectionDistance?: number; scales?: number[] }) => boolean

  /**
   * Apply uniforms to a material.
   * Only updates uniforms that exist on the material.
   *
   * @param material - The shader material to update
   */
  applyToMaterial: (material: THREE.ShaderMaterial) => void

  /**
   * Check if source has changes since last applied to material.
   *
   * @param lastVersion - Last version applied to the material
   * @returns Whether there are changes
   */
  hasChanges: (lastVersion: number) => boolean
}

/**
 * Hook for managing N-dimensional GPU transform updates.
 *
 * This hook creates and manages an NDTransformSource instance,
 * handling store subscriptions and providing update utilities.
 *
 * @param options - Hook configuration options
 * @returns Transform update utilities
 *
 * @example
 * ```tsx
 * function MyRenderer() {
 *   const materialRef = useRef<THREE.ShaderMaterial>(null);
 *   const lastVersionRef = useRef(-1);
 *   const ndTransform = useNDTransformUpdates();
 *
 *   useFrame(() => {
 *     if (!materialRef.current) return;
 *
 *     // Update source with current state
 *     ndTransform.update({ projectionDistance: 15 });
 *
 *     // Only apply if changed
 *     if (ndTransform.hasChanges(lastVersionRef.current)) {
 *       ndTransform.applyToMaterial(materialRef.current);
 *       lastVersionRef.current = ndTransform.source.version;
 *     }
 *   });
 *
 *   return <mesh><shaderMaterial ref={materialRef} /></mesh>;
 * }
 * ```
 */
export function useNDTransformUpdates(
  options: UseNDTransformUpdatesOptions = {}
): UseNDTransformUpdatesResult {
  const { projectionDistance: defaultProjectionDistance, forceUpdate = false } = options

  // Create stable source instance
  const source = useMemo(() => new NDTransformSource(), [])

  // Cache store state in refs to avoid getState() calls during callbacks
  const rotationStateRef = useRef(useRotationStore.getState())
  const geometryStateRef = useRef(useGeometryStore.getState())
  const transformStateRef = useRef(useTransformStore.getState())

  // Subscribe to store changes to update refs
  useEffect(() => {
    const unsubRot = useRotationStore.subscribe((s) => {
      rotationStateRef.current = s
    })
    const unsubGeom = useGeometryStore.subscribe((s) => {
      geometryStateRef.current = s
    })
    const unsubTrans = useTransformStore.subscribe((s) => {
      transformStateRef.current = s
    })
    return () => {
      unsubRot()
      unsubGeom()
      unsubTrans()
    }
  }, [])

  // Track last update version for change detection
  const lastUpdateVersionRef = useRef(-1)

  // OPT-SCALES-1: Pre-allocated scales array to avoid per-frame allocation
  const scalesArrayRef = useRef<number[]>([])

  const update = (overrides?: { projectionDistance?: number; scales?: number[] }): boolean => {
    const rotState = rotationStateRef.current
    const geomState = geometryStateRef.current
    const transState = transformStateRef.current

    // Build scales array from store, reusing pre-allocated array
    const scales =
      overrides?.scales ??
      buildScalesArrayInto(
        scalesArrayRef.current,
        geomState.dimension,
        transState.uniformScale,
        transState.perAxisScale
      )

    // Build config
    const config: NDTransformConfig = {
      dimension: geomState.dimension,
      rotations: rotState.rotations,
      rotationVersion: rotState.version,
      scales,
      uniformScale: transState.uniformScale,
      projectionDistance: overrides?.projectionDistance ?? defaultProjectionDistance,
    }

    // Force update if requested
    if (forceUpdate && lastUpdateVersionRef.current === source.version) {
      source.reset()
    }

    const prevVersion = source.version
    source.updateFromStore(config)

    const changed = source.version !== prevVersion
    lastUpdateVersionRef.current = source.version

    return changed
  }

  const applyToMaterial = (material: THREE.ShaderMaterial): void => {
    source.applyToMaterial(material)
  }

  const hasChanges = (lastVersion: number): boolean => {
    return source.version !== lastVersion
  }

  return {
    source,
    update,
    applyToMaterial,
    hasChanges,
  }
}

/**
 * Build scales array from store state into a pre-allocated array.
 *
 * OPT-SCALES-1: Reuses the provided array to avoid per-frame allocation.
 *
 * @param out - Output array to write into (will be resized if needed)
 * @param dimension - Current dimension
 * @param uniformScale - Uniform scale multiplier
 * @param perAxisScale - Per-axis scale array
 * @returns The out array, resized and populated with scale values
 */
function buildScalesArrayInto(
  out: number[],
  dimension: number,
  uniformScale: number,
  perAxisScale: number[]
): number[] {
  // Resize array if needed (only allocates when dimension changes)
  out.length = dimension
  for (let i = 0; i < dimension; i++) {
    out[i] = perAxisScale[i] ?? uniformScale
  }
  return out
}
