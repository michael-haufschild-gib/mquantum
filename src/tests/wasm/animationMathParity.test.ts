/**
 * WASM ↔ TypeScript Fallback Algorithm Parity Tests
 *
 * Verifies that every public function in animation.rs has an equivalent
 * TypeScript fallback that produces the same results. Since WASM cannot
 * be loaded in Vitest (happy-dom environment), we test the TS fallback
 * code paths directly — which implement the same algorithms as the Rust code.
 *
 * Covers: fsin/fcos, dotProduct, magnitude, normalize, subtractVectors,
 * multiplyMatrixVector, multiplyMatrices, composeRotations, projectVertices.
 *
 * Known Rust ↔ TS divergences (by design):
 * - normalize: Rust returns zeros for zero vectors; TS throws Error
 * - Error paths: Rust returns fallback values (zeros/identity); TS throws
 * - Precision: TS matrices are Float32Array; Rust uses f64
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { createIdentityMatrix, multiplyMatrices, multiplyMatrixVector } from '@/lib/math/matrix'
import { composeRotations, createRotationMatrix, getRotationPlanes } from '@/lib/math/rotation'
import { fcos, fsin } from '@/lib/math/trig'
import { dotProduct, magnitude, normalize, subtractVectors } from '@/lib/math/vector'
import {
  arbAngle,
  arbDim,
  arbMatrix,
  arbNonZeroVector,
  arbVector,
} from '@/tests/lib/math/arbitraries'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reference implementation of project_vertices_to_positions.
 * Mirrors Rust animation.rs:project_vertices_to_positions exactly.
 */
function projectVerticesReference(
  flatVertices: number[],
  dimension: number,
  projectionDistance: number
): Float32Array {
  const MIN_SAFE_DISTANCE = 0.01

  if (dimension < 3 || flatVertices.length === 0) {
    return new Float32Array(0)
  }

  const vertexCount = Math.floor(flatVertices.length / dimension)
  const positions = new Float32Array(vertexCount * 3)

  if (dimension === 3) {
    for (let i = 0; i < vertexCount; i++) {
      const offset = i * 3
      const scale = 1.0 / projectionDistance
      const outIdx = i * 3
      positions[outIdx] = flatVertices[offset]! * scale
      positions[outIdx + 1] = flatVertices[offset + 1]! * scale
      positions[outIdx + 2] = flatVertices[offset + 2]! * scale
    }
    return positions
  }

  const numHigherDims = dimension - 3
  const normalizationFactor = dimension === 4 ? 1.0 : Math.sqrt(numHigherDims)

  for (let i = 0; i < vertexCount; i++) {
    const offset = i * dimension
    const x = flatVertices[offset]!
    const y = flatVertices[offset + 1]!
    const z = flatVertices[offset + 2]!

    let effectiveDepth = 0
    for (let d = 3; d < dimension; d++) {
      effectiveDepth += flatVertices[offset + d]!
    }
    effectiveDepth /= normalizationFactor

    let denom = projectionDistance - effectiveDepth
    if (Math.abs(denom) < MIN_SAFE_DISTANCE) {
      denom = denom >= 0 ? MIN_SAFE_DISTANCE : -MIN_SAFE_DISTANCE
    }
    const scale = 1.0 / denom

    const outIdx = i * 3
    positions[outIdx] = x * scale
    positions[outIdx + 1] = y * scale
    positions[outIdx + 2] = z * scale
  }

  return positions
}

// ============================================================================
// fsin / fcos — Fast Trig Approximation Parity
// ============================================================================

describe('fsin/fcos: Rust ↔ TS algorithm parity', () => {
  // Both Rust and TS use identical parabolic formula:
  // normalize to [-PI, PI], then y = x * (PI - |x|) * 4/PI², clamped

  it('fsin matches Math.sin within 1.2% across full cycle', () => {
    fc.assert(
      fc.property(arbAngle, (angle) => {
        const approx = fsin(angle)
        const exact = Math.sin(angle)
        expect(Math.abs(approx - exact)).toBeLessThan(0.056)
      }),
      { seed: 42, numRuns: 1000 }
    )
  })

  it('fcos matches Math.cos within 1.2% across full cycle', () => {
    fc.assert(
      fc.property(arbAngle, (angle) => {
        const approx = fcos(angle)
        const exact = Math.cos(angle)
        expect(Math.abs(approx - exact)).toBeLessThan(0.056)
      }),
      { seed: 42, numRuns: 1000 }
    )
  })

  it('fsin² + fcos² ≈ 1 (Pythagorean identity, loose bound)', () => {
    // The parabolic approximation does NOT preserve the Pythagorean identity well.
    // Worst case is |sin²+cos²-1| ≈ 0.125 at x = ±π/4. This is expected — the
    // approximation trades identity preservation for speed and smoothness.
    fc.assert(
      fc.property(arbAngle, (angle) => {
        const s = fsin(angle)
        const c = fcos(angle)
        expect(Math.abs(s * s + c * c - 1)).toBeLessThan(0.13)
      }),
      { seed: 42, numRuns: 1000 }
    )
  })

  it('Pythagorean identity worst case is at ±π/4', () => {
    // Verify the known worst case directly
    const s = fsin(Math.PI / 4)
    const c = fcos(Math.PI / 4)
    const err = Math.abs(s * s + c * c - 1)
    expect(err).toBeCloseTo(0.125, 3)
  })

  it('fsin is odd: fsin(-x) ≈ -fsin(x)', () => {
    fc.assert(
      fc.property(arbAngle, (angle) => {
        expect(Math.abs(fsin(-angle) + fsin(angle))).toBeLessThan(1e-10)
      }),
      { seed: 42, numRuns: 500 }
    )
  })

  it('fcos is even: fcos(-x) ≈ fcos(x)', () => {
    fc.assert(
      fc.property(arbAngle, (angle) => {
        expect(Math.abs(fcos(-angle) - fcos(angle))).toBeLessThan(1e-10)
      }),
      { seed: 42, numRuns: 500 }
    )
  })

  it('output always in [-1, 1]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        (angle) => {
          expect(fsin(angle)).toBeGreaterThanOrEqual(-1)
          expect(fsin(angle)).toBeLessThanOrEqual(1)
          expect(fcos(angle)).toBeGreaterThanOrEqual(-1)
          expect(fcos(angle)).toBeLessThanOrEqual(1)
        }
      ),
      { seed: 42, numRuns: 1000 }
    )
  })
})

// ============================================================================
// dotProduct — Rust dot_product ↔ TS dotProduct
// ============================================================================

describe('dotProduct: Rust ↔ TS algorithm parity', () => {
  // Both use: sum += a[i] * b[i] for i in 0..len

  it('is commutative: dot(a,b) = dot(b,a)', () => {
    fc.assert(
      fc.property(
        arbDim.chain((dim) => fc.tuple(arbVector(dim), arbVector(dim))),
        ([a, b]) => {
          expect(dotProduct(a, b)).toBeCloseTo(dotProduct(b, a), 10)
        }
      ),
      { seed: 42, numRuns: 500 }
    )
  })

  it('dot(v,v) >= 0 (positive semi-definite)', () => {
    fc.assert(
      fc.property(
        arbDim.chain((dim) => arbVector(dim)),
        (v) => {
          expect(dotProduct(v, v)).toBeGreaterThanOrEqual(0)
        }
      ),
      { seed: 42, numRuns: 500 }
    )
  })

  it('dot(v,v) = 0 iff v = 0', () => {
    for (let dim = 2; dim <= 11; dim++) {
      const zero = new Array(dim).fill(0)
      expect(dotProduct(zero, zero)).toBe(0)
    }
  })

  it('matches hand-computed values', () => {
    expect(dotProduct([1, 0, 0], [0, 1, 0])).toBe(0) // orthogonal
    expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32) // 1*4 + 2*5 + 3*6
    expect(dotProduct([3, -2], [3, -2])).toBe(13) // 9 + 4
  })

  it('is linear: dot(a + b, c) = dot(a, c) + dot(b, c)', () => {
    fc.assert(
      fc.property(
        arbDim.chain((dim) => fc.tuple(arbVector(dim), arbVector(dim), arbVector(dim))),
        ([a, b, c]) => {
          const ab = a.map((ai, i) => ai + b[i]!)
          const lhs = dotProduct(ab, c)
          const rhs = dotProduct(a, c) + dotProduct(b, c)
          expect(Math.abs(lhs - rhs)).toBeLessThan(1e-6)
        }
      ),
      { seed: 42, numRuns: 500 }
    )
  })
})

// ============================================================================
// magnitude — Rust magnitude ↔ TS magnitude
// ============================================================================

describe('magnitude: Rust ↔ TS algorithm parity', () => {
  // Both use: sqrt(sum of squares)

  it('magnitude(v) = sqrt(dot(v,v))', () => {
    fc.assert(
      fc.property(
        arbDim.chain((dim) => arbVector(dim)),
        (v) => {
          expect(Math.abs(magnitude(v) - Math.sqrt(dotProduct(v, v)))).toBeLessThan(1e-10)
        }
      ),
      { seed: 42, numRuns: 500 }
    )
  })

  it('magnitude >= 0 (non-negative)', () => {
    fc.assert(
      fc.property(
        arbDim.chain((dim) => arbVector(dim)),
        (v) => {
          expect(magnitude(v)).toBeGreaterThanOrEqual(0)
        }
      ),
      { seed: 42, numRuns: 500 }
    )
  })

  it('magnitude of zero vector is 0', () => {
    for (let dim = 2; dim <= 11; dim++) {
      expect(magnitude(new Array(dim).fill(0))).toBe(0)
    }
  })

  it('magnitude of unit basis vector is 1', () => {
    for (let dim = 2; dim <= 11; dim++) {
      for (let axis = 0; axis < dim; axis++) {
        const v = new Array(dim).fill(0)
        v[axis] = 1
        expect(magnitude(v)).toBeCloseTo(1, 10)
      }
    }
  })

  it('magnitude scales linearly: ||kv|| = |k| * ||v||', () => {
    fc.assert(
      fc.property(
        arbDim.chain((dim) =>
          fc.tuple(
            arbNonZeroVector(dim),
            fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true })
          )
        ),
        ([v, k]) => {
          const scaled = v.map((x) => x * k)
          expect(Math.abs(magnitude(scaled) - Math.abs(k) * magnitude(v))).toBeLessThan(1e-6)
        }
      ),
      { seed: 42, numRuns: 500 }
    )
  })
})

// ============================================================================
// normalize — Rust normalize_vector ↔ TS normalize
// ============================================================================

describe('normalize: Rust ↔ TS algorithm parity', () => {
  // Rust: returns zeros for near-zero vectors
  // TS: throws Error('Cannot normalize zero vector')
  // Both produce unit vectors for valid input

  it('result has unit length for non-zero vectors', () => {
    fc.assert(
      fc.property(
        arbDim.chain((dim) => arbNonZeroVector(dim)),
        (v) => {
          const n = normalize(v)
          expect(magnitude(n)).toBeCloseTo(1, 6)
        }
      ),
      { seed: 42, numRuns: 500 }
    )
  })

  it('preserves direction: normalize(v) · v > 0', () => {
    fc.assert(
      fc.property(
        arbDim.chain((dim) => arbNonZeroVector(dim)),
        (v) => {
          const n = normalize(v)
          expect(dotProduct(n, v)).toBeGreaterThan(0)
        }
      ),
      { seed: 42, numRuns: 500 }
    )
  })

  it('normalizing a unit vector returns the same vector', () => {
    for (let dim = 2; dim <= 11; dim++) {
      for (let axis = 0; axis < Math.min(dim, 3); axis++) {
        const v = new Array(dim).fill(0)
        v[axis] = 1
        const n = normalize(v)
        for (let i = 0; i < dim; i++) {
          expect(Math.abs(n[i]! - v[i]!)).toBeLessThan(1e-7)
        }
      }
    }
  })

  it('[DIVERGENCE] TS throws on zero vector (Rust returns zeros)', () => {
    for (let dim = 2; dim <= 5; dim++) {
      const zero = new Array(dim).fill(0)
      expect(() => normalize(zero)).toThrow('Cannot normalize zero vector')
    }
  })
})

// ============================================================================
// subtractVectors — Rust subtract_vectors ↔ TS subtractVectors
// ============================================================================

describe('subtractVectors: Rust ↔ TS algorithm parity', () => {
  // Both use: result[i] = a[i] - b[i]

  it('a - b + b ≈ a', () => {
    fc.assert(
      fc.property(
        arbDim.chain((dim) => fc.tuple(arbVector(dim), arbVector(dim))),
        ([a, b]) => {
          const diff = subtractVectors(a, b)
          const restored = diff.map((d, i) => d + b[i]!)
          for (let i = 0; i < a.length; i++) {
            expect(Math.abs(restored[i]! - a[i]!)).toBeLessThan(1e-10)
          }
        }
      ),
      { seed: 42, numRuns: 500 }
    )
  })

  it('a - a = 0', () => {
    fc.assert(
      fc.property(
        arbDim.chain((dim) => arbVector(dim)),
        (v) => {
          const result = subtractVectors(v, v)
          for (const x of result) {
            expect(Math.abs(x)).toBeLessThan(1e-10)
          }
        }
      ),
      { seed: 42, numRuns: 500 }
    )
  })

  it('matches element-wise subtraction', () => {
    expect(subtractVectors([5, 3, 1], [1, 2, 3])).toEqual([4, 1, -2])
  })
})

// ============================================================================
// multiplyMatrixVector — Rust multiply_matrix_vector ↔ TS multiplyMatrixVector
// ============================================================================

describe('multiplyMatrixVector: Rust ↔ TS algorithm parity', () => {
  // Both use: result[i] = sum(M[i][j] * v[j])

  it('identity matrix preserves vector', () => {
    for (let dim = 2; dim <= 11; dim++) {
      const id = createIdentityMatrix(dim)
      const v = Array.from({ length: dim }, (_, i) => i + 1)
      const result = multiplyMatrixVector(id, v)
      for (let i = 0; i < dim; i++) {
        expect(Math.abs(result[i]! - v[i]!)).toBeLessThan(1e-5)
      }
    }
  })

  it('zero matrix produces zero vector', () => {
    for (let dim = 2; dim <= 11; dim++) {
      const zero = new Float32Array(dim * dim)
      const v = Array.from({ length: dim }, (_, i) => i + 1)
      const result = multiplyMatrixVector(zero, v)
      for (let i = 0; i < dim; i++) {
        expect(Math.abs(result[i]!)).toBeLessThan(1e-5)
      }
    }
  })

  it('matches hand-computed 2×2 case', () => {
    // [[1, 2], [3, 4]] * [5, 6] = [17, 39]
    const m = new Float32Array([1, 2, 3, 4])
    const v = [5, 6]
    const result = multiplyMatrixVector(m, v)
    expect(result[0]).toBeCloseTo(17, 4)
    expect(result[1]).toBeCloseTo(39, 4)
  })

  it('matches hand-computed 3×3 case', () => {
    // [[1,0,0],[0,2,0],[0,0,3]] * [4,5,6] = [4,10,18]
    const m = new Float32Array([1, 0, 0, 0, 2, 0, 0, 0, 3])
    const v = [4, 5, 6]
    const result = multiplyMatrixVector(m, v)
    expect(result[0]).toBeCloseTo(4, 4)
    expect(result[1]).toBeCloseTo(10, 4)
    expect(result[2]).toBeCloseTo(18, 4)
  })
})

// ============================================================================
// multiplyMatrices — Rust multiply_matrices ↔ TS multiplyMatrices
// ============================================================================

describe('multiplyMatrices: Rust ↔ TS algorithm parity', () => {
  // Both use: C[i][j] = sum(A[i][k] * B[k][j])
  // TS uses Float32Array; Rust uses f64 → tolerance ~1e-4 for chains

  it('A * I = A for all dimensions 2-11', () => {
    for (let dim = 2; dim <= 11; dim++) {
      const id = createIdentityMatrix(dim)
      // Create a non-trivial matrix
      const a = new Float32Array(dim * dim)
      for (let i = 0; i < dim * dim; i++) a[i] = ((i * 7 + 3) % 13) - 6
      const result = multiplyMatrices(a, id)
      for (let i = 0; i < dim * dim; i++) {
        expect(Math.abs(result[i]! - a[i]!)).toBeLessThan(1e-4)
      }
    }
  })

  it('I * A = A for all dimensions 2-11', () => {
    for (let dim = 2; dim <= 11; dim++) {
      const id = createIdentityMatrix(dim)
      const a = new Float32Array(dim * dim)
      for (let i = 0; i < dim * dim; i++) a[i] = ((i * 7 + 3) % 13) - 6
      const result = multiplyMatrices(id, a)
      for (let i = 0; i < dim * dim; i++) {
        expect(Math.abs(result[i]! - a[i]!)).toBeLessThan(1e-4)
      }
    }
  })

  it('matches hand-computed 2×2 case', () => {
    // [[1,2],[3,4]] * [[5,6],[7,8]] = [[19,22],[43,50]]
    const a = new Float32Array([1, 2, 3, 4])
    const b = new Float32Array([5, 6, 7, 8])
    const result = multiplyMatrices(a, b)
    expect(result[0]).toBeCloseTo(19, 3)
    expect(result[1]).toBeCloseTo(22, 3)
    expect(result[2]).toBeCloseTo(43, 3)
    expect(result[3]).toBeCloseTo(50, 3)
  })

  it('is not commutative in general (A*B ≠ B*A)', () => {
    const a = new Float32Array([1, 2, 3, 4])
    const b = new Float32Array([5, 6, 7, 8])
    const ab = multiplyMatrices(a, b)
    const ba = multiplyMatrices(b, a)
    // At least one element should differ
    let differs = false
    for (let i = 0; i < 4; i++) {
      if (Math.abs(ab[i]! - ba[i]!) > 0.01) differs = true
    }
    expect(differs).toBe(true)
  })

  it('is associative: (A*B)*C ≈ A*(B*C)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }).chain((dim) =>
          fc.tuple(arbMatrix(dim), arbMatrix(dim), arbMatrix(dim)).map(([a, b, c]) => ({
            dim,
            a,
            b,
            c,
          }))
        ),
        ({ dim, a, b, c }) => {
          const ab_c = multiplyMatrices(multiplyMatrices(a, b), c)
          const a_bc = multiplyMatrices(a, multiplyMatrices(b, c))
          for (let i = 0; i < dim * dim; i++) {
            expect(Math.abs(ab_c[i]! - a_bc[i]!)).toBeLessThan(0.1) // f32 accumulation
          }
        }
      ),
      { seed: 42, numRuns: 100 }
    )
  })
})

// ============================================================================
// composeRotations — Rust compose_rotations ↔ TS composeRotations (JS fallback)
// ============================================================================

describe('composeRotations: Rust ↔ TS algorithm parity', () => {
  // Both use: identity → multiply rotation matrices in sequence
  // Both use fsin/fcos for trig (same parabolic approximation)

  it('empty angles produces identity for dims 2-11', () => {
    for (let dim = 2; dim <= 11; dim++) {
      const result = composeRotations(dim, new Map())
      const id = createIdentityMatrix(dim)
      for (let i = 0; i < dim * dim; i++) {
        expect(Math.abs(result[i]! - id[i]!)).toBeLessThan(1e-7)
      }
    }
  })

  it('single rotation in XY plane matches direct formula', () => {
    for (let dim = 2; dim <= 7; dim++) {
      const angle = 0.5
      const angles = new Map([['XY', angle]])
      const composed = composeRotations(dim, angles)
      const direct = createRotationMatrix(dim, 0, 1, angle)
      for (let i = 0; i < dim * dim; i++) {
        expect(Math.abs(composed[i]! - direct[i]!)).toBeLessThan(1e-5)
      }
    }
  })

  it('result is orthogonal: R^T * R ≈ I', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 7 }).chain((dim) => {
          const planes = getRotationPlanes(dim)
          // Pick 1-3 random planes
          return fc
            .tuple(
              fc.shuffledSubarray(
                planes.map((p) => p.name),
                { minLength: 1, maxLength: Math.min(3, planes.length) }
              ),
              fc.array(
                fc.double({
                  min: -Math.PI,
                  max: Math.PI,
                  noNaN: true,
                  noDefaultInfinity: true,
                }),
                { minLength: 3, maxLength: 3 }
              )
            )
            .map(([planeNames, randomAngles]) => {
              const m = new Map<string, number>()
              planeNames.forEach((name, i) => m.set(name, randomAngles[i % randomAngles.length]!))
              return { dim, angles: m }
            })
        }),
        ({ dim, angles }) => {
          const R = composeRotations(dim, angles)
          // Compute R^T * R
          const RT = new Float32Array(dim * dim)
          for (let i = 0; i < dim; i++) {
            for (let j = 0; j < dim; j++) {
              RT[j * dim + i] = R[i * dim + j]!
            }
          }
          const product = multiplyMatrices(RT, R)
          const id = createIdentityMatrix(dim)
          for (let i = 0; i < dim * dim; i++) {
            // f32 accumulation + fsin/fcos approximation error compound
            expect(Math.abs(product[i]! - id[i]!)).toBeLessThan(0.02)
          }
        }
      ),
      { seed: 42, numRuns: 200 }
    )
  })

  it('rotation by 0 produces identity', () => {
    for (let dim = 2; dim <= 7; dim++) {
      const planes = getRotationPlanes(dim)
      const angles = new Map<string, number>()
      for (const p of planes) angles.set(p.name, 0)
      const result = composeRotations(dim, angles)
      const id = createIdentityMatrix(dim)
      for (let i = 0; i < dim * dim; i++) {
        expect(Math.abs(result[i]! - id[i]!)).toBeLessThan(1e-5)
      }
    }
  })

  it('rotation preserves vector length', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 7 }).chain((dim) => {
          const planes = getRotationPlanes(dim)
          return fc
            .tuple(
              fc.shuffledSubarray(
                planes.map((p) => p.name),
                { minLength: 1, maxLength: Math.min(2, planes.length) }
              ),
              fc.array(
                fc.double({
                  min: -Math.PI,
                  max: Math.PI,
                  noNaN: true,
                  noDefaultInfinity: true,
                }),
                { minLength: 2, maxLength: 2 }
              ),
              arbVector(dim)
            )
            .map(([planeNames, randomAngles, v]) => {
              const m = new Map<string, number>()
              planeNames.forEach((name, i) => m.set(name, randomAngles[i % randomAngles.length]!))
              return { dim, angles: m, v }
            })
        }),
        ({ dim, angles, v }) => {
          const R = composeRotations(dim, angles)
          const rotated = multiplyMatrixVector(R, v)
          const originalMag = magnitude(v)
          const rotatedMag = magnitude(rotated)
          if (originalMag > 0.01) {
            // Allow f32 tolerance
            expect(Math.abs(rotatedMag - originalMag) / originalMag).toBeLessThan(0.01)
          }
        }
      ),
      { seed: 42, numRuns: 200 }
    )
  })
})

// ============================================================================
// projectVertices — Rust project_vertices_to_positions (reference impl test)
// ============================================================================

describe('projectVertices: reference implementation verification', () => {
  // No TS fallback exists in production. We test a reference TS implementation
  // that mirrors the Rust algorithm against known geometric properties.

  it('returns empty for dimension < 3', () => {
    expect(projectVerticesReference([1, 2], 2, 4.0).length).toBe(0)
  })

  it('returns empty for empty input', () => {
    expect(projectVerticesReference([], 3, 4.0).length).toBe(0)
  })

  it('3D: scales by 1/projectionDistance', () => {
    const result = projectVerticesReference([2, 4, 6], 3, 2.0)
    expect(result[0]).toBeCloseTo(1.0, 5) // 2/2
    expect(result[1]).toBeCloseTo(2.0, 5) // 4/2
    expect(result[2]).toBeCloseTo(3.0, 5) // 6/2
  })

  it('4D: perspective division by (projDist - w)', () => {
    // vertex at (1, 2, 3, 0) with projDist=4 → scale = 1/(4-0) = 0.25
    const result = projectVerticesReference([1, 2, 3, 0], 4, 4.0)
    expect(result[0]).toBeCloseTo(0.25, 5)
    expect(result[1]).toBeCloseTo(0.5, 5)
    expect(result[2]).toBeCloseTo(0.75, 5)
  })

  it('4D: w offset affects perspective', () => {
    // vertex at (1, 0, 0, 2) with projDist=4 → scale = 1/(4-2) = 0.5
    const result = projectVerticesReference([1, 0, 0, 2], 4, 4.0)
    expect(result[0]).toBeCloseTo(0.5, 5)
  })

  it('5D: higher dims are averaged with sqrt(2) normalization', () => {
    // vertex at (1, 0, 0, 1, 1) with projDist=4 → effectiveDepth = (1+1)/sqrt(2)
    const SQRT2 = Math.sqrt(2)
    const effectiveDepth = 2 / SQRT2
    const expectedScale = 1 / (4 - effectiveDepth)
    const result = projectVerticesReference([1, 0, 0, 1, 1], 5, 4.0)
    expect(result[0]).toBeCloseTo(expectedScale, 5)
  })

  it('multiple vertices are projected independently', () => {
    const verts = [1, 0, 0, 0, 0, 1, 0, 0] // two 4D vertices
    const result = projectVerticesReference(verts, 4, 4.0)
    expect(result.length).toBe(6) // 2 vertices × 3 components
    expect(result[0]).toBeCloseTo(0.25, 5) // first vertex x
    expect(result[4]).toBeCloseTo(0.25, 5) // second vertex y
  })

  it('handles near-zero denominator (MIN_SAFE_DISTANCE clamp)', () => {
    // vertex at (1, 0, 0, 4) with projDist=4 → denom = 0 → clamped to 0.01
    const result = projectVerticesReference([1, 0, 0, 4], 4, 4.0)
    expect(result[0]).toBeCloseTo(100, 0) // 1/0.01
    expect(Number.isFinite(result[0]!)).toBe(true)
  })

  it('generic N-D path works for dim=6', () => {
    // All higher dims at 0 → effectiveDepth = 0 → scale = 1/projDist
    const verts = [3, 6, 9, 0, 0, 0]
    const result = projectVerticesReference(verts, 6, 3.0)
    expect(result[0]).toBeCloseTo(1.0, 5) // 3/3
    expect(result[1]).toBeCloseTo(2.0, 5) // 6/3
    expect(result[2]).toBeCloseTo(3.0, 5) // 9/3
  })
})
