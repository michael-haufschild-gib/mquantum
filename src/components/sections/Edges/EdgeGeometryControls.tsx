import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { EdgeMaterialControls } from './EdgeMaterialControls'

export interface EdgeGeometryControlsProps {
  className?: string
}

export const EdgeGeometryControls: React.FC<EdgeGeometryControlsProps> = React.memo(
  ({ className = '' }) => {
    const appearanceSelector = useShallow((state: AppearanceSlice) => ({
      edgeThickness: state.edgeThickness,
      tubeCaps: state.tubeCaps,
      setEdgeThickness: state.setEdgeThickness,
      setTubeCaps: state.setTubeCaps,
    }))
    const { edgeThickness, tubeCaps, setEdgeThickness, setTubeCaps } =
      useAppearanceStore(appearanceSelector)

    return (
      <div className={`space-y-4 ${className}`}>
        <Slider
          label="Thickness"
          min={0}
          max={5}
          step={0.1}
          value={edgeThickness}
          onChange={setEdgeThickness}
          showValue
        />

        {edgeThickness > 1 && (
          <Switch
            checked={tubeCaps}
            onCheckedChange={setTubeCaps}
            label="Tube End Caps"
            data-testid="tube-caps-toggle"
          />
        )}

        <EdgeMaterialControls />
      </div>
    )
  }
)

EdgeGeometryControls.displayName = 'EdgeGeometryControls'
