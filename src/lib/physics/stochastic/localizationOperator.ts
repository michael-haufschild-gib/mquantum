/**
 * Stochastic Localization Operator — CPU Reference Implementation
 *
 * Pure JavaScript implementation of the CSL localization operator,
 * matching the WGSL shader logic. Used for unit testing and as ground
 * truth for GPU shader verification.
 *
 * The operator applies the same centered combined-field exponential kick as
 * the GPU path:
 *   W(x) = (πσ²)^(-d/4) Σ_k G(x, c_k, σ) ξ_k
 *   ψ(x) *= exp(√(γdt)(W(x)-⟨W⟩) - 0.5γdt(W(x)-⟨W⟩)²)
 * where ⟨W⟩ is density-weighted over the current wavefunction.
 *
 * @module lib/physics/stochastic/localizationOperator
 */

import { computeStrides } from '@/lib/math/ndArray'

import type { CollapseCenter } from './localizationKernel'

const STOCHASTIC_CUTOFF_SIGMA = 6
const MAX_LOCALIZATION_DIM = 11
const MAX_LOCALIZATION_SITES = 2 ** 20

function finiteCenterCoordinate(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function finiteCenterNoise(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function validateWavefunctionBuffers(
  caller: string,
  psiRe: Float64Array,
  psiIm: Float64Array,
  expectedLength: number
): boolean {
  if (psiRe.length < expectedLength || psiIm.length < expectedLength) {
    throw new RangeError(
      `${caller}: wavefunction buffers too small (need ${expectedLength}, got re=${psiRe.length}, im=${psiIm.length})`
    )
  }
  return expectedLength > 0
}

function validateGrid1D(gridSize: number, spacing: number): boolean {
  return Number.isSafeInteger(gridSize) && gridSize > 0 && Number.isFinite(spacing) && spacing > 0
}

function validateGridND(
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number
): number {
  if (!Number.isSafeInteger(latticeDim) || latticeDim < 1 || latticeDim > MAX_LOCALIZATION_DIM) {
    throw new RangeError(
      `applyLocalizationStepND: latticeDim must be an integer in [1, ${MAX_LOCALIZATION_DIM}]`
    )
  }
  if (gridSize.length < latticeDim || spacing.length < latticeDim) {
    throw new RangeError('applyLocalizationStepND: gridSize and spacing must cover latticeDim')
  }

  let totalSites = 1
  for (let d = 0; d < latticeDim; d++) {
    const n = gridSize[d]!
    const dx = spacing[d]!
    if (!Number.isSafeInteger(n) || n < 1) {
      throw new RangeError(
        `applyLocalizationStepND: gridSize[${d}] must be a positive safe integer`
      )
    }
    if (!Number.isFinite(dx) || dx <= 0) {
      throw new RangeError(`applyLocalizationStepND: spacing[${d}] must be finite and positive`)
    }
    if (totalSites > Math.floor(Number.MAX_SAFE_INTEGER / n)) {
      throw new RangeError(`applyLocalizationStepND: total site count overflows at axis ${d}`)
    }
    if (n > MAX_LOCALIZATION_SITES || totalSites > Math.floor(MAX_LOCALIZATION_SITES / n)) {
      throw new RangeError(
        `applyLocalizationStepND: total site count exceeds site budget ${MAX_LOCALIZATION_SITES} at axis ${d}`
      )
    }
    totalSites *= n
  }
  return totalSites
}

function finiteScaleFromExponent(exponent: number): number {
  if (!Number.isFinite(exponent)) return 0
  return Math.exp(Math.max(-745, Math.min(709, exponent)))
}

function maxWavefunctionAmplitude(psiRe: Float64Array, psiIm: Float64Array): number {
  const length = Math.min(psiRe.length, psiIm.length)
  let maxAmp = 0
  for (let i = 0; i < length; i++) {
    const amp = Math.hypot(psiRe[i]!, psiIm[i]!)
    if (Number.isFinite(amp) && amp > maxAmp) maxAmp = amp
  }
  return maxAmp
}

function computeNoiseField(
  coords: readonly number[],
  centers: readonly CollapseCenter[],
  latticeDim: number,
  invTwoSigmaSq: number,
  maxDistSq: number,
  normFactor: number
): number {
  let rawSum = 0
  for (const center of centers) {
    const noise = finiteCenterNoise(center.noise)
    if (noise === 0) continue

    let distSq = 0
    for (let d = 0; d < latticeDim; d++) {
      const diff = coords[d]! - finiteCenterCoordinate(center.position[d])
      distSq += diff * diff
      if (distSq > maxDistSq) break
    }
    if (distSq < maxDistSq) {
      rawSum += Math.exp(-distSq * invTwoSigmaSq) * noise
    }
  }
  return normFactor * rawSum
}

function applyCenteredNoiseFields(
  psiRe: Float64Array,
  psiIm: Float64Array,
  noiseFields: Float64Array,
  gamma: number,
  dt: number
): void {
  let norm = 0
  let weightedNoise = 0
  for (let i = 0; i < noiseFields.length; i++) {
    const amp = Math.hypot(psiRe[i]!, psiIm[i]!)
    const density = Number.isFinite(amp) ? amp * amp : 0
    norm += density
    weightedNoise += density * noiseFields[i]!
  }

  const meanNoise =
    norm > 0 && Number.isFinite(norm) && Number.isFinite(weightedNoise) ? weightedNoise / norm : 0
  const sqrtGammaDt = Math.sqrt(gamma * dt)
  const halfGammaDt = 0.5 * gamma * dt
  if (!Number.isFinite(sqrtGammaDt) || !Number.isFinite(halfGammaDt)) return

  for (let i = 0; i < noiseFields.length; i++) {
    const centered = noiseFields[i]! - meanNoise
    const scale = finiteScaleFromExponent(
      sqrtGammaDt * centered - halfGammaDt * centered * centered
    )
    psiRe[i]! *= scale
    psiIm[i]! *= scale
  }
}

/**
 * Apply one localization step to a 1D wavefunction (CPU reference).
 *
 * @param psiRe - Real part of wavefunction (modified in-place)
 * @param psiIm - Imaginary part of wavefunction (modified in-place)
 * @param gridSize - Number of lattice sites
 * @param spacing - Lattice spacing
 * @param centers - Collapse centers for this step
 * @param gamma - Monitoring rate
 * @param sigma - Localization Gaussian width
 * @param dt - Timestep
 */
export function applyLocalizationStep1D(
  psiRe: Float64Array,
  psiIm: Float64Array,
  gridSize: number,
  spacing: number,
  centers: CollapseCenter[],
  gamma: number,
  sigma: number,
  dt: number
): void {
  if (!Number.isFinite(gamma) || gamma <= 0 || !Number.isFinite(dt) || dt <= 0) return
  if (!Number.isFinite(sigma) || sigma <= 0) return
  if (!validateGrid1D(gridSize, spacing)) return
  validateWavefunctionBuffers('applyLocalizationStep1D', psiRe, psiIm, gridSize)

  const invTwoSigmaSq = 1 / (2 * sigma * sigma)
  const maxDistSq = STOCHASTIC_CUTOFF_SIGMA * STOCHASTIC_CUTOFF_SIGMA * sigma * sigma
  const normFactor = (Math.PI * sigma * sigma) ** -0.25
  const halfExtent = gridSize * spacing * 0.5
  const noiseFields = new Float64Array(gridSize)

  for (let i = 0; i < gridSize; i++) {
    const x = (i + 0.5) * spacing - halfExtent
    noiseFields[i] = computeNoiseField([x], centers, 1, invTwoSigmaSq, maxDistSq, normFactor)
  }

  applyCenteredNoiseFields(psiRe, psiIm, noiseFields, gamma, dt)
}

/**
 * Apply one localization step to an N-D wavefunction (CPU reference).
 *
 * @param psiRe - Real part (flat array, row-major)
 * @param psiIm - Imaginary part (flat array, row-major)
 * @param gridSize - Grid sizes per dimension
 * @param spacing - Spacings per dimension
 * @param latticeDim - Number of dimensions
 * @param centers - Collapse centers
 * @param gamma - Monitoring rate
 * @param sigma - Localization width
 * @param dt - Timestep
 */
export function applyLocalizationStepND(
  psiRe: Float64Array,
  psiIm: Float64Array,
  gridSize: number[],
  spacing: number[],
  latticeDim: number,
  centers: CollapseCenter[],
  gamma: number,
  sigma: number,
  dt: number
): void {
  if (!Number.isFinite(gamma) || gamma <= 0 || !Number.isFinite(dt) || dt <= 0) return
  if (!Number.isFinite(sigma) || sigma <= 0) return

  const totalSites = validateGridND(gridSize, spacing, latticeDim)
  validateWavefunctionBuffers('applyLocalizationStepND', psiRe, psiIm, totalSites)
  const activeGrid = gridSize.slice(0, latticeDim)
  const strides = computeStrides(activeGrid)

  const invTwoSigmaSq = 1 / (2 * sigma * sigma)
  const maxDistSq = STOCHASTIC_CUTOFF_SIGMA * STOCHASTIC_CUTOFF_SIGMA * sigma * sigma
  const normFactor = (Math.PI * sigma * sigma) ** (-latticeDim * 0.25)
  const halfExtents = gridSize.map((g, d) => g * spacing[d]! * 0.5)
  const noiseFields = new Float64Array(totalSites)

  for (let idx = 0; idx < totalSites; idx++) {
    // Convert flat index to coordinates
    const coords: number[] = []
    let rem = idx
    for (let d = 0; d < latticeDim; d++) {
      const ci = Math.floor(rem / strides[d]!)
      rem = rem % strides[d]!
      coords.push((ci + 0.5) * spacing[d]! - halfExtents[d]!)
    }

    noiseFields[idx] = computeNoiseField(
      coords,
      centers,
      latticeDim,
      invTwoSigmaSq,
      maxDistSq,
      normFactor
    )
  }

  applyCenteredNoiseFields(psiRe, psiIm, noiseFields, gamma, dt)
}

/**
 * Compute the total norm of a wavefunction: Σ |ψ_i|².
 *
 * @param psiRe - Real part
 * @param psiIm - Imaginary part
 * @returns Total norm
 */
export function computeNorm(psiRe: Float64Array, psiIm: Float64Array): number {
  validateWavefunctionBuffers('computeNorm', psiRe, psiIm, psiRe.length)
  let norm = 0
  for (let i = 0; i < psiRe.length; i++) {
    const amp = Math.hypot(psiRe[i]!, psiIm[i]!)
    if (!Number.isFinite(amp)) return Infinity
    norm += amp * amp
    if (!Number.isFinite(norm)) return Infinity
  }
  return norm
}

/**
 * Compute the Participation Ratio: Σ p_i² where p_i = |ψ_i|²/N_norm.
 *
 * Returns Σ|ψ|⁴ / (Σ|ψ|²)² — the sum of squared probabilities.
 * Goes from 1/N (fully delocalized) to 1 (fully localized).
 * The inverse (IPR = 1/PR) is computed by {@link inverseParticipationRatio} in ipr.ts.
 *
 * @param psiRe - Real part
 * @param psiIm - Imaginary part
 * @returns Participation ratio in (0, 1]
 */
export function computeParticipationRatio(psiRe: Float64Array, psiIm: Float64Array): number {
  validateWavefunctionBuffers('computeParticipationRatio', psiRe, psiIm, psiRe.length)
  const maxAmp = maxWavefunctionAmplitude(psiRe, psiIm)
  if (maxAmp === 0) return 0

  let sumScaledDensity = 0
  let sumScaledDensitySq = 0
  for (let i = 0; i < psiRe.length; i++) {
    const amp = Math.hypot(psiRe[i]!, psiIm[i]!)
    if (!Number.isFinite(amp)) continue
    const density = (amp / maxAmp) ** 2
    sumScaledDensity += density
    sumScaledDensitySq += density * density
  }
  if (sumScaledDensity === 0) return 0
  return sumScaledDensitySq / (sumScaledDensity * sumScaledDensity)
}

/**
 * Renormalize a wavefunction to unit norm.
 *
 * @param psiRe - Real part (modified in-place)
 * @param psiIm - Imaginary part (modified in-place)
 */
export function renormalize(psiRe: Float64Array, psiIm: Float64Array): void {
  validateWavefunctionBuffers('renormalize', psiRe, psiIm, psiRe.length)
  const maxAmp = maxWavefunctionAmplitude(psiRe, psiIm)
  if (maxAmp === 0) return

  let scaledNorm = 0
  for (let i = 0; i < psiRe.length; i++) {
    const amp = Math.hypot(psiRe[i]!, psiIm[i]!)
    if (!Number.isFinite(amp)) continue
    const scaledAmp = amp / maxAmp
    scaledNorm += scaledAmp * scaledAmp
  }
  if (!(scaledNorm > 0) || !Number.isFinite(scaledNorm)) return

  const scale = 1 / (maxAmp * Math.sqrt(scaledNorm))
  for (let i = 0; i < psiRe.length; i++) {
    psiRe[i]! *= scale
    psiIm[i]! *= scale
  }
}
