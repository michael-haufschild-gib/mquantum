/**
 * Background Color Controls
 * Controls for scene background color and skybox blend mode
 */

import { ColorPicker } from '@/components/ui/ColorPicker'
import { Select } from '@/components/ui/Select'
import { type BackgroundBlendMode } from '@/stores/defaults/visualDefaults'
import { useEnvironmentStore, type EnvironmentStore } from '@/stores/environmentStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

const BLEND_MODE_OPTIONS: { value: BackgroundBlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal (Overwrite)' },
  { value: 'screen', label: 'Screen' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'add', label: 'Add' },
]

export const BackgroundColorControls: React.FC = React.memo(() => {
  const {
    backgroundColor,
    backgroundBlendMode,
    skyboxEnabled,
    setBackgroundColor,
    setBackgroundBlendMode,
  } = useEnvironmentStore(
    useShallow((state: EnvironmentStore) => ({
      backgroundColor: state.backgroundColor,
      backgroundBlendMode: state.backgroundBlendMode,
      skyboxEnabled: state.skyboxEnabled,
      setBackgroundColor: state.setBackgroundColor,
      setBackgroundBlendMode: state.setBackgroundBlendMode,
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

      {skyboxEnabled && (
        <Select<BackgroundBlendMode>
          label="Skybox Blend Mode"
          options={BLEND_MODE_OPTIONS}
          value={backgroundBlendMode}
          onChange={setBackgroundBlendMode}
        />
      )}

      {!skyboxEnabled && (
        <p className="text-xs text-text-tertiary">
          Enable a skybox to use blend modes.
        </p>
      )}
    </div>
  )
})

BackgroundColorControls.displayName = 'BackgroundColorControls'
