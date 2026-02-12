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
    const isHydrogenMode = config.quantumMode === 'hydrogenND'

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

    // Clamp dimension index to valid range
    const currentDimIdx = String(Math.min(config.wignerDimensionIndex, dimension - 1))

    return (
      <div className="space-y-3" data-testid="wigner-controls">
        {/* Dimension selector */}
        <Select
          label="Phase-Space Dimension"
          options={dimensionOptions}
          value={currentDimIdx}
          onChange={(v) => actions.setDimensionIndex(Number(v))}
          data-testid="wigner-dimension-select"
        />

        {/* Auto-range toggle */}
        <Switch
          label="Auto Range"
          checked={config.wignerAutoRange}
          onCheckedChange={actions.setAutoRange}
          data-testid="wigner-auto-range"
        />

        {/* Manual range sliders (only when auto-range is off) */}
        {!config.wignerAutoRange && (
          <div className="space-y-3">
            <Slider
              label="X Range"
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
            checked={config.wignerCrossTermsEnabled}
            onCheckedChange={actions.setCrossTermsEnabled}
            data-testid="wigner-cross-terms"
          />
        )}

        {/* Quadrature points (hydrogen radial Wigner only) */}
        {isHydrogenMode && config.wignerDimensionIndex < 3 && (
          <Slider
            label="Quadrature Points"
            min={8}
            max={96}
            step={4}
            value={config.wignerQuadPoints}
            onChange={actions.setQuadPoints}
            showValue
            data-testid="wigner-quad-points-slider"
          />
        )}

        {/* Classical trajectory overlay */}
        <Switch
          label="Classical Overlay"
          checked={config.wignerClassicalOverlay}
          onCheckedChange={actions.setClassicalOverlay}
          data-testid="wigner-classical-overlay"
        />

        {/* Cache resolution */}
        <Select
          label="Cache Resolution"
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
