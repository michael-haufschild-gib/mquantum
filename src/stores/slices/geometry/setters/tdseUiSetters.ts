/**
 * TDSE UI, diagnostic, absorber, and disorder setters.
 *
 * Simple setters for TDSE configuration flags and clamped numeric parameters
 * that don't require CFL/KK recomputation. Extracted from tdseSetters.ts to
 * keep file sizes under the max-lines limit.
 *
 * @module stores/slices/geometry/setters/tdseUiSetters
 */

import type { TdseDisorderDistribution, TdseFieldView } from '@/lib/geometry/extended/tdse'

import type { SetterContext } from './sliceSetterUtils'

/**
 * Creates UI, diagnostic, absorber, and disorder setters for the TDSE slice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createTdseUiSetters(ctx: SetterContext) {
  const { setWithVersion, isFinite, warnNonFinite } = ctx

  return {
    setTdseDisorderSeed: (seed: number) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, disorderSeed: Math.floor(Math.max(0, seed)) },
        },
      }))
    },
    setTdseDisorderDistribution: (distribution: TdseDisorderDistribution) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, disorderDistribution: distribution },
        },
      }))
    },
    setTdseAbsorberEnabled: (enabled: boolean) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, absorberEnabled: enabled },
        },
      }))
    },
    setTdseAbsorberWidth: (width: number) => {
      if (!isFinite(width)) {
        warnNonFinite('tdse.absorberWidth', width)
        return
      }
      const clamped = Math.max(0.05, Math.min(0.5, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, absorberWidth: clamped },
        },
      }))
    },
    setTdsePmlTargetReflection: (r: number) => {
      if (!isFinite(r)) {
        warnNonFinite('tdse.pmlTargetReflection', r)
        return
      }
      const clamped = Math.max(1e-12, Math.min(0.999, r))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, pmlTargetReflection: clamped },
        },
      }))
    },
    setTdseFieldView: (view: TdseFieldView) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, fieldView: view },
        },
      }))
    },
    setTdseAutoScale: (autoScale: boolean) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, autoScale },
        },
      }))
    },
    setTdseShowPotential: (showPotential: boolean) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, showPotential },
        },
      }))
    },
    setTdseAutoLoop: (autoLoop: boolean) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, autoLoop },
        },
      }))
    },
    setTdseDiagnosticsEnabled: (enabled: boolean) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, diagnosticsEnabled: enabled },
        },
      }))
    },
    setTdseDiagnosticsInterval: (interval: number) => {
      if (!isFinite(interval)) {
        warnNonFinite('tdse.diagnosticsInterval', interval)
        return
      }
      const clamped = Math.max(1, Math.min(60, Math.floor(interval)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, diagnosticsInterval: clamped },
        },
      }))
    },
    setTdseObservablesEnabled: (enabled: boolean) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, observablesEnabled: enabled },
        },
      }))
    },
    setTdseImaginaryTimeEnabled: (enabled: boolean) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, imaginaryTimeEnabled: enabled },
        },
      }))
    },
    setTdseCustomPotentialExpression: (expression: string) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, customPotentialExpression: expression },
        },
      }))
    },
  }
}
