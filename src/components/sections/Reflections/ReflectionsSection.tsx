/**
 * Reflections Section Component
 *
 * Centralized controls for all reflection systems:
 * - IBL (Image-Based Lighting): Environment reflections from skybox
 * - SSR (Screen-Space Reflections): Real-time reflections of scene objects
 */

import { SSRControls } from '@/components/sections/PostProcessing/SSRControls'
import { Section } from '@/components/sections/Section'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { Tabs } from '@/components/ui/Tabs'
import type { IBLQuality } from '@/stores/defaults/visualDefaults'
import { useEnvironmentStore, type EnvironmentStore } from '@/stores/environmentStore'
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore'
import React, { useState, useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface ReflectionsSectionProps {
  defaultOpen?: boolean
}

/** Options for IBL quality */
const IBL_QUALITY_OPTIONS: SelectOption<IBLQuality>[] = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low Quality' },
  { value: 'high', label: 'High Quality' },
]

export const ReflectionsSection: React.FC<ReflectionsSectionProps> = React.memo(
  ({ defaultOpen = false }) => {
    const [activeTab, setActiveTab] = useState('ibl')

    // IBL state
    const environmentSelector = useShallow((state: EnvironmentStore) => ({
      iblQuality: state.iblQuality,
      iblIntensity: state.iblIntensity,
      setIBLQuality: state.setIBLQuality,
      setIBLIntensity: state.setIBLIntensity,
    }))

    const { iblQuality, iblIntensity, setIBLQuality, setIBLIntensity } =
      useEnvironmentStore(environmentSelector)

    // SSR state
    const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
      ssrEnabled: state.ssrEnabled,
      setSSREnabled: state.setSSREnabled,
    }))

    const { ssrEnabled, setSSREnabled } = usePostProcessingStore(postProcessingSelector)

    const isIBLEnabled = iblQuality !== 'off'

    const handleTabChange = useCallback((id: string) => {
      setActiveTab(id)
    }, [])

    const tabs = useMemo(
      () => [
        {
          id: 'ibl',
          label: 'IBL',
          content: (
            <div className="space-y-4">
              {/* Info box */}
              <div className="px-2 py-1.5 rounded bg-[var(--bg-hover)] border border-border-default">
                <p className="text-[10px] font-medium text-text-primary">Environment Reflections</p>
                <p className="text-[10px] text-text-secondary">
                  Reflects skybox onto surfaces based on roughness
                </p>
              </div>

              {/* IBL Quality */}
              <Select<IBLQuality>
                label="Quality"
                options={IBL_QUALITY_OPTIONS}
                value={iblQuality}
                onChange={setIBLQuality}
                data-testid="ibl-quality-select"
              />

              {/* IBL Intensity */}
              <div className={!isIBLEnabled ? 'opacity-50 pointer-events-none' : ''}>
                <Slider
                  label="Intensity"
                  value={iblIntensity}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={setIBLIntensity}
                  showValue
                  tooltip="Brightness of environment reflections"
                  data-testid="ibl-intensity-slider"
                />
              </div>
            </div>
          ),
        },
        {
          id: 'ssr',
          label: 'SSR',
          content: (
            <div className="space-y-4">
              {/* Info box */}
              <div className="px-2 py-1.5 rounded bg-[var(--bg-hover)] border border-border-default">
                <p className="text-[10px] font-medium text-text-primary">
                  Screen-Space Reflections
                </p>
                <p className="text-[10px] text-text-secondary">
                  Reflects visible scene objects onto surfaces
                </p>
              </div>

              {/* Enable toggle */}
              <Switch
                checked={ssrEnabled}
                onCheckedChange={setSSREnabled}
                label="Enable SSR"
                data-testid="ssr-enabled-toggle"
              />

              {/* SSR Controls */}
              <div className={!ssrEnabled ? 'opacity-50 pointer-events-none' : ''}>
                <SSRControls />
              </div>
            </div>
          ),
        },
      ],
      [
        iblQuality,
        iblIntensity,
        setIBLQuality,
        setIBLIntensity,
        isIBLEnabled,
        ssrEnabled,
        setSSREnabled,
      ]
    )

    return (
      <Section title="Reflections" defaultOpen={defaultOpen} data-testid="section-reflections">
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          tabs={tabs}
          variant="default"
          tabListClassName="mb-4"
        />
      </Section>
    )
  }
)

ReflectionsSection.displayName = 'ReflectionsSection'
