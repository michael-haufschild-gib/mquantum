/**
 * Transform state management using Zustand
 * Manages scale transformations
 */

import { createScaleMatrix } from '@/lib/math'
import type { MatrixND } from '@/lib/math/types'
import { create } from 'zustand'
import { MAX_DIMENSION, MIN_DIMENSION } from './geometryStore'

/** Minimum scale value */
export const MIN_SCALE = 0.1

/** Maximum scale value */
export const MAX_SCALE = 3.0

/** Default scale value */
export const DEFAULT_SCALE = 1.0

/** Scale warning threshold (low) */
export const SCALE_WARNING_LOW = 0.2

/** Scale warning threshold (high) */
export const SCALE_WARNING_HIGH = 2.5

interface TransformState {
  // Scale
  uniformScale: number
  perAxisScale: number[]
  scaleLocked: boolean

  // Current dimension (for generating correct sized arrays)
  dimension: number

  // Scale actions
  setUniformScale: (value: number) => void
  setAxisScale: (axis: number, value: number) => void
  setScaleLocked: (locked: boolean) => void
  resetScale: () => void
  getScaleMatrix: () => MatrixND
  isScaleExtreme: () => boolean

  // General actions
  setDimension: (dimension: number) => void
  resetAll: () => void
  /** Reset store to initial state (alias for resetAll for API consistency) */
  reset: () => void
}

/**
 * Clamps a scale value to valid range
 * @param value - Scale value to clamp
 * @returns Clamped scale value
 */
function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value))
}

/**
 * Creates default per-axis scale array for given dimension
 * @param dimension - Number of dimensions
 * @returns Array of default scale values
 */
function createDefaultScales(dimension: number): number[] {
  return new Array(dimension).fill(DEFAULT_SCALE)
}

export const useTransformStore = create<TransformState>((set, get) => ({
  // Initial state
  uniformScale: DEFAULT_SCALE,
  perAxisScale: createDefaultScales(4),
  scaleLocked: true,
  dimension: 4,

  // Scale actions
  setUniformScale: (value: number) => {
    const clamped = clampScale(value)
    set((state) => {
      if (state.scaleLocked) {
        // When locked, update all per-axis scales too
        return {
          uniformScale: clamped,
          perAxisScale: new Array(state.dimension).fill(clamped),
        }
      }
      return { uniformScale: clamped }
    })
  },

  setAxisScale: (axis: number, value: number) => {
    const clamped = clampScale(value)
    set((state) => {
      if (axis < 0 || axis >= state.dimension) {
        return state
      }

      const newScales = [...state.perAxisScale]
      newScales[axis] = clamped

      if (state.scaleLocked) {
        // When locked, update uniform and all axes
        return {
          uniformScale: clamped,
          perAxisScale: new Array(state.dimension).fill(clamped),
        }
      }

      return { perAxisScale: newScales }
    })
  },

  setScaleLocked: (locked: boolean) => {
    set((state) => {
      if (locked) {
        // When locking, sync all axes to uniform scale
        return {
          scaleLocked: true,
          perAxisScale: new Array(state.dimension).fill(state.uniformScale),
        }
      }
      return { scaleLocked: false }
    })
  },

  resetScale: () => {
    set((state) => ({
      uniformScale: DEFAULT_SCALE,
      perAxisScale: createDefaultScales(state.dimension),
    }))
  },

  getScaleMatrix: () => {
    const state = get()
    return createScaleMatrix(state.dimension, state.perAxisScale)
  },

  isScaleExtreme: () => {
    const state = get()
    return state.perAxisScale.some((s) => s < SCALE_WARNING_LOW || s > SCALE_WARNING_HIGH)
  },

  // General actions
  setDimension: (dimension: number) => {
    if (dimension < MIN_DIMENSION || dimension > MAX_DIMENSION) {
      return
    }

    set((state) => {
      // Reset scales completely when dimension changes to prevent accumulated
      // scale values from causing issues in the new dimension space
      if (state.dimension !== dimension) {
        return {
          dimension,
          perAxisScale: createDefaultScales(dimension),
          uniformScale: DEFAULT_SCALE,
        }
      }
      return state
    })
  },

  resetAll: () => {
    set((state) => ({
      uniformScale: DEFAULT_SCALE,
      perAxisScale: createDefaultScales(state.dimension),
      scaleLocked: true,
    }))
  },

  // Alias for resetAll - provides consistent API across stores
  reset: () => get().resetAll(),
}))
