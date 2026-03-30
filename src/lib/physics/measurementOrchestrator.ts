/**
 * Measurement Orchestrator
 *
 * Coordinates the full Born rule measurement pipeline:
 * readback wavefunction from GPU -> sample from |psi|^2 -> compute collapsed
 * state -> inject back into TDSE compute pass -> record measurement.
 *
 * Supports both full measurement (sample all dimensions) and partial
 * measurement (sample one axis, preserve conditional wavefunction in others).
 *
 * @module lib/physics/measurementOrchestrator
 */

import { logger } from '@/lib/logger'

import {
  computeFullCollapse,
  computePartialCollapse,
  sampleFromDensity,
  sampleFromMarginalDensity,
} from './measurement'

/** Grid configuration needed for measurement sampling and collapse. */
export interface MeasurementGridConfig {
  /** Number of spatial dimensions */
  latticeDim: number
  /** Grid points per dimension */
  gridSize: number[]
  /** Grid spacing per dimension (effective, already KK-adjusted) */
  spacing: number[]
  /** Per-dimension compact flag for periodic distance wrapping */
  compactDims?: boolean[]
}

/** Callback to inject the collapsed wavefunction back into the compute pass. */
export type InjectWavefunctionFn = (re: Float32Array, im: Float32Array) => void

/** Callback to record the measurement result in the store. */
export type RecordMeasurementFn = (
  position: number[],
  density: number,
  measuredAxis: number | null
) => void

/**
 * Execute a full measurement: sample from |psi|^2 over all dimensions,
 * collapse to a Gaussian centered at the sampled point.
 *
 * @param psiRe - Readback real wavefunction data
 * @param psiIm - Readback imaginary wavefunction data
 * @param config - Grid configuration
 * @param collapseWidth - Gaussian sigma for collapse
 * @param inject - Callback to inject collapsed state
 * @param record - Callback to record measurement
 */
export function executeFullMeasurement(
  psiRe: Float32Array,
  psiIm: Float32Array,
  config: MeasurementGridConfig,
  collapseWidth: number,
  inject: InjectWavefunctionFn,
  record: RecordMeasurementFn
): void {
  const { gridSize, spacing, compactDims } = config
  const result = sampleFromDensity(psiRe, psiIm, gridSize, spacing)

  logger.log(
    `[Measurement] Full: pos=[${result.position.map((p) => p.toFixed(3)).join(', ')}] density=${result.density.toExponential(3)}`
  )

  const [collapsedRe, collapsedIm] = computeFullCollapse(
    psiRe.length,
    gridSize,
    spacing,
    result.position,
    collapseWidth,
    compactDims
  )

  inject(collapsedRe, collapsedIm)
  record(result.position, result.density, null)
}

/**
 * Execute a partial measurement: sample one axis from its marginal distribution,
 * collapse by multiplying psi by a 1D Gaussian in that axis.
 *
 * @param psiRe - Readback real wavefunction data
 * @param psiIm - Readback imaginary wavefunction data
 * @param config - Grid configuration
 * @param axis - Axis index to measure
 * @param collapseWidth - Gaussian sigma for collapse
 * @param inject - Callback to inject collapsed state
 * @param record - Callback to record measurement
 */
export function executePartialMeasurement(
  psiRe: Float32Array,
  psiIm: Float32Array,
  config: MeasurementGridConfig,
  axis: number,
  collapseWidth: number,
  inject: InjectWavefunctionFn,
  record: RecordMeasurementFn
): void {
  const { gridSize, spacing, latticeDim, compactDims } = config
  const result = sampleFromMarginalDensity(psiRe, psiIm, gridSize, spacing, axis)

  // Build full N-D position with the measured axis filled in, others set to 0
  const position = new Array<number>(latticeDim).fill(0)
  position[axis] = result.axisPosition

  logger.log(
    `[Measurement] Partial axis=${axis}: pos=${result.axisPosition.toFixed(3)} marginal=${result.marginalDensity.toExponential(3)}`
  )

  const [collapsedRe, collapsedIm] = computePartialCollapse(
    psiRe,
    psiIm,
    gridSize,
    spacing,
    axis,
    result.axisPosition,
    collapseWidth,
    compactDims?.[axis]
  )

  inject(collapsedRe, collapsedIm)
  record(position, result.marginalDensity, axis)
}
