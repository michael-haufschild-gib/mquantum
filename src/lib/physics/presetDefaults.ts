/**
 * Default preset resolution for all quantum modes.
 *
 * When switching quantum mode, the first dimension-compatible scenario
 * preset is auto-applied instead of using a hardcoded default config.
 * This module provides the lookup logic for every mode.
 *
 * @module lib/physics/presetDefaults
 */

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'
import { getHydrogenNDPresetsWithKeysByDimension } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'

import { BEC_SCENARIO_PRESETS } from './bec/presets'
import { DIRAC_SCENARIO_PRESETS } from './dirac/presets'
import { FREE_SCALAR_PRESETS } from './freeScalar/presets'
import { HYDROGEN_COUPLED_PRESETS } from './hydrogenCoupled/presets'
import { PAULI_SCENARIO_PRESETS } from './pauli/presets'
import { QUANTUM_WALK_PRESETS } from './quantumWalk/presets'
import { TDSE_SCENARIO_PRESETS } from './tdse/presets'

/**
 * Returns the first dimension-compatible preset ID for a given quantum mode.
 *
 * Each mode has its own dimension-filtering logic:
 * - TDSE: `latticeDim` in overrides must be ≤ current dimension
 * - BEC: `minDim` (default 2) must be ≤ current dimension
 * - HydrogenND Coupled: `minDim` must be ≤ current dimension
 * - All others: presets are dimension-agnostic (first preset always works)
 *
 * @returns Preset ID string, or undefined if no compatible preset exists
 */
export function getFirstPresetId(
  mode: SchroedingerQuantumMode | 'pauliSpinor',
  dimension: number
): string | undefined {
  switch (mode) {
    case 'harmonicOscillator':
      // HO named presets are dimension-agnostic — first key
      return 'groundState'

    case 'hydrogenND': {
      // HydrogenND presets are dimension-grouped; pick the ground state for the current dim.
      const groups = getHydrogenNDPresetsWithKeysByDimension()
      // Find the highest dimension group ≤ current dimension and return its first preset.
      const matchingDims = Object.keys(groups)
        .map(Number)
        .filter((d) => d <= dimension)
        .sort((a, b) => b - a)
      if (matchingDims.length > 0) {
        const presets = groups[matchingDims[0]]
        if (presets && presets.length > 0) return presets[0][0]
      }
      return undefined
    }

    case 'hydrogenNDCoupled': {
      const preset = HYDROGEN_COUPLED_PRESETS.find((p) => p.minDim <= dimension)
      return preset?.id
    }

    case 'tdseDynamics': {
      const preset = TDSE_SCENARIO_PRESETS.find((p) => {
        const presetDim = p.overrides.latticeDim
        return presetDim === undefined || presetDim <= dimension
      })
      return preset?.id
    }

    case 'becDynamics': {
      const preset = BEC_SCENARIO_PRESETS.find((p) => (p.minDim ?? 2) <= dimension)
      return preset?.id
    }

    case 'diracEquation':
      return DIRAC_SCENARIO_PRESETS[0]?.id

    case 'freeScalarField':
      return FREE_SCALAR_PRESETS[0]?.id

    case 'quantumWalk':
      return QUANTUM_WALK_PRESETS[0]?.id

    case 'pauliSpinor':
      return PAULI_SCENARIO_PRESETS[0]?.id

    default:
      return undefined
  }
}
