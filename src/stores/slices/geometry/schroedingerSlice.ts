import {
  DEFAULT_SCHROEDINGER_CONFIG,
  type BecConfig,
  type DiracConfig,
  type FreeScalarConfig,
  type SchroedingerConfig,
  type TdseConfig,
  RAYMARCH_QUALITY_TO_SAMPLES,
  type RaymarchQuality,
  SCHROEDINGER_QUALITY_PRESETS,
  SchroedingerColorMode,
  SchroedingerPresetName,
  HydrogenNDPresetName,
} from '@/lib/geometry/extended/types'
import { SCHROEDINGER_PALETTE_DEFINITIONS } from '@/lib/geometry/extended/schroedinger/palettes'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import { getHydrogenNDPreset } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { StateCreator } from 'zustand'
import { useGeometryStore } from '@/stores/geometryStore'
import { ExtendedObjectSlice, SchroedingerSlice } from './types'
import type { SetterContext } from './setters/sliceSetterUtils'
import { clampDtWithCfl } from './setters/sliceSetterUtils'
import { createTdseSetters, resizeTdseArrays } from './setters/tdseSetters'
import { createFreeScalarSetters, resizeFreeScalarArrays } from './setters/freeScalarSetters'
import { createDiracSetters, resizeDiracArrays } from './setters/diracSetters'
import { createBecSetters, resizeBecArrays } from './setters/becSetters'
import { createOpenQuantumSetters } from './setters/openQuantumSetters'

export const createSchroedingerSlice: StateCreator<
  ExtendedObjectSlice,
  [],
  [],
  SchroedingerSlice
> = (set, get) => {
  /**
   * Wrapped setter that auto-increments schroedingerVersion when schroedinger state changes.
   * This avoids manually adding version increment to 80+ individual setters.
   * @param updater
   */
  const setWithVersion: typeof set = (updater) => {
    set((state) => {
      const update = typeof updater === 'function' ? updater(state) : updater
      // If updating schroedinger, also bump version
      if ('schroedinger' in update) {
        return { ...update, schroedingerVersion: state.schroedingerVersion + 1 }
      }
      return update
    })
  }

  /** Quantum modes that use GPU compute pipelines and require position representation */
  const COMPUTE_MODES = new Set(['freeScalarField', 'tdseDynamics', 'becDynamics', 'diracEquation'])
  /** Subset of compute modes that require dim >= 3 (free scalar field supports 1D+) */
  const COMPUTE_MODES_3D = new Set(['tdseDynamics', 'becDynamics', 'diracEquation'])

  // === Setter Factories ===
  // Reduce boilerplate for common setter patterns

  const isFiniteSchroedingerInput = (value: number): boolean => Number.isFinite(value)
  const hasOnlyFiniteNumbers = (values: number[]): boolean =>
    values.every((value) => Number.isFinite(value))

  const warnNonFiniteSchroedingerInput = (name: string, value: unknown): void => {
    if (import.meta.env.DEV) {
      console.warn(`[schroedingerSlice] Ignoring non-finite input for ${name}:`, value)
    }
  }

  /**
   * Factory for simple value setters (no validation)
   * @param key
   */
  const valueSetter =
    <K extends keyof typeof DEFAULT_SCHROEDINGER_CONFIG>(key: K) =>
    (value: (typeof DEFAULT_SCHROEDINGER_CONFIG)[K]) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, [key]: value },
      }))
    }

  /**
   * Factory for clamped numeric setters
   * @param key
   * @param min
   * @param max
   */
  const clampedSetter =
    <K extends keyof typeof DEFAULT_SCHROEDINGER_CONFIG>(key: K, min: number, max: number) =>
    (value: number) => {
      if (!isFiniteSchroedingerInput(value)) {
        if (import.meta.env.DEV) {
          console.warn(
            `[schroedingerSlice] Ignoring non-finite numeric update for ${String(key)}:`,
            value
          )
        }
        return
      }
      const clamped = Math.max(min, Math.min(max, value))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, [key]: clamped },
      }))
    }

  const normalizePlaneNormal = (normal: [number, number, number]): [number, number, number] => {
    const [x, y, z] = normal
    const length = Math.hypot(x, y, z)
    if (!Number.isFinite(length) || length < 1e-6) {
      return [0, 0, 1]
    }
    return [x / length, y / length, z / length]
  }

  const axisToNormal = (axis: 'x' | 'y' | 'z'): [number, number, number] => {
    if (axis === 'x') return [1, 0, 0]
    if (axis === 'y') return [0, 1, 0]
    return [0, 0, 1]
  }

  // Build the shared context for extracted setter factories
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
        if (import.meta.env.DEV) {
          console.warn('[schroedingerSlice] Ignoring non-finite scale:', scale)
        }
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
        if (import.meta.env.DEV) {
          console.warn(
            `setSchroedingerParameterValue: Invalid non-integer dimension index ${dimIndex}`
          )
        }
        return
      }
      if (!isFiniteSchroedingerInput(value)) {
        warnNonFiniteSchroedingerInput('parameterValues', value)
        return
      }
      const values = [...get().schroedinger.parameterValues]
      if (dimIndex < 0 || dimIndex >= values.length) {
        if (import.meta.env.DEV) {
          console.warn(
            `setSchroedingerParameterValue: Invalid dimension index ${dimIndex} (valid range: 0-${values.length - 1})`
          )
        }
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
        schroedinger: {
          ...state.schroedinger,
          presetName: name,
          ...updates,
        },
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

    // === Quantum Mode Selection ===
    setSchroedingerQuantumMode: (mode) => {
      if (COMPUTE_MODES_3D.has(mode) && useGeometryStore.getState().dimension < 3) {
        useGeometryStore.getState().setDimension(3)
      }
      setWithVersion((state) => {
        const updates: Partial<SchroedingerConfig> = { quantumMode: mode }
        if (mode === 'freeScalarField') {
          if (state.schroedinger.representation !== 'position') {
            updates.representation = 'position'
          }
          if (state.schroedinger.crossSectionEnabled) {
            updates.crossSectionEnabled = false
          }
          const dim = useGeometryStore.getState().dimension
          const prev = state.schroedinger.freeScalar
          if (prev.latticeDim !== dim) {
            const resized = resizeFreeScalarArrays(prev, dim)
            const newSpacing = resized.spacing ?? prev.spacing
            const newDt = clampDtWithCfl(prev.dt, newSpacing, dim, prev.mass)
            updates.freeScalar = { ...prev, ...resized, dt: newDt, needsReset: true }
          }
        }
        if (mode === 'tdseDynamics') {
          if (state.schroedinger.representation !== 'position') {
            updates.representation = 'position'
          }
          if (state.schroedinger.crossSectionEnabled) {
            updates.crossSectionEnabled = false
          }
          const dim = useGeometryStore.getState().dimension
          const prev = state.schroedinger.tdse
          if (prev.latticeDim !== dim) {
            const resized = resizeTdseArrays(prev, dim)
            const potentialType =
              dim < 2 && prev.potentialType === 'doubleSlit' ? 'barrier' : prev.potentialType
            updates.tdse = { ...prev, ...resized, potentialType, needsReset: true }
          }
        }
        if (mode === 'becDynamics') {
          if (state.schroedinger.representation !== 'position') {
            updates.representation = 'position'
          }
          if (state.schroedinger.crossSectionEnabled) {
            updates.crossSectionEnabled = false
          }
          let dim = useGeometryStore.getState().dimension
          if (dim < 3) {
            useGeometryStore.getState().setDimension(3)
            dim = 3
          }
          const prev = state.schroedinger.bec
          if (prev.latticeDim !== dim) {
            const resized = resizeBecArrays(prev, dim)
            updates.bec = { ...prev, ...resized, needsReset: true }
          }
        }
        if (mode === 'diracEquation') {
          if (state.schroedinger.representation !== 'position') {
            updates.representation = 'position'
          }
          if (state.schroedinger.crossSectionEnabled) {
            updates.crossSectionEnabled = false
          }
          const dim = useGeometryStore.getState().dimension
          const prev = state.schroedinger.dirac
          if (prev.latticeDim !== dim) {
            const resized = resizeDiracArrays(prev, dim)
            updates.dirac = { ...prev, ...resized, needsReset: true }
          }
        }
        return { schroedinger: { ...state.schroedinger, ...updates } }
      })
    },
    setSchroedingerRepresentation: (value: 'position' | 'momentum' | 'wigner') => {
      if (value !== 'position' && COMPUTE_MODES.has(get().schroedinger.quantumMode)) {
        return
      }
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, representation: value },
      }))
    },
    setSchroedingerMomentumDisplayUnits: valueSetter('momentumDisplayUnits'),
    setSchroedingerMomentumScale: clampedSetter('momentumScale', 0.1, 4.0),
    setSchroedingerMomentumHbar: clampedSetter('momentumHbar', 0.01, 10.0),

    setSchroedingerPrincipalQuantumNumber: (n: number) => {
      if (!isFiniteSchroedingerInput(n)) {
        warnNonFiniteSchroedingerInput('principalQuantumNumber', n)
        return
      }
      const clamped = Math.max(1, Math.min(7, Math.floor(n)))
      const currentL = get().schroedinger.azimuthalQuantumNumber
      const currentM = get().schroedinger.magneticQuantumNumber
      const newL = Math.min(currentL, clamped - 1)
      const newM = Math.max(-newL, Math.min(newL, currentM))

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          principalQuantumNumber: clamped,
          azimuthalQuantumNumber: newL,
          magneticQuantumNumber: newM,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerAzimuthalQuantumNumber: (l: number) => {
      if (!isFiniteSchroedingerInput(l)) {
        warnNonFiniteSchroedingerInput('azimuthalQuantumNumber', l)
        return
      }
      const currentN = get().schroedinger.principalQuantumNumber
      const currentM = get().schroedinger.magneticQuantumNumber
      const clamped = Math.max(0, Math.min(currentN - 1, Math.floor(l)))
      const newM = Math.max(-clamped, Math.min(clamped, currentM))

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          azimuthalQuantumNumber: clamped,
          magneticQuantumNumber: newM,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerMagneticQuantumNumber: (m: number) => {
      if (!isFiniteSchroedingerInput(m)) {
        warnNonFiniteSchroedingerInput('magneticQuantumNumber', m)
        return
      }
      const currentL = get().schroedinger.azimuthalQuantumNumber
      const clamped = Math.max(-currentL, Math.min(currentL, Math.floor(m)))

      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          magneticQuantumNumber: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerUseRealOrbitals: (useRealOrbitals) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          useRealOrbitals,
          hydrogenNDPreset: 'custom',
        },
      }))
    },
    setSchroedingerBohrRadiusScale: (bohrRadiusScale) => {
      if (!isFiniteSchroedingerInput(bohrRadiusScale)) {
        warnNonFiniteSchroedingerInput('bohrRadiusScale', bohrRadiusScale)
        return
      }
      const clamped = Math.max(0.5, Math.min(3.0, bohrRadiusScale))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bohrRadiusScale: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    // === Hydrogen ND Configuration ===
    setSchroedingerHydrogenNDPreset: (preset: HydrogenNDPresetName) => {
      if (preset === 'custom') {
        setWithVersion((state) => ({
          schroedinger: {
            ...state.schroedinger,
            hydrogenNDPreset: preset,
          },
        }))
        return
      }
      const presetData = getHydrogenNDPreset(preset)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          hydrogenNDPreset: preset,
          principalQuantumNumber: presetData.n,
          azimuthalQuantumNumber: presetData.l,
          magneticQuantumNumber: presetData.m,
          useRealOrbitals: presetData.useReal,
          bohrRadiusScale: presetData.bohrRadiusScale,
          extraDimQuantumNumbers: [...presetData.extraDimN],
          extraDimOmega: [...presetData.extraDimOmega],
        },
      }))
    },

    setSchroedingerExtraDimQuantumNumber: (dimIndex: number, n: number) => {
      if (!Number.isInteger(dimIndex) || dimIndex < 0 || dimIndex >= 8) return
      if (!isFiniteSchroedingerInput(n)) {
        warnNonFiniteSchroedingerInput('extraDimQuantumNumbers', n)
        return
      }
      const numbers = [...get().schroedinger.extraDimQuantumNumbers]
      numbers[dimIndex] = Math.max(0, Math.min(6, Math.floor(n)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          extraDimQuantumNumbers: numbers,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerExtraDimQuantumNumbers: (numbers: number[]) => {
      if (!hasOnlyFiniteNumbers(numbers)) {
        warnNonFiniteSchroedingerInput('extraDimQuantumNumbers', numbers)
        return
      }
      const clamped = numbers.slice(0, 8).map((n) => Math.max(0, Math.min(6, Math.floor(n))))
      while (clamped.length < 8) clamped.push(0)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          extraDimQuantumNumbers: clamped,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerExtraDimOmega: (dimIndex: number, omega: number) => {
      const omegas = [...get().schroedinger.extraDimOmega]
      if (dimIndex < 0 || dimIndex >= 8) return
      if (!isFiniteSchroedingerInput(omega)) {
        warnNonFiniteSchroedingerInput('extraDimOmega', omega)
        return
      }
      omegas[dimIndex] = Math.max(0.1, Math.min(2.0, omega))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimOmega: omegas },
      }))
    },

    setSchroedingerExtraDimOmegaAll: (omegas: number[]) => {
      if (!hasOnlyFiniteNumbers(omegas)) {
        warnNonFiniteSchroedingerInput('extraDimOmegaAll', omegas)
        return
      }
      const clamped = omegas.slice(0, 8).map((o) => Math.max(0.1, Math.min(2.0, o)))
      while (clamped.length < 8) clamped.push(1.0)
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimOmega: clamped, presetName: 'custom' },
      }))
    },

    setSchroedingerExtraDimFrequencySpread: (spread: number) => {
      if (!isFiniteSchroedingerInput(spread)) {
        warnNonFiniteSchroedingerInput('extraDimFrequencySpread', spread)
        return
      }
      const clamped = Math.max(0, Math.min(0.5, spread))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          extraDimFrequencySpread: clamped,
          presetName: 'custom',
        },
      }))
    },

    // === Volume Rendering Parameters ===
    setSchroedingerTimeScale: clampedSetter('timeScale', 0.1, 2.0),
    setSchroedingerFieldScale: clampedSetter('fieldScale', 0.5, 2.0),
    setSchroedingerDensityGain: clampedSetter('densityGain', 0.1, 5.0),
    setSchroedingerDensityContrast: clampedSetter('densityContrast', 1.0, 4.0),
    setSchroedingerPowderScale: clampedSetter('powderScale', 0.0, 2.0),
    setSchroedingerSampleCount: clampedSetter('sampleCount', 16, 128),
    setSchroedingerEmissionIntensity: clampedSetter('emissionIntensity', 0.0, 5.0),
    setSchroedingerEmissionThreshold: clampedSetter('emissionThreshold', 0.0, 1.0),
    setSchroedingerEmissionColorShift: clampedSetter('emissionColorShift', -1.0, 1.0),
    setSchroedingerScatteringAnisotropy: clampedSetter('scatteringAnisotropy', -0.9, 0.9),
    setSchroedingerRoughness: clampedSetter('roughness', 0.0, 1.0),
    setSchroedingerRaymarchQuality: (quality: RaymarchQuality) => {
      const sampleCount = RAYMARCH_QUALITY_TO_SAMPLES[quality]
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, raymarchQuality: quality, sampleCount },
      }))
    },

    // === PML Absorbing Boundary (shared) ===
    setSchroedingerAbsorberEnabled: valueSetter('absorberEnabled'),
    setSchroedingerAbsorberWidth: clampedSetter('absorberWidth', 0.05, 0.5),
    setSchroedingerPmlTargetReflection: (r: number) => {
      if (!isFiniteSchroedingerInput(r) || r <= 0 || r >= 1) return
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, pmlTargetReflection: r },
      }))
    },

    // === SSS (Subsurface Scattering) ===
    setSchroedingerSssEnabled: valueSetter('sssEnabled'),
    setSchroedingerSssIntensity: clampedSetter('sssIntensity', 0.0, 2.0),
    setSchroedingerSssColor: valueSetter('sssColor'),
    setSchroedingerSssThickness: clampedSetter('sssThickness', 0.1, 5.0),
    setSchroedingerSssJitter: clampedSetter('sssJitter', 0.0, 1.0),

    // === Nodal Surfaces ===
    setSchroedingerNodalEnabled: valueSetter('nodalEnabled'),
    setSchroedingerNodalColor: valueSetter('nodalColor'),
    setSchroedingerNodalStrength: clampedSetter('nodalStrength', 0.0, 2.0),
    setSchroedingerNodalDefinition: valueSetter('nodalDefinition'),
    setSchroedingerNodalTolerance: clampedSetter('nodalTolerance', 0.00001, 0.5),
    setSchroedingerNodalFamilyFilter: valueSetter('nodalFamilyFilter'),
    setSchroedingerNodalRenderMode: valueSetter('nodalRenderMode'),
    setSchroedingerNodalLobeColoringEnabled: valueSetter('nodalLobeColoringEnabled'),
    setSchroedingerNodalColorReal: valueSetter('nodalColorReal'),
    setSchroedingerNodalColorImag: valueSetter('nodalColorImag'),
    setSchroedingerNodalColorPositive: valueSetter('nodalColorPositive'),
    setSchroedingerNodalColorNegative: valueSetter('nodalColorNegative'),

    // === Visual Effects ===
    setSchroedingerUncertaintyBoundaryEnabled: valueSetter('uncertaintyBoundaryEnabled'),
    setSchroedingerUncertaintyBoundaryStrength: clampedSetter(
      'uncertaintyBoundaryStrength',
      0.0,
      1.0
    ),
    setSchroedingerUncertaintyConfidenceMass: clampedSetter('uncertaintyConfidenceMass', 0.5, 0.99),
    setSchroedingerUncertaintyBoundaryWidth: clampedSetter('uncertaintyBoundaryWidth', 0.05, 1.0),
    setSchroedingerPhaseMaterialityEnabled: valueSetter('phaseMaterialityEnabled'),
    setSchroedingerPhaseMaterialityStrength: clampedSetter('phaseMaterialityStrength', 0.0, 1.0),
    setSchroedingerInterferenceEnabled: valueSetter('interferenceEnabled'),
    setSchroedingerInterferenceAmp: clampedSetter('interferenceAmp', 0.0, 1.0),
    setSchroedingerInterferenceFreq: clampedSetter('interferenceFreq', 1.0, 50.0),
    setSchroedingerInterferenceSpeed: clampedSetter('interferenceSpeed', 0.0, 10.0),
    // Physical Probability Current (j-field)
    setSchroedingerProbabilityCurrentEnabled: valueSetter('probabilityCurrentEnabled'),
    setSchroedingerProbabilityCurrentStyle: valueSetter('probabilityCurrentStyle'),
    setSchroedingerProbabilityCurrentPlacement: valueSetter('probabilityCurrentPlacement'),
    setSchroedingerProbabilityCurrentColorMode: valueSetter('probabilityCurrentColorMode'),
    setSchroedingerProbabilityCurrentScale: clampedSetter('probabilityCurrentScale', 0.0, 5.0),
    setSchroedingerProbabilityCurrentSpeed: clampedSetter('probabilityCurrentSpeed', 0.0, 10.0),
    setSchroedingerProbabilityCurrentDensityThreshold: clampedSetter(
      'probabilityCurrentDensityThreshold',
      0.0,
      1.0
    ),
    setSchroedingerProbabilityCurrentMagnitudeThreshold: clampedSetter(
      'probabilityCurrentMagnitudeThreshold',
      0.0,
      10.0
    ),
    setSchroedingerProbabilityCurrentLineDensity: clampedSetter(
      'probabilityCurrentLineDensity',
      1.0,
      64.0
    ),
    setSchroedingerProbabilityCurrentStepSize: clampedSetter(
      'probabilityCurrentStepSize',
      0.005,
      0.2
    ),
    setSchroedingerProbabilityCurrentSteps: (steps: number) => {
      if (!isFiniteSchroedingerInput(steps)) {
        warnNonFiniteSchroedingerInput('probabilityCurrentSteps', steps)
        return
      }
      const clamped = Math.max(4, Math.min(64, Math.floor(steps)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, probabilityCurrentSteps: clamped },
      }))
    },
    setSchroedingerProbabilityCurrentOpacity: clampedSetter('probabilityCurrentOpacity', 0.0, 1.0),
    // Probability Current Flow
    setSchroedingerProbabilityFlowEnabled: valueSetter('probabilityFlowEnabled'),
    setSchroedingerProbabilityFlowSpeed: clampedSetter('probabilityFlowSpeed', 0.1, 5.0),
    setSchroedingerProbabilityFlowStrength: clampedSetter('probabilityFlowStrength', 0.0, 1.0),
    // Radial Probability Overlay (hydrogen)
    setSchroedingerRadialProbabilityEnabled: valueSetter('radialProbabilityEnabled'),
    setSchroedingerRadialProbabilityOpacity: clampedSetter('radialProbabilityOpacity', 0.0, 1.0),
    setSchroedingerRadialProbabilityColor: valueSetter('radialProbabilityColor'),
    setSchroedingerIsoEnabled: valueSetter('isoEnabled'),
    setSchroedingerIsoThreshold: clampedSetter('isoThreshold', -6, 0),

    // === 2D Cross-Section Slice ===
    setSchroedingerCrossSectionEnabled: valueSetter('crossSectionEnabled'),
    setSchroedingerCrossSectionCompositeMode: valueSetter('crossSectionCompositeMode'),
    setSchroedingerCrossSectionScalar: valueSetter('crossSectionScalar'),
    setSchroedingerCrossSectionPlaneMode: valueSetter('crossSectionPlaneMode'),
    setSchroedingerCrossSectionAxis: (axis) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          crossSectionAxis: axis,
          crossSectionPlaneMode: 'axisAligned',
          crossSectionPlaneNormal: axisToNormal(axis),
        },
      }))
    },
    setSchroedingerCrossSectionPlaneNormal: (normal) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          crossSectionPlaneNormal: normalizePlaneNormal(normal),
          crossSectionPlaneMode: 'free',
        },
      }))
    },
    setSchroedingerCrossSectionPlaneOffset: clampedSetter('crossSectionPlaneOffset', -1.0, 1.0),
    setSchroedingerCrossSectionOpacity: clampedSetter('crossSectionOpacity', 0.0, 1.0),
    setSchroedingerCrossSectionThickness: clampedSetter('crossSectionThickness', 0.0, 0.2),
    setSchroedingerCrossSectionPlaneColor: valueSetter('crossSectionPlaneColor'),
    setSchroedingerCrossSectionAutoWindow: valueSetter('crossSectionAutoWindow'),
    setSchroedingerCrossSectionWindowMin: (minValue) => {
      if (!isFiniteSchroedingerInput(minValue)) {
        warnNonFiniteSchroedingerInput('crossSectionWindowMin', minValue)
        return
      }
      setWithVersion((state) => {
        const clampedMin = Math.max(-10.0, Math.min(10.0, minValue))
        const clampedMax = Math.max(state.schroedinger.crossSectionWindowMax, clampedMin + 1e-4)
        return {
          schroedinger: {
            ...state.schroedinger,
            crossSectionWindowMin: clampedMin,
            crossSectionWindowMax: clampedMax,
          },
        }
      })
    },
    setSchroedingerCrossSectionWindowMax: (maxValue) => {
      if (!isFiniteSchroedingerInput(maxValue)) {
        warnNonFiniteSchroedingerInput('crossSectionWindowMax', maxValue)
        return
      }
      setWithVersion((state) => {
        const clampedMax = Math.max(-10.0, Math.min(10.0, maxValue))
        const clampedMin = Math.min(state.schroedinger.crossSectionWindowMin, clampedMax - 1e-4)
        return {
          schroedinger: {
            ...state.schroedinger,
            crossSectionWindowMin: clampedMin,
            crossSectionWindowMax: Math.max(clampedMax, clampedMin + 1e-4),
          },
        }
      })
    },

    // === Slice Animation (4D+ only) ===
    setSchroedingerSliceAnimationEnabled: valueSetter('sliceAnimationEnabled'),
    setSchroedingerSliceSpeed: clampedSetter('sliceSpeed', 0.01, 0.1),
    setSchroedingerSliceAmplitude: clampedSetter('sliceAmplitude', 0.1, 1.0),

    // === Phase Animation (Hydrogen ND only) ===
    setSchroedingerPhaseAnimationEnabled: valueSetter('phaseAnimationEnabled'),

    // === Wigner Phase-Space Visualization ===
    setSchroedingerWignerDimensionIndex: (index: number) => {
      if (!isFiniteSchroedingerInput(index)) {
        warnNonFiniteSchroedingerInput('wignerDimensionIndex', index)
        return
      }
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wignerDimensionIndex: Math.max(0, Math.min(Math.floor(index), 10)),
        },
      }))
    },
    setSchroedingerWignerAutoRange: valueSetter('wignerAutoRange'),
    setSchroedingerWignerXRange: clampedSetter('wignerXRange', 1.0, 30.0),
    setSchroedingerWignerPRange: clampedSetter('wignerPRange', 1.0, 30.0),
    setSchroedingerWignerCrossTermsEnabled: valueSetter('wignerCrossTermsEnabled'),
    setSchroedingerWignerQuadPoints: (points: number) => {
      if (!isFiniteSchroedingerInput(points)) {
        warnNonFiniteSchroedingerInput('wignerQuadPoints', points)
        return
      }
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wignerQuadPoints: Math.max(8, Math.min(Math.round(points), 64)),
        },
      }))
    },
    setSchroedingerWignerClassicalOverlay: valueSetter('wignerClassicalOverlay'),

    setSchroedingerWignerCacheResolution: (resolution: number) => {
      if (!isFiniteSchroedingerInput(resolution)) {
        warnNonFiniteSchroedingerInput('wignerCacheResolution', resolution)
        return
      }
      const clamped = Math.max(128, Math.min(1024, Math.round(resolution)))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, wignerCacheResolution: clamped },
      }))
    },

    // === Second Quantization Educational Layer ===
    setSchroedingerSqLayerEnabled: valueSetter('sqLayerEnabled'),
    setSchroedingerSqLayerMode: valueSetter('sqLayerMode'),
    setSchroedingerSqLayerSelectedModeIndex: clampedSetter('sqLayerSelectedModeIndex', 0, 10),
    setSchroedingerSqLayerFockQuantumNumber: clampedSetter('sqLayerFockQuantumNumber', 0, 10),
    setSchroedingerSqLayerShowOccupation: valueSetter('sqLayerShowOccupation'),
    setSchroedingerSqLayerShowUncertainty: valueSetter('sqLayerShowUncertainty'),
    setSchroedingerSqLayerCoherentAlphaRe: clampedSetter('sqLayerCoherentAlphaRe', -5, 5),
    setSchroedingerSqLayerCoherentAlphaIm: clampedSetter('sqLayerCoherentAlphaIm', -5, 5),
    setSchroedingerSqLayerSqueezeR: clampedSetter('sqLayerSqueezeR', 0, 3),
    setSchroedingerSqLayerSqueezeTheta: clampedSetter('sqLayerSqueezeTheta', 0, 2 * Math.PI),

    // === Extracted Domain Setters ===
    ...createFreeScalarSetters(ctx),
    ...createTdseSetters(ctx),
    ...createBecSetters(ctx),
    ...createDiracSetters(ctx),
    ...createOpenQuantumSetters(ctx),

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

      const hydrogenUpdate: Record<string, number> = {}
      if (dimension === 2) {
        const current = get().schroedinger
        if (current.quantumMode === 'hydrogenND') {
          const currentL = current.azimuthalQuantumNumber
          const currentM = current.magneticQuantumNumber
          if (currentM === 0 && currentL > 0) {
            hydrogenUpdate.magneticQuantumNumber = 1
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
        },
      }))
    },

    getSchroedingerConfig: () => {
      return { ...get().schroedinger }
    },
  }
}
