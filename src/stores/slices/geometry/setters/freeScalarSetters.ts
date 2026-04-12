/**
 * Free Scalar Field setter factory.
 *
 * Extracts all `setFreeScalar*`, `resetFreeScalarField`, and
 * `clearFreeScalarNeedsReset` methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/freeScalarSetters
 */

import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { useGeometryStore } from '@/stores/geometryStore'

import type { SchroedingerSliceActions } from '../types'
import {
  createFreeScalarCosmologySetters,
  reconcileCosmologyInvariants,
} from './freeScalarCosmologySetters'
import { createFreeScalarPreheatingSetters } from './freeScalarPreheatingSetters'
import {
  clampDtWithCfl,
  defaultGridPerDim,
  MAX_TOTAL_SITES,
  nestedClampedSetter,
  nestedIntSetter,
  nestedValueSetter,
  type SetterContext,
} from './sliceSetterUtils'

type FreeScalarActions = Pick<
  SchroedingerSliceActions,
  | 'setFreeScalarLatticeDim'
  | 'setFreeScalarGridSize'
  | 'setFreeScalarSpacing'
  | 'setFreeScalarMass'
  | 'setFreeScalarDt'
  | 'setFreeScalarStepsPerFrame'
  | 'setFreeScalarInitialCondition'
  | 'setFreeScalarFieldView'
  | 'setFreeScalarPacketCenter'
  | 'setFreeScalarPacketWidth'
  | 'setFreeScalarPacketAmplitude'
  | 'setFreeScalarModeK'
  | 'setFreeScalarAutoScale'
  | 'setFreeScalarVacuumSeed'
  | 'setFreeScalarSlicePosition'
  | 'resetFreeScalarField'
  | 'clearFreeScalarNeedsReset'
  | 'setFreeScalarSelfInteractionEnabled'
  | 'setFreeScalarSelfInteractionLambda'
  | 'setFreeScalarSelfInteractionVev'
  | 'setFreeScalarAbsorberEnabled'
  | 'setFreeScalarAbsorberWidth'
  | 'setFreeScalarPmlTargetReflection'
  | 'setFreeScalarDiagnosticsEnabled'
  | 'setFreeScalarDiagnosticsInterval'
  | 'setFreeScalarKSpaceDisplayMode'
  | 'setFreeScalarKSpaceFftShift'
  | 'setFreeScalarKSpaceExposureMode'
  | 'setFreeScalarKSpaceLowPercentile'
  | 'setFreeScalarKSpaceHighPercentile'
  | 'setFreeScalarKSpaceGamma'
  | 'setFreeScalarKSpaceBroadeningEnabled'
  | 'setFreeScalarKSpaceBroadeningRadius'
  | 'setFreeScalarKSpaceBroadeningSigma'
  | 'setFreeScalarKSpaceRadialBinCount'
  | 'setFreeScalarCosmologyEnabled'
  | 'setFreeScalarCosmologyPreset'
  | 'setFreeScalarCosmologySteepness'
  | 'setFreeScalarCosmologyHubble'
  | 'setFreeScalarCosmologyEta0'
  | 'setFreeScalarCosmologyBianchiExponents'
  | 'setFreeScalarPreheatingEnabled'
  | 'setFreeScalarPreheatingAmplitude'
  | 'setFreeScalarPreheatingFrequency'
  | 'applyFreeScalarPreset'
>

/**
 * Resize free scalar arrays to match a new latticeDim, preserving existing values
 * where possible and filling new dimensions with defaults.
 */
export const resizeFreeScalarArrays = (
  prev: FreeScalarConfig,
  newDim: number
): Partial<FreeScalarConfig> => {
  const gridDefault = defaultGridPerDim(newDim)
  const gridSize = Array.from({ length: newDim }, () => gridDefault)
  const dim0Spacing = prev.spacing.length > 0 ? prev.spacing[0]! : 0.1
  const spacing = Array.from({ length: newDim }, (_, i) =>
    i < prev.spacing.length ? prev.spacing[i]! : dim0Spacing
  )
  const packetCenter = Array.from({ length: newDim }, (_, i) =>
    i < prev.packetCenter.length ? prev.packetCenter[i]! : 0
  )
  const modeK = Array.from({ length: newDim }, (_, i) =>
    i < prev.modeK.length ? prev.modeK[i]! : 0
  )
  const slicePositions = Array.from({ length: Math.max(0, newDim - 3) }, (_, i) =>
    i < prev.slicePositions.length ? prev.slicePositions[i]! : 0
  )
  return { latticeDim: newDim, gridSize, spacing, packetCenter, modeK, slicePositions }
}

/**
 * Creates all Free Scalar Field setter actions for the schroedingerSlice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createFreeScalarSetters(ctx: SetterContext): FreeScalarActions {
  const { setWithVersion, set, isFinite, warnNonFinite, hasOnlyFinite } = ctx
  const D = 'freeScalar' as const

  return {
    setFreeScalarLatticeDim: (dim) => {
      if (!isFinite(dim)) {
        warnNonFinite('freeScalar.latticeDim', dim)
        return
      }
      const clamped = Math.max(1, Math.min(11, Math.floor(dim)))
      setWithVersion((state) => {
        const prev = state.schroedinger.freeScalar
        const resized = resizeFreeScalarArrays(prev, clamped)
        const newSpacing = resized.spacing ?? prev.spacing
        const newDt = clampDtWithCfl(prev.dt, newSpacing, clamped, prev.mass)
        const staged = { ...prev, ...resized, dt: newDt, needsReset: true }
        const reconciled = reconcileCosmologyInvariants(staged)
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...staged, ...reconciled },
          },
        }
      })
    },
    setFreeScalarGridSize: (size) => {
      if (!hasOnlyFinite(size)) {
        warnNonFinite('freeScalar.gridSize', size)
        return
      }
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const { latticeDim, initialCondition } = fs
        const needsPow2 = initialCondition === 'vacuumNoise'
        const maxPerDim = defaultGridPerDim(latticeDim)
        const snap = (v: number, min: number, max: number) => {
          const clamped = Math.max(min, Math.min(max, Math.round(v)))
          if (!needsPow2) return clamped
          const log2 = Math.round(Math.log2(clamped))
          return Math.max(min, Math.min(max, 2 ** log2))
        }
        const clamped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < size.length ? size[i]! : 1
          return i < latticeDim ? snap(s, 2, maxPerDim) : 1
        })
        while (clamped.reduce((a, b) => a * b, 1) > MAX_TOTAL_SITES) {
          let maxIdx = 0
          for (let j = 1; j < clamped.length; j++) {
            if (clamped[j]! > clamped[maxIdx]!) maxIdx = j
          }
          if (clamped[maxIdx]! <= 2) break
          clamped[maxIdx] = needsPow2 ? clamped[maxIdx]! / 2 : Math.max(2, clamped[maxIdx]! - 1)
        }
        const staged = { ...fs, gridSize: clamped, needsReset: true }
        const reconciled = reconcileCosmologyInvariants(staged)
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...staged, ...reconciled },
          },
        }
      })
    },
    setFreeScalarSpacing: (spacing) => {
      if (!hasOnlyFinite(spacing)) {
        warnNonFinite('freeScalar.spacing', spacing)
        return
      }
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const clamped = Array.from({ length: fs.latticeDim }, (_, i) =>
          Math.max(0.01, Math.min(1.0, i < spacing.length ? spacing[i]! : 0.1))
        )
        const newDt = clampDtWithCfl(fs.dt, clamped, fs.latticeDim, fs.mass)
        const staged = { ...fs, spacing: clamped, dt: newDt, needsReset: true }
        const reconciled = reconcileCosmologyInvariants(staged)
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...staged, ...reconciled },
          },
        }
      })
    },
    setFreeScalarMass: (mass) => {
      if (!isFinite(mass)) {
        warnNonFinite('freeScalar.mass', mass)
        return
      }
      const clamped = Math.max(0.0, Math.min(10.0, mass))
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const newDt = clampDtWithCfl(fs.dt, fs.spacing, fs.latticeDim, clamped)
        const needsReset = fs.needsReset || fs.initialCondition === 'vacuumNoise'
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...fs, mass: clamped, dt: newDt, needsReset },
          },
        }
      })
    },
    setFreeScalarDt: (dt) => {
      if (!isFinite(dt)) {
        warnNonFinite('freeScalar.dt', dt)
        return
      }
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const clamped = clampDtWithCfl(dt, fs.spacing, fs.latticeDim, fs.mass)
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...fs, dt: clamped },
          },
        }
      })
    },
    setFreeScalarStepsPerFrame: nestedIntSetter(ctx, D, 'stepsPerFrame', 1, 16, 'floor'),
    setFreeScalarInitialCondition: (condition) => {
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        let gridSize = fs.gridSize

        if (condition === 'vacuumNoise') {
          const maxPerDim = defaultGridPerDim(fs.latticeDim)
          gridSize = gridSize.map((s) => {
            const clamped = Math.max(2, Math.min(maxPerDim, s))
            const log2 = Math.round(Math.log2(clamped))
            return Math.max(2, Math.min(maxPerDim, 2 ** log2))
          })
        }

        const staged = { ...fs, initialCondition: condition, gridSize, needsReset: true }
        const reconciled = reconcileCosmologyInvariants(staged)
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...staged, ...reconciled },
          },
        }
      })
    },
    setFreeScalarFieldView: nestedValueSetter(ctx, D, 'fieldView'),
    setFreeScalarPacketCenter: (center) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, packetCenter: center, needsReset: true },
        },
      }))
    },
    setFreeScalarPacketWidth: (width) => {
      if (!isFinite(width)) {
        warnNonFinite('freeScalar.packetWidth', width)
        return
      }
      const clamped = Math.max(0.01, Math.min(5.0, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, packetWidth: clamped, needsReset: true },
        },
      }))
    },
    setFreeScalarPacketAmplitude: (amplitude) => {
      if (!isFinite(amplitude)) {
        warnNonFinite('freeScalar.packetAmplitude', amplitude)
        return
      }
      const clamped = Math.max(0.01, Math.min(10.0, amplitude))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            packetAmplitude: clamped,
            needsReset: true,
          },
        },
      }))
    },
    setFreeScalarModeK: (k) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, modeK: k, needsReset: true },
        },
      }))
    },
    setFreeScalarAutoScale: nestedValueSetter(ctx, D, 'autoScale'),
    setFreeScalarVacuumSeed: (seed) => {
      if (!isFinite(seed)) {
        warnNonFinite('freeScalar.vacuumSeed', seed)
        return
      }
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            vacuumSeed: Math.round(seed),
            needsReset: true,
          },
        },
      }))
    },
    resetFreeScalarField: () => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, needsReset: true },
        },
      }))
    },
    setFreeScalarSelfInteractionEnabled: (enabled) => {
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        // Enabling self-interaction forces cosmology off (v1 mutex).
        const cosmology = enabled ? { ...fs.cosmology, enabled: false } : fs.cosmology
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              selfInteractionEnabled: enabled,
              cosmology,
              needsReset: true,
            },
          },
        }
      })
    },
    setFreeScalarSelfInteractionLambda: nestedClampedSetter(
      ctx,
      D,
      'selfInteractionLambda',
      0.01,
      10.0
    ),
    setFreeScalarSelfInteractionVev: nestedClampedSetter(ctx, D, 'selfInteractionVev', 0.1, 5.0),
    setFreeScalarAbsorberEnabled: nestedValueSetter(ctx, D, 'absorberEnabled'),
    setFreeScalarAbsorberWidth: nestedClampedSetter(ctx, D, 'absorberWidth', 0.05, 0.5),
    setFreeScalarPmlTargetReflection: nestedClampedSetter(
      ctx,
      D,
      'pmlTargetReflection',
      1e-12,
      0.999
    ),
    setFreeScalarSlicePosition: (dimIndex, value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.slicePositions', value)
        return
      }
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const slicePositions = [...fs.slicePositions]
        if (dimIndex >= 0 && dimIndex < slicePositions.length) {
          const halfExtent =
            (fs.gridSize[dimIndex + 3] ?? 1) * (fs.spacing[dimIndex + 3] ?? 0.1) * 0.5
          slicePositions[dimIndex] = Math.max(-halfExtent, Math.min(halfExtent, value))
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: { ...fs, slicePositions },
          },
        }
      })
    },
    clearFreeScalarNeedsReset: () => {
      set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, needsReset: false },
        },
      }))
    },
    setFreeScalarDiagnosticsEnabled: (enabled) => {
      set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, diagnosticsEnabled: enabled },
        },
      }))
    },
    setFreeScalarDiagnosticsInterval: (interval) => {
      const clamped = Math.max(1, Math.min(120, Math.round(interval)))
      set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, diagnosticsInterval: clamped },
        },
      }))
    },
    setFreeScalarKSpaceDisplayMode: (mode) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, displayMode: mode },
          },
        },
      }))
    },
    setFreeScalarKSpaceFftShift: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, fftShiftEnabled: enabled },
          },
        },
      }))
    },
    setFreeScalarKSpaceExposureMode: (mode) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, exposureMode: mode },
          },
        },
      }))
    },
    setFreeScalarKSpaceLowPercentile: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.lowPercentile', value)
        return
      }
      setWithVersion((state) => {
        const viz = state.schroedinger.freeScalar.kSpaceViz
        const clamped = Math.max(0, Math.min(viz.highPercentile - 0.5, value))
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...state.schroedinger.freeScalar,
              kSpaceViz: { ...viz, lowPercentile: clamped },
            },
          },
        }
      })
    },
    setFreeScalarKSpaceHighPercentile: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.highPercentile', value)
        return
      }
      setWithVersion((state) => {
        const viz = state.schroedinger.freeScalar.kSpaceViz
        const clamped = Math.max(viz.lowPercentile + 0.5, Math.min(100, value))
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...state.schroedinger.freeScalar,
              kSpaceViz: { ...viz, highPercentile: clamped },
            },
          },
        }
      })
    },
    setFreeScalarKSpaceGamma: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.gamma', value)
        return
      }
      const clamped = Math.max(0.1, Math.min(3.0, value))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, gamma: clamped },
          },
        },
      }))
    },
    setFreeScalarKSpaceBroadeningEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, broadeningEnabled: enabled },
          },
        },
      }))
    },
    setFreeScalarKSpaceBroadeningRadius: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.broadeningRadius', value)
        return
      }
      const clamped = Math.max(1, Math.min(5, Math.round(value)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, broadeningRadius: clamped },
          },
        },
      }))
    },
    setFreeScalarKSpaceBroadeningSigma: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.broadeningSigma', value)
        return
      }
      const clamped = Math.max(0.5, Math.min(3.0, value))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, broadeningSigma: clamped },
          },
        },
      }))
    },
    setFreeScalarKSpaceRadialBinCount: (value) => {
      if (!isFinite(value)) {
        warnNonFinite('freeScalar.kSpaceViz.radialBinCount', value)
        return
      }
      const clamped = Math.max(16, Math.min(128, Math.round(value)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          freeScalar: {
            ...state.schroedinger.freeScalar,
            kSpaceViz: { ...state.schroedinger.freeScalar.kSpaceViz, radialBinCount: clamped },
          },
        },
      }))
    },
    ...createFreeScalarPreheatingSetters(ctx),
    ...createFreeScalarCosmologySetters(ctx),
    applyFreeScalarPreset: (presetId) => {
      void import('@/lib/physics/freeScalar/presets').then(({ FREE_SCALAR_PRESETS }) => {
        const preset = FREE_SCALAR_PRESETS.find((p) => p.id === presetId)
        if (!preset) return
        setWithVersion((state) => {
          const globalDim = useGeometryStore.getState().dimension
          const base: FreeScalarConfig = {
            ...DEFAULT_FREE_SCALAR_CONFIG,
            ...preset.overrides,
            kSpaceViz: state.schroedinger.freeScalar.kSpaceViz,
            slicePositions: state.schroedinger.freeScalar.slicePositions,
            needsReset: true,
          }
          const resized = resizeFreeScalarArrays(base, globalDim)
          // The global dimension may fall outside the cosmology-supported
          // range [2, 6] (spacetimeDim ∈ [3, 7]). Even when it's in range,
          // the preset's eta0 may be below the safe threshold at the
          // resized lattice shape. Reconcile so presets either run cleanly
          // or soft-disable cosmology with a logger warning.
          const staged: FreeScalarConfig = {
            ...base,
            ...resized,
            needsReset: true,
          }
          const reconciled = reconcileCosmologyInvariants(staged)
          // Propagate absorber state to the parent SchroedingerConfig — the
          // AbsorptionSection reads `schroedinger.absorberEnabled`, not the
          // per-mode child field.
          const parentAbsorber =
            preset.overrides.absorberEnabled !== undefined
              ? {
                  absorberEnabled: preset.overrides.absorberEnabled,
                  absorberWidth: preset.overrides.absorberWidth ?? state.schroedinger.absorberWidth,
                }
              : {}
          return {
            schroedinger: {
              ...state.schroedinger,
              ...preset.renderingOverrides,
              ...parentAbsorber,
              freeScalar: { ...staged, ...reconciled },
            },
          }
        })
      })
    },
  }
}
