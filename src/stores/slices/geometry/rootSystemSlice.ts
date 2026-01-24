import { DEFAULT_ROOT_SYSTEM_CONFIG } from '@/lib/geometry/extended/types'
import { StateCreator } from 'zustand'
import { ExtendedObjectSlice, RootSystemSlice } from './types'

export const createRootSystemSlice: StateCreator<ExtendedObjectSlice, [], [], RootSystemSlice> = (
  set
) => ({
  rootSystem: { ...DEFAULT_ROOT_SYSTEM_CONFIG },

  setRootSystemType: (type) => {
    set((state) => ({
      rootSystem: { ...state.rootSystem, rootType: type },
    }))
  },

  setRootSystemScale: (scale) => {
    const clampedScale = Math.max(0.5, Math.min(4.0, scale))
    set((state) => ({
      rootSystem: { ...state.rootSystem, scale: clampedScale },
    }))
  },
})
