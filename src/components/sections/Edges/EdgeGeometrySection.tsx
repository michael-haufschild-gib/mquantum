import { Section } from '@/components/sections/Section'
import React from 'react'
import { EdgeGeometryControls } from './EdgeGeometryControls'

export interface EdgeGeometrySectionProps {
  defaultOpen?: boolean
}

export const EdgeGeometrySection: React.FC<EdgeGeometrySectionProps> = React.memo(
  ({ defaultOpen = false }) => {
    return (
      <Section title="Edge Geometry" defaultOpen={defaultOpen}>
        <EdgeGeometryControls />
      </Section>
    )
  }
)

EdgeGeometrySection.displayName = 'EdgeGeometrySection'
