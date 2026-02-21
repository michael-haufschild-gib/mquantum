/**
 * Color Algorithm Selector Component
 *
 * Dropdown for selecting the color algorithm used for face/surface coloring.
 */

import { Select } from '@/components/ui/Select'
import {
  getAvailableColorAlgorithms,
  type ColorAlgorithm,
} from '@/rendering/shaders/palette'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import React, { useMemo, useCallback, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 *
 */
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

    const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)

    const availableOptions = useMemo(
      () => getAvailableColorAlgorithms(quantumMode),
      [quantumMode]
    )

    const selectOptions = useMemo(
      () =>
        availableOptions.map((opt) => ({
          value: opt.value,
          label: opt.label,
        })),
      [availableOptions]
    )

    // Auto-switch away from unavailable algorithm when mode changes
    useEffect(() => {
      const isAvailable = availableOptions.some((opt) => opt.value === colorAlgorithm)
      if (!isAvailable) {
        setColorAlgorithm('diverging')
      }
    }, [availableOptions, colorAlgorithm, setColorAlgorithm])

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
