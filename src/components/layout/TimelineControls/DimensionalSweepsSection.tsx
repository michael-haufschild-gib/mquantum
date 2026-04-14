/**
 * DimensionalSweepsSection
 *
 * 4D+ hyper-slice animation controls shared by the Schrödinger and Pauli
 * animation drawers. Oscillates the slice position for the 4D cross-section
 * sweep with configurable amplitude and speed.
 *
 * Render the section conditionally (parent guards on `dimension >= 4`).
 */

import React from 'react'

import { Slider } from '@/components/ui/Slider'

import { DrawerSection } from './DrawerSection'

/** Props for the shared dimensional sweeps animation section. */
export interface DimensionalSweepsSectionProps {
  /** Whether the slice animation is enabled. */
  enabled: boolean
  /** How far the slice oscillates from the origin (wavefunction units). */
  amplitude: number
  /** Oscillation rate of the slice position. */
  speed: number
  /** Toggle the slice animation on/off. */
  onToggle: (enabled: boolean) => void
  /** Update amplitude. */
  onChangeAmplitude: (value: number) => void
  /** Update speed. */
  onChangeSpeed: (value: number) => void
}

/**
 * Shared 4D+ slice animation controls.
 */
export const DimensionalSweepsSection: React.FC<DimensionalSweepsSectionProps> = ({
  enabled,
  amplitude,
  speed,
  onToggle,
  onChangeAmplitude,
  onChangeSpeed,
}) => {
  return (
    <DrawerSection
      title="Dimensional Sweeps"
      enabled={enabled}
      onToggle={onToggle}
      toggleTooltip="Continuously oscillates the 4D slice position so the rendered 3D cross-section sweeps through different hyperplanar cuts of the N-dimensional wavefunction over time."
      toggleAriaLabel="Toggle dimensional sweeps"
      testId="animation-panel-sliceAnimation"
    >
      <Slider
        label="Amplitude"
        min={0.1}
        max={1.0}
        step={0.05}
        tooltip="How far the 4D slice position oscillates from the origin (in wavefunction units). Large values sweep into the outer regions of the hypervolume, revealing more exotic cross-sections; small values stay near the central slice."
        value={amplitude}
        onChange={onChangeAmplitude}
        showValue
      />
      <Slider
        label="Speed"
        min={0.01}
        max={0.1}
        step={0.01}
        tooltip="Oscillation rate of the slice position. Slow values give a leisurely drift through dimensional layers; fast values cycle rapidly through the full amplitude, blurring distinctions between cross-sections."
        value={speed}
        onChange={onChangeSpeed}
        showValue
      />
    </DrawerSection>
  )
}
