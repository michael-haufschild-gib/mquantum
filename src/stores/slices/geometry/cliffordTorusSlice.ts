import { DEFAULT_CLIFFORD_TORUS_CONFIG } from '@/lib/geometry/extended/types'
import { StateCreator } from 'zustand'
import { CliffordTorusSlice, ExtendedObjectSlice } from './types'

export const createCliffordTorusSlice: StateCreator<
  ExtendedObjectSlice,
  [],
  [],
  CliffordTorusSlice
> = (set, get) => ({
  cliffordTorus: { ...DEFAULT_CLIFFORD_TORUS_CONFIG },

  setCliffordTorusMode: (mode) => {
    set((state) => ({
      cliffordTorus: { ...state.cliffordTorus, mode },
    }))
  },

  setCliffordTorusRadius: (radius) => {
    const clampedRadius = Math.max(0.5, Math.min(6.0, radius))
    set((state) => ({
      cliffordTorus: { ...state.cliffordTorus, radius: clampedRadius },
    }))
  },

  setCliffordTorusResolutionU: (resolution) => {
    const clampedResolution = Math.max(8, Math.min(128, Math.floor(resolution)))
    set((state) => ({
      cliffordTorus: { ...state.cliffordTorus, resolutionU: clampedResolution },
    }))
  },

  setCliffordTorusResolutionV: (resolution) => {
    const clampedResolution = Math.max(8, Math.min(128, Math.floor(resolution)))
    set((state) => ({
      cliffordTorus: { ...state.cliffordTorus, resolutionV: clampedResolution },
    }))
  },

  setCliffordTorusEdgeMode: (mode) => {
    set((state) => ({
      cliffordTorus: { ...state.cliffordTorus, edgeMode: mode },
    }))
  },

  setCliffordTorusStepsPerCircle: (steps) => {
    // Reasonable range: 4-64 steps per circle (total points = steps^k)
    const clampedSteps = Math.max(4, Math.min(64, Math.floor(steps)))
    set((state) => ({
      cliffordTorus: { ...state.cliffordTorus, stepsPerCircle: clampedSteps },
    }))
  },

  initializeCliffordTorusForDimension: (dimension) => {
    // Update flat mode internal settings based on dimension
    const flatMode = dimension === 4 ? 'classic' : 'generalized'
    const current = get().cliffordTorus

    // Only update if mode changed
    if (flatMode !== current.mode) {
      set((state) => ({
        cliffordTorus: {
          ...state.cliffordTorus,
          mode: flatMode,
        },
      }))
    }
  },
})
