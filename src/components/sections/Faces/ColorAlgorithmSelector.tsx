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

    const { quantumMode, representation, openQuantumEnabled } = useExtendedObjectStore(
      useShallow((s) => ({
        quantumMode: s.schroedinger.quantumMode,
        representation: s.schroedinger.representation,
        openQuantumEnabled: s.schroedinger.openQuantum?.enabled ?? false,
      }))
    )
    const effectiveOpenQuantumEnabled =
      openQuantumEnabled && (quantumMode === 'harmonicOscillator' || quantumMode === 'hydrogenND') && representation !== 'wigner'

    const availableOptions = useMemo(
      () => getAvailableColorAlgorithms(quantumMode, effectiveOpenQuantumEnabled),
      [quantumMode, effectiveOpenQuantumEnabled]
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
        const fallback = quantumMode === 'tdseDynamics' || quantumMode === 'freeScalarField' || quantumMode === 'becDynamics'
          ? 'blackbody'
          : 'radialDistance'
        setColorAlgorithm(fallback)
      }
    }, [availableOptions, colorAlgorithm, setColorAlgorithm, quantumMode])

    // Auto-switch to blackbody when entering compute modes (TDSE/free scalar)
    // if the current algorithm is spatially misleading (radialDistance, radial, lch).
    // These color by geometric position, not by field value, producing false structure.
    useEffect(() => {
      const isComputeMode = quantumMode === 'tdseDynamics' || quantumMode === 'freeScalarField' || quantumMode === 'becDynamics'
      const misleadingForCompute = new Set<string>(['radialDistance', 'radial', 'lch', 'multiSource'])
      if (isComputeMode && misleadingForCompute.has(colorAlgorithm)) {
        setColorAlgorithm('blackbody')
      }
    }, [quantumMode, colorAlgorithm, setColorAlgorithm])

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
