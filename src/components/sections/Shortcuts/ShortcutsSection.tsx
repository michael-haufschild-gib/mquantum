/**
 * Shortcuts Section Component
 * Section wrapper for keyboard shortcuts display
 */

import React from 'react'

import { Section } from '@/components/sections/Section'
import { KeyboardShortcuts } from '@/components/sections/Shortcuts/KeyboardShortcuts'

/** Props for the keyboard shortcuts sidebar section. */
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
