/**
 * Computing-progress strip for the SRMT spectrum panel.
 *
 * Shown above the populated panel while the Web Worker is draining the
 * cross-clock queue. When `completed` / `total` are both supplied the
 * text reads `Computing: N/M clocks`; without them it falls back to a
 * generic "Computing…" message. Uses a polite ARIA live region so
 * screen readers announce the state change without interrupting
 * current speech.
 *
 * @module components/sections/Geometry/SchroedingerControls/SrmtComputingStrip
 */

import React from 'react'

/** Props for {@link SrmtComputingStrip}. */
export interface SrmtComputingStripProps {
  /** Completed clock count (for the "N/M" readout). Omit for generic text. */
  completed?: number
  /** Total clock count (matches `completed`). */
  total?: number
}

export const SrmtComputingStrip: React.FC<SrmtComputingStripProps> = ({ completed, total }) => {
  const message =
    typeof completed === 'number' && typeof total === 'number'
      ? `Computing: ${completed}/${total} clocks`
      : 'Computing modular spectrum…'
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="wdw-srmt-computing-indicator"
      className="rounded-md border px-2 py-1 text-[11px] flex items-center gap-2"
      style={{
        color: 'var(--text-secondary)',
        borderColor: 'var(--border-subtle)',
        background: 'var(--panel-elevated)',
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ background: 'var(--color-accent, currentColor)' }}
      />
      <span>{message}</span>
    </div>
  )
}
