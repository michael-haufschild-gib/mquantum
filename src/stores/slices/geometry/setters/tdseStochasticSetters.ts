/**
 * TDSE Stochastic Decoherence setter factory.
 *
 * Extracts stochastic localization and branch visualization setters
 * from the main tdseSetters module to stay within file size limits.
 *
 * @module stores/slices/geometry/setters/tdseStochasticSetters
 */

import type { SchroedingerSliceActions } from '../types'
import type { SetterContext } from './sliceSetterUtils'

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
  const { setWithVersion, isFinite, warnNonFinite } = ctx

  return {
    setTdseStochasticEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, stochasticEnabled: enabled },
        },
      }))
    },
    setTdseStochasticGamma: (gamma) => {
      if (!isFinite(gamma)) {
        warnNonFinite('tdse.stochasticGamma', gamma)
        return
      }
      const clamped = Math.max(0, Math.min(10, gamma))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, stochasticGamma: clamped },
        },
      }))
    },
    setTdseStochasticSigma: (sigma) => {
      if (!isFinite(sigma)) {
        warnNonFinite('tdse.stochasticSigma', sigma)
        return
      }
      const clamped = Math.max(0.5, Math.min(5.0, sigma))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, stochasticSigma: clamped },
        },
      }))
    },
    setTdseStochasticNumSites: (numSites) => {
      if (!isFinite(numSites)) {
        warnNonFinite('tdse.stochasticNumSites', numSites)
        return
      }
      const clamped = Math.max(1, Math.min(8, Math.floor(numSites)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, stochasticNumSites: clamped },
        },
      }))
    },
    setTdseStochasticSeed: (seed) => {
      if (!isFinite(seed)) {
        warnNonFinite('tdse.stochasticSeed', seed)
        return
      }
      const clamped = Math.max(0, Math.min(999999, Math.floor(seed)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, stochasticSeed: clamped },
        },
      }))
    },
    setTdseBranchingEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, branchingEnabled: enabled },
        },
      }))
    },
    setTdseBranchPlanePosition: (position) => {
      if (!isFinite(position)) {
        warnNonFinite('tdse.branchPlanePosition', position)
        return
      }
      const clamped = Math.max(-1.0, Math.min(1.0, position))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, branchPlanePosition: clamped },
        },
      }))
    },
    setTdseBranchColorA: (color) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, branchColorA: color },
        },
      }))
    },
    setTdseBranchColorB: (color) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, branchColorB: color },
        },
      }))
    },
  }
}
