/**
 * BloomControls Component
 *
 * UI controls for managing bloom post-processing effects.
 * Uses Three.js UnrealBloomPass with enhanced smoothing control.
 *
 * Controls:
 * - Intensity slider: Controls bloom strength (0-2, 0 = no bloom)
 * - Threshold slider: Luminance threshold for bloom (0-1)
 * - Smoothing slider: Softens the threshold transition (0-1)
 * - Radius slider: Bloom spread/radius (0-1)
 * - Levels slider: Number of blur levels (1-5)
 *
 * @param props - Component props
 * @param props.className - Optional CSS class name for styling
 *
 * @returns UI controls for bloom post-processing
 *
 * @example
 * ```tsx
 * <ControlPanel>
 *   <BloomControls />
 * </ControlPanel>
 * ```
 *
 * @remarks
 * - All values are validated and clamped in the visual store
 * - Smoothing controls how gradual the threshold cutoff is
 * - Levels control the number of blur iterations (more = wider bloom)
 *
 * @see {@link PostProcessing} for the bloom effect implementation
 * @see {@link usePostProcessingStore} for state management
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Slider } from '@/components/ui/Slider'
import {} from '@/stores/defaults/visualDefaults'
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore'

export interface BloomControlsProps {
  className?: string
}

/**
 * BloomControls component that provides UI for adjusting bloom post-processing settings.
 * @param root0
 * @param root0.className
 */
export const BloomControls: React.FC<BloomControlsProps> = React.memo(({ className = '' }) => {
  // Consolidate all visual store subscriptions with useShallow to reduce re-renders
  const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
    // State
    bloomIntensity: state.bloomIntensity,
    bloomThreshold: state.bloomThreshold,
    bloomRadius: state.bloomRadius,
    bloomSmoothing: state.bloomSmoothing,
    bloomLevels: state.bloomLevels,
    // Actions
    setBloomIntensity: state.setBloomIntensity,
    setBloomThreshold: state.setBloomThreshold,
    setBloomRadius: state.setBloomRadius,
    setBloomSmoothing: state.setBloomSmoothing,
    setBloomLevels: state.setBloomLevels,
  }))
  const {
    bloomIntensity,
    bloomThreshold,
    bloomRadius,
    bloomSmoothing,
    bloomLevels,
    setBloomIntensity,
    setBloomThreshold,
    setBloomRadius,
    setBloomSmoothing,
    setBloomLevels,
  } = usePostProcessingStore(postProcessingSelector)

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Intensity */}
      <Slider
        label="Intensity"
        min={0}
        max={2}
        step={0.05}
        value={bloomIntensity}
        onChange={setBloomIntensity}
        showValue
      />

      {/* Threshold */}
      <Slider
        label="Threshold"
        min={0}
        max={1}
        step={0.05}
        value={bloomThreshold}
        onChange={setBloomThreshold}
        showValue
      />

      {/* Smoothing - new parameter for soft threshold transition */}
      <Slider
        label="Smoothing"
        min={0}
        max={1}
        step={0.01}
        value={bloomSmoothing}
        onChange={setBloomSmoothing}
        showValue
      />

      {/* Radius */}
      <Slider
        label="Radius"
        min={0}
        max={1}
        step={0.05}
        value={bloomRadius}
        onChange={setBloomRadius}
        showValue
      />

      {/* Levels - number of blur levels (1-5) */}
      <Slider
        label="Levels"
        min={1}
        max={5}
        step={1}
        value={bloomLevels}
        onChange={setBloomLevels}
        showValue
      />
    </div>
  )
})

BloomControls.displayName = 'BloomControls'
