import type { StateCreator } from 'zustand'
import type { AdvancedRenderingSlice } from './types'

function isFiniteAdvancedRenderingInput(value: number): boolean {
  return Number.isFinite(value)
}

function clampAdvancedRenderingValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export const ADVANCED_RENDERING_INITIAL_STATE = {
  sssEnabled: false,
  sssIntensity: 1.0,
  sssColor: '#ff8844',
  sssThickness: 1.0,
  sssJitter: 0.2,
}

export const createAdvancedRenderingSlice: StateCreator<
  AdvancedRenderingSlice,
  [],
  [],
  AdvancedRenderingSlice
> = (set) => ({
  ...ADVANCED_RENDERING_INITIAL_STATE,

  setSssEnabled: (sssEnabled) => set({ sssEnabled }),
  setSssIntensity: (sssIntensity) => {
    if (!isFiniteAdvancedRenderingInput(sssIntensity)) {
      if (import.meta.env.DEV) {
        console.warn(
          '[advancedRenderingSlice] Ignoring non-finite SSS intensity:',
          sssIntensity
        )
      }
      return
    }
    set({ sssIntensity: clampAdvancedRenderingValue(sssIntensity, 0.0, 2.0) })
  },
  setSssColor: (sssColor) => set({ sssColor }),
  setSssThickness: (sssThickness) => {
    if (!isFiniteAdvancedRenderingInput(sssThickness)) {
      if (import.meta.env.DEV) {
        console.warn(
          '[advancedRenderingSlice] Ignoring non-finite SSS thickness:',
          sssThickness
        )
      }
      return
    }
    set({ sssThickness: clampAdvancedRenderingValue(sssThickness, 0.1, 5.0) })
  },
  setSssJitter: (sssJitter) => {
    if (!isFiniteAdvancedRenderingInput(sssJitter)) {
      if (import.meta.env.DEV) {
        console.warn('[advancedRenderingSlice] Ignoring non-finite SSS jitter:', sssJitter)
      }
      return
    }
    set({ sssJitter: clampAdvancedRenderingValue(sssJitter, 0.0, 1.0) })
  },
})
