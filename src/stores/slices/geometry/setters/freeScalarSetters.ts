/**
 * Free Scalar Field setter factory.
 *
 * Extracts all `setFreeScalar*`, `resetFreeScalarField`, and
 * `resetFreeScalarField` methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/freeScalarSetters
 */

import {
  DEFAULT_FREE_SCALAR_CONFIG,
  sanitizeKSpaceVizConfig,
} from '@/lib/geometry/extended/freeScalar'
import type {
  FreeScalarConfig,
  FreeScalarFieldView,
  FreeScalarInitialCondition,
} from '@/lib/geometry/extended/types'
import { nearestPow2 } from '@/lib/math/ndArray'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import {
  canApplyPresetRequest,
  createLatestPresetRequestGuard,
  loadPresetModule,
  type SchroedingerPresetApplyOptions,
} from '@/stores/utils/dynamicPresetImport'

import {
  createFreeScalarCosmologySetters,
  type FreeScalarCosmologySetters,
  reconcileCosmologyInvariants,
} from './freeScalarCosmologySetters'
import {
  createFreeScalarKSpaceVizSetters,
  type FreeScalarKSpaceVizSetters,
} from './freeScalarKSpaceVizSetters'
import {
  createFreeScalarPreheatingSetters,
  type FreeScalarPreheatingSetters,
} from './freeScalarPreheatingSetters'
import {
  clampDtWithCfl,
  defaultGridPerDim,
  MAX_TOTAL_SITES,
  nestedClampedSetter,
  nestedIntSetter,
  nestedValueSetter,
  type SetterContext,
} from './sliceSetterUtils'

/** Actions exposed by the free-scalar field setter bundle. */
export interface FreeScalarSetters
  extends FreeScalarCosmologySetters, FreeScalarKSpaceVizSetters, FreeScalarPreheatingSetters {
  setFreeScalarLatticeDim: (dim: number) => void
  setFreeScalarGridSize: (size: number[]) => void
  setFreeScalarSpacing: (spacing: number[]) => void
  setFreeScalarMass: (mass: number) => void
  setFreeScalarDt: (dt: number) => void
  setFreeScalarStepsPerFrame: (steps: number) => void
  setFreeScalarInitialCondition: (condition: FreeScalarInitialCondition) => void
  setFreeScalarFieldView: (view: FreeScalarFieldView) => void
  setFreeScalarPacketCenter: (center: number[]) => void
  setFreeScalarPacketWidth: (width: number) => void
  setFreeScalarPacketAmplitude: (amplitude: number) => void
  setFreeScalarModeK: (k: number[]) => void
  setFreeScalarAutoScale: (autoScale: boolean) => void
  setFreeScalarVacuumSeed: (seed: number) => void
  setFreeScalarSlicePosition: (dimIndex: number, value: number) => void
  resetFreeScalarField: () => void
  // Self-Interaction
  setFreeScalarSelfInteractionEnabled: (enabled: boolean) => void
  setFreeScalarSelfInteractionLambda: (lambda: number) => void
  setFreeScalarSelfInteractionVev: (vev: number) => void
  // PML Absorber
  setFreeScalarAbsorberEnabled: (enabled: boolean) => void
  setFreeScalarAbsorberWidth: (width: number) => void
  setFreeScalarPmlTargetReflection: (r: number) => void
  // Diagnostics
  setFreeScalarDiagnosticsEnabled: (enabled: boolean) => void
  setFreeScalarDiagnosticsInterval: (interval: number) => void
  // Presets
  applyFreeScalarPreset: (
    presetId: string,
    options?: SchroedingerPresetApplyOptions
  ) => Promise<void>
}

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
export function createFreeScalarSetters(ctx: SetterContext): FreeScalarSetters {
  const { setWithVersion, set, isFinite, warnNonFinite, hasOnlyFinite } = ctx
  const D = 'freeScalar' as const
  const beginPresetRequest = createLatestPresetRequestGuard()

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
        const { latticeDim } = fs
        const maxPerDim = defaultGridPerDim(latticeDim)
        const clamped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < size.length ? size[i]! : 1
          return nearestPow2(s, 2, maxPerDim)
        })
        while (clamped.reduce((a, b) => a * b, 1) > MAX_TOTAL_SITES) {
          let maxIdx = 0
          for (let j = 1; j < clamped.length; j++) {
            if (clamped[j]! > clamped[maxIdx]!) maxIdx = j
          }
          if (clamped[maxIdx]! <= 2) break
          clamped[maxIdx] = clamped[maxIdx]! / 2
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
        const maxPerDim = defaultGridPerDim(fs.latticeDim)
        const gridSize = fs.gridSize.map((s) => nearestPow2(s, 2, maxPerDim))
        while (gridSize.reduce((a, b) => a * b, 1) > MAX_TOTAL_SITES) {
          let maxIdx = 0
          for (let i = 1; i < gridSize.length; i++) {
            if (gridSize[i]! > gridSize[maxIdx]!) maxIdx = i
          }
          if (gridSize[maxIdx]! <= 2) break
          gridSize[maxIdx] = gridSize[maxIdx]! / 2
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
    setFreeScalarAbsorberEnabled: (enabled: boolean) => {
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          absorberEnabled: enabled,
          [D]: { ...state.schroedinger[D], absorberEnabled: enabled },
        },
      }))
    },
    setFreeScalarAbsorberWidth: (value: number) => {
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
    ...createFreeScalarKSpaceVizSetters(ctx),
    ...createFreeScalarPreheatingSetters(ctx),
    ...createFreeScalarCosmologySetters(ctx),
    applyFreeScalarPreset: (presetId, options) => {
      const isLatestRequest = beginPresetRequest()
      return loadPresetModule(
        () => import('@/lib/physics/freeScalar/presets'),
        'freeScalarSetters',
        `free-scalar presets for '${presetId}'`,
        ({ FREE_SCALAR_PRESETS }) => {
          if (!canApplyPresetRequest(isLatestRequest, ctx.get().schroedinger.quantumMode, options))
            return
          const preset = FREE_SCALAR_PRESETS.find((p) => p.id === presetId)
          if (!preset) return
          setWithVersion((state) => {
            const globalDim = useGeometryStore.getState().dimension
            const base: FreeScalarConfig = {
              ...DEFAULT_FREE_SCALAR_CONFIG,
              ...preset.overrides,
              kSpaceViz: sanitizeKSpaceVizConfig(state.schroedinger.freeScalar.kSpaceViz),
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
                    absorberWidth:
                      preset.overrides.absorberWidth ?? state.schroedinger.absorberWidth,
                    pmlTargetReflection:
                      preset.overrides.pmlTargetReflection ??
                      state.schroedinger.pmlTargetReflection,
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
        }
      )
    },
  }
}
