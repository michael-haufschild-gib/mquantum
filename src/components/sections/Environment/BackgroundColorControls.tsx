/**
 * Background Color Controls
 * Controls for scene background color
 */

import { ColorPicker } from '@/components/ui/ColorPicker'
import { useEnvironmentStore, type EnvironmentStore } from '@/stores/environmentStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

export const BackgroundColorControls: React.FC = React.memo(() => {
  const { backgroundColor, setBackgroundColor } = useEnvironmentStore(
    useShallow((state: EnvironmentStore) => ({
      backgroundColor: state.backgroundColor,
      setBackgroundColor: state.setBackgroundColor,
    }))
  )

  return (
    <div className="space-y-4">
      <ColorPicker
        label="Background Color"
        value={backgroundColor}
        onChange={setBackgroundColor}
        disableAlpha={true}
      />
    </div>
  )
})

BackgroundColorControls.displayName = 'BackgroundColorControls'
