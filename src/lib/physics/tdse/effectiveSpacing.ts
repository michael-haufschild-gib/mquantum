/**
 * TDSE lattice-spacing helpers.
 *
 * The split-step and flat Fourier diagnostics derive momenta from the effective
 * lattice extent N * dx. For torus metrics, the metric period is the physical
 * period, so every host-side TDSE path must use dx = L / N.
 */

import { computeEffectiveSpacing } from '@/lib/physics/compactification'
import {
  MAX_TORUS_PERIOD,
  type MetricConfig,
  MIN_TORUS_PERIOD,
} from '@/lib/physics/tdse/metrics/types'

function clampFinite(value: number | undefined, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value!))
}

/**
 *
 */
export interface TdseSpacingConfig {
  gridSize: number[]
  spacing: number[]
  latticeDim: number
  compactDims?: boolean[]
  compactRadii?: number[]
  metric?: MetricConfig
}

/**
 *
 */
export function applyTorusMetricSpacing(
  spacing: number[],
  gridSize: number[],
  latticeDim: number,
  metric?: MetricConfig
): number[] {
  if (metric?.kind !== 'torus' || metric.torusPeriod?.length !== 3) return spacing

  const result = spacing.slice()
  const overrideDims = Math.min(latticeDim, 3)
  for (let d = 0; d < overrideDims; d++) {
    const n = gridSize[d]
    if (!Number.isFinite(n) || n! <= 0) continue
    const period = clampFinite(metric.torusPeriod[d], MIN_TORUS_PERIOD, MAX_TORUS_PERIOD)
    result[d] = period / n!
  }
  return result
}

/**
 *
 */
export function computeTdseEffectiveSpacing(config: TdseSpacingConfig): number[] {
  const spacing = computeEffectiveSpacing(
    config.gridSize,
    config.spacing,
    config.compactDims,
    config.compactRadii,
    config.latticeDim
  )
  return applyTorusMetricSpacing(spacing, config.gridSize, config.latticeDim, config.metric)
}
