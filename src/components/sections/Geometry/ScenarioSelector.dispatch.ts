/**
 * Scenario-change dispatch for ScenarioSelector.
 *
 * Extracted from ScenarioSelector.tsx to keep the React component file under
 * the 500-line lint limit and the change handler under the cognitive-complexity
 * budget. Maps the active mode + chosen preset id to the correct store action.
 *
 * @module components/sections/Geometry/ScenarioSelector.dispatch
 */

import { PAULI_FIELD_VIEW_TO_COLOR_ALGO } from '@/lib/colors/palette/types'
import type { AdsPresetName } from '@/lib/geometry/extended/antiDeSitter'
import type { BellPairConfig } from '@/lib/geometry/extended/bellPair'
import type { BifurcationHorizonPresetName } from '@/lib/geometry/extended/bifurcationHorizon'
import type { CoherenceHorizonPresetName } from '@/lib/geometry/extended/coherenceHorizon'
import type { SchroedingerPresetName } from '@/lib/geometry/extended/common'
import type { HilbertPolyaPresetName } from '@/lib/geometry/extended/hilbertPolya'
import type { ModularKnotPresetName } from '@/lib/geometry/extended/modularKnot'
import type { PauliConfig } from '@/lib/geometry/extended/pauli'
import type { RiemannZetaPresetName } from '@/lib/geometry/extended/riemannZeta'
import type { HydrogenNDPresetName, SchroedingerConfig } from '@/lib/geometry/extended/schroedinger'
import { isWdwZetaMode, type WdwZetaModeKey } from '@/lib/geometry/extended/wdwZeta/shared'
import { ADS_PRESETS } from '@/lib/physics/antiDeSitter/presets'
import { BELL_SCENARIO_PRESETS } from '@/lib/physics/bell/presets'
import { HYDROGEN_COUPLED_PRESETS } from '@/lib/physics/hydrogenCoupled/presets'
import { PAULI_SCENARIO_PRESETS } from '@/lib/physics/pauli/presets'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import type { SchroedingerPresetApplyOptions } from '@/stores/utils/dynamicPresetImport'

/** Async preset-apply action signature shared by the compute modes. */
type ApplyPresetAction = (id: string, opts?: SchroedingerPresetApplyOptions) => Promise<void>

/** Store action bundle the scenario dispatch needs (stable selector references). */
export interface ScenarioDispatchActions {
  setPresetName: (name: SchroedingerPresetName) => void
  setHydrogenNDPreset: (name: HydrogenNDPresetName) => void
  setSchroedingerConfig: (config: Partial<SchroedingerConfig>) => void
  applyTdsePreset: ApplyPresetAction
  applyBecPreset: ApplyPresetAction
  applyDiracPreset: ApplyPresetAction
  applyFreeScalarPreset: ApplyPresetAction
  applyQuantumWalkPreset: ApplyPresetAction
  applyWheelerDeWittPreset: ApplyPresetAction
  setPauliConfig: (config: Partial<PauliConfig>) => void
  setAdsPreset: (name: AdsPresetName) => void
  setCoherenceHorizonPreset: (name: CoherenceHorizonPresetName) => void
  setRiemannZetaPreset: (name: RiemannZetaPresetName) => void
  setHilbertPolyaPreset: (name: HilbertPolyaPresetName) => void
  setBifurcationHorizonPreset: (name: BifurcationHorizonPresetName) => void
  setModularKnotPreset: (name: ModularKnotPresetName) => void
  setWdwZetaPreset: (mode: WdwZetaModeKey, name: string) => void
  setBellPairConfig: (config: Partial<BellPairConfig>) => void
}

/** Modes whose preset selection is a single tagged-preset setter call. */
type TaggedPresetMode =
  | 'antiDeSitter'
  | 'coherenceHorizon'
  | 'riemannZeta'
  | 'hilbertPolya'
  | 'bifurcationHorizon'
  | 'modularKnot'

/** Apply a Pauli preset by ID, setting config and color algorithm. */
function applyPauliPresetById(presetId: string, a: ScenarioDispatchActions): void {
  const preset = PAULI_SCENARIO_PRESETS.find((p) => p.id === presetId)
  if (!preset) return
  a.setPauliConfig({ ...preset.overrides, needsReset: true })
  const algo = preset.overrides.fieldView
    ? PAULI_FIELD_VIEW_TO_COLOR_ALGO[preset.overrides.fieldView]
    : undefined
  if (algo) useAppearanceStore.getState().setColorAlgorithm(algo)
}

/** Apply the tagged-preset setter for a horizon-family / AdS mode. */
function dispatchTaggedPreset(
  mode: TaggedPresetMode,
  value: string,
  a: ScenarioDispatchActions
): void {
  switch (mode) {
    case 'antiDeSitter': {
      a.setAdsPreset(value as AdsPresetName)
      const preset = ADS_PRESETS.find((p) => p.id === value)
      if (preset?.colorAlgorithm) {
        useAppearanceStore.getState().setColorAlgorithm(preset.colorAlgorithm)
      }
      break
    }
    case 'coherenceHorizon':
      a.setCoherenceHorizonPreset(value as CoherenceHorizonPresetName)
      break
    case 'riemannZeta':
      a.setRiemannZetaPreset(value as RiemannZetaPresetName)
      break
    case 'hilbertPolya':
      a.setHilbertPolyaPreset(value as HilbertPolyaPresetName)
      break
    case 'bifurcationHorizon':
      a.setBifurcationHorizonPreset(value as BifurcationHorizonPresetName)
      break
    case 'modularKnot':
      a.setModularKnotPreset(value as ModularKnotPresetName)
      break
  }
}

/** Async compute-mode apply actions keyed by mode. */
const COMPUTE_APPLY: Record<string, keyof ScenarioDispatchActions> = {
  tdseDynamics: 'applyTdsePreset',
  becDynamics: 'applyBecPreset',
  diracEquation: 'applyDiracPreset',
  freeScalarField: 'applyFreeScalarPreset',
  quantumWalk: 'applyQuantumWalkPreset',
  wheelerDeWitt: 'applyWheelerDeWittPreset',
}

const TAGGED_PRESET_MODES = new Set<string>([
  'antiDeSitter',
  'coherenceHorizon',
  'riemannZeta',
  'hilbertPolya',
  'bifurcationHorizon',
  'modularKnot',
])

/**
 * Dispatch a scenario-preset change to the correct store action for `mode`.
 *
 * @param mode - The active scenario mode key (quantum mode or object type)
 * @param value - The chosen preset id (already guarded non-empty by the caller)
 * @param a - The store action bundle
 */
export function dispatchScenarioChange(
  mode: string,
  value: string,
  a: ScenarioDispatchActions
): void {
  if (isWdwZetaMode(mode)) {
    a.setWdwZetaPreset(mode, value)
    return
  }
  if (TAGGED_PRESET_MODES.has(mode)) {
    dispatchTaggedPreset(mode as TaggedPresetMode, value, a)
    return
  }
  const computeAction = COMPUTE_APPLY[mode]
  if (computeAction) {
    void (a[computeAction] as ApplyPresetAction)(value, {
      expectedQuantumMode: mode as SchroedingerConfig['quantumMode'],
    })
    return
  }
  switch (mode) {
    case 'harmonicOscillator':
      a.setPresetName(value as SchroedingerPresetName)
      break
    case 'hydrogenND':
      a.setHydrogenNDPreset(value as HydrogenNDPresetName)
      break
    case 'hydrogenNDCoupled': {
      const preset = HYDROGEN_COUPLED_PRESETS.find((p) => p.id === value)
      if (preset) a.setSchroedingerConfig(preset.overrides)
      break
    }
    case 'pauliSpinor':
      applyPauliPresetById(value, a)
      break
    case 'bellPair': {
      const preset = BELL_SCENARIO_PRESETS.find((p) => p.id === value)
      if (preset) a.setBellPairConfig({ ...preset.overrides, needsReset: true })
      break
    }
  }
}
