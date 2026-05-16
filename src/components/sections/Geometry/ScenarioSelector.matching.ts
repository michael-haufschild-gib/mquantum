/**
 * Pure helpers used by ScenarioSelector to recognize the active scenario
 * preset for each quantum mode.
 *
 * Extracted from ScenarioSelector.tsx to keep the React component file
 * under the 500-line lint limit.
 *
 * @module components/sections/Geometry/ScenarioSelector.matching
 */

import { type BecConfig, DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import type { BellPairConfig } from '@/lib/geometry/extended/bellPair'
import type { FreeScalarConfig } from '@/lib/geometry/extended/freeScalar'
import type { PauliConfig } from '@/lib/geometry/extended/pauli'
import type { SchroedingerConfig } from '@/lib/geometry/extended/schroedinger'
import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/tdse'
import { BEC_SCENARIO_PRESETS } from '@/lib/physics/bec/presets'
import { BELL_SCENARIO_PRESETS } from '@/lib/physics/bell/presets'
import { DIRAC_SCENARIO_PRESETS } from '@/lib/physics/dirac/presets'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import { HYDROGEN_COUPLED_PRESETS } from '@/lib/physics/hydrogenCoupled/presets'
import { PAULI_SCENARIO_PRESETS } from '@/lib/physics/pauli/presets'
import type { ScenarioPreset } from '@/lib/physics/presetTypes'
import { QUANTUM_WALK_PRESETS } from '@/lib/physics/quantumWalk/presets'
import { TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'
import { WDW_SCENARIO_PRESETS } from '@/lib/physics/wheelerDeWitt/presets'
import { resizeBecArrays } from '@/stores/slices/geometry/setters/becResize'
import { resizeTdseArrays } from '@/stores/slices/geometry/setters/tdseSetters'

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

/** Deep value-equality used to compare a live config field against a preset override. */
export function presetValueEquals(a: unknown, b: unknown): boolean {
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

/** Returns the id of the first preset whose overrides exactly match the live config, or null. */
export function findScenarioPresetId<TConfig extends object>(
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

function countPresetOverrideLeaves(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countPresetOverrideLeaves(item), 0)
  }
  if (isRecord(value)) {
    return Object.values(value).reduce<number>(
      (total, item) => total + countPresetOverrideLeaves(item),
      0
    )
  }
  return 1
}

/** Like findScenarioPresetId, but prefers the preset whose override tree has the most leaf entries. */
export function findMostSpecificScenarioPresetId<TConfig extends object>(
  config: TConfig,
  presets: readonly ScenarioPreset<Partial<TConfig>>[]
): string | null {
  const configRecord = config as Record<string, unknown>
  let bestMatch: { id: string; specificity: number } | null = null

  for (const preset of presets) {
    const entries = Object.entries(preset.overrides as Record<string, unknown>)
    const matches = entries.every(([key, value]) => presetValueEquals(configRecord[key], value))
    if (!matches) continue

    const specificity = countPresetOverrideLeaves(preset.overrides)
    if (bestMatch === null || specificity > bestMatch.specificity) {
      bestMatch = { id: preset.id, specificity }
    }
  }

  return bestMatch?.id ?? null
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

function becConfigMatches(current: BecConfig, expected: BecConfig): boolean {
  const ignored = new Set(['needsReset', 'slicePositions'])
  return Object.keys(expected).every((key) => {
    if (ignored.has(key)) return true
    const currentValue = (current as unknown as Record<string, unknown>)[key]
    const expectedValue = (expected as unknown as Record<string, unknown>)[key]
    return presetValueEquals(currentValue, expectedValue)
  })
}

/** Find the TDSE preset id whose dimension-resized expected config matches the live config. */
export function findTdsePresetId(config: TdseConfig, dimension: number): string | null {
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

/** Find the BEC preset id whose dimension-resized expected config matches the live config. */
export function findBecPresetId(config: BecConfig, dimension: number): string | null {
  for (const preset of BEC_SCENARIO_PRESETS) {
    if ((preset.minDim ?? 2) > dimension) continue

    const {
      latticeDim: _presetDim,
      gridSize: _presetGrid,
      spacing: _presetSpacing,
      trapAnisotropy: _presetAniso,
      slicePositions: _presetSlice,
      ...safeOverrides
    } = preset.overrides
    const merged = {
      ...DEFAULT_BEC_CONFIG,
      ...safeOverrides,
      slicePositions: config.slicePositions,
      needsReset: true,
    }
    const resized = resizeBecArrays(merged, dimension)
    const expected = { ...merged, ...resized, needsReset: true }
    if (becConfigMatches(config, expected)) return preset.id
  }
  return null
}

/** Find the Pauli preset id that matches the live Pauli config, or null. */
export function findPauliPresetId(config: PauliConfig): string | null {
  return findScenarioPresetId(config, PAULI_SCENARIO_PRESETS)
}

/** Find the Bell-pair preset id that matches the live BellPair config, or null. */
export function findBellPresetId(config: BellPairConfig): string | null {
  return findScenarioPresetId(config, BELL_SCENARIO_PRESETS)
}

/**
 * Resolve the active scenario preset id for a Schrödinger quantum mode by
 * dispatching to the per-mode matcher. Returns null if no preset matches.
 */
export function findActiveScenarioPresetId(
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
      return findBecPresetId(schroedinger.bec, dimension)
    case 'diracEquation':
      return findScenarioPresetId(schroedinger.dirac, DIRAC_SCENARIO_PRESETS)
    case 'freeScalarField':
      return findMostSpecificScenarioPresetId(
        schroedinger.freeScalar as FreeScalarConfig,
        FREE_SCALAR_PRESETS
      )
    case 'quantumWalk':
      return findScenarioPresetId(schroedinger.quantumWalk, QUANTUM_WALK_PRESETS)
    case 'wheelerDeWitt':
      return findScenarioPresetId(schroedinger.wheelerDeWitt, WDW_SCENARIO_PRESETS)
    default:
      return null
  }
}
