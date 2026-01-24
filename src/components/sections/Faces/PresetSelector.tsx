/**
 * Preset Selector Component
 *
 * Dropdown for selecting pre-configured cosine palette presets.
 */

import { Select } from '@/components/ui/Select'
import { COSINE_PRESET_OPTIONS } from '@/rendering/shaders/palette'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React, { useMemo, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface PresetSelectorProps {
  className?: string
}

export const PresetSelector: React.FC<PresetSelectorProps> = React.memo(({ className = '' }) => {
  const appearanceSelector = useShallow((state: AppearanceSlice) => ({
    cosineCoefficients: state.cosineCoefficients,
    setCosineCoefficients: state.setCosineCoefficients,
  }))
  const { cosineCoefficients, setCosineCoefficients } = useAppearanceStore(appearanceSelector)

  // Find current preset by matching coefficients
  const currentPreset = useMemo(() => {
    for (const preset of COSINE_PRESET_OPTIONS) {
      const c = preset.coefficients
      if (
        JSON.stringify(c.a) === JSON.stringify(cosineCoefficients.a) &&
        JSON.stringify(c.b) === JSON.stringify(cosineCoefficients.b) &&
        JSON.stringify(c.c) === JSON.stringify(cosineCoefficients.c) &&
        JSON.stringify(c.d) === JSON.stringify(cosineCoefficients.d)
      ) {
        return preset.value
      }
    }
    return 'custom'
  }, [cosineCoefficients])

  const options = useMemo(
    () => [
      ...COSINE_PRESET_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
      { value: 'custom', label: 'Custom' },
    ],
    []
  )

  const handleChange = useCallback(
    (value: string) => {
      if (value === 'custom') return

      const preset = COSINE_PRESET_OPTIONS.find((p) => p.value === value)
      if (preset) {
        setCosineCoefficients(preset.coefficients)
      }
    },
    [setCosineCoefficients]
  )

  return (
    <div className={className}>
      <Select
        label="Palette Preset"
        options={options}
        value={currentPreset}
        onChange={handleChange}
      />
    </div>
  )
})

PresetSelector.displayName = 'PresetSelector'
