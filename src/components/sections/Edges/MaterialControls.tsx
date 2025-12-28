/**
 * Material Controls Component
 *
 * Controls for specular lighting properties for edges.
 * Only visible when using Surface shader with light enabled.
 *
 * Note: In proper PBR, specularIntensity is an artist override that breaks
 * energy conservation. Specular contribution is derived from F0/Fresnel.
 * We keep it for artistic control.
 */

import { Button } from '@/components/ui/Button'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Slider } from '@/components/ui/Slider'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { DEFAULT_EDGE_PBR } from '@/stores/defaults/visualDefaults'
import { useLightingStore } from '@/stores/lightingStore'
import { usePBRStore, type PBRSlice } from '@/stores/pbrStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface MaterialControlsProps {
  className?: string
}

export const MaterialControls: React.FC<MaterialControlsProps> = React.memo(
  ({ className = '' }) => {
    const shaderType = useAppearanceStore((state) => state.shaderType)
    const lightEnabled = useLightingStore((state) => state.lightEnabled)

    // PBR settings for edges (from dedicated PBR store)
    const pbrSelector = useShallow((state: PBRSlice) => ({
      specularIntensity: state.edge.specularIntensity,
      specularColor: state.edge.specularColor,
      setSpecularIntensity: state.setEdgeSpecularIntensity,
      setSpecularColor: state.setEdgeSpecularColor,
    }))
    const { specularIntensity, specularColor, setSpecularIntensity, setSpecularColor } =
      usePBRStore(pbrSelector)

    // Only show for Surface shader with light enabled
    if (shaderType !== 'surface' || !lightEnabled) {
      return null
    }

    return (
      <div className={`space-y-3 ${className}`}>
        {/* Specular Color */}
        <div className="flex items-center justify-between">
          <ColorPicker
            label="Specular Color"
            value={specularColor}
            onChange={setSpecularColor}
            disableAlpha={true}
          />
          {specularColor !== DEFAULT_EDGE_PBR.specularColor && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSpecularColor(DEFAULT_EDGE_PBR.specularColor)}
              ariaLabel="Reset to default"
            >
              Reset
            </Button>
          )}
        </div>

        {/* Specular Intensity (artist override) */}
        <Slider
          label="Specular Intensity"
          min={0}
          max={2}
          step={0.1}
          value={specularIntensity}
          onChange={setSpecularIntensity}
          showValue
        />
      </div>
    )
  }
)
