/**
 * Quantumness Atlas Visualization Sub-Components
 *
 * SVG-based visualizations for the quantumness atlas sweep results:
 * erosion curves (diagnostics vs γ), cross-diagnostic scatter (S̄ vs N̄_W),
 * λ×N heatmaps per diagnostic, and dimension comparison.
 *
 * Extracted from QuantumnessAtlasSection to keep file size under lint limit.
 *
 * @module components/sections/Analysis/QuantumnessAtlasVisualizations
 */

import React from 'react'

import type { AtlasPoint } from '@/stores/quantumnessAtlasStore'

// ─── SVG constants ───────────────────────────────────────────────────────────

const CHART_W = 260
const CHART_H = 100
const PAD = { left: 32, right: 8, top: 8, bottom: 20 }
const PW = CHART_W - PAD.left - PAD.right
const PH = CHART_H - PAD.top - PAD.bottom

/** Diagnostic line/dot colors, keyed to CSS chart variables. */
export const DIAG_COLORS = {
  entanglement: 'var(--chart-pass-2)', // blue
  wigner: 'var(--chart-pass-3)', // orange
  ipr: 'var(--chart-pass-1)', // green
} as const

const DIM_COLORS = [
  'var(--chart-pass-2)', // 3D - blue
  'var(--chart-pass-3)', // 4D - orange
  'var(--chart-pass-1)', // 5D - green
  'var(--chart-pass-4)', // 7D - pink
  'var(--chart-pass-7)', // other - red
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract unique sorted values. */
function uniqueSorted(arr: number[]): number[] {
  return [...new Set(arr)].sort((a, b) => a - b)
}

/** Normalize a value to [0, 1] given a max. */
function norm(v: number, max: number): number {
  return max > 0 ? Math.min(v / max, 1) : 0
}

/** NaN/Infinity-safe max — returns floor when all values are non-finite. */
const finiteMax = (vals: number[], floor = 1e-10) =>
  vals.reduce((m, v) => (Number.isFinite(v) && v > m ? v : m), floor)

/** Get a dimension-specific color. */
function dimColor(dim: number, dims: number[]): string {
  const idx = dims.indexOf(dim)
  return DIM_COLORS[idx >= 0 ? idx : DIM_COLORS.length - 1]!
}

// ─── Shared Three-Diagnostic Line Chart ─────────────────────────────────────

/** Common shape for data points with three diagnostic values. */
interface DiagPoint {
  entanglement: number
  wigner: number
  ipr: number
}

/** Shared SVG chart rendering three normalized diagnostic curves with dots. */
function ThreeDiagChart<T extends DiagPoint>({
  data,
  xAccessor,
  xLabel,
  formatTick,
}: {
  data: T[]
  xAccessor: (d: T) => number
  xLabel: string
  formatTick: (v: number) => string
}): React.ReactElement {
  const xs = data.map(xAccessor)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const xRange = xMax - xMin || 1

  const maxE = finiteMax(data.map((d) => d.entanglement))
  const maxW = finiteMax(data.map((d) => d.wigner))
  const maxI = finiteMax(data.map((d) => d.ipr))

  const xOf = (v: number) => PAD.left + ((v - xMin) / xRange) * PW
  const yOf = (v: number) => PAD.top + (1 - v) * PH

  const sorted = [...data].sort((a, b) => xAccessor(a) - xAccessor(b))
  const polyline = (key: 'entanglement' | 'wigner' | 'ipr', maxVal: number) =>
    sorted
      .filter((d) => Number.isFinite(d[key]))
      .map((d) => `${xOf(xAccessor(d))},${yOf(norm(d[key], maxVal))}`)
      .join(' ')

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="block"
      data-testid="three-diag-chart"
    >
      <line
        x1={PAD.left}
        y1={PAD.top + PH}
        x2={PAD.left + PW}
        y2={PAD.top + PH}
        stroke="var(--text-tertiary)"
        strokeWidth={0.5}
      />
      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={PAD.top + PH}
        stroke="var(--text-tertiary)"
        strokeWidth={0.5}
      />
      <text
        x={PAD.left - 2}
        y={PAD.top + 3}
        fontSize={7}
        fill="var(--text-tertiary)"
        textAnchor="end"
      >
        1
      </text>
      <text
        x={PAD.left - 2}
        y={PAD.top + PH + 1}
        fontSize={7}
        fill="var(--text-tertiary)"
        textAnchor="end"
      >
        0
      </text>
      <text
        x={PAD.left + PW / 2}
        y={CHART_H - 2}
        fontSize={7}
        fill="var(--text-tertiary)"
        textAnchor="middle"
      >
        {xLabel}
      </text>
      {data.map((d, i) => (
        <text
          key={i}
          x={xOf(xAccessor(d))}
          y={PAD.top + PH + 10}
          fontSize={6}
          fill="var(--text-tertiary)"
          textAnchor="middle"
        >
          {formatTick(xAccessor(d))}
        </text>
      ))}
      <polyline
        points={polyline('entanglement', maxE)}
        fill="none"
        stroke={DIAG_COLORS.entanglement}
        strokeWidth={1.5}
        data-testid="diag-polyline"
      />
      <polyline
        points={polyline('wigner', maxW)}
        fill="none"
        stroke={DIAG_COLORS.wigner}
        strokeWidth={1.5}
        data-testid="diag-polyline"
      />
      <polyline
        points={polyline('ipr', maxI)}
        fill="none"
        stroke={DIAG_COLORS.ipr}
        strokeWidth={1.5}
        data-testid="diag-polyline"
      />
      {data.map((d, i) => (
        <React.Fragment key={i}>
          <circle
            cx={xOf(xAccessor(d))}
            cy={yOf(norm(d.entanglement, maxE))}
            r={2}
            fill={DIAG_COLORS.entanglement}
          />
          <circle
            cx={xOf(xAccessor(d))}
            cy={yOf(norm(d.wigner, maxW))}
            r={2}
            fill={DIAG_COLORS.wigner}
          />
          <circle cx={xOf(xAccessor(d))} cy={yOf(norm(d.ipr, maxI))} r={2} fill={DIAG_COLORS.ipr} />
        </React.Fragment>
      ))}
    </svg>
  )
}

// ─── Erosion Curves ──────────────────────────────────────────────────────────

/** Data for a single point on an erosion curve. */
export interface ErosionCurveData {
  gamma: number
  entanglement: number
  wigner: number
  ipr: number
}

const fmtGamma = (v: number): string => (v < 1 ? v.toFixed(1) : v.toFixed(0))

/** SVG overlay of three diagnostic curves vs γ at fixed (λ, N). */
export const ErosionCurves: React.FC<{ data: ErosionCurveData[] }> = React.memo(({ data }) => {
  if (data.length < 2) {
    return <p className="text-xs text-text-tertiary italic">Need ≥ 2 γ points for curves</p>
  }
  return <ThreeDiagChart data={data} xAccessor={(d) => d.gamma} xLabel="γ" formatTick={fmtGamma} />
})
ErosionCurves.displayName = 'ErosionCurves'

// ─── Scatter Plot ────────────────────────────────────────────────────────────

/** SVG scatter of S̄ vs N̄_W, colored by dimension. */
export const DiagnosticScatter: React.FC<{ results: AtlasPoint[] }> = React.memo(({ results }) => {
  if (results.length === 0) return null

  const maxE = finiteMax(results.map((r) => r.avgNormalizedEntropy))
  const maxW = finiteMax(results.map((r) => r.avgWignerNegativity))
  const dims = uniqueSorted(results.map((r) => r.dim))

  const xOf = (e: number) => PAD.left + norm(e, maxE) * PW
  const yOf = (w: number) => PAD.top + (1 - norm(w, maxW)) * PH

  return (
    <div>
      <div className="flex items-center gap-2 mb-0.5">
        {dims.map((d) => (
          <span key={d} className="text-[9px]" style={{ color: dimColor(d, dims) }}>
            ● {d}D
          </span>
        ))}
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="block"
        data-testid="diagnostic-scatter"
      >
        <line
          x1={PAD.left}
          y1={PAD.top + PH}
          x2={PAD.left + PW}
          y2={PAD.top + PH}
          stroke="var(--text-tertiary)"
          strokeWidth={0.5}
        />
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + PH}
          stroke="var(--text-tertiary)"
          strokeWidth={0.5}
        />
        <text
          x={PAD.left + PW / 2}
          y={CHART_H - 2}
          fontSize={7}
          fill="var(--text-tertiary)"
          textAnchor="middle"
        >
          S̄/log M (norm. entropy)
        </text>
        <text
          x={4}
          y={PAD.top + PH / 2}
          fontSize={7}
          fill="var(--text-tertiary)"
          textAnchor="middle"
          transform={`rotate(-90, 4, ${PAD.top + PH / 2})`}
        >
          N̄_W
        </text>
        {results.map((r, i) => (
          <circle
            key={i}
            cx={xOf(r.avgNormalizedEntropy)}
            cy={yOf(r.avgWignerNegativity)}
            r={2.5}
            fill={dimColor(r.dim, dims)}
            opacity={0.7}
            data-testid="diagnostic-scatter-point"
          />
        ))}
        <line
          x1={PAD.left}
          y1={PAD.top + PH}
          x2={PAD.left + PW}
          y2={PAD.top}
          stroke="var(--text-tertiary)"
          strokeWidth={0.3}
          strokeDasharray="4 2"
        />
      </svg>
    </div>
  )
})
DiagnosticScatter.displayName = 'DiagnosticScatter'

// ─── Heatmap ─────────────────────────────────────────────────────────────────

const HM_SIZE = 80
const HM_PAD = { left: 20, right: 4, top: 4, bottom: 14 }
const HM_PW = HM_SIZE - HM_PAD.left - HM_PAD.right
const HM_PH = HM_SIZE - HM_PAD.top - HM_PAD.bottom

/** Single diagnostic heatmap: λ × N at fixed γ. */
const DiagHeatmap: React.FC<{
  results: AtlasPoint[]
  accessor: (p: AtlasPoint) => number
  label: string
  color: string
}> = React.memo(({ results, accessor, label, color }) => {
  if (results.length === 0) return null

  const lambdas = uniqueSorted(results.map((r) => r.lambda))
  const dims = uniqueSorted(results.map((r) => r.dim))
  const maxVal = finiteMax(results.map(accessor))

  const cellW = HM_PW / lambdas.length
  const cellH = HM_PH / dims.length

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] text-center mb-0.5" style={{ color }}>
        {label}
      </p>
      <svg width="100%" viewBox={`0 0 ${HM_SIZE} ${HM_SIZE}`} className="block">
        {results.map((r) => {
          const li = lambdas.indexOf(r.lambda)
          const di = dims.indexOf(r.dim)
          const val = accessor(r)
          if (li < 0 || di < 0 || !Number.isFinite(val)) return null
          const frac = norm(val, maxVal)
          return (
            <rect
              key={`${r.lambda}-${r.dim}`}
              x={HM_PAD.left + li * cellW}
              y={HM_PAD.top + di * cellH}
              width={Math.max(cellW - 0.5, 1)}
              height={Math.max(cellH - 0.5, 1)}
              fill={color}
              opacity={0.15 + 0.85 * frac}
            />
          )
        })}
        {dims.map((d, i) => (
          <text
            key={d}
            x={HM_PAD.left - 2}
            y={HM_PAD.top + (i + 0.5) * cellH + 2}
            fontSize={6}
            fill="var(--text-tertiary)"
            textAnchor="end"
          >
            {d}D
          </text>
        ))}
        <text
          x={HM_PAD.left + HM_PW / 2}
          y={HM_SIZE - 2}
          fontSize={6}
          fill="var(--text-tertiary)"
          textAnchor="middle"
        >
          λ
        </text>
      </svg>
    </div>
  )
})
DiagHeatmap.displayName = 'DiagHeatmap'

/** Three side-by-side heatmaps at a fixed γ. */
export const TripleHeatmap: React.FC<{ results: AtlasPoint[]; gamma: number }> = React.memo(
  ({ results, gamma }) => {
    const filtered = results.filter((r) => r.gamma === gamma)
    if (filtered.length === 0)
      return <p className="text-xs text-text-tertiary italic">No data at γ = {gamma}</p>

    return (
      <div className="flex gap-1">
        <DiagHeatmap
          results={filtered}
          accessor={(p) => p.avgNormalizedEntropy}
          label="S̄/logM"
          color={DIAG_COLORS.entanglement}
        />
        <DiagHeatmap
          results={filtered}
          accessor={(p) => p.avgWignerNegativity}
          label="N̄_W"
          color={DIAG_COLORS.wigner}
        />
        <DiagHeatmap
          results={filtered}
          accessor={(p) => p.avgIPR}
          label="IPR"
          color={DIAG_COLORS.ipr}
        />
      </div>
    )
  }
)
TripleHeatmap.displayName = 'TripleHeatmap'

// ─── Dimension Comparison ────────────────────────────────────────────────────

/** Data for a single point on a dimension comparison curve. */
export interface DimCompareData {
  dim: number
  entanglement: number
  wigner: number
  ipr: number
}

/** Three diagnostic values vs dimension N at fixed (λ, γ). */
export const DimensionComparison: React.FC<{ data: DimCompareData[] }> = React.memo(({ data }) => {
  if (data.length < 2) {
    return <p className="text-xs text-text-tertiary italic">Need ≥ 2 dimensions for comparison</p>
  }
  return (
    <ThreeDiagChart
      data={data}
      xAccessor={(d) => d.dim}
      xLabel="dimension N"
      formatTick={(v) => String(v)}
    />
  )
})
DimensionComparison.displayName = 'DimensionComparison'
