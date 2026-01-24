import { DEFAULT_NESTED_TORUS_CONFIG } from '@/lib/geometry/extended/types'
import { StateCreator } from 'zustand'
import { ExtendedObjectSlice, NestedTorusSlice } from './types'

export const createNestedTorusSlice: StateCreator<ExtendedObjectSlice, [], [], NestedTorusSlice> = (
  set
) => ({
  nestedTorus: { ...DEFAULT_NESTED_TORUS_CONFIG },

  setNestedTorusRadius: (radius) => {
    const clampedRadius = Math.max(0.5, Math.min(6.0, radius))
    set((state) => ({
      nestedTorus: { ...state.nestedTorus, radius: clampedRadius },
    }))
  },

  setNestedTorusEdgeMode: (mode) => {
    set((state) => ({
      nestedTorus: { ...state.nestedTorus, edgeMode: mode },
    }))
  },

  setNestedTorusEta: (eta) => {
    // Range: π/64 to π/2 - π/64 (approximately 0.05 to 1.52)
    const minEta = Math.PI / 64
    const maxEta = Math.PI / 2 - Math.PI / 64
    const clampedEta = Math.max(minEta, Math.min(maxEta, eta))
    set((state) => ({
      nestedTorus: { ...state.nestedTorus, eta: clampedEta },
    }))
  },

  setNestedTorusResolutionXi1: (resolution) => {
    const clampedResolution = Math.max(8, Math.min(128, Math.floor(resolution)))
    set((state) => ({
      nestedTorus: { ...state.nestedTorus, resolutionXi1: clampedResolution },
    }))
  },

  setNestedTorusResolutionXi2: (resolution) => {
    const clampedResolution = Math.max(8, Math.min(128, Math.floor(resolution)))
    set((state) => ({
      nestedTorus: { ...state.nestedTorus, resolutionXi2: clampedResolution },
    }))
  },

  setNestedTorusShowNestedTori: (show) => {
    set((state) => ({
      nestedTorus: { ...state.nestedTorus, showNestedTori: show },
    }))
  },

  setNestedTorusNumberOfTori: (count) => {
    const clampedCount = Math.max(2, Math.min(5, Math.floor(count)))
    set((state) => ({
      nestedTorus: { ...state.nestedTorus, numberOfTori: clampedCount },
    }))
  },

  setNestedTorusFiberResolution: (resolution) => {
    const clampedResolution = Math.max(4, Math.min(8, Math.floor(resolution)))
    set((state) => ({
      nestedTorus: { ...state.nestedTorus, fiberResolution: clampedResolution },
    }))
  },

  setNestedTorusBaseResolution: (resolution) => {
    const clampedResolution = Math.max(4, Math.min(12, Math.floor(resolution)))
    set((state) => ({
      nestedTorus: { ...state.nestedTorus, baseResolution: clampedResolution },
    }))
  },

  setNestedTorusShowFiberStructure: (show) => {
    set((state) => ({
      nestedTorus: { ...state.nestedTorus, showFiberStructure: show },
    }))
  },
})
