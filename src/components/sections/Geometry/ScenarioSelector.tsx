/**
 * Unified scenario/preset selector for all quantum modes.
 *
 * Renders a single "Scenarios" dropdown in the left panel header,
 * with options filtered by the active quantum mode and dimension.
 * Preset selections apply only from explicit user changes.
 */

import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Select } from '@/components/ui/Select'
import { PAULI_FIELD_VIEW_TO_COLOR_ALGO } from '@/lib/colors/palette/types'
import type { AdsPresetName, AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import type { SchroedingerPresetName } from '@/lib/geometry/extended/common'
import type { PauliConfig } from '@/lib/geometry/extended/pauli'
import type { HydrogenNDPresetName, SchroedingerConfig } from '@/lib/geometry/extended/schroedinger'
import { getHydrogenNDPresetsWithKeysByDimension } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import { ADS_PRESETS } from '@/lib/physics/antiDeSitter/presets'
import { BEC_SCENARIO_PRESETS } from '@/lib/physics/bec/presets'
import { BELL_SCENARIO_PRESETS } from '@/lib/physics/bell/presets'
import { DIRAC_SCENARIO_PRESETS } from '@/lib/physics/dirac/presets'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import { HYDROGEN_COUPLED_PRESETS } from '@/lib/physics/hydrogenCoupled/presets'
import { PAULI_SCENARIO_PRESETS } from '@/lib/physics/pauli/presets'
import { QUANTUM_WALK_PRESETS } from '@/lib/physics/quantumWalk/presets'
import { TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'
import { WDW_SCENARIO_PRESETS } from '@/lib/physics/wheelerDeWitt/presets'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

import {
  findActiveScenarioPresetId,
  findBellPresetId,
  findPauliPresetId,
} from './ScenarioSelector.matching'
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

/* ── Bell options ──────────────────────────────────────────── */

const BELL_PRESET_OPTIONS = BELL_SCENARIO_PRESETS.map((p) => ({ value: p.id, label: p.name }))

/* ── Free Scalar Field options ─────────────────────────────── */

function getFreeScalarPresetOptions(dimension: number) {
  return FREE_SCALAR_PRESETS.filter(
    (p) => p.overrides.latticeDim === undefined || p.overrides.latticeDim === dimension
  ).map((p) => ({
    value: p.id,
    label: p.name,
  }))
}

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

/* ── Description lookup ────────────────────────────────────── */

function findPresetDescriptionById(
  presets: readonly { id: string; description: string }[],
  id: string
): string | null {
  return presets.find((p) => p.id === id)?.description ?? null
}

function findHydrogenNDDescription(key: string): string | null {
  const groups = getHydrogenNDPresetsWithKeysByDimension()
  for (const presets of Object.values(groups)) {
    const match = presets.find(([presetKey]) => presetKey === key)
    if (match) return match[1].description
  }
  return null
}

const ID_PRESET_TABLES: Record<string, readonly { id: string; description: string }[]> = {
  hydrogenNDCoupled: HYDROGEN_COUPLED_PRESETS,
  tdseDynamics: TDSE_SCENARIO_PRESETS,
  becDynamics: BEC_SCENARIO_PRESETS,
  diracEquation: DIRAC_SCENARIO_PRESETS,
  freeScalarField: FREE_SCALAR_PRESETS,
  quantumWalk: QUANTUM_WALK_PRESETS,
  wheelerDeWitt: WDW_SCENARIO_PRESETS,
  pauliSpinor: PAULI_SCENARIO_PRESETS,
  bellPair: BELL_SCENARIO_PRESETS,
}

function findActiveDescription(
  mode: string,
  activeValue: string,
  ho: string,
  hyd: string,
  ads: string | undefined
): string | null {
  if (mode === 'harmonicOscillator') {
    return ho ? (SCHROEDINGER_NAMED_PRESETS[ho]?.description ?? null) : null
  }
  if (mode === 'hydrogenND') {
    return hyd ? findHydrogenNDDescription(hyd) : null
  }
  if (mode === 'antiDeSitter') {
    if (!ads || ads === 'custom') return null
    return ADS_PRESETS.find((p) => p.id === ads)?.description ?? null
  }
  const table = ID_PRESET_TABLES[mode]
  if (!table || !activeValue) return null
  return findPresetDescriptionById(table, activeValue)
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

  const {
    schroedinger,
    quantumMode,
    presetName,
    hydrogenNDPreset,
    adsPreset,
    pauliSpinor,
    bellPair,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      schroedinger: s.schroedinger,
      quantumMode: s.schroedinger.quantumMode,
      presetName: s.schroedinger.presetName,
      hydrogenNDPreset: s.schroedinger.hydrogenNDPreset,
      adsPreset: (s.schroedinger.antiDeSitter as AntiDeSitterConfig | undefined)?.preset,
      pauliSpinor: s.pauliSpinor,
      bellPair: s.bellPair,
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
    setBellPairConfig,
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
      setBellPairConfig: s.setBellPairConfig,
    }))
  )

  // Determine active mode key.
  // For non-Schrödinger object types, the preset list is driven by the
  // ObjectType itself — schroedinger.quantumMode is a sibling field that
  // does not move when the user switches ObjectType, so falling through to
  // it would show stale HO/TDSE presets on a Bell or Pauli object.
  const isPauli = objectType === 'pauliSpinor'
  const isBellPair = objectType === 'bellPair'
  const mode: string = isBellPair ? 'bellPair' : isPauli ? 'pauliSpinor' : quantumMode

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
        return getFreeScalarPresetOptions(dimension)
      case 'quantumWalk':
        return QUANTUM_WALK_PRESET_OPTIONS
      case 'wheelerDeWitt':
        return WDW_PRESET_OPTIONS
      case 'pauliSpinor':
        return PAULI_PRESET_OPTIONS
      case 'bellPair':
        return BELL_PRESET_OPTIONS
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
      case 'bellPair':
        return findBellPresetId(bellPair) ?? ''
      default:
        return (
          findActiveScenarioPresetId(
            mode as SchroedingerConfig['quantumMode'],
            schroedinger,
            dimension
          ) ?? ''
        )
    }
  }, [
    mode,
    presetName,
    hydrogenNDPreset,
    adsPreset,
    pauliSpinor,
    bellPair,
    schroedinger,
    dimension,
  ])

  const selectOptions = useMemo(() => {
    if (!options || activeValue !== '') return options
    return [{ value: '', label: 'Custom' }, ...options]
  }, [options, activeValue])

  const activeDescription = useMemo(
    () =>
      findActiveDescription(mode, activeValue, presetName ?? '', hydrogenNDPreset ?? '', adsPreset),
    [mode, activeValue, presetName, hydrogenNDPreset, adsPreset]
  )

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
          void applyTdsePreset(value, { expectedQuantumMode: mode })
          break
        case 'becDynamics':
          void applyBecPreset(value, { expectedQuantumMode: mode })
          break
        case 'diracEquation':
          // applyDiracPreset internally syncs color algorithm for fieldViews like
          // 'particleAntiparticleSplit' that require a specific color algo.
          void applyDiracPreset(value, { expectedQuantumMode: mode })
          break
        case 'freeScalarField':
          void applyFreeScalarPreset(value, { expectedQuantumMode: mode })
          break
        case 'quantumWalk':
          void applyQuantumWalkPreset(value, { expectedQuantumMode: mode })
          break
        case 'wheelerDeWitt':
          void applyWheelerDeWittPreset(value, { expectedQuantumMode: mode })
          break
        case 'pauliSpinor':
          applyPauliPresetById(value, setPauliConfig)
          break
        case 'bellPair': {
          const preset = BELL_SCENARIO_PRESETS.find((p) => p.id === value)
          if (preset) setBellPairConfig({ ...preset.overrides, needsReset: true })
          break
        }
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
      setBellPairConfig,
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
      endAdornment={
        activeDescription ? (
          <Button
            variant="ghost"
            size="icon"
            tooltip={activeDescription}
            ariaLabel="Show scenario description"
            data-testid="scenario-description-info"
            className="!p-1.5 shrink-0"
          >
            <Icon name="info" size={14} />
          </Button>
        ) : undefined
      }
    />
  )
})

ScenarioSelector.displayName = 'ScenarioSelector'
