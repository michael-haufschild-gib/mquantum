/**
 * SchroedingerControls Component
 *
 * Controls for configuring n-dimensional quantum wavefunction visualization.
 * Supports two physics modes:
 * - Harmonic Oscillator: n-dimensional superposition states (default)
 * - Hydrogen Orbital: s, p, d, f electron orbitals (Coulomb potential)
 *
 * Features:
 * - Mode selection (Harmonic Oscillator / Hydrogen Orbital)
 * - Preset selection for each mode
 * - Quantum parameter controls
 * - Volume rendering settings
 * - Slice parameters for 4D+
 */

import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { Section } from '@/components/sections/Section';
import { SCHROEDINGER_NAMED_PRESETS } from '@/lib/geometry/extended/schroedinger/presets';
import {
  HYDROGEN_ORBITAL_PRESETS,
  maxAzimuthalForPrincipal,
  orbitalShapeLetter,
} from '@/lib/geometry/extended/schroedinger/hydrogenPresets';
import {
  HYDROGEN_ND_PRESETS,
  getHydrogenNDPresetsWithKeysByDimension,
} from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets';
import {
  SchroedingerPresetName,
  HydrogenOrbitalPresetName,
  HydrogenNDPresetName,
} from '@/lib/geometry/extended/types';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import React from 'react';

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
 * Preset options for toggle group
 */
const presetOptions = Object.entries(SCHROEDINGER_NAMED_PRESETS).map(([key, preset]) => ({
  value: key,
  label: preset.name,
  description: preset.description,
}));

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

  // Compute derived state for quantum number constraints
  const maxL = maxAzimuthalForPrincipal(config.principalQuantumNumber);
  const maxM = config.azimuthalQuantumNumber;

  // Check current mode
  const isHarmonicMode = config.quantumMode === 'harmonicOscillator';
  const isHydrogenMode = config.quantumMode === 'hydrogenOrbital';
  const isHydrogenNDMode = config.quantumMode === 'hydrogenND';

  // Group hydrogen presets by orbital type for dropdown
  const hydrogenPresetGroups = {
    s: Object.entries(HYDROGEN_ORBITAL_PRESETS).filter(([, p]) => p.l === 0 && p.name !== 'Custom'),
    p: Object.entries(HYDROGEN_ORBITAL_PRESETS).filter(([, p]) => p.l === 1),
    d: Object.entries(HYDROGEN_ORBITAL_PRESETS).filter(([, p]) => p.l === 2),
    f: Object.entries(HYDROGEN_ORBITAL_PRESETS).filter(([, p]) => p.l === 3),
  };

  // Group hydrogen ND presets by dimension
  const hydrogenNDPresetGroups = getHydrogenNDPresetsWithKeysByDimension();

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
                <>
                    {/* Hydrogen Orbital Preset Selection */}
                    <div className="space-y-2">
                        <label className="text-xs text-text-secondary">
                            Orbital Preset
                        </label>
                        <div className="relative">
                            <select
                                className="w-full bg-surface-tertiary border border-border-default rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent appearance-none cursor-pointer"
                                value={config.hydrogenPreset}
                                onChange={(e) => setHydrogenPreset(e.target.value as HydrogenOrbitalPresetName)}
                                data-testid="hydrogen-preset-select"
                            >
                                <optgroup label="s Orbitals (Spherical)">
                                    {hydrogenPresetGroups.s.map(([key, preset]) => (
                                        <option key={key} value={key}>{preset.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="p Orbitals (Dumbbell)">
                                    {hydrogenPresetGroups.p.map(([key, preset]) => (
                                        <option key={key} value={key}>{preset.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="d Orbitals (Cloverleaf)">
                                    {hydrogenPresetGroups.d.map(([key, preset]) => (
                                        <option key={key} value={key}>{preset.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="f Orbitals (Complex)">
                                    {hydrogenPresetGroups.f.map(([key, preset]) => (
                                        <option key={key} value={key}>{preset.name}</option>
                                    ))}
                                </optgroup>
                                <option value="custom">Custom (n, l, m)</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-text-tertiary">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-xs text-text-tertiary pt-1">
                            {HYDROGEN_ORBITAL_PRESETS[config.hydrogenPreset as HydrogenOrbitalPresetName]?.description}
                        </p>
                    </div>

                    {/* Quantum Numbers - shown when custom or for reference */}
                    <div className="space-y-2 pt-2 border-t border-border-subtle">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-text-secondary">Quantum Numbers</label>
                            <span className="text-xs text-text-tertiary">
                                {config.principalQuantumNumber}{orbitalShapeLetter(config.azimuthalQuantumNumber)}
                                {config.azimuthalQuantumNumber > 0 ? ` (m=${config.magneticQuantumNumber})` : ''}
                            </span>
                        </div>

                        <Slider
                            label="n (Principal)"
                            min={1}
                            max={7}
                            step={1}
                            value={config.principalQuantumNumber}
                            onChange={setPrincipalQuantumNumber}
                            showValue
                            data-testid="hydrogen-n-slider"
                        />

                        <Slider
                            label={`l (Shape: ${orbitalShapeLetter(config.azimuthalQuantumNumber)})`}
                            min={0}
                            max={maxL}
                            step={1}
                            value={config.azimuthalQuantumNumber}
                            onChange={setAzimuthalQuantumNumber}
                            showValue
                            data-testid="hydrogen-l-slider"
                        />

                        {config.azimuthalQuantumNumber > 0 && (
                            <Slider
                                label="m (Orientation)"
                                min={-maxM}
                                max={maxM}
                                step={1}
                                value={config.magneticQuantumNumber}
                                onChange={setMagneticQuantumNumber}
                                showValue
                                data-testid="hydrogen-m-slider"
                            />
                        )}
                    </div>

                    {/* Real vs Complex toggle */}
                    <div className="space-y-2 pt-2 border-t border-border-subtle">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-[var(--text-secondary)]">
                                Orbital Representation
                            </label>
                            <Button
                                variant={config.useRealOrbitals ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setUseRealOrbitals(!config.useRealOrbitals)}
                                className={config.useRealOrbitals ? 'bg-accent/20 text-accent' : ''}
                                data-testid="hydrogen-real-toggle"
                            >
                                {config.useRealOrbitals ? 'Real (px, py, pz)' : 'Complex (m)'}
                            </Button>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)]">
                            {config.useRealOrbitals
                                ? 'Real spherical harmonics (chemistry convention)'
                                : 'Complex spherical harmonics (physics convention)'
                            }
                        </p>
                    </div>

                    {/* Bohr Radius Scale */}
                    <div className="space-y-2 pt-2 border-t border-border-subtle">
                        <Slider
                            label="Bohr Radius Scale"
                            min={0.5}
                            max={3.0}
                            step={0.1}
                            value={config.bohrRadiusScale}
                            onChange={setBohrRadiusScale}
                            showValue
                            data-testid="hydrogen-bohr-scale"
                        />
                    </div>
                </>
            ) : isHydrogenNDMode ? (
                <>
                    {/* Hydrogen ND Preset Selection */}
                    <div className="space-y-2">
                        <label className="text-xs text-text-secondary">
                            ND Orbital Preset
                        </label>
                        <div className="relative">
                            <select
                                className="w-full bg-surface-tertiary border border-border-default rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent appearance-none cursor-pointer"
                                value={config.hydrogenNDPreset}
                                onChange={(e) => setHydrogenNDPreset(e.target.value as HydrogenNDPresetName)}
                                data-testid="hydrogen-nd-preset-select"
                            >
                                {Object.entries(hydrogenNDPresetGroups).map(([dim, presets]) => (
                                    <optgroup key={dim} label={`${dim}D Orbitals`}>
                                        {presets.map(([key, preset]) => (
                                            <option key={key} value={key}>{preset.name}</option>
                                        ))}
                                    </optgroup>
                                ))}
                                <option value="custom">Custom Configuration</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-text-tertiary">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-xs text-text-tertiary pt-1">
                            {HYDROGEN_ND_PRESETS[config.hydrogenNDPreset as HydrogenNDPresetName]?.description}
                        </p>
                    </div>

                    {/* 3D Quantum Numbers (n, l, m) */}
                    <div className="space-y-2 pt-2 border-t border-border-subtle">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-text-secondary">3D Quantum Numbers</label>
                            <span className="text-xs text-text-tertiary">
                                {config.principalQuantumNumber}{orbitalShapeLetter(config.azimuthalQuantumNumber)}
                                {config.azimuthalQuantumNumber > 0 ? ` (m=${config.magneticQuantumNumber})` : ''}
                            </span>
                        </div>

                        <Slider
                            label="n (Principal)"
                            min={1}
                            max={7}
                            step={1}
                            value={config.principalQuantumNumber}
                            onChange={setPrincipalQuantumNumber}
                            showValue
                            data-testid="hydrogen-nd-n-slider"
                        />

                        <Slider
                            label={`l (Shape: ${orbitalShapeLetter(config.azimuthalQuantumNumber)})`}
                            min={0}
                            max={maxL}
                            step={1}
                            value={config.azimuthalQuantumNumber}
                            onChange={setAzimuthalQuantumNumber}
                            showValue
                            data-testid="hydrogen-nd-l-slider"
                        />

                        {config.azimuthalQuantumNumber > 0 && (
                            <Slider
                                label="m (Orientation)"
                                min={-maxM}
                                max={maxM}
                                step={1}
                                value={config.magneticQuantumNumber}
                                onChange={setMagneticQuantumNumber}
                                showValue
                                data-testid="hydrogen-nd-m-slider"
                            />
                        )}
                    </div>

                    {/* Extra Dimension Quantum Numbers */}
                    {dimension >= 4 && (
                        <div className="space-y-2 pt-2 border-t border-border-subtle">
                            <label className="text-xs text-text-secondary">
                                Extra Dimension Quantum Numbers
                            </label>
                            {Array.from({ length: Math.min(dimension - 3, 8) }, (_, i) => (
                                <Slider
                                    key={`extra-dim-n-${i}`}
                                    label={`n${i + 4} (Dim ${i + 4})`}
                                    min={0}
                                    max={6}
                                    step={1}
                                    value={config.extraDimQuantumNumbers?.[i] ?? 0}
                                    onChange={(v) => setExtraDimQuantumNumber(i, v)}
                                    showValue
                                    data-testid={`hydrogen-nd-extra-n-${i}`}
                                />
                            ))}
                            <p className="text-xs text-text-tertiary">
                                Harmonic oscillator quantum numbers for dimensions 4+
                            </p>
                        </div>
                    )}

                    {/* Extra Dim Frequency Spread */}
                    {dimension >= 4 && (
                        <div className="space-y-2 pt-2 border-t border-border-subtle">
                            <Slider
                                label="Extra Dim Frequency Spread"
                                min={0}
                                max={0.5}
                                step={0.01}
                                value={config.extraDimFrequencySpread ?? 0}
                                onChange={setExtraDimFrequencySpread}
                                showValue
                                data-testid="hydrogen-nd-freq-spread"
                            />
                        </div>
                    )}

                    {/* Real vs Complex toggle */}
                    <div className="space-y-2 pt-2 border-t border-border-subtle">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-[var(--text-secondary)]">
                                Orbital Representation
                            </label>
                            <Button
                                variant={config.useRealOrbitals ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setUseRealOrbitals(!config.useRealOrbitals)}
                                className={config.useRealOrbitals ? 'bg-accent/20 text-accent' : ''}
                                data-testid="hydrogen-nd-real-toggle"
                            >
                                {config.useRealOrbitals ? 'Real (px, py, pz)' : 'Complex (m)'}
                            </Button>
                        </div>
                    </div>

                    {/* Bohr Radius Scale */}
                    <div className="space-y-2 pt-2 border-t border-border-subtle">
                        <Slider
                            label="Bohr Radius Scale"
                            min={0.5}
                            max={3.0}
                            step={0.1}
                            value={config.bohrRadiusScale}
                            onChange={setBohrRadiusScale}
                            showValue
                            data-testid="hydrogen-nd-bohr-scale"
                        />
                    </div>
                </>
            ) : (
                <>
                    {/* Harmonic Oscillator Preset Selection */}
                    <div className="space-y-2">
                        <label className="text-xs text-text-secondary">
                            Quantum Preset
                        </label>
                        <div className="relative">
                            <select
                                className="w-full bg-surface-tertiary border border-border-default rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent appearance-none cursor-pointer"
                                value={config.presetName}
                                onChange={(e) => setPresetName(e.target.value as SchroedingerPresetName)}
                                data-testid="schroedinger-preset-select"
                            >
                                {presetOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                                <option value="custom">Custom Configuration</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-text-tertiary">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        <p className="text-xs text-text-tertiary pt-1">
                            {SCHROEDINGER_NAMED_PRESETS[config.presetName]?.description}
                        </p>
                    </div>

                    {/* Seed Control */}
                    <div className="space-y-2 pt-2 border-t border-border-subtle">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-[var(--text-secondary)]">
                                Seed: {config.seed}
                            </label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => randomizeSeed()}
                                data-testid="schroedinger-randomize-seed"
                            >
                                Randomize
                            </Button>
                        </div>
                        <Slider
                            label="Seed"
                            min={0}
                            max={999999}
                            step={1}
                            value={config.seed}
                            onChange={setSeed}
                            showValue={false}
                            data-testid="schroedinger-seed-slider"
                        />
                    </div>

                    {/* Quantum Parameters */}
                    <div className="space-y-2 pt-2 border-t border-border-subtle">
                        <Slider
                            label="Superposition Terms"
                            min={1}
                            max={8}
                            step={1}
                            value={config.termCount}
                            onChange={setTermCount}
                            showValue
                            data-testid="schroedinger-term-count"
                        />

                        <Slider
                            label="Max Quantum Number (n)"
                            min={2}
                            max={6}
                            step={1}
                            value={config.maxQuantumNumber}
                            onChange={setMaxQuantumNumber}
                            showValue
                            data-testid="schroedinger-max-quantum"
                        />

                        <Slider
                            label="Frequency Spread"
                            min={0}
                            max={0.5}
                            step={0.0001}
                            value={config.frequencySpread}
                            onChange={setFrequencySpread}
                            showValue
                            data-testid="schroedinger-freq-spread"
                        />
                    </div>

                    {/* Geometric Parameters */}
                    <div className="space-y-2 pt-2 border-t border-border-subtle">
                        <Slider
                            label="Field Scale"
                            min={0.5}
                            max={2.0}
                            step={0.1}
                            value={config.fieldScale}
                            onChange={setFieldScale}
                            showValue
                            data-testid="schroedinger-field-scale"
                        />
                    </div>
                </>
            )}
        </Section>

        {/* Slice Parameters - shown for 4D+ in harmonic oscillator mode only */}
        {isHarmonicMode && dimension >= 4 && (
            <Section
                title={`Cross Section (${dimension - 3} dim${dimension > 4 ? 's' : ''})`}
                defaultOpen={true}
                onReset={() => resetSchroedingerParameters()}
            >
                {Array.from({ length: dimension - 3 }, (_, i) => (
                    <Slider
                        key={`slice-dim-${i + 3}`}
                        label={`Dim ${i + 3}`}
                        min={-2.0}
                        max={2.0}
                        step={0.1}
                        value={config.parameterValues[i] ?? 0}
                        onChange={(v) => setSchroedingerParameterValue(i, v)}
                        showValue
                        data-testid={`schroedinger-slice-dim-${i + 3}`}
                    />
                ))}
                <p className="text-xs text-text-tertiary">
                    Explore different {dimension}D cross-sections
                </p>
            </Section>
        )}

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
