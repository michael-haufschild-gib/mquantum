/**
 * Shared types for SchroedingerControls components
 */

import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import type { ExtendedObjectState } from '@/stores/scene/extendedObjectStore'

/**
 * Shared shape for every per-mode controls component in the
 * Schroedinger panel: current config, current simulation dimension, and
 * the mode-specific `actions` surface. Each mode's `XControlsProps` is a
 * thin type alias over this generic — the only thing that varies between
 * modes is which `Actions` interface is wired in.
 *
 * Keeping the shape in one place prevents drift (e.g. a future field
 * like `quantumMode` only needs to be added here, not in nine siblings)
 * and makes the component-family contract explicit.
 */
export interface SchroedingerModeControlsProps<A> {
  config: SchroedingerConfig
  dimension: number
  actions: A
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
 * Actions for Hydrogen ND Coupled mode (true D-dimensional Coulomb problem)
 */
export interface HydrogenNDCoupledActions {
  setPrincipalQuantumNumber: ExtendedObjectState['setSchroedingerPrincipalQuantumNumber']
  setAzimuthalQuantumNumber: ExtendedObjectState['setSchroedingerAzimuthalQuantumNumber']
  setMagneticQuantumNumber: ExtendedObjectState['setSchroedingerMagneticQuantumNumber']
  setUseRealOrbitals: ExtendedObjectState['setSchroedingerUseRealOrbitals']
  setBohrRadiusScale: ExtendedObjectState['setSchroedingerBohrRadiusScale']
  setAngularChainValue: ExtendedObjectState['setSchroedingerAngularChainValue']
}

/**
 * Props for Hydrogen ND Coupled Controls
 */
export type HydrogenNDCoupledControlsProps = SchroedingerModeControlsProps<HydrogenNDCoupledActions>

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
export type SecondQuantizationSectionProps =
  SchroedingerModeControlsProps<SecondQuantizationActions>

/**
 * Props for Harmonic Oscillator Controls
 */
export type HarmonicOscillatorControlsProps =
  SchroedingerModeControlsProps<HarmonicOscillatorActions>

/**
 * Props for Hydrogen ND Controls
 */
export type HydrogenNDControlsProps = SchroedingerModeControlsProps<HydrogenNDActions>

/**
 * Props for Wigner Phase-Space Controls
 */
export type WignerControlsProps = SchroedingerModeControlsProps<WignerActions>

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
  setSelfInteractionEnabled: ExtendedObjectState['setFreeScalarSelfInteractionEnabled']
  setSelfInteractionLambda: ExtendedObjectState['setFreeScalarSelfInteractionLambda']
  setSelfInteractionVev: ExtendedObjectState['setFreeScalarSelfInteractionVev']
  setCosmologyEnabled: ExtendedObjectState['setFreeScalarCosmologyEnabled']
  setCosmologyPreset: ExtendedObjectState['setFreeScalarCosmologyPreset']
  setCosmologySteepness: ExtendedObjectState['setFreeScalarCosmologySteepness']
  setCosmologyHubble: ExtendedObjectState['setFreeScalarCosmologyHubble']
  setCosmologyEta0: ExtendedObjectState['setFreeScalarCosmologyEta0']
  setCosmologyBianchiExponents: ExtendedObjectState['setFreeScalarCosmologyBianchiExponents']
  setCosmologyLqcRhoCritical: ExtendedObjectState['setFreeScalarCosmologyLqcRhoCritical']
  setCosmologyLqcEquationOfState: ExtendedObjectState['setFreeScalarCosmologyLqcEquationOfState']
  setCosmologyLqcInitialRhoRatio: ExtendedObjectState['setFreeScalarCosmologyLqcInitialRhoRatio']
  setPreheatingEnabled: ExtendedObjectState['setFreeScalarPreheatingEnabled']
  setPreheatingAmplitude: ExtendedObjectState['setFreeScalarPreheatingAmplitude']
  setPreheatingFrequency: ExtendedObjectState['setFreeScalarPreheatingFrequency']
}

/**
 * Props for Free Scalar Field Controls
 */
export type FreeScalarFieldControlsProps = SchroedingerModeControlsProps<FreeScalarFieldActions>

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
  setSlitSeparation: ExtendedObjectState['setTdseSlitSeparation']
  setSlitWidth: ExtendedObjectState['setTdseSlitWidth']
  setWallThickness: ExtendedObjectState['setTdseWallThickness']
  setWallHeight: ExtendedObjectState['setTdseWallHeight']
  setLatticeDepth: ExtendedObjectState['setTdseLatticeDepth']
  setLatticePeriod: ExtendedObjectState['setTdseLatticePeriod']
  setDoubleWellLambda: ExtendedObjectState['setTdseDoubleWellLambda']
  setDoubleWellSeparation: ExtendedObjectState['setTdseDoubleWellSeparation']
  setDoubleWellAsymmetry: ExtendedObjectState['setTdseDoubleWellAsymmetry']
  setRadialWellInner: ExtendedObjectState['setTdseRadialWellInner']
  setRadialWellOuter: ExtendedObjectState['setTdseRadialWellOuter']
  setRadialWellDepth: ExtendedObjectState['setTdseRadialWellDepth']
  setRadialWellTilt: ExtendedObjectState['setTdseRadialWellTilt']
  setAnharmonicLambda: ExtendedObjectState['setTdseAnharmonicLambda']
  setBhMass: ExtendedObjectState['setTdseBhMass']
  setBhMultipoleL: ExtendedObjectState['setTdseBhMultipoleL']
  setBhSpin: ExtendedObjectState['setTdseBhSpin']
  setDisorderStrength: ExtendedObjectState['setTdseDisorderStrength']
  setDisorderSeed: ExtendedObjectState['setTdseDisorderSeed']
  setDriveEnabled: ExtendedObjectState['setTdseDriveEnabled']
  setDriveWaveform: ExtendedObjectState['setTdseDriveWaveform']
  setDriveFrequency: ExtendedObjectState['setTdseDriveFrequency']
  setDriveAmplitude: ExtendedObjectState['setTdseDriveAmplitude']
  setDisorderDistribution: ExtendedObjectState['setTdseDisorderDistribution']
  setFieldView: ExtendedObjectState['setTdseFieldView']
  setAutoScale: ExtendedObjectState['setTdseAutoScale']
  setShowPotential: ExtendedObjectState['setTdseShowPotential']
  setDiagnosticsEnabled: ExtendedObjectState['setTdseDiagnosticsEnabled']
  setDiagnosticsInterval: ExtendedObjectState['setTdseDiagnosticsInterval']
  setSlicePosition: ExtendedObjectState['setTdseSlicePosition']
  setCustomPotentialExpression: ExtendedObjectState['setTdseCustomPotentialExpression']
  setImaginaryTimeEnabled: ExtendedObjectState['setTdseImaginaryTimeEnabled']
  applyPreset: ExtendedObjectState['applyTdsePreset']
  resetField: ExtendedObjectState['resetTdseField']
}

/**
 * Props for TDSE Controls
 */
export type TdseControlsProps = SchroedingerModeControlsProps<TdseActions>

/**
 * Actions interface for BEC controls (maps store setters to shorter names)
 */
export interface BecActions {
  setInteractionStrength: ExtendedObjectState['setBecInteractionStrength']
  setTrapOmega: ExtendedObjectState['setBecTrapOmega']
  setTrapAnisotropy: ExtendedObjectState['setBecTrapAnisotropy']
  setInitialCondition: ExtendedObjectState['setBecInitialCondition']
  setFieldView: ExtendedObjectState['setBecFieldView']
  setVortexCharge: ExtendedObjectState['setBecVortexCharge']
  setVortexLatticeCount: ExtendedObjectState['setBecVortexLatticeCount']
  setVortexPlane1: ExtendedObjectState['setBecVortexPlane1']
  setVortexPlane2: ExtendedObjectState['setBecVortexPlane2']
  setVortexSeparation: ExtendedObjectState['setBecVortexSeparation']
  setVortexPairCount: ExtendedObjectState['setBecVortexPairCount']
  setSolitonDepth: ExtendedObjectState['setBecSolitonDepth']
  setSolitonVelocity: ExtendedObjectState['setBecSolitonVelocity']
  setHawkingVmax: ExtendedObjectState['setBecHawkingVmax']
  setHawkingLh: ExtendedObjectState['setBecHawkingLh']
  setHawkingDeltaN: ExtendedObjectState['setBecHawkingDeltaN']
  setHawkingPairInjection: ExtendedObjectState['setBecHawkingPairInjection']
  setHawkingInjectRate: ExtendedObjectState['setBecHawkingInjectRate']
  setHawkingSeed: ExtendedObjectState['setBecHawkingSeed']
  setDisorderStrength: ExtendedObjectState['setBecDisorderStrength']
  setDisorderSeed: ExtendedObjectState['setBecDisorderSeed']
  setDisorderDistribution: ExtendedObjectState['setBecDisorderDistribution']
  setAutoScale: ExtendedObjectState['setBecAutoScale']
  setDiagnosticsEnabled: ExtendedObjectState['setBecDiagnosticsEnabled']
  setDiagnosticsInterval: ExtendedObjectState['setBecDiagnosticsInterval']
  setDt: ExtendedObjectState['setBecDt']
  setStepsPerFrame: ExtendedObjectState['setBecStepsPerFrame']
  setMass: ExtendedObjectState['setBecMass']
  setHbar: ExtendedObjectState['setBecHbar']
  setGridSize: ExtendedObjectState['setBecGridSize']
  setSpacing: ExtendedObjectState['setBecSpacing']
  setSlicePosition: ExtendedObjectState['setBecSlicePosition']
  applyPreset: ExtendedObjectState['applyBecPreset']
  resetField: ExtendedObjectState['resetBecField']
}

/**
 * Props for BEC Controls
 */
export type BecControlsProps = SchroedingerModeControlsProps<BecActions>

/**
 * Actions interface for Dirac controls
 */
export interface DiracActions {
  setInitialCondition: ExtendedObjectState['setDiracInitialCondition']
  setFieldView: ExtendedObjectState['setDiracFieldView']
  setPotentialType: ExtendedObjectState['setDiracPotentialType']
  setPotentialStrength: ExtendedObjectState['setDiracPotentialStrength']
  setPotentialWidth: ExtendedObjectState['setDiracPotentialWidth']
  setPotentialCenter: ExtendedObjectState['setDiracPotentialCenter']
  setHarmonicOmega: ExtendedObjectState['setDiracHarmonicOmega']
  setCoulombZ: ExtendedObjectState['setDiracCoulombZ']
  setMass: ExtendedObjectState['setDiracMass']
  setSpeedOfLight: ExtendedObjectState['setDiracSpeedOfLight']
  setHbar: ExtendedObjectState['setDiracHbar']
  setDt: ExtendedObjectState['setDiracDt']
  setStepsPerFrame: ExtendedObjectState['setDiracStepsPerFrame']
  setGridSize: ExtendedObjectState['setDiracGridSize']
  setSpacing: ExtendedObjectState['setDiracSpacing']
  setPacketCenter: ExtendedObjectState['setDiracPacketCenter']
  setPacketWidth: ExtendedObjectState['setDiracPacketWidth']
  setPacketMomentum: ExtendedObjectState['setDiracPacketMomentum']
  setPositiveEnergyFraction: ExtendedObjectState['setDiracPositiveEnergyFraction']
  setAutoScale: ExtendedObjectState['setDiracAutoScale']
  setShowPotential: ExtendedObjectState['setDiracShowPotential']
  setDiagnosticsEnabled: ExtendedObjectState['setDiracDiagnosticsEnabled']
  setDiagnosticsInterval: ExtendedObjectState['setDiracDiagnosticsInterval']
  setSlicePosition: ExtendedObjectState['setDiracSlicePosition']
  setNeedsReset: () => void
  applyPreset: ExtendedObjectState['applyDiracPreset']
}

/**
 * Props for Dirac Controls
 */
export type DiracControlsProps = SchroedingerModeControlsProps<DiracActions>
