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
import { WignerControls } from './WignerControls'
import type {
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
    } = useExtendedObjectStore(extendedObjectSelector)

    // Get current dimension to show/hide dimension-specific controls
    const dimension = useGeometryStore((state) => state.dimension)

    // Check current mode
    const isHydrogenNDMode = config.quantumMode === 'hydrogenND'
    const isFreeScalarField = config.quantumMode === 'freeScalarField'
    const isTdseDynamics = config.quantumMode === 'tdseDynamics'

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

    return (
      <div className={className} data-testid="schroedinger-controls">
        {/* Representation Selection — hidden for compute modes (free scalar / TDSE) */}
        {!isFreeScalarField && !isTdseDynamics && (
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
        <Section title={isFreeScalarField || isTdseDynamics ? 'Field Configuration' : 'Quantum State'} defaultOpen={true}>
          {isTdseDynamics ? (
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
        </div>
      </div>
    )
  }
)

SchroedingerControls.displayName = 'SchroedingerControls'

// Re-export sub-components for direct imports if needed
export { FreeScalarFieldControls } from './FreeScalarFieldControls'
export { HarmonicOscillatorControls } from './HarmonicOscillatorControls'
export { HydrogenNDControls } from './HydrogenNDControls'
export { TDSEControls } from './TDSEControls'
export { WignerControls } from './WignerControls'
export type * from './types'
