/**
 * Visual Controls Component
 * Controls for customizing the visual appearance of polytopes edges and raymarching rim lighting (which appears as pseudo-edges).
 */

import { ColorPicker } from '@/components/ui/ColorPicker'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { EdgeMaterialControls } from './EdgeMaterialControls'

export interface EdgesControlsProps {
  className?: string
}

export const EdgeControls: React.FC<EdgesControlsProps> = React.memo(({ className = '' }) => {
  // Consolidate visual store selectors with useShallow to reduce subscriptions
  const appearanceSelector = useShallow((state: AppearanceSlice) => ({
    edgeColor: state.edgeColor,
    edgeThickness: state.edgeThickness,
    tubeCaps: state.tubeCaps,
    setEdgeColor: state.setEdgeColor,
    setEdgeThickness: state.setEdgeThickness,
    setTubeCaps: state.setTubeCaps,
    fresnelEnabled: state.shaderSettings.surface.fresnelEnabled,
    setSurfaceSettings: state.setSurfaceSettings,
    fresnelIntensity: state.fresnelIntensity,
    setFresnelIntensity: state.setFresnelIntensity,
  }))
  const {
    edgeColor,
    edgeThickness,
    tubeCaps,
    setEdgeColor,
    setEdgeThickness,
    setTubeCaps,
    fresnelEnabled,
    setSurfaceSettings,
    fresnelIntensity,
    setFresnelIntensity,
  } = useAppearanceStore(appearanceSelector)

  const handleFresnelToggle = useCallback(
    (checked: boolean) => {
      setSurfaceSettings({ fresnelEnabled: checked })
    },
    [setSurfaceSettings]
  )

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Edge Color */}
      <ColorPicker label="Color" value={edgeColor} onChange={setEdgeColor} disableAlpha={true} />

      {/* Edge Thickness */}
      <Slider
        label="Thickness"
        min={0}
        max={5}
        step={0.1}
        value={edgeThickness}
        onChange={setEdgeThickness}
        showValue
      />

      {/* Tube End Caps - only visible when using tube rendering (thickness > 1) */}
      {edgeThickness > 1 && (
        <Switch
          checked={tubeCaps}
          onCheckedChange={setTubeCaps}
          label="Tube End Caps"
          data-testid="tube-caps-toggle"
        />
      )}

      {/* Edge Material Controls (only visible when thickness > 1) */}
      <EdgeMaterialControls />

      {/* Fresnel Rim */}
      <ControlGroup
        title="Fresnel Rim"
        collapsible
        defaultOpen={false}
        rightElement={
          <Switch
            checked={fresnelEnabled}
            onCheckedChange={handleFresnelToggle}
            data-testid="fresnel-toggle"
          />
        }
      >
        <Slider
          label="Intensity"
          min={0.0}
          max={1.0}
          step={0.1}
          value={fresnelIntensity}
          onChange={setFresnelIntensity}
          showValue
          data-testid="fresnel-intensity"
        />
      </ControlGroup>
    </div>
  )
})

EdgeControls.displayName = 'EdgeControls'
