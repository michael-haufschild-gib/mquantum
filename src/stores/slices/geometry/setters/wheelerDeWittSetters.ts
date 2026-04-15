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

import {
  nestedClampedSetter,
  nestedIntSetter,
  nestedValueSetter,
  type SetterContext,
} from './sliceSetterUtils'

/** Actions exposed by the Wheeler–DeWitt setter bundle. */
export interface WheelerDeWittSetters {
  setWdwBoundaryCondition: (bc: WdwBoundaryCondition) => void
  setWdwInflatonMass: (m: number) => void
  setWdwCosmologicalConstant: (lambda: number) => void
  setWdwStreamlinesEnabled: (enabled: boolean) => void
  setWdwStreamlineDensity: (density: number) => void
  setWdwPhaseRotationEnabled: (enabled: boolean) => void
  setWdwPhaseRotationSpeed: (speed: number) => void
  setWdwWorldlineEnabled: (enabled: boolean) => void
  setWdwWorldlineSpeed: (speed: number) => void
  setWdwWorldlinePulseWidth: (w: number) => void
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
  const setBoundaryCondition = nestedValueSetter(ctx, 'wheelerDeWitt', 'boundaryCondition')
  const setInflatonMass = nestedClampedSetter(ctx, 'wheelerDeWitt', 'inflatonMass', 0, 2.0)
  const setCosmologicalConstant = nestedClampedSetter(
    ctx,
    'wheelerDeWitt',
    'cosmologicalConstant',
    -1,
    1
  )
  const setStreamlinesEnabled = nestedValueSetter(ctx, 'wheelerDeWitt', 'streamlinesEnabled')
  const setStreamlineDensity = nestedIntSetter(ctx, 'wheelerDeWitt', 'streamlineDensity', 2, 16)

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

  /** Physics setters also flip needsReset so the strategy re-runs the solver. */
  const withReset = (apply: () => void): void => {
    apply()
    ctx.setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        wheelerDeWitt: { ...state.schroedinger.wheelerDeWitt, needsReset: true },
      },
    }))
  }

  return {
    setWdwBoundaryCondition: (bc) => withReset(() => setBoundaryCondition(bc)),
    setWdwInflatonMass: (m) => withReset(() => setInflatonMass(m)),
    setWdwCosmologicalConstant: (lambda) => withReset(() => setCosmologicalConstant(lambda)),
    setWdwStreamlinesEnabled: (enabled) => withReset(() => setStreamlinesEnabled(enabled)),
    setWdwStreamlineDensity: (density) => withReset(() => setStreamlineDensity(density)),
    // Render-only: no withReset — solver output is not affected.
    setWdwPhaseRotationEnabled: setPhaseRotationEnabled,
    setWdwPhaseRotationSpeed: setPhaseRotationSpeed,
    setWdwWorldlineEnabled: setWorldlineEnabled,
    setWdwWorldlineSpeed: setWorldlineSpeed,
    setWdwWorldlinePulseWidth: setWorldlinePulseWidth,
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
