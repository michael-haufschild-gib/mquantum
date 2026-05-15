/**
 * SRMT (Superspace-Relational Modular Time) spectrum comparison panel.
 *
 * Composes three presentation concerns into one container:
 *
 *  1. {@link SrmtSpectrumChart} — dual-series modular + HJ polylines.
 *  2. {@link SrmtClockTable} — per-clock affine-match quality with
 *     champion highlight.
 *  3. {@link SrmtComputingStrip} — ARIA-live "Computing: N/3 clocks"
 *     progress indicator while the worker queue drains.
 *
 * The panel itself is a three-state switch:
 *
 *   - SRMT disabled → placeholder prompt.
 *   - SRMT enabled + no snapshot yet → computing strip OR "waiting for
 *     first frame" hint.
 *   - SRMT enabled + snapshot present → populated panel (chart, chip,
 *     table, strip-on-while-recomputing).
 *
 * @module components/sections/Geometry/SchroedingerControls/SrmtSpectrumPanel
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Tooltip } from '@/components/ui/Tooltip'
import type { SrmtClock } from '@/lib/physics/srmt'
import {
  type SrmtClockQuality,
  type SrmtSnapshot,
  useSrmtDiagnosticStore,
} from '@/stores/diagnostics/srmtDiagnosticStore'

import { SrmtClockTable } from './SrmtClockTable'
import { SrmtComputingStrip } from './SrmtComputingStrip'
import { SrmtNullBaselineStrip } from './SrmtNullBaselineStrip'
import { countCompletedClocks } from './srmtPanelHelpers'
import { SrmtQualityChip } from './SrmtQualityChip'
import { SrmtSpectrumChart, SrmtSpectrumLegend } from './SrmtSpectrumChart'

/** Props for {@link SrmtSpectrumPanel}. */
export interface SrmtSpectrumPanelProps {
  /**
   * Master enable flag. When false, the panel shows a placeholder
   * prompt instead of spectrum data (even if a stale snapshot is still
   * cached).
   */
  srmtEnabled: boolean
  /** Selected clock — used to flag the corresponding row in the table. */
  selectedClock: SrmtClock
}

/**
 * Inner body shown when a snapshot is available. Fades to 60 % opacity
 * while a fresh diagnostic is in-flight so the user can still read the
 * last result but gets a visual cue that it is stale. Shows a compact
 * "Computing: N/3 clocks" progress strip above the body while the
 * cross-clock batch drains.
 */
const PopulatedPanel: React.FC<{
  snapshot: SrmtSnapshot
  quality: SrmtClockQuality
  selectedClock: SrmtClock
  computing: boolean
}> = ({ snapshot, quality, selectedClock, computing }) => {
  const completedClocks = countCompletedClocks(quality)
  // Highlight the clock that actually produced the displayed snapshot,
  // not the user's newly-selected clock. During a cross-clock batch
  // drain the store-level `selectedClock` updates immediately but the
  // snapshot stays on the previous clock until the new worker reply
  // lands (≈50–200 ms). Highlighting `selectedClock` during that
  // window pointed to the wrong row — the panel claimed "clock a" was
  // active while the displayed spectrum was still "clock phi1".
  const highlightedClock = computing ? snapshot.clock : selectedClock
  return (
    <div className="space-y-2" data-testid="wdw-srmt-spectrum-panel">
      {computing && <SrmtComputingStrip completed={completedClocks} total={3} />}
      <div
        className="space-y-2"
        style={{ opacity: computing ? 0.6 : 1, transition: 'opacity 150ms ease-out' }}
        data-testid="wdw-srmt-spectrum-body"
        data-computing={computing ? 'true' : 'false'}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Affine-match quality (lower is better)
          </span>
          <Tooltip content="Affine fit residual q = Σ(K_n − (α·E_n + β))² / Σ K_n². Lower q = modular spectrum tracks HJ more closely.">
            <SrmtQualityChip value={snapshot.affineMatchQuality} testId="wdw-srmt-quality-chip" />
          </Tooltip>
        </div>
        <SrmtSpectrumChart snapshot={snapshot} />
        <SrmtSpectrumLegend />
        <SrmtNullBaselineStrip snapshot={snapshot} />
        <SrmtClockTable quality={quality} selectedClock={highlightedClock} />
      </div>
    </div>
  )
}

/**
 * Spectrum-comparison panel for the SRMT diagnostic. Subscribes to
 * {@link useSrmtDiagnosticStore} for the latest snapshot and cross-clock
 * quality record. Renders exactly one of three mutually-exclusive
 * layouts based on the `srmtEnabled` prop and the store state.
 */
export const SrmtSpectrumPanel: React.FC<SrmtSpectrumPanelProps> = React.memo(
  ({ srmtEnabled, selectedClock }) => {
    const { snapshot, clockAffineQuality, computing } = useSrmtDiagnosticStore(
      useShallow((s) => ({
        snapshot: s.snapshot,
        clockAffineQuality: s.clockAffineQuality,
        computing: s.computing,
      }))
    )

    if (!srmtEnabled) {
      return (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            color: 'var(--text-tertiary)',
            borderColor: 'var(--border-subtle)',
            background: 'var(--bg-elevated)',
          }}
          data-testid="wdw-srmt-disabled-placeholder"
        >
          Enable SRMT to see modular-Hamiltonian vs Hamilton-Jacobi spectrum comparison.
        </div>
      )
    }

    if (snapshot === null) {
      if (computing) {
        // First-ever dispatch: no stale snapshot to fade, so render the
        // computing strip on its own. Reuses the same ARIA live region
        // as the populated path so the state announcement is
        // consistent.
        return <SrmtComputingStrip />
      }
      return (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            color: 'var(--text-tertiary)',
            borderColor: 'var(--border-subtle)',
            background: 'var(--bg-elevated)',
          }}
          data-testid="wdw-srmt-pending-placeholder"
        >
          Waiting for first SRMT diagnostic frame.
        </div>
      )
    }

    return (
      <PopulatedPanel
        snapshot={snapshot}
        quality={clockAffineQuality}
        selectedClock={selectedClock}
        computing={computing}
      />
    )
  }
)

SrmtSpectrumPanel.displayName = 'SrmtSpectrumPanel'
