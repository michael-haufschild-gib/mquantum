/**
 * TDSE Stochastic Decoherence setter factory.
 *
 * Extracts stochastic localization and branch visualization setters
 * from the main tdseSetters module to stay within file size limits.
 *
 * @module stores/slices/geometry/setters/tdseStochasticSetters
 */

import { normalizeTdseBranchColor, type TdseBranchColor } from '@/lib/geometry/extended/tdse'
import { MAX_STOCHASTIC_SITES } from '@/lib/physics/stochastic/localizationKernel'

import { nestedClampedSetter, nestedIntSetter, type SetterContext } from './sliceSetterUtils'

/** Actions exposed by the TDSE stochastic decoherence setter bundle. */
export interface TdseStochasticSetters {
  setTdseStochasticEnabled: (enabled: boolean) => void
  setTdseStochasticGamma: (gamma: number) => void
  setTdseStochasticSigma: (sigma: number) => void
  setTdseStochasticNumSites: (numSites: number) => void
  setTdseStochasticSeed: (seed: number) => void
  setTdseBranchingEnabled: (enabled: boolean) => void
  setTdseBranchPlanePosition: (position: number) => void
  setTdseBranchColorA: (color: [number, number, number]) => void
  setTdseBranchColorB: (color: [number, number, number]) => void
}

type BranchColorField = 'branchColorA' | 'branchColorB'

function branchColorSetter(
  ctx: SetterContext,
  field: BranchColorField
): (value: TdseBranchColor) => void {
  return (value: TdseBranchColor) => {
    const color = normalizeTdseBranchColor(value)
    if (!color) {
      ctx.warnNonFinite(`tdse.${field}`, value)
      return
    }
    ctx.setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        tdse: { ...state.schroedinger.tdse, [field]: color },
      },
    }))
  }
}

/**
 * Creates stochastic decoherence setter actions for the schroedingerSlice.
 *
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createTdseStochasticSetters(ctx: SetterContext): TdseStochasticSetters {
  const D = 'tdse' as const

  return {
    setTdseStochasticEnabled: (enabled) => {
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: {
            ...state.schroedinger.tdse,
            stochasticEnabled:
              state.schroedinger.tdse.potentialType === 'blackHoleRingdown' ? false : enabled,
          },
        },
      }))
    },
    setTdseStochasticGamma: nestedClampedSetter(ctx, D, 'stochasticGamma', 0, 10),
    setTdseStochasticSigma: nestedClampedSetter(ctx, D, 'stochasticSigma', 0.5, 5.0),
    setTdseStochasticNumSites: nestedIntSetter(
      ctx,
      D,
      'stochasticNumSites',
      1,
      MAX_STOCHASTIC_SITES,
      'floor'
    ),
    setTdseStochasticSeed: nestedIntSetter(ctx, D, 'stochasticSeed', 0, 999999, 'floor'),
    setTdseBranchingEnabled: (enabled) => {
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: {
            ...state.schroedinger.tdse,
            branchingEnabled:
              state.schroedinger.tdse.potentialType === 'blackHoleRingdown' ? false : enabled,
          },
        },
      }))
    },
    setTdseBranchPlanePosition: nestedClampedSetter(ctx, D, 'branchPlanePosition', -1.0, 1.0),
    setTdseBranchColorA: branchColorSetter(ctx, 'branchColorA'),
    setTdseBranchColorB: branchColorSetter(ctx, 'branchColorB'),
  }
}
