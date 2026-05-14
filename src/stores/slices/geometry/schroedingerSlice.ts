import { StateCreator } from 'zustand'

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import { sanitizeKSpaceVizConfig } from '@/lib/geometry/extended/freeScalar'
import {
  resizeQuantumWalkArrays,
  sanitizeQuantumWalkConfig,
} from '@/lib/geometry/extended/quantumWalk'
import { sanitizeHarmonicOscillatorScalars } from '@/lib/geometry/extended/schroedinger/configSanitization'
import { normalizeHydrogenNDPresetName } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { SCHROEDINGER_PALETTE_DEFINITIONS } from '@/lib/geometry/extended/schroedinger/palettes'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import { sanitizeTdseStochasticFields } from '@/lib/geometry/extended/tdse'
import {
  type BecConfig,
  createDefaultSchroedingerConfig,
  DEFAULT_SCHROEDINGER_CONFIG,
  type DiracConfig,
  FREE_SCALAR_MAX_TOTAL_SITES,
  type FreeScalarConfig,
  sanitizeHydrogenQuantumState,
  SCHROEDINGER_QUALITY_PRESETS,
  SchroedingerColorMode,
  type SchroedingerConfig,
  SchroedingerPresetName,
  type SchroedingerQualityPreset,
  type TdseConfig,
} from '@/lib/geometry/extended/types'
import { isHydrogenFamilyQuantumType } from '@/lib/geometry/registry'
import { logger } from '@/lib/logger'
import { sanitizePowerOfTwoGridSizes } from '@/lib/math/ndArray'
import { normalizeHydrogenCoupledAngularChain } from '@/lib/physics/hydrogenCoupled/presets'

import { createAntiDeSitterSetters } from './setters/antiDeSitterSetters'
import { resizeBecArrays } from './setters/becResize'
import { createBecSetters } from './setters/becSetters'
import { createDiracSetters, resizeDiracArrays } from './setters/diracSetters'
import { reconcileCosmologyInvariants } from './setters/freeScalarCosmologySetters'
import { createFreeScalarSetters, resizeFreeScalarArrays } from './setters/freeScalarSetters'
import { createOpenQuantumSetters } from './setters/openQuantumSetters'
import { createQuantumModeSetters } from './setters/quantumModeSetters'
import { createQuantumWalkSetters } from './setters/quantumWalkSetters'
import type { SetterContext } from './setters/sliceSetterUtils'
import {
  clampDtWithCfl,
  clearSchrodingerModeNeedsReset,
  markSchrodingerModeNeedsReset,
  type ResettableConfigKey,
} from './setters/sliceSetterUtils'
import { createTdseSetters, resizeTdseArrays } from './setters/tdseSetters'
import { createVisualEffectSetters } from './setters/visualEffectSetters'
import { createWheelerDeWittSetters } from './setters/wheelerDeWittSetters'
import { ExtendedObjectSlice, SchroedingerSlice } from './types'

// ============================================================================
// Helpers for initializeSchroedingerForDimension
// ============================================================================

interface ModeResizeUpdates {
  freeScalar?: Partial<FreeScalarConfig>
  tdse?: Partial<TdseConfig>
  bec?: Partial<BecConfig>
  dirac?: Partial<DiracConfig>
  quantumWalk?: Partial<import('@/lib/geometry/extended/quantumWalk').QuantumWalkConfig>
}

/** Derive hydrogen-specific adjustments when switching to 2D. */
function buildHydrogenDimUpdate(
  dimension: number,
  current: SchroedingerConfig
): Record<string, unknown> {
  if (dimension !== 2) return {}
  if (!isHydrogenFamilyQuantumType(current.quantumMode)) return {}

  const update: Record<string, unknown> = {}
  // In 2D hydrogen, l is not independent — it equals |m|.
  // The shader uses abs(magneticM) as effective l, but keep the store consistent.
  const absM = Math.abs(current.magneticQuantumNumber)
  if (current.azimuthalQuantumNumber !== absM) {
    update.azimuthalQuantumNumber = absM
  }
  // Force position representation (momentum/Wigner not implemented for 2D hydrogen)
  if (current.representation !== 'position') {
    update.representation = 'position'
  }
  return update
}

function resizeFreeScalarForDim(
  prev: SchroedingerConfig['freeScalar'],
  dimension: number
): Partial<FreeScalarConfig> | undefined {
  if (prev.latticeDim === dimension) return undefined
  const resized = resizeFreeScalarArrays(prev, dimension)
  const newSpacing = resized.spacing ?? prev.spacing
  const newDt = clampDtWithCfl(prev.dt, newSpacing, dimension, prev.mass)
  // Stage the post-resize config so the cosmology invariant check sees the
  // new latticeDim / gridSize / spacing. Without this, dimension changes via
  // the global dimension slider (syncActiveComputeModeLatticeDim) or the
  // React initialization hook (initializeSchroedingerForDimension) bypass
  // the reconcile, leaving cosmology enabled at unsupported spacetime dims
  // or with an eta0 below the new safe threshold.
  const staged: FreeScalarConfig = { ...prev, ...resized, dt: newDt, needsReset: true }
  const reconciled = reconcileCosmologyInvariants(staged)
  return { ...resized, dt: newDt, needsReset: true, ...reconciled }
}

function resizeTdseForDim(
  prev: SchroedingerConfig['tdse'],
  dimension: number
): Partial<TdseConfig> | undefined {
  if (prev.latticeDim === dimension) return undefined
  const potentialType = dimension < 2 && prev.potentialType === 'doubleSlit' ? 'barrier' : undefined
  return {
    ...resizeTdseArrays(prev, dimension),
    ...(potentialType ? { potentialType } : {}),
    needsReset: true,
  }
}

function resizeSimpleModeForDim<T extends { latticeDim: number }>(
  prev: T,
  dimension: number,
  resizeFn: (p: T, d: number) => Partial<T>,
  needsReset = true
): Partial<T> | undefined {
  if (prev.latticeDim === dimension) return undefined
  return { ...resizeFn(prev, dimension), ...(needsReset ? { needsReset: true } : {}) } as Partial<T>
}

/** Mode-to-resize-key dispatcher — avoids a long if/else chain. */
const MODE_RESIZE_MAP: Record<
  string,
  ((state: SchroedingerConfig, dim: number) => ModeResizeUpdates) | undefined
> = {
  freeScalarField: (state, dim) => {
    const update = resizeFreeScalarForDim(state.freeScalar, dim)
    return update ? { freeScalar: update } : {}
  },
  tdseDynamics: (state, dim) => {
    const update = resizeTdseForDim(state.tdse, dim)
    return update ? { tdse: update } : {}
  },
  becDynamics: (state, dim) => {
    const update = resizeSimpleModeForDim(state.bec, dim, resizeBecArrays)
    return update ? { bec: update } : {}
  },
  diracEquation: (state, dim) => {
    const update = resizeSimpleModeForDim(state.dirac, dim, resizeDiracArrays)
    return update ? { dirac: update } : {}
  },
  quantumWalk: (state, dim) => {
    const update = resizeSimpleModeForDim(state.quantumWalk, dim, resizeQuantumWalkArrays, false)
    return update ? { quantumWalk: update } : {}
  },
}

function isSchroedingerQualityPreset(value: unknown): value is SchroedingerQualityPreset {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(SCHROEDINGER_QUALITY_PRESETS, value)
  )
}

/** Clamp finite public dimension input to the supported Schroedinger range. */
function clampSchroedingerDimensionInput(dimension: number): number | null {
  if (!Number.isFinite(dimension)) return null
  return Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, Math.floor(dimension)))
}

/** Compute resize updates for the active compute mode (only when latticeDim changed). */
function buildModeResizeUpdates(
  currentState: SchroedingerConfig,
  dimension: number
): ModeResizeUpdates {
  const handler = MODE_RESIZE_MAP[currentState.quantumMode]
  return handler ? handler(currentState, dimension) : {}
}

/** Spread mode resize updates onto the schroedinger state, merging nested configs. */
function applyModeResizeUpdates(
  schroedinger: SchroedingerConfig,
  updates: ModeResizeUpdates
): Partial<SchroedingerConfig> {
  const result: Partial<SchroedingerConfig> = {}
  if (updates.freeScalar) {
    result.freeScalar = { ...schroedinger.freeScalar, ...updates.freeScalar }
  }
  if (updates.tdse) {
    result.tdse = { ...schroedinger.tdse, ...updates.tdse }
  }
  if (updates.bec) {
    result.bec = { ...schroedinger.bec, ...updates.bec }
  }
  if (updates.dirac) {
    result.dirac = { ...schroedinger.dirac, ...updates.dirac }
  }
  if (updates.quantumWalk) {
    result.quantumWalk = { ...schroedinger.quantumWalk, ...updates.quantumWalk }
  }
  return result
}

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
  const hasOnlyFiniteNumbers = (values: number[]): boolean => {
    if (!Array.isArray(values)) return false
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(values[i])) return false
    }
    return true
  }

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
    schroedinger: createDefaultSchroedingerConfig(),

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
      if (!isSchroedingerQualityPreset(preset)) {
        logger.warn('[schroedingerSlice] Ignoring invalid qualityPreset:', preset)
        return
      }
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
    ...createWheelerDeWittSetters(ctx),
    ...createAntiDeSitterSetters(ctx),

    // === Quantum Walk ===
    ...createQuantumWalkSetters(ctx),

    // === Generic Compute Reset ===
    clearComputeNeedsReset: (configKey: string) => {
      if (configKey === 'pauliSpinor') {
        set((state) => ({
          pauliSpinor: { ...state.pauliSpinor, needsReset: false },
        }))
      } else {
        clearSchrodingerModeNeedsReset(set, configKey as ResettableConfigKey)
      }
    },
    markComputeNeedsReset: (configKey: string) => {
      if (configKey === 'pauliSpinor') {
        setWithVersion((state) => ({
          pauliSpinorVersion: state.pauliSpinorVersion + 1,
          pauliSpinor: { ...state.pauliSpinor, needsReset: true },
        }))
      } else {
        markSchrodingerModeNeedsReset(setWithVersion, configKey as ResettableConfigKey)
      }
    },

    // === Config Operations ===
    setSchroedingerConfig: (config) => {
      setWithVersion((state) => {
        const sanitizedConfig = sanitizeHarmonicOscillatorScalars(config, state.schroedinger)
        const hasHydrogenPreset = Object.prototype.hasOwnProperty.call(
          sanitizedConfig,
          'hydrogenNDPreset'
        )
        const schroedinger = { ...state.schroedinger, ...sanitizedConfig }
        Object.assign(schroedinger, sanitizeHydrogenQuantumState(schroedinger, state.schroedinger))
        if (hasHydrogenPreset) {
          schroedinger.hydrogenNDPreset = normalizeHydrogenNDPresetName(
            sanitizedConfig.hydrogenNDPreset,
            'custom'
          )
        }
        if (sanitizedConfig.freeScalar) {
          let mergedFreeScalar = {
            ...state.schroedinger.freeScalar,
            ...sanitizedConfig.freeScalar,
          }
          if (mergedFreeScalar.latticeDim !== state.schroedinger.freeScalar.latticeDim) {
            mergedFreeScalar = {
              ...mergedFreeScalar,
              ...resizeFreeScalarArrays(mergedFreeScalar, mergedFreeScalar.latticeDim),
            }
          }
          const sizedFreeScalar = sanitizePowerOfTwoGridSizes(mergedFreeScalar, {
            maxTotalSites: FREE_SCALAR_MAX_TOTAL_SITES,
          })
          const reconciled = reconcileCosmologyInvariants(sizedFreeScalar)
          schroedinger.freeScalar = {
            ...sizedFreeScalar,
            ...reconciled,
            kSpaceViz: sanitizeKSpaceVizConfig(sizedFreeScalar.kSpaceViz),
          }
        }
        if (sanitizedConfig.tdse) {
          const mergedTdse = { ...state.schroedinger.tdse, ...sanitizedConfig.tdse }
          schroedinger.tdse = sanitizeTdseStochasticFields(mergedTdse, state.schroedinger.tdse)
        }
        if (sanitizedConfig.quantumWalk) {
          const mergedQuantumWalk = {
            ...state.schroedinger.quantumWalk,
            ...sanitizedConfig.quantumWalk,
          }
          schroedinger.quantumWalk = sanitizeQuantumWalkConfig(mergedQuantumWalk)
        }
        if (schroedinger.quantumMode === 'hydrogenNDCoupled' || sanitizedConfig.angularChain) {
          schroedinger.angularChain = normalizeHydrogenCoupledAngularChain(
            schroedinger.angularChain,
            {
              l1: schroedinger.azimuthalQuantumNumber,
              magneticM: schroedinger.magneticQuantumNumber,
            }
          )
        }
        return { schroedinger }
      })
    },

    initializeSchroedingerForDimension: (dimensionInput) => {
      const dimension = clampSchroedingerDimensionInput(dimensionInput)
      if (dimension === null) {
        logger.warn('[schroedingerSlice] Ignoring non-finite initialize dimension:', dimensionInput)
        return
      }
      const paramCount = Math.max(0, dimension - 3)
      const colorMode: SchroedingerColorMode = 'mixed'
      const extent = 2.0
      const center = new Array(dimension).fill(0)

      const baseDensityGain = dimension === 2 ? 1.0 : 2.0
      const dimensionBoost = dimension > 4 ? 1.0 + (dimension - 4) * 0.4 : 1.0
      const densityGain = Math.min(baseDensityGain * dimensionBoost, 5.0)

      const currentState = get().schroedinger
      const hydrogenUpdate = buildHydrogenDimUpdate(dimension, currentState)
      const modeResizeUpdates = buildModeResizeUpdates(currentState, dimension)

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
          ...applyModeResizeUpdates(state.schroedinger, modeResizeUpdates),
        },
      }))
    },

    syncActiveComputeModeLatticeDim: (dimensionInput) => {
      const dimension = clampSchroedingerDimensionInput(dimensionInput)
      if (dimension === null) {
        logger.warn(
          '[schroedingerSlice] Ignoring non-finite compute lattice dimension:',
          dimensionInput
        )
        return
      }
      // Lightweight counterpart to initializeSchroedingerForDimension that only
      // resizes the active compute mode's lattice arrays. Does NOT touch
      // parameterValues / center / densityGain — those are handled by the React
      // hook (useObjectTypeInitialization). Called synchronously from
      // geometryStore.propagateDimensionToStores so compute-mode render paths
      // never see a stale latticeDim between setDimension and the next React tick.
      const currentState = get().schroedinger
      const modeResizeUpdates = buildModeResizeUpdates(currentState, dimension)
      // Nothing to update if the active mode is analytic or already at the target dim
      if (Object.keys(modeResizeUpdates).length === 0) return
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          ...applyModeResizeUpdates(state.schroedinger, modeResizeUpdates),
        },
      }))
    },

    getSchroedingerConfig: () => {
      return { ...get().schroedinger }
    },
  }
}
