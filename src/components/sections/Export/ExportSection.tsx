/**
 * Export Section Component
 * Section wrapper for export and share controls
 */

import { Section } from '@/components/sections/Section'
import React from 'react'
import { ExportButton } from '@/components/controls/ExportButton'
import { ShareButton } from '@/components/controls/ShareButton'

export interface ExportSectionProps {
  defaultOpen?: boolean
}

export const ExportSection: React.FC<ExportSectionProps> = ({ defaultOpen = true }) => {
  return (
    <Section title="Export & Share" defaultOpen={defaultOpen}>
      <div className="space-y-3">
        <ExportButton />
        <ShareButton />
      </div>
    </Section>
  )
}
