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
    /**
     * Toggle the ER=EPR double-trace wormhole coupling. A transition of the
     * flag resets ψ: enabling the coupling mid-evolution introduces a
     * discontinuity that is hard to interpret visually, and disabling it
     * similarly leaves the wavefunction carrying hidden L↔R correlations
     * that no longer match the running Hamiltonian. An idempotent write
     * (same value on both sides) does NOT flip `needsReset` so UI round
     * trips don't kick the simulation.
     */
    setTdseWormholeEnabled: (enabled: boolean) => {
      ctx.setWithVersion((state) => {
        const prev = state.schroedinger.tdse
        const next = !!enabled
        if (prev.wormholeCouplingEnabled === next) return state
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...prev, wormholeCouplingEnabled: next, needsReset: true },
          },
        }
      })
    },
    /** Clamp coupling `g` to `[0, 5]`. Non-finite is rejected with a warning. */
    setTdseWormholeG: (g: number) => {
      if (!ctx.isFinite(g)) {
        ctx.warnNonFinite(`${D}.wormholeCouplingG`, g)
        return
      }
      const clamped = Math.max(0, Math.min(5, g))
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, wormholeCouplingG: clamped },
        },
      }))
    },
    /**
     * Set the mirror-plane axis index. Accepts only `0 | 1 | 2`; other
     * values are silently floored/clamped to the `{0,1,2}` range.
     */
    setTdseWormholeAxis: (axis: number) => {
      const raw = Number(axis)
      const clamped = (Math.max(0, Math.min(2, Math.floor(raw))) | 0) as 0 | 1 | 2
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, wormholeMirrorAxis: clamped },
        },
      }))
    },
    /**
     * Toggle the coherence HUD overlay. This is a pure UI flag — it does
     * not affect the wavefunction evolution, only whether the readback
     * path runs at the diagnostic cadence. Uses `set` rather than
     * `setWithVersion` so that toggling the panel does not participate in
     * any schroedingerVersion-keyed recompute flows.
     */
    setTdseWormholeHudEnabled: (enabled: boolean) => {
      ctx.set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, wormholeCoherenceHudEnabled: !!enabled },
        },
      }))
    },
  }
}
