/**
 * SVG plot for the SRMT sweep panel.
 *
 * Renders three per-clock polylines (log-y), classical-turning-point
 * landmark verticals, and champion-flip markers. Extracted from
 * `SrmtSweepSection.tsx` so the section component stays small and the
 * plot can be re-rendered in isolation (tests, future docs pages).
 *
 * @module components/sections/Analysis/SrmtSweepPlot
 */

import React, { useMemo } from 'react'

import type { SrmtClock } from '@/lib/physics/srmt'
import type {
  SrmtSweepKind,
  SrmtSweepLandmark,
  SrmtSweepPoint,
} from '@/lib/physics/srmt/sweepTypes'

import { computeChampionFlips, labelForKind } from './srmtSweepHelpers'

const CHART_W = 320
const CHART_H = 180
const PAD = { left: 36, right: 8, top: 8, bottom: 22 }
const PLOT_W = CHART_W - PAD.left - PAD.right
const PLOT_H = CHART_H - PAD.top - PAD.bottom
const CLOCK_COLORS: Record<SrmtClock, string> = {
  a: 'var(--srmt-chart-k)',
  phi1: 'var(--srmt-chart-hj)',
  phi2: 'var(--accent)',
}

/** Props for the sweep plot. */
export interface SrmtSweepPlotProps {
  points: SrmtSweepPoint[]
  landmarks: SrmtSweepLandmark[]
  kind: SrmtSweepKind
}

interface YRange {
  yMin: number
  yMax: number
}

interface XRange {
  xMin: number
  xMax: number
}

function isPlottableQuality(q: number | undefined): q is number {
  return q !== undefined && Number.isFinite(q) && q >= 0
}

function collectPlottableQualities(points: SrmtSweepPoint[]): number[] {
  const qs: number[] = []
  for (const p of points) {
    for (const clock of ['a', 'phi1', 'phi2'] as const) {
      const q = p.quality[clock]
      if (isPlottableQuality(q)) qs.push(q)
    }
  }
  return qs
}

function computeYRange(points: SrmtSweepPoint[]): YRange {
  // Log-y range seeds only use strictly positive samples so yMin > 0;
  // zero-q points are retained in polylines and clamped to the chart
  // floor by `toY`.
  const positive = collectPlottableQualities(points).filter((q) => q > 0)
  if (positive.length === 0) return { yMin: 1e-4, yMax: 1 }
  let yMin = positive[0]!
  let yMax = positive[0]!
  for (let i = 1; i < positive.length; i++) {
    const v = positive[i]!
    if (v < yMin) yMin = v
    if (v > yMax) yMax = v
  }
  if (yMin === yMax) return { yMin: yMin * 0.5, yMax: yMax * 2 }
  return { yMin, yMax }
}

function computeXRange(points: SrmtSweepPoint[]): XRange {
  if (points.length === 0) return { xMin: 0, xMax: 1 }
  let xMin = Number.POSITIVE_INFINITY
  let xMax = Number.NEGATIVE_INFINITY
  for (const p of points) {
    const v = p.sweepValue
    if (!Number.isFinite(v)) continue
    if (v < xMin) xMin = v
    if (v > xMax) xMax = v
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) return { xMin: 0, xMax: 1 }
  return { xMin, xMax }
}

function buildSeries(
  points: SrmtSweepPoint[],
  toX: (x: number) => number,
  toY: (q: number) => number
): { clock: SrmtClock; points: string }[] {
  return (['a', 'phi1', 'phi2'] as const).flatMap((clock) => {
    const coords: string[] = []
    for (const p of points) {
      const q = p.quality[clock]
      if (isPlottableQuality(q)) {
        coords.push(`${toX(p.sweepValue).toFixed(1)},${toY(q).toFixed(1)}`)
      }
    }
    return coords.length >= 2 ? [{ clock, points: coords.join(' ') }] : []
  })
}

interface PlotCoords {
  toX: (x: number) => number
  toY: (q: number) => number
}

function usePlotCoords(yMin: number, yMax: number, xMin: number, xMax: number): PlotCoords {
  return useMemo(() => {
    const logYMin = Math.log10(yMin)
    const logYMax = Math.log10(yMax)
    const xSpan = xMax - xMin || 1
    const ySpan = logYMax - logYMin || 1
    return {
      toX: (x: number): number => PAD.left + ((x - xMin) / xSpan) * PLOT_W,
      toY: (q: number): number => {
        const ly = Math.log10(Math.max(q, yMin * 0.99))
        return PAD.top + (1 - (ly - logYMin) / ySpan) * PLOT_H
      },
    }
  }, [yMin, yMax, xMin, xMax])
}

/** SVG chart: per-clock polylines + landmarks + champion-flip markers. */
export const SrmtSweepPlot: React.FC<SrmtSweepPlotProps> = React.memo(
  ({ points, landmarks, kind }) => {
    const { yMin, yMax } = useMemo(() => computeYRange(points), [points])
    const { xMin, xMax } = useMemo(() => computeXRange(points), [points])
    const { toX, toY } = usePlotCoords(yMin, yMax, xMin, xMax)
    const series = useMemo(() => buildSeries(points, toX, toY), [points, toX, toY])
    const championFlips = useMemo(() => computeChampionFlips(points), [points])

    return (
      <div className="mt-2" data-testid="srmt-sweep-plot">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          q per clock vs {labelForKind(kind)}
        </p>
        <div className="rounded-md overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
          <svg width="100%" viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="block">
            <AxisLines />
            {kind === 'cut' && <LandmarkLines landmarks={landmarks} toX={toX} />}
            {kind === 'phiRef' && <PhiRefLandmarkTrail points={points} toX={toX} />}
            <ChampionFlipMarkers flips={championFlips} toX={toX} />
            {series.map(({ clock, points: pts }) => (
              <polyline
                key={clock}
                points={pts}
                fill="none"
                stroke={CLOCK_COLORS[clock]}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                data-testid={`srmt-sweep-line-${clock}`}
              />
            ))}
            <YAxisLabels yMin={yMin} yMax={yMax} />
            <XAxisLabel kind={kind} />
          </svg>
        </div>
      </div>
    )
  }
)
SrmtSweepPlot.displayName = 'SrmtSweepPlot'

interface PhiRefLandmarkTrailProps {
  points: SrmtSweepPoint[]
  toX: (x: number) => number
}

/**
 * For `kind='phiRef'` sweeps: draw a tick at each per-point landmark so
 * the user can see the landmark migrate across the sweep even though the
 * q curves are flat. We place a short vertical tick at the sweep-value
 * x-coordinate, coloured by the clock the landmark belongs to.
 */
const PhiRefLandmarkTrail: React.FC<PhiRefLandmarkTrailProps> = ({ points, toX }) => {
  const ticks: { key: string; x: number; clock: SrmtClock }[] = []
  for (const p of points) {
    const marks = p.perPointLandmarks
    if (!marks) continue
    for (const lm of marks) {
      if (lm.sweepValueAtLandmark === null) continue
      ticks.push({
        key: `${p.index}-${lm.clock}`,
        x: toX(p.sweepValue),
        clock: lm.clock,
      })
    }
  }
  return (
    <>
      {ticks.map(({ key, x, clock }) => (
        <line
          key={key}
          x1={x}
          y1={PAD.top + PLOT_H - 6}
          x2={x}
          y2={PAD.top + PLOT_H}
          stroke={CLOCK_COLORS[clock]}
          strokeWidth={1}
          opacity={0.85}
          data-testid={`srmt-sweep-phiref-landmark-${key}`}
        />
      ))}
    </>
  )
}

interface LandmarkLinesProps {
  landmarks: SrmtSweepLandmark[]
  toX: (x: number) => number
}

const LandmarkLines: React.FC<LandmarkLinesProps> = ({ landmarks, toX }) => (
  <>
    {landmarks.map((landmark) =>
      landmark.sweepValueAtLandmark === null ? null : (
        <line
          key={landmark.clock}
          x1={toX(landmark.sweepValueAtLandmark)}
          y1={PAD.top}
          x2={toX(landmark.sweepValueAtLandmark)}
          y2={PAD.top + PLOT_H}
          stroke={CLOCK_COLORS[landmark.clock]}
          strokeDasharray="2,3"
          strokeWidth={0.7}
          opacity={0.7}
          data-testid={`srmt-sweep-landmark-${landmark.clock}`}
        />
      )
    )}
  </>
)

interface ChampionFlipMarkersProps {
  flips: ReturnType<typeof computeChampionFlips>
  toX: (x: number) => number
}

const ChampionFlipMarkers: React.FC<ChampionFlipMarkersProps> = ({ flips, toX }) => (
  <>
    {flips.map((flip) => (
      <polygon
        key={`flip-${flip.index}`}
        points={`${toX(flip.sweepValue) - 3},${PAD.top + PLOT_H + 2} ${toX(flip.sweepValue) + 3},${PAD.top + PLOT_H + 2} ${toX(flip.sweepValue)},${PAD.top + PLOT_H - 4}`}
        fill={CLOCK_COLORS[flip.newChampion]}
        opacity={0.85}
        data-testid={`srmt-sweep-champion-flip-${flip.index}`}
      />
    ))}
  </>
)

const AxisLines: React.FC = () => (
  <>
    <line
      x1={PAD.left}
      y1={PAD.top}
      x2={PAD.left}
      y2={PAD.top + PLOT_H}
      stroke="var(--text-secondary)"
      strokeWidth={0.5}
    />
    <line
      x1={PAD.left}
      y1={PAD.top + PLOT_H}
      x2={PAD.left + PLOT_W}
      y2={PAD.top + PLOT_H}
      stroke="var(--text-secondary)"
      strokeWidth={0.5}
    />
  </>
)

const YAxisLabels: React.FC<{ yMin: number; yMax: number }> = ({ yMin, yMax }) => (
  <>
    <text
      x={PAD.left - 4}
      y={PAD.top + 3}
      textAnchor="end"
      fill="var(--text-tertiary)"
      fontSize={8}
      fontFamily="monospace"
    >
      {yMax.toExponential(1)}
    </text>
    <text
      x={PAD.left - 4}
      y={PAD.top + PLOT_H}
      textAnchor="end"
      fill="var(--text-tertiary)"
      fontSize={8}
      fontFamily="monospace"
    >
      {yMin.toExponential(1)}
    </text>
  </>
)

const XAxisLabel: React.FC<{ kind: SrmtSweepKind }> = ({ kind }) => (
  <text
    x={PAD.left + PLOT_W / 2}
    y={CHART_H - 4}
    textAnchor="middle"
    fill="var(--text-tertiary)"
    fontSize={8}
    fontFamily="monospace"
  >
    {labelForKind(kind)}
  </text>
)
