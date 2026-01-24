import { DimensionSelector } from '@/components/sections/Geometry/DimensionSelector'
import { ObjectSettingsSection } from '@/components/sections/Geometry/ObjectSettingsSection'
import { ObjectTypeExplorer } from '@/components/sections/ObjectTypes/ObjectTypeExplorer'
import { Icon } from '@/components/ui/Icon'
import { Tab, Tabs } from '@/components/ui/Tabs'
import React, { useMemo, useState } from 'react'

export const EditorLeftPanel: React.FC = React.memo(() => {
  const [activeTab, setActiveTab] = useState('type')

  const tabs: Tab[] = useMemo(
    () => [
      {
        id: 'type',
        label: (
          <div className="flex items-center gap-2">
            <Icon name="sphere" size={14} />
            <span>Type</span>
          </div>
        ),
        content: (
          <div className="p-4 bg-[var(--bg-hover)] min-h-full">
            <ObjectTypeExplorer />
          </div>
        ),
      },
      {
        id: 'geometry',
        label: (
          <div className="flex items-center gap-2">
            <Icon name="cog" size={14} />
            <span>Geometry</span>
          </div>
        ),
        content: (
          <div className="min-h-full">
            <ObjectSettingsSection />
          </div>
        ),
      },
    ],
    []
  )

  return (
    <div className="h-full flex flex-col w-full shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] backdrop-blur-sm z-10 shrink-0 flex items-center gap-2">
        <Icon name="menu" className="text-[var(--text-secondary)]" />
        <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
          Geometry
        </h2>
      </div>

      {/* Content Container */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        {/* Fixed Header Section with Dimension Selector */}
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-hover)] shrink-0">
          <div className="flex justify-between items-baseline px-4 py-2 border-b border-[var(--border-subtle)]">
            <label className="text-[10px] text-accent font-bold uppercase tracking-wider text-glow-subtle flex items-center gap-2">
              Dimensions
            </label>
          </div>
          <div className="p-4">
            <DimensionSelector />
          </div>
        </div>

        {/* Tabs Section */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <Tabs
            tabs={tabs}
            value={activeTab}
            onChange={setActiveTab}
            className="flex-1 flex flex-col min-h-0"
            tabListClassName="px-3 pt-0 pb-0 bg-transparent"
            contentClassName="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border-default)] hover:scrollbar-thumb-[var(--border-highlight)] p-0"
            variant="default"
            fullWidth
            data-testid="left-panel-tabs"
          />
        </div>
      </div>
    </div>
  )
})

EditorLeftPanel.displayName = 'EditorLeftPanel'
