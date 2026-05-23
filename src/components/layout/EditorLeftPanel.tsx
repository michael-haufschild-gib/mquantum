import React, { Suspense, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { PanelHeader } from '@/components/layout/PanelHeader'
import { DimensionSelector } from '@/components/sections/Geometry/DimensionSelector'
import { ScenarioSelector } from '@/components/sections/Geometry/ScenarioSelector'
import { ObjectTypeExplorer } from '@/components/sections/ObjectTypes/ObjectTypeExplorer'
import { Icon } from '@/components/ui/Icon'
import { Slider } from '@/components/ui/Slider'
import { Tab, Tabs } from '@/components/ui/Tabs'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { useAnySweepRunning } from '@/hooks/useAnySweepRunning'
import { supportsSchroedingerSurfaceMode } from '@/lib/geometry/registry'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'
import {
  type ExtendedObjectState,
  useExtendedObjectStore,
} from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

type SurfaceMode = 'volumetric' | 'isosurface'

const ObjectSettingsSection = React.lazy(() =>
  import('@/components/sections/Geometry/ObjectSettingsSection').then((m) => ({
    default: m.ObjectSettingsSection,
  }))
)

const SURFACE_MODE_OPTIONS = [
  { value: 'volumetric' as const, label: 'Volumetric Cloud' },
  { value: 'isosurface' as const, label: 'Iso Surface' },
]

const GRID_RESOLUTION_OPTIONS = [
  { value: '64', label: '64³' },
  { value: '96', label: '96³' },
  { value: '128', label: '128³' },
  { value: '256', label: '256³' },
]

export const EditorLeftPanel: React.FC = React.memo(() => {
  const [activeTab, setActiveTab] = useState('type')
  const sweepRunning = useAnySweepRunning()
  const scrollContentRef = useRef<HTMLDivElement>(null)
  const { dimension, objectType } = useGeometryStore(
    useShallow((state) => ({ dimension: state.dimension, objectType: state.objectType }))
  )
  const isoSelector = useShallow((state: ExtendedObjectState) => ({
    isoEnabled: state.schroedinger?.isoEnabled ?? false,
    isoThreshold: state.schroedinger?.isoThreshold ?? -3,
    quantumMode: state.schroedinger?.quantumMode ?? 'harmonicOscillator',
    representation: state.schroedinger?.representation ?? 'position',
    setIsoEnabled: state.setSchroedingerIsoEnabled,
    setIsoThreshold: state.setSchroedingerIsoThreshold,
  }))
  const { isoEnabled, isoThreshold, quantumMode, representation, setIsoEnabled, setIsoThreshold } =
    useExtendedObjectStore(isoSelector)

  const densityGridResolution = usePerformanceStore((s) => s.densityGridResolution)
  const setDensityGridResolution = usePerformanceStore((s) => s.setDensityGridResolution)
  const surfaceModeSupported = supportsSchroedingerSurfaceMode({
    objectType,
    quantumMode,
    dimension,
    representation,
  })

  const handleSurfaceModeChange = (mode: SurfaceMode) => {
    setIsoEnabled(mode === 'isosurface')
  }

  const handleGridResolutionChange = (value: string) => {
    const parsed = Number(value)
    if (parsed === 64 || parsed === 96 || parsed === 128 || parsed === 256) {
      setDensityGridResolution(parsed)
    }
  }

  const tabs: Tab[] = [
    {
      id: 'type',
      label: (
        <div className="flex items-center gap-1">
          <Icon name="sparkles" size={12} />
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
        <div className="flex items-center gap-1">
          <Icon name="layers" size={12} />
          <span>Geometry</span>
        </div>
      ),
      content: (
        <fieldset
          disabled={sweepRunning}
          className={`min-h-full transition-opacity border-0 p-0 m-0 min-w-0${sweepRunning ? ' opacity-50' : ''}`}
        >
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-3xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider shrink-0">
                Grid
              </span>
              <ToggleGroup
                options={GRID_RESOLUTION_OPTIONS}
                value={String(densityGridResolution)}
                onChange={handleGridResolutionChange}
                fullWidth
                ariaLabel="Density grid resolution"
                tooltip="3D density grid resolution per axis. Higher = sharper detail, more GPU memory."
                data-testid="density-grid-resolution"
              />
            </div>
          </div>
          <Suspense fallback={null}>
            <ObjectSettingsSection />
          </Suspense>
        </fieldset>
      ),
    },
  ]

  return (
    <div className="h-full flex flex-col w-full shrink-0 overflow-hidden">
      <PanelHeader title="Explorer" subtitle="browse & pick" variant="muted" />

      {/* Content Container */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        {/* Fixed Header Section with Dimension Selector */}
        <fieldset
          disabled={sweepRunning}
          className={`border-b border-[var(--border-subtle)] bg-[var(--bg-hover)] shrink-0 transition-opacity border-t-0 border-x-0 p-0 m-0 min-w-0${sweepRunning ? ' opacity-50' : ''}`}
        >
          <div className="px-4 py-2">
            <DimensionSelector disabled={sweepRunning} />
          </div>
          {surfaceModeSupported && (
            <div className="px-4 pb-2">
              <div className="space-y-1">
                <ToggleGroup
                  options={SURFACE_MODE_OPTIONS}
                  value={isoEnabled ? 'isosurface' : 'volumetric'}
                  onChange={handleSurfaceModeChange}
                  fullWidth
                  ariaLabel="Select surface rendering mode"
                  tooltip="Volumetric renders a translucent probability cloud. Isosurface renders a solid shell at a constant probability density."
                  data-testid="surface-mode-selector"
                />
                {isoEnabled && (
                  <Slider
                    label="Iso Threshold (log)"
                    tooltip="Log-scale probability density at which the isosurface is drawn. Lower values reveal more of the wavefunction structure."
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
          <div className="px-4 pb-2">
            <ScenarioSelector />
          </div>
        </fieldset>

        {/* Tabs Section */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <Tabs
            tabs={tabs}
            value={activeTab}
            onChange={setActiveTab}
            className="flex-1 flex flex-col min-h-0"
            tabListClassName="px-3 pt-0 pb-0 bg-transparent"
            contentClassName="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border-default)] hover:scrollbar-thumb-[var(--border-highlight)] p-0"
            contentRef={scrollContentRef}
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
