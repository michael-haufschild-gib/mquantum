/**
 * MandelbulbAnimationDrawer Component
 *
 * Animation controls for Mandelbulb/Mandelbulb fractal, displayed in the
 * TimelineControls bottom drawer.
 *
 * Animation Systems:
 * - Power Animation: Smoothly oscillates the power value
 * - Phase Shifts: Adds phase offsets to create flowing distortions
 * - Slice Animation: 4D+ only, animates the 4D slice position
 *
 * @see docs/prd/ndimensional-visualizer.md
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { Slider } from '@/components/ui/Slider'
import { AnimationDrawerContainer } from './AnimationDrawerContainer'

export interface MandelbulbAnimationDrawerProps {
  /** Callback to close the drawer */
  onClose?: () => void
}

/**
 * MandelbulbAnimationDrawer component
 *
 * Renders animation controls for Mandelbulb/Mandelbulb fractals within
 * the timeline drawer. Uses consistent styling with other animation
 * system panels.
 *
 * @returns React component
 */
export const MandelbulbAnimationDrawer: React.FC<MandelbulbAnimationDrawerProps> = React.memo(
  ({ onClose }) => {
    const dimension = useGeometryStore((state) => state.dimension)

    // Get config and setters from store
    const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
      config: state.mandelbulb,
      // Power Animation
      setPowerAnimationEnabled: state.setMandelbulbPowerAnimationEnabled,
      setPowerMin: state.setMandelbulbPowerMin,
      setPowerMax: state.setMandelbulbPowerMax,
      setPowerSpeed: state.setMandelbulbPowerSpeed,
      // Phase Shifts
      setPhaseShiftEnabled: state.setMandelbulbPhaseShiftEnabled,
      setPhaseSpeed: state.setMandelbulbPhaseSpeed,
      setPhaseAmplitude: state.setMandelbulbPhaseAmplitude,
      // Slice Animation
      setSliceAnimationEnabled: state.setMandelbulbSliceAnimationEnabled,
      setSliceSpeed: state.setMandelbulbSliceSpeed,
      setSliceAmplitude: state.setMandelbulbSliceAmplitude,
    }))

    const {
      config,
      // Power Animation
      setPowerAnimationEnabled,
      setPowerMin,
      setPowerMax,
      setPowerSpeed,
      // Phase Shifts
      setPhaseShiftEnabled,
      setPhaseSpeed,
      setPhaseAmplitude,
      // Slice Animation
      setSliceAnimationEnabled,
      setSliceSpeed,
      setSliceAmplitude,
    } = useExtendedObjectStore(extendedObjectSelector)

    return (
      <AnimationDrawerContainer onClose={onClose} data-testid="mandelbulb-animation-drawer">
        {/* Power Animation */}
        <div className="space-y-4" data-testid="animation-panel-powerAnimation">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              Power Animation
            </label>
            <ToggleButton
              pressed={config.powerAnimationEnabled}
              onToggle={() => setPowerAnimationEnabled(!config.powerAnimationEnabled)}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle power animation"
            >
              {config.powerAnimationEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>

          <div
            className={`space-y-3 ${!config.powerAnimationEnabled ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Slider
              label="Min"
              min={2}
              max={16}
              step={0.5}
              value={config.powerMin}
              onChange={setPowerMin}
              showValue
            />
            <Slider
              label="Max"
              min={3}
              max={24}
              step={0.5}
              value={config.powerMax}
              onChange={setPowerMax}
              showValue
            />
            <Slider
              label="Speed"
              min={0.01}
              max={0.2}
              step={0.01}
              value={config.powerSpeed}
              onChange={setPowerSpeed}
              showValue
            />
          </div>
        </div>

        {/* Phase Shifts */}
        <div className="space-y-4" data-testid="animation-panel-phaseShifts">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              Phase Shifts
            </label>
            <ToggleButton
              pressed={config.phaseShiftEnabled}
              onToggle={() => setPhaseShiftEnabled(!config.phaseShiftEnabled)}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle phase shifts"
            >
              {config.phaseShiftEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>

          <div
            className={`space-y-3 ${!config.phaseShiftEnabled ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Slider
              label="Amplitude"
              min={0}
              max={0.785}
              step={0.01}
              value={config.phaseAmplitude}
              onChange={setPhaseAmplitude}
              showValue
            />
            <Slider
              label="Speed"
              min={0.01}
              max={0.2}
              step={0.01}
              value={config.phaseSpeed}
              onChange={setPhaseSpeed}
              showValue
            />
          </div>
        </div>

        {/* Slice Animation - 4D+ only */}
        {dimension >= 4 && (
          <div className="space-y-4" data-testid="animation-panel-sliceAnimation">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                Slice Animation
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

            <div
              className={`space-y-3 ${!config.sliceAnimationEnabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Slider
                label="Amplitude"
                min={0.1}
                max={1.0}
                step={0.05}
                value={config.sliceAmplitude}
                onChange={setSliceAmplitude}
                showValue
              />
              <Slider
                label="Speed"
                min={0.01}
                max={0.1}
                step={0.01}
                value={config.sliceSpeed}
                onChange={setSliceSpeed}
                showValue
              />
            </div>
          </div>
        )}
      </AnimationDrawerContainer>
    )
  }
)

MandelbulbAnimationDrawer.displayName = 'MandelbulbAnimationDrawer'

export default MandelbulbAnimationDrawer
