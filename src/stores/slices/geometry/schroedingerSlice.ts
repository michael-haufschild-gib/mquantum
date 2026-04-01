import { StateCreator } from 'zustand'

import {
  DEFAULT_QUANTUM_WALK_CONFIG,
  resizeQuantumWalkArrays,
} from '@/lib/geometry/extended/quantumWalk'
import { SCHROEDINGER_PALETTE_DEFINITIONS } from '@/lib/geometry/extended/schroedinger/palettes'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import {
  type BecConfig,
  DEFAULT_SCHROEDINGER_CONFIG,
  type DiracConfig,
  type FreeScalarConfig,
  SCHROEDINGER_QUALITY_PRESETS,
  SchroedingerColorMode,
  type SchroedingerConfig,
  SchroedingerPresetName,
  type TdseConfig,
} from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { useGeometryStore } from '@/stores/geometryStore'

import { createBecSetters, resizeBecArrays } from './setters/becSetters'
import { createDiracSetters, resizeDiracArrays } from './setters/diracSetters'
import { createFreeScalarSetters, resizeFreeScalarArrays } from './setters/freeScalarSetters'
import { createOpenQuantumSetters } from './setters/openQuantumSetters'
import { createQuantumModeSetters } from './setters/quantumModeSetters'
import type { SetterContext } from './setters/sliceSetterUtils'
import { clampDtWithCfl } from './setters/sliceSetterUtils'
import { createTdseSetters, resizeTdseArrays } from './setters/tdseSetters'
import { createVisualEffectSetters } from './setters/visualEffectSetters'
import { ExtendedObjectSlice, SchroedingerSlice } from './types'

export const createSchroedingerSlice: StateCreator<
  ExtendedObjectSlice,
  [],
  [],
  SchroedingerSlice
> = (set, get) => {
  /**
   * Wrapped setter that auto-increments schroedingerVersion when schroedinger state changes.
   * This avoids manually adding version increment to 80+ individual setters.
   */
  const setWithVersion: typeof set = (updater) => {
    set((state) => {
      const update = typeof updater === 'function' ? updater(state) : updater
      if ('schroedinger' in update) {
        return { ...update, schroedingerVersion: state.schroedingerVersion + 1 }
      }
      return update
    })
  }

  // === Validation Helpers ===

  const isFiniteSchroedingerInput = (value: number): boolean => Number.isFinite(value)
  const hasOnlyFiniteNumbers = (values: number[]): boolean =>
    values.every((value) => Number.isFinite(value))

  const warnNonFiniteSchroedingerInput = (name: string, value: unknown): void => {
    logger.warn(`[schroedingerSlice] Ignoring non-finite input for ${name}:`, value)
  }

  // === Setter Factories ===

  /**
   * Factory for simple value setters (no validation).
   */
  const valueSetter =
    <K extends keyof typeof DEFAULT_SCHROEDINGER_CONFIG>(key: K) =>
    (value: (typeof DEFAULT_SCHROEDINGER_CONFIG)[K]) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, [key]: value },
      }))
    }

  /**
   * Factory for clamped numeric setters.
   */
  const clampedSetter =
    <K extends keyof typeof DEFAULT_SCHROEDINGER_CONFIG>(key: K, min: number, max: number) =>
    (value: number) => {
      if (!isFiniteSchroedingerInput(value)) {
        logger.warn(
          `[schroedingerSlice] Ignoring non-finite numeric update for ${String(key)}:`,
          value
        )
        return
      }
      const clamped = Math.max(min, Math.min(max, value))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, [key]: clamped },
      }))
    }

  // Build shared context for extracted setter modules
  const ctx: SetterContext = {
    setWithVersion,
    set,
    get,
    isFinite: isFiniteSchroedingerInput,
    hasOnlyFinite: hasOnlyFiniteNumbers,
    warnNonFinite: warnNonFiniteSchroedingerInput,
  }

  return {
    schroedinger: { ...DEFAULT_SCHROEDINGER_CONFIG },

    // === Geometry Settings ===
    setSchroedingerScale: (scale) => {
      if (!isFiniteSchroedingerInput(scale)) {
        logger.warn('[schroedingerSlice] Ignoring non-finite scale:', scale)
        return
      }
      const clampedScale = Math.max(0.1, Math.min(2.0, scale))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, scale: clampedScale },
      }))
    },

    // === Quality Settings ===
    setSchroedingerQualityPreset: (preset) => {
      const settings = SCHROEDINGER_QUALITY_PRESETS[preset]
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          qualityPreset: preset,
          resolution: settings.resolution,
        },
      }))
    },

    setSchroedingerResolution: (value) => {
      if (!isFiniteSchroedingerInput(value)) {
        warnNonFiniteSchroedingerInput('resolution', value)
        return
      }
      const validResolutions = [16, 24, 32, 48, 64, 96, 128]
      const closest = validResolutions.reduce((prev, curr) =>
        Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
      )
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, resolution: closest },
      }))
    },

    // === Visualization Axes ===
    setSchroedingerVisualizationAxes: (axes) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, visualizationAxes: axes },
      }))
    },

    setSchroedingerVisualizationAxis: (index, dimIndex) => {
      if (!isFiniteSchroedingerInput(dimIndex)) {
        warnNonFiniteSchroedingerInput('visualizationAxes', dimIndex)
        return
      }
      const clampedDimIndex = Math.max(0, Math.min(10, Math.floor(dimIndex)))
      const current = [...get().schroedinger.visualizationAxes] as [number, number, number]
      current[index] = clampedDimIndex
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, visualizationAxes: current },
      }))
    },

    // === Slice Parameters ===
    setSchroedingerParameterValue: (dimIndex, value) => {
      if (!Number.isInteger(dimIndex)) {
        logger.warn(
          `setSchroedingerParameterValue: Invalid non-integer dimension index ${dimIndex}`
        )
        return
      }
      if (!isFiniteSchroedingerInput(value)) {
        warnNonFiniteSchroedingerInput('parameterValues', value)
        return
      }
      const values = [...get().schroedinger.parameterValues]
      if (dimIndex < 0 || dimIndex >= values.length) {
        logger.warn(
          `setSchroedingerParameterValue: Invalid dimension index ${dimIndex} (valid range: 0-${values.length - 1})`
        )
        return
      }
      const clampedValue = Math.max(-2.0, Math.min(2.0, value))
      values[dimIndex] = clampedValue
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, parameterValues: values },
      }))
    },

    setSchroedingerParameterValues: (values) => {
      if (!hasOnlyFiniteNumbers(values)) {
        warnNonFiniteSchroedingerInput('parameterValues', values)
        return
      }
      const clampedValues = values.map((v) => Math.max(-2.0, Math.min(2.0, v)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, parameterValues: clampedValues },
      }))
    },

    resetSchroedingerParameters: () => {
      const len = get().schroedinger.parameterValues.length
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, parameterValues: new Array(len).fill(0) },
      }))
    },

    // === Navigation ===
    setSchroedingerCenter: (center) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, center },
      }))
    },

    setSchroedingerExtent: (extent) => {
      if (!isFiniteSchroedingerInput(extent)) {
        warnNonFiniteSchroedingerInput('extent', extent)
        return
      }
      const clampedExtent = Math.max(0.001, Math.min(10.0, extent))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extent: clampedExtent },
      }))
    },

    fitSchroedingerToView: () => {
      const centerLen = get().schroedinger.center.length
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          center: new Array(centerLen).fill(0),
          extent: 2.5,
        },
      }))
    },

    // === Color Settings ===
    setSchroedingerColorMode: valueSetter('colorMode'),

    setSchroedingerPalette: (palette) => {
      const definitions = SCHROEDINGER_PALETTE_DEFINITIONS[palette]
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          palette,
          cosineParams: definitions ? definitions : state.schroedinger.cosineParams,
        },
      }))
    },

    setSchroedingerCustomPalette: valueSetter('customPalette'),
    setSchroedingerInvertColors: valueSetter('invertColors'),

    // === Rendering Style ===
    setSchroedingerRenderStyle: valueSetter('renderStyle'),

    // === Quantum State Configuration ===
    setSchroedingerPresetName: (name: SchroedingerPresetName) => {
      let updates: Partial<SchroedingerConfig> = {}
      if (name !== 'custom') {
        const preset = SCHROEDINGER_NAMED_PRESETS[name]
        if (preset) {
          updates = {
            seed: preset.seed,
            termCount: preset.termCount,
            maxQuantumNumber: preset.maxN,
            frequencySpread: preset.frequencySpread,
          }
        }
      }
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, presetName: name, ...updates },
      }))
    },

    setSchroedingerSeed: (seed) => {
      if (!isFiniteSchroedingerInput(seed)) {
        warnNonFiniteSchroedingerInput('seed', seed)
        return
      }
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, seed: Math.floor(seed), presetName: 'custom' },
      }))
    },

    randomizeSchroedingerSeed: () => {
      const newSeed = Math.floor(Math.random() * 1000000)
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, seed: newSeed, presetName: 'custom' },
      }))
    },

    setSchroedingerTermCount: (count) => {
      if (!isFiniteSchroedingerInput(count)) {
        warnNonFiniteSchroedingerInput('termCount', count)
        return
      }
      const clampedCount = Math.max(1, Math.min(8, Math.floor(count)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, termCount: clampedCount, presetName: 'custom' },
      }))
    },

    setSchroedingerMaxQuantumNumber: (maxN) => {
      if (!isFiniteSchroedingerInput(maxN)) {
        warnNonFiniteSchroedingerInput('maxQuantumNumber', maxN)
        return
      }
      const clampedMaxN = Math.max(2, Math.min(6, Math.floor(maxN)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          maxQuantumNumber: clampedMaxN,
          presetName: 'custom',
        },
      }))
    },

    setSchroedingerFrequencySpread: (spread) => {
      if (!isFiniteSchroedingerInput(spread)) {
        warnNonFiniteSchroedingerInput('frequencySpread', spread)
        return
      }
      const clampedSpread = Math.max(0, Math.min(0.5, spread))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          frequencySpread: clampedSpread,
          presetName: 'custom',
        },
      }))
    },

    // === Momentum Display ===
    setSchroedingerMomentumDisplayUnits: valueSetter('momentumDisplayUnits'),
    setSchroedingerMomentumScale: clampedSetter('momentumScale', 0.1, 4.0),
    setSchroedingerMomentumHbar: clampedSetter('momentumHbar', 0.01, 10.0),

    // === Extracted Domain Setters ===
    ...createQuantumModeSetters(ctx, {
      resizeFreeScalarArrays,
      resizeTdseArrays,
      resizeBecArrays,
      resizeDiracArrays,
    }),
    ...createVisualEffectSetters(ctx, valueSetter, clampedSetter),
    ...createFreeScalarSetters(ctx),
    ...createTdseSetters(ctx),
    ...createBecSetters(ctx),
    ...createDiracSetters(ctx),
    ...createOpenQuantumSetters(ctx),

    // === Quantum Walk ===
    applyQuantumWalkPreset: (presetId) => {
      void import('@/lib/physics/quantumWalk/presets').then(({ QUANTUM_WALK_PRESETS }) => {
        const preset = QUANTUM_WALK_PRESETS.find((p) => p.id === presetId)
        if (!preset) return
        setWithVersion((state) => {
          const globalDim = useGeometryStore.getState().dimension
          const base = {
            ...DEFAULT_QUANTUM_WALK_CONFIG,
            ...preset.overrides,
            steps: 0,
            needsReset: true,
          }
          const resized = resizeQuantumWalkArrays(base, globalDim)
          return {
            schroedinger: {
              ...state.schroedinger,
              quantumWalk: { ...base, ...resized, needsReset: true },
            },
          }
        })
      })
    },
    resetQuantumWalk: () => {
      set((state) => {
        const qw = state.schroedinger.quantumWalk
        const initialPosition = qw.gridSize.map((s) => Math.floor(s / 2))
        return {
          schroedinger: {
            ...state.schroedinger,
            quantumWalk: { ...qw, steps: 0, initialPosition, needsReset: true },
          },
        }
      })
    },
    clearQuantumWalkNeedsReset: () => {
      set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumWalk: { ...state.schroedinger.quantumWalk, needsReset: false },
        },
      }))
    },
    setQwAutoScale: (autoScale) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumWalk: { ...state.schroedinger.quantumWalk, autoScale },
        },
      }))
    },
    setQwAbsorberEnabled: (enabled) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumWalk: { ...state.schroedinger.quantumWalk, absorberEnabled: enabled },
        },
      }))
    },
    setQwAbsorberWidth: (width) => {
      if (!isFinite(width)) return
      const clamped = Math.max(0.05, Math.min(0.5, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumWalk: { ...state.schroedinger.quantumWalk, absorberWidth: clamped },
        },
      }))
    },
    setQwPmlTargetReflection: (r) => {
      if (!isFinite(r)) return
      const clamped = Math.max(1e-12, Math.min(0.999, r))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumWalk: { ...state.schroedinger.quantumWalk, pmlTargetReflection: clamped },
        },
      }))
    },

    // === Config Operations ===
    setSchroedingerConfig: (config) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, ...config },
      }))
    },

    initializeSchroedingerForDimension: (dimension) => {
      const paramCount = Math.max(0, dimension - 3)
      const colorMode: SchroedingerColorMode = 'mixed'
      const extent = 2.0
      const center = new Array(dimension).fill(0)

      const baseDensityGain = dimension === 2 ? 1.0 : 2.0
      const dimensionBoost = dimension > 4 ? 1.0 + (dimension - 4) * 0.4 : 1.0
      const densityGain = Math.min(baseDensityGain * dimensionBoost, 5.0)

      const hydrogenUpdate: Record<string, unknown> = {}
      if (dimension === 2) {
        const current = get().schroedinger
        if (current.quantumMode === 'hydrogenND' || current.quantumMode === 'hydrogenNDCoupled') {
          // In 2D hydrogen, l is not independent — it equals |m|.
          // The shader uses abs(magneticM) as effective l, but keep the store consistent.
          const absM = Math.abs(current.magneticQuantumNumber)
          if (current.azimuthalQuantumNumber !== absM) {
            hydrogenUpdate.azimuthalQuantumNumber = absM
          }
          // Force position representation (momentum/Wigner not implemented for 2D hydrogen)
          if (current.representation !== 'position') {
            hydrogenUpdate.representation = 'position'
          }
        }
      }

      const currentState = get().schroedinger
      let freeScalarUpdate: Partial<FreeScalarConfig> | undefined
      if (currentState.quantumMode === 'freeScalarField') {
        const prev = currentState.freeScalar
        if (prev.latticeDim !== dimension) {
          const resized = resizeFreeScalarArrays(prev, dimension)
          const newSpacing = resized.spacing ?? prev.spacing
          const newDt = clampDtWithCfl(prev.dt, newSpacing, dimension, prev.mass)
          freeScalarUpdate = { ...resized, dt: newDt, needsReset: true }
        }
      }

      let tdseUpdate: Partial<TdseConfig> | undefined
      if (currentState.quantumMode === 'tdseDynamics') {
        const prev = currentState.tdse
        if (prev.latticeDim !== dimension) {
          const potentialType =
            dimension < 2 && prev.potentialType === 'doubleSlit' ? 'barrier' : undefined
          tdseUpdate = {
            ...resizeTdseArrays(prev, dimension),
            ...(potentialType ? { potentialType } : {}),
            needsReset: true,
          }
        }
      }

      let becUpdate: Partial<BecConfig> | undefined
      if (currentState.quantumMode === 'becDynamics') {
        const prev = currentState.bec
        if (prev.latticeDim !== dimension) {
          becUpdate = { ...resizeBecArrays(prev, dimension), needsReset: true }
        }
      }

      let diracUpdate: Partial<DiracConfig> | undefined
      if (currentState.quantumMode === 'diracEquation') {
        const prev = currentState.dirac
        if (prev.latticeDim !== dimension) {
          diracUpdate = { ...resizeDiracArrays(prev, dimension), needsReset: true }
        }
      }

      let quantumWalkUpdate:
        | Partial<import('@/lib/geometry/extended/quantumWalk').QuantumWalkConfig>
        | undefined
      if (currentState.quantumMode === 'quantumWalk') {
        const prev = currentState.quantumWalk
        if (prev.latticeDim !== dimension) {
          quantumWalkUpdate = resizeQuantumWalkArrays(prev, dimension)
        }
      }

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          parameterValues: new Array(paramCount).fill(0),
          center,
          visualizationAxes: [0, 1, 2],
          colorMode,
          extent,
          densityGain,
          sqLayerSelectedModeIndex: Math.min(
            state.schroedinger.sqLayerSelectedModeIndex,
            Math.max(0, dimension - 1)
          ),
          ...hydrogenUpdate,
          ...(freeScalarUpdate
            ? { freeScalar: { ...state.schroedinger.freeScalar, ...freeScalarUpdate } }
            : {}),
          ...(tdseUpdate ? { tdse: { ...state.schroedinger.tdse, ...tdseUpdate } } : {}),
          ...(becUpdate ? { bec: { ...state.schroedinger.bec, ...becUpdate } } : {}),
          ...(diracUpdate ? { dirac: { ...state.schroedinger.dirac, ...diracUpdate } } : {}),
          ...(quantumWalkUpdate
            ? { quantumWalk: { ...state.schroedinger.quantumWalk, ...quantumWalkUpdate } }
            : {}),
        },
      }))
    },

    getSchroedingerConfig: () => {
      return { ...get().schroedinger }
    },
  }
}
