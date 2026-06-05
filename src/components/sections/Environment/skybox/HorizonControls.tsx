/**
 * Horizon-specific skybox controls
 */
import React from 'react'

import { Slider } from '@/components/ui/Slider'
import type { SkyboxProceduralSettings } from '@/stores/defaults/visualDefaults'

interface HorizonControlsProps {
  proceduralSettings: SkyboxProceduralSettings
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) => void
}

export const HorizonControls: React.FC<HorizonControlsProps> = ({
  proceduralSettings,
  setProceduralSettings,
}) => {
  return (
    <div className="space-y-4 border-s-2 border-panel-border ps-4">
      <span className="text-2xs font-bold text-text-secondary uppercase tracking-wider block mb-2">
        Horizon
      </span>

      <Slider
        data-testid="components-sections-environment-skybox-horizon-controls-slider-24-7"
        label="Gradient Contrast"
        tooltip="Sharpness of the horizon gradient transition. Higher values create a more dramatic dark-to-light boundary."
        value={proceduralSettings.horizonGradient?.gradientContrast ?? 0.5}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) =>
          setProceduralSettings({
            horizonGradient: { ...proceduralSettings.horizonGradient, gradientContrast: v },
          })
        }
      />

      <Slider
        data-testid="components-sections-environment-skybox-horizon-controls-slider-38-7"
        label="Spotlight Focus"
        tooltip="Concentration of the directional spotlight. Higher values create a tighter, more focused hot spot."
        value={proceduralSettings.horizonGradient?.spotlightFocus ?? 0.5}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) =>
          setProceduralSettings({
            horizonGradient: { ...proceduralSettings.horizonGradient, spotlightFocus: v },
          })
        }
      />
    </div>
  )
}
