import React from 'react'

/**
 * Props for the {@link PanelHeader} component — the strip that introduces a
 * top-level workbench panel (Explorer, Inspector, future Diagnostics, etc).
 *
 * The header is intentionally distinct from a Section header: a panel has
 * exactly one header that names the entire surface, whereas Section headers
 * categorise content inside the panel body. Keeping the two patterns in
 * separate components prevents one from drifting into the other's job.
 */
export interface PanelHeaderProps {
  /** Primary panel name, displayed in sentence case. */
  title: string
  /** Optional one- or two-word secondary hint to differentiate this panel
   *  from a peer (e.g. "configure" beside "Inspector"). Rendered muted. */
  subtitle?: string
  /**
   * Accent stripe variant. `accent` uses the theme accent (active panel),
   * `muted` uses the muted text colour (sibling/secondary panel). The
   * stripe carries the colour signal so the title text itself stays calm.
   */
  variant?: 'accent' | 'muted'
  /** Optional trailing slot for status chips, counters, or icon buttons. */
  rightSlot?: React.ReactNode
}

const STRIPE_CLASS: Record<NonNullable<PanelHeaderProps['variant']>, string> = {
  accent: 'bg-accent/80 shadow-[0_0_6px_var(--color-accent-glow)]',
  muted: 'bg-text-secondary/60',
}

/**
 * Header strip for a top-level workbench panel. Renders a vertical accent
 * stripe + sentence-case title + optional muted subtitle + optional right
 * slot, all on a single 36-ish-pixel row that anchors the panel.
 *
 * @returns Panel header element.
 */
export const PanelHeader: React.FC<PanelHeaderProps> = React.memo(
  ({ title, subtitle, variant = 'accent', rightSlot }) => {
    return (
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] z-10 shrink-0 flex items-center gap-2">
        <span
          className={`inline-block w-1 h-3.5 rounded-sm shrink-0 ${STRIPE_CLASS[variant]}`}
          aria-hidden
        />
        <h2 className="text-sm font-semibold tracking-tight text-text-primary">{title}</h2>
        {subtitle && (
          <span className="ms-1 text-2xs font-medium text-text-tertiary">{subtitle}</span>
        )}
        {rightSlot && <div className="ms-auto flex items-center">{rightSlot}</div>}
      </div>
    )
  }
)

PanelHeader.displayName = 'PanelHeader'
