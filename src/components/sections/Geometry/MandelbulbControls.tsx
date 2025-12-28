/**
 * MandelbulbControls Component
 *
 * Controls for configuring n-dimensional Mandelbulb fractal visualization.
 * Mandelbulb uses GPU raymarching exclusively.
 *
 * Features:
 * - Power presets and custom slider
 * - Alternate Power (dual-power morphing)
 * - Slice parameters for 4D+
 *
 * Note: Max iterations (32 fast / 64 HQ) and escape radius (8.0) are fixed
 * in the shader for optimal quality/performance balance.
 */

import { useShallow } from 'zustand/react/shallow';
import { Slider } from '@/components/ui/Slider';
import { ToggleButton } from '@/components/ui/ToggleButton';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { Section } from '@/components/sections/Section';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import React from 'react';

/**
 * Props for the MandelbulbControls component.
 */
export interface MandelbulbControlsProps {
  /**
   * Optional CSS class name for additional styling.
   * Applied to the root container element.
   */
  className?: string;
}

/**
 * Mandelbulb power presets
 */
const powerPresets = [
  { value: 3, label: 'Flower' },
  { value: 4, label: 'Quad' },
  { value: 8, label: 'Classic' },
  { value: 12, label: 'Spiky' },
];

/**
 * MandelbulbControls component
 *
 * Provides controls for Mandelbulb GPU raymarching:
 * - Scale adjustment
 * - Power presets and slider
 * - Slice parameters for 4D+
 *
 * @param props - Component props
 * @param props.className - Optional CSS class name
 * @returns React component
 */
const MandelbulbControlsComponent: React.FC<MandelbulbControlsProps> = ({
  className = '',
}) => {
  // Consolidate extended object store selectors with useShallow
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.mandelbulb,
    setScale: state.setMandelbulbScale,
    setMandelbulbPower: state.setMandelbulbMandelbulbPower,
    setMandelbulbParameterValue: state.setMandelbulbParameterValue,
    resetMandelbulbParameters: state.resetMandelbulbParameters,
    // Alternate Power controls
    setAlternatePowerEnabled: state.setMandelbulbAlternatePowerEnabled,
    setAlternatePowerValue: state.setMandelbulbAlternatePowerValue,
    setAlternatePowerBlend: state.setMandelbulbAlternatePowerBlend,
  }));
  const {
    config,
    setScale,
    setMandelbulbPower,
    setMandelbulbParameterValue,
    resetMandelbulbParameters,
    setAlternatePowerEnabled,
    setAlternatePowerValue,
    setAlternatePowerBlend,
  } = useExtendedObjectStore(extendedObjectSelector);

  // Get current dimension to show/hide dimension-specific controls
  const dimension = useGeometryStore((state) => state.dimension);

  return (
    <div className={className} data-testid="mandelbulb-controls">
        <Section title="Parameters" defaultOpen={true}>
            {/* Scale */}
            <Slider
            label="Scale"
            min={0.1}
            max={5.0}
            step={0.1}
            value={config.scale ?? 1.0}
            onChange={setScale}
            showValue
            data-testid="mandelbulb-scale"
            />
        </Section>

        {/* Power Section (shown for 3D+ Mandelbulb) */}
        {dimension >= 3 && (
          <Section title="Power" defaultOpen={true}>
            {/* Main Power Control */}
            <div className="space-y-2">
              <label className="text-xs text-text-secondary">
                Mandelbulb Power (n={config.mandelbulbPower})
              </label>
              <ToggleGroup
                options={powerPresets.map((p) => ({
                  value: String(p.value),
                  label: p.label,
                }))}
                value={String(config.mandelbulbPower)}
                onChange={(v) => setMandelbulbPower(parseInt(v, 10))}
                ariaLabel="Mandelbulb power preset"
                data-testid="mandelbulb-power-preset"
              />
              <Slider
                label="Custom Power"
                min={2}
                max={16}
                step={1}
                value={config.mandelbulbPower}
                onChange={setMandelbulbPower}
                showValue
                data-testid="mandelbulb-power-slider"
              />
              <p className="text-xs text-text-tertiary">
                {dimension === 3
                  ? 'Controls the shape of the 3D Mandelbulb fractal'
                  : `Controls the shape of the ${dimension}D Mandelbulb fractal`}
              </p>
            </div>

            {/* Alternate Power (Technique B) */}
            <div className="space-y-3 pt-3 mt-3 border-t border-border-subtle">
              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary font-semibold">Alternate Power</label>
                <ToggleButton
                  pressed={config.alternatePowerEnabled}
                  onToggle={() => setAlternatePowerEnabled(!config.alternatePowerEnabled)}
                  className="text-xs px-2 py-1 h-auto"
                  ariaLabel="Toggle alternate power"
                  data-testid="mandelbulb-alternate-power-toggle"
                >
                  {config.alternatePowerEnabled ? 'ON' : 'OFF'}
                </ToggleButton>
              </div>
              {config.alternatePowerEnabled && (
                <div className="space-y-3 pl-2 border-l border-border-default">
                  <Slider
                    label="Power 2"
                    min={2}
                    max={16}
                    step={0.1}
                    value={config.alternatePowerValue}
                    onChange={setAlternatePowerValue}
                    showValue
                    data-testid="mandelbulb-alternate-power-value"
                  />
                  <Slider
                    label="Blend"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.alternatePowerBlend}
                    onChange={setAlternatePowerBlend}
                    showValue
                    data-testid="mandelbulb-alternate-power-blend"
                  />
                  <p className="text-xs text-text-tertiary">
                    Blend between two power values for unique hybrid shapes
                  </p>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Slice Parameters - shown for 4D+ */}
        {dimension >= 4 && (
            <Section 
            title={`Cross Section (${dimension - 3} dim${dimension > 4 ? 's' : ''})`}
            defaultOpen={true}
            onReset={() => resetMandelbulbParameters()}
            >
            {Array.from({ length: dimension - 3 }, (_, i) => (
                <Slider
                key={`slice-dim-${i + 3}`}
                label={`Dim ${i + 3}`}
                min={-2.0}
                max={2.0}
                step={0.1}
                value={config.parameterValues[i] ?? 0}
                onChange={(v) => setMandelbulbParameterValue(i, v)}
                showValue
                data-testid={`mandelbulb-slice-dim-${i + 3}`}
                />
            ))}
            <p className="text-xs text-text-tertiary">
                Explore different {dimension}D cross-sections
            </p>
            </Section>
        )}

      {/* Render Mode Info */}
      <div className="px-4 py-2 text-xs text-text-secondary border-t border-border-subtle">
        <p>Rendering: GPU Ray Marching</p>
      </div>
    </div>
  );
};

export const MandelbulbControls = React.memo(MandelbulbControlsComponent);
MandelbulbControls.displayName = 'MandelbulbControls';
