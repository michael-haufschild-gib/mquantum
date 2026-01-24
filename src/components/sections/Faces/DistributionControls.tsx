/**
 * Distribution Controls Component
 *
 * Sliders for controlling the distribution curve that remaps input values
 * before palette lookup. Controls power curve, cycles, and offset.
 */

import { Slider } from '@/components/ui/Slider'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface DistributionControlsProps {
  className?: string
}

export const DistributionControls: React.FC<DistributionControlsProps> = React.memo(
  ({ className = '' }) => {
    const appearanceSelector = useShallow((state: AppearanceSlice) => ({
      distribution: state.distribution,
      setDistribution: state.setDistribution,
    }))
    const { distribution, setDistribution } = useAppearanceStore(appearanceSelector)

    const handlePowerChange = useCallback(
      (value: number) => {
        setDistribution({ power: value })
      },
      [setDistribution]
    )

    const handleCyclesChange = useCallback(
      (value: number) => {
        setDistribution({ cycles: value })
      },
      [setDistribution]
    )

    const handleOffsetChange = useCallback(
      (value: number) => {
        setDistribution({ offset: value })
      },
      [setDistribution]
    )

    return (
      <div className={`space-y-4 ${className}`}>
        <div className="text-sm font-medium text-text-secondary mb-2">Distribution</div>

        <Slider
          label="Power"
          min={0.25}
          max={4}
          step={0.05}
          value={distribution.power}
          onChange={handlePowerChange}
          showValue
          tooltip="Power curve: < 1 expands dark tones, > 1 expands light tones"
        />

        <Slider
          label="Cycles"
          min={0.5}
          max={5}
          step={0.1}
          value={distribution.cycles}
          onChange={handleCyclesChange}
          showValue
          tooltip="Number of times the palette repeats across the surface"
        />

        <Slider
          label="Offset"
          min={0}
          max={1}
          step={0.01}
          value={distribution.offset}
          onChange={handleOffsetChange}
          showValue
          tooltip="Shifts the starting point of the color gradient"
        />
      </div>
    )
  }
)

DistributionControls.displayName = 'DistributionControls'
