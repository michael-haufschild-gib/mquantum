import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ColorPicker } from '@/components/ui/ColorPicker'
import { type AppearanceSlice, useAppearanceStore } from '@/stores/appearanceStore'

/** Controls for the signed phase diverging colormap: neutral, positive, and negative wing colors. */
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
        tooltip="Color shown where the wavefunction phase crosses zero."
        value={phaseDiverging.neutralColor}
        onChange={handleNeutralColor}
        disableAlpha={true}
      />

      <ColorPicker
        label="Positive Wing"
        tooltip="Color for positive phase values of the wavefunction."
        value={phaseDiverging.positiveColor}
        onChange={handlePositiveColor}
        disableAlpha={true}
      />

      <ColorPicker
        label="Negative Wing"
        tooltip="Color for negative phase values of the wavefunction."
        value={phaseDiverging.negativeColor}
        onChange={handleNegativeColor}
        disableAlpha={true}
      />
    </div>
  )
})

SignedPhaseDivergingControls.displayName = 'SignedPhaseDivergingControls'
