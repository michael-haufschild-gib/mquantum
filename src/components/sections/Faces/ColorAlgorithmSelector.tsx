/**
 * Color Algorithm Selector Component
 *
 * Dropdown for selecting the color algorithm used for face/surface coloring.
 */

import { Select } from '@/components/ui/Select'
import {
  COLOR_ALGORITHM_OPTIONS,
  type ColorAlgorithm,
} from '@/rendering/shaders/palette'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React, { useMemo, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface ColorAlgorithmSelectorProps {
  className?: string
}

export const ColorAlgorithmSelector: React.FC<ColorAlgorithmSelectorProps> = React.memo(
  ({ className = '' }) => {
    const { colorAlgorithm, setColorAlgorithm } = useAppearanceStore(
      useShallow((state: AppearanceSlice) => ({
        colorAlgorithm: state.colorAlgorithm,
        setColorAlgorithm: state.setColorAlgorithm,
      }))
    )

    const selectOptions = useMemo(
      () =>
        COLOR_ALGORITHM_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
        })),
      []
    )

    const handleChange = useCallback(
      (v: string) => {
        setColorAlgorithm(v as ColorAlgorithm)
      },
      [setColorAlgorithm]
    )

    return (
      <div className={className}>
        <Select options={selectOptions} value={colorAlgorithm} onChange={handleChange} />
      </div>
    )
  }
)

ColorAlgorithmSelector.displayName = 'ColorAlgorithmSelector'
