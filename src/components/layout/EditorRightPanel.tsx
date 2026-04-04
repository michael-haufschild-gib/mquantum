import React, { useState } from 'react'

// Import existing sidebar sections
import { AbsorptionSection } from '@/components/sections/Absorption/AbsorptionSection'
import { AdvancedObjectControls } from '@/components/sections/Advanced/AdvancedObjectControls'
import { AnalysisSection } from '@/components/sections/Advanced/AnalysisSection'
import { CoordinateEntanglementSection } from '@/components/sections/Advanced/CoordinateEntanglementSection'
import { OpenQuantumDiagnosticsSection } from '@/components/sections/Advanced/OpenQuantumDiagnosticsSection'
import { SchroedingerQuantumEffectsSection } from '@/components/sections/Advanced/SchroedingerQuantumEffectsSection'
import { EnvironmentSection } from '@/components/sections/Environment/EnvironmentSection'
import { ExposureSection } from '@/components/sections/Exposure/ExposureSection'
import { FacesSection } from '@/components/sections/Faces/FacesSection'
import { DecoherenceSection } from '@/components/sections/Geometry/DecoherenceSection/DecoherenceSection'
import { LightsSection } from '@/components/sections/Lights/LightsSection'
import { PerformanceSection } from '@/components/sections/Performance/PerformanceSection'
import { PostProcessingSection } from '@/components/sections/PostProcessing/PostProcessingSection'
import { SettingsSection } from '@/components/sections/Settings/SettingsSection'
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
const AnalysisTabContent: React.FC = React.memo(() => {
  return (
    <div>
      <AnalysisSection defaultOpen={true} />
      <DecoherenceSection />
      <CoordinateEntanglementSection />
      <SchroedingerQuantumEffectsSection defaultOpen={true} />
      <OpenQuantumDiagnosticsSection />
    </div>
  )
})
AnalysisTabContent.displayName = 'AnalysisTabContent'

export const EditorRightPanel: React.FC = React.memo(() => {
  // Default to 'object' tab as per user feedback (primary creative focus)
  const [activeTab, setActiveTab] = useState('object')

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
      content: <AnalysisTabContent />,
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
        <div>
          {/* The "Stage" - Background, Lighting, Lens, FX */}
          <EnvironmentSection defaultOpen={true} />
          <LightsSection defaultOpen={false} />
          <PostProcessingSection defaultOpen={false} />
        </div>
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
        <div>
          {/* The "App" - Settings, Meta, Output */}
          <SettingsSection defaultOpen={true} />
          <PerformanceSection defaultOpen={false} />
        </div>
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
          variant="default"
          fullWidth
        />
      </div>
    </div>
  )
})

EditorRightPanel.displayName = 'EditorRightPanel'
