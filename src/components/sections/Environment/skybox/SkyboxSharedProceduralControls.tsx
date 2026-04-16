/**
 * Shared controls for all procedural skybox modes
 * Includes: Structure, Appearance, and Delight Features
 */
import React, { useCallback } from 'react'

import { Slider } from '@/components/ui/Slider'
import { SkyboxProceduralSettings } from '@/stores/defaults/visualDefaults'

interface SkyboxSharedProceduralControlsProps {
  proceduralSettings: SkyboxProceduralSettings
  skyboxIntensity: number
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) => void
  setSkyboxIntensity: (value: number) => void
  /** Hide complexity slider for modes that don't use it (aurora, crystalline, twilight) */
  hideComplexity?: boolean
}

export const SkyboxSharedProceduralControls: React.FC<SkyboxSharedProceduralControlsProps> =
  React.memo(
    ({
      proceduralSettings,
      skyboxIntensity,
      setProceduralSettings,
      setSkyboxIntensity,
      hideComplexity = false,
    }) => {
      const handleScaleChange = useCallback(
        (v: number) => setProceduralSettings({ scale: v }),
        [setProceduralSettings]
      )
      const handleComplexityChange = useCallback(
        (v: number) => setProceduralSettings({ complexity: v }),
        [setProceduralSettings]
      )
      const handleEvolutionChange = useCallback(
        (v: number) => setProceduralSettings({ evolution: v }),
        [setProceduralSettings]
      )
      const handleTimeScaleChange = useCallback(
        (v: number) => setProceduralSettings({ timeScale: v }),
        [setProceduralSettings]
      )
      const handleTurbulenceChange = useCallback(
        (v: number) => setProceduralSettings({ turbulence: v }),
        [setProceduralSettings]
      )
      const handleSunIntensityChange = useCallback(
        (v: number) => setProceduralSettings({ sunIntensity: v }),
        [setProceduralSettings]
      )

      return (
        <div className="space-y-6">
          {/* Structure Settings */}
          <div className="space-y-4 border-s-2 border-accent/20 ps-4">
            <span className="text-xs font-bold text-accent uppercase tracking-wider block mb-2">
              Structure
            </span>
            <Slider
              label="Scale"
              tooltip="Overall size of the procedural pattern. Smaller values create finer detail; larger values produce broader features."
              value={proceduralSettings.scale}
              min={0.1}
              max={3.0}
              step={0.1}
              onChange={handleScaleChange}
            />
            {!hideComplexity && (
              <Slider
                label="Complexity"
                tooltip="Number of noise octaves blended together. Higher values add finer detail layers."
                value={proceduralSettings.complexity}
                min={0}
                max={1}
                step={0.01}
                onChange={handleComplexityChange}
              />
            )}
            <Slider
              label="Evolution (Seed)"
              tooltip="Morphs the noise pattern into a different configuration. Animate this for continuously evolving backgrounds."
              value={proceduralSettings.evolution}
              min={0}
              max={10}
              step={0.01}
              onChange={handleEvolutionChange}
            />
          </div>

          {/* Appearance Settings */}
          <div className="space-y-4 border-s-2 border-text-secondary/20 ps-4">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider block mb-2">
              Appearance
            </span>
            <Slider
              label="Brightness"
              tooltip="Overall brightness multiplier for the skybox. Zero produces a black background."
              value={skyboxIntensity}
              min={0}
              max={3}
              step={0.1}
              onChange={setSkyboxIntensity}
            />

            <Slider
              label="Time Flow"
              tooltip="Speed of the skybox animation. Zero freezes motion; higher values accelerate the pattern evolution."
              value={proceduralSettings.timeScale}
              min={0}
              max={2.0}
              step={0.01}
              onChange={handleTimeScaleChange}
            />
          </div>

          {/* Delight Features */}
          <div className="space-y-4 border-s-2 border-text-secondary/20 ps-4">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider block mb-2">
              Features
            </span>

            <Slider
              label="Turbulence"
              tooltip="Amount of chaotic distortion applied to the pattern. Creates swirling, organic motion."
              value={proceduralSettings.turbulence}
              min={0}
              max={1}
              step={0.01}
              onChange={handleTurbulenceChange}
            />

            <Slider
              label="Sun Intensity"
              tooltip="Brightness of the simulated sun/star point light in the skybox."
              value={proceduralSettings.sunIntensity}
              min={0}
              max={2}
              step={0.01}
              onChange={handleSunIntensityChange}
            />
          </div>
        </div>
      )
    }
  )

SkyboxSharedProceduralControls.displayName = 'SkyboxSharedProceduralControls'
