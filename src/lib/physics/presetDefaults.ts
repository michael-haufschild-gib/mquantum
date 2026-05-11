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
 * First compatible preset IDs for modes whose first-preset choice is stable.
 *
 * Keep this resolver lightweight: importing every full preset catalogue here
 * pulls all mode-specific physics preset data into the initial `physics`
 * chunk even though preset application already lazy-loads those modules.
 */
const FIRST_PRESET_IDS = {
  harmonicOscillator: 'groundState',
  hydrogenNDCoupled: '1s_ground',
  tdseDynamics: 'classicTunneling',
  becDynamics: 'groundState',
  diracEquation: 'kleinParadox',
  freeScalarField: 'gaussianPacket',
  quantumWalk: 'groverSearch',
  pauliSpinor: 'larmorPrecession',
  wheelerDeWitt: 'noBoundaryBaseline',
  antiDeSitterDefault: 'adsFourGround',
  antiDeSitter3D: 'adsThreeGround',
} as const

function resolveHydrogenCoupled(dimension: number): string | undefined {
  return dimension >= 2 ? FIRST_PRESET_IDS.hydrogenNDCoupled : undefined
}

function resolveTdse(dimension: number): string | undefined {
  return dimension >= 3 ? FIRST_PRESET_IDS.tdseDynamics : undefined
}

function resolveBec(dimension: number): string | undefined {
  return dimension >= 2 ? FIRST_PRESET_IDS.becDynamics : undefined
}

function resolveAntiDeSitter(dimension: number): string {
  if (dimension === 3) return FIRST_PRESET_IDS.antiDeSitter3D
  return FIRST_PRESET_IDS.antiDeSitterDefault
}

/**
 * Per-mode resolvers. Each one is the dimension-filter idiom for that mode's
 * preset catalog. Adding a new mode means adding one lightweight resolver
 * here; avoid importing full preset arrays into this file.
 */
const PRESET_RESOLVERS: Readonly<Record<QuantumTypeKey, FirstPresetResolver>> = {
  harmonicOscillator: () => FIRST_PRESET_IDS.harmonicOscillator,
  hydrogenND: resolveHydrogenND,
  hydrogenNDCoupled: resolveHydrogenCoupled,
  tdseDynamics: resolveTdse,
  becDynamics: resolveBec,
  diracEquation: () => FIRST_PRESET_IDS.diracEquation,
  freeScalarField: () => FIRST_PRESET_IDS.freeScalarField,
  quantumWalk: () => FIRST_PRESET_IDS.quantumWalk,
  pauliSpinor: () => FIRST_PRESET_IDS.pauliSpinor,
  wheelerDeWitt: () => FIRST_PRESET_IDS.wheelerDeWitt,
  antiDeSitter: resolveAntiDeSitter,
}

/**
 * Returns the first dimension-compatible preset ID for a given quantum mode,
 * or undefined if no compatible preset exists for the requested dimension.
 */
export function getFirstPresetId(mode: QuantumTypeKey, dimension: number): string | undefined {
  return PRESET_RESOLVERS[mode]?.(dimension)
}
