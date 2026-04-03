/**
 * Aurora-specific skybox controls
 */
import React from 'react'

import { Slider } from '@/components/ui/Slider'
import { SkyboxProceduralSettings } from '@/stores/defaults/visualDefaults'

interface AuroraControlsProps {
  proceduralSettings: SkyboxProceduralSettings
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) => void
}

export const AuroraControls: React.FC<AuroraControlsProps> = ({
  proceduralSettings,
  setProceduralSettings,
}) => {
  return (
    <div className="space-y-4 border-s-2 border-success-border ps-4">
      <span className="text-xs font-bold text-success uppercase tracking-wider block mb-2">
        Aurora
      </span>

      <Slider
        label="Curtain Height"
        tooltip="Vertical extent of the aurora curtains. Higher values stretch the lights further across the sky."
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
        tooltip="Frequency of the undulating wave motion in the aurora curtains. Higher values create more rapid rippling."
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
