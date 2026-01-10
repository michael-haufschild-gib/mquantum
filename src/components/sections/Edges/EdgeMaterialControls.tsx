/**
 * Edge Material Controls Component
 *
 * Controls for PBR material properties for tube edges.
 * Includes metallic, roughness, and edge-specific specular settings.
 * Only visible when edge thickness > 1 (tube rendering mode).
 */

import { Button } from '@/components/ui/Button'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { DEFAULT_EDGE_PBR } from '@/stores/defaults/visualDefaults'
import { useLightingStore } from '@/stores/lightingStore'
import { usePBRStore, type PBRSlice } from '@/stores/pbrStore'
import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface EdgeMaterialControlsProps {
  className?: string
}

export const EdgeMaterialControls: React.FC<EdgeMaterialControlsProps> = React.memo(
  ({ className = '' }) => {
    const edgeThickness = useAppearanceStore((state) => state.edgeThickness)
    const lightEnabled = useLightingStore((state) => state.lightEnabled)

    // PBR settings for edges (from dedicated PBR store)
    const pbrSelector = useShallow((state: PBRSlice) => ({
      metallic: state.edge.metallic,
      roughness: state.edge.roughness,
      specularIntensity: state.edge.specularIntensity,
      specularColor: state.edge.specularColor,
      setMetallic: state.setEdgeMetallic,
      setRoughness: state.setEdgeRoughness,
      setSpecularIntensity: state.setEdgeSpecularIntensity,
      setSpecularColor: state.setEdgeSpecularColor,
    }))
    const {
      metallic,
      roughness,
      specularIntensity,
      specularColor,
      setMetallic,
      setRoughness,
      setSpecularIntensity,
      setSpecularColor,
    } = usePBRStore(pbrSelector)

    const showMaterialControls = edgeThickness > 1 && lightEnabled

    const handleResetSpecularColor = useCallback(() => {
      setSpecularColor(DEFAULT_EDGE_PBR.specularColor);
    }, [setSpecularColor]);

    if (!showMaterialControls) return null

    return (
      <ControlGroup title="Material" className={className} collapsible defaultOpen={false}>
        {/* Metallic */}
        <Slider
          label="Metallic"
          min={0}
          max={1}
          step={0.01}
          value={metallic}
          onChange={setMetallic}
          showValue
        />

        {/* Roughness */}
        <Slider
          label="Roughness"
          min={0.04}
          max={1}
          step={0.01}
          value={roughness}
          onChange={setRoughness}
          showValue
        />

         {/* Specular Intensity */}
        <Slider
          label="Specular Intensity"
          min={0}
          max={2}
          step={0.1}
          value={specularIntensity}
          onChange={setSpecularIntensity}
          showValue
        />

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
              onClick={handleResetSpecularColor}
              ariaLabel="Reset to default"
            >
              Reset
            </Button>
          )}
        </div>


      </ControlGroup>
    )
  }
);

EdgeMaterialControls.displayName = 'EdgeMaterialControls';
