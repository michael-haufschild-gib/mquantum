/**
 * Paper Controls Component
 *
 * Controls for the Paper Texture post-processing effect.
 * Provides sliders for texture parameters and color pickers for front/back colors.
 */

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore'
import { useShallow } from 'zustand/react/shallow'
import type { PaperQuality } from '@/stores/defaults/visualDefaults'

/**
 *
 */
export interface PaperControlsProps {
  className?: string
}

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider pt-2 pb-1 border-t border-panel-border mt-2 first:mt-0 first:border-t-0 first:pt-0">
    {title}
  </div>
)

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

const QUALITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export const PaperControls: React.FC<PaperControlsProps> = React.memo(({ className = '' }) => {
  const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
    // Texture
    paperContrast: state.paperContrast,
    paperRoughness: state.paperRoughness,
    paperQuality: state.paperQuality,
    paperIntensity: state.paperIntensity,
    // Colors
    paperColorFront: state.paperColorFront,
    paperColorBack: state.paperColorBack,
    // Fiber
    paperFiber: state.paperFiber,
    paperFiberSize: state.paperFiberSize,
    // Details
    paperCrumples: state.paperCrumples,
    paperCrumpleSize: state.paperCrumpleSize,
    paperFolds: state.paperFolds,
    paperFoldCount: state.paperFoldCount,
    paperDrops: state.paperDrops,
    paperFade: state.paperFade,
    paperSeed: state.paperSeed,
    // Setters
    setPaperContrast: state.setPaperContrast,
    setPaperRoughness: state.setPaperRoughness,
    setPaperQuality: state.setPaperQuality,
    setPaperIntensity: state.setPaperIntensity,
    setPaperColorFront: state.setPaperColorFront,
    setPaperColorBack: state.setPaperColorBack,
    setPaperFiber: state.setPaperFiber,
    setPaperFiberSize: state.setPaperFiberSize,
    setPaperCrumples: state.setPaperCrumples,
    setPaperCrumpleSize: state.setPaperCrumpleSize,
    setPaperFolds: state.setPaperFolds,
    setPaperFoldCount: state.setPaperFoldCount,
    setPaperDrops: state.setPaperDrops,
    setPaperFade: state.setPaperFade,
    setPaperSeed: state.setPaperSeed,
  }))

  const {
    paperContrast,
    paperRoughness,
    paperQuality,
    paperIntensity,
    paperColorFront,
    paperColorBack,
    paperFiber,
    paperFiberSize,
    paperCrumples,
    paperCrumpleSize,
    paperFolds,
    paperFoldCount,
    paperDrops,
    paperFade,
    paperSeed,
    setPaperContrast,
    setPaperRoughness,
    setPaperQuality,
    setPaperIntensity,
    setPaperColorFront,
    setPaperColorBack,
    setPaperFiber,
    setPaperFiberSize,
    setPaperCrumples,
    setPaperCrumpleSize,
    setPaperFolds,
    setPaperFoldCount,
    setPaperDrops,
    setPaperFade,
    setPaperSeed,
  } = usePostProcessingStore(postProcessingSelector)

  return (
    <div className={`space-y-3 ${className}`}>
      {/* --- Texture Section --- */}
      <SectionHeader title="Texture" />

      <Slider
        label="Intensity"
        min={0}
        max={1}
        step={0.01}
        value={paperIntensity}
        onChange={setPaperIntensity}
        showValue
      />

      <Slider
        label="Contrast"
        min={0}
        max={1}
        step={0.01}
        value={paperContrast}
        onChange={setPaperContrast}
        showValue
      />

      <Slider
        label="Roughness"
        min={0}
        max={1}
        step={0.01}
        value={paperRoughness}
        onChange={setPaperRoughness}
        showValue
      />

      <Select
        label="Quality"
        value={paperQuality}
        options={QUALITY_OPTIONS}
        onChange={(value) => setPaperQuality(value as PaperQuality)}
      />

      {/* --- Colors Section --- */}
      <SectionHeader title="Colors" />

      <ColorPicker
        label="Front Color"
        value={paperColorFront}
        onChange={setPaperColorFront}
        disableAlpha
      />

      <ColorPicker
        label="Back Color"
        value={paperColorBack}
        onChange={setPaperColorBack}
        disableAlpha
      />

      {/* --- Fiber Section --- */}
      <SectionHeader title="Fiber" />

      <Slider
        label="Fiber Amount"
        min={0}
        max={1}
        step={0.01}
        value={paperFiber}
        onChange={setPaperFiber}
        showValue
      />

      <Slider
        label="Size"
        min={0.1}
        max={2}
        step={0.1}
        value={paperFiberSize}
        onChange={setPaperFiberSize}
        showValue
      />

      {/* --- Details Section (Collapsible) --- */}
      <CollapsibleSection title="Details" defaultOpen={false}>
        <Slider
          label="Crumples"
          min={0}
          max={1}
          step={0.01}
          value={paperCrumples}
          onChange={setPaperCrumples}
          showValue
        />

        <Slider
          label="Crumple Size"
          min={0.1}
          max={2}
          step={0.1}
          value={paperCrumpleSize}
          onChange={setPaperCrumpleSize}
          showValue
        />

        <Slider
          label="Folds"
          min={0}
          max={1}
          step={0.01}
          value={paperFolds}
          onChange={setPaperFolds}
          showValue
        />

        <Slider
          label="Fold Count"
          min={1}
          max={15}
          step={1}
          value={paperFoldCount}
          onChange={setPaperFoldCount}
          showValue
        />

        <Slider
          label="Drops"
          min={0}
          max={1}
          step={0.01}
          value={paperDrops}
          onChange={setPaperDrops}
          showValue
        />

        <Slider
          label="Fade"
          min={0}
          max={1}
          step={0.01}
          value={paperFade}
          onChange={setPaperFade}
          showValue
        />

        <Slider
          label="Seed"
          min={0}
          max={1000}
          step={1}
          value={paperSeed}
          onChange={setPaperSeed}
          showValue
        />
      </CollapsibleSection>
    </div>
  )
})

PaperControls.displayName = 'PaperControls'
