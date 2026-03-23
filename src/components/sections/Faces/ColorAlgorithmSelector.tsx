/**
 * Color Algorithm Selector Component
 *
 * Dropdown for selecting the color algorithm used for face/surface coloring.
 */

import React, { useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Select } from '@/components/ui/Select'
import { type ColorAlgorithm, getAvailableColorAlgorithms } from '@/rendering/shaders/palette'
import { type AppearanceSlice, useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

/** Props for the color algorithm selection dropdown. */
export interface ColorAlgorithmSelectorProps {
  className?: string
}

export const ColorAlgorithmSelector: React.FC<ColorAlgorithmSelectorProps> = React.memo(
  ({ className = '' }) => {
    const objectType = useGeometryStore((s) => s.objectType)

    const { colorAlgorithm, setColorAlgorithm } = useAppearanceStore(
      useShallow((state: AppearanceSlice) => ({
        colorAlgorithm: state.colorAlgorithm,
        setColorAlgorithm: state.setColorAlgorithm,
      }))
    )

    const { quantumMode, representation, openQuantumEnabled, freeScalarInitialCondition } =
      useExtendedObjectStore(
        useShallow((s) => ({
          quantumMode: s.schroedinger.quantumMode,
          representation: s.schroedinger.representation,
          openQuantumEnabled: s.schroedinger.openQuantum?.enabled ?? false,
          freeScalarInitialCondition: s.schroedinger.freeScalar.initialCondition,
        }))
      )
    const effectiveOpenQuantumEnabled =
      openQuantumEnabled &&
      (quantumMode === 'harmonicOscillator' ||
        quantumMode === 'hydrogenND' ||
        quantumMode === 'hydrogenNDCoupled') &&
      representation !== 'wigner'

    const availableOptions = useMemo(
      () =>
        getAvailableColorAlgorithms(
          quantumMode,
          effectiveOpenQuantumEnabled,
          objectType,
          quantumMode === 'freeScalarField' ? freeScalarInitialCondition : undefined
        ),
      [quantumMode, effectiveOpenQuantumEnabled, objectType, freeScalarInitialCondition]
    )

    const selectOptions = useMemo(
      () =>
        availableOptions.map((opt) => ({
          value: opt.value,
          label: opt.label,
        })),
      [availableOptions]
    )

    const isComputeMode =
      objectType === 'pauliSpinor' ||
      quantumMode === 'tdseDynamics' ||
      quantumMode === 'freeScalarField' ||
      quantumMode === 'becDynamics' ||
      quantumMode === 'diracEquation'

    // Auto-switch away from unavailable algorithm when mode changes
    useEffect(() => {
      const isAvailable = availableOptions.some((opt) => opt.value === colorAlgorithm)
      if (!isAvailable) {
        if (objectType === 'pauliSpinor') {
          setColorAlgorithm('pauliSpinDensity')
        } else {
          setColorAlgorithm(isComputeMode ? 'blackbody' : 'radialDistance')
        }
      }
    }, [availableOptions, colorAlgorithm, setColorAlgorithm, isComputeMode, objectType])

    // Auto-switch to a mode-appropriate algorithm when entering compute modes
    // if the current algorithm is spatially misleading (radialDistance, radial, lch).
    // These color by geometric position, not by field value, producing false structure.
    useEffect(() => {
      const misleadingForCompute = new Set<string>([
        'radialDistance',
        'radial',
        'lch',
        'multiSource',
      ])
      if (isComputeMode && misleadingForCompute.has(colorAlgorithm)) {
        setColorAlgorithm(objectType === 'pauliSpinor' ? 'pauliSpinDensity' : 'blackbody')
      }
    }, [isComputeMode, colorAlgorithm, setColorAlgorithm, objectType])

    const handleChange = useCallback(
      (v: string) => {
        setColorAlgorithm(v as ColorAlgorithm)
      },
      [setColorAlgorithm]
    )

    return (
      <div className={className}>
        <Select
          label="Color Algorithm"
          tooltip="How the wavefunction values are mapped to colors. Different algorithms reveal different aspects of the quantum state."
          options={selectOptions}
          value={colorAlgorithm}
          onChange={handleChange}
        />
      </div>
    )
  }
)

ColorAlgorithmSelector.displayName = 'ColorAlgorithmSelector'
