import { ColorPicker } from '@/components/ui/ColorPicker'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

export const SignedPhaseDivergingControls: React.FC = React.memo(() => {
  const selector = useShallow((state: AppearanceSlice) => ({
    phaseDiverging: state.phaseDiverging,
    setPhaseDivergingSettings: state.setPhaseDivergingSettings,
  }))
  const { phaseDiverging, setPhaseDivergingSettings } = useAppearanceStore(selector)

  const handleNeutralColor = useCallback(
    (value: string) => {
      setPhaseDivergingSettings({ neutralColor: value })
    },
    [setPhaseDivergingSettings]
  )

  const handlePositiveColor = useCallback(
    (value: string) => {
      setPhaseDivergingSettings({ positiveColor: value })
    },
    [setPhaseDivergingSettings]
  )

  const handleNegativeColor = useCallback(
    (value: string) => {
      setPhaseDivergingSettings({ negativeColor: value })
    },
    [setPhaseDivergingSettings]
  )

  return (
    <div className="space-y-4">
      <ColorPicker
        label="Zero (Neutral)"
        value={phaseDiverging.neutralColor}
        onChange={handleNeutralColor}
        disableAlpha={true}
      />

      <ColorPicker
        label="Positive Wing"
        value={phaseDiverging.positiveColor}
        onChange={handlePositiveColor}
        disableAlpha={true}
      />

      <ColorPicker
        label="Negative Wing"
        value={phaseDiverging.negativeColor}
        onChange={handleNegativeColor}
        disableAlpha={true}
      />
    </div>
  )
})

SignedPhaseDivergingControls.displayName = 'SignedPhaseDivergingControls'
