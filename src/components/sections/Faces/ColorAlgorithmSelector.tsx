/**
 * Color Algorithm Selector Component
 *
 * Dropdown for selecting the color algorithm used for face/surface coloring.
 */

import React, { useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Select } from '@/components/ui/Select'
import { type ColorAlgorithm, getAvailableColorAlgorithms } from '@/lib/colors/palette'
import type { DiracFieldView } from '@/lib/geometry/extended/dirac'
import type { PauliFieldView } from '@/lib/geometry/extended/pauli'
import { supportsSchroedingerSurfaceMode } from '@/lib/geometry/registry'
import { pauliFieldViewForColorAlgorithm } from '@/rendering/webgpu/scenePassConfig'
import { type AppearanceSlice, useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

/** Props for the color algorithm selection dropdown. */
export interface ColorAlgorithmSelectorProps {
  className?: string
}

export const ColorAlgorithmSelector: React.FC<ColorAlgorithmSelectorProps> = React.memo(
  ({ className = '' }) => {
    const { objectType, dimension } = useGeometryStore(
      useShallow((s) => ({ objectType: s.objectType, dimension: s.dimension }))
    )

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
      isosurfaceEnabled,
    } = useExtendedObjectStore(
      useShallow((s) => ({
        quantumMode: s.schroedinger.quantumMode,
        representation: s.schroedinger.representation,
        openQuantumEnabled: s.schroedinger.openQuantum?.enabled ?? false,
        freeScalarInitialCondition: s.schroedinger.freeScalar.initialCondition,
        branchingEnabled:
          s.schroedinger.tdse?.stochasticEnabled && s.schroedinger.tdse?.branchingEnabled,
        isosurfaceEnabled: s.schroedinger.isoEnabled ?? false,
      }))
    )
    const effectiveOpenQuantumEnabled =
      openQuantumEnabled &&
      (quantumMode === 'harmonicOscillator' ||
        quantumMode === 'hydrogenND' ||
        quantumMode === 'hydrogenNDCoupled') &&
      representation !== 'wigner'
    const effectiveIsosurfaceEnabled =
      isosurfaceEnabled &&
      supportsSchroedingerSurfaceMode({
        objectType,
        quantumMode,
        dimension,
        representation,
      })

    const availableOptions = useMemo(
      () =>
        getAvailableColorAlgorithms(
          quantumMode,
          effectiveOpenQuantumEnabled,
          objectType,
          quantumMode === 'freeScalarField' ? freeScalarInitialCondition : undefined,
          {
            dimension,
            isosurface: effectiveIsosurfaceEnabled,
            representation,
          }
        ),
      [
        quantumMode,
        effectiveOpenQuantumEnabled,
        objectType,
        freeScalarInitialCondition,
        dimension,
        effectiveIsosurfaceEnabled,
        representation,
      ]
    )

    const selectOptions = useMemo(
      () =>
        availableOptions.map((opt) => ({
          value: opt.value,
          label: opt.label,
        })),
      [availableOptions]
    )

    // Wheeler–DeWitt is a density-grid-compute mode (CPU-solved, uploaded
    // to a 3D texture), not an analytic mode — it should follow the same
    // fallback rule as the other compute modes when the stored color
    // algorithm becomes invalid on a mode switch. Missing this caused
    // WdW to fall back to `radialDistance` (an analytic-only algo) on
    // any transition that invalidated the prior pick, which rendered a
    // radial colour ramp centred on world origin regardless of what the
    // WdW density actually looked like.
    const isComputeMode =
      objectType === 'pauliSpinor' ||
      quantumMode === 'tdseDynamics' ||
      quantumMode === 'freeScalarField' ||
      quantumMode === 'becDynamics' ||
      quantumMode === 'diracEquation' ||
      quantumMode === 'quantumWalk' ||
      quantumMode === 'wheelerDeWitt'

    // Auto-switch away from unavailable algorithm when mode changes.
    // Spatially misleading algorithms (radialDistance, radial, lch, multiSource)
    // are already excluded from compute mode availableOptions by
    // getAvailableColorAlgorithms, so this single effect handles all cases.
    useEffect(() => {
      const isAvailable = availableOptions.some((opt) => opt.value === colorAlgorithm)
      if (!isAvailable) {
        if (objectType === 'pauliSpinor') {
          setColorAlgorithm('pauliSpinDensity')
        } else if (objectType === 'bellPair') {
          // Bell allowlist is narrow (5 algos); 'radialDistance' is not in it,
          // so falling through to the compute/analytic default would leave the
          // Select with a value the dropdown can't render. Pin to the Bell
          // registry default instead.
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
          // Keep Dirac's fieldView in sync with the color algorithm so the
          // density grid encoding matches what the fragment shader will read
          // and the UI ToggleGroup reflects the real state.
          //
          //  - 'particleAntiparticle' needs the dual-channel split
          //    (R=upper, G=lower).
          //  - 'quantumPotential' requires single-channel total density because
          //    Q = -½·∇²R/R is only meaningful on R = √ρ_total; non-total
          //    fieldViews (spinDensity, currentDensity, phase, particle/anti
          //    split) write a different scalar into R and yield wrong Q.
          //  - Switching away from particleAntiparticle resets to totalDensity
          //    so stale split state from a prior pick or a preset like
          //    kleinParadox doesn't leak into single-channel algos.
          const currentFieldView = extStore.schroedinger.dirac?.fieldView
          if (algo === 'particleAntiparticle') {
            if (currentFieldView !== 'particleAntiparticleSplit') {
              extStore.setDiracFieldView('particleAntiparticleSplit' as DiracFieldView)
            }
          } else if (algo === 'quantumPotential') {
            if (currentFieldView !== 'totalDensity') {
              extStore.setDiracFieldView('totalDensity' as DiracFieldView)
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
