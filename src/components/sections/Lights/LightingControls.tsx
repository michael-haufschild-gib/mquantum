/**
 * Lighting Controls Component
 *
 * Controls for configuring the multi-light system:
 * - Show/hide light gizmos toggle
 * - Light list (add, remove, select) - includes ambient light at top
 * - Light editor (selected light properties)
 */

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Switch } from '@/components/ui/Switch'
import { useLightingStore, type LightingSlice } from '@/stores/lightingStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { LightEditor } from './LightEditor'
import { LightList } from './LightList'

export interface LightingControlsProps {
  className?: string
}

export const LightingControls: React.FC<LightingControlsProps> = React.memo(
  ({ className = '' }) => {
    const { selectedLightId, showLightGizmos, setShowLightGizmos } = useLightingStore(
      useShallow((state: LightingSlice) => ({
        selectedLightId: state.selectedLightId,
        showLightGizmos: state.showLightGizmos,
        setShowLightGizmos: state.setShowLightGizmos,
      }))
    )

    const hasSelectedLight = selectedLightId !== null

    return (
      <div className={`space-y-4 ${className}`}>
        {/* Light List Group */}
        <ControlGroup
          collapsible
          defaultOpen
          title="Scene Lights"
          rightElement={
            <div className="flex items-center gap-2" title="Show light indicators in scene">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">
                Gizmos
              </span>
              <Switch checked={showLightGizmos} onCheckedChange={setShowLightGizmos} />
            </div>
          }
        >
          <LightList />
        </ControlGroup>

        {/* Light Editor (when light selected - includes ambient light) */}
        {hasSelectedLight && (
          <ControlGroup title="Light Properties" collapsible defaultOpen>
            <LightEditor />
          </ControlGroup>
        )}
      </div>
    )
  }
)

LightingControls.displayName = 'LightingControls'
