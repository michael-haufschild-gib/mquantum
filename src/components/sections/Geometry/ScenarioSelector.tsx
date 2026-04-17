/**
 * Unified scenario/preset selector for all quantum modes.
 *
 * Renders a single "Scenarios" dropdown in the left panel header,
 * with options filtered by the active quantum mode and dimension.
 * The first preset is auto-selected on mode switch.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Select } from '@/components/ui/Select'
import type { AdsPresetName, AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import type { SchroedingerPresetName } from '@/lib/geometry/extended/common'
import type { HydrogenNDPresetName } from '@/lib/geometry/extended/schroedinger'
import { getHydrogenNDPresetsWithKeysByDimension } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import { ADS_PRESETS } from '@/lib/physics/antiDeSitter/presets'
import { BEC_SCENARIO_PRESETS } from '@/lib/physics/bec/presets'
import { DIRAC_SCENARIO_PRESETS } from '@/lib/physics/dirac/presets'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import { HYDROGEN_COUPLED_PRESETS } from '@/lib/physics/hydrogenCoupled/presets'
import { PAULI_SCENARIO_PRESETS } from '@/lib/physics/pauli/presets'
import { getFirstPresetId } from '@/lib/physics/presetDefaults'
import { QUANTUM_WALK_PRESETS } from '@/lib/physics/quantumWalk/presets'
import { WDW_SCENARIO_PRESETS } from '@/lib/physics/wheelerDeWitt/presets'
import { PAULI_FIELD_VIEW_TO_COLOR_ALGO } from '@/rendering/shaders/palette/types'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

import { getScenarioPresetOptions as getTdsePresetOptions } from './SchroedingerControls/tdseControlsConstants'

/** Apply a Pauli preset by ID, setting config and color algorithm. */
function applyPauliPresetById(
  presetId: string,
  setPauliConfig: (config: Partial<import('@/lib/geometry/extended/pauli').PauliConfig>) => void
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

/* ── Anti-de Sitter options (dimension-filtered by preset `d`) ─ */

function getAdsPresetOptions(dim: number) {
  return ADS_PRESETS.filter((p) => p.d <= dim).map((p) => ({
    value: p.id,
    label: p.label,
  }))
}

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
 * Auto-selects the first preset when mode or dimension changes.
 */
export const ScenarioSelector: React.FC = React.memo(() => {
  const { objectType, dimension } = useGeometryStore(
    useShallow((s) => ({ objectType: s.objectType, dimension: s.dimension }))
  )

  const { quantumMode, presetName, hydrogenNDPreset, adsPreset } = useExtendedObjectStore(
    useShallow((s) => ({
      quantumMode: s.schroedinger.quantumMode,
      presetName: s.schroedinger.presetName,
      hydrogenNDPreset: s.schroedinger.hydrogenNDPreset,
      adsPreset: (s.schroedinger.antiDeSitter as AntiDeSitterConfig | undefined)?.preset,
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
        return getAdsPresetOptions(dimension)
      default:
        return null
    }
  }, [mode, dimension])

  // Per-mode selection tracking for compute modes (TDSE, BEC, Dirac, FSF, QW, Pauli).
  // HO and HydrogenND store their preset name in the Zustand store directly;
  // compute modes use async apply actions that make reverse-detection unreliable.
  const [computePreset, setComputePreset] = useState<Record<string, string>>({})

  // Auto-apply first Pauli preset on mode entry.
  // Pauli is object-type based (not quantum-mode), so the mode setter auto-apply
  // in quantumModeSetters doesn't cover it.
  const prevModeRef = useRef(mode)
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      // Seed tracked value and auto-apply preset only on first visit
      setComputePreset((prev) => {
        if (prev[mode]) return prev
        const firstId = getFirstPresetId(mode as Parameters<typeof getFirstPresetId>[0], dimension)
        if (firstId) {
          // Pauli is object-type based, so the mode setter auto-apply doesn't cover it
          if (mode === 'pauliSpinor') applyPauliPresetById(firstId, setPauliConfig)
        }
        return firstId ? { ...prev, [mode]: firstId } : prev
      })
    }
    prevModeRef.current = mode
  }, [mode, dimension, setPauliConfig])

  // Derive the active preset value from store state or tracked selection.
  const activeValue = useMemo(() => {
    switch (mode) {
      case 'harmonicOscillator':
        return presetName === 'custom' ? '' : (presetName ?? '')
      case 'hydrogenND':
        return hydrogenNDPreset === 'custom' ? '' : (hydrogenNDPreset ?? '')
      case 'antiDeSitter':
        return adsPreset === 'custom' || adsPreset === undefined ? '' : adsPreset
      default:
        return (
          computePreset[mode] ??
          getFirstPresetId(mode as Parameters<typeof getFirstPresetId>[0], dimension) ??
          ''
        )
    }
  }, [mode, presetName, hydrogenNDPreset, adsPreset, dimension, computePreset])

  // Dispatch change to the correct store action
  const handleChange = useCallback(
    (value: string) => {
      if (!value) return
      setComputePreset((prev) => ({ ...prev, [mode]: value }))
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
  if (!options) return null

  return (
    <Select
      label="Scenario"
      tooltip="Preconfigured physics scenarios with curated parameters for this quantum mode."
      options={options}
      value={activeValue}
      onChange={handleChange}
      data-testid="scenario-selector"
    />
  )
})

ScenarioSelector.displayName = 'ScenarioSelector'
