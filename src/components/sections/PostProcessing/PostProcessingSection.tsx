/**
 * Post Processing Section Component
 * Section wrapper for post-processing effect controls
 */

import { Section } from '@/components/sections/Section'
import React from 'react'
import { PostProcessingControls } from './PostProcessingControls'

/**
 *
 */
export interface PostProcessingSectionProps {
  defaultOpen?: boolean
}

export const PostProcessingSection: React.FC<PostProcessingSectionProps> = React.memo(
  ({ defaultOpen = false }) => {
    return (
      <Section
        title="Post Processing"
        defaultOpen={defaultOpen}
        data-testid="section-post-processing"
      >
        <PostProcessingControls />
      </Section>
    )
  }
)

PostProcessingSection.displayName = 'PostProcessingSection'
