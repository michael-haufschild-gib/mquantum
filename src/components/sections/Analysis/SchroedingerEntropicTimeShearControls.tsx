import React from 'react'

import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { DEFAULT_SCHROEDINGER_CONFIG, type SchroedingerConfig } from '@/lib/geometry/extended/types'

interface SchroedingerEntropicTimeShearControlsProps {
  config: SchroedingerConfig
  setEnabled: (enabled: boolean) => void
  setStrength: (strength: number) => void
  setFilamentScale: (scale: number) => void
  setIrreversibility: (irreversibility: number) => void
}

export const SchroedingerEntropicTimeShearControls: React.FC<SchroedingerEntropicTimeShearControlsProps> =
  React.memo(({ config, setEnabled, setStrength, setFilamentScale, setIrreversibility }) => (
    <div className="space-y-1 mt-2">
      <Switch
        label="Entropic Time Shear"
        tooltip="Warp raymarch sampling into transverse entropy filaments driven by density windows, gradients, and phase handedness."
        checked={config.entropicTimeShearEnabled ?? false}
        onCheckedChange={setEnabled}
        data-testid="schroedinger-entropic-time-shear-toggle"
      />
      {config.entropicTimeShearEnabled && (
        <div className="ps-2 border-s border-border-default space-y-2">
          <Slider
            label="Strength"
            tooltip="How strongly entropy production bends sample coordinates across the ray."
            min={0}
            max={2}
            step={0.05}
            value={
              config.entropicTimeShearStrength ??
              DEFAULT_SCHROEDINGER_CONFIG.entropicTimeShearStrength
            }
            onChange={setStrength}
            showValue
            data-testid="schroedinger-entropic-time-shear-strength"
          />
          <Slider
            label="Filament Scale"
            tooltip="Spatial coherence of the shear filament field. Lower values make finer strands; higher values make broader sheets."
            min={0.1}
            max={4}
            step={0.05}
            value={
              config.entropicTimeShearFilamentScale ??
              DEFAULT_SCHROEDINGER_CONFIG.entropicTimeShearFilamentScale
            }
            onChange={setFilamentScale}
            showValue
            data-testid="schroedinger-entropic-time-shear-filament-scale"
          />
          <Slider
            label="Irreversibility"
            tooltip="Bias from reversible signed shear toward non-negative entropy gain."
            min={0}
            max={1}
            step={0.05}
            value={
              config.entropicTimeShearIrreversibility ??
              DEFAULT_SCHROEDINGER_CONFIG.entropicTimeShearIrreversibility
            }
            onChange={setIrreversibility}
            showValue
            data-testid="schroedinger-entropic-time-shear-irreversibility"
          />
        </div>
      )}
    </div>
  ))

SchroedingerEntropicTimeShearControls.displayName = 'SchroedingerEntropicTimeShearControls'
