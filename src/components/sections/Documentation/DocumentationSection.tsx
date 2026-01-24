/**
 * Documentation Section Component
 * Section wrapper for educational content
 */

import { Section } from '@/components/sections/Section'
import React from 'react'
import { EducationPanel } from './EducationPanel'

export interface DocumentationSectionProps {
  defaultOpen?: boolean
}

export const DocumentationSection: React.FC<DocumentationSectionProps> = ({
  defaultOpen = false,
}) => {
  return (
    <Section title="Documentation" defaultOpen={defaultOpen}>
      <EducationPanel />
    </Section>
  )
}
