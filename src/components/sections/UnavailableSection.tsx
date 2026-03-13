import React from 'react'

/**
 * Props for the UnavailableSection component.
 */
export interface UnavailableSectionProps {
  /** Section title (matches the title it would have when available). */
  title: string
  /** Brief explanation of why the section is unavailable. */
  reason: string
  /** Optional CSS class name. */
  className?: string
  /** Optional test ID. */
  'data-testid'?: string
}

/**
 * Renders a collapsed, non-interactive section header with an explanation
 * of why the section is unavailable in the current mode.
 *
 * Use this instead of `return null` when a section is conditionally hidden,
 * so users know the feature exists but is not applicable.
 *
 * @param props - Component props
 * @returns React component
 */
export const UnavailableSection: React.FC<UnavailableSectionProps> = React.memo(
  ({ title, reason, className = '', 'data-testid': dataTestId }) => {
    return (
      <div
        className={`group relative overflow-hidden border-b border-[var(--border-subtle)] last:border-b-0 opacity-50 ${className}`}
        data-testid={dataTestId}
      >
        <div className="flex items-center justify-between bg-[var(--bg-hover)] border-b border-[var(--border-subtle)] py-3 px-4">
          <div className="flex items-center gap-3">
            {/* LED Indicator — dimmed */}
            <div className="relative flex items-center justify-center w-2 h-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
            </div>

            <h3 className="text-[11px] font-bold tracking-widest uppercase text-[var(--text-tertiary)]">
              {title}
            </h3>
          </div>

          <span className="text-[10px] text-[var(--text-tertiary)] italic max-w-[200px] text-right leading-tight">
            {reason}
          </span>
        </div>
      </div>
    )
  }
)

UnavailableSection.displayName = 'UnavailableSection'
