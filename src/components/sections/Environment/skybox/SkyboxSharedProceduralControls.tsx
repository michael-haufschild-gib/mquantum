/**
 * Shared controls for all procedural skybox modes
 * Includes: Structure, Appearance, and Delight Features
 */
import { Slider } from '@/components/ui/Slider'
import { SkyboxProceduralSettings } from '@/stores/defaults/visualDefaults'
import React, { useCallback } from 'react'

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
          <div className="space-y-4 border-l-2 border-accent-primary/20 pl-4">
            <span className="text-xs font-bold text-accent-primary uppercase tracking-wider block mb-2">
              Structure
            </span>
            <Slider
              label="Scale"
              value={proceduralSettings.scale}
              min={0.1}
              max={3.0}
              step={0.1}
              onChange={handleScaleChange}
            />
            {!hideComplexity && (
              <Slider
                label="Complexity"
                value={proceduralSettings.complexity}
                min={0}
                max={1}
                step={0.01}
                onChange={handleComplexityChange}
              />
            )}
            <Slider
              label="Evolution (Seed)"
              value={proceduralSettings.evolution}
              min={0}
              max={10}
              step={0.01}
              onChange={handleEvolutionChange}
            />
          </div>

          {/* Appearance Settings */}
          <div className="space-y-4 border-l-2 border-text-secondary/20 pl-4">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider block mb-2">
              Appearance
            </span>
            <Slider
              label="Brightness"
              value={skyboxIntensity}
              min={0}
              max={3}
              step={0.1}
              onChange={setSkyboxIntensity}
            />

            <Slider
              label="Time Flow"
              value={proceduralSettings.timeScale}
              min={0}
              max={2.0}
              step={0.01}
              onChange={handleTimeScaleChange}
            />
          </div>

          {/* Delight Features */}
          <div className="space-y-4 border-l-2 border-text-secondary/20 pl-4">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider block mb-2">
              Features
            </span>

            <Slider
              label="Turbulence"
              value={proceduralSettings.turbulence}
              min={0}
              max={1}
              step={0.01}
              onChange={handleTurbulenceChange}
            />

            <Slider
              label="Sun Intensity"
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
