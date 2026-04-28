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
 * Inputs for TDSE effective spacing computation. `gridSize` and `spacing`
 * carry one entry per render axis (length must agree with `latticeDim`,
 * which is clamped to `[0, 3]` by the consumer). `compactDims`/`compactRadii`
 * are parallel arrays describing per-axis compactification (length-matched
 * with `gridSize`); when omitted the axis is treated as non-compact.
 * `metric.kind === 'torus'` overrides `spacing[d] = torusPeriod[d] / N_d`
 * on the first three axes.
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
 * Override `spacing[d]` with `torusPeriod[d] / N_d` for the first three
 * lattice axes when `metric.kind === 'torus'`. The torus period is clamped
 * to `[MIN_TORUS_PERIOD, MAX_TORUS_PERIOD]`. Non-torus metrics return the
 * input spacing unchanged. Axes with non-finite or non-positive `gridSize`
 * are skipped.
 */
export function applyTorusMetricSpacing(
  spacing: number[],
  gridSize: number[],
  latticeDim: number,
  metric?: MetricConfig
): number[] {
  if (metric?.kind !== 'torus' || metric.torusPeriod?.length !== 3) return spacing

  const result = spacing.slice()
  const overrideDims = Math.max(0, Math.min(3, Math.floor(latticeDim)))
  for (let d = 0; d < overrideDims; d++) {
    const n = gridSize[d]
    if (!Number.isFinite(n) || n! <= 0) continue
    const period = clampFinite(metric.torusPeriod[d], MIN_TORUS_PERIOD, MAX_TORUS_PERIOD)
    result[d] = period / n!
  }
  return result
}

/**
 * Compute effective lattice spacings for the TDSE host pipeline.
 *
 * Pipeline: first apply `computeEffectiveSpacing` (compactification), then
 * `applyTorusMetricSpacing` (torus-period override on the first three
 * axes when the metric is a torus). Returns one spacing per axis.
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
