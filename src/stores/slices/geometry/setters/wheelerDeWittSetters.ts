/**
 * Wheeler–DeWitt minisuperspace setters.
 *
 * Each setter writes a field on `schroedinger.wheelerDeWitt` and bumps the
 * schroedinger version counter. Physics-affecting setters also set
 * `needsReset = true` so the strategy re-runs the CPU solver on the next
 * render frame.
 *
 * @module stores/slices/geometry/setters/wheelerDeWittSetters
 */

import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'

import { nestedClampedSetter, nestedValueSetter, type SetterContext } from './sliceSetterUtils'

/** Grid-size preset tuple: (Na, Nphi). All within the solver's CFL budget at
 * default `(aMin, aMax, phiExtent)` and the hard minima (>= 3). */
export type WdwGridPreset = 'low' | 'medium' | 'high'
export const WDW_GRID_PRESETS: Record<WdwGridPreset, { gridNa: number; gridNphi: number }> = {
  low: { gridNa: 64, gridNphi: 16 },
  medium: { gridNa: 128, gridNphi: 32 },
  high: { gridNa: 192, gridNphi: 32 },
}

/** Actions exposed by the Wheeler–DeWitt setter bundle. */
export interface WheelerDeWittSetters {
  setWdwBoundaryCondition: (bc: WdwBoundaryCondition) => void
  setWdwInflatonMass: (m: number) => void
  setWdwCosmologicalConstant: (lambda: number) => void
  setWdwGridSize: (preset: WdwGridPreset) => void
  setWdwStreamlinesEnabled: (enabled: boolean) => void
  setWdwStreamlineDensity: (density: number) => void
  setWdwPhaseRotationEnabled: (enabled: boolean) => void
  setWdwPhaseRotationSpeed: (speed: number) => void
  setWdwWorldlineEnabled: (enabled: boolean) => void
  setWdwWorldlineSpeed: (speed: number) => void
  setWdwWorldlinePulseWidth: (w: number) => void
  applyWheelerDeWittPreset: (presetId: string) => void
  triggerWdwRecompute: () => void
  clearWdwNeedsReset: () => void
}

/**
 * Build the Wheeler–DeWitt action bundle. All setters mutate
 * `schroedinger.wheelerDeWitt` and bump the schroedinger version counter.
 *
 * @param ctx - Shared setter context
 * @returns Map of action name → setter
 */
export function createWheelerDeWittSetters(ctx: SetterContext): WheelerDeWittSetters {
  // Render-only animation-effect setters: MUST NOT flip needsReset so the
  // solver does not re-run when the user toggles a visual overlay.
  const setPhaseRotationEnabled = nestedValueSetter(ctx, 'wheelerDeWitt', 'phaseRotationEnabled')
  const setPhaseRotationSpeed = nestedClampedSetter(
    ctx,
    'wheelerDeWitt',
    'phaseRotationSpeed',
    0,
    5
  )
  const setWorldlineEnabled = nestedValueSetter(ctx, 'wheelerDeWitt', 'worldlineEnabled')
  const setWorldlineSpeed = nestedClampedSetter(ctx, 'wheelerDeWitt', 'worldlineSpeed', 0.1, 3)
  const setWorldlinePulseWidth = nestedClampedSetter(
    ctx,
    'wheelerDeWitt',
    'worldlinePulseWidth',
    0.02,
    0.3
  )

  // Display-only streamline setters. These fields drive WKB trajectory
  // integration on the cached solver output — they MUST NOT flip needsReset
  // or the strategy would re-run the full ~10-15 ms Wheeler–DeWitt solve on a
  // pure overlay toggle. Trajectory rebuild is triggered separately via
  // `computeWdwTrajectoryHash` inside WheelerDeWittStrategy.
  const setStreamlinesEnabled = nestedValueSetter(ctx, 'wheelerDeWitt', 'streamlinesEnabled')

  /**
   * Physics setters: update the field AND flip `needsReset` in a single
   * setWithVersion call. Calling a nested*Setter first and then a second
   * setWithVersion for `needsReset` would cause two React state updates
   * (two version bumps, two re-renders) per physics mutation.
   */
  const applyWithReset = <V>(field: string, value: V): void => {
    ctx.setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        wheelerDeWitt: {
          ...state.schroedinger.wheelerDeWitt,
          [field]: value,
          needsReset: true,
        },
      },
    }))
  }
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

  return {
    setWdwBoundaryCondition: (bc) => applyWithReset('boundaryCondition', bc),
    setWdwInflatonMass: (m) => {
      if (!ctx.isFinite(m)) {
        ctx.warnNonFinite('wheelerDeWitt.inflatonMass', m)
        return
      }
      applyWithReset('inflatonMass', clamp(m, 0, 2))
    },
    setWdwCosmologicalConstant: (lambda) => {
      if (!ctx.isFinite(lambda)) {
        ctx.warnNonFinite('wheelerDeWitt.cosmologicalConstant', lambda)
        return
      }
      applyWithReset('cosmologicalConstant', clamp(lambda, -1, 1))
    },
    setWdwGridSize: (preset) => {
      const { gridNa, gridNphi } = WDW_GRID_PRESETS[preset]
      // Physics mutation: write both fields + needsReset in one transaction so
      // the strategy re-solves exactly once.
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: {
            ...state.schroedinger.wheelerDeWitt,
            gridNa,
            gridNphi,
            needsReset: true,
          },
        },
      }))
    },
    // Display-only: no applyWithReset — solver output is unaffected, only the
    // WKB trajectory overlay is rebuilt on the next frame.
    setWdwStreamlinesEnabled: setStreamlinesEnabled,
    setWdwStreamlineDensity: (density) => {
      if (!ctx.isFinite(density)) {
        ctx.warnNonFinite('wheelerDeWitt.streamlineDensity', density)
        return
      }
      const clamped = clamp(Math.round(density), 2, 16)
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: {
            ...state.schroedinger.wheelerDeWitt,
            streamlineDensity: clamped,
          },
        },
      }))
    },
    // Render-only: no withReset — solver output is not affected.
    setWdwPhaseRotationEnabled: setPhaseRotationEnabled,
    setWdwPhaseRotationSpeed: setPhaseRotationSpeed,
    setWdwWorldlineEnabled: setWorldlineEnabled,
    setWdwWorldlineSpeed: setWorldlineSpeed,
    setWdwWorldlinePulseWidth: setWorldlinePulseWidth,
    applyWheelerDeWittPreset: (presetId) => {
      void import('@/lib/physics/wheelerDeWitt/presets')
        .then(({ getWdwPreset, WDW_PRESET_PHYSICS_FIELDS }) => {
          const preset = getWdwPreset(presetId)
          if (!preset) return
          ctx.setWithVersion((state) => {
            const prev = state.schroedinger.wheelerDeWitt
            // Scope to physics fields only. Render-only overlay toggles
            // (streamlines, phase rotation, worldline pulse) and grid/CFL
            // parameters stay at whatever the user already has.
            const physics: Partial<typeof prev> = {}
            for (const field of WDW_PRESET_PHYSICS_FIELDS) {
              const value = preset.overrides[field]
              if (value !== undefined) {
                ;(physics as Record<string, unknown>)[field] = value
              }
            }
            return {
              schroedinger: {
                ...state.schroedinger,
                wheelerDeWitt: {
                  ...prev,
                  ...physics,
                  needsReset: true,
                },
              },
            }
          })
        })
        .catch((error) => {
          if (import.meta.env?.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[wheelerDeWitt] applyWheelerDeWittPreset import failed', error)
          }
        })
    },
    triggerWdwRecompute: () => {
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: { ...state.schroedinger.wheelerDeWitt, needsReset: true },
        },
      }))
    },
    clearWdwNeedsReset: () => {
      ctx.set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: { ...state.schroedinger.wheelerDeWitt, needsReset: false },
        },
      }))
    },
  }
}
