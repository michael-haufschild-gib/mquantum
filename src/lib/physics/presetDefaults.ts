/**
 * Default preset resolution for all quantum modes.
 *
 * When switching quantum mode, the first dimension-compatible scenario
 * preset is auto-applied instead of using a hardcoded default config.
 *
 * Each mode declares its own one-line resolver in {@link PRESET_RESOLVERS};
 * dispatch is a single map lookup keyed by {@link QuantumTypeKey}.
 *
 * @module lib/physics/presetDefaults
 */

import { getHydrogenNDPresetsWithKeysByDimension } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import type { QuantumTypeKey } from '@/lib/geometry/registry'

import { ADS_PRESETS } from './antiDeSitter/presets'
import { BEC_SCENARIO_PRESETS } from './bec/presets'
import { DIRAC_SCENARIO_PRESETS } from './dirac/presets'
import { FREE_SCALAR_PRESETS } from './freeScalar/presets'
import { HYDROGEN_COUPLED_PRESETS } from './hydrogenCoupled/presets'
import { PAULI_SCENARIO_PRESETS } from './pauli/presets'
import { QUANTUM_WALK_PRESETS } from './quantumWalk/presets'
import { TDSE_SCENARIO_PRESETS } from './tdse/presets'
import { WDW_SCENARIO_PRESETS } from './wheelerDeWitt/presets'

type FirstPresetResolver = (dimension: number) => string | undefined

/**
 * The hydrogen-ND resolver picks the highest dimension group ≤ current
 * dimension and returns that group's ground-state preset key.
 */
function resolveHydrogenND(dimension: number): string | undefined {
  const groups = getHydrogenNDPresetsWithKeysByDimension()
  const bestDim = Object.keys(groups)
    .map(Number)
    .filter((d) => d <= dimension)
    .sort((a, b) => b - a)[0]
  if (bestDim === undefined) return undefined
  return groups[bestDim]?.[0]?.[0]
}

/**
 * Per-mode resolvers. Each one is the dimension-filter idiom for that mode's
 * preset catalog — most are one line. Adding a new mode means adding one
 * entry here and importing its preset array above.
 */
const PRESET_RESOLVERS: Readonly<Record<QuantumTypeKey, FirstPresetResolver>> = {
  harmonicOscillator: () => 'groundState',
  hydrogenND: resolveHydrogenND,
  hydrogenNDCoupled: (d) => HYDROGEN_COUPLED_PRESETS.find((p) => p.minDim <= d)?.id,
  tdseDynamics: (d) =>
    TDSE_SCENARIO_PRESETS.find((p) => {
      const min = p.overrides.latticeDim
      return min === undefined || min <= d
    })?.id,
  becDynamics: (d) => BEC_SCENARIO_PRESETS.find((p) => (p.minDim ?? 2) <= d)?.id,
  diracEquation: () => DIRAC_SCENARIO_PRESETS[0]?.id,
  freeScalarField: () => FREE_SCALAR_PRESETS[0]?.id,
  quantumWalk: () => QUANTUM_WALK_PRESETS[0]?.id,
  pauliSpinor: () => PAULI_SCENARIO_PRESETS[0]?.id,
  wheelerDeWitt: () => WDW_SCENARIO_PRESETS[0]?.id,
  antiDeSitter: (d) => (ADS_PRESETS.find((p) => p.d <= d) ?? ADS_PRESETS[0])?.id,
}

/**
 * Returns the first dimension-compatible preset ID for a given quantum mode,
 * or undefined if no compatible preset exists for the requested dimension.
 */
export function getFirstPresetId(mode: QuantumTypeKey, dimension: number): string | undefined {
  return PRESET_RESOLVERS[mode]?.(dimension)
}
