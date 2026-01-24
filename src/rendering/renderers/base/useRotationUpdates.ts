/**
 * Hook for managing N-dimensional rotation and basis vector updates.
 *
 * Handles the computation of rotated basis vectors (X, Y, Z) and origin
 * with caching to avoid unnecessary recomputation. Only recomputes when
 * rotations, dimension, or parameters change.
 *
 * @module rendering/renderers/base/useRotationUpdates
 */

import { composeRotations } from '@/lib/math/rotation'
import type { MatrixND } from '@/lib/math/types'
import { useRotationStore } from '@/stores/rotationStore'
import { useEffect, useRef } from 'react'
import {
  applyRotationInPlace,
  createWorkingArrays,
  MAX_DIMENSION,
  type WorkingArrays,
} from './types'

/**
 * Options for the useRotationUpdates hook.
 */
export interface UseRotationUpdatesOptions {
  /** Current dimension (3-11) */
  dimension: number

  /** Parameter values for extra dimensions (slice positions) */
  parameterValues: number[]

  /**
   * Whether to force recomputation even if inputs haven't changed.
   * Useful after material recreation.
   * @default false
   */
  forceUpdate?: boolean
}

/**
 * Result from computing basis vectors and origin.
 */
export interface BasisVectorsResult {
  /** Rotated X basis vector */
  basisX: Float32Array
  /** Rotated Y basis vector */
  basisY: Float32Array
  /** Rotated Z basis vector */
  basisZ: Float32Array
  /** Whether basis vectors were recomputed this frame */
  changed: boolean
}

/**
 * Result from computing the origin point.
 */
export interface OriginResult {
  /** Rotated origin vector */
  origin: Float32Array
  /** Whether origin was recomputed this frame */
  changed: boolean
}

/**
 * Return value from useRotationUpdates hook.
 */
export interface UseRotationUpdatesResult {
  /**
   * Compute and return the current basis vectors.
   * Caches results and only recomputes when inputs change.
   *
   * @param rotationsChanged - Whether rotations changed this frame
   * @returns The current basis vectors and whether they changed
   */
  getBasisVectors: (rotationsChanged: boolean) => BasisVectorsResult

  /**
   * Compute and return the current origin point.
   * Applies the cached rotation matrix to the origin.
   *
   * @param originValues - Origin point before rotation (extra dimension values)
   * @returns The rotated origin and whether it changed
   */
  getOrigin: (originValues: number[]) => OriginResult

  /**
   * The cached rotation matrix.
   * Null if no rotation has been computed yet.
   */
  rotationMatrix: MatrixND | null

  /**
   * Mark basis vectors as dirty, forcing recomputation on next call.
   * Useful after dimension or parameter changes from outside the hook.
   */
  markDirty: () => void

  /**
   * Direct access to working arrays for advanced use cases.
   * Prefer using getBasisVectors and getOrigin instead.
   */
  workingArrays: WorkingArrays
}

/**
 * Hook for managing N-dimensional rotation and basis vector updates.
 *
 * This hook provides efficient basis vector computation with caching.
 * It only recomputes the rotation matrix and basis vectors when the
 * rotations, dimension, or parameters actually change.
 *
 * @param options - Hook configuration options
 * @returns Rotation update utilities
 *
 * @example
 * ```tsx
 * const { getBasisVectors, getOrigin } = useRotationUpdates({
 *   dimension,
 *   parameterValues,
 * });
 *
 * useFrame(() => {
 *   const { basisX, basisY, basisZ, changed } = getBasisVectors(rotationsChanged);
 *
 *   if (changed) {
 *     material.uniforms.uBasisX.value.set(basisX);
 *     material.uniforms.uBasisY.value.set(basisY);
 *     material.uniforms.uBasisZ.value.set(basisZ);
 *   }
 *
 *   // Compute origin with extra dimension values
 *   const originValues = new Array(MAX_DIMENSION).fill(0);
 *   for (let i = 3; i < dimension; i++) {
 *     originValues[i] = parameterValues[i - 3] ?? 0;
 *   }
 *   const { origin } = getOrigin(originValues);
 *   material.uniforms.uOrigin.value.set(origin);
 * }, FRAME_PRIORITY.RENDERER_UNIFORMS);
 * ```
 */
export function useRotationUpdates(options: UseRotationUpdatesOptions): UseRotationUpdatesResult {
  const { dimension, parameterValues, forceUpdate = false } = options

  // Pre-allocated working arrays to avoid per-frame allocations
  const workingArraysRef = useRef<WorkingArrays>(createWorkingArrays())

  // Cached rotation matrix and basis vectors - only recomputed when needed
  const cachedRotationMatrixRef = useRef<MatrixND | null>(null)
  const prevDimensionRef = useRef<number | null>(null)
  const prevParamValuesRef = useRef<number[] | null>(null)
  const basisVectorsDirtyRef = useRef(true)

  // Track last computed origin for change detection
  const prevOriginValuesRef = useRef<number[] | null>(null)

  // Subscription refs for rotations - updated reactively via Zustand subscribe
  // This avoids getState() calls during callbacks
  const rotationsRef = useRef(useRotationStore.getState().rotations)
  const rotationVersionRef = useRef(useRotationStore.getState().version)
  // Track the last version we used for basis vector computation
  const lastComputedVersionRef = useRef<number>(-1)

  useEffect(() => {
    // Subscribe to rotation changes and update refs
    // Zustand 5 subscribe takes a single listener that receives full state
    const unsubscribe = useRotationStore.subscribe((state) => {
      rotationsRef.current = state.rotations
      rotationVersionRef.current = state.version
    })
    return unsubscribe
  }, [])

  const markDirty = () => {
    basisVectorsDirtyRef.current = true
  }

  const getBasisVectors = (rotationsChangedHint: boolean): BasisVectorsResult => {
    const work = workingArraysRef.current

    // Detect rotation changes by comparing version numbers
    // This is the authoritative check - the hint parameter is for backwards compatibility
    // and may be stale if caller computed it during React render
    const currentVersion = rotationVersionRef.current
    const rotationsActuallyChanged = currentVersion !== lastComputedVersionRef.current

    // Check if parameterValues changed (shallow array comparison)
    const paramsChanged =
      !prevParamValuesRef.current ||
      prevParamValuesRef.current.length !== parameterValues.length ||
      parameterValues.some((v, i) => prevParamValuesRef.current![i] !== v)

    // Determine if we need to recompute basis vectors
    // Use both the hint AND our internal version check
    const needsRecompute =
      forceUpdate ||
      rotationsChangedHint ||
      rotationsActuallyChanged ||
      dimension !== prevDimensionRef.current ||
      paramsChanged ||
      basisVectorsDirtyRef.current

    if (needsRecompute) {
      // Get current rotations from subscription ref (no getState during callbacks)
      const rotations = rotationsRef.current

      // Update version tracking
      lastComputedVersionRef.current = currentVersion

      // Compute rotation matrix only when needed
      cachedRotationMatrixRef.current = composeRotations(dimension, rotations)

      // Prepare unit vectors in pre-allocated arrays (no allocation)
      // Clear and set up unitX = [1, 0, 0, ...]
      for (let i = 0; i < MAX_DIMENSION; i++) work.unitX[i] = 0
      work.unitX[0] = 1

      // Clear and set up unitY = [0, 1, 0, ...]
      for (let i = 0; i < MAX_DIMENSION; i++) work.unitY[i] = 0
      work.unitY[1] = 1

      // Clear and set up unitZ = [0, 0, 1, ...]
      for (let i = 0; i < MAX_DIMENSION; i++) work.unitZ[i] = 0
      work.unitZ[2] = 1

      // Apply rotation to basis vectors using pre-allocated output arrays
      applyRotationInPlace(cachedRotationMatrixRef.current, work.unitX, work.rotatedX, dimension)
      applyRotationInPlace(cachedRotationMatrixRef.current, work.unitY, work.rotatedY, dimension)
      applyRotationInPlace(cachedRotationMatrixRef.current, work.unitZ, work.rotatedZ, dimension)

      // Update tracking refs
      prevDimensionRef.current = dimension
      prevParamValuesRef.current = [...parameterValues]
      basisVectorsDirtyRef.current = false
    }

    return {
      basisX: work.rotatedX,
      basisY: work.rotatedY,
      basisZ: work.rotatedZ,
      changed: needsRecompute,
    }
  }

  const getOrigin = (originValues: number[]): OriginResult => {
    const work = workingArraysRef.current

    // Check if origin values changed
    const originChanged =
      !prevOriginValuesRef.current ||
      prevOriginValuesRef.current.length !== originValues.length ||
      originValues.some((v, i) => prevOriginValuesRef.current![i] !== v)

    // Always recompute origin if we have a rotation matrix
    // (origin often changes every frame for animations)
    if (cachedRotationMatrixRef.current) {
      // Set up origin values
      for (let i = 0; i < MAX_DIMENSION; i++) {
        work.origin[i] = originValues[i] ?? 0
      }

      // Apply rotation to origin
      applyRotationInPlace(
        cachedRotationMatrixRef.current,
        work.origin,
        work.rotatedOrigin,
        dimension
      )

      // Update tracking ref
      prevOriginValuesRef.current = [...originValues]
    }

    return {
      origin: work.rotatedOrigin,
      changed: originChanged,
    }
  }

  return {
    getBasisVectors,
    getOrigin,
    rotationMatrix: cachedRotationMatrixRef.current,
    markDirty,
    workingArrays: workingArraysRef.current,
  }
}
