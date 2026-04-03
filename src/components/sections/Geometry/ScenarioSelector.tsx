/**
 * Unified scenario/preset selector for all quantum modes.
 *
 * Renders a single "Scenarios" dropdown in the left panel header,
 * with options filtered by the active quantum mode and dimension.
 * Replaces per-mode preset Selects that were buried inside control sections.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Select } from '@/components/ui/Select'
import type { SchroedingerPresetName } from '@/lib/geometry/extended/common'
import type { HydrogenNDPresetName } from '@/lib/geometry/extended/schroedinger'
import { getHydrogenNDPresetsWithKeysByDimension } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import { BEC_SCENARIO_PRESETS } from '@/lib/physics/bec/presets'
import { DIRAC_SCENARIO_PRESETS } from '@/lib/physics/dirac/presets'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import { HYDROGEN_COUPLED_PRESETS } from '@/lib/physics/hydrogenCoupled/presets'
import { PAULI_SCENARIO_PRESETS } from '@/lib/physics/pauli/presets'
import { QUANTUM_WALK_PRESETS } from '@/lib/physics/quantumWalk/presets'
import { PAULI_FIELD_VIEW_TO_COLOR_ALGO } from '@/rendering/shaders/palette/types'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

import { getScenarioPresetOptions as getTdsePresetOptions } from './SchroedingerControls/tdseControlsConstants'

const EMPTY_OPTION = { value: '', label: '\u2014 Select Preset \u2014' }

/* ── Harmonic Oscillator options ───────────────────────────── */

const HO_PRESET_OPTIONS = [
  EMPTY_OPTION,
  ...Object.entries(SCHROEDINGER_NAMED_PRESETS).map(([key, preset]) => ({
    value: key,
    label: preset.name,
  })),
]

/* ── BEC options (dimension-filtered) ──────────────────────── */

function getBecPresetOptions(dim: number) {
  return [
    EMPTY_OPTION,
    ...BEC_SCENARIO_PRESETS.filter((p) => (p.minDim ?? 2) <= dim).map((p) => ({
      value: p.id,
      label: p.name,
    })),
  ]
}

/* ── Dirac options ─────────────────────────────────────────── */

const DIRAC_PRESET_OPTIONS = [
  EMPTY_OPTION,
  ...DIRAC_SCENARIO_PRESETS.map((p) => ({ value: p.id, label: p.name })),
]

/* ── Pauli options ─────────────────────────────────────────── */

const PAULI_PRESET_OPTIONS = [
  EMPTY_OPTION,
  ...PAULI_SCENARIO_PRESETS.map((p) => ({ value: p.id, label: p.name })),
]

/* ── Free Scalar Field options ─────────────────────────────── */

const FREE_SCALAR_PRESET_OPTIONS = [
  EMPTY_OPTION,
  ...FREE_SCALAR_PRESETS.map((p) => ({ value: p.id, label: p.name })),
]

/* ── Quantum Walk options ──────────────────────────────────── */

const QUANTUM_WALK_PRESET_OPTIONS = [
  EMPTY_OPTION,
  ...QUANTUM_WALK_PRESETS.map((p) => ({ value: p.id, label: p.name })),
]

/* ── HydrogenND options (dimension-grouped, flattened) ─────── */

function getHydrogenNDOptions(dimension: number) {
  const groups = getHydrogenNDPresetsWithKeysByDimension()
  const opts = Object.entries(groups)
    .filter(([dim]) => Number(dim) <= dimension)
    .flatMap(([, presets]) => presets.map(([key, preset]) => ({ value: key, label: preset.name })))
  return [EMPTY_OPTION, ...opts]
}

/* ── HydrogenND Coupled options (dimension-filtered) ───────── */

function getHydrogenCoupledOptions(dimension: number) {
  return [
    EMPTY_OPTION,
    ...HYDROGEN_COUPLED_PRESETS.filter((p) => p.minDim <= dimension).map((p) => ({
      value: p.id,
      label: p.name,
    })),
  ]
}

/**
 * Unified scenario selector displayed in the left panel header.
 *
 * Shows preset options for every quantum mode and object type.
 */
export const ScenarioSelector: React.FC = React.memo(() => {
  const { objectType, dimension } = useGeometryStore(
    useShallow((s) => ({ objectType: s.objectType, dimension: s.dimension }))
  )

  const { quantumMode, presetName, hydrogenNDPreset } = useExtendedObjectStore(
    useShallow((s) => ({
      quantumMode: s.schroedinger.quantumMode,
      presetName: s.schroedinger.presetName,
      hydrogenNDPreset: s.schroedinger.hydrogenNDPreset,
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
    setPauliConfig,
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
      setPauliConfig: s.setPauliConfig,
    }))
  )

  // Determine active mode key
  const isPauli = objectType === 'pauliSpinor'
  const mode = isPauli ? 'pauliSpinor' : quantumMode

  // Local state tracks the user's last selection. Reset when mode changes.
  const [selectedPreset, setSelectedPreset] = useState('')
  const prevModeRef = useRef(mode)
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      setSelectedPreset('')
      prevModeRef.current = mode
    }
  }, [mode])

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
      case 'pauliSpinor':
        return PAULI_PRESET_OPTIONS
      default:
        return null
    }
  }, [mode, dimension])

  // Detect active value.
  // HO and HydrogenND track the preset name in the store directly.
  // Other modes use local selection state — the store apply actions
  // are async (dynamic import) and may clamp/resize values, making
  // reverse detection from config unreliable.
  const activeValue = useMemo(() => {
    switch (mode) {
      case 'harmonicOscillator': {
        const name = presetName ?? 'custom'
        return name === 'custom' ? '' : name
      }
      case 'hydrogenND': {
        const preset = hydrogenNDPreset ?? 'custom'
        return preset === 'custom' ? '' : preset
      }
      default:
        return selectedPreset
    }
  }, [mode, presetName, hydrogenNDPreset, selectedPreset])

  // Dispatch change to the correct store action
  const handleChange = useCallback(
    (value: string) => {
      if (!value) return
      setSelectedPreset(value)
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
          applyDiracPreset(value)
          break
        case 'freeScalarField':
          applyFreeScalarPreset(value)
          break
        case 'quantumWalk':
          applyQuantumWalkPreset(value)
          break
        case 'pauliSpinor': {
          const preset = PAULI_SCENARIO_PRESETS.find((p) => p.id === value)
          if (preset) {
            setPauliConfig({ ...preset.overrides, needsReset: true })
            if (preset.overrides.fieldView) {
              const algo = PAULI_FIELD_VIEW_TO_COLOR_ALGO[preset.overrides.fieldView]
              if (algo) {
                useAppearanceStore.getState().setColorAlgorithm(algo)
              }
            }
          }
          break
        }
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
      setPauliConfig,
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
