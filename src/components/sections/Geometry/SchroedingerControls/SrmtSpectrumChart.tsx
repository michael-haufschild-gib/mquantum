/**
 * Dual-series SVG chart rendering for the SRMT spectrum panel.
 *
 * Renders the modular Hamiltonian spectrum `K_n` and the Hamilton-Jacobi
 * eigenspectrum as two overlaid polylines, each peak-normalised to
 * `[0, 1]` so the *shape* comparison is the headline read. A numeric
 * affine-match quality chip (rendered by the parent) carries the
 * precise residual.
 *
 * Rationale for unit-max Y scaling: `K_n` is already `−log(s²)`, so
 * re-log-ing would compress structure the user is meant to read. The
 * HJ spectrum is typically positive and spans a broad range; mapping
 * both to `[0, 1]` via peak-normalisation lets the eye compare shape
 * at a glance while the numeric `q` tells the precise story.
 *
 * @module components/sections/Geometry/SchroedingerControls/SrmtSpectrumChart
 */

import React, { useMemo } from 'react'

import type { SrmtSnapshot } from '@/stores/srmtDiagnosticStore'

const CHART_WIDTH = 240
const CHART_HEIGHT = 90
const CHART_PADDING = 4

// Chart series use literal oklch() values rather than theme tokens
// because the K and HJ series need consistent contrast with the panel
// regardless of the active accent colour.
// eslint-disable-next-line project-rules/no-hardcoded-colors
export const K_SERIES_COLOR = 'oklch(0.68 0.18 245)' // blue — modular spectrum
// eslint-disable-next-line project-rules/no-hardcoded-colors
export const HJ_SERIES_COLOR = 'oklch(0.72 0.17 55)' // orange — HJ spectrum

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
 * Build a polyline `points` string for one series after unit-max
 * normalisation. Returns `null` when the series has fewer than 2 values
 * or the peak magnitude is non-positive (caller renders only the
 * non-null series; both-null triggers the "no data" placeholder).
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
