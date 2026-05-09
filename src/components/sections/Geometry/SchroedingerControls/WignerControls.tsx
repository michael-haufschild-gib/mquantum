/**
 * WignerControls Component
 *
 * Controls for Wigner phase-space visualization parameters.
 * Provides dimension selection, axis range controls, cross-term toggle (HO only),
 * and quadrature point control (hydrogen only).
 *
 * @module components/sections/Geometry/SchroedingerControls/WignerControls
 */

import React, { useMemo } from 'react'

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'

import type { WignerControlsProps } from './types'

/**
 * Controls for the Wigner phase-space representation.
 *
 * - Dimension selector: choose which phase-space slice to view (x_j, p_j)
 * - Auto/manual axis range toggle with X and P range sliders
 * - Cross-terms toggle (HO mode only, enables interference fringes)
 * - Quadrature points slider (hydrogen mode only, controls numerical accuracy)
 *
 * @param props - Component props
 * @param props.config - Current Schroedinger configuration
 * @param props.dimension - Current simulation dimension (3-11)
 * @param props.actions - Store action callbacks for Wigner parameters
 * @returns React component
 */
export const WignerControls: React.FC<WignerControlsProps> = React.memo(
  ({ config, dimension, actions }) => {
    const isHydrogenMode =
      config.quantumMode === 'hydrogenND' || config.quantumMode === 'hydrogenNDCoupled'

    // Build dimension options based on current dimension and quantum mode
    const dimensionOptions = useMemo(() => {
      if (isHydrogenMode) {
        // Hydrogen ND: first 3 dims are radial core, rest are extra HO dims
        const opts = [{ value: '0', label: 'Radial (r, p_r)' }]
        for (let d = 3; d < dimension; d++) {
          opts.push({ value: String(d), label: `Dim ${d + 1} (x, p) HO` })
        }
        return opts
      }
      // HO mode: all dimensions are equivalent
      const opts = []
      for (let d = 0; d < dimension; d++) {
        opts.push({ value: String(d), label: `Dim ${d + 1} (x${d + 1}, p${d + 1})` })
      }
      return opts
    }, [dimension, isHydrogenMode])

    // Hydrogen core dims 0-2 all route to the same radial Wigner path, but the
    // selector exposes that path as a single option. Map loaded/core indices
    // back to "0" so the native select never receives a value absent from
    // its option list.
    const currentDimIdx =
      isHydrogenMode && config.wignerDimensionIndex < 3
        ? '0'
        : String(Math.min(config.wignerDimensionIndex, dimension - 1))

    return (
      <div className="space-y-3" data-testid="wigner-controls">
        {/* Dimension selector */}
        <Select
          label="Phase-Space Dimension"
          tooltip="Select which (position, momentum) pair to visualize in the Wigner function. Each dimension corresponds to a 2D phase-space slice."
          options={dimensionOptions}
          value={currentDimIdx}
          onChange={(v) => actions.setDimensionIndex(Number(v))}
          data-testid="wigner-dimension-select"
        />

        {/* Auto-range toggle */}
        <Switch
          label="Auto Range"
          tooltip="Automatically compute axis ranges from the quantum state. Disable for manual control of the phase-space viewport."
          checked={config.wignerAutoRange}
          onCheckedChange={actions.setAutoRange}
          data-testid="wigner-auto-range"
        />

        {/* Manual range sliders (only when auto-range is off) */}
        {!config.wignerAutoRange && (
          <div className="space-y-3">
            <Slider
              label="X Range"
              tooltip="Half-width of the position axis in the Wigner plot. Increase to see wider spatial extent."
              min={0.5}
              max={30.0}
              step={0.5}
              value={config.wignerXRange}
              onChange={actions.setXRange}
              showValue
              data-testid="wigner-x-range-slider"
            />
            <Slider
              label="P Range"
              tooltip="Half-width of the momentum axis in the Wigner plot. Increase to see higher momentum components."
              min={0.5}
              max={30.0}
              step={0.5}
              value={config.wignerPRange}
              onChange={actions.setPRange}
              showValue
              data-testid="wigner-p-range-slider"
            />
          </div>
        )}

        {/* Cross-terms toggle (HO mode only) */}
        {!isHydrogenMode && (
          <Switch
            label="Cross Terms"
            tooltip="Include quantum interference cross-terms between superposition components. These produce the non-classical negative regions characteristic of quantum states."
            checked={config.wignerCrossTermsEnabled}
            onCheckedChange={actions.setCrossTermsEnabled}
            data-testid="wigner-cross-terms"
          />
        )}

        {/* Quadrature points (hydrogen radial Wigner only) */}
        {isHydrogenMode && config.wignerDimensionIndex < 3 && (
          <Slider
            label="Quadrature Points"
            tooltip="Number of Gauss-Laguerre quadrature points for the radial Wigner transform integral. More points increase numerical accuracy."
            min={8}
            max={96}
            step={4}
            value={config.wignerQuadPoints}
            onChange={actions.setQuadPoints}
            showValue
            data-testid="wigner-quad-points-slider"
          />
        )}

        {/* Cache resolution */}
        <Select
          label="Cache Resolution"
          tooltip="Resolution of the cached Wigner function texture. Higher values show finer phase-space detail but use more GPU memory."
          options={[
            { value: '128', label: '128' },
            { value: '256', label: '256' },
            { value: '512', label: '512' },
            { value: '1024', label: '1024' },
          ]}
          value={String(config.wignerCacheResolution)}
          onChange={(v) => actions.setCacheResolution(Number(v))}
          data-testid="wigner-cache-resolution"
        />
      </div>
    )
  }
)

WignerControls.displayName = 'WignerControls'
