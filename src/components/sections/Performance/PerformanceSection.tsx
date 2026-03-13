/**
 * Performance Section Component
 * Top-level sidebar section for performance optimization controls
 */

import { Section } from '@/components/sections/Section'
import { Slider } from '@/components/ui/Slider'
import { usePerformanceStore } from '@/stores/performanceStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { EigenfunctionCacheControls } from './EigenfunctionCacheControls'
import { ProgressiveRefinementControls } from './ProgressiveRefinementControls'
import { TemporalReprojectionControls } from './TemporalReprojectionControls'

/**
 *
 */
export interface PerformanceSectionProps {
  defaultOpen?: boolean
}

/**
 * Performance section containing all performance optimization controls.
 * All controls are always visible regardless of current object type.
 * Some controls only affect specific object types (noted in tooltips).
 *
 * @param props - Component props
 * @param props.defaultOpen - Whether the section is initially expanded
 * @returns Performance section with all optimization controls
 */
export const PerformanceSection: React.FC<PerformanceSectionProps> = React.memo(
  ({ defaultOpen = false }) => {
    const { renderResolutionScale, setRenderResolutionScale, maxFps, setMaxFps } =
      usePerformanceStore(
        useShallow((state) => ({
          renderResolutionScale: state.renderResolutionScale,
          setRenderResolutionScale: state.setRenderResolutionScale,
          maxFps: state.maxFps,
          setMaxFps: state.setMaxFps,
        }))
      )

    return (
      <Section title="Performance" defaultOpen={defaultOpen}>
        {/* Frame Rate & Resolution */}
        <div className="pb-3 mb-3 border-b border-panel-border space-y-3">
          <Slider
            label="Max FPS"
            value={maxFps}
            min={15}
            max={120}
            step={1}
            onChange={setMaxFps}
            unit=" fps"
            tooltip="Limit frame rate to reduce power consumption"
            data-testid="max-fps-slider"
          />
          <Slider
            label="Render Resolution"
            value={renderResolutionScale}
            min={0.1}
            max={1.0}
            step={0.05}
            onChange={setRenderResolutionScale}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            tooltip="100% = native resolution. Lower values reduce GPU load for mobile/low-end devices."
            data-testid="render-resolution-slider"
          />
        </div>

        {/* Progressive Refinement - All objects */}
        <div className="pb-3 mb-3 border-b border-panel-border">
          <ProgressiveRefinementControls />
        </div>

        {/* Temporal Reprojection */}
        <TemporalReprojectionControls />

        {/* Eigenfunction Cache */}
        <EigenfunctionCacheControls />
      </Section>
    )
  }
)

PerformanceSection.displayName = 'PerformanceSection'
