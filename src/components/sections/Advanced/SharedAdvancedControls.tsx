import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ColorPicker } from '@/components/ui/ColorPicker'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { type AppearanceSlice, useAppearanceStore } from '@/stores/appearanceStore'
import { type ExtendedObjectState, useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

export const SharedAdvancedControls: React.FC = React.memo(() => {
  const { dimension, objectType } = useGeometryStore(
    useShallow((state) => ({ dimension: state.dimension, objectType: state.objectType }))
  )
  const isoEnabled = useExtendedObjectStore(
    (state: ExtendedObjectState) => state.schroedinger?.isoEnabled ?? false
  )
  const representation = useExtendedObjectStore(
    (state: ExtendedObjectState) => state.schroedinger?.representation ?? 'position'
  )
  // Pauli spinor is always volumetric 3D — bypass schroedinger iso/representation checks
  const isPauli = objectType === 'pauliSpinor'
  const appearanceSelector = useShallow((state: AppearanceSlice) => ({
    sssEnabled: state.sssEnabled,
    setSssEnabled: state.setSssEnabled,
    sssIntensity: state.sssIntensity,
    setSssIntensity: state.setSssIntensity,
    sssColor: state.sssColor,
    setSssColor: state.setSssColor,
    sssThickness: state.sssThickness,
    setSssThickness: state.setSssThickness,
    sssJitter: state.sssJitter,
    setSssJitter: state.setSssJitter,
  }))
  const {
    sssEnabled,
    setSssEnabled,
    sssIntensity,
    setSssIntensity,
    sssColor,
    setSssColor,
    sssThickness,
    setSssThickness,
    sssJitter,
    setSssJitter,
  } = useAppearanceStore(appearanceSelector)

  const handleSssColorChange = useCallback(
    (c: string) => {
      setSssColor(c)
    },
    [setSssColor]
  )

  return (
    <div className="space-y-4 mb-4 pb-4">
      {/* Subsurface Scattering (volumetric only, 3D+) */}
      {(isPauli || (!isoEnabled && dimension > 2 && representation !== 'wigner')) && (
        <ControlGroup
          title="Subsurface Scattering"
          collapsible
          defaultOpen={false}
          data-testid="control-group-subsurface-scattering"
          rightElement={
            <Switch
              checked={sssEnabled}
              onCheckedChange={setSssEnabled}
              tooltip="Simulate translucent subsurface light scattering within the volume."
              data-testid="global-sss-toggle"
            />
          }
        >
          <Slider
            label="Intensity"
            tooltip="Strength of the subsurface scattering effect. Higher values simulate more translucent materials where light penetrates and scatters inside."
            min={0.0}
            max={2.0}
            step={0.1}
            value={sssIntensity}
            onChange={setSssIntensity}
            showValue
            data-testid="global-sss-intensity"
          />
          <div className="flex items-center justify-between">
            <label className="text-xs text-[var(--text-secondary)]">SSS Tint</label>
            <ColorPicker
              value={sssColor}
              onChange={handleSssColorChange}
              tooltip="Tint color for subsurface scattered light. Warm tones simulate organic materials; cool tones simulate crystalline media."
              disableAlpha={true}
              className="w-24"
            />
          </div>
          <Slider
            label="Thickness"
            tooltip="Penetration depth of the subsurface scatter. Larger values let light travel further into the volume before scattering back."
            min={0.1}
            max={5.0}
            step={0.1}
            value={sssThickness}
            onChange={setSssThickness}
            showValue
            data-testid="global-sss-thickness"
          />
          <Slider
            label="Sample Jitter"
            tooltip="Random offset applied to scatter sample positions. Reduces visible banding artifacts at the cost of slight noise."
            min={0.0}
            max={1.0}
            step={0.05}
            value={sssJitter}
            onChange={setSssJitter}
            showValue
            data-testid="global-sss-jitter"
          />
        </ControlGroup>
      )}
    </div>
  )
})

SharedAdvancedControls.displayName = 'SharedAdvancedControls'
