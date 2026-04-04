import React, { useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Switch } from '@/components/ui/Switch'
import { Tabs } from '@/components/ui/Tabs'
import { type PostProcessingSlice, usePostProcessingStore } from '@/stores/postProcessingStore'

import { BloomControls } from './BloomControls'
import { CinematicControls } from './CinematicControls'
import { MiscControls } from './MiscControls'
import { PaperControls } from './PaperControls'

export const PostProcessingControls: React.FC = React.memo(() => {
  const [activeTab, setActiveTab] = useState('bloom')

  const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
    bloomEnabled: state.bloomEnabled,
    setBloomEnabled: state.setBloomEnabled,
    cinematicEnabled: state.cinematicEnabled,
    setCinematicEnabled: state.setCinematicEnabled,
    paperEnabled: state.paperEnabled,
    setPaperEnabled: state.setPaperEnabled,
  }))
  const {
    bloomEnabled,
    setBloomEnabled,
    cinematicEnabled,
    setCinematicEnabled,
    paperEnabled,
    setPaperEnabled,
  } = usePostProcessingStore(postProcessingSelector)

  const handleTabChange = useCallback((id: string) => {
    setActiveTab(id)
  }, [])

  const tabs = useMemo(
    () => [
      {
        id: 'bloom',
        label: 'Bloom',
        content: (
          <div className="space-y-4">
            <Switch
              checked={bloomEnabled}
              onCheckedChange={setBloomEnabled}
              label="Enable Bloom"
              tooltip="Add a luminous glow around bright regions of the wavefunction. Creates a more cinematic, photorealistic appearance."
              data-testid="bloom-enabled-switch"
            />
            <div className={!bloomEnabled ? 'opacity-50 pointer-events-none' : ''}>
              <BloomControls />
            </div>
          </div>
        ),
      },
      {
        id: 'cinematic',
        label: 'Cinematic',
        content: (
          <div className="space-y-4">
            <Switch
              checked={cinematicEnabled}
              onCheckedChange={setCinematicEnabled}
              label="Enable Cinematic"
              tooltip="Apply cinematic effects: depth of field (bokeh blur), vignette, chromatic aberration, and film grain."
            />
            <div className={!cinematicEnabled ? 'opacity-50 pointer-events-none' : ''}>
              <CinematicControls />
            </div>
          </div>
        ),
      },
      {
        id: 'paper',
        label: 'Paper',
        content: (
          <div className="space-y-4">
            <Switch
              checked={paperEnabled}
              onCheckedChange={setPaperEnabled}
              label="Enable Paper Texture"
              tooltip="Overlay a textured paper grain effect for an academic/illustration aesthetic."
            />
            <div className={!paperEnabled ? 'opacity-50 pointer-events-none' : ''}>
              <PaperControls />
            </div>
          </div>
        ),
      },
      {
        id: 'fx',
        label: 'FX',
        content: (
          <div className="space-y-4">
            <MiscControls />
          </div>
        ),
      },
    ],
    [
      bloomEnabled,
      setBloomEnabled,
      cinematicEnabled,
      setCinematicEnabled,
      paperEnabled,
      setPaperEnabled,
    ]
  )

  return (
    <Tabs
      value={activeTab}
      onChange={handleTabChange}
      tabs={tabs}
      variant="default"
      tabListClassName="mb-4"
    />
  )
})

PostProcessingControls.displayName = 'PostProcessingControls'
