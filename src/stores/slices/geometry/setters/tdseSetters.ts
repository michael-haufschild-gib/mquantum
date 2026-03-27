/**
 * TDSE (Time-Dependent Schroedinger Equation) setter factory.
 *
 * Extracts all `setTdse*`, `applyTdsePreset`, `resetTdseField`, and
 * `clearTdseNeedsReset` methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/tdseSetters
 */

import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/types'
import { useGeometryStore } from '@/stores/geometryStore'

import type { SchroedingerSliceActions } from '../types'
import {
  clampDtWithCfl,
  defaultTdseGridPerDim,
  type SetterContext,
  TDSE_MAX_TOTAL_SITES,
} from './sliceSetterUtils'
import { createTdsePotentialSetters } from './tdsePotentialSetters'

type TdseActions = Pick<
  SchroedingerSliceActions,
  | 'setTdseLatticeDim'
  | 'setTdseGridSize'
  | 'setTdseSpacing'
  | 'setTdseMass'
  | 'setTdseHbar'
  | 'setTdseDt'
  | 'setTdseStepsPerFrame'
  | 'setTdseInitialCondition'
  | 'setTdsePacketCenter'
  | 'setTdsePacketWidth'
  | 'setTdsePacketAmplitude'
  | 'setTdsePacketMomentum'
  | 'setTdsePotentialType'
  | 'setTdseBarrierHeight'
  | 'setTdseBarrierWidth'
  | 'setTdseBarrierCenter'
  | 'setTdseWellDepth'
  | 'setTdseWellWidth'
  | 'setTdseHarmonicOmega'
  | 'setTdseStepHeight'
  | 'setTdseSlitSeparation'
  | 'setTdseSlitWidth'
  | 'setTdseWallThickness'
  | 'setTdseWallHeight'
  | 'setTdseLatticeDepth'
  | 'setTdseLatticePeriod'
  | 'setTdseDoubleWellLambda'
  | 'setTdseDoubleWellSeparation'
  | 'setTdseDoubleWellAsymmetry'
  | 'setTdseRadialWellInner'
  | 'setTdseRadialWellOuter'
  | 'setTdseRadialWellDepth'
  | 'setTdseRadialWellTilt'
  | 'setTdseDriveEnabled'
  | 'setTdseDriveWaveform'
  | 'setTdseDriveFrequency'
  | 'setTdseDriveAmplitude'
  | 'setTdseAbsorberEnabled'
  | 'setTdseAbsorberWidth'
  | 'setTdsePmlTargetReflection'
  | 'setTdseFieldView'
  | 'setTdseAutoScale'
  | 'setTdseShowPotential'
  | 'setTdseAutoLoop'
  | 'setTdseDiagnosticsEnabled'
  | 'setTdseDiagnosticsInterval'
  | 'setTdseObservablesEnabled'
  | 'setTdseImaginaryTimeEnabled'
  | 'setTdseCustomPotentialExpression'
  | 'setTdseSlicePosition'
  | 'applyTdsePreset'
  | 'resetTdseField'
  | 'clearTdseNeedsReset'
>

/**
 * Resize TDSE arrays to match a new latticeDim, preserving existing values
 * where possible and filling new dimensions with defaults.
 */
export const resizeTdseArrays = (prev: TdseConfig, newDim: number): Partial<TdseConfig> => {
  const gridDefault = defaultTdseGridPerDim(newDim)
  const gridSize = Array.from({ length: newDim }, () => gridDefault)
  // Compute spacing for preserved dimensions first, then use dim-0 spacing as
  // default for new dimensions. The old hardcoded 0.1 created severe asymmetries
  // (up to 10:1 extent ratio) that made higher-dim TDSE look broken.
  const dim0Spacing =
    prev.gridSize.length > 0 && prev.spacing.length > 0
      ? Math.max(0.01, Math.min(1.0, (prev.gridSize[0]! * prev.spacing[0]!) / gridDefault))
      : 0.1
  const spacing = Array.from({ length: newDim }, (_, i) => {
    if (i < prev.spacing.length && i < prev.gridSize.length) {
      const oldExtent = prev.gridSize[i]! * prev.spacing[i]!
      return Math.max(0.01, Math.min(1.0, oldExtent / gridDefault))
    }
    return dim0Spacing
  })
  const packetCenter = Array.from({ length: newDim }, (_, i) =>
    i < prev.packetCenter.length ? prev.packetCenter[i]! : 0
  )
  const packetMomentum = Array.from({ length: newDim }, (_, i) =>
    i < prev.packetMomentum.length ? prev.packetMomentum[i]! : 0
  )
  const slicePositions = Array.from({ length: Math.max(0, newDim - 3) }, (_, i) =>
    i < prev.slicePositions.length ? prev.slicePositions[i]! : 0
  )
  const minFeature0 = 2 * spacing[0]!
  const minFeature1 = newDim >= 2 ? 2 * spacing[1]! : minFeature0
  const wallThickness = Math.max(prev.wallThickness, minFeature0)
  const barrierWidth = Math.max(prev.barrierWidth, minFeature0)
  const slitWidth = Math.max(prev.slitWidth, minFeature1)
  const packetWidth = Math.max(prev.packetWidth, minFeature0)
  const slitSeparation = Math.max(prev.slitSeparation, slitWidth + minFeature1)

  const newDt = clampDtWithCfl(prev.dt, spacing, newDim, prev.mass)
  return {
    latticeDim: newDim,
    gridSize,
    spacing,
    packetCenter,
    packetMomentum,
    slicePositions,
    dt: newDt,
    wallThickness,
    barrierWidth,
    slitWidth,
    slitSeparation,
    packetWidth,
  }
}

/**
 * Creates all TDSE-related setter actions for the schroedingerSlice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createTdseSetters(ctx: SetterContext): TdseActions {
  const { setWithVersion, set, isFinite, warnNonFinite, hasOnlyFinite } = ctx

  return {
    setTdseLatticeDim: (dim) => {
      if (!isFinite(dim)) {
        warnNonFinite('tdse.latticeDim', dim)
        return
      }
      const clamped = Math.max(1, Math.min(11, Math.floor(dim)))
      setWithVersion((state) => {
        const prev = state.schroedinger.tdse
        const resized = resizeTdseArrays(prev, clamped)
        const potentialType =
          clamped < 2 && prev.potentialType === 'doubleSlit' ? 'barrier' : prev.potentialType
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...prev, ...resized, potentialType, needsReset: true },
          },
        }
      })
    },
    setTdseGridSize: (size) => {
      if (!hasOnlyFinite(size)) {
        warnNonFinite('tdse.gridSize', size)
        return
      }
      setWithVersion((state) => {
        const { latticeDim } = state.schroedinger.tdse
        const minGrid = Math.max(2, defaultTdseGridPerDim(latticeDim))
        const snapped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < size.length ? size[i]! : minGrid
          const val = Math.max(2, Math.min(128, Math.round(s)))
          const log2 = Math.round(Math.log2(val))
          return Math.max(2, Math.min(128, 2 ** log2))
        })
        const reduceToFit = (grid: number[]): number[] => {
          const result = [...grid]
          while (result.reduce((a, b) => a * b, 1) > TDSE_MAX_TOTAL_SITES) {
            let maxIdx = 0
            for (let i = 1; i < result.length; i++) {
              if (result[i]! > result[maxIdx]!) maxIdx = i
            }
            if (result[maxIdx]! <= 2) break
            result[maxIdx] = result[maxIdx]! / 2
          }
          return result
        }
        const clamped = reduceToFit(snapped)
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...state.schroedinger.tdse, gridSize: clamped, needsReset: true },
          },
        }
      })
    },
    setTdseSpacing: (spacing) => {
      if (!hasOnlyFinite(spacing)) {
        warnNonFinite('tdse.spacing', spacing)
        return
      }
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        const clamped = Array.from({ length: td.latticeDim }, (_, i) =>
          Math.max(0.01, Math.min(1.0, i < spacing.length ? spacing[i]! : 0.1))
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, spacing: clamped, needsReset: true },
          },
        }
      })
    },
    setTdseMass: (mass) => {
      if (!isFinite(mass)) {
        warnNonFinite('tdse.mass', mass)
        return
      }
      const clamped = Math.max(0.01, Math.min(100.0, mass))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, mass: clamped },
        },
      }))
    },
    setTdseHbar: (hbar) => {
      if (!isFinite(hbar)) {
        warnNonFinite('tdse.hbar', hbar)
        return
      }
      const clamped = Math.max(0.01, Math.min(10.0, hbar))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, hbar: clamped },
        },
      }))
    },
    setTdseDt: (dt) => {
      if (!isFinite(dt)) {
        warnNonFinite('tdse.dt', dt)
        return
      }
      const clamped = Math.max(0.0001, Math.min(0.05, dt))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, dt: clamped },
        },
      }))
    },
    setTdseStepsPerFrame: (steps) => {
      if (!isFinite(steps)) {
        warnNonFinite('tdse.stepsPerFrame', steps)
        return
      }
      const clamped = Math.max(1, Math.min(16, Math.floor(steps)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, stepsPerFrame: clamped },
        },
      }))
    },
    setTdseInitialCondition: (condition) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, initialCondition: condition, needsReset: true },
        },
      }))
    },
    setTdsePacketCenter: (center) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, packetCenter: center, needsReset: true },
        },
      }))
    },
    setTdsePacketWidth: (width) => {
      if (!isFinite(width)) {
        warnNonFinite('tdse.packetWidth', width)
        return
      }
      const clamped = Math.max(0.01, Math.min(5.0, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, packetWidth: clamped, needsReset: true },
        },
      }))
    },
    setTdsePacketAmplitude: (amplitude) => {
      if (!isFinite(amplitude)) {
        warnNonFinite('tdse.packetAmplitude', amplitude)
        return
      }
      const clamped = Math.max(0.01, Math.min(10.0, amplitude))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, packetAmplitude: clamped, needsReset: true },
        },
      }))
    },
    setTdsePacketMomentum: (momentum) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, packetMomentum: momentum, needsReset: true },
        },
      }))
    },
    setTdsePotentialType: (type) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, potentialType: type },
        },
      }))
    },
    // Potential and drive parameter setters (data-driven, extracted to tdsePotentialSetters.ts)
    ...(createTdsePotentialSetters(ctx) as unknown as Pick<
      TdseActions,
      | 'setTdseBarrierHeight'
      | 'setTdseBarrierWidth'
      | 'setTdseBarrierCenter'
      | 'setTdseWellDepth'
      | 'setTdseWellWidth'
      | 'setTdseHarmonicOmega'
      | 'setTdseStepHeight'
      | 'setTdseSlitSeparation'
      | 'setTdseSlitWidth'
      | 'setTdseWallThickness'
      | 'setTdseWallHeight'
      | 'setTdseLatticeDepth'
      | 'setTdseLatticePeriod'
      | 'setTdseDoubleWellLambda'
      | 'setTdseDoubleWellSeparation'
      | 'setTdseDoubleWellAsymmetry'
      | 'setTdseRadialWellInner'
      | 'setTdseRadialWellOuter'
      | 'setTdseRadialWellDepth'
      | 'setTdseRadialWellTilt'
      | 'setTdseDriveEnabled'
      | 'setTdseDriveWaveform'
      | 'setTdseDriveFrequency'
      | 'setTdseDriveAmplitude'
    >),
    setTdseAbsorberEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, absorberEnabled: enabled },
        },
      }))
    },
    setTdseAbsorberWidth: (width) => {
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
    setTdsePmlTargetReflection: (r) => {
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
    setTdseFieldView: (view) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, fieldView: view },
        },
      }))
    },
    setTdseAutoScale: (autoScale) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, autoScale },
        },
      }))
    },
    setTdseShowPotential: (showPotential) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, showPotential },
        },
      }))
    },
    setTdseAutoLoop: (autoLoop) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, autoLoop },
        },
      }))
    },
    setTdseDiagnosticsEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, diagnosticsEnabled: enabled },
        },
      }))
    },
    setTdseDiagnosticsInterval: (interval) => {
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
    setTdseObservablesEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, observablesEnabled: enabled },
        },
      }))
    },
    setTdseImaginaryTimeEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, imaginaryTimeEnabled: enabled },
        },
      }))
    },
    setTdseCustomPotentialExpression: (expression) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, customPotentialExpression: expression },
        },
      }))
    },
    setTdseSlicePosition: (dimIndex, value) => {
      if (!isFinite(value)) {
        warnNonFinite('tdse.slicePositions', value)
        return
      }
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        const slicePositions = [...td.slicePositions]
        if (dimIndex >= 0 && dimIndex < slicePositions.length) {
          const halfExtent =
            (td.gridSize[dimIndex + 3] ?? 1) * (td.spacing[dimIndex + 3] ?? 0.1) * 0.5
          slicePositions[dimIndex] = Math.max(-halfExtent, Math.min(halfExtent, value))
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, slicePositions },
          },
        }
      })
    },
    applyTdsePreset: (presetId) => {
      void import('@/lib/physics/tdse/presets').then(({ getTdsePreset }) => {
        const preset = getTdsePreset(presetId)
        if (!preset) return
        setWithVersion((state) => {
          const globalDim = useGeometryStore.getState().dimension
          const { latticeDim: _presetDim, ...safeOverrides } = preset.overrides
          const base = {
            ...DEFAULT_TDSE_CONFIG,
            ...safeOverrides,
            slicePositions: state.schroedinger.tdse.slicePositions,
            needsReset: true,
          }
          const resized = resizeTdseArrays(base, globalDim)
          const potentialType =
            globalDim < 2 && base.potentialType === 'doubleSlit'
              ? ('barrier' as const)
              : base.potentialType
          return {
            schroedinger: {
              ...state.schroedinger,
              tdse: { ...base, ...resized, potentialType, needsReset: true },
            },
          }
        })
      })
    },
    resetTdseField: () => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, needsReset: true },
        },
      }))
    },
    clearTdseNeedsReset: () => {
      set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, needsReset: false },
        },
      }))
    },
  }
}
