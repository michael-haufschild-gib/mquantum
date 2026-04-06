/**
 * Shared presentational primitives for analysis section content.
 *
 * Used across FSF, TDSE, BEC, Dirac, and Open Quantum analysis panels
 * for consistent metric and sparkline display.
 *
 * @module components/sections/Analysis/AnalysisPrimitives
 */

import React from 'react'

import { Sparkline } from '@/components/ui/Sparkline'

/**
 * Compact metric row showing a label and formatted numeric value.
 *
 * @param label - Metric name
 * @param value - Numeric value to display
 * @param digits - Decimal places (default 4)
 * @param unit - Optional unit suffix
 */
export const MetricRow: React.FC<{
  label: string
  value: number
  digits?: number
  unit?: string
}> = ({ label, value, digits = 4, unit = '' }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-xs text-text-tertiary">{label}</span>
    <span className="text-xs font-mono text-text-secondary tabular-nums">
      {isFinite(value) ? value.toFixed(digits) : 'NaN'}
      {unit && <span className="text-text-tertiary ms-0.5">{unit}</span>}
    </span>
  </div>
)

/**
 * Labeled sparkline row for a single metric history (ring buffer).
 *
 * @param label - Metric name shown above the sparkline
 * @param data - Ring buffer Float32Array
 * @param head - Current write position in the ring buffer
 * @param count - Number of valid samples
 * @param min - Optional fixed minimum for Y axis
 * @param max - Optional fixed maximum for Y axis
 * @param sparklineClassName - Optional className passed to the Sparkline
 */
export const SparklineRow: React.FC<{
  label: string
  data: Float32Array
  head: number
  count: number
  min?: number
  max?: number
  sparklineClassName?: string
}> = ({ label, data, head, count, min, max, sparklineClassName = 'w-full' }) => (
  <div>
    <span className="text-xs text-text-tertiary uppercase tracking-wider">{label}</span>
    <Sparkline
      data={data}
      head={head}
      count={count}
      min={min}
      max={max}
      height={28}
      className={sparklineClassName}
    />
  </div>
)
