/**
 * SRMT (Superspace-Relational Modular Time) spectrum comparison panel.
 *
 * Renders the modular-Hamiltonian spectrum `K_n = -log(s_n² + ε)` side-by-side
 * with the Hamilton-Jacobi operator spectrum on the clock slice. Both series
 * are normalized to their respective unit maxima so the *shape* comparison
 * stays honest — the underlying affine-match metric `q` (displayed as a
 * color-coded chip) is the diagnostic readout the user is meant to track.
 *
 * Rationale for unit-max (instead of log) Y scaling: `K_n` is already
 * `-log(s²)`, so re-log-ing would compress structure the user is supposed to
 * read. The HJ spectrum is typically positive and spans a broad range;
 * mapping both to `[0, 1]` via peak-normalization lets the human eye compare
 * "how closely does the modular spectrum track the HJ spectrum" at a glance
 * while the numeric `q` tells the precise story.
 *
 * Cross-clock rows (non-selected clocks) render as "pending" until the
 * Phase 6 WASM port lifts the O(n³) compute budget.
 *
 * @module components/sections/Geometry/SchroedingerControls/SrmtSpectrumPanel
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Tooltip } from '@/components/ui/Tooltip'
import type { SrmtClock } from '@/lib/physics/srmt'
import {
  type SrmtClockQuality,
  type SrmtSnapshot,
  useSrmtDiagnosticStore,
} from '@/stores/srmtDiagnosticStore'

const CHART_WIDTH = 240
const CHART_HEIGHT = 90
const CHART_PADDING = 4

/**
 * Champion-row tie tolerance — clocks whose quality advantage over the
 * runner-up is below this margin are treated as tied (no champion glyph).
 * Mirrors the threshold used by the dispatcher's `findChampionClock` so UI
 * and telemetry never disagree.
 */
const CHAMPION_TIE_TOLERANCE = 0.02

// Chart series are assigned literal oklch() values rather than theme tokens
// because the K and HJ series need consistent contrast with the panel
// regardless of the active accent color.
// eslint-disable-next-line project-rules/no-hardcoded-colors
const K_SERIES_COLOR = 'oklch(0.68 0.18 245)' // blue — modular spectrum
// eslint-disable-next-line project-rules/no-hardcoded-colors
const HJ_SERIES_COLOR = 'oklch(0.72 0.17 55)' // orange — HJ spectrum

const PENDING_TOOLTIP = 'Cross-clock diagnostic requires Phase 6 WASM port — not yet computed'

/**
 * Props for {@link SrmtSpectrumPanel}.
 */
export interface SrmtSpectrumPanelProps {
  /**
   * Master enable flag. When false, the panel shows a placeholder prompt
   * instead of spectrum data (even if a stale snapshot is still cached).
   */
  srmtEnabled: boolean
  /** Selected clock — used to flag the corresponding row in the table. */
  selectedClock: SrmtClock
}

interface ChartSeries {
  points: string
  normalizedValues: Float32Array
}

interface ChartGeometry {
  kSeries: ChartSeries | null
  hjSeries: ChartSeries | null
  maxLen: number
}

/**
 * Build a polyline `points` string for a series after unit-max normalization.
 * Returns null when the series is empty (guard against divide-by-zero).
 */
function buildSeries(values: Float32Array, width: number, height: number): ChartSeries | null {
  if (values.length < 2) return null
  let peak = 0
  for (let i = 0; i < values.length; i++) {
    const v = Math.abs(values[i]!)
    if (v > peak) peak = v
  }
  if (peak <= 0) return null
  const n = values.length
  const normalized = new Float32Array(n)
  const usableW = width - CHART_PADDING * 2
  const usableH = height - CHART_PADDING * 2
  const pts = new Array<string>(n)
  for (let i = 0; i < n; i++) {
    const nv = values[i]! / peak
    normalized[i] = nv
    const x = CHART_PADDING + (i / (n - 1)) * usableW
    const y = CHART_PADDING + (1 - nv) * usableH
    pts[i] = `${x.toFixed(1)},${y.toFixed(1)}`
  }
  return { points: pts.join(' '), normalizedValues: normalized }
}

function computeChartGeometry(snapshot: SrmtSnapshot): ChartGeometry {
  const kSeries = buildSeries(snapshot.kSpectrum, CHART_WIDTH, CHART_HEIGHT)
  const hjSeries = buildSeries(snapshot.hjSpectrum, CHART_WIDTH, CHART_HEIGHT)
  return {
    kSeries,
    hjSeries,
    maxLen: Math.max(snapshot.kSpectrum.length, snapshot.hjSpectrum.length),
  }
}

type QualityTier = 'good' | 'marginal' | 'poor' | 'pending'

/**
 * Map an affine-match quality score to a discrete color tier. NaN maps to
 * "pending" so cross-clock placeholders do not display a false green chip.
 */
function qualityTier(q: number): QualityTier {
  if (!Number.isFinite(q)) return 'pending'
  if (q < 0.1) return 'good'
  if (q < 0.3) return 'marginal'
  return 'poor'
}

const TIER_STYLES: Record<
  QualityTier,
  { bg: string; color: string; border: string; label: string }
> = {
  good: {
    bg: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    border: 'var(--color-success-border)',
    label: 'good',
  },
  marginal: {
    bg: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    border: 'var(--color-warning-border)',
    label: 'marginal',
  },
  poor: {
    bg: 'var(--color-danger-bg)',
    color: 'var(--color-danger)',
    border: 'var(--color-danger-border)',
    label: 'poor',
  },
  pending: {
    bg: 'transparent',
    color: 'var(--text-tertiary)',
    border: 'var(--border-subtle)',
    label: 'pending',
  },
}

const CLOCK_LABEL: Record<SrmtClock, string> = {
  a: 'a',
  phi1: 'phi1',
  phi2: 'phi2',
}

/**
 * Count clocks with finite affine quality entries — used both for the
 * "Computing: N/3 clocks" progress indicator and to gate the champion
 * highlight (champion only appears once all three are populated).
 */
function countCompletedClocks(quality: SrmtClockQuality): number {
  let n = 0
  if (Number.isFinite(quality.a)) n++
  if (Number.isFinite(quality.phi1)) n++
  if (Number.isFinite(quality.phi2)) n++
  return n
}

/**
 * Determine the champion clock: the one with the minimum affine quality
 * that also leads the runner-up by at least {@link CHAMPION_TIE_TOLERANCE}.
 * Returns `null` when fewer than three clocks have finite quality values,
 * or when the top two are within tolerance. Deterministic, pure function —
 * mirrors `findChampionClock` in the dispatcher so UI + telemetry agree.
 * Module-local (the identical dispatcher-side helper is already covered
 * by unit tests; exporting here would break React Fast Refresh).
 */
function selectChampionClock(quality: SrmtClockQuality): SrmtClock | null {
  const entries: { clock: SrmtClock; q: number }[] = [
    { clock: 'a', q: quality.a },
    { clock: 'phi1', q: quality.phi1 },
    { clock: 'phi2', q: quality.phi2 },
  ]
  if (!entries.every((e) => Number.isFinite(e.q))) return null
  entries.sort((x, y) => x.q - y.q)
  const [best, second] = entries
  if (!best || !second) return null
  // Strict less-than matches the dispatcher's `findChampionClock` — a
  // margin of exactly `CHAMPION_TIE_TOLERANCE` is enough to name the
  // champion. Tests cover the near-tie boundary with a deliberate gap.
  if (second.q - best.q < CHAMPION_TIE_TOLERANCE) return null
  return best.clock
}

interface QualityChipProps {
  value: number
  testId: string
  tooltipWhenPending?: string
}

/**
 * Small color-coded quality chip. The tier is derived from `value` via
 * {@link qualityTier}; NaN renders the neutral "pending" style.
 */
function QualityChip({ value, testId, tooltipWhenPending }: QualityChipProps): React.ReactElement {
  const tier = qualityTier(value)
  const style = TIER_STYLES[tier]
  const text = tier === 'pending' ? 'pending' : value.toFixed(3)
  const chip = (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-mono tabular-nums"
      style={{
        backgroundColor: style.bg,
        color: style.color,
        borderColor: style.border,
      }}
      data-testid={testId}
      data-tier={tier}
    >
      {text}
    </span>
  )
  if (tier === 'pending' && tooltipWhenPending) {
    return <Tooltip content={tooltipWhenPending}>{chip}</Tooltip>
  }
  return chip
}

interface ClockRowProps {
  clock: SrmtClock
  quality: number
  isSelected: boolean
  isChampion: boolean
}

/**
 * Single row in the per-clock quality table. Selected clock highlighted,
 * non-selected clocks with NaN quality show the "pending" tooltip. The
 * champion row (lowest-quality clock once all three are populated) shows
 * a compact glyph + bold weight so the SRMT signal is skimmable.
 */
function ClockRow({ clock, quality, isSelected, isChampion }: ClockRowProps): React.ReactElement {
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
      <QualityChip
        value={quality}
        testId={`wdw-srmt-clock-row-${clock}-chip`}
        tooltipWhenPending={tier === 'pending' ? PENDING_TOOLTIP : undefined}
      />
    </div>
  )
}

/**
 * Render the dual-series SVG chart for the selected clock's spectra. Returns
 * null when both series are empty (handled by the caller's placeholder UI).
 */
function SpectrumChart({ snapshot }: { snapshot: SrmtSnapshot }): React.ReactElement | null {
  const { kSeries, hjSeries, maxLen } = useMemo(() => computeChartGeometry(snapshot), [snapshot])
  if (!kSeries && !hjSeries) return null

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      width="100%"
      height={CHART_HEIGHT}
      role="img"
      aria-label={`SRMT spectrum comparison: ${maxLen} modes`}
      data-testid="wdw-srmt-spectrum-chart"
      className="rounded-md border"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--panel-elevated)' }}
    >
      <line
        x1={CHART_PADDING}
        y1={CHART_HEIGHT - CHART_PADDING}
        x2={CHART_WIDTH - CHART_PADDING}
        y2={CHART_HEIGHT - CHART_PADDING}
        stroke="var(--border-subtle)"
        strokeWidth={0.5}
      />
      {kSeries && (
        <polyline
          data-testid="wdw-srmt-k-series"
          points={kSeries.points}
          fill="none"
          stroke={K_SERIES_COLOR}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {hjSeries && (
        <polyline
          data-testid="wdw-srmt-hj-series"
          points={hjSeries.points}
          fill="none"
          stroke={HJ_SERIES_COLOR}
          strokeWidth={1.5}
          strokeDasharray="3,2"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

/** Legend for the two chart series. */
function ChartLegend(): React.ReactElement {
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
        <svg width={14} height={6} aria-hidden="true">
          <line x1={0} y1={3} x2={14} y2={3} stroke={K_SERIES_COLOR} strokeWidth={1.5} />
        </svg>
        K_n (modular)
      </span>
      <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
        <svg width={14} height={6} aria-hidden="true">
          <line
            x1={0}
            y1={3}
            x2={14}
            y2={3}
            stroke={HJ_SERIES_COLOR}
            strokeWidth={1.5}
            strokeDasharray="3,2"
          />
        </svg>
        E_n (HJ)
      </span>
    </div>
  )
}

/**
 * Strip shown above the populated panel while the Web Worker is computing
 * the SRMT batch. When `completed` / `total` are provided, shows
 * `Computing: N/M clocks` — callers use this to communicate the cross-clock
 * queue's drain progress. Uses a polite ARIA live region so screen readers
 * announce the state change without interrupting current speech.
 */
function ComputingStrip({
  completed,
  total,
}: {
  completed?: number
  total?: number
}): React.ReactElement {
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

/**
 * Renders the selected-clock quality summary, chart, legend, and per-clock
 * comparison table. Split out so the main component stays readable. Fades
 * to 60 % opacity while a fresh diagnostic is in-flight so the user can
 * still read the last result but gets a visual cue that it is stale. Shows
 * a compact "Computing: N/3 clocks" progress strip above the body while
 * the cross-clock batch drains.
 *
 * @param props.snapshot - Selected-clock snapshot (chart + main chip).
 * @param props.quality - Cross-clock affine-match record.
 * @param props.selectedClock - Clock with the asterisk + bolder row color.
 * @param props.computing - True while the queue is still draining.
 */
function PopulatedPanel({
  snapshot,
  quality,
  selectedClock,
  computing,
}: {
  snapshot: SrmtSnapshot
  quality: SrmtClockQuality
  selectedClock: SrmtClock
  computing: boolean
}): React.ReactElement {
  const completedClocks = countCompletedClocks(quality)
  const champion = completedClocks === 3 ? selectChampionClock(quality) : null
  return (
    <div className="space-y-2" data-testid="wdw-srmt-spectrum-panel">
      {computing && <ComputingStrip completed={completedClocks} total={3} />}
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
            <QualityChip value={snapshot.affineMatchQuality} testId="wdw-srmt-quality-chip" />
          </Tooltip>
        </div>
        <SpectrumChart snapshot={snapshot} />
        <ChartLegend />
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
      </div>
    </div>
  )
}

/**
 * Spectrum-comparison panel for the SRMT diagnostic.
 *
 * Subscribes to {@link useSrmtDiagnosticStore} for the latest snapshot and
 * cross-clock quality record. Shows three mutually-exclusive layouts:
 *
 * 1. SRMT disabled → placeholder prompt.
 * 2. SRMT enabled, no snapshot yet → "waiting for first compute" hint.
 * 3. SRMT enabled + snapshot present → chart, legend, chip, 3-row table.
 *
 * @param props - Panel props.
 * @param props.srmtEnabled - Whether the diagnostic is active.
 * @param props.selectedClock - Clock axis currently under study.
 * @returns Panel component element.
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
            background: 'var(--panel-elevated)',
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
        // computing strip on its own. Reuses the same ARIA live region as
        // the populated path so the state announcement is consistent.
        return <ComputingStrip />
      }
      return (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            color: 'var(--text-tertiary)',
            borderColor: 'var(--border-subtle)',
            background: 'var(--panel-elevated)',
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
