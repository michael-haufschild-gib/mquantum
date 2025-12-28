/**
 * Aurora-specific skybox controls
 */
import { Slider } from '@/components/ui/Slider'
import { SkyboxProceduralSettings } from '@/stores/defaults/visualDefaults'
import React from 'react'

interface AuroraControlsProps {
  proceduralSettings: SkyboxProceduralSettings
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) => void
}

export const AuroraControls: React.FC<AuroraControlsProps> = ({
  proceduralSettings,
  setProceduralSettings,
}) => {
  return (
    <div className="space-y-4 border-l-2 border-success-border pl-4">
      <span className="text-xs font-bold text-success uppercase tracking-wider block mb-2">
        Aurora
      </span>

      <Slider
        label="Curtain Height"
        value={proceduralSettings.aurora?.curtainHeight ?? 0.5}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) =>
          setProceduralSettings({
            aurora: { ...proceduralSettings.aurora, curtainHeight: v },
          })
        }
      />

      <Slider
        label="Wave Frequency"
        value={proceduralSettings.aurora?.waveFrequency ?? 1.0}
        min={0.3}
        max={3}
        step={0.05}
        onChange={(v) =>
          setProceduralSettings({
            aurora: { ...proceduralSettings.aurora, waveFrequency: v },
          })
        }
      />
    </div>
  )
}
