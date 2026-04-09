/**
 * Background Color Controls
 * Controls for scene background color
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ColorPicker } from '@/components/ui/ColorPicker'
import { type EnvironmentStore, useEnvironmentStore } from '@/stores/environmentStore'

export const BackgroundColorControls: React.FC = React.memo(() => {
  const backgroundSelector = useShallow((state: EnvironmentStore) => ({
    backgroundColor: state.backgroundColor,
    setBackgroundColor: state.setBackgroundColor,
  }))
  const { backgroundColor, setBackgroundColor } = useEnvironmentStore(backgroundSelector)

  return (
    <div className="space-y-4">
      <ColorPicker
        label="Background Color"
        tooltip="Scene background color visible behind the quantum object and skybox."
        value={backgroundColor}
        onChange={setBackgroundColor}
        disableAlpha={true}
      />
    </div>
  )
})

BackgroundColorControls.displayName = 'BackgroundColorControls'
