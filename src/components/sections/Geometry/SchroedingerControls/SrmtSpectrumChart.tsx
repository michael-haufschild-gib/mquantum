/**
 * Dual-series SVG chart rendering for the SRMT spectrum panel.
 *
 * Renders the modular Hamiltonian spectrum `K_n` and the Hamilton-Jacobi
 * eigenspectrum as two overlaid polylines, each min/max-normalised to
 * `[0, 1]` so the *shape* comparison is the headline read. A numeric
 * affine-match quality chip (rendered by the parent) carries the
 * precise residual.
 *
 * Rationale for linear [0,1] Y scaling: `K_n` is already `−log(s²)`, so
 * re-log-ing would compress structure the user is meant to read.
 * Min/max normalisation (rather than peak-absolute) keeps any
 * negative-valued entries inside the viewBox so the polyline never
 * inverts or clips below the chart floor.
 *
 * @module components/sections/Geometry/SchroedingerControls/SrmtSpectrumChart
 */

import React, { useMemo } from 'react'

import type { SrmtSnapshot } from '@/stores/diagnostics/srmtDiagnosticStore'

const CHART_WIDTH = 240
const CHART_HEIGHT = 90
const CHART_PADDING = 4

// Chart series colors are theme tokens defined in `src/styles/theme.css`
// (block: SRMT SPECTRUM SERIES). Kept outside the accent chain so the
// K/HJ contrast stays readable whatever accent the user picks.
export const K_SERIES_COLOR = 'var(--srmt-chart-k)'
export const HJ_SERIES_COLOR = 'var(--srmt-chart-hj)'

interface ChartSeries {
  points: string
}

interface ChartGeometry {
  kSeries: ChartSeries | null
  hjSeries: ChartSeries | null
  maxLen: number
}

/**
 * Build a polyline `points` string for one series after min/max
 * normalisation. A legitimate flat spectrum (`min === max`) renders as a
 * horizontal line at the mid-band rather than being hidden. Returns
 * `null` when the series has fewer than 2 values or contains any
 * non-finite sample (NaN/Inf would poison the normalised coordinates);
 * callers render only the non-null series (both-null triggers the
 * "no data" placeholder).
 */
function buildSeries(values: Float32Array, width: number, height: number): ChartSeries | null {
  if (values.length < 2) return null
  // Use min/max normalisation so any negative entries still fall inside
  // the [0, 1] band rather than flipping below the SVG viewBox. Bail on
  // the first non-finite sample — a single NaN would make `min`/`max`
  // finite (NaN comparisons drop through) but still emit NaN coordinates
  // in the second loop, producing an invalid `points` string.
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    if (!Number.isFinite(v)) return null
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  const span = max - min
  // Negative span should never happen (min <= max by construction), but
  // guard just in case.
  if (span < 0) return null
  const n = values.length
  const usableW = width - CHART_PADDING * 2
  const usableH = height - CHART_PADDING * 2
  const pts = new Array<string>(n)
  for (let i = 0; i < n; i++) {
    const nv = span === 0 ? 0.5 : (values[i]! - min) / span
    const x = CHART_PADDING + (i / (n - 1)) * usableW
    const y = CHART_PADDING + (1 - nv) * usableH
    pts[i] = `${x.toFixed(1)},${y.toFixed(1)}`
  }
  return { points: pts.join(' ') }
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

/** Props for {@link SrmtSpectrumChart}. */
export interface SrmtSpectrumChartProps {
  snapshot: SrmtSnapshot
}

/**
 * SVG chart element. Returns `null` when both series are empty
 * (caller's PopulatedPanel falls back to the placeholder path in that
 * case).
 */
export const SrmtSpectrumChart: React.FC<SrmtSpectrumChartProps> = ({ snapshot }) => {
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
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
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

/** Legend for the two chart series. Kept separate so the parent can
 * arrange it independently of the chart box (e.g. below the chart on
 * narrow panels). */
export const SrmtSpectrumLegend: React.FC = () => (
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
