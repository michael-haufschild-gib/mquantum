/**
 * Temporal Reprojection Controls Component
 * Controls for reusing previous frame depth data (fractals only)
 */

import { Switch } from '@/components/ui/Switch';
import { usePerformanceStore } from '@/stores/performanceStore';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';

/**
 * Temporal reprojection controls for the Performance section.
 * Only affects fractal objects (Mandelbulb).
 * @returns The temporal reprojection controls UI component
 */
export const TemporalReprojectionControls: React.FC = () => {
  const { enabled, setEnabled } = usePerformanceStore(
    useShallow((s) => ({
      enabled: s.temporalReprojectionEnabled,
      setEnabled: s.setTemporalReprojectionEnabled,
    }))
  );

  return (
    <div className="space-y-2">
      <Switch
        checked={enabled}
        onCheckedChange={setEnabled}
        label="Temporal Reprojection"
        data-testid="temporal-reprojection-toggle"
      />
      <p className="text-xs text-text-tertiary ml-4">
        Fractals only. 30-50% faster during motion.
      </p>
    </div>
  );
};
