/**
 * SchroedingerControls Component
 *
 * Controls for configuring n-dimensional quantum wavefunction visualization.
 * Supports three physics modes:
 * - Harmonic Oscillator: n-dimensional superposition states (default)
 * - Hydrogen ND: n-dimensional hydrogen atom in 3D space
 * - Free Scalar Field: Klein-Gordon field on a lattice with real-time evolution
 *
 * Features:
 * - Preset selection for each mode
 * - Quantum parameter controls
 * - Volume rendering settings
 * - Slice parameters for 4D+
 */

import { useShallow } from 'zustand/react/shallow'
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { Section } from '@/components/sections/Section'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import React from 'react'
import { FreeScalarFieldControls } from './FreeScalarFieldControls'
import { HarmonicOscillatorControls } from './HarmonicOscillatorControls'
import { HydrogenNDControls } from './HydrogenNDControls'
import { TDSEControls } from './TDSEControls'
import { BECControls } from './BECControls'
import { DiracControls } from './DiracControls'
import { WignerControls } from './WignerControls'
import type {
  BecActions,
  DiracActions,
  FreeScalarFieldActions,
  HarmonicOscillatorActions,
  HydrogenNDActions,
  TdseActions,
  WignerActions,
} from './types'

/**
 * Props for the SchroedingerControls component.
 */
export interface SchroedingerControlsProps {
  /**
   * Optional CSS class name for additional styling.
   * Applied to the root container element.
   */
  className?: string
}

/**
 * SchroedingerControls component
 *
 * Provides controls for quantum wavefunction visualization:
 * - Preset selection for different quantum states
 * - Quantum parameter controls
 * - Slice parameters for 4D+
 *
 * @param props - Component props
 * @param props.className - Optional CSS class name
 * @returns React component
 */
export const SchroedingerControls: React.FC<SchroedingerControlsProps> = React.memo(
  ({ className = '' }) => {
    // Consolidate extended object store selectors with useShallow
    const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
      config: state.schroedinger,
      setRepresentation: state.setSchroedingerRepresentation,
      setMomentumDisplayUnits: state.setSchroedingerMomentumDisplayUnits,
      setMomentumScale: state.setSchroedingerMomentumScale,
      setMomentumHbar: state.setSchroedingerMomentumHbar,
      // Harmonic oscillator actions
      setPresetName: state.setSchroedingerPresetName,
      setSeed: state.setSchroedingerSeed,
      randomizeSeed: state.randomizeSchroedingerSeed,
      setTermCount: state.setSchroedingerTermCount,
      setMaxQuantumNumber: state.setSchroedingerMaxQuantumNumber,
      setFrequencySpread: state.setSchroedingerFrequencySpread,
      setFieldScale: state.setSchroedingerFieldScale,
      setSchroedingerParameterValue: state.setSchroedingerParameterValue,
      resetSchroedingerParameters: state.resetSchroedingerParameters,
      // Hydrogen actions
      setPrincipalQuantumNumber: state.setSchroedingerPrincipalQuantumNumber,
      setAzimuthalQuantumNumber: state.setSchroedingerAzimuthalQuantumNumber,
      setMagneticQuantumNumber: state.setSchroedingerMagneticQuantumNumber,
      setUseRealOrbitals: state.setSchroedingerUseRealOrbitals,
      setBohrRadiusScale: state.setSchroedingerBohrRadiusScale,
      // Hydrogen ND actions
      setHydrogenNDPreset: state.setSchroedingerHydrogenNDPreset,
      setExtraDimQuantumNumber: state.setSchroedingerExtraDimQuantumNumber,
      setExtraDimFrequencySpread: state.setSchroedingerExtraDimFrequencySpread,
      // Wigner actions
      setWignerDimensionIndex: state.setSchroedingerWignerDimensionIndex,
      setWignerAutoRange: state.setSchroedingerWignerAutoRange,
      setWignerXRange: state.setSchroedingerWignerXRange,
      setWignerPRange: state.setSchroedingerWignerPRange,
      setWignerCrossTermsEnabled: state.setSchroedingerWignerCrossTermsEnabled,
      setWignerQuadPoints: state.setSchroedingerWignerQuadPoints,
      setWignerClassicalOverlay: state.setSchroedingerWignerClassicalOverlay,
      setWignerCacheResolution: state.setSchroedingerWignerCacheResolution,
      // Free scalar field actions
      setFreeScalarLatticeDim: state.setFreeScalarLatticeDim,
      setFreeScalarGridSize: state.setFreeScalarGridSize,
      setFreeScalarSpacing: state.setFreeScalarSpacing,
      setFreeScalarMass: state.setFreeScalarMass,
      setFreeScalarDt: state.setFreeScalarDt,
      setFreeScalarStepsPerFrame: state.setFreeScalarStepsPerFrame,
      setFreeScalarInitialCondition: state.setFreeScalarInitialCondition,
      setFreeScalarFieldView: state.setFreeScalarFieldView,
      setFreeScalarPacketCenter: state.setFreeScalarPacketCenter,
      setFreeScalarPacketWidth: state.setFreeScalarPacketWidth,
      setFreeScalarPacketAmplitude: state.setFreeScalarPacketAmplitude,
      setFreeScalarModeK: state.setFreeScalarModeK,
      setFreeScalarAutoScale: state.setFreeScalarAutoScale,
      setFreeScalarVacuumSeed: state.setFreeScalarVacuumSeed,
      setFreeScalarSlicePosition: state.setFreeScalarSlicePosition,
      resetFreeScalarField: state.resetFreeScalarField,
      // TDSE dynamics actions
      setTdseLatticeDim: state.setTdseLatticeDim,
      setTdseGridSize: state.setTdseGridSize,
      setTdseSpacing: state.setTdseSpacing,
      setTdseMass: state.setTdseMass,
      setTdseHbar: state.setTdseHbar,
      setTdseDt: state.setTdseDt,
      setTdseStepsPerFrame: state.setTdseStepsPerFrame,
      setTdseInitialCondition: state.setTdseInitialCondition,
      setTdsePacketCenter: state.setTdsePacketCenter,
      setTdsePacketWidth: state.setTdsePacketWidth,
      setTdsePacketAmplitude: state.setTdsePacketAmplitude,
      setTdsePacketMomentum: state.setTdsePacketMomentum,
      setTdsePotentialType: state.setTdsePotentialType,
      setTdseBarrierHeight: state.setTdseBarrierHeight,
      setTdseBarrierWidth: state.setTdseBarrierWidth,
      setTdseBarrierCenter: state.setTdseBarrierCenter,
      setTdseWellDepth: state.setTdseWellDepth,
      setTdseWellWidth: state.setTdseWellWidth,
      setTdseHarmonicOmega: state.setTdseHarmonicOmega,
      setTdseStepHeight: state.setTdseStepHeight,
      setTdseSlitSeparation: state.setTdseSlitSeparation,
      setTdseSlitWidth: state.setTdseSlitWidth,
      setTdseWallThickness: state.setTdseWallThickness,
      setTdseWallHeight: state.setTdseWallHeight,
      setTdseLatticeDepth: state.setTdseLatticeDepth,
      setTdseLatticePeriod: state.setTdseLatticePeriod,
      setTdseDoubleWellLambda: state.setTdseDoubleWellLambda,
      setTdseDoubleWellSeparation: state.setTdseDoubleWellSeparation,
      setTdseDoubleWellAsymmetry: state.setTdseDoubleWellAsymmetry,
      setTdseDriveEnabled: state.setTdseDriveEnabled,
      setTdseDriveWaveform: state.setTdseDriveWaveform,
      setTdseDriveFrequency: state.setTdseDriveFrequency,
      setTdseDriveAmplitude: state.setTdseDriveAmplitude,
      setTdseAbsorberEnabled: state.setTdseAbsorberEnabled,
      setTdseAbsorberWidth: state.setTdseAbsorberWidth,
      setTdseAbsorberStrength: state.setTdseAbsorberStrength,
      setTdseFieldView: state.setTdseFieldView,
      setTdseAutoScale: state.setTdseAutoScale,
      setTdseShowPotential: state.setTdseShowPotential,
      setTdseDiagnosticsEnabled: state.setTdseDiagnosticsEnabled,
      setTdseDiagnosticsInterval: state.setTdseDiagnosticsInterval,
      setTdseSlicePosition: state.setTdseSlicePosition,
      applyTdsePreset: state.applyTdsePreset,
      resetTdseField: state.resetTdseField,
      // BEC dynamics actions
      setBecInteractionStrength: state.setBecInteractionStrength,
      setBecTrapOmega: state.setBecTrapOmega,
      setBecTrapAnisotropy: state.setBecTrapAnisotropy,
      setBecInitialCondition: state.setBecInitialCondition,
      setBecFieldView: state.setBecFieldView,
      setBecVortexCharge: state.setBecVortexCharge,
      setBecVortexLatticeCount: state.setBecVortexLatticeCount,
      setBecSolitonDepth: state.setBecSolitonDepth,
      setBecSolitonVelocity: state.setBecSolitonVelocity,
      setBecAutoScale: state.setBecAutoScale,
      setBecAbsorberEnabled: state.setBecAbsorberEnabled,
      setBecAbsorberWidth: state.setBecAbsorberWidth,
      setBecAbsorberStrength: state.setBecAbsorberStrength,
      setBecDiagnosticsEnabled: state.setBecDiagnosticsEnabled,
      setBecDiagnosticsInterval: state.setBecDiagnosticsInterval,
      setBecDt: state.setBecDt,
      setBecStepsPerFrame: state.setBecStepsPerFrame,
      setBecMass: state.setBecMass,
      setBecHbar: state.setBecHbar,
      setBecGridSize: state.setBecGridSize,
      setBecSpacing: state.setBecSpacing,
      setBecSlicePosition: state.setBecSlicePosition,
      applyBecPreset: state.applyBecPreset,
      resetBecField: state.resetBecField,
      // Dirac equation actions
      setDiracInitialCondition: state.setDiracInitialCondition,
      setDiracFieldView: state.setDiracFieldView,
      setDiracPotentialType: state.setDiracPotentialType,
      setDiracPotentialStrength: state.setDiracPotentialStrength,
      setDiracPotentialWidth: state.setDiracPotentialWidth,
      setDiracPotentialCenter: state.setDiracPotentialCenter,
      setDiracHarmonicOmega: state.setDiracHarmonicOmega,
      setDiracCoulombZ: state.setDiracCoulombZ,
      setDiracMass: state.setDiracMass,
      setDiracSpeedOfLight: state.setDiracSpeedOfLight,
      setDiracHbar: state.setDiracHbar,
      setDiracDt: state.setDiracDt,
      setDiracStepsPerFrame: state.setDiracStepsPerFrame,
      setDiracGridSize: state.setDiracGridSize,
      setDiracSpacing: state.setDiracSpacing,
      setDiracPacketCenter: state.setDiracPacketCenter,
      setDiracPacketWidth: state.setDiracPacketWidth,
      setDiracPacketMomentum: state.setDiracPacketMomentum,
      setDiracPositiveEnergyFraction: state.setDiracPositiveEnergyFraction,
      setDiracAutoScale: state.setDiracAutoScale,
      setDiracShowPotential: state.setDiracShowPotential,
      setDiracAbsorberEnabled: state.setDiracAbsorberEnabled,
      setDiracAbsorberWidth: state.setDiracAbsorberWidth,
      setDiracAbsorberStrength: state.setDiracAbsorberStrength,
      setDiracDiagnosticsEnabled: state.setDiracDiagnosticsEnabled,
      setDiracDiagnosticsInterval: state.setDiracDiagnosticsInterval,
      setDiracSlicePosition: state.setDiracSlicePosition,
      setDiracNeedsReset: state.setDiracNeedsReset,
      applyDiracPreset: state.applyDiracPreset,
    }))
    const {
      config,
      setRepresentation,
      setMomentumDisplayUnits,
      setMomentumScale,
      setMomentumHbar,
      // Harmonic oscillator actions
      setPresetName,
      setSeed,
      randomizeSeed,
      setTermCount,
      setMaxQuantumNumber,
      setFrequencySpread,
      setFieldScale,
      setSchroedingerParameterValue,
      resetSchroedingerParameters,
      // Hydrogen actions
      setPrincipalQuantumNumber,
      setAzimuthalQuantumNumber,
      setMagneticQuantumNumber,
      setUseRealOrbitals,
      setBohrRadiusScale,
      // Hydrogen ND actions
      setHydrogenNDPreset,
      setExtraDimQuantumNumber,
      setExtraDimFrequencySpread,
      // Wigner actions
      setWignerDimensionIndex,
      setWignerAutoRange,
      setWignerXRange,
      setWignerPRange,
      setWignerCrossTermsEnabled,
      setWignerQuadPoints,
      setWignerClassicalOverlay,
      setWignerCacheResolution,
      // Free scalar field actions
      setFreeScalarLatticeDim,
      setFreeScalarGridSize,
      setFreeScalarSpacing,
      setFreeScalarMass,
      setFreeScalarDt,
      setFreeScalarStepsPerFrame,
      setFreeScalarInitialCondition,
      setFreeScalarFieldView,
      setFreeScalarPacketCenter,
      setFreeScalarPacketWidth,
      setFreeScalarPacketAmplitude,
      setFreeScalarModeK,
      setFreeScalarAutoScale,
      setFreeScalarVacuumSeed,
      setFreeScalarSlicePosition,
      resetFreeScalarField,
      // TDSE dynamics actions
      setTdseLatticeDim,
      setTdseGridSize,
      setTdseSpacing,
      setTdseMass,
      setTdseHbar,
      setTdseDt,
      setTdseStepsPerFrame,
      setTdseInitialCondition,
      setTdsePacketCenter,
      setTdsePacketWidth,
      setTdsePacketAmplitude,
      setTdsePacketMomentum,
      setTdsePotentialType,
      setTdseBarrierHeight,
      setTdseBarrierWidth,
      setTdseBarrierCenter,
      setTdseWellDepth,
      setTdseWellWidth,
      setTdseHarmonicOmega,
      setTdseStepHeight,
      setTdseSlitSeparation,
      setTdseSlitWidth,
      setTdseWallThickness,
      setTdseWallHeight,
      setTdseLatticeDepth,
      setTdseLatticePeriod,
      setTdseDoubleWellLambda,
      setTdseDoubleWellSeparation,
      setTdseDoubleWellAsymmetry,
      setTdseDriveEnabled,
      setTdseDriveWaveform,
      setTdseDriveFrequency,
      setTdseDriveAmplitude,
      setTdseAbsorberEnabled,
      setTdseAbsorberWidth,
      setTdseAbsorberStrength,
      setTdseFieldView,
      setTdseAutoScale,
      setTdseShowPotential,
      setTdseDiagnosticsEnabled,
      setTdseDiagnosticsInterval,
      setTdseSlicePosition,
      applyTdsePreset,
      resetTdseField,
      // BEC dynamics actions
      setBecInteractionStrength,
      setBecTrapOmega,
      setBecTrapAnisotropy,
      setBecInitialCondition,
      setBecFieldView,
      setBecVortexCharge,
      setBecVortexLatticeCount,
      setBecSolitonDepth,
      setBecSolitonVelocity,
      setBecAutoScale,
      setBecAbsorberEnabled,
      setBecAbsorberWidth,
      setBecAbsorberStrength,
      setBecDiagnosticsEnabled,
      setBecDiagnosticsInterval,
      setBecDt,
      setBecStepsPerFrame,
      setBecMass,
      setBecHbar,
      setBecGridSize,
      setBecSpacing,
      setBecSlicePosition,
      applyBecPreset,
      resetBecField,
      // Dirac equation actions
      setDiracInitialCondition,
      setDiracFieldView,
      setDiracPotentialType,
      setDiracPotentialStrength,
      setDiracPotentialWidth,
      setDiracPotentialCenter,
      setDiracHarmonicOmega,
      setDiracCoulombZ,
      setDiracMass,
      setDiracSpeedOfLight,
      setDiracHbar,
      setDiracDt,
      setDiracStepsPerFrame,
      setDiracGridSize,
      setDiracSpacing,
      setDiracPacketCenter,
      setDiracPacketWidth,
      setDiracPacketMomentum,
      setDiracPositiveEnergyFraction,
      setDiracAutoScale,
      setDiracShowPotential,
      setDiracAbsorberEnabled,
      setDiracAbsorberWidth,
      setDiracAbsorberStrength,
      setDiracDiagnosticsEnabled,
      setDiracDiagnosticsInterval,
      setDiracSlicePosition,
      setDiracNeedsReset,
      applyDiracPreset,
    } = useExtendedObjectStore(extendedObjectSelector)

    // Get current dimension to show/hide dimension-specific controls
    const dimension = useGeometryStore((state) => state.dimension)

    // Check current mode
    const isHydrogenNDMode = config.quantumMode === 'hydrogenND'
    const isFreeScalarField = config.quantumMode === 'freeScalarField'
    const isTdseDynamics = config.quantumMode === 'tdseDynamics'
    const isBecDynamics = config.quantumMode === 'becDynamics'
    const isDiracEquation = config.quantumMode === 'diracEquation'

    // Build action objects for child components
    const harmonicActions: HarmonicOscillatorActions = {
      setPresetName,
      setSeed,
      randomizeSeed,
      setTermCount,
      setMaxQuantumNumber,
      setFrequencySpread,
      setFieldScale,
      setSchroedingerParameterValue,
      resetSchroedingerParameters,
    }

    const hydrogenNDActions: HydrogenNDActions = {
      setPrincipalQuantumNumber,
      setAzimuthalQuantumNumber,
      setMagneticQuantumNumber,
      setUseRealOrbitals,
      setBohrRadiusScale,
      setHydrogenNDPreset,
      setExtraDimQuantumNumber,
      setExtraDimFrequencySpread,
    }

    const wignerActions: WignerActions = {
      setDimensionIndex: setWignerDimensionIndex,
      setAutoRange: setWignerAutoRange,
      setXRange: setWignerXRange,
      setPRange: setWignerPRange,
      setCrossTermsEnabled: setWignerCrossTermsEnabled,
      setQuadPoints: setWignerQuadPoints,
      setClassicalOverlay: setWignerClassicalOverlay,
      setCacheResolution: setWignerCacheResolution,
    }

    const freeScalarActions: FreeScalarFieldActions = {
      setLatticeDim: setFreeScalarLatticeDim,
      setGridSize: setFreeScalarGridSize,
      setSpacing: setFreeScalarSpacing,
      setMass: setFreeScalarMass,
      setDt: setFreeScalarDt,
      setStepsPerFrame: setFreeScalarStepsPerFrame,
      setInitialCondition: setFreeScalarInitialCondition,
      setFieldView: setFreeScalarFieldView,
      setPacketCenter: setFreeScalarPacketCenter,
      setPacketWidth: setFreeScalarPacketWidth,
      setPacketAmplitude: setFreeScalarPacketAmplitude,
      setModeK: setFreeScalarModeK,
      setAutoScale: setFreeScalarAutoScale,
      setVacuumSeed: setFreeScalarVacuumSeed,
      setSlicePosition: setFreeScalarSlicePosition,
      resetField: resetFreeScalarField,
    }

    const tdseActions: TdseActions = {
      setLatticeDim: setTdseLatticeDim,
      setGridSize: setTdseGridSize,
      setSpacing: setTdseSpacing,
      setMass: setTdseMass,
      setHbar: setTdseHbar,
      setDt: setTdseDt,
      setStepsPerFrame: setTdseStepsPerFrame,
      setInitialCondition: setTdseInitialCondition,
      setPacketCenter: setTdsePacketCenter,
      setPacketWidth: setTdsePacketWidth,
      setPacketAmplitude: setTdsePacketAmplitude,
      setPacketMomentum: setTdsePacketMomentum,
      setPotentialType: setTdsePotentialType,
      setBarrierHeight: setTdseBarrierHeight,
      setBarrierWidth: setTdseBarrierWidth,
      setBarrierCenter: setTdseBarrierCenter,
      setWellDepth: setTdseWellDepth,
      setWellWidth: setTdseWellWidth,
      setHarmonicOmega: setTdseHarmonicOmega,
      setStepHeight: setTdseStepHeight,
      setSlitSeparation: setTdseSlitSeparation,
      setSlitWidth: setTdseSlitWidth,
      setWallThickness: setTdseWallThickness,
      setWallHeight: setTdseWallHeight,
      setLatticeDepth: setTdseLatticeDepth,
      setLatticePeriod: setTdseLatticePeriod,
      setDoubleWellLambda: setTdseDoubleWellLambda,
      setDoubleWellSeparation: setTdseDoubleWellSeparation,
      setDoubleWellAsymmetry: setTdseDoubleWellAsymmetry,
      setDriveEnabled: setTdseDriveEnabled,
      setDriveWaveform: setTdseDriveWaveform,
      setDriveFrequency: setTdseDriveFrequency,
      setDriveAmplitude: setTdseDriveAmplitude,
      setAbsorberEnabled: setTdseAbsorberEnabled,
      setAbsorberWidth: setTdseAbsorberWidth,
      setAbsorberStrength: setTdseAbsorberStrength,
      setFieldView: setTdseFieldView,
      setAutoScale: setTdseAutoScale,
      setShowPotential: setTdseShowPotential,
      setDiagnosticsEnabled: setTdseDiagnosticsEnabled,
      setDiagnosticsInterval: setTdseDiagnosticsInterval,
      setSlicePosition: setTdseSlicePosition,
      applyPreset: applyTdsePreset,
      resetField: resetTdseField,
    }

    const becActions: BecActions = {
      setInteractionStrength: setBecInteractionStrength,
      setTrapOmega: setBecTrapOmega,
      setTrapAnisotropy: setBecTrapAnisotropy,
      setInitialCondition: setBecInitialCondition,
      setFieldView: setBecFieldView,
      setVortexCharge: setBecVortexCharge,
      setVortexLatticeCount: setBecVortexLatticeCount,
      setSolitonDepth: setBecSolitonDepth,
      setSolitonVelocity: setBecSolitonVelocity,
      setAutoScale: setBecAutoScale,
      setAbsorberEnabled: setBecAbsorberEnabled,
      setAbsorberWidth: setBecAbsorberWidth,
      setAbsorberStrength: setBecAbsorberStrength,
      setDiagnosticsEnabled: setBecDiagnosticsEnabled,
      setDiagnosticsInterval: setBecDiagnosticsInterval,
      setDt: setBecDt,
      setStepsPerFrame: setBecStepsPerFrame,
      setMass: setBecMass,
      setHbar: setBecHbar,
      setGridSize: setBecGridSize,
      setSpacing: setBecSpacing,
      setSlicePosition: setBecSlicePosition,
      applyPreset: applyBecPreset,
      resetField: resetBecField,
    }

    const diracActions: DiracActions = {
      setInitialCondition: setDiracInitialCondition,
      setFieldView: setDiracFieldView,
      setPotentialType: setDiracPotentialType,
      setPotentialStrength: setDiracPotentialStrength,
      setPotentialWidth: setDiracPotentialWidth,
      setPotentialCenter: setDiracPotentialCenter,
      setHarmonicOmega: setDiracHarmonicOmega,
      setCoulombZ: setDiracCoulombZ,
      setMass: setDiracMass,
      setSpeedOfLight: setDiracSpeedOfLight,
      setHbar: setDiracHbar,
      setDt: setDiracDt,
      setStepsPerFrame: setDiracStepsPerFrame,
      setGridSize: setDiracGridSize,
      setSpacing: setDiracSpacing,
      setPacketCenter: setDiracPacketCenter,
      setPacketWidth: setDiracPacketWidth,
      setPacketMomentum: setDiracPacketMomentum,
      setPositiveEnergyFraction: setDiracPositiveEnergyFraction,
      setAutoScale: setDiracAutoScale,
      setShowPotential: setDiracShowPotential,
      setAbsorberEnabled: setDiracAbsorberEnabled,
      setAbsorberWidth: setDiracAbsorberWidth,
      setAbsorberStrength: setDiracAbsorberStrength,
      setDiagnosticsEnabled: setDiracDiagnosticsEnabled,
      setDiagnosticsInterval: setDiracDiagnosticsInterval,
      setSlicePosition: setDiracSlicePosition,
      setNeedsReset: setDiracNeedsReset,
      applyPreset: applyDiracPreset,
    }

    return (
      <div className={className} data-testid="schroedinger-controls">
        {/* Representation Selection — hidden for compute modes (free scalar / TDSE) */}
        {!isFreeScalarField && !isTdseDynamics && !isBecDynamics && !isDiracEquation && (
          <Section title="Representation" defaultOpen={true}>
            <div className="space-y-3">
              <ToggleGroup
                options={[
                  { value: 'position', label: 'Position' },
                  { value: 'momentum', label: 'Momentum' },
                  { value: 'wigner', label: 'Wigner' },
                ]}
                value={config.representation}
                onChange={(v) => setRepresentation(v as 'position' | 'momentum' | 'wigner')}
                ariaLabel="Select representation space"
                data-testid="representation-selector"
              />

              {config.representation === 'momentum' && (
                <div className="space-y-3">
                  <ToggleGroup
                    options={[
                      { value: 'k', label: 'k-Space' },
                      { value: 'p', label: 'p-Space' },
                    ]}
                    value={config.momentumDisplayUnits}
                    onChange={(v) => setMomentumDisplayUnits(v as 'k' | 'p')}
                    ariaLabel="Select momentum display units"
                    data-testid="momentum-units-selector"
                  />
                  <Slider
                    label="Momentum Scale"
                    min={0.1}
                    max={4.0}
                    step={0.05}
                    value={config.momentumScale}
                    onChange={setMomentumScale}
                    showValue
                    data-testid="momentum-scale-slider"
                  />
                  {config.momentumDisplayUnits === 'p' && (
                    <Slider
                      label="Reduced Planck Constant (ħ)"
                      min={0.01}
                      max={10.0}
                      step={0.01}
                      value={config.momentumHbar}
                      onChange={setMomentumHbar}
                      showValue
                      data-testid="momentum-hbar-slider"
                    />
                  )}
                </div>
              )}

              {config.representation === 'wigner' && (
                <WignerControls config={config} dimension={dimension} actions={wignerActions} />
              )}

              {config.representation === 'momentum' && (
                <p className="text-xs text-text-tertiary">
                  Internal momentum rendering uses k-space; display units affect interpretation only.
                </p>
              )}
            </div>
          </Section>
        )}

        {/* Quantum State / Field Config Section - content depends on mode */}
        <Section title={isFreeScalarField || isTdseDynamics || isBecDynamics || isDiracEquation ? 'Field Configuration' : 'Quantum State'} defaultOpen={true}>
          {isDiracEquation ? (
            <DiracControls config={config} dimension={dimension} actions={diracActions} />
          ) : isBecDynamics ? (
            <BECControls config={config} dimension={dimension} actions={becActions} />
          ) : isTdseDynamics ? (
            <TDSEControls config={config} dimension={dimension} actions={tdseActions} />
          ) : isFreeScalarField ? (
            <FreeScalarFieldControls config={config} dimension={dimension} actions={freeScalarActions} />
          ) : isHydrogenNDMode ? (
            <HydrogenNDControls config={config} dimension={dimension} actions={hydrogenNDActions} />
          ) : (
            <HarmonicOscillatorControls
              config={config}
              dimension={dimension}
              actions={harmonicActions}
            />
          )}
        </Section>

        {/* Render Mode Info */}
        <div className="px-4 py-2 text-xs text-text-secondary border-t border-border-subtle">
          <p>Rendering: Volumetric (Beer-Lambert)</p>
          {isHydrogenNDMode && (
            <p className="text-text-tertiary mt-1">{dimension}D hydrogen atom viewed in 3D space</p>
          )}
          {isFreeScalarField && (
            <p className="text-text-tertiary mt-1">
              {config.freeScalar.latticeDim}D lattice, {config.freeScalar.gridSize.slice(0, config.freeScalar.latticeDim).join('\u00D7')} sites
            </p>
          )}
          {isTdseDynamics && (
            <p className="text-text-tertiary mt-1">
              {config.tdse.latticeDim}D TDSE, {config.tdse.gridSize.slice(0, config.tdse.latticeDim).join('\u00D7')} sites
            </p>
          )}
          {isBecDynamics && (
            <p className="text-text-tertiary mt-1">
              {config.bec.latticeDim}D BEC (GPE), {config.bec.gridSize.slice(0, config.bec.latticeDim).join('\u00D7')} sites
            </p>
          )}
          {isDiracEquation && (
            <p className="text-text-tertiary mt-1">
              {config.dirac.latticeDim}D Dirac, {config.dirac.gridSize.slice(0, config.dirac.latticeDim).join('\u00D7')} sites, S={Math.pow(2, Math.floor((config.dirac.latticeDim + 1) / 2))} spinor
            </p>
          )}
        </div>
      </div>
    )
  }
)

SchroedingerControls.displayName = 'SchroedingerControls'

// Re-export sub-components for direct imports if needed
export { BECControls } from './BECControls'
export { FreeScalarFieldControls } from './FreeScalarFieldControls'
export { HarmonicOscillatorControls } from './HarmonicOscillatorControls'
export { HydrogenNDControls } from './HydrogenNDControls'
export { TDSEControls } from './TDSEControls'
export { WignerControls } from './WignerControls'
export type * from './types'
