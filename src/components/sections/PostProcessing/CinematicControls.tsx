/**
 * Cinematic Controls Component
 *
 * Controls for the Cinematic post-processing effect (Chromatic Aberration, Vignette, Grain).
 */

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore'
import { useLightingStore, type LightingSlice } from '@/stores/lightingStore'
import { TONE_MAPPING_OPTIONS, type ToneMappingAlgorithm } from '@/rendering/shaders/types'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 *
 */
export interface CinematicControlsProps {
  className?: string
}

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider pt-2 pb-1 border-t border-panel-border mt-2 first:mt-0 first:border-t-0 first:pt-0">
    {title}
  </div>
)

export const CinematicControls: React.FC<CinematicControlsProps> = React.memo(
  ({ className = '' }) => {
    // Cinematic State
    const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
      cinematicAberration: state.cinematicAberration,
      cinematicVignette: state.cinematicVignette,
      cinematicGrain: state.cinematicGrain,
      setCinematicAberration: state.setCinematicAberration,
      setCinematicVignette: state.setCinematicVignette,
      setCinematicGrain: state.setCinematicGrain,
    }))
    const {
      cinematicAberration,
      cinematicVignette,
      cinematicGrain,
      setCinematicAberration,
      setCinematicVignette,
      setCinematicGrain,
    } = usePostProcessingStore(postProcessingSelector)

    // Tone Mapping State
    const lightingSelector = useShallow((state: LightingSlice) => ({
      toneMappingAlgorithm: state.toneMappingAlgorithm,
      exposure: state.exposure,
      setToneMappingAlgorithm: state.setToneMappingAlgorithm,
      setExposure: state.setExposure,
    }))
    const { toneMappingAlgorithm, exposure, setToneMappingAlgorithm, setExposure } =
      useLightingStore(lightingSelector)

    // Filter out 'none' option for tone mapping selector
    const toneMappingOptions = TONE_MAPPING_OPTIONS.filter((opt) => opt.value !== 'none').map(
      (opt) => ({
        value: opt.value,
        label: opt.label,
      })
    )

    return (
      <div className={`space-y-3 ${className}`}>
        {/* --- Cinematic Section --- */}
        <div className="flex items-center justify-between">
          <SectionHeader title="Cinematic" />
        </div>

        <Slider
          label="Aberration"
          min={0}
          max={0.1}
          step={0.001}
          value={cinematicAberration}
          onChange={setCinematicAberration}
          showValue
        />

        <Slider
          label="Vignette"
          min={0}
          max={3.0}
          step={0.1}
          value={cinematicVignette}
          onChange={setCinematicVignette}
          showValue
        />

        <Slider
          label="Grain"
          min={0}
          max={0.2}
          step={0.001}
          value={cinematicGrain}
          onChange={setCinematicGrain}
          showValue
        />

        {/* --- Tone Mapping Section --- */}
        <div className="flex items-center justify-between pt-2">
          <SectionHeader title="Tone Mapping" />
        </div>

        <Select
          label="Algorithm"
          value={toneMappingAlgorithm}
          options={toneMappingOptions}
          onChange={(value) => setToneMappingAlgorithm(value as ToneMappingAlgorithm)}
        />

        <Slider
          label="Exposure"
          min={0.1}
          max={3}
          step={0.1}
          value={exposure}
          onChange={setExposure}
          showValue
        />
      </div>
    )
  }
)
