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
import type { AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import type { BifurcationHorizonConfig } from '@/lib/geometry/extended/bifurcationHorizon'
import { BIFURCATION_HORIZON_SCENARIOS } from '@/lib/geometry/extended/bifurcationHorizon'
import type { CoherenceHorizonConfig } from '@/lib/geometry/extended/coherenceHorizon'
import { COHERENCE_HORIZON_SCENARIOS } from '@/lib/geometry/extended/coherenceHorizon'
import type { HilbertPolyaConfig } from '@/lib/geometry/extended/hilbertPolya'
import { HILBERT_POLYA_SCENARIOS } from '@/lib/geometry/extended/hilbertPolya'
import type { ModularKnotConfig } from '@/lib/geometry/extended/modularKnot'
import { MODULAR_KNOT_SCENARIOS } from '@/lib/geometry/extended/modularKnot'
import type { RiemannZetaConfig } from '@/lib/geometry/extended/riemannZeta'
import { RIEMANN_ZETA_SCENARIOS } from '@/lib/geometry/extended/riemannZeta'
import type { SchroedingerConfig } from '@/lib/geometry/extended/schroedinger'
import { getHydrogenNDPresetsWithKeysByDimension } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets'
import { isWdwZetaMode } from '@/lib/geometry/extended/wdwZeta/shared'
import {
  wdwZetaActiveDescription,
  wdwZetaActivePreset,
  wdwZetaPresetOptions,
} from '@/lib/geometry/extended/wdwZeta/uiRegistry'
import { getQuantumTypeGroupForKey } from '@/lib/geometry/registry'
import type { QuantumTypeKey } from '@/lib/geometry/registry/types'
import { ADS_PRESETS } from '@/lib/physics/antiDeSitter/presets'
import { BEC_SCENARIO_PRESETS } from '@/lib/physics/bec/presets'
import { BELL_SCENARIO_PRESETS } from '@/lib/physics/bell/presets'
import { DIRAC_SCENARIO_PRESETS, getDiracPresetsForDimension } from '@/lib/physics/dirac/presets'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import { HYDROGEN_COUPLED_PRESETS } from '@/lib/physics/hydrogenCoupled/presets'
import { PAULI_SCENARIO_PRESETS } from '@/lib/physics/pauli/presets'
import { QUANTUM_WALK_PRESETS } from '@/lib/physics/quantumWalk/presets'
import { TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'
import {
  getWdwPresetsForGeometryDimension,
  WDW_SCENARIO_PRESETS,
} from '@/lib/physics/wheelerDeWitt/presets'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

import { dispatchScenarioChange, type ScenarioDispatchActions } from './ScenarioSelector.dispatch'
import {
  findActiveScenarioPresetId,
  findBellPresetId,
  findPauliPresetId,
} from './ScenarioSelector.matching'
import {
  parseZetaGroupValue,
  zetaGroupActiveValue,
  zetaGroupScenarioOptions,
} from './ScenarioSelector.zetaGroup'
import { getScenarioPresetOptions as getTdsePresetOptions } from './SchroedingerControls/tdseControlsConstants'

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

/* ── Dirac options (dimension-filtered) ─────────────────────── */

function getDiracPresetOptions(dimension: number) {
  return getDiracPresetsForDimension(dimension).map((p) => ({ value: p.id, label: p.name }))
}

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

function getWdwPresetOptions(dimension: number) {
  return getWdwPresetsForGeometryDimension(dimension).map((p) => ({
    value: p.id,
    label: p.name,
  }))
}

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

/* ── Coherence Horizon options ──────────────────────────────── */

const COHERENCE_HORIZON_PRESET_OPTIONS = COHERENCE_HORIZON_SCENARIOS.map((p) => ({
  value: p.id,
  label: p.label,
}))

/* ── Riemann Zeta (Arithmetic Horizon) options ──────────────── */

const RIEMANN_ZETA_PRESET_OPTIONS = RIEMANN_ZETA_SCENARIOS.map((p) => ({
  value: p.id,
  label: p.label,
}))

/* ── Hilbert–Pólya Spectrum options ─────────────────────────── */

const HILBERT_POLYA_PRESET_OPTIONS = HILBERT_POLYA_SCENARIOS.map((p) => ({
  value: p.id,
  label: p.label,
}))

/* ── Bifurcation Horizon options ────────────────────────────── */

const BIFURCATION_HORIZON_PRESET_OPTIONS = BIFURCATION_HORIZON_SCENARIOS.map((p) => ({
  value: p.id,
  label: p.label,
}))

/* ── Modular Knot options ───────────────────────────────────── */

const MODULAR_KNOT_PRESET_OPTIONS = MODULAR_KNOT_SCENARIOS.map((p) => ({
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

/** Description for preset-tagged scenario modes (AdS / horizon family):
 * `custom` or missing ids have no description. */
function findTaggedScenarioDescription(
  presets: readonly { id: string; description: string }[],
  id: string | undefined
): string | null {
  if (!id || id === 'custom') return null
  return presets.find((p) => p.id === id)?.description ?? null
}

function findActiveDescription(
  mode: string,
  activeValue: string,
  ho: string,
  hyd: string,
  ads: string | undefined,
  coherenceHorizon: string | undefined,
  riemannZeta: string | undefined,
  hilbertPolya: string | undefined,
  bifurcationHorizon: string | undefined,
  modularKnot: string | undefined
): string | null {
  if (mode === 'harmonicOscillator') {
    return ho ? (SCHROEDINGER_NAMED_PRESETS[ho]?.description ?? null) : null
  }
  if (mode === 'hydrogenND') {
    return hyd ? findHydrogenNDDescription(hyd) : null
  }
  if (mode === 'antiDeSitter') {
    return findTaggedScenarioDescription(ADS_PRESETS, ads)
  }
  if (mode === 'coherenceHorizon') {
    return findTaggedScenarioDescription(COHERENCE_HORIZON_SCENARIOS, coherenceHorizon)
  }
  if (mode === 'riemannZeta') {
    return findTaggedScenarioDescription(RIEMANN_ZETA_SCENARIOS, riemannZeta)
  }
  if (mode === 'hilbertPolya') {
    return findTaggedScenarioDescription(HILBERT_POLYA_SCENARIOS, hilbertPolya)
  }
  if (mode === 'bifurcationHorizon') {
    return findTaggedScenarioDescription(BIFURCATION_HORIZON_SCENARIOS, bifurcationHorizon)
  }
  if (mode === 'modularKnot') {
    return findTaggedScenarioDescription(MODULAR_KNOT_SCENARIOS, modularKnot)
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
    coherenceHorizonPreset,
    riemannZetaPreset,
    hilbertPolyaPreset,
    bifurcationHorizonPreset,
    modularKnotPreset,
    pauliSpinor,
    bellPair,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      schroedinger: s.schroedinger,
      quantumMode: s.schroedinger.quantumMode,
      presetName: s.schroedinger.presetName,
      hydrogenNDPreset: s.schroedinger.hydrogenNDPreset,
      adsPreset: (s.schroedinger.antiDeSitter as AntiDeSitterConfig | undefined)?.preset,
      coherenceHorizonPreset: (
        s.schroedinger.coherenceHorizon as CoherenceHorizonConfig | undefined
      )?.preset,
      riemannZetaPreset: (s.schroedinger.riemannZeta as RiemannZetaConfig | undefined)?.preset,
      hilbertPolyaPreset: (s.schroedinger.hilbertPolya as HilbertPolyaConfig | undefined)?.preset,
      bifurcationHorizonPreset: (
        s.schroedinger.bifurcationHorizon as BifurcationHorizonConfig | undefined
      )?.preset,
      modularKnotPreset: (s.schroedinger.modularKnot as ModularKnotConfig | undefined)?.preset,
      pauliSpinor: s.pauliSpinor,
      bellPair: s.bellPair,
    }))
  )

  // Store actions (stable references — single batched selector). Bundled as
  // one object that satisfies ScenarioDispatchActions so the per-mode change
  // dispatch lives in the extracted ScenarioSelector.dispatch module.
  const actions: ScenarioDispatchActions = useExtendedObjectStore(
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
      setCoherenceHorizonPreset: s.setCoherenceHorizonPreset,
      setRiemannZetaPreset: s.setRiemannZetaPreset,
      setHilbertPolyaPreset: s.setHilbertPolyaPreset,
      setBifurcationHorizonPreset: s.setBifurcationHorizonPreset,
      setModularKnotPreset: s.setModularKnotPreset,
      setWdwZetaPreset: s.setWdwZetaPreset,
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
  // When the active mode belongs to a collapsed Types-tab family (Zeta / Prime),
  // the Scenario dropdown lists EVERY member's presets (a stable whole-type menu)
  // and selecting one switches sub-type + applies the preset.
  const group = getQuantumTypeGroupForKey(mode as QuantumTypeKey)

  // Build options
  const options = useMemo(() => {
    if (group) return zetaGroupScenarioOptions(group, dimension)
    if (isWdwZetaMode(mode)) return wdwZetaPresetOptions(mode)
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
        return getDiracPresetOptions(dimension)
      case 'freeScalarField':
        return getFreeScalarPresetOptions(dimension)
      case 'quantumWalk':
        return QUANTUM_WALK_PRESET_OPTIONS
      case 'wheelerDeWitt':
        return getWdwPresetOptions(dimension)
      case 'pauliSpinor':
        return PAULI_PRESET_OPTIONS
      case 'bellPair':
        return BELL_PRESET_OPTIONS
      case 'antiDeSitter':
        return ADS_PRESET_OPTIONS
      case 'coherenceHorizon':
        return COHERENCE_HORIZON_PRESET_OPTIONS
      case 'riemannZeta':
        return RIEMANN_ZETA_PRESET_OPTIONS
      case 'hilbertPolya':
        return HILBERT_POLYA_PRESET_OPTIONS
      case 'bifurcationHorizon':
        return BIFURCATION_HORIZON_PRESET_OPTIONS
      case 'modularKnot':
        return MODULAR_KNOT_PRESET_OPTIONS
      default:
        return null
    }
  }, [mode, dimension, group])

  // Derive the active preset value from store state (per active sub-mode).
  const perModeActiveValue = useMemo(() => {
    if (isWdwZetaMode(mode)) return wdwZetaActivePreset(schroedinger, mode)
    // Tagged-preset modes all normalize the same way (custom/undefined → '').
    const tagged: Partial<Record<string, string | undefined>> = {
      antiDeSitter: adsPreset,
      coherenceHorizon: coherenceHorizonPreset,
      riemannZeta: riemannZetaPreset,
      hilbertPolya: hilbertPolyaPreset,
      bifurcationHorizon: bifurcationHorizonPreset,
      modularKnot: modularKnotPreset,
    }
    if (mode in tagged) {
      const v = tagged[mode]
      return v === undefined || v === 'custom' ? '' : v
    }
    switch (mode) {
      case 'harmonicOscillator':
        return presetName === 'custom' ? '' : (presetName ?? '')
      case 'hydrogenND':
        return hydrogenNDPreset === 'custom' ? '' : (hydrogenNDPreset ?? '')
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
    coherenceHorizonPreset,
    riemannZetaPreset,
    hilbertPolyaPreset,
    bifurcationHorizonPreset,
    modularKnotPreset,
    pauliSpinor,
    bellPair,
    schroedinger,
    dimension,
  ])

  // For a grouped type the dropdown value encodes `subMode::presetId`.
  const activeValue = group ? zetaGroupActiveValue(mode, perModeActiveValue) : perModeActiveValue

  const selectOptions = useMemo(() => {
    if (!options || activeValue !== '') return options
    return [{ value: '', label: 'Custom' }, ...options]
  }, [options, activeValue])

  const activeDescription = useMemo(
    () =>
      isWdwZetaMode(mode)
        ? wdwZetaActiveDescription(schroedinger, mode)
        : findActiveDescription(
            mode,
            perModeActiveValue,
            presetName ?? '',
            hydrogenNDPreset ?? '',
            adsPreset,
            coherenceHorizonPreset,
            riemannZetaPreset,
            hilbertPolyaPreset,
            bifurcationHorizonPreset,
            modularKnotPreset
          ),
    [
      mode,
      perModeActiveValue,
      presetName,
      hydrogenNDPreset,
      adsPreset,
      coherenceHorizonPreset,
      riemannZetaPreset,
      hilbertPolyaPreset,
      bifurcationHorizonPreset,
      modularKnotPreset,
      schroedinger,
    ]
  )

  // Dispatch change to the correct store action (logic lives in the extracted
  // ScenarioSelector.dispatch module to keep this file within the line budget).
  const handleChange = useCallback(
    (value: string) => {
      if (!value) return
      if (group) {
        const sel = parseZetaGroupValue(value)
        if (!sel) return
        // Trigger the owning sub-type, then apply its preset (both synchronous).
        if (sel.memberKey !== quantumMode) {
          useExtendedObjectStore
            .getState()
            .setSchroedingerQuantumMode(sel.memberKey as SchroedingerConfig['quantumMode'])
        }
        dispatchScenarioChange(sel.memberKey, sel.presetId, actions)
        return
      }
      dispatchScenarioChange(mode, value, actions)
    },
    [group, mode, quantumMode, actions]
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
