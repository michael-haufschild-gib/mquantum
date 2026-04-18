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
import type { SrmtClockQuality } from '@/stores/srmtDiagnosticStore'

import { countCompletedClocks, qualityTier, selectChampionClock } from './srmtPanelHelpers'
import { SrmtQualityChip } from './SrmtQualityChip'

const PENDING_TOOLTIP = 'Cross-clock diagnostic requires Phase 6 WASM port — not yet computed'

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
}

/**
 * Single row in the per-clock table. Selected clock highlighted,
 * non-selected clocks with NaN quality show the "pending" tooltip. The
 * champion row (when one exists) wears a compact glyph + bold weight
 * so the SRMT signal is skimmable.
 */
const ClockRow: React.FC<ClockRowProps> = ({ clock, quality, isSelected, isChampion }) => {
  const tier = qualityTier(quality)
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
              className="text-[10px] tracking-wide uppercase"
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
        tooltipWhenPending={tier === 'pending' ? PENDING_TOOLTIP : undefined}
      />
    </div>
  )
}

/** Props for {@link SrmtClockTable}. */
export interface SrmtClockTableProps {
  quality: SrmtClockQuality
  selectedClock: SrmtClock
}

/**
 * Three-row per-clock quality table with champion highlighting.
 */
export const SrmtClockTable: React.FC<SrmtClockTableProps> = ({ quality, selectedClock }) => {
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
      />
      <ClockRow
        clock="phi1"
        quality={quality.phi1}
        isSelected={selectedClock === 'phi1'}
        isChampion={champion === 'phi1'}
      />
      <ClockRow
        clock="phi2"
        quality={quality.phi2}
        isSelected={selectedClock === 'phi2'}
        isChampion={champion === 'phi2'}
      />
    </div>
  )
}
