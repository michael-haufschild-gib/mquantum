/**
 * Visual Section Component
 * Section wrapper for visual appearance controls
 *
 * Note: Material controls (diffuse, specular) have been moved to the
 * Faces section's Material tab for better organization.
 */

import { Section } from '@/components/sections/Section'
import React from 'react'
import { EdgeControls } from './EdgeControls'
import { useAppearanceStore } from '@/stores/appearanceStore'

export interface EdgesSectionProps {
  defaultOpen?: boolean
}

export const EdgesSection: React.FC<EdgesSectionProps> = React.memo(({ defaultOpen = false }) => {
  const edgesVisible = useAppearanceStore((state) => state.edgesVisible)

  return (
    <Section title="Edges" defaultOpen={defaultOpen}>
      <div
        className={`space-y-6 transition-opacity duration-300 ${!edgesVisible ? 'opacity-40 pointer-events-none grayscale' : ''}`}
      >
        <EdgeControls />

        {!edgesVisible && (
          <div className="text-center p-4 border border-dashed border-border-default rounded-lg bg-[var(--bg-hover)]">
            <p className="text-xs text-text-secondary">Enable Edges to edit settings</p>
          </div>
        )}
      </div>
    </Section>
  )
})

EdgesSection.displayName = 'EdgesSection'
