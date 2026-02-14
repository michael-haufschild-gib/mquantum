/**
 * FX Controls Component (formerly MiscControls)
 *
 * UI controls for post-processing FX effects:
 * - Anti-aliasing method selector: None, FXAA, SMAA
 * - Frame blending settings
 *
 * @see {@link PostProcessing} for the effect implementation
 * @see {@link usePostProcessingStore} for state management
 */

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore'
import { type AntiAliasingMethod } from '@/stores/defaults/visualDefaults'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface MiscControlsProps {
  className?: string
}

/** Anti-aliasing method options for the select dropdown */
const ANTI_ALIASING_OPTIONS: SelectOption<AntiAliasingMethod>[] = [
  { value: 'none', label: 'None' },
  { value: 'fxaa', label: 'FXAA' },
  { value: 'smaa', label: 'SMAA' },
]

/**
 * FX Controls component for post-processing effects.
 */
export const MiscControls: React.FC<MiscControlsProps> = React.memo(({ className = '' }) => {
  const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
    antiAliasingMethod: state.antiAliasingMethod,
    setAntiAliasingMethod: state.setAntiAliasingMethod,
    frameBlendingEnabled: state.frameBlendingEnabled,
    setFrameBlendingEnabled: state.setFrameBlendingEnabled,
    frameBlendingFactor: state.frameBlendingFactor,
    setFrameBlendingFactor: state.setFrameBlendingFactor,
  }))
  const {
    antiAliasingMethod,
    setAntiAliasingMethod,
    frameBlendingEnabled,
    setFrameBlendingEnabled,
    frameBlendingFactor,
    setFrameBlendingFactor,
  } = usePostProcessingStore(postProcessingSelector)

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Anti-aliasing */}
      <ControlGroup title="Anti-aliasing">
        <Select<AntiAliasingMethod>
          label=""
          options={ANTI_ALIASING_OPTIONS}
          value={antiAliasingMethod}
          onChange={setAntiAliasingMethod}
          data-testid="anti-aliasing-select"
        />
      </ControlGroup>

      {/* Frame Blending */}
      <ControlGroup title="Frame Blending">
        <Switch
          checked={frameBlendingEnabled}
          onCheckedChange={setFrameBlendingEnabled}
          label="Enable Frame Blending"
          data-testid="frame-blending-switch"
        />
        <div className={!frameBlendingEnabled ? 'opacity-50 pointer-events-none' : ''}>
          <Slider
            label="Blend Factor"
            min={0}
            max={0.95}
            step={0.05}
            value={frameBlendingFactor}
            onChange={setFrameBlendingFactor}
            showValue
            data-testid="frame-blending-factor-slider"
          />
        </div>
        <p className="text-[10px] text-text-secondary mt-1">
          Blends frames for smoother motion. Higher values may cause ghosting.
        </p>
      </ControlGroup>
    </div>
  )
})

MiscControls.displayName = 'MiscControls'
