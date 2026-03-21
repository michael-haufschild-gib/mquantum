/**
 * Born Rule Measurement Simulation
 *
 * Samples a position from the probability distribution |ψ(x)|² using
 * inverse CDF sampling. Provides the measured position in N-D world space.
 *
 * @module lib/physics/measurement
 */

/** Result of a single measurement. */
export interface MeasurementResult {
  /** Linear grid index of the sampled site */
  gridIndex: number
  /** N-D world-space position of the measurement */
  position: number[]
  /** Probability density |ψ|² at the sampled point */
  density: number
}

/**
 * Sample a position from |ψ(x)|² using inverse CDF (binary search).
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

  // Build CDF: C[i] = sum of |ψ|² for sites 0..i
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
