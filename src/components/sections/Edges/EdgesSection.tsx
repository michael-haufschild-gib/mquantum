import { Section } from '@/components/sections/Section'
import React from 'react'
import { EdgeControls } from './EdgeControls'

export interface EdgesSectionProps {
  defaultOpen?: boolean
}

export const EdgesSection: React.FC<EdgesSectionProps> = React.memo(({ defaultOpen = false }) => {
  return (
    <Section title="Fresnel Rim" defaultOpen={defaultOpen}>
      <EdgeControls />
    </Section>
  )
})

EdgesSection.displayName = 'EdgesSection'
