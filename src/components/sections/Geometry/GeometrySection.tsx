/**
 * Geometry Section Component
 * Section wrapper for object geometry controls
 */

import React, { useCallback, useMemo } from 'react'

import { Section } from '@/components/sections/Section'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { type DensityGridResolution, usePerformanceStore } from '@/stores/performanceStore'

import { DimensionSelector } from './DimensionSelector'
import { ObjectSettingsSection } from './ObjectSettingsSection'
import { ObjectTypeSelector } from './ObjectTypeSelector'

/** Props for the geometry/quantum configuration section. */
export interface GeometrySectionProps {
  defaultOpen?: boolean
}

const GRID_RESOLUTION_OPTIONS = [
  { value: '64', label: '64³' },
  { value: '96', label: '96³' },
  { value: '128', label: '128³' },
  { value: '256', label: '256³' },
] as const

export const GeometrySection: React.FC<GeometrySectionProps> = React.memo(
  ({ defaultOpen = true }) => {
    const densityGridResolution = usePerformanceStore((s) => s.densityGridResolution)
    const setDensityGridResolution = usePerformanceStore((s) => s.setDensityGridResolution)

    const handleGridResolutionChange = useCallback(
      (value: string) => {
        setDensityGridResolution(Number(value) as DensityGridResolution)
      },
      [setDensityGridResolution]
    )

    const gridOptions = useMemo(
      () => GRID_RESOLUTION_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      []
    )

    return (
      <Section title="Geometry" defaultOpen={defaultOpen} data-testid="geometry-section">
        <div className="space-y-1">
          <ControlGroup
            title="Grid Resolution"
            collapsible
            defaultOpen
            data-testid="control-group-grid-resolution"
          >
            <ToggleGroup
              options={gridOptions}
              value={String(densityGridResolution)}
              onChange={handleGridResolutionChange}
              fullWidth
              ariaLabel="Density grid resolution"
              data-testid="density-grid-resolution"
            />
          </ControlGroup>

          <ControlGroup
            title="Dimensions"
            collapsible
            defaultOpen
            data-testid="control-group-dimensions"
          >
            <DimensionSelector />
          </ControlGroup>

          <ControlGroup
            title="Object Type"
            collapsible
            defaultOpen
            data-testid="control-group-object-type"
          >
            <ObjectTypeSelector />
          </ControlGroup>

          <ObjectSettingsSection />
        </div>
      </Section>
    )
  }
)

GeometrySection.displayName = 'GeometrySection'
