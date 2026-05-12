/**
 * Quantum mode selection and quantum number setters.
 *
 * Extracted from schroedingerSlice to manage file size.
 * Follows the SetterContext pattern used by other domain setters.
 *
 * @module stores/slices/geometry/setters/quantumModeSetters
 */

import type { SchroedingerPresetName } from '@/lib/geometry/extended/common'
import { resizeQuantumWalkArrays } from '@/lib/geometry/extended/quantumWalk'
import {
  getHydrogenNDPreset,
  normalizeHydrogenNDPresetName,
} from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import {
  DEFAULT_SCHROEDINGER_CONFIG,
  type FreeScalarConfig,
  type HydrogenNDPresetName,
  type SchroedingerConfig,
} from '@/lib/geometry/extended/types'
import {
  getQuantumTypeEntry,
  isComputeQuantumType,
  isHydrogenFamilyQuantumType,
  QUANTUM_MODES_3D_ONLY,
} from '@/lib/geometry/registry'
import type { QuantumTypeKey } from '@/lib/geometry/registry/types'
import {
  HYDROGEN_COUPLED_PRESETS,
  normalizeHydrogenCoupledAngularChain,
} from '@/lib/physics/hydrogenCoupled/presets'
import { getFirstPresetId } from '@/lib/physics/presetDefaults'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { invalidateDynamicPresetApplies } from '@/stores/utils/dynamicPresetImport'

import type { ExtendedObjectSlice } from '../types'
import { reconcileCosmologyInvariants } from './freeScalarCosmologySetters'
import type { SetterContext } from './sliceSetterUtils'
import { clampDtWithCfl } from './sliceSetterUtils'

// ---------------------------------------------------------------------------
// Per-mode session cache for shared rendering settings
// ---------------------------------------------------------------------------

/**
 * Shared rendering settings that are saved/restored per quantum mode.
 *
 * These fields live on SchroedingerConfig but have mode-dependent optimal
 * values. Without per-mode caching they "bleed" across mode switches —
 * e.g. isosurface enabled in HO persists into TDSE where the density
 * range is different, causing nothing to render.
 */
interface ModeRenderingSnapshot {
  densityGain: number
  densityContrast: number
  autoScaleMaxGain: number
  isoEnabled: boolean
  isoThreshold: number
}

/**
 * Session-scoped cache: remembers rendering settings per quantum mode.
 * Lost on page refresh (intentional — session-only memory).
 */
const modeSettingsCache = new Map<string, ModeRenderingSnapshot>()

/**
 * Tracks which modes have been visited this session.
 * First visit to a mode auto-applies the first preset; subsequent visits
 * preserve the user's custom state.
 * Pre-seeded with 'harmonicOscillator' since that's the app's default mode.
 */
const visitedModes = new Set<string>(['harmonicOscillator'])

/** Reset session caches. Call in store reset and test teardown. */
export function resetModeSessionCaches(): void {
  modeSettingsCache.clear()
  visitedModes.clear()
  visitedModes.add('harmonicOscillator')
  invalidateDynamicPresetApplies()
}

/** Per-mode rendering defaults. Modes not listed fall back to DEFAULT_SCHROEDINGER_CONFIG values. */
const MODE_RENDERING_DEFAULTS: Partial<
  Record<SchroedingerConfig['quantumMode'], ModeRenderingSnapshot>
> = {
  freeScalarField: {
    densityGain: 5.0,
    densityContrast: 2.5,
    autoScaleMaxGain: 20,
    isoEnabled: false,
    isoThreshold: -3.0,
  },
  becDynamics: {
    densityGain: 0.1,
    densityContrast: 1.0,
    autoScaleMaxGain: 10,
    isoEnabled: false,
    isoThreshold: -3.0,
  },
}

function getDefaultRenderingSettings(
  mode: SchroedingerConfig['quantumMode']
): ModeRenderingSnapshot {
  return (
    MODE_RENDERING_DEFAULTS[mode] ?? {
      densityGain: DEFAULT_SCHROEDINGER_CONFIG.densityGain,
      densityContrast: DEFAULT_SCHROEDINGER_CONFIG.densityContrast,
      autoScaleMaxGain: DEFAULT_SCHROEDINGER_CONFIG.autoScaleMaxGain,
      isoEnabled: DEFAULT_SCHROEDINGER_CONFIG.isoEnabled,
      isoThreshold: DEFAULT_SCHROEDINGER_CONFIG.isoThreshold,
    }
  )
}

function snapshotRenderingSettings(state: SchroedingerConfig): ModeRenderingSnapshot {
  return {
    densityGain: state.densityGain,
    densityContrast: state.densityContrast,
    autoScaleMaxGain: state.autoScaleMaxGain,
    isoEnabled: state.isoEnabled,
    isoThreshold: state.isoThreshold,
  }
}

// ---------------------------------------------------------------------------

/** Resizer function signatures indexed by mode. */
interface ModeResizers {
  resizeFreeScalarArrays: (
    prev: SchroedingerConfig['freeScalar'],
    dim: number
  ) => Partial<SchroedingerConfig['freeScalar']>
  resizeTdseArrays: (
    prev: SchroedingerConfig['tdse'],
    dim: number
  ) => Partial<SchroedingerConfig['tdse']>
  resizeBecArrays: (
    prev: SchroedingerConfig['bec'],
    dim: number
  ) => Partial<SchroedingerConfig['bec']>
  resizeDiracArrays: (
    prev: SchroedingerConfig['dirac'],
    dim: number
  ) => Partial<SchroedingerConfig['dirac']>
}

/** Enforce dimension constraints when switching quantum mode. */
function enforceDimensionConstraints(mode: SchroedingerConfig['quantumMode']): void {
  const geo = useGeometryStore.getState()
  const currentDim = geo.dimension

  if (QUANTUM_MODES_3D_ONLY.has(mode) && currentDim < 3) {
    geo.setDimension(3)
  }
  const entry = getQuantumTypeEntry(mode as QuantumTypeKey)
  if (entry && currentDim > entry.dimensions.max) {
    geo.setDimension(entry.dimensions.recommended ?? entry.dimensions.max)
  }
}

/** Force position representation when the mode/dimension combo requires it. */
function buildRepresentationOverrides(
  mode: SchroedingerConfig['quantumMode'],
  dim: number,
  currentRepr: string,
  crossSectionEnabled: boolean
): Partial<SchroedingerConfig> {
  const overrides: Partial<SchroedingerConfig> = {}

  if (isComputeQuantumType(mode)) {
    if (currentRepr !== 'position') overrides.representation = 'position'
    if (crossSectionEnabled) overrides.crossSectionEnabled = false
    return overrides
  }

  const isHydrogen2D = dim === 2 && isHydrogenFamilyQuantumType(mode)
  if (isHydrogen2D && currentRepr !== 'position') {
    overrides.representation = 'position'
  }

  if (mode === 'hydrogenNDCoupled' && currentRepr === 'momentum') {
    overrides.representation = 'position'
  }

  return overrides
}

function resizeFreeScalar(
  state: SchroedingerConfig,
  dim: number,
  resizers: ModeResizers
): Partial<SchroedingerConfig> {
  const prev = state.freeScalar
  if (prev.latticeDim === dim) return {}
  const resized = resizers.resizeFreeScalarArrays(prev, dim)
  const newSpacing = resized.spacing ?? prev.spacing
  const newDt = clampDtWithCfl(prev.dt, newSpacing, dim, prev.mass)
  // Stage the full post-resize config so reconcileCosmologyInvariants sees
  // the new latticeDim / gridSize / spacing. Without this, re-entering FSF
  // after an external dimension change could leave cosmology enabled at an
  // out-of-range spacetimeDim or with eta0 below the new safe threshold —
  // the next vacuumNoise reset would then feed a stale state into
  // sampleAdiabaticVacuum(). Mirror schroedingerSlice.resizeFreeScalarForDim.
  const staged: FreeScalarConfig = { ...prev, ...resized, dt: newDt, needsReset: true }
  const reconciled = reconcileCosmologyInvariants(staged)
  return { freeScalar: { ...staged, ...reconciled } }
}

function resizeTdse(
  state: SchroedingerConfig,
  dim: number,
  resizers: ModeResizers
): Partial<SchroedingerConfig> {
  const prev = state.tdse
  if (prev.latticeDim === dim) return {}
  const resized = resizers.resizeTdseArrays(prev, dim)
  const potentialType =
    dim < 2 && prev.potentialType === 'doubleSlit' ? 'barrier' : prev.potentialType
  return { tdse: { ...prev, ...resized, potentialType, needsReset: true } }
}

function resizeBec(
  state: SchroedingerConfig,
  dim: number,
  resizers: ModeResizers
): Partial<SchroedingerConfig> {
  let becDim = dim
  if (becDim < 3) {
    useGeometryStore.getState().setDimension(3)
    becDim = 3
  }
  const prev = state.bec
  if (prev.latticeDim === becDim) return {}
  const resized = resizers.resizeBecArrays(prev, becDim)
  return { bec: { ...prev, ...resized, needsReset: true } }
}

function resizeDirac(
  state: SchroedingerConfig,
  dim: number,
  resizers: ModeResizers
): Partial<SchroedingerConfig> {
  const prev = state.dirac
  if (prev.latticeDim === dim) return {}
  const resized = resizers.resizeDiracArrays(prev, dim)
  return { dirac: { ...prev, ...resized, needsReset: true } }
}

function resizeQWalk(state: SchroedingerConfig, dim: number): Partial<SchroedingerConfig> {
  const prev = state.quantumWalk
  if (prev.latticeDim === dim) return {}
  return { quantumWalk: { ...prev, ...resizeQuantumWalkArrays(prev, dim) } }
}

/**
 * Resolve rendering settings for the target mode: cached values from a
 * previous visit in this session, or per-mode defaults on first visit.
 */
function resolveRenderingSettings(mode: SchroedingerConfig['quantumMode']): ModeRenderingSnapshot {
  return modeSettingsCache.get(mode) ?? getDefaultRenderingSettings(mode)
}

/** Resize compute-mode arrays when dimension changed during mode switch. */
function buildModeResizeUpdate(
  mode: SchroedingerConfig['quantumMode'],
  state: SchroedingerConfig,
  dim: number,
  resizers: ModeResizers
): Partial<SchroedingerConfig> {
  const handlers: Record<
    string,
    ((s: SchroedingerConfig, d: number, r: ModeResizers) => Partial<SchroedingerConfig>) | undefined
  > = {
    freeScalarField: resizeFreeScalar,
    tdseDynamics: resizeTdse,
    becDynamics: resizeBec,
    diracEquation: resizeDirac,
    quantumWalk: (s, d) => resizeQWalk(s, d),
  }
  const handler = handlers[mode]
  return handler ? handler(state, dim, resizers) : {}
}

/**
 * Dispatch the first dimension-compatible preset for the newly selected mode.
 *
 * Compute modes (TDSE, BEC, Dirac, FSF, QW) use async apply actions.
 * Analytic modes (HO, hydrogen) and Pauli use synchronous setters.
 */
function applyFirstPreset(
  mode: SchroedingerConfig['quantumMode'],
  presetId: string,
  get: () => ExtendedObjectSlice
): void {
  const store = get()
  switch (mode) {
    case 'harmonicOscillator':
      store.setSchroedingerPresetName(presetId as SchroedingerPresetName)
      break
    case 'hydrogenND':
      store.setSchroedingerHydrogenNDPreset(presetId as HydrogenNDPresetName)
      break
    case 'hydrogenNDCoupled': {
      const preset = HYDROGEN_COUPLED_PRESETS.find((p) => p.id === presetId)
      if (preset) store.setSchroedingerConfig(preset.overrides)
      break
    }
    case 'tdseDynamics':
      void store.applyTdsePreset(presetId)
      break
    case 'becDynamics':
      void store.applyBecPreset(presetId)
      break
    case 'diracEquation':
      void store.applyDiracPreset(presetId)
      break
    case 'freeScalarField':
      store.applyFreeScalarPreset(presetId)
      break
    case 'quantumWalk':
      void store.applyQuantumWalkPreset(presetId)
      break
    case 'wheelerDeWitt':
      void store.applyWheelerDeWittPreset(presetId)
      break
    case 'antiDeSitter':
      store.setAdsPreset(presetId as import('@/lib/geometry/extended/antiDeSitter').AdsPresetName)
      break
  }
}

/**
 * Create quantum mode, representation, and quantum number setters.
 *
 * @param ctx - Setter context with Zustand set/get and validation helpers
 * @param resizers - Array resize functions from domain setters
 * @returns Object with all quantum mode and quantum number setters
 */
export function createQuantumModeSetters(ctx: SetterContext, resizers: ModeResizers) {
  const { setWithVersion, get } = ctx
  const isFinite = ctx.isFinite
  const warn = ctx.warnNonFinite

  return {
    setSchroedingerQuantumMode: (mode: SchroedingerConfig['quantumMode']) => {
      // Save current mode's rendering settings before switching
      const currentMode = get().schroedinger.quantumMode
      if (currentMode !== mode) {
        modeSettingsCache.set(currentMode, snapshotRenderingSettings(get().schroedinger))
        invalidateDynamicPresetApplies()
      }

      enforceDimensionConstraints(mode)

      setWithVersion((state) => {
        const dim = useGeometryStore.getState().dimension
        const reprOverrides = buildRepresentationOverrides(
          mode,
          dim,
          state.schroedinger.representation,
          state.schroedinger.crossSectionEnabled
        )
        const resizeUpdates = buildModeResizeUpdate(mode, state.schroedinger, dim, resizers)
        const renderingSettings = resolveRenderingSettings(mode)

        return {
          schroedinger: {
            ...state.schroedinger,
            quantumMode: mode,
            ...reprOverrides,
            ...resizeUpdates,
            ...renderingSettings,
          },
        }
      })

      // Auto-apply first dimension-compatible preset on first visit to a mode.
      // Subsequent visits preserve the user's custom state.
      //
      // During URL loading / scene loading (`isLoadingScene=true`) the caller
      // is layering explicit values on top of the newly-selected mode, and
      // the preset apply actions above run through an async dynamic import.
      // Letting the async preset resolve would then silently overwrite the
      // URL/scene values — e.g. cosmology params set on first visit to
      // `freeScalarField` disappearing when FREE_SCALAR_PRESETS finishes
      // importing. Still mark the mode visited so a later manual switch
      // away-and-back preserves the URL/scene-loaded state as authoritative.
      if (currentMode !== mode && !visitedModes.has(mode)) {
        visitedModes.add(mode)
        if (!usePerformanceStore.getState().isLoadingScene) {
          const dim = useGeometryStore.getState().dimension
          const presetId = getFirstPresetId(mode, dim)
          if (presetId) {
            applyFirstPreset(mode, presetId, get)
          }
        }
      }
    },

    setSchroedingerRepresentation: (value: 'position' | 'momentum' | 'wigner') => {
      if (value !== 'position' && isComputeQuantumType(get().schroedinger.quantumMode)) return
      if (value !== 'position') {
        const qm = get().schroedinger.quantumMode
        const dim = useGeometryStore.getState().dimension
        // Block non-position for hydrogen at dim=2 (not yet implemented)
        if (dim === 2 && isHydrogenFamilyQuantumType(qm)) return
        // Block momentum for coupled hydrogen ND (shader is position-only)
        if (value === 'momentum' && qm === 'hydrogenNDCoupled') return
      }
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, representation: value },
      }))
    },

    setSchroedingerPrincipalQuantumNumber: (n: number) => {
      if (!isFinite(n)) {
        warn('principalQuantumNumber', n)
        return
      }
      const clamped = Math.max(1, Math.min(7, Math.floor(n)))
      const currentL = get().schroedinger.azimuthalQuantumNumber
      const currentM = get().schroedinger.magneticQuantumNumber
      const newL = Math.min(currentL, clamped - 1)
      // `|| 0` normalizes JS -0 to 0 (Math.max(-0, ...) can produce -0 when bounds are 0)
      const newM = Math.max(-newL, Math.min(newL, currentM)) || 0
      const newChain = normalizeHydrogenCoupledAngularChain(get().schroedinger.angularChain, {
        l1: newL,
        magneticM: newM,
      })
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          principalQuantumNumber: clamped,
          azimuthalQuantumNumber: newL,
          magneticQuantumNumber: newM,
          angularChain: newChain,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerAzimuthalQuantumNumber: (l: number) => {
      if (!isFinite(l)) {
        warn('azimuthalQuantumNumber', l)
        return
      }
      const currentN = get().schroedinger.principalQuantumNumber
      const currentM = get().schroedinger.magneticQuantumNumber
      const clamped = Math.max(0, Math.min(currentN - 1, Math.floor(l)))
      // `|| 0` normalizes JS -0 to 0 (Math.max(-0, ...) can produce -0 when bounds are 0)
      const newM = Math.max(-clamped, Math.min(clamped, currentM)) || 0
      const chain = normalizeHydrogenCoupledAngularChain(get().schroedinger.angularChain, {
        l1: clamped,
        magneticM: newM,
      })
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          azimuthalQuantumNumber: clamped,
          magneticQuantumNumber: newM,
          angularChain: chain,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerMagneticQuantumNumber: (m: number) => {
      if (!isFinite(m)) {
        warn('magneticQuantumNumber', m)
        return
      }
      const currentL = get().schroedinger.azimuthalQuantumNumber
      // `|| 0` normalizes JS -0 to 0 (Math.max(-0, ...) can produce -0 when bounds are 0)
      const clamped = Math.max(-currentL, Math.min(currentL, Math.floor(m))) || 0
      const chain = normalizeHydrogenCoupledAngularChain(get().schroedinger.angularChain, {
        l1: currentL,
        magneticM: clamped,
      })
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          magneticQuantumNumber: clamped,
          angularChain: chain,
          hydrogenNDPreset: 'custom',
        },
      }))
    },

    setSchroedingerUseRealOrbitals: (useRealOrbitals: boolean) => {
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, useRealOrbitals, hydrogenNDPreset: 'custom' },
      }))
    },

    setSchroedingerBohrRadiusScale: (bohrRadiusScale: number) => {
      if (!isFinite(bohrRadiusScale)) {
        warn('bohrRadiusScale', bohrRadiusScale)
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

    // Hydrogen ND presets
    setSchroedingerHydrogenNDPreset: (preset: HydrogenNDPresetName) => {
      const presetName = normalizeHydrogenNDPresetName(preset)
      if (presetName === 'custom') {
        setWithVersion((state) => ({
          schroedinger: { ...state.schroedinger, hydrogenNDPreset: presetName },
        }))
        return
      }
      const presetData = getHydrogenNDPreset(presetName)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          hydrogenNDPreset: presetName,
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
      if (!isFinite(n)) {
        warn('extraDimQuantumNumbers', n)
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
      if (!ctx.hasOnlyFinite(numbers)) {
        warn('extraDimQuantumNumbers', numbers)
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

    /** Set a single angular chain value l_{k+2} for coupled hydrogen ND. */
    setSchroedingerAngularChainValue: (chainIndex: number, value: number) => {
      if (!Number.isInteger(chainIndex) || chainIndex < 0 || chainIndex >= 8) return
      if (!isFinite(value)) {
        warn('angularChain', value)
        return
      }
      const state = get().schroedinger
      const chain = [...state.angularChain]
      chain[chainIndex] = Math.floor(value)
      const normalizedChain = normalizeHydrogenCoupledAngularChain(chain, {
        l1: state.azimuthalQuantumNumber,
        magneticM: state.magneticQuantumNumber,
      })
      setWithVersion((s) => ({
        schroedinger: { ...s.schroedinger, angularChain: normalizedChain },
      }))
    },

    setSchroedingerExtraDimOmega: (dimIndex: number, omega: number) => {
      const omegas = [...get().schroedinger.extraDimOmega]
      if (dimIndex < 0 || dimIndex >= 8) return
      if (!isFinite(omega)) {
        warn('extraDimOmega', omega)
        return
      }
      omegas[dimIndex] = Math.max(0.1, Math.min(2.0, omega))
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimOmega: omegas },
      }))
    },

    setSchroedingerExtraDimOmegaAll: (omegas: number[]) => {
      if (!ctx.hasOnlyFinite(omegas)) {
        warn('extraDimOmegaAll', omegas)
        return
      }
      const clamped = omegas.slice(0, 8).map((o) => Math.max(0.1, Math.min(2.0, o)))
      while (clamped.length < 8) clamped.push(1.0)
      setWithVersion((state) => ({
        schroedinger: { ...state.schroedinger, extraDimOmega: clamped, presetName: 'custom' },
      }))
    },

    setSchroedingerExtraDimFrequencySpread: (spread: number) => {
      if (!isFinite(spread)) {
        warn('extraDimFrequencySpread', spread)
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
  }
}
