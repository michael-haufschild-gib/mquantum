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
 * Actions for Hydrogen ND mode
 */
export interface HydrogenNDActions {
  setPrincipalQuantumNumber: ExtendedObjectState['setSchroedingerPrincipalQuantumNumber']
  setAzimuthalQuantumNumber: ExtendedObjectState['setSchroedingerAzimuthalQuantumNumber']
  setMagneticQuantumNumber: ExtendedObjectState['setSchroedingerMagneticQuantumNumber']
  setUseRealOrbitals: ExtendedObjectState['setSchroedingerUseRealOrbitals']
  setBohrRadiusScale: ExtendedObjectState['setSchroedingerBohrRadiusScale']
  setHydrogenNDPreset: ExtendedObjectState['setSchroedingerHydrogenNDPreset']
  setExtraDimQuantumNumber: ExtendedObjectState['setSchroedingerExtraDimQuantumNumber']
  setExtraDimFrequencySpread: ExtendedObjectState['setSchroedingerExtraDimFrequencySpread']
}

/**
 * Actions for Wigner phase-space controls
 */
export interface WignerActions {
  setDimensionIndex: ExtendedObjectState['setSchroedingerWignerDimensionIndex']
  setAutoRange: ExtendedObjectState['setSchroedingerWignerAutoRange']
  setXRange: ExtendedObjectState['setSchroedingerWignerXRange']
  setPRange: ExtendedObjectState['setSchroedingerWignerPRange']
  setCrossTermsEnabled: ExtendedObjectState['setSchroedingerWignerCrossTermsEnabled']
  setQuadPoints: ExtendedObjectState['setSchroedingerWignerQuadPoints']
  setClassicalOverlay: ExtendedObjectState['setSchroedingerWignerClassicalOverlay']
  setCacheResolution: ExtendedObjectState['setSchroedingerWignerCacheResolution']
}

/**
 * Actions for Second Quantization Educational Layer
 */
export interface SecondQuantizationActions {
  setEnabled: ExtendedObjectState['setSchroedingerSqLayerEnabled']
  setMode: ExtendedObjectState['setSchroedingerSqLayerMode']
  setSelectedModeIndex: ExtendedObjectState['setSchroedingerSqLayerSelectedModeIndex']
  setFockQuantumNumber: ExtendedObjectState['setSchroedingerSqLayerFockQuantumNumber']
  setShowOccupation: ExtendedObjectState['setSchroedingerSqLayerShowOccupation']
  setShowUncertainty: ExtendedObjectState['setSchroedingerSqLayerShowUncertainty']
  setCoherentAlphaRe: ExtendedObjectState['setSchroedingerSqLayerCoherentAlphaRe']
  setCoherentAlphaIm: ExtendedObjectState['setSchroedingerSqLayerCoherentAlphaIm']
  setSqueezeR: ExtendedObjectState['setSchroedingerSqLayerSqueezeR']
  setSqueezeTheta: ExtendedObjectState['setSchroedingerSqLayerSqueezeTheta']
}

/**
 * Props for Second Quantization Section
 */
export interface SecondQuantizationSectionProps {
  config: SchroedingerConfig
  dimension: number
  actions: SecondQuantizationActions
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
 * Props for Hydrogen ND Controls
 */
export interface HydrogenNDControlsProps {
  config: SchroedingerConfig
  dimension: number
  actions: HydrogenNDActions
}

/**
 * Props for Wigner Phase-Space Controls
 */
export interface WignerControlsProps {
  config: SchroedingerConfig
  dimension: number
  actions: WignerActions
}

/**
 * Actions for Free Scalar Field mode
 */
export interface FreeScalarFieldActions {
  setLatticeDim: ExtendedObjectState['setFreeScalarLatticeDim']
  setGridSize: ExtendedObjectState['setFreeScalarGridSize']
  setSpacing: ExtendedObjectState['setFreeScalarSpacing']
  setMass: ExtendedObjectState['setFreeScalarMass']
  setDt: ExtendedObjectState['setFreeScalarDt']
  setStepsPerFrame: ExtendedObjectState['setFreeScalarStepsPerFrame']
  setInitialCondition: ExtendedObjectState['setFreeScalarInitialCondition']
  setFieldView: ExtendedObjectState['setFreeScalarFieldView']
  setPacketCenter: ExtendedObjectState['setFreeScalarPacketCenter']
  setPacketWidth: ExtendedObjectState['setFreeScalarPacketWidth']
  setPacketAmplitude: ExtendedObjectState['setFreeScalarPacketAmplitude']
  setModeK: ExtendedObjectState['setFreeScalarModeK']
  setAutoScale: ExtendedObjectState['setFreeScalarAutoScale']
  setVacuumSeed: ExtendedObjectState['setFreeScalarVacuumSeed']
  setSlicePosition: ExtendedObjectState['setFreeScalarSlicePosition']
  resetField: ExtendedObjectState['resetFreeScalarField']
}

/**
 * Props for Free Scalar Field Controls
 */
export interface FreeScalarFieldControlsProps {
  config: SchroedingerConfig
  dimension: number
  actions: FreeScalarFieldActions
}

/**
 * Actions for TDSE Dynamics mode
 */
export interface TdseActions {
  setLatticeDim: ExtendedObjectState['setTdseLatticeDim']
  setGridSize: ExtendedObjectState['setTdseGridSize']
  setSpacing: ExtendedObjectState['setTdseSpacing']
  setMass: ExtendedObjectState['setTdseMass']
  setHbar: ExtendedObjectState['setTdseHbar']
  setDt: ExtendedObjectState['setTdseDt']
  setStepsPerFrame: ExtendedObjectState['setTdseStepsPerFrame']
  setInitialCondition: ExtendedObjectState['setTdseInitialCondition']
  setPacketCenter: ExtendedObjectState['setTdsePacketCenter']
  setPacketWidth: ExtendedObjectState['setTdsePacketWidth']
  setPacketAmplitude: ExtendedObjectState['setTdsePacketAmplitude']
  setPacketMomentum: ExtendedObjectState['setTdsePacketMomentum']
  setPotentialType: ExtendedObjectState['setTdsePotentialType']
  setBarrierHeight: ExtendedObjectState['setTdseBarrierHeight']
  setBarrierWidth: ExtendedObjectState['setTdseBarrierWidth']
  setBarrierCenter: ExtendedObjectState['setTdseBarrierCenter']
  setWellDepth: ExtendedObjectState['setTdseWellDepth']
  setWellWidth: ExtendedObjectState['setTdseWellWidth']
  setHarmonicOmega: ExtendedObjectState['setTdseHarmonicOmega']
  setStepHeight: ExtendedObjectState['setTdseStepHeight']
  setDriveEnabled: ExtendedObjectState['setTdseDriveEnabled']
  setDriveWaveform: ExtendedObjectState['setTdseDriveWaveform']
  setDriveFrequency: ExtendedObjectState['setTdseDriveFrequency']
  setDriveAmplitude: ExtendedObjectState['setTdseDriveAmplitude']
  setAbsorberEnabled: ExtendedObjectState['setTdseAbsorberEnabled']
  setAbsorberWidth: ExtendedObjectState['setTdseAbsorberWidth']
  setAbsorberStrength: ExtendedObjectState['setTdseAbsorberStrength']
  setFieldView: ExtendedObjectState['setTdseFieldView']
  setAutoScale: ExtendedObjectState['setTdseAutoScale']
  setDiagnosticsEnabled: ExtendedObjectState['setTdseDiagnosticsEnabled']
  setDiagnosticsInterval: ExtendedObjectState['setTdseDiagnosticsInterval']
  setSlicePosition: ExtendedObjectState['setTdseSlicePosition']
  resetField: ExtendedObjectState['resetTdseField']
}

/**
 * Props for TDSE Controls
 */
export interface TdseControlsProps {
  config: SchroedingerConfig
  dimension: number
  actions: TdseActions
}
