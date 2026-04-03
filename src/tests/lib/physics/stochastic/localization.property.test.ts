/**
 * Stochastic localization physical invariants — property-based tests.
 *
 * Pattern: follows openQuantum/lindblad.property.test.ts
 * (fast-check, physical invariants across arbitrary inputs).
 */

import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { generateCollapseCenters } from '@/lib/physics/stochastic/localizationKernel'
import {
  applyLocalizationStep1D,
  computeNorm,
  computeParticipationRatio,
  renormalize,
} from '@/lib/physics/stochastic/localizationOperator'

/** Create a random complex wavefunction from fast-check arrays, then normalize. */
function makeNormalizedPsi(
  reArr: number[],
  imArr: number[]
): { psiRe: Float64Array; psiIm: Float64Array } {
  const psiRe = new Float64Array(reArr)
  const psiIm = new Float64Array(imArr)
  renormalize(psiRe, psiIm)
  return { psiRe, psiIm }
}

describe('stochastic localization physical invariants (property-based)', () => {
  it('γ=0 is exact identity (bit-identical output)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -10, max: 10, noNaN: true }), { minLength: 16, maxLength: 64 }),
        fc.array(fc.double({ min: -10, max: 10, noNaN: true }), { minLength: 16, maxLength: 64 }),
        (reArr, imArr) => {
          const n = Math.min(reArr.length, imArr.length)
          if (n < 4) return // Skip tiny arrays
          const re = reArr.slice(0, n)
          const im = imArr.slice(0, n)
          const { psiRe, psiIm } = makeNormalizedPsi(re, im)
          const origRe = Float64Array.from(psiRe)
          const origIm = Float64Array.from(psiIm)

          const centers = generateCollapseCenters(4, [n], [0.1], 1, 42, 0)
          applyLocalizationStep1D(psiRe, psiIm, n, 0.1, centers, 0, 2.0, 0.005)

          // Bitwise identical
          for (let i = 0; i < n; i++) {
            expect(psiRe[i]).toBe(origRe[i])
            expect(psiIm[i]).toBe(origIm[i])
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('norm stays close to 1 for small γ·dt', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 16, max: 64 }),
        fc.double({ min: 0.01, max: 2.0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.5, max: 5.0, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 99999 }),
        (n, gamma, sigma, seed) => {
          const psiRe = new Float64Array(n)
          const psiIm = new Float64Array(n)
          const amp = 1 / Math.sqrt(n)
          for (let i = 0; i < n; i++) psiRe[i] = amp

          const dt = 0.005
          const centers = generateCollapseCenters(4, [n], [0.1], 1, seed, 0)
          applyLocalizationStep1D(psiRe, psiIm, n, 0.1, centers, gamma, sigma, dt)
          const norm = computeNorm(psiRe, psiIm)

          // For small γ·dt, norm drift should be bounded
          // Allow up to 10% drift for property test (stochastic noise)
          expect(Math.abs(norm - 1)).toBeLessThan(0.1)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('localization is monotone in γ: higher γ → higher PR (more localized)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 32, max: 64 }),
        fc.integer({ min: 0, max: 99999 }),
        (n, seed) => {
          function runWithGamma(gamma: number): number {
            const amp = 1 / Math.sqrt(n)
            const psiRe = new Float64Array(n).fill(amp)
            const psiIm = new Float64Array(n).fill(0)
            for (let step = 0; step < 50; step++) {
              const centers = generateCollapseCenters(4, [n], [0.1], 1, seed, step)
              applyLocalizationStep1D(psiRe, psiIm, n, 0.1, centers, gamma, 2.0, 0.005)
              renormalize(psiRe, psiIm)
            }
            return computeParticipationRatio(psiRe, psiIm)
          }

          const prLow = runWithGamma(0.5)
          const prHigh = runWithGamma(5.0)

          // Higher γ → more localized → higher PR
          // Allow ε tolerance for stochastic noise
          expect(prHigh).toBeGreaterThan(prLow - 0.05)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('real-valued ψ stays real under localization', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -10, max: 10, noNaN: true }), { minLength: 16, maxLength: 64 }),
        (reArr) => {
          const n = reArr.length
          const psiRe = new Float64Array(reArr)
          const psiIm = new Float64Array(n) // All zeros

          const centers = generateCollapseCenters(4, [n], [0.1], 1, 42, 0)
          applyLocalizationStep1D(psiRe, psiIm, n, 0.1, centers, 1.0, 2.0, 0.005)

          // Imaginary part should remain exactly zero
          for (let i = 0; i < n; i++) {
            expect(psiIm[i]).toBe(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
