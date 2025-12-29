/**
 * Progressive Refinement Controls Component
 * Controls for progressive quality improvement after interaction stops
 */

import { Switch } from '@/components/ui/Switch';
import { usePerformanceStore } from '@/stores/performanceStore';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';

/**
 * Get stage label for display.
 * @param stage - The refinement stage name
 * @returns Human-readable percentage label
 */
function getStageLabel(stage: string): string {
  switch (stage) {
    case 'low':
      return '25';
    case 'medium':
      return '50';
    case 'high':
      return '75';
    case 'final':
      return '100';
    default:
      return stage;
  }
}

/**
 * Progressive refinement controls for the Performance section.
 * Shows quality refinement stages after interaction stops.
 * @returns The progressive refinement controls UI component
 */
export const ProgressiveRefinementControls: React.FC = () => {
  const { enabled, setEnabled, stage, progress } = usePerformanceStore(
    useShallow((s) => ({
      enabled: s.progressiveRefinementEnabled,
      setEnabled: s.setProgressiveRefinementEnabled,
      stage: s.refinementStage,
      progress: s.refinementProgress,
    }))
  );

  return (
    <div className="space-y-3">
      <Switch
        checked={enabled}
        onCheckedChange={setEnabled}
        label="Progressive Refinement"
        data-testid="progressive-refinement-toggle"
      />

      {enabled && (
        <div className="ml-4 mt-2">
          {/* Progress bar */}
          <div className="relative h-2 bg-panel-bg rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-accent transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Stage indicator */}
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-text-tertiary">
              Quality: {getStageLabel(stage)}
            </span>
            <span className="text-xs text-text-tertiary">{Math.round(progress)}%</span>
          </div>

          {/* Stage dots */}
          <div className="flex justify-between mt-2">
            {['low', 'medium', 'high', 'final'].map((s, i) => {
              const stageIndex = ['low', 'medium', 'high', 'final'].indexOf(
                stage
              );
              const isActive = i <= stageIndex;
              const isCurrent = s === stage;

              return (
                <div
                  key={s}
                  className={`flex flex-col items-center ${isCurrent ? 'text-accent' : isActive ? 'text-text-secondary' : 'text-text-tertiary'}`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-accent shadow-[0_0_6px_var(--color-accent)]' : isActive ? 'bg-text-secondary' : 'bg-panel-bg'}`}
                  />
                  <span className="text-[10px] mt-1">
                    {getStageLabel(s)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
