/**
 * SchroedingerControls Component
 *
 * Controls for configuring n-dimensional quantum wavefunction visualization.
 * Supports three physics modes:
 * - Harmonic Oscillator: n-dimensional superposition states (default)
 * - Hydrogen Orbital: s, p, d, f electron orbitals (Coulomb potential, 3D)
 * - Hydrogen ND: n-dimensional hydrogen atom in 3D space
 *
 * Features:
 * - Mode selection (Harmonic Oscillator / Hydrogen Orbital / Hydrogen ND)
 * - Preset selection for each mode
 * - Quantum parameter controls
 * - Volume rendering settings
 * - Slice parameters for 4D+
 */

import { useShallow } from 'zustand/react/shallow';
import { Slider } from '@/components/ui/Slider';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { Section } from '@/components/sections/Section';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import React from 'react';
import { HarmonicOscillatorControls } from './HarmonicOscillatorControls';
import { HydrogenOrbitalControls } from './HydrogenOrbitalControls';
import { HydrogenNDControls } from './HydrogenNDControls';
import type {
  HarmonicOscillatorActions,
  HydrogenOrbitalActions,
  HydrogenNDActions,
} from './types';

/**
 * Props for the SchroedingerControls component.
 */
export interface SchroedingerControlsProps {
  /**
   * Optional CSS class name for additional styling.
   * Applied to the root container element.
   */
  className?: string;
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
export const SchroedingerControls: React.FC<SchroedingerControlsProps> = React.memo(({
  className = '',
}) => {
  // Consolidate extended object store selectors with useShallow
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.schroedinger,
    // Geometry actions
    setScale: state.setSchroedingerScale,
    // Mode selection
    setQuantumMode: state.setSchroedingerQuantumMode,
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
    // Hydrogen orbital actions
    setHydrogenPreset: state.setSchroedingerHydrogenPreset,
    setPrincipalQuantumNumber: state.setSchroedingerPrincipalQuantumNumber,
    setAzimuthalQuantumNumber: state.setSchroedingerAzimuthalQuantumNumber,
    setMagneticQuantumNumber: state.setSchroedingerMagneticQuantumNumber,
    setUseRealOrbitals: state.setSchroedingerUseRealOrbitals,
    setBohrRadiusScale: state.setSchroedingerBohrRadiusScale,
    // Hydrogen ND actions
    setHydrogenNDPreset: state.setSchroedingerHydrogenNDPreset,
    setExtraDimQuantumNumber: state.setSchroedingerExtraDimQuantumNumber,
    setExtraDimFrequencySpread: state.setSchroedingerExtraDimFrequencySpread,
  }));
  const {
    config,
    // Mode selection
    setQuantumMode,
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
    // Hydrogen orbital actions
    setHydrogenPreset,
    setPrincipalQuantumNumber,
    setAzimuthalQuantumNumber,
    setMagneticQuantumNumber,
    setUseRealOrbitals,
    setBohrRadiusScale,
    // Hydrogen ND actions
    setHydrogenNDPreset,
    setExtraDimQuantumNumber,
    setExtraDimFrequencySpread,
    // Geometry actions
    setScale,
  } = useExtendedObjectStore(extendedObjectSelector);

  // Get current dimension to show/hide dimension-specific controls
  const dimension = useGeometryStore((state) => state.dimension);

  // Check current mode
  const isHydrogenMode = config.quantumMode === 'hydrogenOrbital';
  const isHydrogenNDMode = config.quantumMode === 'hydrogenND';

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
  };

  const hydrogenActions: HydrogenOrbitalActions = {
    setHydrogenPreset,
    setPrincipalQuantumNumber,
    setAzimuthalQuantumNumber,
    setMagneticQuantumNumber,
    setUseRealOrbitals,
    setBohrRadiusScale,
  };

  const hydrogenNDActions: HydrogenNDActions = {
    ...hydrogenActions,
    setHydrogenNDPreset,
    setExtraDimQuantumNumber,
    setExtraDimFrequencySpread,
  };

  return (
    <div className={className} data-testid="schroedinger-controls">
      {/* Geometry Settings */}
      <Section title="Geometry" defaultOpen={true}>
        <Slider
          label="Scale"
          min={0.1}
          max={2.0}
          step={0.05}
          value={config.scale}
          onChange={setScale}
          showValue
          data-testid="schroedinger-scale"
        />
      </Section>

      {/* Physics Mode Selection */}
      <Section title="Physics Mode" defaultOpen={true}>
        <div className="space-y-3">
          <ToggleGroup
            options={[
              { value: 'harmonicOscillator', label: 'Harmonic' },
              { value: 'hydrogenOrbital', label: 'Hydrogen 3D' },
              { value: 'hydrogenND', label: 'Hydrogen ND' },
            ]}
            value={config.quantumMode}
            onChange={(v) => setQuantumMode(v as 'harmonicOscillator' | 'hydrogenOrbital' | 'hydrogenND')}
            ariaLabel="Select physics mode"
            data-testid="mode-selector"
          />
          <p className="text-xs text-text-tertiary">
            {isHydrogenMode
              ? 'Electron orbitals from Coulomb potential (s, p, d, f shapes)'
              : isHydrogenNDMode
                ? 'N-dimensional hydrogen atom in 3D space'
                : 'N-dimensional quantum superposition states'
            }
          </p>
        </div>
      </Section>

      {/* Quantum State Section - content depends on mode */}
      <Section title="Quantum State" defaultOpen={true}>
        {isHydrogenMode ? (
          <HydrogenOrbitalControls config={config} actions={hydrogenActions} />
        ) : isHydrogenNDMode ? (
          <HydrogenNDControls config={config} dimension={dimension} actions={hydrogenNDActions} />
        ) : (
          <HarmonicOscillatorControls config={config} dimension={dimension} actions={harmonicActions} />
        )}
      </Section>

      {/* Render Mode Info */}
      <div className="px-4 py-2 text-xs text-text-secondary border-t border-border-subtle">
        <p>Rendering: Volumetric (Beer-Lambert)</p>
        {isHydrogenMode && (
          <p className="text-text-tertiary mt-1">
            Hydrogen orbitals are always 3D
          </p>
        )}
        {isHydrogenNDMode && (
          <p className="text-text-tertiary mt-1">
            {dimension}D hydrogen atom viewed in 3D space
          </p>
        )}
      </div>
    </div>
  );
});

SchroedingerControls.displayName = 'SchroedingerControls';

// Re-export sub-components for direct imports if needed
export { HarmonicOscillatorControls } from './HarmonicOscillatorControls';
export { HydrogenOrbitalControls } from './HydrogenOrbitalControls';
export { HydrogenNDControls } from './HydrogenNDControls';
export type * from './types';
