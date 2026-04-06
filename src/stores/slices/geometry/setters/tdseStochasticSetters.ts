/**
 * TDSE Stochastic Decoherence setter factory.
 *
 * Extracts stochastic localization and branch visualization setters
 * from the main tdseSetters module to stay within file size limits.
 *
 * @module stores/slices/geometry/setters/tdseStochasticSetters
 */

import { MAX_STOCHASTIC_SITES } from '@/lib/physics/stochastic/localizationKernel'

import type { SchroedingerSliceActions } from '../types'
import {
  nestedClampedSetter,
  nestedIntSetter,
  nestedValueSetter,
  type SetterContext,
} from './sliceSetterUtils'

type StochasticActions = Pick<
  SchroedingerSliceActions,
  | 'setTdseStochasticEnabled'
  | 'setTdseStochasticGamma'
  | 'setTdseStochasticSigma'
  | 'setTdseStochasticNumSites'
  | 'setTdseStochasticSeed'
  | 'setTdseBranchingEnabled'
  | 'setTdseBranchPlanePosition'
  | 'setTdseBranchColorA'
  | 'setTdseBranchColorB'
>

/**
 * Creates stochastic decoherence setter actions for the schroedingerSlice.
 *
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createTdseStochasticSetters(ctx: SetterContext): StochasticActions {
  const D = 'tdse' as const

  return {
    setTdseStochasticEnabled: nestedValueSetter(ctx, D, 'stochasticEnabled'),
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
    setTdseBranchingEnabled: nestedValueSetter(ctx, D, 'branchingEnabled'),
    setTdseBranchPlanePosition: nestedClampedSetter(ctx, D, 'branchPlanePosition', -1.0, 1.0),
    setTdseBranchColorA: nestedValueSetter(ctx, D, 'branchColorA'),
    setTdseBranchColorB: nestedValueSetter(ctx, D, 'branchColorB'),
  }
}
