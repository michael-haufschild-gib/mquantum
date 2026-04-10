/**
 * Color Algorithm Selector Component
 *
 * Dropdown for selecting the color algorithm used for face/surface coloring.
 */

import React, { useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Select } from '@/components/ui/Select'
import type { DiracFieldView } from '@/lib/geometry/extended/dirac'
import type { PauliFieldView } from '@/lib/geometry/extended/pauli'
import { type ColorAlgorithm, getAvailableColorAlgorithms } from '@/rendering/shaders/palette'
import { pauliFieldViewForColorAlgorithm } from '@/rendering/webgpu/scenePassConfig'
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

    const {
      quantumMode,
      representation,
      openQuantumEnabled,
      freeScalarInitialCondition,
      branchingEnabled,
    } = useExtendedObjectStore(
      useShallow((s) => ({
        quantumMode: s.schroedinger.quantumMode,
        representation: s.schroedinger.representation,
        openQuantumEnabled: s.schroedinger.openQuantum?.enabled ?? false,
        freeScalarInitialCondition: s.schroedinger.freeScalar.initialCondition,
        branchingEnabled:
          s.schroedinger.tdse?.stochasticEnabled && s.schroedinger.tdse?.branchingEnabled,
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
      quantumMode === 'diracEquation' ||
      quantumMode === 'quantumWalk'

    // Auto-switch away from unavailable algorithm when mode changes.
    // Spatially misleading algorithms (radialDistance, radial, lch, multiSource)
    // are already excluded from compute mode availableOptions by
    // getAvailableColorAlgorithms, so this single effect handles all cases.
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

    const handleChange = useCallback(
      (v: string) => {
        const algo = v as ColorAlgorithm
        setColorAlgorithm(algo)

        // Keep the mode's fieldView in sync with the selected color algorithm.
        // Without this, the renderer would derive fieldView from the algorithm (Pauli)
        // or keep the legacy fieldView (Dirac) and the UI ToggleGroup would show a
        // stale value that no longer matches what's encoded in the density grid.
        const extStore = useExtendedObjectStore.getState()
        if (objectType === 'pauliSpinor') {
          const nextFieldView = pauliFieldViewForColorAlgorithm(algo) as PauliFieldView
          if (extStore.pauliSpinor.fieldView !== nextFieldView) {
            extStore.setPauliFieldView(nextFieldView)
          }
        } else if (quantumMode === 'diracEquation') {
          // 'particleAntiparticle' color algo requires the dual-channel split
          // fieldView (R=upper spinor, G=lower spinor); every other Dirac color
          // algo expects single-channel total density. We must sync BOTH
          // directions: setting the split when picking particleAntiparticle AND
          // resetting to totalDensity when switching away. Without the reset,
          // diracConfig.fieldView stays at 'particleAntiparticleSplit' (from a
          // prior particleAntiparticle pick OR from a preset like kleinParadox)
          // and the density grid keeps the dual-channel encoding, so subsequent
          // single-channel color algos read R as particle-only instead of total
          // and produce visually wrong colors.
          const currentFieldView = extStore.schroedinger.dirac?.fieldView
          if (algo === 'particleAntiparticle') {
            if (currentFieldView !== 'particleAntiparticleSplit') {
              extStore.setDiracFieldView('particleAntiparticleSplit' as DiracFieldView)
            }
          } else if (currentFieldView === 'particleAntiparticleSplit') {
            extStore.setDiracFieldView('totalDensity' as DiracFieldView)
          }
        }
      },
      [setColorAlgorithm, objectType, quantumMode]
    )

    const isBranchColored = quantumMode === 'tdseDynamics' && branchingEnabled

    return (
      <div className={className}>
        <Select
          label="Color Algorithm"
          tooltip={
            isBranchColored
              ? 'Disabled — branch colors are set in the Decoherence section.'
              : 'How the wavefunction values are mapped to colors. Different algorithms reveal different aspects of the quantum state.'
          }
          options={selectOptions}
          value={colorAlgorithm}
          onChange={handleChange}
          disabled={isBranchColored}
        />
      </div>
    )
  }
)

ColorAlgorithmSelector.displayName = 'ColorAlgorithmSelector'
