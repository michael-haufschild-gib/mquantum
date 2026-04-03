/**
 * Localization operator mathematics tests (CPU reference).
 *
 * Pattern: follows openQuantum/lindblad.test.ts
 * (operator invariants, norm conservation).
 */

import { describe, expect, it } from 'vitest'

import { generateCollapseCenters } from '@/lib/physics/stochastic/localizationKernel'
import {
  applyLocalizationStep1D,
  computeNorm,
  computeParticipationRatio,
  renormalize,
} from '@/lib/physics/stochastic/localizationOperator'

/** Create a uniform 1D wavefunction normalized to 1. */
function uniformPsi(n: number): { psiRe: Float64Array; psiIm: Float64Array } {
  const amp = 1 / Math.sqrt(n)
  const psiRe = new Float64Array(n).fill(amp)
  const psiIm = new Float64Array(n).fill(0)
  return { psiRe, psiIm }
}

/** Create a Gaussian wavepacket with momentum k0. */
function gaussianPacket(
  n: number,
  center: number,
  sigma: number,
  k0: number,
  spacing: number
): { psiRe: Float64Array; psiIm: Float64Array } {
  const psiRe = new Float64Array(n)
  const psiIm = new Float64Array(n)
  const halfExtent = n * spacing * 0.5

  for (let i = 0; i < n; i++) {
    const x = i * spacing - halfExtent
    const env = Math.exp(-((x - center) ** 2) / (4 * sigma * sigma))
    psiRe[i] = env * Math.cos(k0 * x)
    psiIm[i] = env * Math.sin(k0 * x)
  }
  // Normalize
  renormalize(psiRe, psiIm)
  return { psiRe, psiIm }
}

describe('applyLocalizationStep — single site 1D', () => {
  it('γ=0 produces identity operation (no change)', () => {
    const { psiRe, psiIm } = uniformPsi(64)
    const origRe = Float64Array.from(psiRe)
    const origIm = Float64Array.from(psiIm)

    const centers = generateCollapseCenters(4, [64], [0.1], 1, 42, 0)
    applyLocalizationStep1D(psiRe, psiIm, 64, 0.1, centers, 0, 2.0, 0.005)

    // Bitwise identical
    for (let i = 0; i < 64; i++) {
      expect(psiRe[i]).toBe(origRe[i])
      expect(psiIm[i]).toBe(origIm[i])
    }
  })

  it('localization concentrates density near collapse center', () => {
    const n = 64
    const spacing = 0.1
    const { psiRe, psiIm } = uniformPsi(n)

    // Apply 100 localization steps at center=0 (grid midpoint)
    for (let step = 0; step < 100; step++) {
      const centers = [{ position: [0], noise: 0.5 }] // Positive noise = amplify near center
      applyLocalizationStep1D(psiRe, psiIm, n, spacing, centers, 1.0, 2.0, 0.005)
      renormalize(psiRe, psiIm)
    }

    // Density near center (site 32) should be higher than at edge (site 0)
    const densCenter = psiRe[32]! ** 2 + psiIm[32]! ** 2
    const densEdge = psiRe[0]! ** 2 + psiIm[0]! ** 2
    expect(densCenter).toBeGreaterThan(densEdge)
  })

  it('localization preserves phase structure', () => {
    const n = 128
    const spacing = 0.1
    const k0 = 5.0
    const { psiRe, psiIm } = gaussianPacket(n, 0, 0.5, k0, spacing)

    // Apply one localization step
    const centers = generateCollapseCenters(1, [n], [spacing], 1, 42, 0)
    applyLocalizationStep1D(psiRe, psiIm, n, spacing, centers, 1.0, 2.0, 0.005)

    // Check local phase gradient near center matches k0
    const mid = Math.floor(n / 2)

    // Phase at adjacent sites
    const phase1 = Math.atan2(psiIm[mid]!, psiRe[mid]!)
    const phase2 = Math.atan2(psiIm[mid + 1]!, psiRe[mid + 1]!)
    let dPhase = phase2 - phase1
    // Unwrap
    if (dPhase > Math.PI) dPhase -= 2 * Math.PI
    if (dPhase < -Math.PI) dPhase += 2 * Math.PI

    const measuredK = dPhase / spacing
    expect(Math.abs(measuredK - k0) / k0).toBeLessThan(0.01)
  })

  it('larger σ produces gentler localization (wider post-step distribution)', () => {
    const n = 64
    const spacing = 0.1

    // Same parameters except σ
    function runWithSigma(sigma: number): number {
      const { psiRe, psiIm } = uniformPsi(n)
      for (let step = 0; step < 50; step++) {
        const centers = generateCollapseCenters(4, [n], [spacing], 1, 42, step)
        applyLocalizationStep1D(psiRe, psiIm, n, spacing, centers, 1.0, sigma, 0.005)
        renormalize(psiRe, psiIm)
      }
      return computeParticipationRatio(psiRe, psiIm)
    }

    const prNarrow = runWithSigma(1.0)
    const prWide = runWithSigma(5.0)

    // Wider σ → less localized → lower participation ratio (closer to 1/N)
    expect(prWide).toBeLessThan(prNarrow)
  })

  it('larger γ produces stronger localization', () => {
    const n = 64
    const spacing = 0.1

    function runWithGamma(gamma: number): number {
      const { psiRe, psiIm } = uniformPsi(n)
      for (let step = 0; step < 50; step++) {
        const centers = generateCollapseCenters(4, [n], [spacing], 1, 42, step)
        applyLocalizationStep1D(psiRe, psiIm, n, spacing, centers, gamma, 2.0, 0.005)
        renormalize(psiRe, psiIm)
      }
      return computeParticipationRatio(psiRe, psiIm)
    }

    const prLow = runWithGamma(0.1)
    const prHigh = runWithGamma(5.0)

    // Higher γ → more localized → higher participation ratio (closer to 1)
    expect(prHigh).toBeGreaterThan(prLow)
  })

  it('norm after single step is close to 1 (before renormalization)', () => {
    const n = 64
    const spacing = 0.1
    const { psiRe, psiIm } = uniformPsi(n)

    const normBefore = computeNorm(psiRe, psiIm)
    const centers = generateCollapseCenters(4, [n], [spacing], 1, 42, 0)
    applyLocalizationStep1D(psiRe, psiIm, n, spacing, centers, 1.0, 2.0, 0.005)
    const normAfter = computeNorm(psiRe, psiIm)

    // Without expectation subtraction, norm drifts slightly but stays close
    // (corrected by renormalization in the pipeline)
    expect(Math.abs(normAfter - normBefore) / normBefore).toBeLessThan(0.05)
  })
})
