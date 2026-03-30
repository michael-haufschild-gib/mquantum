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
 * Sample a position from |psi(x)|^2 using inverse CDF (binary search).
 *
 * Builds the cumulative distribution function from the wavefunction,
 * draws a uniform random number, and binary-searches for the grid site.
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
  spacing: number[]
): MeasurementResult {
  const latticeDim = gridSize.length
  const totalSites = psiRe.length

  // Build CDF: C[i] = sum of |psi|^2 for sites 0..i
  const cdf = new Float64Array(totalSites)
  let cumulative = 0
  for (let i = 0; i < totalSites; i++) {
    const re = psiRe[i]!
    const im = psiIm[i]!
    cumulative += re * re + im * im
    cdf[i] = cumulative
  }

  // Draw uniform random in [0, totalProb)
  const totalProb = cdf[totalSites - 1]!
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
  let remaining = gridIndex
  for (let d = latticeDim - 1; d >= 0; d--) {
    const size = gridSize[d]!
    const coordInt = remaining % size
    remaining = (remaining - coordInt) / size
    position[d] = (coordInt - size * 0.5 + 0.5) * spacing[d]!
  }

  const reVal = psiRe[gridIndex]!
  const imVal = psiIm[gridIndex]!
  const density = reVal * reVal + imVal * imVal

  return { gridIndex, position, density }
}

/**
 * Sample a coordinate along a single axis from the marginal distribution.
 *
 * Marginalizes |psi|^2 over all dimensions except `axis`, producing a 1D
 * probability distribution P(x_axis). Then samples from that distribution
 * using inverse CDF.
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
  axis: number
): PartialMeasurementResult {
  const latticeDim = gridSize.length
  const totalSites = psiRe.length
  const axisSize = gridSize[axis]!

  // Compute marginal distribution: sum |psi|^2 over all dimensions except axis
  const marginal = new Float64Array(axisSize)

  // For each site, extract the axis coordinate and accumulate
  for (let i = 0; i < totalSites; i++) {
    const re = psiRe[i]!
    const im = psiIm[i]!
    const density = re * re + im * im

    // Extract axis coordinate from linear index
    const axisCoord = extractAxisCoord(i, gridSize, axis, latticeDim)
    marginal[axisCoord] = (marginal[axisCoord] ?? 0) + density
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
  compactDims?: boolean[]
): [Float32Array, Float32Array] {
  const latticeDim = gridSize.length
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
      dist2 += delta * delta
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
  axisCompact?: boolean
): [Float32Array, Float32Array] {
  const latticeDim = gridSize.length
  const totalSites = psiRe.length
  const axisSize = gridSize[axis]!
  const axisSpacing = spacing[axis]!
  const sigma2 = Math.max(sigma * sigma, 1e-8)
  const axisL = axisSize * axisSpacing

  // Pre-compute 1D Gaussian envelope for the measured axis
  const envelope = new Float32Array(axisSize)
  for (let k = 0; k < axisSize; k++) {
    const pos = (k - axisSize * 0.5 + 0.5) * axisSpacing
    let delta = pos - axisPosition
    if (axisCompact) delta = delta - axisL * Math.round(delta / axisL)
    envelope[k] = Math.exp(-(delta * delta) / (2 * sigma2))
  }

  const outRe = new Float32Array(totalSites)
  const outIm = new Float32Array(totalSites)

  for (let i = 0; i < totalSites; i++) {
    const axisCoord = extractAxisCoord(i, gridSize, axis, latticeDim)
    const g = envelope[axisCoord]!
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
