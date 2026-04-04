/**
 * IPR computation tests against analytical values.
 *
 * Convention: IPR = (Σ|ψ|²)² / Σ|ψ|⁴ = 1/Σp²
 * Ranges from 1 (fully localized / delta) to N (fully delocalized / uniform).
 *
 * Pattern: follows analyticalBenchmarks.test.ts
 * (exact analytical values, stated tolerances).
 */

import { describe, expect, it } from 'vitest'

import {
  inverseParticipationRatio,
  iprFromDensity,
  normalizedIPR,
} from '@/lib/physics/stochastic/ipr'

describe('inverseParticipationRatio', () => {
  it('IPR of uniform distribution = N', () => {
    const N = 256
    const amp = 1 / Math.sqrt(N)
    const psiRe = new Float64Array(N).fill(amp)
    const psiIm = new Float64Array(N).fill(0)

    const ipr = inverseParticipationRatio(psiRe, psiIm)
    // Σ|ψ|⁴ = N * (1/N)² = 1/N, (Σ|ψ|²)² = 1, so IPR = 1/(1/N) = N
    expect(Math.abs(ipr - N)).toBeLessThan(1e-6)
  })

  it('IPR of delta function = 1', () => {
    const N = 256
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    psiRe[100] = 1.0

    const ipr = inverseParticipationRatio(psiRe, psiIm)
    expect(Math.abs(ipr - 1)).toBeLessThan(1e-10)
  })

  it('IPR of two equal peaks = 2', () => {
    const N = 256
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    psiRe[10] = 1 / Math.sqrt(2)
    psiRe[50] = 1 / Math.sqrt(2)

    const ipr = inverseParticipationRatio(psiRe, psiIm)
    // Σ|ψ|⁴ = 2*(1/2)² = 1/2, (Σ|ψ|²)² = 1, so IPR = 1/(1/2) = 2
    expect(Math.abs(ipr - 2)).toBeLessThan(1e-10)
  })

  it('IPR of Gaussian wavepacket is between delta (1) and uniform (N)', () => {
    const N = 256
    const spacing = 0.1
    const sigma = 0.5
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    const halfExtent = N * spacing * 0.5

    for (let i = 0; i < N; i++) {
      const x = i * spacing - halfExtent
      psiRe[i] = Math.exp(-(x * x) / (4 * sigma * sigma))
    }
    // Normalize
    let norm = 0
    for (let i = 0; i < N; i++) norm += psiRe[i]! ** 2
    const scale = 1 / Math.sqrt(norm)
    for (let i = 0; i < N; i++) psiRe[i]! *= scale

    const ipr = inverseParticipationRatio(psiRe, psiIm)

    // Gaussian is between delta (1) and uniform (N)
    expect(ipr).toBeGreaterThan(1)
    expect(ipr).toBeLessThan(N)

    // Narrower Gaussian → lower IPR (more localized)
    const sigma2 = 0.2
    const psiRe2 = new Float64Array(N)
    const psiIm2 = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      const x = i * spacing - halfExtent
      psiRe2[i] = Math.exp(-(x * x) / (4 * sigma2 * sigma2))
    }
    let norm2 = 0
    for (let i = 0; i < N; i++) norm2 += psiRe2[i]! ** 2
    const scale2 = 1 / Math.sqrt(norm2)
    for (let i = 0; i < N; i++) psiRe2[i]! *= scale2

    const ipr2 = inverseParticipationRatio(psiRe2, psiIm2)
    expect(ipr2).toBeLessThan(ipr) // Narrower → more localized → lower IPR
  })

  it('returns 0 for zero wavefunction', () => {
    const psiRe = new Float64Array(10)
    const psiIm = new Float64Array(10)
    expect(inverseParticipationRatio(psiRe, psiIm)).toBe(0)
  })
})

describe('normalizedIPR', () => {
  it('uniform → normalizedIPR = 1', () => {
    const N = 100
    const amp = 1 / Math.sqrt(N)
    const psiRe = new Float64Array(N).fill(amp)
    const psiIm = new Float64Array(N).fill(0)
    const nipr = normalizedIPR(psiRe, psiIm)
    expect(Math.abs(nipr - 1)).toBeLessThan(1e-8)
  })

  it('delta → normalizedIPR = 1/N', () => {
    const N = 100
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    psiRe[50] = 1.0
    const nipr = normalizedIPR(psiRe, psiIm)
    expect(Math.abs(nipr - 1 / N)).toBeLessThan(1e-8)
  })
})

describe('iprFromDensity', () => {
  it('matches inverseParticipationRatio for real wavefunction', () => {
    const N = 64
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    for (let i = 0; i < N; i++) psiRe[i] = Math.sin(i * 0.2) + 0.5

    const ipr1 = inverseParticipationRatio(psiRe, psiIm)
    const density = new Float64Array(N)
    for (let i = 0; i < N; i++) density[i] = psiRe[i]! ** 2
    const ipr2 = iprFromDensity(density)

    expect(Math.abs(ipr1 - ipr2)).toBeLessThan(1e-10)
  })
})
