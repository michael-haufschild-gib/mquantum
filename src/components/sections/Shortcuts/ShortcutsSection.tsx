/**
 * Shortcuts Section Component
 * Section wrapper for keyboard shortcuts display
 */

import { Section } from '@/components/sections/Section'
import React from 'react'
import { KeyboardShortcuts } from '@/components/sections/Shortcuts/KeyboardShortcuts'

export interface ShortcutsSectionProps {
  defaultOpen?: boolean
}

export const ShortcutsSection: React.FC<ShortcutsSectionProps> = ({ defaultOpen = false }) => {
  return (
    <Section title="Shortcuts" defaultOpen={defaultOpen}>
      <KeyboardShortcuts />
    </Section>
  )
}
