/**
 * Wythoff Polytope Settings Component
 *
 * Provides controls for configuring Wythoff polytopes including:
 * - Symmetry group selection (A, B, D)
 * - Preset type (regular, rectified, truncated, etc.)
 * - Scale control
 * - Snub variant toggle
 *
 * @see https://en.wikipedia.org/wiki/Wythoff_construction
 */

import { Section } from '@/components/sections/Section'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import {
  WythoffPreset,
  WythoffSymmetryGroup,
} from '@/lib/geometry/extended/types'
import { getWythoffPresetName } from '@/lib/geometry/wythoff'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 * Wythoff Polytope settings controls.
 *
 * Provides controls for the Wythoff kaleidoscopic construction parameters.
 * The Wythoff construction creates uniform polytopes by reflecting a seed point
 * through a system of mirrors.
 * @returns The Wythoff polytope settings UI component
 */
export const WythoffPolytopeSettings: React.FC = React.memo(() => {
  const dimension = useGeometryStore((state) => state.dimension)

  const { config, setSymmetryGroup, setPreset, setScale, setSnub } = useExtendedObjectStore(
    useShallow((state: ExtendedObjectState) => ({
      config: state.wythoffPolytope,
      setSymmetryGroup: state.setWythoffSymmetryGroup,
      setPreset: state.setWythoffPreset,
      setScale: state.setWythoffScale,
      setSnub: state.setWythoffSnub,
    }))
  )

  // Build symmetry group options
  const symmetryGroupOptions = React.useMemo(() => {
    const options: { value: WythoffSymmetryGroup; label: string }[] = [
      { value: 'A', label: `A${dimension} (Simplex symmetry)` },
      { value: 'B', label: `B${dimension} (Hypercube symmetry)` },
    ]

    // D_n requires dimension >= 4
    if (dimension >= 4) {
      options.push({ value: 'D', label: `D${dimension} (Demihypercube symmetry)` })
    }

    return options
  }, [dimension])

  // Build preset options
  const presetOptions = React.useMemo(() => {
    const options: { value: WythoffPreset; label: string }[] = [
      { value: 'regular', label: 'Regular (first node ringed)' },
      { value: 'rectified', label: 'Rectified (second node ringed)' },
      { value: 'truncated', label: 'Truncated (first two nodes)' },
    ]

    // Add more options for higher dimensions
    if (dimension >= 4) {
      options.push(
        { value: 'cantellated', label: 'Cantellated (1st & 3rd nodes)' },
        { value: 'runcinated', label: 'Runcinated (1st & last nodes)' },
      )
    }

    options.push({ value: 'omnitruncated', label: 'Omnitruncated (all nodes)' })

    return options
  }, [dimension])

  // Get the display name for current configuration
  const polytopeName = React.useMemo(() => {
    return getWythoffPresetName(config.preset, config.symmetryGroup, dimension)
  }, [config.preset, config.symmetryGroup, dimension])

  // Get default scale for current preset

  // Handle symmetry group change - reset to B if D is selected and dimension < 4
  const handleSymmetryGroupChange = React.useCallback(
    (group: WythoffSymmetryGroup) => {
      if (group === 'D' && dimension < 4) {
        return // Don't allow D for dimensions < 4
      }
      setSymmetryGroup(group)
    },
    [dimension, setSymmetryGroup]
  )

  return (
    <div data-testid="wythoff-polytope-settings">
      <Section title="Construction" defaultOpen={true}>
        {/* Current polytope name */}
        <div className="text-sm font-medium text-text-primary mb-2">
            {polytopeName}
        </div>

        {/* Symmetry group selection */}
        <Select<WythoffSymmetryGroup>
            label="Symmetry Group"
            options={symmetryGroupOptions}
            value={config.symmetryGroup}
            onChange={handleSymmetryGroupChange}
            data-testid="wythoff-symmetry-group"
        />
        <p className="text-xs text-text-secondary -mt-2">
            {config.symmetryGroup === 'A' && 'Simplex-based forms with n! symmetry operations'}
            {config.symmetryGroup === 'B' && 'Hypercube/cross-polytope forms with 2ⁿ·n! operations'}
            {config.symmetryGroup === 'D' && 'Half-hypercube forms with 2ⁿ⁻¹·n! operations'}
        </p>

        {/* Preset selection */}
        <Select<WythoffPreset>
            label="Wythoff Preset"
            options={presetOptions}
            value={config.preset}
            onChange={setPreset}
            data-testid="wythoff-preset"
        />
        <p className="text-xs text-text-secondary -mt-2">
            Determines which nodes are "ringed" in the Coxeter-Dynkin diagram
        </p>
      </Section>

      <Section title="Properties" defaultOpen={true}>
        {/* Scale slider */}
        <Slider
            label="Scale"
            min={0.5}
            max={5.0}
            step={0.1}
            value={config.scale}
            onChange={setScale}
            showValue
            data-testid="wythoff-scale"
        />

        {/* Snub variant toggle */}
        <div className="flex items-center gap-2">
            <Switch
            label="Snub Variant"
            checked={config.snub}
            onCheckedChange={setSnub}
            data-testid="wythoff-snub"
            />
        </div>
        <p className="text-xs text-text-secondary -mt-2">
            Alternated vertices, creates chiral forms
        </p>
      </Section>

      <Section title="Math Details" defaultOpen={false}>
        {/* Information about vertex/edge counts */}
        <div className="p-2 bg-[var(--bg-hover)] rounded text-xs text-text-secondary border border-border-subtle">
            <p>
            <strong>Wythoff Construction:</strong> Creates uniform polytopes by
            reflecting a seed point through {dimension} mirrors arranged according
            to a Coxeter-Dynkin diagram.
            </p>
            <p className="mt-1">
            The {config.symmetryGroup} symmetry group in {dimension}D has{' '}
            {config.symmetryGroup === 'A'
                ? `${factorial(dimension + 1)} symmetry operations`
                : config.symmetryGroup === 'B'
                ? `${Math.pow(2, dimension) * factorial(dimension)} symmetry operations`
                : `${Math.pow(2, dimension - 1) * factorial(dimension)} symmetry operations`
            }.
            </p>
        </div>
      </Section>
    </div>
  )
})

WythoffPolytopeSettings.displayName = 'WythoffPolytopeSettings'

// Helper function for factorial
function factorial(n: number): number {
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

