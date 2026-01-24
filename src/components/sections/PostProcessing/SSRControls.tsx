/**
 * SSRControls Component
 *
 * UI controls for managing screen-space reflections post-processing effect.
 *
 * Controls:
 * - Enable/Disable toggle: Turns SSR effect on/off
 * - Quality select: Controls ray march steps (Low/Medium/High)
 * - Intensity slider: Controls reflection strength (0-1)
 * - Max Distance slider: Maximum ray travel distance (1-50)
 * - Thickness slider: Thickness tolerance for hits (0.01-1)
 * - Fade Start/End sliders: Edge fade parameters (0-1)
 *
 * @see {@link PostProcessing} for the SSR effect implementation
 * @see {@link usePostProcessingStore} for state management
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { type SSRQuality } from '@/stores/defaults/visualDefaults'
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore'

export interface SSRControlsProps {
  className?: string
}

const SSR_QUALITY_OPTIONS: { value: SSRQuality; label: string }[] = [
  { value: 'low', label: 'Low (16 steps)' },
  { value: 'medium', label: 'Medium (32 steps)' },
  { value: 'high', label: 'High (64 steps)' },
]

/**
 * SSRControls component that provides UI for adjusting screen-space reflection settings.
 */
export const SSRControls: React.FC<SSRControlsProps> = React.memo(({ className = '' }) => {
  const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
    // State
    ssrIntensity: state.ssrIntensity,
    ssrMaxDistance: state.ssrMaxDistance,
    ssrThickness: state.ssrThickness,
    ssrFadeStart: state.ssrFadeStart,
    ssrFadeEnd: state.ssrFadeEnd,
    ssrQuality: state.ssrQuality,
    // Actions
    setSSRIntensity: state.setSSRIntensity,
    setSSRMaxDistance: state.setSSRMaxDistance,
    setSSRThickness: state.setSSRThickness,
    setSSRFadeStart: state.setSSRFadeStart,
    setSSRFadeEnd: state.setSSRFadeEnd,
    setSSRQuality: state.setSSRQuality,
  }))
  const {
    ssrIntensity,
    ssrMaxDistance,
    ssrThickness,
    ssrFadeStart,
    ssrFadeEnd,
    ssrQuality,
    setSSRIntensity,
    setSSRMaxDistance,
    setSSRThickness,
    setSSRFadeStart,
    setSSRFadeEnd,
    setSSRQuality,
  } = usePostProcessingStore(postProcessingSelector)

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Quality */}
      <Select
        label="Quality"
        options={SSR_QUALITY_OPTIONS}
        value={ssrQuality}
        onChange={setSSRQuality}
        data-testid="ssr-quality-select"
      />

      {/* Intensity */}
      <Slider
        label="Intensity"
        min={0}
        max={1}
        step={0.05}
        value={ssrIntensity}
        onChange={setSSRIntensity}
        showValue
      />

      {/* Max Distance */}
      <Slider
        label="Max Distance"
        min={1}
        max={50}
        step={1}
        value={ssrMaxDistance}
        onChange={setSSRMaxDistance}
        showValue
      />

      {/* Thickness */}
      <Slider
        label="Thickness"
        min={0.01}
        max={2}
        step={0.05}
        value={ssrThickness}
        onChange={setSSRThickness}
        showValue
      />

      {/* Fade Start */}
      <Slider
        label="Fade Start"
        min={0}
        max={1}
        step={0.05}
        value={ssrFadeStart}
        onChange={setSSRFadeStart}
        showValue
      />

      {/* Fade End */}
      <Slider
        label="Fade End"
        min={0}
        max={1}
        step={0.05}
        value={ssrFadeEnd}
        onChange={setSSRFadeEnd}
        showValue
      />
    </div>
  )
})
