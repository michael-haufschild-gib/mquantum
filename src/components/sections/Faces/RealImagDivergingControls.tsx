import { ColorPicker } from '@/components/ui/ColorPicker'
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { ColorAlgorithm } from '@/rendering/shaders/palette'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

const DIVERGING_MODE_OPTIONS: { value: ColorAlgorithm; label: string }[] = [
  { value: 'realDiverging', label: 'Re(ψ)' },
  { value: 'imagDiverging', label: 'Im(ψ)' },
]

export const RealImagDivergingControls: React.FC = React.memo(() => {
  const selector = useShallow((state: AppearanceSlice) => ({
    colorAlgorithm: state.colorAlgorithm,
    setColorAlgorithm: state.setColorAlgorithm,
    divergingPsi: state.divergingPsi,
    setDivergingPsiSettings: state.setDivergingPsiSettings,
  }))
  const { colorAlgorithm, setColorAlgorithm, divergingPsi, setDivergingPsiSettings } =
    useAppearanceStore(selector)

  const handleModeChange = useCallback(
    (value: ColorAlgorithm) => {
      if (value === 'realDiverging' || value === 'imagDiverging') {
        setColorAlgorithm(value)
      }
    },
    [setColorAlgorithm]
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

  const selectedMode: ColorAlgorithm =
    colorAlgorithm === 'imagDiverging' ? 'imagDiverging' : 'realDiverging'

  return (
    <div className="space-y-4">
      <ToggleGroup
        options={DIVERGING_MODE_OPTIONS}
        value={selectedMode}
        onChange={handleModeChange}
        ariaLabel="Signed component mode"
        data-testid="diverging-component-mode"
      />

      <ColorPicker
        label="Zero (Neutral)"
        value={divergingPsi.neutralColor}
        onChange={handleNeutralColor}
        disableAlpha={true}
      />

      <ColorPicker
        label="Positive Wing"
        value={divergingPsi.positiveColor}
        onChange={handlePositiveColor}
        disableAlpha={true}
      />

      <ColorPicker
        label="Negative Wing"
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
      />
    </div>
  )
})

RealImagDivergingControls.displayName = 'RealImagDivergingControls'
