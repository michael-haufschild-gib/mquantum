/**
 * Performance Section Component
 * Top-level sidebar section for performance optimization controls
 */

import { Section } from '@/components/sections/Section'
import React from 'react'
import { EigenfunctionCacheControls } from './EigenfunctionCacheControls'
import { ProgressiveRefinementControls } from './ProgressiveRefinementControls'
import { TemporalReprojectionControls } from './TemporalReprojectionControls'

export interface PerformanceSectionProps {
  defaultOpen?: boolean
}

/**
 * Performance section containing all performance optimization controls.
 * All controls are always visible regardless of current object type.
 * Some controls only affect specific object types (noted in tooltips).
 *
 * @param props - Component props
 * @param props.defaultOpen - Whether the section is initially expanded
 * @returns Performance section with all optimization controls
 */
export const PerformanceSection: React.FC<PerformanceSectionProps> = React.memo(
  ({ defaultOpen = false }) => {
    return (
      <Section title="Performance" defaultOpen={defaultOpen}>
        {/* Progressive Refinement - All objects */}
        <div className="pb-3 mb-3 border-b border-panel-border">
          <ProgressiveRefinementControls />
        </div>

        {/* Temporal Reprojection */}
        <TemporalReprojectionControls />

        {/* Eigenfunction Cache */}
        <EigenfunctionCacheControls />
      </Section>
    )
  }
)

PerformanceSection.displayName = 'PerformanceSection'
