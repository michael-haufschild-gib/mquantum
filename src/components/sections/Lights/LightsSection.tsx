/**
 * Lights Section Component
 * Section wrapper for lighting controls
 */

import React from 'react'

import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { supportsSharedVolumeEffects } from '@/lib/geometry/registry'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

import { LightingControls } from './LightingControls'

/** Props for the lighting section of the sidebar. */
export interface LightsSectionProps {
  defaultOpen?: boolean
}

export const LightsSection: React.FC<LightsSectionProps> = React.memo(({ defaultOpen = false }) => {
  const object = useGeometryStore((s) => s.objectType)
  const mode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)
  if (!supportsSharedVolumeEffects(object, mode))
    return <UnavailableSection title="Lights" reason="The master field uses emission." />
  return (
    <Section title="Lights" defaultOpen={defaultOpen}>
      <LightingControls />
    </Section>
  )
})

LightsSection.displayName = 'LightsSection'
