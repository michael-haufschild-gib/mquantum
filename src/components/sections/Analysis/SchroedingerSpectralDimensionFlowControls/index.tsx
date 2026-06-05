import React from 'react'

import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { DEFAULT_SCHROEDINGER_CONFIG, type SchroedingerConfig } from '@/lib/geometry/extended/types'

interface SchroedingerSpectralDimensionFlowControlsProps {
  config: SchroedingerConfig
  setEnabled: (enabled: boolean) => void
  setStrength: (strength: number) => void
  setUvDimension: (dimension: number) => void
  setDiffusionScale: (scale: number) => void
}

/**
 * Controls for the spectral-dimension flow lens.
 *
 * @param props - Current Schroedinger config plus setter callbacks
 * @returns React controls for enabling and tuning the lens
 */
export const SchroedingerSpectralDimensionFlowControls: React.FC<SchroedingerSpectralDimensionFlowControlsProps> =
  React.memo(({ config, setEnabled, setStrength, setUvDimension, setDiffusionScale }) => (
    <div className="space-y-1 mt-2">
      <Switch
        label="Spectral Dimension Flow"
        tooltip="Compress raymarch coordinates where the local heat-kernel proxy predicts ultraviolet spectral-dimension reduction."
        checked={config.spectralDimensionFlowEnabled ?? false}
        onCheckedChange={setEnabled}
        data-testid="schroedinger-spectral-dimension-flow-toggle"
      />
      {config.spectralDimensionFlowEnabled && (
        <div className="ps-2 border-s border-border-default space-y-2">
          <Slider
            label="Strength"
            tooltip="How strongly the spectral-dimension drop compresses sample coordinates and boosts caustic emission."
            min={0}
            max={2}
            step={0.05}
            value={
              config.spectralDimensionFlowStrength ??
              DEFAULT_SCHROEDINGER_CONFIG.spectralDimensionFlowStrength
            }
            onChange={setStrength}
            showValue
            data-testid="schroedinger-spectral-dimension-flow-strength"
          />
          <Slider
            label="UV Dimension"
            tooltip="Short-distance spectral dimension target reached in high-curvature, mid-density regions."
            min={1.2}
            max={3.5}
            step={0.05}
            value={
              config.spectralDimensionFlowUvDimension ??
              DEFAULT_SCHROEDINGER_CONFIG.spectralDimensionFlowUvDimension
            }
            onChange={setUvDimension}
            showValue
            data-testid="schroedinger-spectral-dimension-flow-uv-dimension"
          />
          <Slider
            label="Diffusion Scale"
            tooltip="Spatial scale used by the gradient-curvature heat-kernel proxy."
            min={0.05}
            max={3}
            step={0.05}
            value={
              config.spectralDimensionFlowDiffusionScale ??
              DEFAULT_SCHROEDINGER_CONFIG.spectralDimensionFlowDiffusionScale
            }
            onChange={setDiffusionScale}
            showValue
            data-testid="schroedinger-spectral-dimension-flow-diffusion-scale"
          />
        </div>
      )}
    </div>
  ))

SchroedingerSpectralDimensionFlowControls.displayName = 'SchroedingerSpectralDimensionFlowControls'
