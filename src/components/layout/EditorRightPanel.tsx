import React, { Suspense, useRef, useState } from 'react'

// Import existing sidebar sections
import { PanelHeader } from '@/components/layout/PanelHeader'
import { AbsorptionSection } from '@/components/sections/Absorption/AbsorptionSection'
import { AdvancedObjectControls } from '@/components/sections/Advanced/AdvancedObjectControls'
import { ExposureSection } from '@/components/sections/Exposure/ExposureSection'
import { FacesSection } from '@/components/sections/Faces/FacesSection'
import { Icon } from '@/components/ui/Icon'
import { Tab, Tabs } from '@/components/ui/Tabs'

/** Object tab content — appearance, exposure, absorption, and advanced rendering. */
const ObjectTabContent: React.FC = React.memo(() => {
  return (
    <div>
      <FacesSection defaultOpen={true} />
      <ExposureSection defaultOpen={true} />
      <AbsorptionSection defaultOpen={true} />
      <AdvancedObjectControls />
    </div>
  )
})
ObjectTabContent.displayName = 'ObjectTabContent'

/** Analysis tab content — cross-section, decoherence, entanglement, and quantum effects. */
const AnalysisTabContent = React.lazy(
  () => import('@/components/layout/EditorRightPanel/AnalysisTabContent')
)

const SceneTabContent = React.lazy(
  () => import('@/components/layout/EditorRightPanel/SceneTabContent')
)

const SystemTabContent = React.lazy(
  () => import('@/components/layout/EditorRightPanel/SystemTabContent')
)

export const EditorRightPanel: React.FC = React.memo(() => {
  // Default to 'object' tab as per user feedback (primary creative focus)
  const [activeTab, setActiveTab] = useState('object')
  const scrollContentRef = useRef<HTMLDivElement>(null)

  const tabs: Tab[] = [
    {
      id: 'object',
      label: (
        <div className="flex items-center gap-1">
          <Icon name="sphere" size={12} />
          <span>Object</span>
        </div>
      ),
      content: <ObjectTabContent />,
    },
    {
      id: 'analysis',
      label: (
        <div className="flex items-center gap-1">
          <Icon name="chart" size={12} />
          <span>Analysis</span>
        </div>
      ),
      content: (
        <Suspense fallback={null}>
          <AnalysisTabContent />
        </Suspense>
      ),
    },
    {
      id: 'scene',
      label: (
        <div className="flex items-center gap-1">
          <Icon name="home" size={12} />
          <span>Scene</span>
        </div>
      ),
      content: (
        <Suspense fallback={null}>
          <SceneTabContent />
        </Suspense>
      ),
    },
    {
      id: 'system',
      label: (
        <div className="flex items-center gap-1">
          <Icon name="cog" size={12} />
          <span>System</span>
        </div>
      ),
      content: (
        <Suspense fallback={null}>
          <SystemTabContent />
        </Suspense>
      ),
    },
  ]

  return (
    <div className="h-full flex flex-col w-full shrink-0 overflow-hidden">
      <PanelHeader title="Inspector" subtitle="configure" variant="accent" />

      {/* Tabs & Content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <Tabs
          data-testid="right-panel-tabs"
          tabs={tabs}
          value={activeTab}
          onChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
          tabListClassName="px-3 pt-3 pb-0 bg-transparent"
          contentClassName="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-[var(--border-default)] hover:scrollbar-thumb-[var(--border-highlight)]"
          contentRef={scrollContentRef}
          variant="default"
          fullWidth
        />
      </div>
    </div>
  )
})

EditorRightPanel.displayName = 'EditorRightPanel'
