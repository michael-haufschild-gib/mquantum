/**
 * Wythoff Polytope Store Slice
 *
 * Manages state for Wythoff polytope configuration including:
 * - Symmetry group (A, B, D)
 * - Preset type (regular, rectified, truncated, etc.)
 * - Custom Wythoff symbol
 * - Scale and snub options
 */

import {
  DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
  DEFAULT_WYTHOFF_SCALES,
  WythoffPolytopeConfig,
  WythoffPreset,
  WythoffSymmetryGroup,
} from '@/lib/geometry/extended/types'
import { StateCreator } from 'zustand'
import { ExtendedObjectSlice, WythoffPolytopeSlice } from './types'

export const createWythoffPolytopeSlice: StateCreator<
  ExtendedObjectSlice,
  [],
  [],
  WythoffPolytopeSlice
> = (set) => ({
  wythoffPolytope: { ...DEFAULT_WYTHOFF_POLYTOPE_CONFIG },

  setWythoffSymmetryGroup: (symmetryGroup: WythoffSymmetryGroup) => {
    set((state) => ({
      wythoffPolytope: { ...state.wythoffPolytope, symmetryGroup },
    }))
  },

  setWythoffPreset: (preset: WythoffPreset) => {
    // Update scale to preset default when changing preset
    const defaultScale = DEFAULT_WYTHOFF_SCALES[preset] ?? 2.0
    set((state) => ({
      wythoffPolytope: {
        ...state.wythoffPolytope,
        preset,
        scale: defaultScale,
      },
    }))
  },

  setWythoffCustomSymbol: (customSymbol: boolean[]) => {
    set((state) => ({
      wythoffPolytope: { ...state.wythoffPolytope, customSymbol },
    }))
  },

  setWythoffScale: (scale: number) => {
    // Clamp scale to valid range
    const clampedScale = Math.max(0.5, Math.min(5.0, scale))
    set((state) => ({
      wythoffPolytope: { ...state.wythoffPolytope, scale: clampedScale },
    }))
  },

  setWythoffSnub: (snub: boolean) => {
    set((state) => ({
      wythoffPolytope: { ...state.wythoffPolytope, snub },
    }))
  },

  setWythoffConfig: (config: Partial<WythoffPolytopeConfig>) => {
    set((state) => ({
      wythoffPolytope: { ...state.wythoffPolytope, ...config },
    }))
  },

  initializeWythoffForDimension: (dimension: number) => {
    // D_n symmetry requires dimension >= 4
    set((state) => {
      const currentGroup = state.wythoffPolytope.symmetryGroup
      const newGroup = currentGroup === 'D' && dimension < 4 ? 'B' : currentGroup

      return {
        wythoffPolytope: {
          ...state.wythoffPolytope,
          symmetryGroup: newGroup,
        },
      }
    })
  },
})


























