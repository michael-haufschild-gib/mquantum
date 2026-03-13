/**
 * Shared controls for all classic (texture-based) skybox modes
 * Includes: Quality, Animation, Color
 */
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { SkyboxAnimationMode, SkyboxProceduralSettings } from '@/stores/defaults/visualDefaults'
import React from 'react'

const ANIMATION_MODES: { value: SkyboxAnimationMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'cinematic', label: 'Cinematic (Smooth Orbit)' },
  { value: 'heatwave', label: 'Heatwave (Distortion)' },
  { value: 'tumble', label: 'Tumble (Chaos)' },
  { value: 'ethereal', label: 'Ethereal (Magical)' },
  { value: 'nebula', label: 'Nebula (Color Shift)' },
]

interface SkyboxSharedClassicControlsProps {
  skyboxIntensity: number
  skyboxAnimationMode: SkyboxAnimationMode
  skyboxAnimationSpeed: number
  skyboxHighQuality: boolean
  proceduralSettings: SkyboxProceduralSettings
  setSkyboxIntensity: (value: number) => void
  setSkyboxAnimationMode: (value: SkyboxAnimationMode) => void
  setSkyboxAnimationSpeed: (value: number) => void
  setSkyboxHighQuality: (value: boolean) => void
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) => void
}

export const SkyboxSharedClassicControls: React.FC<SkyboxSharedClassicControlsProps> = ({
  skyboxIntensity,
  skyboxAnimationMode,
  skyboxAnimationSpeed,
  skyboxHighQuality,
  proceduralSettings,
  setSkyboxIntensity,
  setSkyboxAnimationMode,
  setSkyboxAnimationSpeed,
  setSkyboxHighQuality,
  setProceduralSettings,
}) => {
  return (
    <>
      <Switch
        data-testid="skybox-hq-toggle"
        checked={skyboxHighQuality}
        onCheckedChange={setSkyboxHighQuality}
        label="High Quality (Mipmaps)"
      />

      <Select
        label="Animation"
        options={ANIMATION_MODES}
        value={skyboxAnimationMode}
        onChange={setSkyboxAnimationMode}
      />

      {skyboxAnimationMode !== 'none' && (
        <Slider
          label="Animation Speed"
          value={skyboxAnimationSpeed}
          min={0.001}
          max={0.1}
          step={0.001}
          onChange={setSkyboxAnimationSpeed}
        />
      )}

      {/* Color Adjustments */}
      <div className="space-y-4 border-l-2 border-text-secondary/20 pl-4 mt-4">
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider block mb-2">
          Color
        </span>
        <Slider
          label="Brightness"
          value={skyboxIntensity}
          min={0}
          max={2}
          step={0.05}
          onChange={setSkyboxIntensity}
        />
        <Slider
          label="Hue Shift"
          value={proceduralSettings.hue ?? 0}
          min={-0.5}
          max={0.5}
          step={0.01}
          onChange={(v) => setProceduralSettings({ hue: v })}
        />
        <Slider
          label="Saturation"
          value={proceduralSettings.saturation ?? 1}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => setProceduralSettings({ saturation: v })}
        />
      </div>
    </>
  )
}
