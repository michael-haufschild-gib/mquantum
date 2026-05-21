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
        className={`group flex items-center justify-between gap-3 px-4 py-1.5 border-b border-[var(--border-subtle)] last:border-b-0 bg-transparent ${className}`}
        data-testid={dataTestId}
        aria-disabled="true"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-block w-1 h-1 rounded-full bg-[var(--text-tertiary)] opacity-50 shrink-0"
            aria-hidden
          />
          <h3 className="text-2xs font-medium uppercase tracking-wider text-[var(--text-tertiary)] truncate">
            {title}
          </h3>
        </div>

        <span className="text-2xs text-[var(--text-tertiary)] italic text-right leading-tight max-w-[60%] truncate">
          {reason}
        </span>
      </div>
    )
  }
)

UnavailableSection.displayName = 'UnavailableSection'
