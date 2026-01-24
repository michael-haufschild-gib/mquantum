/**
 * RefractionControls Component
 *
 * UI controls for managing screen-space refraction post-processing effect.
 *
 * Controls:
 * - Enable/Disable toggle: Turns refraction effect on/off
 * - IOR slider: Index of refraction (1.0-2.5, default 1.5 for glass)
 * - Strength slider: Refraction distortion strength (0-1)
 * - Chromatic Aberration slider: Color separation amount (0-1)
 *
 * @see {@link PostProcessing} for the refraction effect implementation
 * @see {@link usePostProcessingStore} for state management
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Slider } from '@/components/ui/Slider'
import {} from '@/stores/defaults/visualDefaults'
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore'

export interface RefractionControlsProps {
  className?: string
}

/**
 * RefractionControls component that provides UI for adjusting screen-space refraction settings.
 */
export const RefractionControls: React.FC<RefractionControlsProps> = React.memo(
  ({ className = '' }) => {
    const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
      // State
      refractionIOR: state.refractionIOR,
      refractionStrength: state.refractionStrength,
      refractionChromaticAberration: state.refractionChromaticAberration,
      // Actions
      setRefractionIOR: state.setRefractionIOR,
      setRefractionStrength: state.setRefractionStrength,
      setRefractionChromaticAberration: state.setRefractionChromaticAberration,
    }))
    const {
      refractionIOR,
      refractionStrength,
      refractionChromaticAberration,
      setRefractionIOR,
      setRefractionStrength,
      setRefractionChromaticAberration,
    } = usePostProcessingStore(postProcessingSelector)

    return (
      <div className={`space-y-4 ${className}`}>
        {/* Index of Refraction */}
        <Slider
          label="IOR (Index of Refraction)"
          min={1.0}
          max={2.5}
          step={0.05}
          value={refractionIOR}
          onChange={setRefractionIOR}
          showValue
        />

        {/* Strength */}
        <Slider
          label="Strength"
          min={0}
          max={1}
          step={0.05}
          value={refractionStrength}
          onChange={setRefractionStrength}
          showValue
        />

        {/* Chromatic Aberration */}
        <Slider
          label="Chromatic Aberration"
          min={0}
          max={1}
          step={0.01}
          value={refractionChromaticAberration}
          onChange={setRefractionChromaticAberration}
          showValue
        />
      </div>
    )
  }
)
