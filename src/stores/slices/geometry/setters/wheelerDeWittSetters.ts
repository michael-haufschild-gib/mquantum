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
  setWdwSwamplandEnabled: (enabled: boolean) => void
  setWdwSwamplandC: (c: number) => void
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
  const setSwamplandEnabled = nestedValueSetter(ctx, 'wheelerDeWitt', 'swamplandEnabled')
  const setSwamplandC = nestedClampedSetter(ctx, 'wheelerDeWitt', 'swamplandC', 0, 3)

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
    setWdwSwamplandEnabled: (enabled) => setSwamplandEnabled(enabled),
    setWdwSwamplandC: (c) => setSwamplandC(c),
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
