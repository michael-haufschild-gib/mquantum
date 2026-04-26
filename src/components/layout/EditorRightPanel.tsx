import React, { Suspense, useRef, useState } from 'react'

// Import existing sidebar sections
import { AbsorptionSection } from '@/components/sections/Absorption/AbsorptionSection'
import { AdvancedObjectControls } from '@/components/sections/Advanced/AdvancedObjectControls'
import { ExposureSection } from '@/components/sections/Exposure/ExposureSection'
import { FacesSection } from '@/components/sections/Faces/FacesSection'
import { Icon } from '@/components/ui/Icon'
import { Tab, Tabs } from '@/components/ui/Tabs'
import { useScrollingPanelAttr } from '@/hooks/useScrollingPanelAttr'

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
  useScrollingPanelAttr(scrollContentRef)

  const tabs: Tab[] = [
    {
      id: 'object',
      tooltip: 'Appearance, exposure, absorption, and rendering for the active quantum object.',
      label: (
        <div className="flex items-center gap-2">
          <Icon name="sphere" size={14} />
          <span>Object</span>
        </div>
      ),
      content: <ObjectTabContent />,
    },
    {
      id: 'analysis',
      tooltip: 'Cross-section analysis, decoherence, entanglement, and quantum effects.',
      label: (
        <div className="flex items-center gap-2">
          <Icon name="chart" size={14} />
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
      tooltip: 'Environment, lighting, and post-processing effects.',
      label: (
        <div className="flex items-center gap-2">
          <Icon name="home" size={14} />
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
      tooltip: 'Application settings and performance tuning.',
      label: (
        <div className="flex items-center gap-2">
          <Icon name="cog" size={14} />
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
      {/* Header Section */}
      <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] backdrop-blur-sm z-10 shrink-0 flex items-center gap-2">
        <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
          Inspector
        </h2>
      </div>

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
