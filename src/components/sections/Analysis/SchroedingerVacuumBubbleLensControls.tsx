import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { DEFAULT_SCHROEDINGER_CONFIG, type SchroedingerConfig } from '@/lib/geometry/extended/types'
import { type ExtendedObjectState, useExtendedObjectStore } from '@/stores/extendedObjectStore'

interface SchroedingerVacuumBubbleLensControlsProps {
  config: SchroedingerConfig
}

/**
 * Controls for the Coleman-De Luccia false-vacuum bubble lens.
 *
 * @param props - Current Schroedinger config plus setter callbacks
 * @returns React controls for enabling and tuning the bubble wall lens
 */
export const SchroedingerVacuumBubbleLensControls: React.FC<SchroedingerVacuumBubbleLensControlsProps> =
  React.memo(({ config }) => {
    const setterSelector = useShallow((state: ExtendedObjectState) => ({
      setEnabled: state.setSchroedingerVacuumBubbleLensEnabled,
      setStrength: state.setSchroedingerVacuumBubbleLensStrength,
      setWallRadius: state.setSchroedingerVacuumBubbleWallRadius,
      setWallThickness: state.setSchroedingerVacuumBubbleWallThickness,
      setTension: state.setSchroedingerVacuumBubbleTension,
      setBias: state.setSchroedingerVacuumBubbleBias,
    }))
    const { setEnabled, setStrength, setWallRadius, setWallThickness, setTension, setBias } =
      useExtendedObjectStore(setterSelector)

    return (
      <div className="space-y-1 mt-2">
        <Switch
          label="Vacuum Bubble Lens"
          tooltip="Refract raymarch samples through a Coleman-De Luccia false-vacuum bubble wall, thinning the true-vacuum interior and brightening the tunneling wall."
          checked={config.vacuumBubbleLensEnabled ?? false}
          onCheckedChange={setEnabled}
          data-testid="schroedinger-vacuum-bubble-lens-toggle"
        />
        {config.vacuumBubbleLensEnabled && (
          <div className="ps-2 border-s border-border-default space-y-2">
            <Slider
              label="Strength"
              tooltip="How strongly the bubble wall refracts coordinates, thins the true-vacuum interior, and boosts wall emission."
              min={0}
              max={2}
              step={0.05}
              value={
                config.vacuumBubbleLensStrength ??
                DEFAULT_SCHROEDINGER_CONFIG.vacuumBubbleLensStrength
              }
              onChange={setStrength}
              showValue
              data-testid="schroedinger-vacuum-bubble-lens-strength"
            />
            <Slider
              label="Wall Radius"
              tooltip="Bubble wall radius as a fraction of the rendered bounding radius."
              min={0.05}
              max={1.5}
              step={0.05}
              value={
                config.vacuumBubbleWallRadius ?? DEFAULT_SCHROEDINGER_CONFIG.vacuumBubbleWallRadius
              }
              onChange={setWallRadius}
              showValue
              data-testid="schroedinger-vacuum-bubble-wall-radius"
            />
            <Slider
              label="Wall Thickness"
              tooltip="Thickness of the tunneling wall as a fraction of the rendered bounding radius."
              min={0.02}
              max={0.5}
              step={0.01}
              value={
                config.vacuumBubbleWallThickness ??
                DEFAULT_SCHROEDINGER_CONFIG.vacuumBubbleWallThickness
              }
              onChange={setWallThickness}
              showValue
              data-testid="schroedinger-vacuum-bubble-wall-thickness"
            />
            <Slider
              label="Tension"
              tooltip="Surface-action term that suppresses tunneling and weakens the visible wall lens."
              min={0}
              max={3}
              step={0.05}
              value={config.vacuumBubbleTension ?? DEFAULT_SCHROEDINGER_CONFIG.vacuumBubbleTension}
              onChange={setTension}
              showValue
              data-testid="schroedinger-vacuum-bubble-tension"
            />
            <Slider
              label="Bias"
              tooltip="True-vacuum volume bias that lowers the action proxy and strengthens tunneling."
              min={0}
              max={3}
              step={0.05}
              value={config.vacuumBubbleBias ?? DEFAULT_SCHROEDINGER_CONFIG.vacuumBubbleBias}
              onChange={setBias}
              showValue
              data-testid="schroedinger-vacuum-bubble-bias"
            />
          </div>
        )}
      </div>
    )
  })

SchroedingerVacuumBubbleLensControls.displayName = 'SchroedingerVacuumBubbleLensControls'
