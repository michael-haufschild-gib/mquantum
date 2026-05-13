/**
 * BloomControls Component
 *
 * Four sliders for progressive downsample/upsample bloom:
 * Gain, Threshold, Radius, and Knee.
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Slider } from '@/components/ui/Slider'
import {
  type PostProcessingSlice,
  usePostProcessingStore,
} from '@/stores/scene/postProcessingStore'

/** Props for the bloom post-processing effect controls. */
export interface BloomControlsProps {
  className?: string
}

/**
 * Bloom effect controls with four sliders.
 *
 * @param props - Component props
 * @param props.className - Optional CSS class name
 * @returns Bloom controls UI
 *
 * @example
 * ```tsx
 * <BloomControls className="mt-2" />
 * ```
 */
export const BloomControls: React.FC<BloomControlsProps> = React.memo(({ className = '' }) => {
  const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
    bloomGain: state.bloomGain,
    bloomThreshold: state.bloomThreshold,
    bloomKnee: state.bloomKnee,
    bloomRadius: state.bloomRadius,
    setBloomGain: state.setBloomGain,
    setBloomThreshold: state.setBloomThreshold,
    setBloomKnee: state.setBloomKnee,
    setBloomRadius: state.setBloomRadius,
  }))

  const {
    bloomGain,
    bloomThreshold,
    bloomKnee,
    bloomRadius,
    setBloomGain,
    setBloomThreshold,
    setBloomKnee,
    setBloomRadius,
  } = usePostProcessingStore(postProcessingSelector)

  return (
    <div className={`space-y-4 ${className}`}>
      <Slider
        label="Gain"
        tooltip="Overall bloom intensity. Higher values create a stronger glow around bright regions."
        min={0}
        max={3}
        step={0.05}
        value={bloomGain}
        onChange={setBloomGain}
        showValue
      />

      <Slider
        label="Threshold"
        tooltip="Brightness threshold for bloom. Only pixels brighter than this value will glow."
        min={0}
        max={5}
        step={0.01}
        value={bloomThreshold}
        onChange={setBloomThreshold}
        showValue
      />

      <Slider
        label="Radius"
        tooltip="Spread radius of the bloom effect. Larger values create wider, softer glow."
        min={0.25}
        max={4}
        step={0.05}
        value={bloomRadius}
        onChange={setBloomRadius}
        showValue
      />

      <Slider
        label="Knee"
        tooltip="Softness of the threshold transition. Higher values create a smoother falloff between bloomed and non-bloomed regions."
        min={0}
        max={5}
        step={0.01}
        value={bloomKnee}
        onChange={setBloomKnee}
        showValue
      />
    </div>
  )
})

BloomControls.displayName = 'BloomControls'
