/**
 * Per-clock affine-match quality table for the SRMT spectrum panel.
 *
 * Renders three rows (`a`, `phi1`, `phi2`) with the selected clock
 * bolded and a "WIN" glyph on the champion clock (when one exists).
 * Champion selection delegates to {@link findChampionClock} in the
 * shared SRMT library so UI and telemetry never disagree.
 *
 * @module components/sections/Geometry/SchroedingerControls/SrmtClockTable
 */

import React from 'react'

import { Tooltip } from '@/components/ui/Tooltip'
import type { SrmtClock } from '@/lib/physics/srmt'
import type { SrmtClockQuality } from '@/stores/diagnostics/srmtDiagnosticStore'

import { countCompletedClocks, qualityTier, selectChampionClock } from '../srmtPanelHelpers'
import { SrmtQualityChip } from '../SrmtQualityChip'

const PENDING_TOOLTIP =
  'This clock is queued or computing. Its quality appears once the worker reply arrives.'
/** Batch over without a finite result (worker error/cancel, or a degenerate fit). */
const UNAVAILABLE_TOOLTIP =
  'No result for this clock: the batch ended without a finite fit (worker error, cancellation, or a degenerate spectrum).'

/** Presentation label for each clock axis. */
const CLOCK_LABEL: Record<SrmtClock, string> = {
  a: 'a',
  phi1: 'phi1',
  phi2: 'phi2',
}

interface ClockRowProps {
  clock: SrmtClock
  quality: number
  isSelected: boolean
  isChampion: boolean
  /** Whether a worker batch is still running (NaN then means "pending"). */
  computing: boolean
}

/**
 * Single row in the per-clock table. Selected clock highlighted,
 * non-selected clocks with NaN quality show the "pending" tooltip. The
 * champion row (when one exists) wears a compact glyph + bold weight
 * so the SRMT signal is skimmable.
 */
const ClockRow: React.FC<ClockRowProps> = ({
  clock,
  quality,
  isSelected,
  isChampion,
  computing,
}) => {
  const tier = qualityTier(quality)
  // The dispatcher aborts the queue on a worker error and flips `computing`
  // off, leaving the undrained clocks NaN; calling those "queued or
  // computing" after the batch ended sent the user waiting for a reply that
  // never comes.
  const unavailable = tier === 'pending' && !computing
  return (
    <div
      className="flex items-center justify-between gap-2 py-1 text-xs"
      style={{
        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: isChampion ? 600 : 400,
      }}
      data-testid={`wdw-srmt-clock-row-${clock}`}
      data-selected={isSelected ? 'true' : 'false'}
      data-champion={isChampion ? 'true' : 'false'}
    >
      <span className="font-mono inline-flex items-center gap-1">
        {isChampion && (
          <Tooltip content="Champion clock — lowest affine-match residual among the three.">
            <span
              aria-label="champion"
              data-testid={`wdw-srmt-clock-row-${clock}-champion-glyph`}
              className="text-3xs tracking-wide uppercase"
              style={{ color: 'var(--color-success, currentColor)' }}
            >
              [WIN]
            </span>
          </Tooltip>
        )}
        {CLOCK_LABEL[clock]}
        {isSelected ? ' *' : ''}
      </span>
      <SrmtQualityChip
        value={quality}
        testId={`wdw-srmt-clock-row-${clock}-chip`}
        tooltipWhenPending={
          tier === 'pending' ? (unavailable ? UNAVAILABLE_TOOLTIP : PENDING_TOOLTIP) : undefined
        }
        pendingLabel={unavailable ? 'n/a' : 'pending'}
      />
    </div>
  )
}

/** Props for {@link SrmtClockTable}. */
export interface SrmtClockTableProps {
  quality: SrmtClockQuality
  selectedClock: SrmtClock
  /** Whether a worker batch is in flight (default `true`: NaN = pending). */
  computing?: boolean
}

/**
 * Three-row per-clock quality table with champion highlighting.
 */
export const SrmtClockTable: React.FC<SrmtClockTableProps> = ({
  quality,
  selectedClock,
  computing = true,
}) => {
  const completedClocks = countCompletedClocks(quality)
  const champion = completedClocks === 3 ? selectChampionClock(quality) : null
  return (
    <div
      className="pt-2 border-t"
      style={{ borderColor: 'var(--border-subtle)' }}
      data-testid="wdw-srmt-clock-table"
      data-champion={champion ?? ''}
    >
      <ClockRow
        clock="a"
        quality={quality.a}
        isSelected={selectedClock === 'a'}
        isChampion={champion === 'a'}
        computing={computing}
      />
      <ClockRow
        clock="phi1"
        quality={quality.phi1}
        isSelected={selectedClock === 'phi1'}
        isChampion={champion === 'phi1'}
        computing={computing}
      />
      <ClockRow
        clock="phi2"
        quality={quality.phi2}
        isSelected={selectedClock === 'phi2'}
        isChampion={champion === 'phi2'}
        computing={computing}
      />
    </div>
  )
}
