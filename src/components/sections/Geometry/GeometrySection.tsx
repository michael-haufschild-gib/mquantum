/**
 * Geometry Section Component
 * Section wrapper for object geometry controls
 */

import React from 'react'

import { Section } from '@/components/sections/Section'
import { ControlGroup } from '@/components/ui/ControlGroup'

import { DimensionSelector } from './DimensionSelector'
import { ObjectSettingsSection } from './ObjectSettingsSection'
import { ObjectTypeSelector } from './ObjectTypeSelector'

/** Props for the geometry/quantum configuration section. */
export interface GeometrySectionProps {
  defaultOpen?: boolean
}

export const GeometrySection: React.FC<GeometrySectionProps> = React.memo(
  ({ defaultOpen = true }) => {
    return (
      <Section title="Geometry" defaultOpen={defaultOpen} data-testid="geometry-section">
        <div className="space-y-1">
          <ControlGroup title="Dimensions" collapsible defaultOpen>
            <DimensionSelector />
          </ControlGroup>

          <ControlGroup title="Object Type" collapsible defaultOpen>
            <ObjectTypeSelector />
          </ControlGroup>

          <ObjectSettingsSection />
        </div>
      </Section>
    )
  }
)

GeometrySection.displayName = 'GeometrySection'
