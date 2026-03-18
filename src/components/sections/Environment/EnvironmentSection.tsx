/**
 * Environment Section Component
 * Section wrapper for environment/scene controls
 */

import React from 'react'

import { Section } from '@/components/sections/Section'

import { EnvironmentControls } from './EnvironmentControls'

/** Props for the environment/skybox section. */
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
