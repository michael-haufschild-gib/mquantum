import { Icon } from '@/components/ui/Icon'
import { Tab, Tabs } from '@/components/ui/Tabs'
import { AnimatePresence, m } from 'motion/react'
import React, { useMemo, useState } from 'react'

// Import existing sidebar sections
import { AdvancedObjectControls } from '@/components/sections/Advanced/AdvancedObjectControls'
import { OpenQuantumDiagnosticsSection } from '@/components/sections/Advanced/OpenQuantumDiagnosticsSection'
import { SchroedingerCrossSectionSection } from '@/components/sections/Advanced/SchroedingerCrossSectionSection'
import { SchroedingerQuantumEffectsSection } from '@/components/sections/Advanced/SchroedingerQuantumEffectsSection'
import { BECAnalysisSection } from '@/components/sections/Advanced/BECAnalysisSection'
import { DiracAnalysisSection } from '@/components/sections/Advanced/DiracAnalysisSection'
import { FSFAnalysisSection } from '@/components/sections/Advanced/FSFAnalysisSection'
import { TDSEAnalysisSection } from '@/components/sections/Advanced/TDSEAnalysisSection'
import { EnvironmentSection } from '@/components/sections/Environment/EnvironmentSection'
import { FacesSection } from '@/components/sections/Faces/FacesSection'
import { LightsSection } from '@/components/sections/Lights/LightsSection'
import { PerformanceSection } from '@/components/sections/Performance/PerformanceSection'
import { PostProcessingSection } from '@/components/sections/PostProcessing/PostProcessingSection'
import { SettingsSection } from '@/components/sections/Settings/SettingsSection'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

const sectionTransition = { duration: 0.2, ease: 'easeInOut' as const }
const sectionVariants = {
  initial: { opacity: 0, height: 0, overflow: 'hidden' as const },
  animate: { opacity: 1, height: 'auto', overflow: 'visible' as const },
  exit: { opacity: 0, height: 0, overflow: 'hidden' as const },
}

/** Object tab content — extracted so it can subscribe to quantum mode */
const ObjectTabContent: React.FC = React.memo(() => {
  const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)
  const isCompute =
    quantumMode === 'freeScalarField' ||
    quantumMode === 'tdseDynamics' ||
    quantumMode === 'becDynamics' ||
    quantumMode === 'diracEquation'

  return (
    <div>
      <FacesSection defaultOpen={true} />
      <SchroedingerCrossSectionSection defaultOpen={true} />
      <AnimatePresence initial={false}>
        {/* Compute-mode analysis sections — animate in/out when switching between analytic and compute */}
        {isCompute && (
          <m.div
            key="compute-analysis-group"
            variants={sectionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={sectionTransition}
          >
            <FSFAnalysisSection defaultOpen={true} />
            <TDSEAnalysisSection defaultOpen={true} />
            <BECAnalysisSection defaultOpen={true} />
            <DiracAnalysisSection defaultOpen={true} />
          </m.div>
        )}
      </AnimatePresence>
      <SchroedingerQuantumEffectsSection defaultOpen={true} />
      <AdvancedObjectControls />
      <OpenQuantumDiagnosticsSection />
    </div>
  )
})
ObjectTabContent.displayName = 'ObjectTabContent'

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
        content: <ObjectTabContent />,
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
