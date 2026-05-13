/**
 * BEC setter public types and runtime enum guards.
 *
 * @module stores/slices/geometry/setters/becSetterDomain
 */

import type {
  BecFieldView,
  BecInitialCondition,
  TdseDisorderDistribution,
} from '@/lib/geometry/extended/types'
import type { SchroedingerPresetApplyOptions } from '@/stores/utils/dynamicPresetImport'

/** Actions exposed by the BEC (Gross-Pitaevskii) setter bundle. */
export interface BecSetters {
  setBecInteractionStrength: (g: number) => void
  setBecTrapOmega: (omega: number) => void
  setBecTrapAnisotropy: (dimIndex: number, ratio: number) => void
  setBecInitialCondition: (condition: BecInitialCondition) => void
  setBecFieldView: (view: BecFieldView) => void
  setBecVortexCharge: (charge: number) => void
  setBecVortexLatticeCount: (count: number) => void
  setBecVortexPlane1: (plane: [number, number]) => void
  setBecVortexPlane2: (plane: [number, number]) => void
  setBecVortexSeparation: (sep: number) => void
  setBecVortexPairCount: (count: number) => void
  setBecSolitonDepth: (depth: number) => void
  setBecSolitonVelocity: (velocity: number) => void
  setBecHawkingVmax: (v: number) => void
  setBecHawkingLh: (lh: number) => void
  setBecHawkingDeltaN: (dn: number) => void
  setBecHawkingPairInjection: (enabled: boolean) => void
  setBecHawkingInjectRate: (rate: number) => void
  setBecHawkingSeed: (seed: number) => void
  setBecDisorderStrength: (strength: number) => void
  setBecDisorderSeed: (seed: number) => void
  setBecDisorderDistribution: (distribution: TdseDisorderDistribution) => void
  setBecAutoScale: (autoScale: boolean) => void
  setBecAbsorberEnabled: (enabled: boolean) => void
  setBecAbsorberWidth: (width: number) => void
  setBecPmlTargetReflection: (r: number) => void
  setBecDiagnosticsEnabled: (enabled: boolean) => void
  setBecDiagnosticsInterval: (interval: number) => void
  setBecDt: (dt: number) => void
  setBecStepsPerFrame: (steps: number) => void
  setBecMass: (mass: number) => void
  setBecHbar: (hbar: number) => void
  setBecGridSize: (size: number[]) => void
  setBecSpacing: (spacing: number[]) => void
  setBecSlicePosition: (dimIndex: number, value: number) => void
  setBecCompactDim: (dimIndex: number, compact: boolean) => void
  setBecCompactRadius: (dimIndex: number, radius: number) => void
  applyBecPreset: (presetId: string, options?: SchroedingerPresetApplyOptions) => Promise<void>
  resetBecField: () => void
}

const BEC_INITIAL_CONDITIONS: ReadonlySet<BecInitialCondition> = new Set([
  'thomasFermi',
  'gaussianPacket',
  'vortexImprint',
  'vortexLattice',
  'darkSoliton',
  'vortexReconnection',
  'blackHoleAnalog',
])

const BEC_FIELD_VIEWS: ReadonlySet<BecFieldView> = new Set([
  'density',
  'phase',
  'current',
  'potential',
  'superfluidVelocity',
  'healingLength',
  'machNumber',
  'hawkingFlux',
  'vorticity',
])

const BEC_DISORDER_DISTRIBUTIONS: ReadonlySet<TdseDisorderDistribution> = new Set([
  'uniform',
  'gaussian',
])

/** Returns true when a runtime value is a supported BEC initial condition. */
export function isBecInitialCondition(value: BecInitialCondition): boolean {
  return BEC_INITIAL_CONDITIONS.has(value)
}

/** Returns true when a runtime value is a supported BEC field view. */
export function isBecFieldView(value: BecFieldView): boolean {
  return BEC_FIELD_VIEWS.has(value)
}

/** Returns true when a runtime value is a supported BEC disorder distribution. */
export function isBecDisorderDistribution(value: TdseDisorderDistribution): boolean {
  return BEC_DISORDER_DISTRIBUTIONS.has(value)
}
