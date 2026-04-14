import { describe, expect, it } from 'vitest'

import type { QuantumPreset } from '@/lib/geometry/extended/schroedinger/presets'
import { computeCanonicalCompensation } from '@/rendering/webgpu/renderers/uniformPackingSupport'

/**
 * Regression tests locking in the physicist's Hermite convention used by the
 * density-compensation peak calculation. If `@/lib/math/hermitePolynomial`
 * silently switches to the probabilist's convention (or any other alternate
 * normalization), these asserted peak densities will drift and the tests will
 * fail loudly, preventing a silent density-gain regression.
 */
describe('computeCanonicalCompensation — Hermite convention lock', () => {
  const makePreset = (n: number): QuantumPreset => ({
    termCount: 1,
    omega: [1.0],
    quantumNumbers: [[n]],
    coefficients: [[1.0, 0.0]],
    energies: [0],
  })

  // Expected peak1D values for ω=1 in 1D using the physicist's Hermite:
  //   peak1D = sqrt(ω/π) / (2^n · n!) · max_u (H_n²(u) · exp(-u²))
  // Sampling over u ∈ [0, 5] at 501 points matches the implementation.
  //
  // n=0: max at u=0, H_0²·e⁰ = 1        → peak1D = 1/√π ≈ 0.56418958
  // n=1: max at u=1 (exact sample),
  //      H_1(1)² · e⁻¹ = 4/e ≈ 1.4715   → peak1D ≈ 0.56419/2 · 1.47152 ≈ 0.41514
  // n=2: true max at u=√2.5 ≈ 1.5811    → peak1D ≈ 0.37049 (sampled)
  //
  // These absolute values are stable across numerical sampling at the quoted
  // precision and would not survive a probabilist-convention swap (which uses
  // He_n(x) = 2^(-n/2) · H_n(x/√2) and would change peak values by 2^n).
  it.each([
    { n: 0, expected: 0.5641896, tol: 1e-6 },
    { n: 1, expected: 0.4151075, tol: 1e-6 },
    { n: 2, expected: 0.3704908, tol: 1e-6 },
    { n: 3, expected: 0.3455991, tol: 1e-6 },
    { n: 5, expected: 0.3162672, tol: 1e-6 },
  ])('peakDensity for n=$n, ω=1, 1D matches the locked reference value', ({ n, expected, tol }) => {
    const preset = makePreset(n)
    const { peakDensity } = computeCanonicalCompensation(preset, 1, 2.0)
    expect(peakDensity).toBeGreaterThan(0)
    expect(Math.abs(peakDensity - expected)).toBeLessThan(tol)
  })

  it('returns compensation > 0 for ground state (n=0)', () => {
    const { compensation } = computeCanonicalCompensation(makePreset(0), 1, 2.0)
    expect(compensation).toBeGreaterThan(0)
    expect(Number.isFinite(compensation)).toBe(true)
  })
})
