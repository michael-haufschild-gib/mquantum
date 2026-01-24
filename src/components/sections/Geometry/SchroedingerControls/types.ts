/**
 * Shared types for SchroedingerControls components
 */

import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import type { ExtendedObjectState } from '@/stores/extendedObjectStore'

/**
 * Common actions shared across all physics mode components
 */
export interface SchroedingerCommonActions {
  setScale: ExtendedObjectState['setSchroedingerScale']
}

/**
 * Actions for Harmonic Oscillator mode
 */
export interface HarmonicOscillatorActions {
  setPresetName: ExtendedObjectState['setSchroedingerPresetName']
  setSeed: ExtendedObjectState['setSchroedingerSeed']
  randomizeSeed: ExtendedObjectState['randomizeSchroedingerSeed']
  setTermCount: ExtendedObjectState['setSchroedingerTermCount']
  setMaxQuantumNumber: ExtendedObjectState['setSchroedingerMaxQuantumNumber']
  setFrequencySpread: ExtendedObjectState['setSchroedingerFrequencySpread']
  setFieldScale: ExtendedObjectState['setSchroedingerFieldScale']
  setSchroedingerParameterValue: ExtendedObjectState['setSchroedingerParameterValue']
  resetSchroedingerParameters: ExtendedObjectState['resetSchroedingerParameters']
}

/**
 * Actions for Hydrogen Orbital mode (3D)
 */
export interface HydrogenOrbitalActions {
  setHydrogenPreset: ExtendedObjectState['setSchroedingerHydrogenPreset']
  setPrincipalQuantumNumber: ExtendedObjectState['setSchroedingerPrincipalQuantumNumber']
  setAzimuthalQuantumNumber: ExtendedObjectState['setSchroedingerAzimuthalQuantumNumber']
  setMagneticQuantumNumber: ExtendedObjectState['setSchroedingerMagneticQuantumNumber']
  setUseRealOrbitals: ExtendedObjectState['setSchroedingerUseRealOrbitals']
  setBohrRadiusScale: ExtendedObjectState['setSchroedingerBohrRadiusScale']
}

/**
 * Actions for Hydrogen ND mode
 */
export interface HydrogenNDActions extends HydrogenOrbitalActions {
  setHydrogenNDPreset: ExtendedObjectState['setSchroedingerHydrogenNDPreset']
  setExtraDimQuantumNumber: ExtendedObjectState['setSchroedingerExtraDimQuantumNumber']
  setExtraDimFrequencySpread: ExtendedObjectState['setSchroedingerExtraDimFrequencySpread']
}

/**
 * Props for Harmonic Oscillator Controls
 */
export interface HarmonicOscillatorControlsProps {
  config: SchroedingerConfig
  dimension: number
  actions: HarmonicOscillatorActions
}

/**
 * Props for Hydrogen Orbital Controls (3D)
 */
export interface HydrogenOrbitalControlsProps {
  config: SchroedingerConfig
  actions: HydrogenOrbitalActions
}

/**
 * Props for Hydrogen ND Controls
 */
export interface HydrogenNDControlsProps {
  config: SchroedingerConfig
  dimension: number
  actions: HydrogenNDActions
}
