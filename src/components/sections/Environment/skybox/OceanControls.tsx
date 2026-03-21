/**
 * Ocean-specific skybox controls
 *
 * Exposes settings for the deep ocean procedural skybox mode:
 * - Caustic Intensity: Strength of caustic light patterns
 * - Depth Gradient: How pronounced the depth color falloff is
 * - Bubble Density: Amount of rising particle/bubble effects
 * - Surface Shimmer: Intensity of surface light shimmer effect
 */
import React from 'react'

import { Slider } from '@/components/ui/Slider'
import { SkyboxProceduralSettings } from '@/stores/defaults/visualDefaults'

interface OceanControlsProps {
  proceduralSettings: SkyboxProceduralSettings
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) => void
}

export const OceanControls: React.FC<OceanControlsProps> = ({
  proceduralSettings,
  setProceduralSettings,
}) => {
  return (
    <div className="space-y-4 border-l-2 border-cyan-500/30 pl-4">
      <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block mb-2">
        Ocean Depth
      </span>

      <Slider
        label="Caustic Intensity"
        tooltip="Strength of underwater light caustic patterns projected on surfaces."
        value={proceduralSettings.ocean?.causticIntensity ?? 0.5}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) =>
          setProceduralSettings({
            ocean: { ...proceduralSettings.ocean, causticIntensity: v },
          })
        }
      />

      <Slider
        label="Depth Gradient"
        tooltip="How pronounced the color darkening is with depth. Higher values create a stronger deep-ocean atmosphere."
        value={proceduralSettings.ocean?.depthGradient ?? 0.5}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) =>
          setProceduralSettings({
            ocean: { ...proceduralSettings.ocean, depthGradient: v },
          })
        }
      />

      <Slider
        label="Bubble Density"
        tooltip="Amount of rising bubble/particle effects in the underwater scene."
        value={proceduralSettings.ocean?.bubbleDensity ?? 0.3}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) =>
          setProceduralSettings({
            ocean: { ...proceduralSettings.ocean, bubbleDensity: v },
          })
        }
      />

      <Slider
        label="Surface Shimmer"
        tooltip="Intensity of the shimmering light effect near the water surface."
        value={proceduralSettings.ocean?.surfaceShimmer ?? 0.4}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) =>
          setProceduralSettings({
            ocean: { ...proceduralSettings.ocean, surfaceShimmer: v },
          })
        }
      />
    </div>
  )
}
