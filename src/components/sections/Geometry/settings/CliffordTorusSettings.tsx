import { Slider } from '@/components/ui/Slider';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';

/**
 * Clifford Torus settings controls
 *
 * Simplified Clifford Torus settings - flat visualization only.
 * Independent circles in perpendicular planes.
 * @returns Clifford torus settings controls
 */
export function CliffordTorusSettings() {
  const dimension = useGeometryStore((state) => state.dimension);

  // Consolidate extended object store selectors with useShallow
  const {
    config,
    setRadius,
    setMode,
    setResolutionU,
    setResolutionV,
    setStepsPerCircle,
  } = useExtendedObjectStore(
    useShallow((state: ExtendedObjectState) => ({
      config: state.cliffordTorus,
      setRadius: state.setCliffordTorusRadius,
      setMode: state.setCliffordTorusMode,
      setResolutionU: state.setCliffordTorusResolutionU,
      setResolutionV: state.setCliffordTorusResolutionV,
      setStepsPerCircle: state.setCliffordTorusStepsPerCircle,
    }))
  );

  // Calculate max k for flat/generalized mode
  const maxK = Math.floor(dimension / 2);

  // Update flat mode internal setting based on dimension
  React.useEffect(() => {
    const effectiveMode = dimension === 4 ? 'classic' : 'generalized';
    if (config.mode !== effectiveMode) {
      setMode(effectiveMode);
    }
  }, [dimension, config.mode, setMode]);

  // Calculate point count
  const getPointCount = () => {
    if (dimension === 4) {
      return config.resolutionU * config.resolutionV;
    }
    return Math.pow(config.stepsPerCircle, Math.min(config.k, maxK));
  };

  const pointCount = getPointCount();

  return (
    <div className="space-y-4" data-testid="clifford-torus-settings">
      {/* Mode description */}
      <div className="text-xs text-text-secondary">
        <span>Independent circles in perpendicular planes</span>
      </div>

      <Slider
        label="Radius"
        min={0.5}
        max={6.0}
        step={0.1}
        value={config.radius}
        onChange={setRadius}
        showValue
        data-testid="clifford-radius"
      />

      {/* 4D Classic mode */}
      {dimension === 4 && (
        <>
          <Slider
            label="Resolution U"
            min={8}
            max={64}
            step={4}
            value={config.resolutionU}
            onChange={setResolutionU}
            showValue
            data-testid="clifford-res-u"
          />
          <Slider
            label="Resolution V"
            min={8}
            max={64}
            step={4}
            value={config.resolutionV}
            onChange={setResolutionV}
            showValue
            data-testid="clifford-res-v"
          />
        </>
      )}

      {/* Generalized mode (non-4D) */}
      {dimension !== 4 && (
        <Slider
          label="Steps Per Circle"
          min={4}
          max={32}
          step={2}
          value={config.stepsPerCircle}
          onChange={setStepsPerCircle}
          showValue
          data-testid="clifford-steps"
        />
      )}

      {/* Point count and warnings */}
      <p className="text-xs text-text-secondary">
        {pointCount.toLocaleString()} points
      </p>
      {pointCount > 10000 && (
        <p className="text-xs text-warning">
          High point count may affect performance
        </p>
      )}
    </div>
  );
}
