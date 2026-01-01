/**
 * QuaternionJuliaControls Component
 *
 * Controls for configuring n-dimensional Quaternion Julia fractal visualization.
 *
 * Features:
 * - Julia constant controls with presets (4D quaternion components)
 * - Power slider (quadratic to octave)
 * - Bailout radius slider
 * - Scale parameter for auto-positioning
 * - Slice parameters for 4D+ dimensions
 *
 * Note: Render Quality controls (SDF iterations, surface distance) are in AdvancedObjectControls.
 *
 * The Quaternion Julia fractal uses the iteration z = z^n + c where c is a
 * fixed constant (unlike Mandelbulb where c varies with sample position).
 *
 * NOTE: Julia fractals have no type-specific animations. Smooth shape morphing
 * is achieved via 4D+ rotation (handled by the rotation system).
 *
 * @see docs/prd/quaternion-julia-fractal.md
 */

import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { Section } from '@/components/sections/Section';
import {
  JULIA_CONSTANT_PRESETS,
} from '@/lib/geometry/extended/types';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';

/**
 * Props for the QuaternionJuliaControls component.
 */
export interface QuaternionJuliaControlsProps {
  /**
   * Optional CSS class name for additional styling.
   * Applied to the root container element.
   */
  className?: string;
}

/**
 * Power presets for common Julia configurations
 */
const powerPresets = [
  { value: 2, label: 'Quadratic' },
  { value: 3, label: 'Cubic' },
  { value: 4, label: 'Quartic' },
  { value: 8, label: 'Octave' },
];


/**
 * QuaternionJuliaControls component
 *
 * Provides controls for Quaternion Julia fractal generation:
 * - Julia constant (4D quaternion with presets)
 * - Power parameter (affects fractal shape)
 * - Iteration count and bailout radius
 * - Scale for auto-positioning
 * - Slice parameters for higher dimensions
 * - Animation controls
 *
 * @param props - Component props
 * @param props.className - Optional CSS class name
 * @returns React component
 */
export const QuaternionJuliaControls: React.FC<QuaternionJuliaControlsProps> = React.memo(({
  className = '',
}) => {
  // Consolidate extended object store selectors with useShallow
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.quaternionJulia,
    setJuliaConstant: state.setQuaternionJuliaConstant,
    setPower: state.setQuaternionJuliaPower,
    setBailoutRadius: state.setQuaternionJuliaBailoutRadius,
    setScale: state.setQuaternionJuliaScale,
    setParameterValue: state.setQuaternionJuliaParameterValue,
    resetParameters: state.resetQuaternionJuliaParameters,
  }));
  const {
    config,
    setJuliaConstant,
    setPower,
    setBailoutRadius,
    setScale,
    setParameterValue,
    resetParameters,
  } = useExtendedObjectStore(extendedObjectSelector);

  // Get current dimension for slice parameters
  const dimension = useGeometryStore((state) => state.dimension);

  // Helper to check if current constant matches a preset
  const getCurrentPresetIndex = (): number => {
    const [x, y, z, w] = config.juliaConstant;
    return JULIA_CONSTANT_PRESETS.findIndex(
      (p) =>
        Math.abs(p.value[0] - x) < 0.001 &&
        Math.abs(p.value[1] - y) < 0.001 &&
        Math.abs(p.value[2] - z) < 0.001 &&
        Math.abs(p.value[3] - w) < 0.001
    );
  };

  const currentPresetIndex = getCurrentPresetIndex();

  return (
    <div className={className} data-testid="quaternion-julia-controls">
      <Section title="Julia Constant" defaultOpen={true}>
        <div className="space-y-2">
            <Select
            label="Preset"
            options={JULIA_CONSTANT_PRESETS.map((p, i) => ({
                value: String(i),
                label: p.name,
            }))}
            value={currentPresetIndex >= 0 ? String(currentPresetIndex) : '-1'}
            onChange={(v) => {
                const idx = parseInt(v, 10);
                const preset = JULIA_CONSTANT_PRESETS[idx];
                if (idx >= 0 && preset) {
                setJuliaConstant(preset.value);
                }
            }}
            data-testid="julia-constant-preset"
            />
            <div className="grid grid-cols-2 gap-2">
            <Slider
                label="X"
                min={-2.0}
                max={2.0}
                step={0.01}
                value={config.juliaConstant[0]}
                onChange={(v) => setJuliaConstant([v, config.juliaConstant[1], config.juliaConstant[2], config.juliaConstant[3]])}
                showValue
                data-testid="julia-constant-x"
            />
            <Slider
                label="Y"
                min={-2.0}
                max={2.0}
                step={0.01}
                value={config.juliaConstant[1]}
                onChange={(v) => setJuliaConstant([config.juliaConstant[0], v, config.juliaConstant[2], config.juliaConstant[3]])}
                showValue
                data-testid="julia-constant-y"
            />
            <Slider
                label="Z"
                min={-2.0}
                max={2.0}
                step={0.01}
                value={config.juliaConstant[2]}
                onChange={(v) => setJuliaConstant([config.juliaConstant[0], config.juliaConstant[1], v, config.juliaConstant[3]])}
                showValue
                data-testid="julia-constant-z"
            />
            <Slider
                label="W"
                min={-2.0}
                max={2.0}
                step={0.01}
                value={config.juliaConstant[3]}
                onChange={(v) => setJuliaConstant([config.juliaConstant[0], config.juliaConstant[1], config.juliaConstant[2], v])}
                showValue
                data-testid="julia-constant-w"
            />
            </div>
            <p className="text-xs text-text-tertiary">
            The fixed constant c in z = z^n + c
            </p>
        </div>
      </Section>

      <Section title="Parameters" defaultOpen={true}>
        {/* Power Control */}
        <div className="space-y-2">
            <label className="text-xs text-text-secondary">
            Power (n={config.power})
            </label>
            <ToggleGroup
            options={powerPresets.map((p) => ({
                value: String(p.value),
                label: p.label,
            }))}
            value={String(config.power)}
            onChange={(v) => setPower(parseInt(v, 10))}
            ariaLabel="Power preset"
            data-testid="julia-power-preset"
            />
            <Slider
            label="Custom Power"
            min={2}
            max={8}
            step={1}
            value={config.power}
            onChange={setPower}
            showValue
            data-testid="julia-power-slider"
            />
        </div>

        {/* Bailout Radius */}
        <Slider
            label="Bailout Radius"
            min={2.0}
            max={16.0}
            step={0.5}
            value={config.bailoutRadius}
            onChange={setBailoutRadius}
            showValue
            data-testid="julia-bailout"
        />

        {/* Scale */}
        <Slider
            label="Scale"
            min={0.5}
            max={5.0}
            step={0.1}
            value={config.scale}
            onChange={setScale}
            showValue
            data-testid="julia-scale"
        />
      </Section>

      {/* Slice Parameters - shown for 4D+ */}
      {dimension >= 4 && (
        <Section title={`Cross Section (${dimension - 3} dim${dimension > 4 ? 's' : ''})`} defaultOpen={true} onReset={() => resetParameters()}>
          {Array.from({ length: dimension - 3 }, (_, i) => (
            <Slider
              key={`slice-dim-${i + 3}`}
              label={`Dim ${i + 4}`}
              min={-2.0}
              max={2.0}
              step={0.1}
              value={config.parameterValues[i] ?? 0}
              onChange={(v) => setParameterValue(i, v)}
              showValue
              data-testid={`julia-slice-dim-${i + 3}`}
            />
          ))}
          <p className="text-xs text-text-tertiary">
            Explore different {dimension}D cross-sections
          </p>
        </Section>
      )}

      {/* Info */}
      <div className="px-4 py-2 text-xs text-text-secondary border-t border-border-subtle">
        <p>Rendering: GPU Ray Marching</p>
        <p className="text-text-tertiary">
          {`${dimension}D Quaternion Julia fractal (z = z^${config.power} + c)`}
        </p>
      </div>
    </div>
  );
});
