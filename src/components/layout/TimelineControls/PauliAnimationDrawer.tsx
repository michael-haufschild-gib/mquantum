/**
 * PauliAnimationDrawer Component
 *
 * Animation/simulation controls for Pauli spinor mode, displayed in the
 * TimelineControls bottom drawer.
 *
 * Controls:
 * - Time step (dt) and steps per frame — simulation speed
 * - Reset button — reinitialize the spinor field
 *
 * Pauli is a compute-based mode: the GPU evolves the spinor via split-operator
 * Strang splitting. Unlike HO/hydrogen modes, there are no inline wavefunction
 * effects (interference, probability flow, probability current).
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { Slider } from '@/components/ui/Slider'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { AnimationDrawerContainer } from './AnimationDrawerContainer'

/**
 * Props for the PauliAnimationDrawer component.
 */
export interface PauliAnimationDrawerProps {
  /** Callback to close the drawer */
  onClose?: () => void
}

/**
 * Simulation controls for the Pauli spinor compute pass.
 *
 * @param props - Component props
 * @returns React component
 */
export const PauliAnimationDrawer: React.FC<PauliAnimationDrawerProps> = React.memo(
  ({ onClose }) => {
    const dimension = useGeometryStore((s) => s.dimension)

    const {
      config,
      setDt,
      setStepsPerFrame,
      setSliceAnimationEnabled,
      setSliceSpeed,
      setSliceAmplitude,
      resetField,
    } = useExtendedObjectStore(
      useShallow((state: ExtendedObjectState) => ({
        config: state.pauliSpinor,
        setDt: state.setPauliDt,
        setStepsPerFrame: state.setPauliStepsPerFrame,
        setSliceAnimationEnabled: state.setPauliSliceAnimationEnabled,
        setSliceSpeed: state.setPauliSliceSpeed,
        setSliceAmplitude: state.setPauliSliceAmplitude,
        resetField: state.resetPauliField,
      }))
    )

    return (
      <AnimationDrawerContainer onClose={onClose} data-testid="pauli-animation-drawer">
        {/* Simulation Speed */}
        <div className="space-y-4" data-testid="animation-panel-simulationSpeed">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              Simulation
            </label>
          </div>
          <div className="space-y-3">
            <Slider
              label="Time Step (dt)"
              min={0.0001}
              max={0.05}
              step={0.0001}
              value={config.dt}
              onChange={setDt}
              showValue
            />
            <Slider
              label="Steps / Frame"
              min={1}
              max={16}
              step={1}
              value={config.stepsPerFrame}
              onChange={setStepsPerFrame}
              showValue
            />
          </div>
        </div>

        {/* Reset */}
        <div className="space-y-4" data-testid="animation-panel-reset">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              Field Reset
            </label>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={resetField}
            className="w-full"
          >
            <Icon name="redo" size={12} className="mr-2" />
            Reinitialize Spinor
          </Button>
          <p className="text-xs text-text-tertiary">
            Resets the wavefunction to its initial Gaussian wavepacket with the current spin and field settings.
          </p>
        </div>

        {/* Slice Animation - 4D+ only */}
        {dimension >= 4 && (
          <div className="space-y-4" data-testid="animation-panel-sliceAnimation">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                Dimensional Sweeps
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

PauliAnimationDrawer.displayName = 'PauliAnimationDrawer'

export default PauliAnimationDrawer
