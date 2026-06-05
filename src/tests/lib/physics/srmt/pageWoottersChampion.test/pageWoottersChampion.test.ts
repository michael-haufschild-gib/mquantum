/**
 * Unit tests for the Page–Wootters cross-diagnostic.
 *
 * @module tests/lib/physics/srmt/pageWoottersChampion
 */

import { describe, expect, it } from 'vitest'

import {
  computePageWoottersRates,
  findPageWoottersChampion,
} from '@/lib/physics/srmt/pageWoottersChampion'

/**
 * Build a synthetic χ where the slabs orthogonal to `varyingAxis`
 * are mutually orthogonal (each slab has its peak in a different
 * "feature axis" cell), while slabs orthogonal to OTHER axes are
 * identical copies of a single profile.
 *
 * Concretely, we put a delta-like peak at a different position
 * along the FIRST non-varying axis for each step along the varying
 * axis. Conditional states along the varying axis are orthogonal
 * (autocorrelation = 0). Conditional states along the non-varying
 * axes are identical (autocorrelation = 1).
 */
function syntheticVaryingAlongAxis(
  shape: [number, number, number],
  varyingAxis: 0 | 1 | 2
): Float32Array {
  const [N0, N1, N2] = shape
  const out = new Float32Array(2 * N0 * N1 * N2)
  // featureAxis is the "non-varying" axis whose cell we use to encode
  // the varying-axis coordinate.
  const featureAxis = ((varyingAxis + 1) % 3) as 0 | 1 | 2
  for (let i0 = 0; i0 < N0; i0++) {
    for (let i1 = 0; i1 < N1; i1++) {
      for (let i2 = 0; i2 < N2; i2++) {
        const v = [i0, i1, i2][varyingAxis]!
        const f = [i0, i1, i2][featureAxis]!
        if (v === f) {
          const idx = 2 * (i0 * N1 * N2 + i1 * N2 + i2)
          out[idx] = 1
          out[idx + 1] = 0
        }
      }
    }
  }
  return out
}

describe('Page–Wootters cross-diagnostic', () => {
  it('distinguishes a structured χ from a uniform one (non-trivial rate)', () => {
    const shape: [number, number, number] = [8, 8, 8]
    // Structured: maximally-entangled diagonal state ψ ∝ Σ_k |k,k,0⟩.
    // The (i0, i1) sub-system is perfectly correlated; conditional
    // states along axes 0 and 1 are orthogonal step-by-step → PW
    // rates near 0. Along axis 2 the state is trivial (only i2=0
    // populated) → PW rate = 1 by convention (no structure to
    // distinguish; we exit the autocorrelation summation with
    // identical slabs).
    const chi = syntheticVaryingAlongAxis(shape, 0)
    const rates = computePageWoottersRates(chi, shape)
    // Axes 0 and 1 should yield low autocorrelation; axis 2 should
    // be flat. We don't pin which of {a, phi1} wins (they're
    // symmetric on this state), but both must beat phi2.
    expect(Math.min(rates.a, rates.phi1)).toBeLessThan(rates.phi2)
  })

  it('returns finite rates within [0, 1] for the entangled construction', () => {
    const shape: [number, number, number] = [8, 8, 8]
    const chi = syntheticVaryingAlongAxis(shape, 1)
    const rates = computePageWoottersRates(chi, shape)
    for (const v of [rates.a, rates.phi1, rates.phi2]) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1.000001)
    }
  })

  it('returns null on a uniform χ (no distinguishing clock)', () => {
    const shape: [number, number, number] = [6, 6, 6]
    const chi = new Float32Array(2 * 6 * 6 * 6)
    for (let i = 0; i < chi.length; i += 2) chi[i] = 1
    const rates = computePageWoottersRates(chi, shape)
    expect(findPageWoottersChampion(rates)).toBeNull()
  })

  it('does not treat zero-probability clock slices as orthogonal evolution', () => {
    const shape: [number, number, number] = [6, 6, 6]
    const chi = new Float32Array(2 * 6 * 6 * 6)
    for (let i1 = 0; i1 < 6; i1++) {
      for (let i2 = 0; i2 < 6; i2++) {
        const idx = 2 * (0 * 6 * 6 + i1 * 6 + i2)
        chi[idx] = 1
      }
    }

    const rates = computePageWoottersRates(chi, shape)

    expect(rates.a).toBeNaN()
    expect(findPageWoottersChampion(rates)).toBeNull()
  })

  it('autocorrelation lies in [0, 1] for a normalised conditional state', () => {
    const shape: [number, number, number] = [8, 8, 8]
    const chi = syntheticVaryingAlongAxis(shape, 1)
    const rates = computePageWoottersRates(chi, shape)
    for (const v of [rates.a, rates.phi1, rates.phi2]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1.000001)
    }
  })

  it('returns null when any rate is non-finite', () => {
    expect(findPageWoottersChampion({ a: 0.5, phi1: Number.NaN, phi2: 0.3 })).toBeNull()
  })
})
