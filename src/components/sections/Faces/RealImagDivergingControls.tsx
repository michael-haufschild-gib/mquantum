import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ColorPicker } from '@/components/ui/ColorPicker'
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { DivergingPsiSettings } from '@/rendering/shaders/palette'
import { type AppearanceSlice, useAppearanceStore } from '@/stores/appearanceStore'

const COMPONENT_OPTIONS: { value: DivergingPsiSettings['component']; label: string }[] = [
  { value: 'real', label: 'Re(ψ)' },
  { value: 'imag', label: 'Im(ψ)' },
]

export const RealImagDivergingControls: React.FC = React.memo(() => {
  const selector = useShallow((state: AppearanceSlice) => ({
    divergingPsi: state.divergingPsi,
    setDivergingPsiSettings: state.setDivergingPsiSettings,
  }))
  const { divergingPsi, setDivergingPsiSettings } = useAppearanceStore(selector)

  const handleComponentChange = useCallback(
    (value: DivergingPsiSettings['component']) => {
      setDivergingPsiSettings({ component: value })
    },
    [setDivergingPsiSettings]
  )

  const handleNeutralColor = useCallback(
    (value: string) => {
      setDivergingPsiSettings({ neutralColor: value })
    },
    [setDivergingPsiSettings]
  )

  const handlePositiveColor = useCallback(
    (value: string) => {
      setDivergingPsiSettings({ positiveColor: value })
    },
    [setDivergingPsiSettings]
  )

  const handleNegativeColor = useCallback(
    (value: string) => {
      setDivergingPsiSettings({ negativeColor: value })
    },
    [setDivergingPsiSettings]
  )

  const handleIntensityFloor = useCallback(
    (value: number) => {
      setDivergingPsiSettings({ intensityFloor: value })
    },
    [setDivergingPsiSettings]
  )

  return (
    <div className="space-y-4">
      <ToggleGroup
        options={COMPONENT_OPTIONS}
        value={divergingPsi.component}
        onChange={handleComponentChange}
        ariaLabel="Signed component mode"
        tooltip="Which component of the complex wavefunction to visualize with the diverging colormap."
        data-testid="diverging-component-mode"
      />

      <ColorPicker
        label="Zero (Neutral)"
        tooltip="Color shown where the selected component is near zero."
        value={divergingPsi.neutralColor}
        onChange={handleNeutralColor}
        disableAlpha={true}
      />

      <ColorPicker
        label="Positive Wing"
        tooltip="Color for positive values of the selected wavefunction component."
        value={divergingPsi.positiveColor}
        onChange={handlePositiveColor}
        disableAlpha={true}
      />

      <ColorPicker
        label="Negative Wing"
        tooltip="Color for negative values of the selected wavefunction component."
        value={divergingPsi.negativeColor}
        onChange={handleNegativeColor}
        disableAlpha={true}
      />

      <Slider
        label="Intensity Floor"
        min={0}
        max={1}
        step={0.01}
        value={divergingPsi.intensityFloor}
        onChange={handleIntensityFloor}
        showValue
        tooltip="Minimum brightness for near-zero regions of the diverging colormap"
      />
    </div>
  )
})

RealImagDivergingControls.displayName = 'RealImagDivergingControls'
