import { Section } from '@/components/sections/Section'
import { useGeometryStore } from '@/stores/geometryStore'
import React from 'react'
import { SchroedingerAdvanced } from './SchroedingerAdvanced'
import { SharedAdvancedControls } from './SharedAdvancedControls'

export const AdvancedObjectControls: React.FC = React.memo(() => {
  const objectType = useGeometryStore((state) => state.objectType)

  if (objectType !== 'schroedinger') {
    return null
  }

  return (
    <Section title="Advanced Rendering" defaultOpen={true} data-testid="advanced-object-controls">
      <SharedAdvancedControls />
      <SchroedingerAdvanced />
    </Section>
  )
})

AdvancedObjectControls.displayName = 'AdvancedObjectControls'
