/**
 * Environment Section Component
 * Section wrapper for environment/scene controls
 */

import { Section } from '@/components/sections/Section'
import React from 'react'
import { EnvironmentControls } from './EnvironmentControls'

export interface EnvironmentSectionProps {
  defaultOpen?: boolean
}

export const EnvironmentSection: React.FC<EnvironmentSectionProps> = React.memo(
  ({ defaultOpen = false }) => {
    return (
      <Section title="Environment" defaultOpen={defaultOpen} data-testid="section-environment">
        <EnvironmentControls />
      </Section>
    )
  }
)

EnvironmentSection.displayName = 'EnvironmentSection'
