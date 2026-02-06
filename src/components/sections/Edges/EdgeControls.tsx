import { ColorPicker } from '@/components/ui/ColorPicker'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface EdgesControlsProps {
  className?: string
}

export const EdgeControls: React.FC<EdgesControlsProps> = React.memo(({ className = '' }) => {
  const appearanceSelector = useShallow((state: AppearanceSlice) => ({
    edgeColor: state.edgeColor,
    setEdgeColor: state.setEdgeColor,
    fresnelEnabled: state.fresnelEnabled,
    setFresnelEnabled: state.setFresnelEnabled,
    fresnelIntensity: state.fresnelIntensity,
    setFresnelIntensity: state.setFresnelIntensity,
  }))
  const {
    edgeColor,
    setEdgeColor,
    fresnelEnabled,
    setFresnelEnabled,
    fresnelIntensity,
    setFresnelIntensity,
  } = useAppearanceStore(appearanceSelector)

  const handleFresnelToggle = useCallback(
    (checked: boolean) => {
      setFresnelEnabled(checked)
    },
    [setFresnelEnabled]
  )

  return (
    <div className={`space-y-4 ${className}`}>
      <Switch
        checked={fresnelEnabled}
        onCheckedChange={handleFresnelToggle}
        label="Enabled"
        data-testid="fresnel-toggle"
      />
      <ColorPicker label="Rim Color" value={edgeColor} onChange={setEdgeColor} disableAlpha={true} />
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
    </div>
  )
})

EdgeControls.displayName = 'EdgeControls'
