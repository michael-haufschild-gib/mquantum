import { DimensionSelector } from '@/components/sections/Geometry/DimensionSelector'
import { ObjectSettingsSection } from '@/components/sections/Geometry/ObjectSettingsSection'
import { ObjectTypeExplorer } from '@/components/sections/ObjectTypes/ObjectTypeExplorer'
import { Icon } from '@/components/ui/Icon'
import { Slider } from '@/components/ui/Slider'
import { Tab, Tabs } from '@/components/ui/Tabs'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import React, { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

type SurfaceMode = 'volumetric' | 'isosurface'

const SURFACE_MODE_OPTIONS = [
  { value: 'volumetric' as const, label: 'Volumetric Cloud' },
  { value: 'isosurface' as const, label: 'Iso Surface' },
]

export const EditorLeftPanel: React.FC = React.memo(() => {
  const [activeTab, setActiveTab] = useState('type')
  const dimension = useGeometryStore((state) => state.dimension)
  const isoSelector = useShallow((state: ExtendedObjectState) => ({
    isoEnabled: state.schroedinger?.isoEnabled ?? false,
    isoThreshold: state.schroedinger?.isoThreshold ?? -3,
    representation: state.schroedinger?.representation ?? 'position',
    setIsoEnabled: state.setSchroedingerIsoEnabled,
    setIsoThreshold: state.setSchroedingerIsoThreshold,
  }))
  const { isoEnabled, isoThreshold, representation, setIsoEnabled, setIsoThreshold } = useExtendedObjectStore(
    isoSelector
  )

  const handleSurfaceModeChange = (mode: SurfaceMode) => {
    setIsoEnabled(mode === 'isosurface')
  }

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

          <div className="px-4 py-2">
            <DimensionSelector />
          </div>
          {dimension > 2 && representation !== 'wigner' && (
            <div className="px-4 pb-2">
              <div className="space-y-1">

                <ToggleGroup
                  options={SURFACE_MODE_OPTIONS}
                  value={isoEnabled ? 'isosurface' : 'volumetric'}
                  onChange={handleSurfaceModeChange}
                  ariaLabel="Select surface rendering mode"
                  data-testid="surface-mode-selector"
                />
                {isoEnabled && (
                  <Slider
                    label="Iso Threshold (log)"
                    min={-6}
                    max={0}
                    step={0.1}
                    value={isoThreshold}
                    onChange={setIsoThreshold}
                    showValue
                    data-testid="schroedinger-iso-threshold"
                  />
                )}

              </div>
            </div>
          )}
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
