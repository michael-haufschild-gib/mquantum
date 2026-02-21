/**
 * BloomControls Component
 *
 * Four sliders for progressive downsample/upsample bloom:
 * Gain, Threshold, Radius, and Knee.
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Slider } from '@/components/ui/Slider'
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore'

/**
 *
 */
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
        min={0}
        max={3}
        step={0.05}
        value={bloomGain}
        onChange={setBloomGain}
        showValue
      />

      <Slider
        label="Threshold"
        min={0}
        max={5}
        step={0.01}
        value={bloomThreshold}
        onChange={setBloomThreshold}
        showValue
      />

      <Slider
        label="Radius"
        min={0.25}
        max={4}
        step={0.05}
        value={bloomRadius}
        onChange={setBloomRadius}
        showValue
      />

      <Slider
        label="Knee"
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
