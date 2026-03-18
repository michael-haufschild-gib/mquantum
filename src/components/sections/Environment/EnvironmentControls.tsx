/**
 * Environment Controls Component
 * Controls for scene environment settings (background and skybox)
 */

import React, { useCallback, useState } from 'react'

import { Tabs } from '@/components/ui/Tabs'

import { BackgroundColorControls } from './BackgroundColorControls'
import { SkyboxControls } from './SkyboxControls'

/** Props for the environment detail controls. */
export interface EnvironmentControlsProps {
  className?: string
}

export const EnvironmentControls: React.FC<EnvironmentControlsProps> = React.memo(
  ({ className = '' }) => {
    const [activeTab, setActiveTab] = useState('color')

    const handleTabChange = useCallback((id: string) => {
      setActiveTab(id)
    }, [])

    const tabs = [
      { id: 'color', label: 'Color', content: <BackgroundColorControls /> },
      { id: 'skybox', label: 'Skybox', content: <SkyboxControls /> },
    ]

    return (
      <div className={className}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          data-testid="env-controls"
          tabListClassName="mb-4"
          tabs={tabs}
        />
      </div>
    )
  }
)

EnvironmentControls.displayName = 'EnvironmentControls'
