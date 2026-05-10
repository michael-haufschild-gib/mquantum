/**
 * Born Rule Measurement Simulation
 *
 * Samples positions from the probability distribution |psi(x)|^2 using
 * inverse CDF sampling. Supports full measurement (all dimensions) and
 * partial measurement (single axis with marginalization). Provides
 * collapsed wavefunction computation for both cases.
 *
 * @module lib/physics/measurement
 */

import { sampleMetricInto } from '@/lib/physics/tdse/metrics/evaluator'
import type { MetricConfig, MetricSample } from '@/lib/physics/tdse/metrics/types'
import {
  computeFullCollapseWasm,
  computePartialCollapseWasm,
  isAnimationWasmReady,
} from '@/lib/wasm'

/** Result of a single measurement. */
export interface MeasurementResult {
  /** Linear grid index of the sampled site (full measurement only) */
  gridIndex: number
  /** N-D world-space position of the measurement */
  position: number[]
  /** Probability density |psi|^2 at the sampled point */
  density: number
}

/** Result of a partial (single-axis) measurement. */
export interface PartialMeasurementResult {
  /** Grid index along the measured axis */
  axisIndex: number
  /** World-space coordinate of the measured axis */
  axisPosition: number
  /** Marginal probability density P(x_d) at the sampled point */
  marginalDensity: number
}

/**
 * Optional sampling configuration for {@link sampleFromDensity}.
 */
export interface DensitySamplingOptions {
  /** Spatial metric. Curved metrics sample Born probabilities using |psi|^2 sqrt(|g|). */
  metric?: MetricConfig | undefined
  /** Simulation time for time-dependent metrics. */
  time?: number | undefined
}

/** Options for metric-aware Gaussian measurement collapse. */
export type CollapseOptions = DensitySamplingOptions

function linearIndexToPosition(
  linearIndex: number,
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number,
  out: number[]
): void {
  let remaining = linearIndex
  for (let d = latticeDim - 1; d >= 0; d--) {
    const size = gridSize[d]!
    const coordInt = remaining % size
    remaining = (remaining - coordInt) / size
    out[d] = (coordInt - size * 0.5 + 0.5) * spacing[d]!
  }
}

function metricVolumeWeight(
  linearIndex: number,
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number,
  options: DensitySamplingOptions | undefined,
  positionScratch: number[],
  metricScratch: MetricSample
): number {
  const metric = options?.metric
  if (!metric || metric.kind === 'flat' || metric.kind === 'torus') return 1
  const time = options?.time ?? 0
  if (!Number.isFinite(time)) {
    throw new Error(`metricVolumeWeight: sampling time must be finite (got ${time})`)
  }

  linearIndexToPosition(linearIndex, gridSize, spacing, latticeDim, positionScratch)
  sampleMetricInto(metric, positionScratch, latticeDim, time, metricScratch)
  return Number.isFinite(metricScratch.sqrtDet) && metricScratch.sqrtDet > 0
    ? metricScratch.sqrtDet
    : 0
}

function usesCurvedMetric(options: DensitySamplingOptions | undefined): boolean {
  const kind = options?.metric?.kind
  return kind !== undefined && kind !== 'flat' && kind !== 'torus'
}

function metricAxisWeightsAt(
  center: readonly number[],
  latticeDim: number,
  options: DensitySamplingOptions | undefined
): number[] | null {
  if (!usesCurvedMetric(options)) return null
  const time = options?.time ?? 0
  if (!Number.isFinite(time)) {
    throw new Error(`metricAxisWeightsAt: collapse time must be finite (got ${time})`)
  }
  const sample: MetricSample = {
    gInverseDiag: new Array<number>(latticeDim),
    sqrtDet: 1,
  }
  sampleMetricInto(options!.metric!, center, latticeDim, time, sample)
  return sample.gInverseDiag
    .slice(0, latticeDim)
    .map((gInv) => (Number.isFinite(gInv) && gInv > 0 ? 1 / gInv : 1))
}

function metricAxisWeightAtPosition(
  position: readonly number[],
  axis: number,
  latticeDim: number,
  options: DensitySamplingOptions | undefined,
  metricScratch: MetricSample
): number {
  if (!usesCurvedMetric(options)) return 1
  const time = options?.time ?? 0
  if (!Number.isFinite(time)) {
    throw new Error(`metricAxisWeightAtPosition: collapse time must be finite (got ${time})`)
  }
  sampleMetricInto(options!.metric!, position, latticeDim, time, metricScratch)
  const gInv = metricScratch.gInverseDiag[axis] ?? 1
  return Number.isFinite(gInv) && gInv > 0 ? 1 / gInv : 1
}

/**
 * Normalize a wavefunction in the same Born measure used for measurement
 * sampling: Σ |ψ|²√|g| for curved metrics, Σ |ψ|² otherwise.
 */
export function normalizeWavefunctionInSamplingMeasure(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  spacing: number[],
  options?: DensitySamplingOptions
): void {
  const latticeDim = gridSize.length
  const totalSites = psiRe.length
  const positionScratch = new Array<number>(latticeDim)
  const metricScratch: MetricSample = {
    gInverseDiag: new Array<number>(latticeDim),
    sqrtDet: 1,
  }
  let norm = 0
  for (let i = 0; i < totalSites; i++) {
    const re = psiRe[i]!
    const im = psiIm[i]!
    const volumeWeight = metricVolumeWeight(
      i,
      gridSize,
      spacing,
      latticeDim,
      options,
      positionScratch,
      metricScratch
    )
    norm += (re * re + im * im) * volumeWeight
  }
  if (!(norm > 0) || !Number.isFinite(norm)) {
    throw new Error('Cannot normalize collapsed wavefunction with zero total probability density')
  }
  const scale = 1 / Math.sqrt(norm)
  for (let i = 0; i < totalSites; i++) {
    psiRe[i] = psiRe[i]! * scale
    psiIm[i] = psiIm[i]! * scale
  }
}

/**
 * Sample a position from the Born probability measure using inverse CDF.
 *
 * Flat space samples |psi(x)|². Curved space samples |psi(x)|²√|g|, the
 * proper-volume probability mass associated with each lattice site.
 * O(N) to build CDF + O(log N) per sample.
 *
 * @param psiRe - Real parts of the wavefunction (Float32Array)
 * @param psiIm - Imaginary parts of the wavefunction (Float32Array)
 * @param gridSize - Per-dimension grid sizes
 * @param spacing - Per-dimension grid spacings
 * @returns Measurement result with position and density
 */
export function sampleFromDensity(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  spacing: number[],
  options?: DensitySamplingOptions
): MeasurementResult {
  const latticeDim = gridSize.length
  const totalSites = psiRe.length
  const positionScratch = new Array<number>(latticeDim)
  const metricScratch: MetricSample = {
    gInverseDiag: new Array<number>(latticeDim),
    sqrtDet: 1,
  }

  // Build CDF: C[i] = sum of |psi|^2 for sites 0..i
  const cdf = new Float64Array(totalSites)
  let cumulative = 0
  for (let i = 0; i < totalSites; i++) {
    const re = psiRe[i]!
    const im = psiIm[i]!
    const density = re * re + im * im
    const volumeWeight = metricVolumeWeight(
      i,
      gridSize,
      spacing,
      latticeDim,
      options,
      positionScratch,
      metricScratch
    )
    cumulative += density * volumeWeight
    cdf[i] = cumulative
  }

  // Draw uniform random in [0, totalProb)
  const totalProb = cdf[totalSites - 1]!
  if (!(totalProb > 0) || !Number.isFinite(totalProb)) {
    throw new Error('Cannot sample from zero total probability density')
  }
  const u = Math.random() * totalProb

  // Binary search for the sampled index
  let lo = 0
  let hi = totalSites - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (cdf[mid]! < u) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  const gridIndex = lo

  // Convert linear index to N-D world position
  const position = new Array<number>(latticeDim)
  linearIndexToPosition(gridIndex, gridSize, spacing, latticeDim, position)

  const reVal = psiRe[gridIndex]!
  const imVal = psiIm[gridIndex]!
  const density = reVal * reVal + imVal * imVal

  return { gridIndex, position, density }
}

/**
 * Sample a coordinate along a single axis from the marginal distribution.
 *
 * Marginalizes the proper Born probability mass over all dimensions except
 * `axis`, producing a 1D probability distribution P(x_axis).
 *
 * @param psiRe - Real parts of the wavefunction
 * @param psiIm - Imaginary parts of the wavefunction
 * @param gridSize - Per-dimension grid sizes
 * @param spacing - Per-dimension grid spacings
 * @param axis - Dimension index to measure (0-based)
 * @returns Partial measurement result with axis coordinate
 */
export function sampleFromMarginalDensity(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  spacing: number[],
  axis: number,
  options?: DensitySamplingOptions
): PartialMeasurementResult {
  const latticeDim = gridSize.length
  const totalSites = psiRe.length
  const axisSize = gridSize[axis]!
  const positionScratch = new Array<number>(latticeDim)
  const metricScratch: MetricSample = {
    gInverseDiag: new Array<number>(latticeDim),
    sqrtDet: 1,
  }

  // Compute marginal distribution: sum |psi|^2 over all dimensions except axis
  const marginal = new Float64Array(axisSize)

  // For each site, extract the axis coordinate and accumulate
  for (let i = 0; i < totalSites; i++) {
    const re = psiRe[i]!
    const im = psiIm[i]!
    const density = re * re + im * im
    const volumeWeight = metricVolumeWeight(
      i,
      gridSize,
      spacing,
      latticeDim,
      options,
      positionScratch,
      metricScratch
    )

    // Extract axis coordinate from linear index
    const axisCoord = extractAxisCoord(i, gridSize, axis, latticeDim)
    marginal[axisCoord] = (marginal[axisCoord] ?? 0) + density * volumeWeight
  }

  // Build CDF of marginal
  const cdf = new Float64Array(axisSize)
  let cumulative = 0
  for (let k = 0; k < axisSize; k++) {
    cumulative += marginal[k]!
    cdf[k] = cumulative
  }

  // Sample from marginal CDF
  const totalProb = cdf[axisSize - 1]!
  if (!(totalProb > 0) || !Number.isFinite(totalProb)) {
    throw new Error('Cannot sample from zero total probability density')
  }
  const u = Math.random() * totalProb

  let lo = 0
  let hi = axisSize - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (cdf[mid]! < u) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  const axisIndex = lo
  const axisPosition = (axisIndex - axisSize * 0.5 + 0.5) * spacing[axis]!

  return {
    axisIndex,
    axisPosition,
    marginalDensity: marginal[axisIndex]!,
  }
}

/**
 * Compute the collapsed wavefunction after a full measurement.
 *
 * Replaces psi with a narrow Gaussian centered at the measurement position:
 *   psi(x) = exp(-|x - x_meas|^2 / (2 * sigma^2))
 *
 * The result is unnormalized; the TDSE renormalization pass handles normalization.
 *
 * @param totalSites - Total number of grid sites
 * @param gridSize - Per-dimension grid sizes
 * @param spacing - Per-dimension grid spacings
 * @param center - World-space measurement position (length = latticeDim)
 * @param sigma - Gaussian width
 * @returns Tuple of [psiRe, psiIm] Float32Arrays
 */
export function computeFullCollapse(
  totalSites: number,
  gridSize: number[],
  spacing: number[],
  center: number[],
  sigma: number,
  compactDims?: boolean[],
  options?: CollapseOptions
): [Float32Array, Float32Array] {
  const latticeDim = gridSize.length
  const metricAxisWeights = metricAxisWeightsAt(center, latticeDim, options)

  if (isAnimationWasmReady() && !metricAxisWeights) {
    const wasmCompact = new Uint8Array(compactDims ? latticeDim : 0)
    if (compactDims) {
      for (let d = 0; d < latticeDim; d++) wasmCompact[d] = compactDims[d] ? 1 : 0
    }
    const wasmResult = computeFullCollapseWasm(
      new Uint32Array(gridSize),
      new Float64Array(spacing),
      new Float64Array(center),
      sigma,
      wasmCompact
    )
    if (wasmResult) return wasmResult
  }

  const psiRe = new Float32Array(totalSites)
  const psiIm = new Float32Array(totalSites)
  const sigma2 = Math.max(sigma * sigma, 1e-8)

  for (let i = 0; i < totalSites; i++) {
    let dist2 = 0
    let remaining = i
    for (let d = latticeDim - 1; d >= 0; d--) {
      const size = gridSize[d]!
      const coordInt = remaining % size
      remaining = (remaining - coordInt) / size
      const pos = (coordInt - size * 0.5 + 0.5) * spacing[d]!
      let delta = pos - center[d]!
      // Wrap to shortest-path distance on compact (periodic) dimensions
      if (compactDims?.[d]) {
        const L = size * spacing[d]!
        delta = delta - L * Math.round(delta / L)
      }
      dist2 += (metricAxisWeights?.[d] ?? 1) * delta * delta
    }
    psiRe[i] = Math.exp(-dist2 / (2 * sigma2))
  }

  return [psiRe, psiIm]
}

/**
 * Compute the collapsed wavefunction after a partial (single-axis) measurement.
 *
 * Multiplies the existing psi by a 1D Gaussian in the measured axis:
 *   psi_post(x) = psi(x) * exp(-(x_d - x_meas)^2 / (2 * sigma^2))
 *
 * This preserves the conditional wavefunction in unmeasured dimensions.
 * The result is unnormalized; the TDSE renormalization pass handles normalization.
 *
 * @param psiRe - Current real parts of the wavefunction
 * @param psiIm - Current imaginary parts of the wavefunction
 * @param gridSize - Per-dimension grid sizes
 * @param spacing - Per-dimension grid spacings
 * @param axis - Measured axis index
 * @param axisPosition - World-space coordinate of the measurement on this axis
 * @param sigma - Gaussian width
 * @returns Tuple of [psiRe, psiIm] Float32Arrays (new arrays)
 */
export function computePartialCollapse(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: number[],
  spacing: number[],
  axis: number,
  axisPosition: number,
  sigma: number,
  axisCompact?: boolean,
  options?: CollapseOptions
): [Float32Array, Float32Array] {
  const latticeDim = gridSize.length
  const totalSites = psiRe.length
  const curvedMetric = usesCurvedMetric(options)

  if (!Number.isInteger(axis) || axis < 0 || axis >= latticeDim) {
    return [new Float32Array(psiRe), new Float32Array(psiIm)]
  }

  if (isAnimationWasmReady() && !curvedMetric) {
    const wasmResult = computePartialCollapseWasm(
      psiRe,
      psiIm,
      new Uint32Array(gridSize),
      new Float64Array(spacing),
      axis,
      axisPosition,
      sigma,
      axisCompact === true
    )
    if (wasmResult) return wasmResult
  }
  const axisSize = gridSize[axis]!
  const axisSpacing = spacing[axis]!
  const sigma2 = Math.max(sigma * sigma, 1e-8)
  const axisL = axisSize * axisSpacing

  // Pre-compute 1D Gaussian envelope for the measured axis
  const envelope = curvedMetric ? null : new Float32Array(axisSize)
  if (envelope) {
    for (let k = 0; k < axisSize; k++) {
      const pos = (k - axisSize * 0.5 + 0.5) * axisSpacing
      let delta = pos - axisPosition
      if (axisCompact) delta = delta - axisL * Math.round(delta / axisL)
      envelope[k] = Math.exp(-(delta * delta) / (2 * sigma2))
    }
  }

  const outRe = new Float32Array(totalSites)
  const outIm = new Float32Array(totalSites)
  const positionScratch = new Array<number>(latticeDim)
  const metricScratch: MetricSample = {
    gInverseDiag: new Array<number>(latticeDim),
    sqrtDet: 1,
  }

  for (let i = 0; i < totalSites; i++) {
    const axisCoord = extractAxisCoord(i, gridSize, axis, latticeDim)
    let g = envelope?.[axisCoord]
    if (g === undefined) {
      linearIndexToPosition(i, gridSize, spacing, latticeDim, positionScratch)
      const pos = positionScratch[axis]!
      let delta = pos - axisPosition
      if (axisCompact) delta = delta - axisL * Math.round(delta / axisL)
      // Partial measurement retains the unmeasured coordinates. For curved
      // diagonal metrics, evaluate the measured-axis proper-distance scale on
      // that retained transverse slice and at the measured coordinate.
      positionScratch[axis] = axisPosition
      const axisMetricWeight = metricAxisWeightAtPosition(
        positionScratch,
        axis,
        latticeDim,
        options,
        metricScratch
      )
      g = Math.exp(-(axisMetricWeight * delta * delta) / (2 * sigma2))
    }
    outRe[i] = psiRe[i]! * g
    outIm[i] = psiIm[i]! * g
  }

  return [outRe, outIm]
}

/**
 * Extract the coordinate along a specific axis from a linear index.
 *
 * Uses C-order (last axis fastest) decomposition.
 *
 * @param linearIndex - Linear buffer index
 * @param gridSize - Per-dimension grid sizes
 * @param axis - Target axis
 * @param latticeDim - Total number of dimensions
 * @returns Integer coordinate along the target axis
 */
export function extractAxisCoord(
  linearIndex: number,
  gridSize: number[],
  axis: number,
  latticeDim: number
): number {
  let remaining = linearIndex
  for (let d = latticeDim - 1; d > axis; d--) {
    remaining = Math.floor(remaining / gridSize[d]!)
  }
  return remaining % gridSize[axis]!
}
