/**
 * BlackHoleAnimationDrawer Component
 *
 * Animation controls for black hole visualization, displayed in the
 * TimelineControls bottom drawer.
 *
 * Animation Systems:
 * - Pulse Animation: Pulsating manifold intensity
 * - Slice Animation: 4D+ only, animates dimensional slices
 *
 * @see docs/prd/ndimensional-visualizer.md
 */

import { Slider } from '@/components/ui/Slider';
import { ToggleButton } from '@/components/ui/ToggleButton';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AnimationDrawerContainer } from './AnimationDrawerContainer';

export interface BlackHoleAnimationDrawerProps {
  /** Callback to close the drawer */
  onClose?: () => void;
}

/**
 * BlackHoleAnimationDrawer component
 *
 * Renders animation controls for black hole visualization within
 * the timeline drawer. Uses consistent styling with other animation
 * system panels.
 *
 * @returns React component
 */
export const BlackHoleAnimationDrawer: React.FC<BlackHoleAnimationDrawerProps> = React.memo(({ onClose }) => {
  const dimension = useGeometryStore((state) => state.dimension);

  // Get config and setters from store
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.blackhole,
    // Time Scale
    setTimeScale: state.setBlackHoleTimeScale,
    // Swirl Amount (visual pattern intensity)
    setSwirlAmount: state.setBlackHoleSwirlAmount,
    // Pulse Animation
    setPulseEnabled: state.setBlackHolePulseEnabled,
    setPulseSpeed: state.setBlackHolePulseSpeed,
    setPulseAmount: state.setBlackHolePulseAmount,
    // Slice Animation
    setSliceAnimationEnabled: state.setBlackHoleSliceAnimationEnabled,
    setSliceSpeed: state.setBlackHoleSliceSpeed,
    setSliceAmplitude: state.setBlackHoleSliceAmplitude,
  }));

  const {
    config,
    setTimeScale,
    setSwirlAmount,
    setPulseEnabled,
    setPulseSpeed,
    setPulseAmount,
    setSliceAnimationEnabled,
    setSliceSpeed,
    setSliceAmplitude,
  } = useExtendedObjectStore(extendedObjectSelector);

  return (
    <AnimationDrawerContainer onClose={onClose} data-testid="blackhole-animation-drawer">
      {/* Time Scale (Always Active) */}
      <div className="space-y-4" data-testid="animation-panel-timeScale">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
            Time Evolution
          </label>
        </div>
        <div className="space-y-3">
          <Slider
            label="Time Scale"
            min={0.1}
            max={3.0}
            step={0.1}
            value={config.timeScale}
            onChange={setTimeScale}
            showValue
          />
        </div>
      </div>

      {/* Slice Animation - 4D+ only */}
      {dimension >= 4 && (
        <div className="space-y-4" data-testid="animation-panel-slice">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              Dimensional Sweep
            </label>
            <ToggleButton
              pressed={config.sliceAnimationEnabled}
              onToggle={() => setSliceAnimationEnabled(!config.sliceAnimationEnabled)}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle slice animation"
            >
              {config.sliceAnimationEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          <div className={`space-y-3 ${!config.sliceAnimationEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <Slider
              label="Speed"
              min={0.01}
              max={0.1}
              step={0.01}
              value={config.sliceSpeed}
              onChange={setSliceSpeed}
              showValue
            />
            <Slider
              label="Amplitude"
              min={0.1}
              max={1.0}
              step={0.05}
              value={config.sliceAmplitude}
              onChange={setSliceAmplitude}
              showValue
            />
          </div>
        </div>
      )}

      {/* Swirl Amount (Spiral pattern intensity) */}
      <div className="space-y-4" data-testid="animation-panel-swirl">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
            Swirl Pattern
          </label>
        </div>
        <div className="space-y-3">
          <Slider
            label="Amount"
            min={0}
            max={2.0}
            step={0.1}
            value={config.swirlAmount}
            onChange={setSwirlAmount}
            showValue
          />
        </div>
      </div>

      {/* Pulse Animation (Intensity Breathing) */}
      <div className="space-y-4" data-testid="animation-panel-pulse">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
            Intensity Pulse
          </label>
          <ToggleButton
            pressed={config.pulseEnabled}
            onToggle={() => setPulseEnabled(!config.pulseEnabled)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle pulse animation"
          >
            {config.pulseEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        <div className={`space-y-3 ${!config.pulseEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <Slider
            label="Speed"
            min={0.1}
            max={2.0}
            step={0.1}
            value={config.pulseSpeed}
            onChange={setPulseSpeed}
            showValue
          />
          <Slider
            label="Amount"
            min={0}
            max={1.0}
            step={0.05}
            value={config.pulseAmount}
            onChange={setPulseAmount}
            showValue
          />
        </div>
      </div>

      {/* Dimension info */}
      <div className="space-y-2 px-1">
        <p className="text-xs text-text-tertiary italic">
          {dimension >= 4
            ? `${dimension}D black hole with dimensional cross-section controls in the Geometry panel.`
            : '3D black hole visualization with gravitational lensing.'}
        </p>
      </div>
    </AnimationDrawerContainer>
  );
});

BlackHoleAnimationDrawer.displayName = 'BlackHoleAnimationDrawer';

export default BlackHoleAnimationDrawer;
