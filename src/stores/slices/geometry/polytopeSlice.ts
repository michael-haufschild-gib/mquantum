import { DEFAULT_POLYTOPE_CONFIG, DEFAULT_POLYTOPE_SCALES } from '@/lib/geometry/extended/types'
import { StateCreator } from 'zustand'
import { ExtendedObjectSlice, PolytopeSlice } from './types'

export const createPolytopeSlice: StateCreator<ExtendedObjectSlice, [], [], PolytopeSlice> = (
  set
) => {
  /**
   * Wrapped setter that auto-increments polytopeVersion on any polytope change.
   * This avoids manually adding version increment to individual setters.
   */
  const setWithVersion: typeof set = (updater) => {
    set((state) => {
      const update = typeof updater === 'function' ? updater(state) : updater
      if ('polytope' in update) {
        return { ...update, polytopeVersion: state.polytopeVersion + 1 }
      }
      return update
    })
  }

  return {
    polytope: { ...DEFAULT_POLYTOPE_CONFIG },

    setPolytopeScale: (scale: number) => {
      // Range 0.5-8.0 to accommodate different polytope types (simplex needs up to 8)
      const clampedScale = Math.max(0.5, Math.min(8.0, scale))
      setWithVersion((state) => ({
        polytope: { ...state.polytope, scale: clampedScale },
      }))
    },

    initializePolytopeForType: (polytopeType: string) => {
      const defaultScale = DEFAULT_POLYTOPE_SCALES[polytopeType] ?? DEFAULT_POLYTOPE_CONFIG.scale
      setWithVersion((state) => ({
        polytope: { ...state.polytope, scale: defaultScale },
      }))
    },
  }
}
