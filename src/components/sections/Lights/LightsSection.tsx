/**
 * Lights Section Component
 * Section wrapper for lighting controls
 */

import React from 'react'

import { Section } from '@/components/sections/Section'

import { LightingControls } from './LightingControls'

/** Props for the lighting section of the sidebar. */
export interface LightsSectionProps {
  defaultOpen?: boolean
}

export const LightsSection: React.FC<LightsSectionProps> = React.memo(({ defaultOpen = false }) => {
  return (
    <Section title="Lights" defaultOpen={defaultOpen}>
      <LightingControls />
    </Section>
  )
})

LightsSection.displayName = 'LightsSection'
