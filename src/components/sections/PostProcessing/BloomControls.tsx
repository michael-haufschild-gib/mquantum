/**
 * BloomControls Component (Bloom V2)
 *
 * Simplified bloom controls with 3 primary sliders (Gain, Threshold, Radius)
 * and an Advanced collapsible section for per-band tuning.
 */

import React, { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/Button'
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { Switch } from '@/components/ui/Switch'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore'

const CollapsibleSection: React.FC<{
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}> = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-t border-[var(--border-subtle)] mt-2 pt-2 first:mt-0 first:border-t-0 first:pt-0">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider pb-1"
      >
        <span>{title}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </Button>
      {isOpen && <div className="space-y-3 pt-2">{children}</div>}
    </div>
  )
}

export interface BloomControlsProps {
  className?: string
}

export const BloomControls: React.FC<BloomControlsProps> = React.memo(({ className = '' }) => {
  const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
    bloomMode: state.bloomMode,
    bloomGain: state.bloomGain,
    bloomThreshold: state.bloomThreshold,
    bloomKnee: state.bloomKnee,
    bloomBands: state.bloomBands,
    bloomConvolutionRadius: state.bloomConvolutionRadius,
    bloomConvolutionResolutionScale: state.bloomConvolutionResolutionScale,
    bloomConvolutionBoost: state.bloomConvolutionBoost,
    bloomConvolutionTint: state.bloomConvolutionTint,
    setBloomMode: state.setBloomMode,
    setBloomGain: state.setBloomGain,
    setBloomThreshold: state.setBloomThreshold,
    setBloomKnee: state.setBloomKnee,
    setBloomBandEnabled: state.setBloomBandEnabled,
    setBloomBandWeight: state.setBloomBandWeight,
    setBloomBandSize: state.setBloomBandSize,
    setBloomBandTint: state.setBloomBandTint,
    setBloomRadius: state.setBloomRadius,
    setBloomConvolutionRadius: state.setBloomConvolutionRadius,
    setBloomConvolutionResolutionScale: state.setBloomConvolutionResolutionScale,
    setBloomConvolutionBoost: state.setBloomConvolutionBoost,
    setBloomConvolutionTint: state.setBloomConvolutionTint,
  }))

  const {
    bloomMode,
    bloomGain,
    bloomThreshold,
    bloomKnee,
    bloomBands,
    bloomConvolutionRadius,
    bloomConvolutionResolutionScale,
    bloomConvolutionBoost,
    bloomConvolutionTint,
    setBloomMode,
    setBloomGain,
    setBloomThreshold,
    setBloomKnee,
    setBloomBandEnabled,
    setBloomBandWeight,
    setBloomBandSize,
    setBloomBandTint,
    setBloomRadius,
    setBloomConvolutionRadius,
    setBloomConvolutionResolutionScale,
    setBloomConvolutionBoost,
    setBloomConvolutionTint,
  } = usePostProcessingStore(postProcessingSelector)

  const thresholdBypassed = bloomThreshold < 0

  return (
    <div className={`space-y-4 ${className}`}>
      <Slider
        label="Gain"
        min={0}
        max={3}
        step={0.05}
        value={bloomGain}
        onChange={setBloomGain}
        showValue
      />

      <Slider
        label="Threshold"
        min={-1}
        max={5}
        step={0.01}
        value={bloomThreshold}
        onChange={setBloomThreshold}
        showValue
        formatValue={(value) => (value < 0 ? 'Bypass' : value.toFixed(2))}
      />

      <Slider
        label="Radius"
        min={0.25}
        max={4}
        step={0.05}
        value={bloomBands[0]?.size ?? 1.0}
        onChange={setBloomRadius}
        showValue
      />

      <CollapsibleSection title="Advanced" defaultOpen={false}>
        <Slider
          label="Knee"
          min={0}
          max={5}
          step={0.01}
          value={bloomKnee}
          onChange={setBloomKnee}
          showValue
          disabled={thresholdBypassed}
        />

        <ToggleGroup
          options={[
            { value: 'gaussian', label: 'Gaussian' },
            { value: 'convolution', label: 'Convolution' },
          ]}
          value={bloomMode}
          onChange={setBloomMode}
          ariaLabel="Bloom mode"
        />

        {bloomMode === 'gaussian' ? (
          <div className="space-y-3">
            {bloomBands.map((band, index) => (
              <div key={`bloom-band-${index}`} className="rounded-md border border-border-subtle p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-text-secondary">Band {index + 1}</div>
                  <Switch
                    checked={band.enabled}
                    onCheckedChange={(enabled) => setBloomBandEnabled(index, enabled)}
                    label={band.enabled ? 'On' : 'Off'}
                  />
                </div>

                <Slider
                  label="Weight"
                  min={0}
                  max={4}
                  step={0.05}
                  value={band.weight}
                  onChange={(value) => setBloomBandWeight(index, value)}
                  showValue
                  disabled={!band.enabled}
                />

                <Slider
                  label="Size"
                  min={0.25}
                  max={4}
                  step={0.05}
                  value={band.size}
                  onChange={(value) => setBloomBandSize(index, value)}
                  showValue
                  disabled={!band.enabled}
                />

                <ColorPicker
                  label="Tint"
                  value={band.tint}
                  onChange={(value) => setBloomBandTint(index, value)}
                  disableAlpha
                  disabled={!band.enabled}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 rounded-md border border-border-subtle p-3">
            <Slider
              label="Convolution Radius"
              min={0.5}
              max={6}
              step={0.05}
              value={bloomConvolutionRadius}
              onChange={setBloomConvolutionRadius}
              showValue
            />

            <Slider
              label="Convolution Resolution"
              min={0.25}
              max={1}
              step={0.05}
              value={bloomConvolutionResolutionScale}
              onChange={setBloomConvolutionResolutionScale}
              showValue
            />

            <Slider
              label="Convolution Boost"
              min={0}
              max={4}
              step={0.05}
              value={bloomConvolutionBoost}
              onChange={setBloomConvolutionBoost}
              showValue
            />

            <ColorPicker
              label="Convolution Tint"
              value={bloomConvolutionTint}
              onChange={setBloomConvolutionTint}
              disableAlpha
            />
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
})

BloomControls.displayName = 'BloomControls'
