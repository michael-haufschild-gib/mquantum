/**
 * Paper Controls Component
 *
 * Controls for the Paper Texture post-processing effect.
 * Provides sliders for texture parameters and color pickers for front/back colors.
 */

import React, { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import type { PaperQuality } from '@/stores/defaults/visualDefaults'
import {
  type PostProcessingSlice,
  usePostProcessingStore,
} from '@/stores/scene/postProcessingStore'

import { PostProcessingSectionHeader as SectionHeader } from './SectionHeader'

/** Props for the paper texture overlay controls. */
export interface PaperControlsProps {
  className?: string
}

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
        tooltip={`Expand or collapse the ${title} subsection`}
        className="flex items-center justify-between w-full text-2xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider pb-1"
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
        tooltip="Overall strength of the paper texture overlay. 0 = invisible, 1 = fully opaque."
        min={0}
        max={1}
        step={0.01}
        value={paperIntensity}
        onChange={setPaperIntensity}
        showValue
      />

      <Slider
        label="Contrast"
        tooltip="Contrast of the paper grain pattern. Higher values create more pronounced light/dark variation."
        min={0}
        max={1}
        step={0.01}
        value={paperContrast}
        onChange={setPaperContrast}
        showValue
      />

      <Slider
        label="Roughness"
        tooltip="Surface roughness of the simulated paper. Higher values produce a coarser, more textured appearance."
        min={0}
        max={1}
        step={0.01}
        value={paperRoughness}
        onChange={setPaperRoughness}
        showValue
      />

      <Select
        label="Quality"
        tooltip="Noise resolution for the paper texture. Higher quality uses more texture samples for finer grain detail."
        value={paperQuality}
        options={QUALITY_OPTIONS}
        onChange={(value) => setPaperQuality(value as PaperQuality)}
      />

      {/* --- Colors Section --- */}
      <SectionHeader title="Colors" />

      <ColorPicker
        label="Front Color"
        tooltip="Primary paper color for the lighter, front-facing grain."
        value={paperColorFront}
        onChange={setPaperColorFront}
        disableAlpha
      />

      <ColorPicker
        label="Back Color"
        tooltip="Secondary paper color for the darker, back-facing grain texture."
        value={paperColorBack}
        onChange={setPaperColorBack}
        disableAlpha
      />

      {/* --- Fiber Section --- */}
      <SectionHeader title="Fiber" />

      <Slider
        label="Fiber Amount"
        tooltip="Visibility of individual fiber strands in the paper texture."
        min={0}
        max={1}
        step={0.01}
        value={paperFiber}
        onChange={setPaperFiber}
        showValue
      />

      <Slider
        label="Size"
        tooltip="Scale of the fiber pattern. Larger values produce thicker, more visible fiber strands."
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
          tooltip="Amount of crumple/wrinkle noise added to the paper surface."
          min={0}
          max={1}
          step={0.01}
          value={paperCrumples}
          onChange={setPaperCrumples}
          showValue
        />

        <Slider
          label="Crumple Size"
          tooltip="Scale of the crumple wrinkles. Larger values produce broader, gentler wrinkles."
          min={0.1}
          max={2}
          step={0.1}
          value={paperCrumpleSize}
          onChange={setPaperCrumpleSize}
          showValue
        />

        <Slider
          label="Folds"
          tooltip="Intensity of sharp fold/crease lines across the paper."
          min={0}
          max={1}
          step={0.01}
          value={paperFolds}
          onChange={setPaperFolds}
          showValue
        />

        <Slider
          label="Fold Count"
          tooltip="Number of fold lines. More folds simulate a paper that has been folded many times."
          min={1}
          max={15}
          step={1}
          value={paperFoldCount}
          onChange={setPaperFoldCount}
          showValue
        />

        <Slider
          label="Drops"
          tooltip="Amount of water drop stain marks on the paper surface."
          min={0}
          max={1}
          step={0.01}
          value={paperDrops}
          onChange={setPaperDrops}
          showValue
        />

        <Slider
          label="Fade"
          tooltip="Edge-to-center fade effect simulating aged, yellowed paper edges."
          min={0}
          max={1}
          step={0.01}
          value={paperFade}
          onChange={setPaperFade}
          showValue
        />

        <Slider
          label="Seed"
          tooltip="Random seed for the procedural paper pattern. Different seeds generate different fiber and crumple layouts."
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
