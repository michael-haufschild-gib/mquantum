/**
 * Free Scalar Field k-space display-transform setter factory.
 *
 * Extracted from `freeScalarSetters.ts` to keep that file under the 600-line
 * limit. Bundles the ten setters that drive the k-space visualization
 * display chain (FFT shift, percentile windowing, gamma, radial broadening,
 * radial bin count). All numeric setters guard non-finite inputs and clamp
 * to physically meaningful ranges.
 *
 * @module stores/slices/geometry/setters/freeScalarKSpaceVizSetters
 */

import { isKSpaceDisplayMode, isKSpaceExposureMode } from '@/lib/geometry/extended/freeScalar'
import type { KSpaceDisplayMode, KSpaceExposureMode } from '@/lib/geometry/extended/types'

import type { SetterContext } from './sliceSetterUtils'

/** Actions exposed by the k-space visualization setter bundle. */
export interface FreeScalarKSpaceVizSetters {
  setFreeScalarKSpaceDisplayMode: (mode: KSpaceDisplayMode) => void
  setFreeScalarKSpaceFftShift: (enabled: boolean) => void
  setFreeScalarKSpaceExposureMode: (mode: KSpaceExposureMode) => void
  setFreeScalarKSpaceLowPercentile: (value: number) => void
  setFreeScalarKSpaceHighPercentile: (value: number) => void
  setFreeScalarKSpaceGamma: (value: number) => void
  setFreeScalarKSpaceBroadeningEnabled: (enabled: boolean) => void
  setFreeScalarKSpaceBroadeningRadius: (value: number) => void
  setFreeScalarKSpaceBroadeningSigma: (value: number) => void
  setFreeScalarKSpaceRadialBinCount: (value: number) => void
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Creates the k-space visualization setter actions for the schroedingerSlice.
 * @param ctx - Shared setter context with setWithVersion + finite-input helpers
 */
export function createFreeScalarKSpaceVizSetters(ctx: SetterContext): FreeScalarKSpaceVizSetters {
  const { setWithVersion, isFinite, warnNonFinite } = ctx

  return {
    setFreeScalarKSpaceDisplayMode: (mode) => {
      if (!isKSpaceDisplayMode(mode)) return
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, displayMode: mode },
          },
        },
      }))
    },
    setFreeScalarKSpaceFftShift: (enabled) => {
      if (!isBoolean(enabled)) return
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, fftShiftEnabled: enabled },
          },
        },
      }))
    },
    setFreeScalarKSpaceExposureMode: (mode) => {
      if (!isKSpaceExposureMode(mode)) return
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, exposureMode: mode },
          },
        },
      }))
    },
    setFreeScalarKSpaceLowPercentile: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.lowPercentile', value)
        return
      }
      setWithVersion((state) => {
        const viz = state.schroedinger.freeScalar.kSpaceViz
        const clamped = Math.max(0, Math.min(viz.highPercentile - 0.5, value))
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...state.schroedinger.freeScalar,
              kSpaceViz: { ...viz, lowPercentile: clamped },
            },
          },
        }
      })
    },
    setFreeScalarKSpaceHighPercentile: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.highPercentile', value)
        return
      }
      setWithVersion((state) => {
        const viz = state.schroedinger.freeScalar.kSpaceViz
        const clamped = Math.max(viz.lowPercentile + 0.5, Math.min(100, value))
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...state.schroedinger.freeScalar,
              kSpaceViz: { ...viz, highPercentile: clamped },
            },
          },
        }
      })
    },
    setFreeScalarKSpaceGamma: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.gamma', value)
        return
      }
      const clamped = Math.max(0.1, Math.min(3.0, value))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, gamma: clamped },
          },
        },
      }))
    },
    setFreeScalarKSpaceBroadeningEnabled: (enabled) => {
      if (!isBoolean(enabled)) return
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, broadeningEnabled: enabled },
          },
        },
      }))
    },
    setFreeScalarKSpaceBroadeningRadius: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.broadeningRadius', value)
        return
      }
      const clamped = Math.max(1, Math.min(5, Math.round(value)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, broadeningRadius: clamped },
          },
        },
      }))
    },
    setFreeScalarKSpaceBroadeningSigma: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.broadeningSigma', value)
        return
      }
      const clamped = Math.max(0.5, Math.min(3.0, value))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, broadeningSigma: clamped },
          },
        },
      }))
    },
    setFreeScalarKSpaceRadialBinCount: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.radialBinCount', value)
        return
      }
      const clamped = Math.max(16, Math.min(128, Math.round(value)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, radialBinCount: clamped },
          },
        },
      }))
    },
  }
}
