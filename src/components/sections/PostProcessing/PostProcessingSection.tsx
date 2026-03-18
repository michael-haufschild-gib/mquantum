/**
 * Post Processing Section Component
 * Section wrapper for post-processing effect controls
 */

import React from 'react'

import { Section } from '@/components/sections/Section'

import { PostProcessingControls } from './PostProcessingControls'

/** Props for the post-processing effects section. */
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
