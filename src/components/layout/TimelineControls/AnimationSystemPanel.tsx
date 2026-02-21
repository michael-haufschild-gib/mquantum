/**
 * AnimationSystemPanel Component
 *
 * Generic, reusable component that renders animation controls from registry schema.
 * Generates sliders from the animation system definition parameters.
 *
 * @example
 * ```tsx
 * <AnimationSystemPanel
 *   systemKey="powerAnimation"
 *   system={system}
 *   enabled={config.powerAnimationEnabled}
 *   values={{ powerMin: 2, powerMax: 8, powerSpeed: 0.05 }}
 *   onToggle={(enabled) => setEnabled(enabled)}
 *   onParamChange={(param, value) => updateParam(param, value)}
 * />
 * ```
 */

import type { AnimationSystemDef } from '@/lib/geometry/registry'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { Slider } from '@/components/ui/Slider'
import React from 'react'

/**
 * Formats a camelCase parameter key to a human-readable label
 * @param paramKey - The parameter key (e.g., 'powerMin', 'juliaOrbitSpeed')
 * @returns Formatted label (e.g., 'Min', 'Orbit Speed')
 */
function formatParamLabel(paramKey: string): string {
  // Remove common prefixes that are redundant with section title
  const cleanKey = paramKey
    .replace(/^slice/, '')
    .replace(/^phase/, '')
    .replace(/^origin/, '')
    .replace(/^dimension/, '')

  // Handle empty result (e.g., 'power' alone)
  if (cleanKey === '') {
    return 'Value'
  }

  // Split camelCase and capitalize
  return cleanKey
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
}

export interface AnimationSystemPanelProps {
  /** Key identifying this animation system */
  systemKey: string
  /** Animation system definition from registry */
  system: AnimationSystemDef
  /** Whether this animation system is enabled */
  enabled: boolean
  /** Current values for each parameter */
  values: Record<string, number>
  /** Called when the system is toggled on/off */
  onToggle: (enabled: boolean) => void
  /** Called when a parameter value changes */
  onParamChange: (paramKey: string, value: number) => void
}

/**
 * Renders a collapsible animation system panel with sliders for each parameter.
 *
 * The panel is generated entirely from the registry schema, with:
 * - A header showing the system name with an on/off toggle
 * - Sliders for each parameter with min/max/step from the registry
 * - Parameters are disabled (dimmed) when the system is off
 */
export const AnimationSystemPanel: React.FC<AnimationSystemPanelProps> = React.memo(
  ({ systemKey, system, enabled, values, onToggle, onParamChange }) => {
    return (
      <div className="space-y-4" data-testid={`animation-panel-${systemKey}`}>
        {/* Header with toggle */}
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
            {system.name}
          </label>
          <ToggleButton
            pressed={enabled}
            onToggle={() => onToggle(!enabled)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel={`Toggle ${system.name}`}
          >
            {enabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>

        {/* Parameter sliders */}
        <div className={`space-y-3 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          {Object.entries(system.params).map(([paramKey, range]) => {
            const currentValue = values[paramKey] ?? range.default
            const step = range.step ?? 0.01

            return (
              <Slider
                key={paramKey}
                label={formatParamLabel(paramKey)}
                min={range.min}
                max={range.max}
                step={step}
                value={currentValue}
                onChange={(value) => onParamChange(paramKey, value)}
                showValue
              />
            )
          })}
        </div>
      </div>
    )
  }
)

AnimationSystemPanel.displayName = 'AnimationSystemPanel'

export default AnimationSystemPanel
