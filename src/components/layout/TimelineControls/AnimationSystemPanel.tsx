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

import React from 'react'

import { Slider } from '@/components/ui/Slider'
import type { AnimationSystemDef } from '@/lib/geometry/registry'

import { DrawerSection } from './DrawerSection'

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

/** Props for the animation system control panel. */
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
      <DrawerSection
        title={system.name}
        enabled={enabled}
        onToggle={onToggle}
        toggleAriaLabel={`Toggle ${system.name}`}
        testId={`animation-panel-${systemKey}`}
      >
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
      </DrawerSection>
    )
  }
)

AnimationSystemPanel.displayName = 'AnimationSystemPanel'

export default AnimationSystemPanel
