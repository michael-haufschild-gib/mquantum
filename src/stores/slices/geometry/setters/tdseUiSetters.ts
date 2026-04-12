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

import {
  nestedClampedSetter,
  nestedIntSetter,
  nestedValueSetter,
  type SetterContext,
} from './sliceSetterUtils'

/**
 * Creates UI, diagnostic, absorber, and disorder setters for the TDSE slice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createTdseUiSetters(ctx: SetterContext) {
  const D = 'tdse' as const

  return {
    setTdseDisorderSeed: (seed: number) => {
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, disorderSeed: Math.floor(Math.max(0, seed)) },
        },
      }))
    },
    setTdseDisorderDistribution: (distribution: TdseDisorderDistribution) => {
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, disorderDistribution: distribution },
        },
      }))
    },
    setTdseAbsorberEnabled: (enabled: boolean) => {
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          absorberEnabled: enabled,
          [D]: { ...state.schroedinger[D], absorberEnabled: enabled },
        },
      }))
    },
    setTdseAbsorberWidth: (value: number) => {
      if (!ctx.isFinite(value)) {
        ctx.warnNonFinite(`${D}.absorberWidth`, value)
        return
      }
      const clamped = Math.max(0.05, Math.min(0.5, value))
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          absorberWidth: clamped,
          [D]: { ...state.schroedinger[D], absorberWidth: clamped },
        },
      }))
    },
    setTdsePmlTargetReflection: nestedClampedSetter(ctx, D, 'pmlTargetReflection', 1e-12, 0.999),
    setTdseFieldView: nestedValueSetter(ctx, D, 'fieldView') as (view: TdseFieldView) => void,
    setTdseAutoScale: nestedValueSetter(ctx, D, 'autoScale') as (autoScale: boolean) => void,
    setTdseShowPotential: nestedValueSetter(ctx, D, 'showPotential') as (
      showPotential: boolean
    ) => void,
    setTdseAutoLoop: nestedValueSetter(ctx, D, 'autoLoop') as (autoLoop: boolean) => void,
    setTdseDiagnosticsEnabled: nestedValueSetter(ctx, D, 'diagnosticsEnabled') as (
      enabled: boolean
    ) => void,
    setTdseDiagnosticsInterval: nestedIntSetter(ctx, D, 'diagnosticsInterval', 1, 60, 'floor'),
    setTdseObservablesEnabled: nestedValueSetter(ctx, D, 'observablesEnabled') as (
      enabled: boolean
    ) => void,
    setTdseImaginaryTimeEnabled: nestedValueSetter(ctx, D, 'imaginaryTimeEnabled') as (
      enabled: boolean
    ) => void,
    setTdseCustomPotentialExpression: nestedValueSetter(ctx, D, 'customPotentialExpression') as (
      expression: string
    ) => void,
  }
}
