import { ColorPicker } from '@/components/ui/ColorPicker'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'


export const SharedAdvancedControls: React.FC = React.memo(() => {
  const dimension = useGeometryStore((state) => state.dimension)
  const isoEnabled = useExtendedObjectStore(
    (state: ExtendedObjectState) => state.schroedinger?.isoEnabled ?? false
  )
  const representation = useExtendedObjectStore(
    (state: ExtendedObjectState) => state.schroedinger?.representation ?? 'position'
  )
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
      {!isoEnabled && dimension > 2 && representation !== 'wigner' && (
      <ControlGroup
        title="Subsurface Scattering"
        collapsible
        defaultOpen={false}
        rightElement={
          <Switch
            checked={sssEnabled}
            onCheckedChange={setSssEnabled}
            data-testid="global-sss-toggle"
          />
        }
      >
        <Slider
          label="Intensity"
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
            disableAlpha={true}
            className="w-24"
          />
        </div>
        <Slider
          label="Thickness"
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
