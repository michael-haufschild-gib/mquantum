import { Icon } from '@/components/ui/Icon'
import { Tab, Tabs } from '@/components/ui/Tabs'
import React, { useMemo, useState } from 'react'

// Import existing sidebar sections
import { AdvancedObjectControls } from '@/components/sections/Advanced/AdvancedObjectControls'
import { DocumentationSection } from '@/components/sections/Documentation/DocumentationSection'
import { EdgeGeometrySection } from '@/components/sections/Edges/EdgeGeometrySection'
import { EdgesSection } from '@/components/sections/Edges/EdgesSection'
import { EnvironmentSection } from '@/components/sections/Environment/EnvironmentSection'
import { FacesSection } from '@/components/sections/Faces/FacesSection'
import { LightsSection } from '@/components/sections/Lights/LightsSection'
import { PerformanceSection } from '@/components/sections/Performance/PerformanceSection'
import { PostProcessingSection } from '@/components/sections/PostProcessing/PostProcessingSection'
import { SettingsSection } from '@/components/sections/Settings/SettingsSection'
import { ShadowsSection } from '@/components/sections/Shadows/ShadowsSection'

export const EditorRightPanel: React.FC = React.memo(() => {
  // Default to 'object' tab as per user feedback (primary creative focus)
  const [activeTab, setActiveTab] = useState('object')

  const tabs: Tab[] = useMemo(
    () => [
      {
        id: 'object',
        label: (
          <div className="flex items-center gap-2">
            <Icon name="sphere" size={14} />
            <span>Object</span>
          </div>
        ),
        content: (
          <div>
            {/* The "Subject" - Materials, Lines, Shadows, Reflections */}
            <FacesSection defaultOpen={true} />
            <EdgesSection defaultOpen={false} />
            <EdgeGeometrySection defaultOpen={false} />
            <ShadowsSection defaultOpen={false} />
            <AdvancedObjectControls />
          </div>
        ),
      },
      {
        id: 'scene',
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
            <DocumentationSection defaultOpen={false} />
          </div>
        ),
      },
    ],
    []
  )

  return (
    <div className="h-full flex flex-col w-full shrink-0 overflow-hidden">
      {/* Header Section */}
      <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] backdrop-blur-sm z-10 shrink-0 flex items-center gap-2">
        <Icon name="menu" className="text-[var(--text-secondary)]" />
        <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
          Visuals
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
