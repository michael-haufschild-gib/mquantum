/**
 * DrawerSection Component
 *
 * Standardized section primitive for timeline drawer panels.
 * Provides consistent heading, optional ON/OFF toggle with disabled state,
 * ARIA accessibility, and column-break-safe layout.
 *
 * @example
 * ```tsx
 * <DrawerSection
 *   title="Interference Fringing"
 *   enabled={config.interferenceEnabled}
 *   onToggle={(v) => setInterferenceEnabled(v)}
 *   toggleTooltip="Modulates density with sinusoidal phase term."
 *   testId="animation-panel-interference"
 * >
 *   <Slider label="Amplitude" ... />
 *   <Slider label="Frequency" ... />
 * </DrawerSection>
 * ```
 */

import React from 'react'

import { ToggleButton } from '@/components/ui/ToggleButton'

/** Props for the DrawerSection component. */
export interface DrawerSectionProps {
  /** Section heading text */
  title: string
  /** Whether this section's controls are enabled. When `false`, children are dimmed and non-interactive. */
  enabled?: boolean
  /** Toggle callback. When provided alongside `enabled`, renders an ON/OFF toggle button. */
  onToggle?: (enabled: boolean) => void
  /** Tooltip for the toggle button */
  toggleTooltip?: string
  /** Accessible label for the toggle. Defaults to "Toggle {title}" */
  toggleAriaLabel?: string
  /** Explicit test ID for the toggle button */
  toggleTestId?: string
  /** Always-visible description text below the header, above disabled controls */
  description?: string
  /** Test ID for the section wrapper */
  testId?: string
  /** Additional actions rendered in the header row (e.g. Select All buttons) */
  headerActions?: React.ReactNode
  /** Section content (sliders, selects, etc.) */
  children?: React.ReactNode
  /** Additional CSS classes on the outer wrapper */
  className?: string
}

/**
 * Standardized section for timeline drawer panels.
 *
 * Renders a consistent heading row with optional ON/OFF toggle,
 * optional always-visible description, and a controls area that
 * dims and disables pointer events when the toggle is OFF.
 *
 * @param props - Section properties
 * @returns Drawer section element
 */
export const DrawerSection: React.FC<DrawerSectionProps> = React.memo(
  ({
    title,
    enabled,
    onToggle,
    toggleTooltip,
    toggleAriaLabel,
    toggleTestId,
    description,
    testId,
    headerActions,
    children,
    className,
  }) => {
    const showToggle = enabled !== undefined && onToggle !== undefined
    const isDisabled = enabled === false

    return (
      <div className={`space-y-4 ${className ?? ''}`} data-testid={testId}>
        {/* Header with optional toggle and actions */}
        <div className="flex items-center justify-between">
          <h3 className="text-2xs font-bold text-text-secondary uppercase tracking-wider">
            {title}
          </h3>
          <div className="flex items-center gap-2">
            {headerActions}
            {showToggle && (
              <ToggleButton
                pressed={enabled}
                onToggle={() => onToggle?.(!enabled)}
                className="text-xs px-2 py-1 h-auto"
                tooltip={toggleTooltip}
                ariaLabel={toggleAriaLabel ?? `Toggle ${title}`}
                data-testid={toggleTestId}
              >
                {enabled ? 'ON' : 'OFF'}
              </ToggleButton>
            )}
          </div>
        </div>

        {/* Always-visible description */}
        {description && <p className="text-xs text-text-tertiary">{description}</p>}

        {/* Controls area — disabled when enabled is false */}
        {children &&
          (enabled !== undefined ? (
            <fieldset
              role="group"
              aria-label={`${title} parameters`}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              className={`space-y-3 border-0 p-0 m-0 min-w-0 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {children}
            </fieldset>
          ) : (
            <div className="space-y-3">{children}</div>
          ))}
      </div>
    )
  }
)

DrawerSection.displayName = 'DrawerSection'
