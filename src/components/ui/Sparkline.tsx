/**
 * Sparkline Component
 *
 * Minimal SVG sparkline that renders a Float32Array ring buffer as a polyline.
 * Designed for real-time metric history visualization (e.g., quantum diagnostics).
 *
 * @module components/ui/Sparkline
 */

import React, { useId, useMemo } from 'react'

/**
 * Props for the Sparkline component
 */
export interface SparklineProps {
  /** Ring buffer data (Float32Array of fixed length) */
  data: Float32Array
  /** Current write head position in the ring buffer */
  head: number
  /** Number of valid entries written so far (up to data.length) */
  count: number
  /** Minimum Y-axis value (auto-scaled from data if omitted) */
  min?: number
  /** Maximum Y-axis value (auto-scaled from data if omitted) */
  max?: number
  /** SVG height in pixels @default 32 */
  height?: number
  /** Additional CSS class names */
  className?: string
  /** Optional horizontal reference line value (e.g., theoretical bound) */
  referenceLine?: number
  /** Label for the reference line @default "" */
  referenceLabel?: string
}

interface SparklineBounds {
  lo: number
  hi: number
}

interface SparklineGeometry {
  polyline: string
  fillPath: string
  refLineY: number | null
  lo: number
  hi: number
}

const VIEW_WIDTH = 200
const VIEW_HEIGHT = 50
const PADDING = 2

/** Ensures bounds span a non-zero range and include the reference line. */
function normalizeBounds(lo: number, hi: number, referenceLine?: number): SparklineBounds {
  if (referenceLine != null) {
    if (referenceLine < lo) lo = referenceLine
    if (referenceLine > hi) hi = referenceLine
  }
  if (hi - lo < 1e-10) {
    lo -= 0.5
    hi += 0.5
  }
  return { lo, hi }
}

/** Computes the Y-axis SVG coordinate for a value within the given bounds. */
function valueToY(value: number, lo: number, hi: number, usableHeight: number): number {
  return PADDING + usableHeight - ((value - lo) / (hi - lo)) * usableHeight
}

/** Reads the ring buffer in chronological order (oldest first). */
function readRingBuffer(data: Float32Array, head: number, count: number): Float32Array {
  const len = data.length
  const n = Math.min(count, len)
  const values = new Float32Array(n)
  const startIdx = count >= len ? head : 0
  for (let i = 0; i < n; i++) {
    values[i] = data[(startIdx + i) % len]!
  }
  return values
}

/** Computes auto-scaled Y-axis bounds from the data, merging with explicit min/max props. */
function computeBoundsFromData(
  values: Float32Array,
  minProp: number | undefined,
  maxProp: number | undefined
): SparklineBounds {
  let lo = minProp ?? Infinity
  let hi = maxProp ?? -Infinity
  if (lo === Infinity || hi === -Infinity) {
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  return { lo, hi }
}

/** Builds SVG polyline points and a closed fill path from the ordered values. */
function buildPaths(
  values: Float32Array,
  lo: number,
  hi: number
): { polyline: string; fillPath: string } {
  const n = values.length
  const usableWidth = VIEW_WIDTH - PADDING * 2
  const usableHeight = VIEW_HEIGHT - PADDING * 2

  const pts: string[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const x = PADDING + (i / (n - 1)) * usableWidth
    const y = valueToY(values[i]!, lo, hi, usableHeight)
    pts[i] = `${x.toFixed(1)},${y.toFixed(1)}`
  }

  const polyline = pts.join(' ')
  const fillPath =
    `M ${pts[0]} ` +
    pts
      .slice(1)
      .map((p) => `L ${p}`)
      .join(' ') +
    ` L ${(PADDING + usableWidth).toFixed(1)},${(PADDING + usableHeight).toFixed(1)}` +
    ` L ${PADDING.toFixed(1)},${(PADDING + usableHeight).toFixed(1)} Z`

  return { polyline, fillPath }
}

/** Computes all sparkline geometry from ring-buffer data. */
function computeSparklineGeometry(
  data: Float32Array,
  head: number,
  count: number,
  minProp: number | undefined,
  maxProp: number | undefined,
  referenceLine: number | undefined
): SparklineGeometry {
  const usableHeight = VIEW_HEIGHT - PADDING * 2

  if (count < 2) {
    if (referenceLine == null) {
      return { polyline: '', fillPath: '', refLineY: null, lo: 0, hi: 1 }
    }
    const { lo, hi } = normalizeBounds(minProp ?? 0, maxProp ?? 1, referenceLine)
    const refY = valueToY(referenceLine, lo, hi, usableHeight)
    return { polyline: '', fillPath: '', refLineY: refY, lo, hi }
  }

  const values = readRingBuffer(data, head, count)
  const rawBounds = computeBoundsFromData(values, minProp, maxProp)
  const { lo, hi } = normalizeBounds(rawBounds.lo, rawBounds.hi, referenceLine)
  const { polyline, fillPath } = buildPaths(values, lo, hi)

  const refLineY = referenceLine != null ? valueToY(referenceLine, lo, hi, usableHeight) : null

  return { polyline, fillPath, refLineY, lo, hi }
}

/**
 * Renders a Float32Array ring buffer as a smooth SVG polyline sparkline.
 *
 * Reads the ring buffer in chronological order (oldest to newest) and maps
 * values to SVG coordinates. Includes a gradient fill below the line.
 * Optionally renders a dashed horizontal reference line.
 *
 * @param props - Sparkline configuration
 * @returns SVG sparkline element, or empty SVG when count < 2
 *
 * @example
 * ```tsx
 * <Sparkline
 *   data={historyPurity}
 *   head={historyHead}
 *   count={historyCount}
 *   min={0}
 *   max={1}
 *   height={32}
 *   referenceLine={0.5}
 *   referenceLabel="ℏ/2"
 * />
 * ```
 */
export const Sparkline: React.FC<SparklineProps> = React.memo(
  ({
    data,
    head,
    count,
    min: minProp,
    max: maxProp,
    height = 32,
    className = '',
    referenceLine,
    referenceLabel,
  }) => {
    const id = useId()
    const gradientId = `sparkline-fill-${id}`

    const { polyline, fillPath, refLineY, lo, hi } = useMemo(
      () => computeSparklineGeometry(data, head, count, minProp, maxProp, referenceLine),
      [data, head, count, minProp, maxProp, referenceLine]
    )

    return (
      <svg
        className={className}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label="Sparkline chart"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {count >= 2 && (
          <>
            <path data-testid="sparkline-fill" d={fillPath} fill={`url(#${gradientId})`} />
            <polyline
              data-testid="sparkline-line"
              points={polyline}
              fill="none"
              stroke="var(--theme-accent)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {refLineY != null && lo !== hi && (
          <>
            <line
              data-testid="sparkline-reference"
              x1={PADDING}
              y1={refLineY}
              x2={VIEW_WIDTH - PADDING}
              y2={refLineY}
              stroke="var(--color-warning)"
              strokeWidth="1"
              strokeDasharray="4,3"
              vectorEffect="non-scaling-stroke"
              opacity={0.7}
            />
            {referenceLabel && (
              <text
                x={VIEW_WIDTH - PADDING - 2}
                y={refLineY - 2}
                textAnchor="end"
                fill="var(--color-warning)"
                fontSize="8"
                fontFamily="monospace"
                opacity={0.8}
              >
                {referenceLabel}
              </text>
            )}
          </>
        )}
      </svg>
    )
  }
)

Sparkline.displayName = 'Sparkline'
