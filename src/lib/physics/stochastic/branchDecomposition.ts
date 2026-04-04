/**
 * Branch Decomposition — Spatial Partition and Coherence Metrics
 *
 * Computes branch populations and coherence metrics for decoherent
 * branching visualization. Uses spatial partitioning (left/right of
 * a configurable plane) to decompose the wavefunction into two branches.
 *
 * @module lib/physics/stochastic/branchDecomposition
 */

/** Result of a spatial branch partition computation. */
export interface BranchPartition {
  /** Population fraction in branch A (left of partition) */
  populationA: number
  /** Population fraction in branch B (right of partition) */
  populationB: number
  /** Total norm of the wavefunction */
  totalNorm: number
}

/**
 * Compute branch populations by spatial partition along axis 0.
 *
 * @param psiRe - Real part of wavefunction
 * @param psiIm - Imaginary part of wavefunction
 * @param gridSize - Grid sizes per dimension
 * @param spacing - Spacings per dimension
 * @param latticeDim - Number of dimensions
 * @param planePosition - Normalized partition position (-1 to 1, 0 = center)
 * @returns Branch populations and total norm
 */
export function spatialBranchPartition(
  psiRe: Float64Array,
  psiIm: Float64Array,
  gridSize: number[],
  spacing: number[],
  latticeDim: number,
  planePosition: number = 0
): BranchPartition {
  if (!Number.isInteger(latticeDim) || latticeDim < 1) {
    throw new Error(`latticeDim must be a positive integer (got ${latticeDim})`)
  }
  if (gridSize.length < latticeDim || spacing.length < latticeDim) {
    throw new Error(
      `gridSize/spacing must have at least ${latticeDim} entries (got ${gridSize.length}/${spacing.length})`
    )
  }

  const totalSites = gridSize.slice(0, latticeDim).reduce((a, b) => a * b, 1)

  if (psiRe.length < totalSites || psiIm.length < totalSites) {
    throw new Error(
      `psiRe/psiIm length (${psiRe.length}) does not match totalSites (${totalSites})`
    )
  }

  // Compute strides (row-major)
  const strides = new Array(latticeDim)
  let stride = 1
  for (let d = latticeDim - 1; d >= 0; d--) {
    strides[d] = stride
    stride *= gridSize[d]!
  }

  // Partition threshold along axis 0 (world coordinate)
  const halfExtent0 = gridSize[0]! * spacing[0]! * 0.5
  const threshold = planePosition * halfExtent0

  let normA = 0
  let normB = 0

  for (let idx = 0; idx < totalSites; idx++) {
    // Extract axis-0 coordinate from flat index
    const coord0 = Math.floor(idx / strides[0]!) % gridSize[0]!
    const x0 = coord0 * spacing[0]! - halfExtent0

    const density = psiRe[idx]! * psiRe[idx]! + psiIm[idx]! * psiIm[idx]!

    if (x0 < threshold) {
      normA += density
    } else {
      normB += density
    }
  }

  const totalNorm = normA + normB
  return {
    populationA: totalNorm > 0 ? normA / totalNorm : 0.5,
    populationB: totalNorm > 0 ? normB / totalNorm : 0.5,
    totalNorm,
  }
}

/**
 * Compute branch entropy: S = -p_A·ln(p_A) - p_B·ln(p_B).
 *
 * Ranges from 0 (fully in one branch) to ln(2) ≈ 0.693 (equal populations).
 * Serves as a proxy for quantum coherence between branches — starts high
 * for symmetric states and decays as decoherence localizes into one branch.
 *
 * @param populationA - Fraction of population in branch A
 * @param populationB - Fraction of population in branch B
 * @returns Shannon entropy in nats
 */
export function branchEntropy(populationA: number, populationB: number): number {
  let entropy = 0
  if (populationA > 0) entropy -= populationA * Math.log(populationA)
  if (populationB > 0) entropy -= populationB * Math.log(populationB)
  return entropy
}

/**
 * Compute branch purity: P = p_A² + p_B².
 *
 * Ranges from 0.5 (equal populations) to 1.0 (fully in one branch).
 *
 * @param populationA - Fraction of population in branch A
 * @param populationB - Fraction of population in branch B
 * @returns Purity measure
 */
export function branchPurity(populationA: number, populationB: number): number {
  return populationA * populationA + populationB * populationB
}

/**
 * Fit exponential decay to a time series: C(t) = C₀·exp(-Γ·t).
 *
 * Uses log-linear least squares on the positive values.
 * Returns the decay rate Γ (positive = decaying) and R² goodness of fit.
 *
 * @param times - Time values
 * @param values - Measurement values (must be positive for log fit)
 * @returns Decay rate and R² goodness of fit, or null if fit fails
 */
export function fitExponentialDecay(
  times: number[],
  values: number[]
): { decayRate: number; r2: number; amplitude: number } | null {
  // Filter to positive values only (log requires > 0)
  const valid: { t: number; v: number }[] = []
  for (let i = 0; i < times.length; i++) {
    if (values[i]! > 1e-15) {
      valid.push({ t: times[i]!, v: values[i]! })
    }
  }
  if (valid.length < 3) return null

  // Log-linear regression: ln(v) = ln(C₀) - Γ·t
  const n = valid.length
  let sumT = 0
  let sumLogV = 0
  let sumT2 = 0
  let sumTLogV = 0

  for (const { t, v } of valid) {
    const logV = Math.log(v)
    sumT += t
    sumLogV += logV
    sumT2 += t * t
    sumTLogV += t * logV
  }

  const denom = n * sumT2 - sumT * sumT
  if (Math.abs(denom) < 1e-30) return null

  const slope = (n * sumTLogV - sumT * sumLogV) / denom
  const intercept = (sumLogV * sumT2 - sumT * sumTLogV) / denom

  // R² computation
  const meanLogV = sumLogV / n
  let ssRes = 0
  let ssTot = 0
  for (const { t, v } of valid) {
    const logV = Math.log(v)
    const predicted = intercept + slope * t
    ssRes += (logV - predicted) ** 2
    ssTot += (logV - meanLogV) ** 2
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

  return {
    decayRate: -slope, // Positive = decaying
    r2,
    amplitude: Math.exp(intercept),
  }
}
