/**
 * BlackHoleControls Component
 *
 * Controls for configuring n-dimensional black hole visualization.
 * Provides artist-friendly controls for:
 * - Basic parameters (horizon size, gravity, manifold)
 * - Photon shell glow
 * - Lensing strength
 * - Cross-section slices for 4D+
 *
 * @see docs/prd/ndimensional-visualizer.md
 */

import { Section } from '@/components/sections/Section';
import { Slider } from '@/components/ui/Slider';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';

/**
 * Props for the BlackHoleControls component.
 */
export interface BlackHoleControlsProps {
  /**
   * Optional CSS class name for additional styling.
   * Applied to the root container element.
   */
  className?: string;
}

/**
 * BlackHoleControls component
 *
 * Provides controls for black hole visualization:
 * - Basic parameters (horizon, gravity, manifold)
 * - Slice parameters for 4D+
 *
 * @param props - Component props
 * @param props.className - Optional CSS class name
 * @returns React component
 */
export const BlackHoleControls: React.FC<BlackHoleControlsProps> = React.memo(({
  className = '',
}) => {
  // Consolidate extended object store selectors with useShallow
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.blackhole,
    // Basic settings
    setHorizonRadius: state.setBlackHoleHorizonRadius,
    setSpin: state.setBlackHoleSpin,
    setManifoldThickness: state.setBlackHoleManifoldThickness,
    setDiskOuterRadiusMul: state.setBlackHoleDiskOuterRadiusMul,
    // Cross-section
    setParameterValue: state.setBlackHoleParameterValue,
    resetParameters: state.resetBlackHoleParameters,
  }));

  const {
    config,
    setHorizonRadius,
    setSpin,
    setManifoldThickness,
    setDiskOuterRadiusMul,
    setParameterValue,
    resetParameters,
  } = useExtendedObjectStore(extendedObjectSelector);

  // Get current dimension for cross-section controls
  const dimension = useGeometryStore((state) => state.dimension);

  return (
    <div className={className} data-testid="blackhole-controls">
      {/* Geometry Settings */}
      <Section title="Geometry" defaultOpen={true}>
        <Slider
          label="Horizon Radius"
          min={0.1}
          max={5.0}
          step={0.1}
          value={config.horizonRadius}
          onChange={setHorizonRadius}
          showValue
          data-testid="blackhole-horizon-radius"
        />

        <Slider
          label="Spin (Kerr)"
          min={0}
          max={0.998}
          step={0.001}
          value={config.spin}
          onChange={setSpin}
          showValue
          tooltip="Determines event horizon size, ISCO, and photon sphere"
          data-testid="blackhole-spin"
        />

        <Slider
          label="Disk Thickness"
          min={0.01}
          max={1.0}
          step={0.01}
          value={config.manifoldThickness}
          onChange={setManifoldThickness}
          showValue
          data-testid="blackhole-manifold-thickness"
        />

        <Slider
          label="Disk Outer Radius"
          min={3}
          max={30}
          step={1}
          value={config.diskOuterRadiusMul}
          onChange={setDiskOuterRadiusMul}
          showValue
          tooltip="Accretion disk outer edge (artistic choice)"
          data-testid="blackhole-outer-radius"
        />
      </Section>

      {/* Cross Section - 4D+ */}
      {dimension >= 4 && (
        <Section
          title={`Cross Section (${dimension - 3} dim${dimension > 4 ? 's' : ''})`}
          defaultOpen={true}
          onReset={() => resetParameters()}
        >
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
              data-testid={`blackhole-slice-dim-${i + 4}`}
            />
          ))}
          <p className="text-xs text-text-tertiary">
            Explore different {dimension}D cross-sections
          </p>
        </Section>
      )}

      {/* Rendering Info */}
      <div className="px-4 py-2 text-xs text-text-secondary border-t border-border-subtle">
        <p>Rendering: Volumetric Raymarching</p>
        <p className="text-text-tertiary mt-1">
          {dimension}D black hole with gravitational lensing
        </p>
      </div>
    </div>
  );
});

BlackHoleControls.displayName = 'BlackHoleControls';

export default BlackHoleControls;
