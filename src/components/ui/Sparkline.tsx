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
}

/**
 * Renders a Float32Array ring buffer as a smooth SVG polyline sparkline.
 *
 * Reads the ring buffer in chronological order (oldest to newest) and maps
 * values to SVG coordinates. Includes a gradient fill below the line.
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
 * />
 * ```
 */
export const Sparkline: React.FC<SparklineProps> = React.memo(
  ({ data, head, count, min: minProp, max: maxProp, height = 32, className = '' }) => {
    const id = useId()
    const gradientId = `sparkline-fill-${id}`

    const viewWidth = 200
    const viewHeight = 50
    const padding = 2

    const { polyline, fillPath } = useMemo(() => {
      if (count < 2) return { polyline: '', fillPath: '' }

      const len = data.length
      const n = Math.min(count, len)

      // Read ring buffer in chronological order (oldest first)
      const values = new Float32Array(n)
      const startIdx = count >= len ? head : 0
      for (let i = 0; i < n; i++) {
        values[i] = data[(startIdx + i) % len]!
      }

      // Compute Y-axis bounds
      let lo = minProp ?? Infinity
      let hi = maxProp ?? -Infinity
      if (lo === Infinity || hi === -Infinity) {
        for (let i = 0; i < n; i++) {
          const v = values[i]!
          if (lo === Infinity || v < lo) lo = v
          if (hi === -Infinity || v > hi) hi = v
        }
      }
      // Avoid division by zero when all values are equal
      if (hi - lo < 1e-10) {
        lo -= 0.5
        hi += 0.5
      }

      const usableWidth = viewWidth - padding * 2
      const usableHeight = viewHeight - padding * 2

      const pts: string[] = new Array(n)
      for (let i = 0; i < n; i++) {
        const x = padding + (i / (n - 1)) * usableWidth
        const val = values[i]!
        const y = padding + usableHeight - ((val - lo) / (hi - lo)) * usableHeight
        pts[i] = `${x.toFixed(1)},${y.toFixed(1)}`
      }

      const line = pts.join(' ')
      // Closed fill path: line points → bottom-right → bottom-left
      const fill =
        `M ${pts[0]} ` +
        pts.slice(1).map((p) => `L ${p}`).join(' ') +
        ` L ${(padding + usableWidth).toFixed(1)},${(padding + usableHeight).toFixed(1)}` +
        ` L ${padding.toFixed(1)},${(padding + usableHeight).toFixed(1)} Z`

      return { polyline: line, fillPath: fill }
    }, [data, head, count, minProp, maxProp])

    return (
      <svg
        className={className}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
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
            <path d={fillPath} fill={`url(#${gradientId})`} />
            <polyline
              points={polyline}
              fill="none"
              stroke="var(--theme-accent)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
    )
  }
)

Sparkline.displayName = 'Sparkline'
