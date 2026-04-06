/**
 * PauliAnimationDrawer Component
 *
 * Animation/simulation controls for Pauli spinor mode, displayed in the
 * TimelineControls bottom drawer.
 *
 * Controls:
 * - Time step (dt) and steps per frame — simulation speed
 * - Slice animation (4D+) — dimensional sweep controls
 *
 * Pauli is a compute-based mode: the GPU evolves the spinor via split-operator
 * Strang splitting. Field reset is handled by the TimelineControls catch-all
 * reset button.
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Slider } from '@/components/ui/Slider'
import { type ExtendedObjectState, useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

import { AnimationDrawerContainer } from './AnimationDrawerContainer'
import { DrawerSection } from './DrawerSection'

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
    } = useExtendedObjectStore(
      useShallow((state: ExtendedObjectState) => ({
        config: state.pauliSpinor,
        setDt: state.setPauliDt,
        setStepsPerFrame: state.setPauliStepsPerFrame,
        setSliceAnimationEnabled: state.setPauliSliceAnimationEnabled,
        setSliceSpeed: state.setPauliSliceSpeed,
        setSliceAmplitude: state.setPauliSliceAmplitude,
      }))
    )

    return (
      <AnimationDrawerContainer onClose={onClose} data-testid="pauli-animation-drawer">
        {/* Simulation Speed */}
        <DrawerSection title="Simulation" testId="animation-panel-simulationSpeed">
          <Slider
            label="Time Step (dt)"
            min={0.0001}
            max={0.05}
            step={0.0001}
            value={config.dt}
            onChange={setDt}
            tooltip="Integration time step. Smaller values improve accuracy but slow evolution. Too large may cause numerical instability."
            showValue
          />
          <Slider
            label="Steps / Frame"
            min={1}
            max={16}
            step={1}
            tooltip="Number of integration steps computed per animation frame. Higher values evolve the simulation faster."
            value={config.stepsPerFrame}
            onChange={setStepsPerFrame}
            showValue
          />
        </DrawerSection>

        {/* Slice Animation - 4D+ only */}
        {dimension >= 4 && (
          <DrawerSection
            title="Dimensional Sweeps"
            enabled={config.sliceAnimationEnabled}
            onToggle={(v) => setSliceAnimationEnabled(v)}
            toggleAriaLabel="Toggle slice animation"
            testId="animation-panel-sliceAnimation"
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
          </DrawerSection>
        )}
      </AnimationDrawerContainer>
    )
  }
)

PauliAnimationDrawer.displayName = 'PauliAnimationDrawer'

export default PauliAnimationDrawer
