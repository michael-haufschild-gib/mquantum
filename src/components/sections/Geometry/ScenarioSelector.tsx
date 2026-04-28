/**
 * Unified scenario/preset selector for all quantum modes.
 *
 * Renders a single "Scenarios" dropdown in the left panel header,
 * with options filtered by the active quantum mode and dimension.
 * Preset selections apply only from explicit user changes.
 */

import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Select } from '@/components/ui/Select'
import type { AdsPresetName, AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import type { SchroedingerPresetName } from '@/lib/geometry/extended/common'
import type { PauliConfig } from '@/lib/geometry/extended/pauli'
import type { HydrogenNDPresetName, SchroedingerConfig } from '@/lib/geometry/extended/schroedinger'
import { getHydrogenNDPresetsWithKeysByDimension } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import { ADS_PRESETS } from '@/lib/physics/antiDeSitter/presets'
import { BEC_SCENARIO_PRESETS } from '@/lib/physics/bec/presets'
import { DIRAC_SCENARIO_PRESETS } from '@/lib/physics/dirac/presets'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import { HYDROGEN_COUPLED_PRESETS } from '@/lib/physics/hydrogenCoupled/presets'
import { PAULI_SCENARIO_PRESETS } from '@/lib/physics/pauli/presets'
import type { ScenarioPreset } from '@/lib/physics/presetTypes'
import { QUANTUM_WALK_PRESETS } from '@/lib/physics/quantumWalk/presets'
import { TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'
import { WDW_SCENARIO_PRESETS } from '@/lib/physics/wheelerDeWitt/presets'
import { PAULI_FIELD_VIEW_TO_COLOR_ALGO } from '@/rendering/shaders/palette/types'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { resizeTdseArrays } from '@/stores/slices/geometry/setters/tdseSetters'

import { getScenarioPresetOptions as getTdsePresetOptions } from './SchroedingerControls/tdseControlsConstants'

/** Apply a Pauli preset by ID, setting config and color algorithm. */
function applyPauliPresetById(
  presetId: string,
  setPauliConfig: (config: Partial<PauliConfig>) => void
): void {
  const preset = PAULI_SCENARIO_PRESETS.find((p) => p.id === presetId)
  if (!preset) return
  setPauliConfig({ ...preset.overrides, needsReset: true })
  const algo = preset.overrides.fieldView
    ? PAULI_FIELD_VIEW_TO_COLOR_ALGO[preset.overrides.fieldView]
    : undefined
  if (algo) useAppearanceStore.getState().setColorAlgorithm(algo)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNeutralPresetTailValue(value: unknown): boolean {
  return typeof value === 'number' ? Object.is(value, 0) : value === undefined
}

function matchesLiveArrayTail(live: unknown[], preset: unknown[], start: number): boolean {
  const repeatedPresetValue = preset[preset.length - 1]
  return live
    .slice(start)
    .every(
      (value) => presetValueEquals(value, repeatedPresetValue) || isNeutralPresetTailValue(value)
    )
}

function presetValueEquals(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    const commonLength = Math.min(a.length, b.length)
    for (let i = 0; i < commonLength; i++) {
      if (!presetValueEquals(a[i], b[i])) return false
    }
    if (a.length > b.length) return matchesLiveArrayTail(a, b, commonLength)
    return b.slice(commonLength).every(isNeutralPresetTailValue)
  }
  if (isRecord(a) && isRecord(b)) {
    const bKeys = Object.keys(b)
    return bKeys.every((key) => presetValueEquals(a[key], b[key]))
  }
  return Object.is(a, b)
}

function findScenarioPresetId<TConfig extends object>(
  config: TConfig,
  presets: readonly ScenarioPreset<Partial<TConfig>>[]
): string | null {
  const configRecord = config as Record<string, unknown>
  for (const preset of presets) {
    const entries = Object.entries(preset.overrides as Record<string, unknown>)
    const matches = entries.every(([key, value]) => presetValueEquals(configRecord[key], value))
    if (matches) return preset.id
  }
  return null
}

function tdseConfigMatches(current: TdseConfig, expected: TdseConfig): boolean {
  const ignored = new Set(['needsReset', 'slicePositions'])
  return Object.keys(expected).every((key) => {
    if (ignored.has(key)) return true
    const currentValue = (current as unknown as Record<string, unknown>)[key]
    const expectedValue = (expected as unknown as Record<string, unknown>)[key]
    return presetValueEquals(currentValue, expectedValue)
  })
}

function findTdsePresetId(config: TdseConfig, dimension: number): string | null {
  for (const preset of TDSE_SCENARIO_PRESETS) {
    const { latticeDim: _presetDim, ...safeOverrides } = preset.overrides
    const base = {
      ...DEFAULT_TDSE_CONFIG,
      ...safeOverrides,
      slicePositions: config.slicePositions,
      needsReset: true,
    }
    const resized = resizeTdseArrays(base, dimension)
    const potentialType =
      dimension < 2 && base.potentialType === 'doubleSlit'
        ? ('barrier' as const)
        : base.potentialType
    const expected = { ...base, ...resized, potentialType, needsReset: true }
    if (tdseConfigMatches(config, expected)) return preset.id
  }
  return null
}

function findPauliPresetId(config: PauliConfig): string | null {
  return findScenarioPresetId(config, PAULI_SCENARIO_PRESETS)
}

function findActiveScenarioPresetId(
  mode: SchroedingerConfig['quantumMode'],
  schroedinger: SchroedingerConfig,
  dimension: number
): string | null {
  switch (mode) {
    case 'hydrogenNDCoupled':
      return findScenarioPresetId(schroedinger, HYDROGEN_COUPLED_PRESETS)
    case 'tdseDynamics':
      return findTdsePresetId(schroedinger.tdse, dimension)
    case 'becDynamics':
      return findScenarioPresetId(schroedinger.bec, BEC_SCENARIO_PRESETS)
    case 'diracEquation':
      return findScenarioPresetId(schroedinger.dirac, DIRAC_SCENARIO_PRESETS)
    case 'freeScalarField':
      return findScenarioPresetId(schroedinger.freeScalar, FREE_SCALAR_PRESETS)
    case 'quantumWalk':
      return findScenarioPresetId(schroedinger.quantumWalk, QUANTUM_WALK_PRESETS)
    case 'wheelerDeWitt':
      return findScenarioPresetId(schroedinger.wheelerDeWitt, WDW_SCENARIO_PRESETS)
    default:
      return null
  }
}

/* ── Harmonic Oscillator options ───────────────────────────── */

const HO_PRESET_OPTIONS = Object.entries(SCHROEDINGER_NAMED_PRESETS).map(([key, preset]) => ({
  value: key,
  label: preset.name,
}))

/* ── BEC options (dimension-filtered) ──────────────────────── */

function getBecPresetOptions(dim: number) {
  return BEC_SCENARIO_PRESETS.filter((p) => (p.minDim ?? 2) <= dim).map((p) => ({
    value: p.id,
    label: p.name,
  }))
}

/* ── Dirac options ─────────────────────────────────────────── */

const DIRAC_PRESET_OPTIONS = DIRAC_SCENARIO_PRESETS.map((p) => ({ value: p.id, label: p.name }))

/* ── Pauli options ─────────────────────────────────────────── */

const PAULI_PRESET_OPTIONS = PAULI_SCENARIO_PRESETS.map((p) => ({ value: p.id, label: p.name }))

/* ── Free Scalar Field options ─────────────────────────────── */

const FREE_SCALAR_PRESET_OPTIONS = FREE_SCALAR_PRESETS.map((p) => ({
  value: p.id,
  label: p.name,
}))

/* ── Quantum Walk options ──────────────────────────────────── */

const QUANTUM_WALK_PRESET_OPTIONS = QUANTUM_WALK_PRESETS.map((p) => ({
  value: p.id,
  label: p.name,
}))

/* ── Wheeler–DeWitt options ────────────────────────────────── */

const WDW_PRESET_OPTIONS = WDW_SCENARIO_PRESETS.map((p) => ({
  value: p.id,
  label: p.name,
}))

/* ── Anti-de Sitter options ─────────────────────────────────── */

// AdS presets carry their own boundary dimension `d` and apply it on
// selection (via `setAdsPreset` → `setAdsDimension`). The global
// `geometry.dimension` is the visualizer's spatial dimension — unrelated
// to AdS's boundary dimension — so there is nothing meaningful to filter
// against. Previously we filtered `p.d <= dim`, which could hide the
// currently-active preset after the user changed `geometry.dimension`
// and left the header selector showing an empty value while the AdS
// state still pointed at that preset.
const ADS_PRESET_OPTIONS = ADS_PRESETS.map((p) => ({
  value: p.id,
  label: p.label,
}))

/* ── HydrogenND options (dimension-grouped, flattened) ─────── */

function getHydrogenNDOptions(dimension: number) {
  const groups = getHydrogenNDPresetsWithKeysByDimension()
  return Object.entries(groups)
    .filter(([dim]) => Number(dim) <= dimension)
    .flatMap(([, presets]) => presets.map(([key, preset]) => ({ value: key, label: preset.name })))
}

/* ── HydrogenND Coupled options (dimension-filtered) ───────── */

function getHydrogenCoupledOptions(dimension: number) {
  return HYDROGEN_COUPLED_PRESETS.filter((p) => p.minDim <= dimension).map((p) => ({
    value: p.id,
    label: p.name,
  }))
}

/**
 * Unified scenario selector displayed in the left panel header.
 *
 * Shows preset options for every quantum mode and object type.
 * Displays a selected preset only when current state matches that preset.
 */
export const ScenarioSelector: React.FC = React.memo(() => {
  const { objectType, dimension } = useGeometryStore(
    useShallow((s) => ({ objectType: s.objectType, dimension: s.dimension }))
  )

  const { schroedinger, quantumMode, presetName, hydrogenNDPreset, adsPreset, pauliSpinor } =
    useExtendedObjectStore(
      useShallow((s) => ({
        schroedinger: s.schroedinger,
        quantumMode: s.schroedinger.quantumMode,
        presetName: s.schroedinger.presetName,
        hydrogenNDPreset: s.schroedinger.hydrogenNDPreset,
        adsPreset: (s.schroedinger.antiDeSitter as AntiDeSitterConfig | undefined)?.preset,
        pauliSpinor: s.pauliSpinor,
      }))
    )

  // Store actions (stable references — single batched selector)
  const {
    setPresetName,
    setHydrogenNDPreset,
    setSchroedingerConfig,
    applyTdsePreset,
    applyBecPreset,
    applyDiracPreset,
    applyFreeScalarPreset,
    applyQuantumWalkPreset,
    applyWheelerDeWittPreset,
    setPauliConfig,
    setAdsPreset,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      setPresetName: s.setSchroedingerPresetName,
      setHydrogenNDPreset: s.setSchroedingerHydrogenNDPreset,
      setSchroedingerConfig: s.setSchroedingerConfig,
      applyTdsePreset: s.applyTdsePreset,
      applyBecPreset: s.applyBecPreset,
      applyDiracPreset: s.applyDiracPreset,
      applyFreeScalarPreset: s.applyFreeScalarPreset,
      applyQuantumWalkPreset: s.applyQuantumWalkPreset,
      applyWheelerDeWittPreset: s.applyWheelerDeWittPreset,
      setPauliConfig: s.setPauliConfig,
      setAdsPreset: s.setAdsPreset,
    }))
  )

  // Determine active mode key
  const isPauli = objectType === 'pauliSpinor'
  const mode = isPauli ? 'pauliSpinor' : quantumMode

  // Build options
  const options = useMemo(() => {
    switch (mode) {
      case 'harmonicOscillator':
        return HO_PRESET_OPTIONS
      case 'hydrogenND':
        return getHydrogenNDOptions(dimension)
      case 'hydrogenNDCoupled':
        return getHydrogenCoupledOptions(dimension)
      case 'tdseDynamics':
        return getTdsePresetOptions(dimension)
      case 'becDynamics':
        return getBecPresetOptions(dimension)
      case 'diracEquation':
        return DIRAC_PRESET_OPTIONS
      case 'freeScalarField':
        return FREE_SCALAR_PRESET_OPTIONS
      case 'quantumWalk':
        return QUANTUM_WALK_PRESET_OPTIONS
      case 'wheelerDeWitt':
        return WDW_PRESET_OPTIONS
      case 'pauliSpinor':
        return PAULI_PRESET_OPTIONS
      case 'antiDeSitter':
        return ADS_PRESET_OPTIONS
      default:
        return null
    }
  }, [mode, dimension])

  // Derive the active preset value from store state.
  const activeValue = useMemo(() => {
    switch (mode) {
      case 'harmonicOscillator':
        return presetName === 'custom' ? '' : (presetName ?? '')
      case 'hydrogenND':
        return hydrogenNDPreset === 'custom' ? '' : (hydrogenNDPreset ?? '')
      case 'antiDeSitter':
        return adsPreset === 'custom' || adsPreset === undefined ? '' : adsPreset
      case 'pauliSpinor':
        return findPauliPresetId(pauliSpinor) ?? ''
      default:
        return (
          findActiveScenarioPresetId(
            mode as SchroedingerConfig['quantumMode'],
            schroedinger,
            dimension
          ) ?? ''
        )
    }
  }, [mode, presetName, hydrogenNDPreset, adsPreset, pauliSpinor, schroedinger, dimension])

  const selectOptions = useMemo(() => {
    if (!options || activeValue !== '') return options
    return [{ value: '', label: 'Custom' }, ...options]
  }, [options, activeValue])

  // Dispatch change to the correct store action
  const handleChange = useCallback(
    (value: string) => {
      if (!value) return
      switch (mode) {
        case 'harmonicOscillator':
          setPresetName(value as SchroedingerPresetName)
          break
        case 'hydrogenND':
          setHydrogenNDPreset(value as HydrogenNDPresetName)
          break
        case 'hydrogenNDCoupled': {
          const preset = HYDROGEN_COUPLED_PRESETS.find((p) => p.id === value)
          if (preset) setSchroedingerConfig(preset.overrides)
          break
        }
        case 'tdseDynamics':
          applyTdsePreset(value)
          break
        case 'becDynamics':
          applyBecPreset(value)
          break
        case 'diracEquation':
          // applyDiracPreset internally syncs color algorithm for fieldViews like
          // 'particleAntiparticleSplit' that require a specific color algo.
          applyDiracPreset(value)
          break
        case 'freeScalarField':
          applyFreeScalarPreset(value)
          break
        case 'quantumWalk':
          applyQuantumWalkPreset(value)
          break
        case 'wheelerDeWitt':
          applyWheelerDeWittPreset(value)
          break
        case 'pauliSpinor':
          applyPauliPresetById(value, setPauliConfig)
          break
        case 'antiDeSitter':
          setAdsPreset(value as AdsPresetName)
          break
      }
    },
    [
      mode,
      setPresetName,
      setHydrogenNDPreset,
      setSchroedingerConfig,
      applyTdsePreset,
      applyBecPreset,
      applyDiracPreset,
      applyFreeScalarPreset,
      applyQuantumWalkPreset,
      applyWheelerDeWittPreset,
      setPauliConfig,
      setAdsPreset,
    ]
  )

  // No presets for this mode
  if (!selectOptions) return null

  return (
    <Select
      label="Scenario"
      tooltip="Preconfigured physics scenarios with curated parameters for this quantum mode."
      options={selectOptions}
      value={activeValue}
      onChange={handleChange}
      data-testid="scenario-selector"
    />
  )
})

ScenarioSelector.displayName = 'ScenarioSelector'
