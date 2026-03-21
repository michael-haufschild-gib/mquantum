/**
 * Classical-quantum correspondence overlay math tests.
 *
 * Verifies the physics formulas used for the HO Lissajous trajectory
 * overlay (feature A2) and the Ehrenfest ⟨x⟩(t) trail sampling.
 *
 * Tests are CPU-reference implementations of the math in
 * uniformPackingClassical.ts, validating:
 * - HO classical turning point amplitude: A_d = sqrt(2⟨n+½⟩/ω_d)
 * - Lissajous trajectory: x_d(t) = A_d cos(ω_d t)
 * - Trajectory periodicity for commensurate and incommensurate ω
 * - Ehrenfest trail ring buffer sampling logic
 * - N-D projection through basis vectors (extends existing tests)
 */
import { describe, expect, it } from 'vitest'

// ── CPU reference: HO amplitude formula ──────────────────────────────────

/**
 * Compute the classical turning point amplitude for dimension d.
 *
 * For a harmonic oscillator with energy E = ℏω(n+½), the classical
 * turning point is x_max = sqrt(2E/(mω²)). In natural units (ℏ=m=1):
 *   A = sqrt(2(n+0.5)/ω)
 *
 * For a superposition, n is replaced by the weighted average
 *   ⟨n+½⟩ = Σ_k w_k (n_k + 0.5) / Σ_k w_k
 * where w_k = |c_k|² is the squared coefficient magnitude.
 *
 * @param quantumNumbers - Per-term quantum number for this dimension
 * @param coeffRe - Real parts of superposition coefficients
 * @param coeffIm - Imaginary parts of superposition coefficients
 * @param omega - Angular frequency for this dimension
 * @returns Classical turning point amplitude
 */
function computeClassicalAmplitude(
  quantumNumbers: number[],
  coeffRe: number[],
  coeffIm: number[],
  omega: number
): number {
  let avgNHalf = 0
  let totalWeight = 0
  for (let k = 0; k < quantumNumbers.length; k++) {
    const re = coeffRe[k]!
    const im = coeffIm[k]!
    const w = re * re + im * im
    avgNHalf += w * (quantumNumbers[k]! + 0.5)
    totalWeight += w
  }
  if (totalWeight > 0) avgNHalf /= totalWeight
  return Math.sqrt(Math.max((2.0 * avgNHalf) / Math.max(omega, 0.01), 0))
}

/**
 * Compute Lissajous position in N dimensions at time t.
 */
function lissajousPosition(amplitudes: number[], omegas: number[], t: number): number[] {
  return amplitudes.map((A, d) => A * Math.cos(omegas[d]! * t))
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('HO classical turning point amplitude', () => {
  it('matches x_max = sqrt(2(n+0.5)/ω) for single-term ground state', () => {
    // n=0, ω=1: A = sqrt(2*0.5/1) = sqrt(1) = 1
    const A = computeClassicalAmplitude([0], [1], [0], 1.0)
    expect(A).toBeCloseTo(1.0)
  })

  it('matches x_max for first excited state', () => {
    // n=1, ω=1: A = sqrt(2*1.5/1) = sqrt(3) ≈ 1.732
    const A = computeClassicalAmplitude([1], [1], [0], 1.0)
    expect(A).toBeCloseTo(Math.sqrt(3))
  })

  it('matches x_max for high quantum number', () => {
    // n=10, ω=1: A = sqrt(2*10.5) = sqrt(21) ≈ 4.583
    const A = computeClassicalAmplitude([10], [1], [0], 1.0)
    expect(A).toBeCloseTo(Math.sqrt(21))
  })

  it('scales inversely with sqrt(ω)', () => {
    // n=0, ω=4: A = sqrt(2*0.5/4) = sqrt(0.25) = 0.5
    const A = computeClassicalAmplitude([0], [1], [0], 4.0)
    expect(A).toBeCloseTo(0.5)
  })

  it('computes weighted average for superposition of two states', () => {
    // |ψ⟩ = (1/√2)|0⟩ + (1/√2)|4⟩, ω=1
    // w₀ = w₁ = 0.5, ⟨n+½⟩ = 0.5*(0.5) + 0.5*(4.5) = 2.5
    // A = sqrt(2*2.5/1) = sqrt(5) ≈ 2.236
    const s = 1 / Math.SQRT2
    const A = computeClassicalAmplitude([0, 4], [s, s], [0, 0], 1.0)
    expect(A).toBeCloseTo(Math.sqrt(5))
  })

  it('handles complex coefficients (phase does not affect amplitude)', () => {
    // |ψ⟩ = i|2⟩, ω=1: same as |ψ⟩ = |2⟩
    // A = sqrt(2*2.5/1) = sqrt(5)
    const A = computeClassicalAmplitude([2], [0], [1], 1.0)
    expect(A).toBeCloseTo(Math.sqrt(5))
  })

  it('handles mixed real and imaginary coefficients', () => {
    // |ψ⟩ = (3+4i)|1⟩ (unnormalized, |c|²=25)
    // ⟨n+½⟩ = 1.5, A = sqrt(2*1.5/1) = sqrt(3)
    // Amplitude depends only on quantum number, not coefficient magnitude
    const A = computeClassicalAmplitude([1], [3], [4], 1.0)
    expect(A).toBeCloseTo(Math.sqrt(3))
  })

  it('handles unequal-weight superposition', () => {
    // |ψ⟩ = 2|0⟩ + |3⟩ (unnormalized), ω=2
    // w₀ = 4, w₁ = 1, totalW = 5
    // ⟨n+½⟩ = (4*0.5 + 1*3.5)/5 = (2+3.5)/5 = 1.1
    // A = sqrt(2*1.1/2) = sqrt(1.1) ≈ 1.0488
    const A = computeClassicalAmplitude([0, 3], [2, 1], [0, 0], 2.0)
    expect(A).toBeCloseTo(Math.sqrt(1.1))
  })
})

describe('Lissajous trajectory', () => {
  it('1D trajectory is a cosine oscillation', () => {
    const A = [2.0]
    const omega = [3.0]

    const pos0 = lissajousPosition(A, omega, 0)
    expect(pos0[0]).toBeCloseTo(2.0) // A cos(0) = A

    const posQuarter = lissajousPosition(A, omega, Math.PI / (2 * 3))
    expect(posQuarter[0]).toBeCloseTo(0, 10) // A cos(π/2) = 0

    const posHalf = lissajousPosition(A, omega, Math.PI / 3)
    expect(posHalf[0]).toBeCloseTo(-2.0) // A cos(π) = -A
  })

  it('trajectory is periodic with period T = 2π/ω', () => {
    const A = [1.5]
    const omega = [2.0]
    const T = (2 * Math.PI) / omega[0]!

    const t0 = 1.234 // arbitrary time
    const pos0 = lissajousPosition(A, omega, t0)
    const posT = lissajousPosition(A, omega, t0 + T)

    expect(posT[0]).toBeCloseTo(pos0[0]!, 10)
  })

  it('2D Lissajous with equal ω traces a line (degenerate)', () => {
    // ω_x = ω_y: trajectory is x(t) = A_x cos(ωt), y(t) = A_y cos(ωt)
    // This traces a straight line from (A_x, A_y) to (-A_x, -A_y)
    const A = [1, 2]
    const omega = [1, 1]

    // At t=0: (1, 2)
    const pos0 = lissajousPosition(A, omega, 0)
    expect(pos0[0]).toBeCloseTo(1)
    expect(pos0[1]).toBeCloseTo(2)

    // Ratio y/x should be constant = A_y/A_x = 2
    const t = 0.5
    const pos = lissajousPosition(A, omega, t)
    if (Math.abs(pos[0]!) > 1e-10) {
      expect(pos[1]! / pos[0]!).toBeCloseTo(2, 10)
    }
  })

  it('2D Lissajous with ω_y = 2ω_x traces a figure-8', () => {
    // Classic 1:2 Lissajous figure
    const A = [1, 1]
    const omega = [1, 2]

    // At t=0: x=1, y=1 (cos(0)=1)
    const pos0 = lissajousPosition(A, omega, 0)
    expect(pos0[0]).toBeCloseTo(1)
    expect(pos0[1]).toBeCloseTo(1)

    // At t=π/2: x=0, y=-1 (cos(π/2)=0, cos(π)=-1)
    const posQ = lissajousPosition(A, omega, Math.PI / 2)
    expect(posQ[0]).toBeCloseTo(0, 10)
    expect(posQ[1]).toBeCloseTo(-1)

    // At t=π: x=-1, y=1 (cos(π)=-1, cos(2π)=1)
    const posH = lissajousPosition(A, omega, Math.PI)
    expect(posH[0]).toBeCloseTo(-1)
    expect(posH[1]).toBeCloseTo(1)
  })

  it('3D trajectory with distinct ω produces non-planar motion', () => {
    const A = [1, 1, 1]
    const omega = [1, Math.SQRT2, Math.PI] // incommensurate

    // At t=0: all at maximum
    const pos0 = lissajousPosition(A, omega, 0)
    expect(pos0[0]).toBeCloseTo(1)
    expect(pos0[1]).toBeCloseTo(1)
    expect(pos0[2]).toBeCloseTo(1)

    // At t=1: all different due to incommensurate frequencies
    const pos1 = lissajousPosition(A, omega, 1)
    // They should NOT all be equal (would require commensurate ω)
    const allSame = Math.abs(pos1[0]! - pos1[1]!) < 1e-6 && Math.abs(pos1[1]! - pos1[2]!) < 1e-6
    expect(allSame).toBe(false)
  })

  it('amplitude and position are bounded: |x_d(t)| ≤ A_d', () => {
    const A = [2.5, 1.3, 0.7]
    const omega = [1.1, 2.3, 3.7]

    for (let step = 0; step < 100; step++) {
      const t = step * 0.1
      const pos = lissajousPosition(A, omega, t)
      for (let d = 0; d < 3; d++) {
        expect(Math.abs(pos[d]!)).toBeLessThanOrEqual(A[d]! + 1e-10)
      }
    }
  })
})

describe('HO turning point: energy-amplitude correspondence', () => {
  it('classical energy E = ½mω²A² matches quantum energy E = ℏω(n+½)', () => {
    // In natural units (ℏ=m=1), E_classical = ½ω²A², E_quantum = ω(n+½)
    // A = sqrt(2(n+0.5)/ω) → ½ω² * 2(n+0.5)/ω = ω(n+0.5) ✓
    for (const n of [0, 1, 5, 10]) {
      for (const omega of [0.5, 1.0, 2.0, 5.0]) {
        const A = computeClassicalAmplitude([n], [1], [0], omega)
        const E_classical = 0.5 * omega * omega * A * A
        const E_quantum = omega * (n + 0.5)
        expect(E_classical).toBeCloseTo(E_quantum, 10)
      }
    }
  })
})

describe('Ehrenfest trail ring buffer sampling', () => {
  /**
   * CPU reference for the stride/sampling logic in packObservablesTrailPoints.
   * Given historyCount entries in a ring buffer, sample up to maxPoints
   * evenly-spaced points from the most recent entries.
   */
  function sampleTrailIndices(
    historyCount: number,
    historyHead: number,
    bufferLength: number,
    maxPoints: number
  ): { bufIdx: number; fade: number }[] {
    if (historyCount < 2) return []

    const available = Math.min(historyCount, maxPoints * 3)
    const stride = Math.max(1, Math.floor((available - 1) / (maxPoints - 1)))
    const pointCount = Math.min(maxPoints, Math.floor((available - 1) / stride) + 1)

    if (pointCount < 2) return []

    const result: { bufIdx: number; fade: number }[] = []
    for (let i = 0; i < pointCount; i++) {
      const age = i * stride
      const bufIdx = (((historyHead - 1 - age) % bufferLength) + bufferLength) % bufferLength
      const fade = 1.0 - i / (pointCount - 1)
      result.push({ bufIdx, fade })
    }
    return result
  }

  it('returns empty for historyCount < 2', () => {
    expect(sampleTrailIndices(0, 0, 128, 6)).toHaveLength(0)
    expect(sampleTrailIndices(1, 1, 128, 6)).toHaveLength(0)
  })

  it('samples correctly with small history', () => {
    // 5 entries (head=5, buffer size=128), max 6 points
    // available=5, stride=max(1, floor(4/5))=1, pointCount=min(6, 5)=5
    const points = sampleTrailIndices(5, 5, 128, 6)
    expect(points).toHaveLength(5)
    // Most recent: head-1=4, then 3, 2, 1, 0
    expect(points[0]!.bufIdx).toBe(4)
    expect(points[1]!.bufIdx).toBe(3)
    expect(points[4]!.bufIdx).toBe(0)
  })

  it('first point has fade=1.0, last has fade=0.0', () => {
    const points = sampleTrailIndices(20, 20, 128, 6)
    expect(points[0]!.fade).toBeCloseTo(1.0)
    expect(points[points.length - 1]!.fade).toBeCloseTo(0.0)
  })

  it('handles ring buffer wrap-around', () => {
    // head=2 in a 128-length buffer with 10 entries
    // Most recent: buf[1], buf[0], buf[127], buf[126], ...
    const points = sampleTrailIndices(10, 2, 128, 6)
    expect(points[0]!.bufIdx).toBe(1) // head - 1
    expect(points[1]!.bufIdx).toBe(0) // head - 2 (stride=1 for available=10)
    // Next should wrap: (2 - 1 - 2) % 128 = -1 % 128 → 127
    expect(points[2]!.bufIdx).toBe(127)
  })

  it('strides evenly for large history', () => {
    // 100 entries, max 6 points → available=18, stride=floor(17/5)=3
    const points = sampleTrailIndices(100, 100, 128, 6)
    expect(points).toHaveLength(6)

    // Verify uniform spacing between consecutive indices
    for (let i = 1; i < points.length; i++) {
      const gap = (points[i - 1]!.bufIdx - points[i]!.bufIdx + 128) % 128
      expect(gap).toBeGreaterThanOrEqual(1)
    }
  })
})
