/**
 * HydrogenNDControls Component
 *
 * Controls for n-dimensional hydrogen atom in 3D space.
 * Extends 3D hydrogen orbitals with extra dimension quantum numbers.
 */

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import {
  HYDROGEN_ND_PRESETS,
  getHydrogenNDPresetsWithKeysByDimension,
} from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets';
import {
  maxAzimuthalForPrincipal,
  orbitalShapeLetter,
} from '@/lib/geometry/extended/schroedinger/hydrogenPresets';
import type { HydrogenNDPresetName } from '@/lib/geometry/extended/types';
import React, { useMemo } from 'react';
import type { HydrogenNDControlsProps } from './types';

/**
 * HydrogenNDControls component
 *
 * Provides controls for n-dimensional hydrogen orbitals:
 * - Preset selection by dimension
 * - 3D quantum numbers (n, l, m)
 * - Extra dimension quantum numbers
 * - Real vs Complex representation
 * - Bohr radius scale
 */
export const HydrogenNDControls: React.FC<HydrogenNDControlsProps> = React.memo(({
  config,
  dimension,
  actions,
}) => {
  const {
    setHydrogenNDPreset,
    setPrincipalQuantumNumber,
    setAzimuthalQuantumNumber,
    setMagneticQuantumNumber,
    setExtraDimQuantumNumber,
    setExtraDimFrequencySpread,
    setUseRealOrbitals,
    setBohrRadiusScale,
  } = actions;

  // Compute derived state for quantum number constraints
  const maxL = maxAzimuthalForPrincipal(config.principalQuantumNumber);
  const maxM = config.azimuthalQuantumNumber;

  // Build preset options grouped by dimension
  const presetOptions = useMemo(() => {
    const groups = getHydrogenNDPresetsWithKeysByDimension();
    return [
      ...Object.entries(groups).map(([dim, presets]) => ({
        label: `${dim}D Orbitals`,
        options: presets.map(([key, preset]) => ({ value: key, label: preset.name })),
      })),
      { label: 'Custom', options: [{ value: 'custom', label: 'Custom Configuration' }] },
    ];
  }, []);

  // Flatten for Select component
  const flatOptions = useMemo(() =>
    presetOptions.flatMap(group => group.options),
  [presetOptions]);

  return (
    <>
      {/* Hydrogen ND Preset Selection */}
      <div className="space-y-2">
        <Select
          label="ND Orbital Preset"
          options={flatOptions}
          value={config.hydrogenNDPreset}
          onChange={(v) => setHydrogenNDPreset(v as HydrogenNDPresetName)}
          data-testid="hydrogen-nd-preset-select"
        />
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
  );
});

HydrogenNDControls.displayName = 'HydrogenNDControls';
