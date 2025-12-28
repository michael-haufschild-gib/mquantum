/**
 * Horizon-specific skybox controls
 */
import { Slider } from '@/components/ui/Slider'
import { SkyboxProceduralSettings } from '@/stores/defaults/visualDefaults'
import React from 'react'

interface HorizonControlsProps {
  proceduralSettings: SkyboxProceduralSettings
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) => void
}

export const HorizonControls: React.FC<HorizonControlsProps> = ({
  proceduralSettings,
  setProceduralSettings,
}) => {
  return (
    <div className="space-y-4 border-l-2 border-panel-border pl-4">
      <span className="text-xs font-bold text-text-secondary uppercase tracking-wider block mb-2">
        Horizon
      </span>

      <Slider
        label="Gradient Contrast"
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
        label="Spotlight Focus"
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
