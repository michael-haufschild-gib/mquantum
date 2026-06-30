/**
 * WDW ⊗ ζ suite geometry controls — generic, registry-driven.
 *
 * One component renders the physics/geometry sliders & switches for whichever
 * suite mode is active, reading the field schema (labels, ranges, steps) from
 * `WDW_ZETA_UI` and writing through the generic `setWdwZetaField` action.
 * Emission/glow and rotation are intentionally absent — they belong to the
 * shared Advanced "Emission & Rim" control and the animation turntable.
 *
 * @module components/sections/Geometry/SchroedingerControls/WdwZetaControls
 */

import React, { useCallback } from 'react'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { getWdwZetaUi } from '@/lib/geometry/extended/wdwZeta/configRegistry'
import type { WdwZetaModeKey } from '@/lib/geometry/extended/wdwZeta/shared'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

/**
 * Render the active WDW ⊗ ζ suite mode's geometry controls.
 *
 * @returns The active suite mode's control panel, or null if unavailable.
 */
export function WdwZetaControls(): React.ReactElement | null {
  const mode = useExtendedObjectStore((s) => s.schroedinger.quantumMode) as WdwZetaModeKey
  const config = useExtendedObjectStore(
    (s) => (s.schroedinger as unknown as Record<string, unknown>)[mode]
  ) as Record<string, number | boolean> | undefined
  const setField = useExtendedObjectStore((s) => s.setWdwZetaField)

  const onNumber = useCallback(
    (field: string) => (v: number) => setField(mode, field, v),
    [mode, setField]
  )
  const onBool = useCallback(
    (field: string) => (v: boolean) => setField(mode, field, v),
    [mode, setField]
  )

  const ui = getWdwZetaUi(mode)
  if (!ui || !config) return null

  return (
    <div className="flex flex-col gap-3" data-testid={`wdwzeta-controls-${mode}`}>
      <ControlGroup title={ui.label} data-testid={`wdwzeta-group-${mode}`}>
        {ui.fields.map((f) => {
          if (f.showIf && !config[f.showIf]) return null
          if (f.kind === 'switch') {
            return (
              <Switch
                key={f.key}
                label={f.label}
                tooltip={f.tooltip}
                checked={Boolean(config[f.key])}
                onCheckedChange={onBool(f.key)}
                ariaLabel={f.label}
                data-testid={`wz-${f.url}`}
              />
            )
          }
          const r = ui.ranges[f.key]
          return (
            <Slider
              key={f.key}
              label={f.label}
              tooltip={f.tooltip}
              value={Number(config[f.key])}
              min={r?.min ?? 0}
              max={r?.max ?? 1}
              step={f.step ?? 0.01}
              onChange={onNumber(f.key)}
              data-testid={`wz-${f.url}`}
            />
          )
        })}
      </ControlGroup>
    </div>
  )
}
