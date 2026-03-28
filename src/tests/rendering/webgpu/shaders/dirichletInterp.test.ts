/**
 * Tests for the Dirichlet kernel interpolation math.
 *
 * Validates the JS reference implementation against known analytical properties
 * of the periodic Dirichlet kernel (sinc interpolation on a periodic lattice).
 * The WGSL shader uses identical math (modulo f32 precision).
 */

import { describe, expect, it } from 'vitest'

// ─── JS reference implementation of the Dirichlet kernel ────────────────

/**
 * Band-limited interpolation kernel for a periodic lattice.
 *
 * Half-Nyquist DFT reconstruction:
 *   K(x) = (1/N) [1 + 2·Σ_{k=1}^{M} cos(2πkx/L) + δ_{even}·cos(Nπx/L)]
 * where M = N/2-1 (even N) or (N-1)/2 (odd N).
 *
 * Closed form:
 *   even N: sin(Nπx/L) · cos(πx/L) / (N · sin(πx/L))
 *   odd N:  sin(Nπx/L) / (N · sin(πx/L))
 */
function dirichletWeight(x: number, N: number, L: number): number {
  const isEven = N % 2 === 0
  const M = isEven ? N / 2 - 1 : (N - 1) / 2
  let sum = 1 // k=0 term
  for (let k = 1; k <= M; k++) {
    sum += 2 * Math.cos((2 * Math.PI * k * x) / L)
  }
  if (isEven) {
    sum += Math.cos((N * Math.PI * x) / L) // half-Nyquist term
  }
  return sum / N
}

/**
 * 1D Dirichlet interpolation on a periodic grid.
 * @param worldX World-space position to evaluate
 * @param values Grid values (length N)
 * @param N Number of grid points
 * @param a Spacing
 */
function dirichletInterp1D(worldX: number, values: number[], N: number, a: number): number {
  const L = N * a
  let result = 0
  for (let i = 0; i < N; i++) {
    const nodePos = i * a - L / 2
    result += values[i]! * dirichletWeight(worldX - nodePos, N, L)
  }
  return result
}

/**
 * 3D Dirichlet interpolation (separable).
 * @param field 3D field in row-major [i*n1*n2 + j*n2 + k]
 */
function dirichletInterp3D(
  wx: number,
  wy: number,
  wz: number,
  field: number[],
  n0: number,
  n1: number,
  n2: number,
  a0: number,
  a1: number,
  a2: number
): number {
  const L0 = n0 * a0
  const L1 = n1 * a1
  const L2 = n2 * a2

  let result = 0
  for (let i = 0; i < n0; i++) {
    const di = dirichletWeight(wx - (i * a0 - L0 / 2), n0, L0)
    for (let j = 0; j < n1; j++) {
      const dij = di * dirichletWeight(wy - (j * a1 - L1 / 2), n1, L1)
      for (let k = 0; k < n2; k++) {
        const dk = dirichletWeight(wz - (k * a2 - L2 / 2), n2, L2)
        result += dij * dk * field[i * n1 * n2 + j * n2 + k]!
      }
    }
  }
  return result
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('dirichletWeight', () => {
  it('returns 1 at x=0 (on-node)', () => {
    expect(dirichletWeight(0, 8, 8 * 0.1)).toBeCloseTo(1.0, 10)
    expect(dirichletWeight(0, 4, 4 * 0.5)).toBeCloseTo(1.0, 10)
    expect(dirichletWeight(0, 16, 16 * 0.1)).toBeCloseTo(1.0, 10)
  })

  it('returns 1 at x=L (periodic wrap)', () => {
    const L = 8 * 0.1
    expect(dirichletWeight(L, 8, L)).toBeCloseTo(1.0, 6)
  })

  it('returns 0 at x = spacing (adjacent node, N>1)', () => {
    // For the periodic Dirichlet kernel, D_N(j·a) = delta_{j,0} for integer j
    const N = 8
    const a = 0.1
    const L = N * a
    for (let j = 1; j < N; j++) {
      expect(dirichletWeight(j * a, N, L)).toBeCloseTo(0, 6)
    }
  })

  it('partition of unity: sum of weights at any point equals 1', () => {
    const N = 8
    const a = 0.1
    const L = N * a
    // Test at several sub-grid positions
    for (const frac of [0.1, 0.25, 0.5, 0.73, 0.99]) {
      let sum = 0
      for (let i = 0; i < N; i++) {
        const nodePos = i * a - L / 2
        sum += dirichletWeight(frac * a - L / 2 - nodePos, N, L)
      }
      // Dirichlet kernel on periodic grid: partition of unity holds
      expect(sum).toBeCloseTo(1.0, 6)
    }
  })

  it('handles N=1 (constant field)', () => {
    expect(dirichletWeight(0, 1, 1.0)).toBeCloseTo(1.0, 10)
    expect(dirichletWeight(0.3, 1, 1.0)).toBeCloseTo(1.0, 6)
  })

  it('handles N=2', () => {
    const N = 2
    const a = 0.5
    const L = N * a
    // At node 0: weight should be 1
    expect(dirichletWeight(0, N, L)).toBeCloseTo(1.0, 10)
    // At node 1 (x=a): weight should be 0
    expect(dirichletWeight(a, N, L)).toBeCloseTo(0, 6)
  })
})

describe('dirichletInterp1D', () => {
  it('reconstructs exact values at grid nodes', () => {
    const N = 8
    const a = 0.1
    const values = [1.0, 0.5, -0.3, 2.1, 0.0, -1.5, 0.8, 0.2]
    const L = N * a

    for (let i = 0; i < N; i++) {
      const nodePos = i * a - L / 2
      const result = dirichletInterp1D(nodePos, values, N, a)
      expect(result).toBeCloseTo(values[i]!, 6)
    }
  })

  it('reconstructs a band-limited signal exactly between nodes', () => {
    // A single Fourier mode: f(x) = cos(2π·x/L) — this is mode k=1
    const N = 8
    const a = 0.1
    const L = N * a

    // Sample at grid nodes
    const values: number[] = []
    for (let i = 0; i < N; i++) {
      const x = i * a - L / 2
      values.push(Math.cos((2 * Math.PI * x) / L))
    }

    // Evaluate at sub-grid positions — should match the analytical cosine
    for (const frac of [0.1, 0.33, 0.5, 0.77]) {
      const x = frac * a - L / 2 + 2 * a // shift to interior
      const expected = Math.cos((2 * Math.PI * x) / L)
      const result = dirichletInterp1D(x, values, N, a)
      expect(result).toBeCloseTo(expected, 4)
    }
  })

  it('reconstructs a multi-mode band-limited signal', () => {
    const N = 16
    const a = 0.1
    const L = N * a

    // f(x) = cos(2π·x/L) + 0.5·sin(4π·x/L) + 0.3·cos(6π·x/L)
    const fn = (x: number) =>
      Math.cos((2 * Math.PI * x) / L) +
      0.5 * Math.sin((4 * Math.PI * x) / L) +
      0.3 * Math.cos((6 * Math.PI * x) / L)

    const values: number[] = []
    for (let i = 0; i < N; i++) {
      values.push(fn(i * a - L / 2))
    }

    // Test at sub-grid positions
    for (let t = 0; t < 20; t++) {
      const x = (t / 20) * L - L / 2
      const expected = fn(x)
      const result = dirichletInterp1D(x, values, N, a)
      expect(result).toBeCloseTo(expected, 4)
    }
  })
})

describe('dirichletInterp3D', () => {
  it('reconstructs exact values at grid nodes', () => {
    const n = 4
    const a = 0.5
    const L = n * a

    // Create a random 3D field
    const field: number[] = []
    for (let i = 0; i < n * n * n; i++) {
      field.push(Math.sin(i * 1.7) * 2.0) // deterministic pseudo-random
    }

    // Check every node
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          const wx = i * a - L / 2
          const wy = j * a - L / 2
          const wz = k * a - L / 2
          const result = dirichletInterp3D(wx, wy, wz, field, n, n, n, a, a, a)
          const expected = field[i * n * n + j * n + k]!
          expect(result).toBeCloseTo(expected, 4)
        }
      }
    }
  })

  it('preserves separability: f(x,y,z) = g(x)·h(y)·p(z)', () => {
    const n = 8
    const a = 0.1
    const L = n * a

    const g = (x: number) => Math.cos((2 * Math.PI * x) / L)
    const h = (y: number) => Math.sin((2 * Math.PI * y) / L)
    const p = (z: number) => Math.cos((4 * Math.PI * z) / L)

    // Sample separable field at nodes
    const field: number[] = []
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          field.push(g(i * a - L / 2) * h(j * a - L / 2) * p(k * a - L / 2))
        }
      }
    }

    // Test at sub-grid positions
    for (let t = 0; t < 5; t++) {
      const wx = (t * 0.17 + 0.05) * L - L / 2
      const wy = (t * 0.23 + 0.1) * L - L / 2
      const wz = (t * 0.31 + 0.2) * L - L / 2
      const expected = g(wx) * h(wy) * p(wz)
      const result = dirichletInterp3D(wx, wy, wz, field, n, n, n, a, a, a)
      expect(result).toBeCloseTo(expected, 3)
    }
  })

  it('works with non-cubic grids', () => {
    const n0 = 4,
      n1 = 8,
      n2 = 6
    const a0 = 0.2,
      a1 = 0.1,
      a2 = 0.15

    // Simple constant field — should interpolate exactly
    const field: number[] = new Array(n0 * n1 * n2).fill(3.14)

    const result = dirichletInterp3D(0, 0, 0, field, n0, n1, n2, a0, a1, a2)
    expect(result).toBeCloseTo(3.14, 4)
  })
})

describe('extra-dimension contraction', () => {
  it('correctly contracts a 5D field to 3D using Dirichlet weights', () => {
    // Simulate a 5D field with grid 4×4×4×4×4, contracting dims 3,4
    const n = 4
    const a = 0.5
    const L = n * a

    // Create a separable 5D field: f = g(x0)·g(x1)·g(x2)·g(x3)·g(x4)
    // where g(x) = cos(2π·x/L)
    const g = (x: number) => Math.cos((2 * Math.PI * x) / L)

    // Build the full 5D field
    const totalSites = n ** 5
    const field5d = new Array(totalSites)
    for (let i0 = 0; i0 < n; i0++) {
      for (let i1 = 0; i1 < n; i1++) {
        for (let i2 = 0; i2 < n; i2++) {
          for (let i3 = 0; i3 < n; i3++) {
            for (let i4 = 0; i4 < n; i4++) {
              const idx = i0 * n ** 4 + i1 * n ** 3 + i2 * n ** 2 + i3 * n + i4
              const x0 = i0 * a - L / 2
              const x1 = i1 * a - L / 2
              const x2 = i2 * a - L / 2
              const x3 = i3 * a - L / 2
              const x4 = i4 * a - L / 2
              field5d[idx] = g(x0) * g(x1) * g(x2) * g(x3) * g(x4)
            }
          }
        }
      }
    }

    // Contract dims 3,4 at slice positions (0.1, -0.05)
    const slicePos3 = 0.1
    const slicePos4 = -0.05
    const contracted3d = new Array(n * n * n)

    for (let i0 = 0; i0 < n; i0++) {
      for (let i1 = 0; i1 < n; i1++) {
        for (let i2 = 0; i2 < n; i2++) {
          let acc = 0
          for (let i3 = 0; i3 < n; i3++) {
            const w3 = dirichletWeight(slicePos3 - (i3 * a - L / 2), n, L)
            for (let i4 = 0; i4 < n; i4++) {
              const w4 = dirichletWeight(slicePos4 - (i4 * a - L / 2), n, L)
              const idx = i0 * n ** 4 + i1 * n ** 3 + i2 * n ** 2 + i3 * n + i4
              acc += w3 * w4 * field5d[idx]!
            }
          }
          contracted3d[i0 * n * n + i1 * n + i2] = acc
        }
      }
    }

    // The contraction of g(x3) at slice=0.1 should give g(0.1)
    // and g(x4) at slice=-0.05 should give g(-0.05)
    const expectedFactor3 = g(slicePos3)
    const expectedFactor4 = g(slicePos4)

    // Check that contracted[i0,i1,i2] = g(x0)·g(x1)·g(x2)·g(slice3)·g(slice4)
    for (let i0 = 0; i0 < n; i0++) {
      for (let i1 = 0; i1 < n; i1++) {
        for (let i2 = 0; i2 < n; i2++) {
          const x0 = i0 * a - L / 2
          const x1 = i1 * a - L / 2
          const x2 = i2 * a - L / 2
          const expected = g(x0) * g(x1) * g(x2) * expectedFactor3 * expectedFactor4
          expect(contracted3d[i0 * n * n + i1 * n + i2]).toBeCloseTo(expected, 3)
        }
      }
    }
  })
})
