import React from 'react'

import { EnvironmentSection } from '@/components/sections/Environment/EnvironmentSection'
import { LightsSection } from '@/components/sections/Lights/LightsSection'
import { PostProcessingSection } from '@/components/sections/PostProcessing/PostProcessingSection'

/** Scene tab — environment, lighting, and post-processing. */
const SceneTabContent: React.FC = () => (
  <div>
    <EnvironmentSection defaultOpen={true} />
    <LightsSection defaultOpen={false} />
    <PostProcessingSection defaultOpen={false} />
  </div>
)
SceneTabContent.displayName = 'SceneTabContent'

export default SceneTabContent
