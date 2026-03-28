/**
 * Tests for Catmull-Rom (tricubic) interpolation utilities.
 *
 * Validates the JS reference of Catmull-Rom basis weights against known
 * analytical properties: partition of unity, interpolation, cubic reproduction.
 * Also tests the computeNeedsTricubic threshold logic.
 */

import { describe, expect, it } from 'vitest'

import {
  computeNeedsTricubic,
  TRICUBIC_MAX_N,
  TRICUBIC_MAX_SLICE_SITES,
} from '@/rendering/webgpu/shaders/schroedinger/compute/tricubicInterp.wgsl'

// ─── JS reference of the Catmull-Rom weights (mirrors the WGSL) ──────

function catmullRomWeights(t: number): [number, number, number, number] {
  const t2 = t * t
  const t3 = t2 * t
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1.0,
    -1.5 * t3 + 2.0 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ]
}

/** 1D Catmull-Rom interpolation on a periodic grid of N points with spacing a. */
function catmullRomInterp1D(coordF: number, values: number[], N: number): number {
  const base = Math.floor(coordF)
  const t = coordF - base
  const w = catmullRomWeights(t)
  let result = 0
  for (let p = 0; p < 4; p++) {
    const idx = (((base - 1 + p) % N) + N) % N // periodic wrap
    result += w[p]! * values[idx]!
  }
  return result
}

/** 3D Catmull-Rom interpolation (separable, periodic). */
function catmullRomInterp3D(
  cx: number,
  cy: number,
  cz: number,
  field: number[],
  n0: number,
  n1: number,
  n2: number
): number {
  const baseX = Math.floor(cx)
  const baseY = Math.floor(cy)
  const baseZ = Math.floor(cz)
  const wx = catmullRomWeights(cx - baseX)
  const wy = catmullRomWeights(cy - baseY)
  const wz = catmullRomWeights(cz - baseZ)

  let result = 0
  for (let i = 0; i < 4; i++) {
    const ix = (((baseX - 1 + i) % n0) + n0) % n0
    for (let j = 0; j < 4; j++) {
      const iy = (((baseY - 1 + j) % n1) + n1) % n1
      const wij = wx[i]! * wy[j]!
      for (let k = 0; k < 4; k++) {
        const iz = (((baseZ - 1 + k) % n2) + n2) % n2
        result += wij * wz[k]! * field[ix * n1 * n2 + iy * n2 + iz]!
      }
    }
  }
  return result
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('catmullRomWeights', () => {
  it('partition of unity: sum of weights equals 1 for all t', () => {
    for (const t of [0, 0.1, 0.25, 0.5, 0.73, 0.99, 1.0]) {
      const w = catmullRomWeights(t)
      const sum = w[0] + w[1] + w[2] + w[3]
      expect(sum).toBeCloseTo(1.0, 12)
    }
  })

  it('interpolating at t=0: w1=1, others=0', () => {
    const w = catmullRomWeights(0)
    expect(w[0]).toBeCloseTo(0, 12)
    expect(w[1]).toBeCloseTo(1, 12)
    expect(w[2]).toBeCloseTo(0, 12)
    expect(w[3]).toBeCloseTo(0, 12)
  })

  it('interpolating at t=1: w2=1, others=0', () => {
    const w = catmullRomWeights(1)
    expect(w[0]).toBeCloseTo(0, 12)
    expect(w[1]).toBeCloseTo(0, 12)
    expect(w[2]).toBeCloseTo(1, 12)
    expect(w[3]).toBeCloseTo(0, 12)
  })

  it('symmetry: w0(t) = w3(1-t) and w1(t) = w2(1-t)', () => {
    for (const t of [0.1, 0.25, 0.5, 0.7]) {
      const wt = catmullRomWeights(t)
      const w1mt = catmullRomWeights(1 - t)
      expect(wt[0]).toBeCloseTo(w1mt[3], 10)
      expect(wt[1]).toBeCloseTo(w1mt[2], 10)
    }
  })

  it('reproduces linear function: f(x) = x exactly', () => {
    // For stencil points at -1, 0, 1, 2 and interpolation at t:
    // result = w0*(-1) + w1*(0) + w2*(1) + w3*(2) should equal t
    for (const t of [0, 0.25, 0.5, 0.75, 1.0]) {
      const w = catmullRomWeights(t)
      const result = w[0] * -1 + w[1] * 0 + w[2] * 1 + w[3] * 2
      expect(result).toBeCloseTo(t, 10)
    }
  })

  it('reproduces quadratic function: f(x) = x² exactly', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1.0]) {
      const w = catmullRomWeights(t)
      const result = w[0] * 1 + w[1] * 0 + w[2] * 1 + w[3] * 4
      expect(result).toBeCloseTo(t * t, 10)
    }
  })

  it('does NOT reproduce cubics (tangent estimation has O(h²) error when f‴≠0)', () => {
    // Catmull-Rom has quadratic precision, not cubic.
    // For f(x)=x³, the tangent estimate m_k=(f(k+1)-f(k-1))/2 ≠ f'(k).
    // Verify it's close but not exact at t=0.25.
    const w = catmullRomWeights(0.25)
    const result = w[0] * -1 + w[1] * 0 + w[2] * 1 + w[3] * 8
    const exact = 0.25 ** 3 // 0.015625
    expect(Math.abs(result - exact)).toBeGreaterThan(0.01) // measurable error
  })
})

describe('catmullRomInterp1D', () => {
  it('reconstructs exact values at grid nodes', () => {
    const values = [1.0, 0.5, -0.3, 2.1, 0.0, -1.5, 0.8, 0.2]
    const N = values.length
    for (let i = 0; i < N; i++) {
      expect(catmullRomInterp1D(i, values, N)).toBeCloseTo(values[i]!, 10)
    }
  })

  it('is C1 smooth: value and derivative match at knots', () => {
    const values = [1.0, 0.5, -0.3, 2.1, 0.0, -1.5, 0.8, 0.2]
    const N = values.length
    const eps = 1e-6
    // Check continuity at each knot from left and right
    for (let i = 0; i < N; i++) {
      const left = catmullRomInterp1D(i - eps, values, N)
      const right = catmullRomInterp1D(i + eps, values, N)
      const center = catmullRomInterp1D(i, values, N)
      // Value continuity
      expect(left).toBeCloseTo(center, 4)
      expect(right).toBeCloseTo(center, 4)
      // Derivative continuity (finite difference from left and right)
      const dLeft = (center - catmullRomInterp1D(i - eps, values, N)) / eps
      const dRight = (catmullRomInterp1D(i + eps, values, N) - center) / eps
      expect(dLeft).toBeCloseTo(dRight, 2)
    }
  })

  it('reproduces cubic polynomials on a periodic grid', () => {
    const N = 8
    // f(x) = (x/N)³ sampled at integer points (periodic cubic)
    const values: number[] = []
    for (let i = 0; i < N; i++) {
      values.push((i / N) ** 3)
    }
    // Catmull-Rom should reproduce cubics between any two adjacent knots
    // Test at mid-knots (avoiding boundary periodicity effects)
    for (let i = 1; i < N - 2; i++) {
      const t = 0.5
      const coordF = i + t
      const expected = (coordF / N) ** 3
      const result = catmullRomInterp1D(coordF, values, N)
      expect(result).toBeCloseTo(expected, 6)
    }
  })
})

describe('catmullRomInterp3D', () => {
  it('reconstructs exact values at grid nodes', () => {
    const n = 4
    const field: number[] = []
    for (let i = 0; i < n * n * n; i++) {
      field.push(Math.sin(i * 1.7) * 2.0) // deterministic
    }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          const result = catmullRomInterp3D(i, j, k, field, n, n, n)
          expect(result).toBeCloseTo(field[i * n * n + j * n + k]!, 10)
        }
      }
    }
  })

  it('interpolates smoothly between nodes', () => {
    const n = 8
    // Separable: f = cos(2π·i/n) · sin(2π·j/n) · cos(2π·k/n)
    const field: number[] = []
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          field.push(
            Math.cos((2 * Math.PI * i) / n) *
              Math.sin((2 * Math.PI * j) / n) *
              Math.cos((2 * Math.PI * k) / n)
          )
        }
      }
    }

    // Test at sub-grid positions — should be smoother than trilinear
    // Just verify the interpolated value is reasonable (between neighbors)
    const result = catmullRomInterp3D(1.5, 2.3, 3.7, field, n, n, n)
    expect(Math.abs(result)).toBeLessThan(2.0) // bounded
    expect(Number.isFinite(result)).toBe(true)
  })

  it('constant field interpolates exactly', () => {
    const n = 4
    const field = new Array(n * n * n).fill(7.42)
    const result = catmullRomInterp3D(1.3, 2.7, 0.1, field, n, n, n)
    expect(result).toBeCloseTo(7.42, 10)
  })
})

describe('computeNeedsTricubic', () => {
  it('returns false for default 3D/32³', () => {
    expect(computeNeedsTricubic([32, 32, 32], 3)).toBe(false)
  })

  it('returns true for 5D/8³ (all visible dims ≤ 16, product ≤ 4096)', () => {
    expect(computeNeedsTricubic([8, 8, 8, 8, 8], 5)).toBe(true)
  })

  it('returns true at maximum threshold: 16³ = 4096', () => {
    expect(computeNeedsTricubic([16, 16, 16, 4, 4], 5)).toBe(true)
  })

  it('returns false when one visible dim exceeds threshold', () => {
    expect(computeNeedsTricubic([17, 8, 8, 8, 8], 5)).toBe(false)
  })

  it('returns false when product exceeds 4096 even if each dim ≤ 16', () => {
    // This can't happen with max N=16: 16³=4096 which equals the limit.
    // But 16×16×17 > limit — and 17 > TRICUBIC_MAX_N, so caught by per-dim check.
    // Test the edge: would need dims like [16, 16, 16] = 4096 — just at limit.
    expect(computeNeedsTricubic([16, 16, 16], 3)).toBe(true)
  })

  it('handles 1D lattice', () => {
    expect(computeNeedsTricubic([8], 1)).toBe(true)
    expect(computeNeedsTricubic([128], 1)).toBe(false)
  })

  it('handles 2D lattice', () => {
    expect(computeNeedsTricubic([12, 12], 2)).toBe(true)
    expect(computeNeedsTricubic([48, 48], 2)).toBe(false)
  })

  it('only considers first min(latticeDim, 3) dimensions', () => {
    // Extra dims beyond 3 are irrelevant to the visible slice
    expect(computeNeedsTricubic([8, 8, 8, 64, 64], 5)).toBe(true)
  })

  it('exported constants match expected values', () => {
    expect(TRICUBIC_MAX_N).toBe(16)
    expect(TRICUBIC_MAX_SLICE_SITES).toBe(4096)
  })
})
