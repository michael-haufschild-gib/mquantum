/**
 * BEC (Gross-Pitaevskii) setter factory.
 *
 * Extracts all `setBec*`, `applyBecPreset`, `resetBecField`, and
 * `clearBecNeedsReset` methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/becSetters
 */

import {
  DEFAULT_BEC_CONFIG,
  type BecConfig,
} from '@/lib/geometry/extended/types'
import { thomasFermiMuND, thomasFermiRadius } from '@/lib/physics/bec/chemicalPotential'
import { useGeometryStore } from '@/stores/geometryStore'
import { useBecDiagnosticsStore } from '@/stores/becDiagnosticsStore'
import type { SchroedingerSliceActions } from '../types'
import { type SetterContext, computeCflLimit, clampDtWithCfl, defaultTdseGridPerDim, TDSE_MAX_TOTAL_SITES } from './sliceSetterUtils'

type BecActions = Pick<
  SchroedingerSliceActions,
  | 'setBecInteractionStrength'
  | 'setBecTrapOmega'
  | 'setBecTrapAnisotropy'
  | 'setBecInitialCondition'
  | 'setBecFieldView'
  | 'setBecVortexCharge'
  | 'setBecVortexLatticeCount'
  | 'setBecSolitonDepth'
  | 'setBecSolitonVelocity'
  | 'setBecAutoScale'
  | 'setBecAbsorberEnabled'
  | 'setBecAbsorberWidth'
  | 'setBecPmlTargetReflection'
  | 'setBecDiagnosticsEnabled'
  | 'setBecDiagnosticsInterval'
  | 'setBecDt'
  | 'setBecStepsPerFrame'
  | 'setBecMass'
  | 'setBecHbar'
  | 'setBecGridSize'
  | 'setBecSpacing'
  | 'setBecSlicePosition'
  | 'applyBecPreset'
  | 'resetBecField'
  | 'clearBecNeedsReset'
>

/**
 * Resize BEC arrays to match a new latticeDim, computing TF-aware spacing.
 */
export const resizeBecArrays = (prev: BecConfig, newDim: number): Partial<BecConfig> => {
  const gridDefault = defaultTdseGridPerDim(newDim)
  const gridSize = Array.from({ length: newDim }, () => gridDefault)

  const trapAnisotropy = Array.from({ length: newDim }, (_, i) =>
    i < prev.trapAnisotropy.length ? prev.trapAnisotropy[i]! : 1.0
  )

  const g = prev.interactionStrength ?? 500
  const omega = prev.trapOmega ?? 1.0
  const mass = prev.mass ?? 1.0
  const mu = g > 0 ? thomasFermiMuND(newDim, g, omega) : 0
  const COVERAGE = 1.3
  const spacing = Array.from({ length: newDim }, (_, i) => {
    const effectiveOmega = omega * (trapAnisotropy[i] ?? 1.0)
    const Rtf = mu > 0 ? thomasFermiRadius(mu, mass, effectiveOmega) : 2.0
    return Math.max(0.05, (2 * Rtf * COVERAGE) / gridDefault)
  })

  const slicePositions = Array.from({ length: Math.max(0, newDim - 3) }, (_, i) =>
    i < prev.slicePositions.length ? prev.slicePositions[i]! : 0
  )
  const newDt = clampDtWithCfl(prev.dt, spacing, newDim, mass)
  return { latticeDim: newDim, gridSize, spacing, trapAnisotropy, slicePositions, dt: newDt }
}

/**
 * Creates all BEC setter actions for the schroedingerSlice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createBecSetters(ctx: SetterContext): BecActions {
  const { setWithVersion, set, isFinite, warnNonFinite, hasOnlyFinite } = ctx

  return {
    setBecInteractionStrength: (g) => {
      if (!isFinite(g)) {
        warnNonFinite('bec.interactionStrength', g)
        return
      }
      const clamped = Math.max(-1000, Math.min(10000, g))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, interactionStrength: clamped },
        },
      }))
    },
    setBecTrapOmega: (omega) => {
      if (!isFinite(omega)) {
        warnNonFinite('bec.trapOmega', omega)
        return
      }
      const clamped = Math.max(0.01, Math.min(10.0, omega))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, trapOmega: clamped },
        },
      }))
    },
    setBecTrapAnisotropy: (dimIndex, ratio) => {
      if (!isFinite(ratio)) {
        warnNonFinite('bec.trapAnisotropy', ratio)
        return
      }
      const clamped = Math.max(0.1, Math.min(10.0, ratio))
      setWithVersion((state) => {
        const arr = [...state.schroedinger.bec.trapAnisotropy]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          arr[dimIndex] = clamped
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...state.schroedinger.bec, trapAnisotropy: arr },
          },
        }
      })
    },
    setBecInitialCondition: (condition) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, initialCondition: condition, needsReset: true },
        },
      }))
    },
    setBecFieldView: (view) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, fieldView: view },
        },
      }))
    },
    setBecVortexCharge: (charge) => {
      const clamped = Math.max(-4, Math.min(4, Math.round(charge)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, vortexCharge: clamped, needsReset: true },
        },
      }))
    },
    setBecVortexLatticeCount: (count) => {
      const clamped = Math.max(1, Math.min(16, Math.round(count)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, vortexLatticeCount: clamped, needsReset: true },
        },
      }))
    },
    setBecSolitonDepth: (depth) => {
      if (!isFinite(depth)) return
      const clamped = Math.max(0, Math.min(1, depth))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, solitonDepth: clamped, needsReset: true },
        },
      }))
    },
    setBecSolitonVelocity: (velocity) => {
      if (!isFinite(velocity)) return
      const clamped = Math.max(-1, Math.min(1, velocity))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, solitonVelocity: clamped, needsReset: true },
        },
      }))
    },
    setBecAutoScale: (autoScale) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, autoScale },
        },
      }))
    },
    setBecAbsorberEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, absorberEnabled: enabled },
        },
      }))
    },
    setBecAbsorberWidth: (width) => {
      if (!isFinite(width)) return
      const clamped = Math.max(0.05, Math.min(0.5, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, absorberWidth: clamped },
        },
      }))
    },
    setBecPmlTargetReflection: (r) => {
      if (!isFinite(r)) {
        warnNonFinite('bec.pmlTargetReflection', r)
        return
      }
      const clamped = Math.max(1e-12, Math.min(0.999, r))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, pmlTargetReflection: clamped },
        },
      }))
    },
    setBecDiagnosticsEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, diagnosticsEnabled: enabled },
        },
      }))
    },
    setBecDiagnosticsInterval: (interval) => {
      const clamped = Math.max(1, Math.min(60, Math.round(interval)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, diagnosticsInterval: clamped },
        },
      }))
    },
    setBecDt: (dt) => {
      if (!isFinite(dt)) {
        warnNonFinite('bec.dt', dt)
        return
      }
      setWithVersion((state) => {
        const { spacing, latticeDim, mass } = state.schroedinger.bec
        const cflLimit = computeCflLimit(spacing, latticeDim, mass)
        const maxDt = Math.min(0.05, cflLimit * 0.9)
        const clamped = Math.max(0.0001, Math.min(maxDt, dt))
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...state.schroedinger.bec, dt: clamped },
          },
        }
      })
    },
    setBecStepsPerFrame: (steps) => {
      const clamped = Math.max(1, Math.min(16, Math.round(steps)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, stepsPerFrame: clamped },
        },
      }))
    },
    setBecMass: (mass) => {
      if (!isFinite(mass)) return
      const clamped = Math.max(0.1, Math.min(10, mass))
      setWithVersion((state) => {
        const { spacing, latticeDim, dt } = state.schroedinger.bec
        const newDt = clampDtWithCfl(dt, spacing, latticeDim, clamped)
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...state.schroedinger.bec, mass: clamped, dt: newDt },
          },
        }
      })
    },
    setBecHbar: (hbar) => {
      if (!isFinite(hbar)) return
      const clamped = Math.max(0.1, Math.min(10, hbar))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, hbar: clamped },
        },
      }))
    },
    setBecGridSize: (size) => {
      if (!hasOnlyFinite(size)) {
        warnNonFinite('bec.gridSize', size)
        return
      }
      setWithVersion((state) => {
        const { latticeDim } = state.schroedinger.bec
        const gridDefault = defaultTdseGridPerDim(latticeDim)
        const minGrid = Math.max(2, gridDefault)
        const snapped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < size.length ? size[i]! : minGrid
          const val = Math.max(2, Math.min(128, Math.round(s)))
          const log2 = Math.round(Math.log2(val))
          return Math.max(2, Math.min(gridDefault, 2 ** log2))
        })
        while (snapped.reduce((a, b) => a * b, 1) > TDSE_MAX_TOTAL_SITES) {
          let maxIdx = 0
          for (let i = 1; i < snapped.length; i++) {
            if (snapped[i]! > snapped[maxIdx]!) maxIdx = i
          }
          if (snapped[maxIdx]! <= 2) break
          snapped[maxIdx] = snapped[maxIdx]! / 2
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...state.schroedinger.bec, gridSize: snapped, needsReset: true },
          },
        }
      })
    },
    setBecSpacing: (spacing) => {
      if (!hasOnlyFinite(spacing)) {
        warnNonFinite('bec.spacing', spacing)
        return
      }
      setWithVersion((state) => {
        const { latticeDim, mass, dt } = state.schroedinger.bec
        const clamped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < spacing.length ? spacing[i]! : 0.15
          return Math.max(0.01, Math.min(1.0, s))
        })
        const newDt = clampDtWithCfl(dt, clamped, latticeDim, mass)
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...state.schroedinger.bec, spacing: clamped, dt: newDt, needsReset: true },
          },
        }
      })
    },
    setBecSlicePosition: (dimIndex, value) => {
      if (!isFinite(value)) return
      setWithVersion((state) => {
        const arr = [...state.schroedinger.bec.slicePositions]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          arr[dimIndex] = value
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...state.schroedinger.bec, slicePositions: arr },
          },
        }
      })
    },
    applyBecPreset: (presetId) => {
      import('@/lib/physics/bec/presets').then(({ BEC_SCENARIO_PRESETS }) => {
        const preset = BEC_SCENARIO_PRESETS.find((p) => p.id === presetId)
        if (!preset) return
        setWithVersion((state) => {
          const globalDim = useGeometryStore.getState().dimension
          const {
            latticeDim: _presetDim,
            gridSize: _presetGrid,
            spacing: _presetSpacing,
            trapAnisotropy: _presetAniso,
            slicePositions: _presetSlice,
            ...safeOverrides
          } = preset.overrides
          const merged = { ...DEFAULT_BEC_CONFIG, ...safeOverrides, needsReset: true }
          const resized = resizeBecArrays(merged, globalDim)
          return {
            schroedinger: {
              ...state.schroedinger,
              bec: { ...merged, ...resized, needsReset: true },
            },
          }
        })
        useBecDiagnosticsStore.getState().reset()
      })
    },
    resetBecField: () => {
      useBecDiagnosticsStore.getState().reset()
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, needsReset: true },
        },
      }))
    },
    clearBecNeedsReset: () => {
      set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, needsReset: false },
        },
      }))
    },
  }
}
