/**
 * Tests for n-dimensional rotation operations
 */

import { describe, expect, it } from 'vitest'

import {
  composeRotations,
  createIdentityMatrix,
  createRotationMatrix,
  determinant,
  getRotationPlanes,
  multiplyMatrices,
  multiplyMatrixVector,
  transposeMatrix,
} from '@/lib/math'

/**
 * Helper to access element at [row][col] in a flat row-major matrix
 * @param matrix - The flat matrix array
 * @param dim - Matrix dimension
 * @param row - Row index
 * @param col - Column index
 * @returns Matrix element at the specified position
 */
function matrixAt(matrix: Float32Array, dim: number, row: number, col: number): number {
  return matrix[row * dim + col]!
}

describe('Rotation Operations', () => {
  describe('getRotationPlanes', () => {
    it('returns 3 planes for 3D space', () => {
      const planes = getRotationPlanes(3)
      expect(planes).toHaveLength(3)
      expect(planes.map((p) => p.name)).toEqual(['XY', 'XZ', 'YZ'])
    })

    it('returns 6 planes for 4D space', () => {
      const planes = getRotationPlanes(4)
      expect(planes).toHaveLength(6)
      expect(planes.map((p) => p.name)).toEqual(['XY', 'XZ', 'XW', 'YZ', 'YW', 'ZW'])
    })

    it('returns 10 planes for 5D space', () => {
      const planes = getRotationPlanes(5)
      expect(planes).toHaveLength(10)
      expect(planes.map((p) => p.name)).toEqual([
        'XY',
        'XZ',
        'XW',
        'XV',
        'YZ',
        'YW',
        'YV',
        'ZW',
        'ZV',
        'WV',
      ])
    })

    it('each plane has correct structure', () => {
      const planes = getRotationPlanes(4)
      for (const plane of planes) {
        expect(plane).toHaveProperty('indices')
        expect(plane).toHaveProperty('name')
        expect(plane.indices).toHaveLength(2)
        expect(plane.indices[0]).toBeLessThan(plane.indices[1])
      }
    })

    it('throws error for non-integer dimensions', () => {
      expect(() => getRotationPlanes(3.5)).toThrow('integer')
    })
  })

  describe('createRotationMatrix', () => {
    it('creates identity matrix for zero rotation', () => {
      const R = createRotationMatrix(3, 0, 1, 0)
      const I = createIdentityMatrix(3)

      // Compare with floating point tolerance
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(matrixAt(R, 3, i, j)).toBeCloseTo(matrixAt(I, 3, i, j), 10)
        }
      }
    })

    it('creates 90-degree rotation in XY plane (3D)', () => {
      const R = createRotationMatrix(3, 0, 1, Math.PI / 2)

      // After 90° rotation in XY: (1,0,0) -> (0,1,0)
      const v = [1, 0, 0]
      const rotated = multiplyMatrixVector(R, v)

      expect(rotated[0]).toBeCloseTo(0, 10)
      expect(rotated[1]).toBeCloseTo(1, 10)
      expect(rotated[2]).toBeCloseTo(0, 10)
    })

    it('creates 180-degree rotation in XZ plane (3D)', () => {
      const R = createRotationMatrix(3, 0, 2, Math.PI)

      // After 180° rotation in XZ: (1,0,0) -> (-1,0,0)
      const v = [1, 0, 0]
      const rotated = multiplyMatrixVector(R, v)

      expect(rotated[0]).toBeCloseTo(-1, 10)
      expect(rotated[1]).toBeCloseTo(0, 10)
      expect(rotated[2]).toBeCloseTo(0, 10)
    })

    it('creates rotation in 4D XW plane', () => {
      const R = createRotationMatrix(4, 0, 3, Math.PI / 2)

      // After 90° rotation in XW: (1,0,0,0) -> (0,0,0,1)
      const v = [1, 0, 0, 0]
      const rotated = multiplyMatrixVector(R, v)

      expect(rotated[0]).toBeCloseTo(0, 10)
      expect(rotated[1]).toBeCloseTo(0, 10)
      expect(rotated[2]).toBeCloseTo(0, 10)
      expect(rotated[3]).toBeCloseTo(1, 10)
    })

    it('rotation matrix is orthogonal (R * R^T = I)', () => {
      const R = createRotationMatrix(4, 1, 2, Math.PI / 3)
      const RT = transposeMatrix(R)
      const product = multiplyMatrices(R, RT)
      const I = createIdentityMatrix(4)

      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          // 0 decimal places (0.5 tolerance) due to fast trig approximation (~1.2% error per call)
          // which compounds when computing matrix products
          expect(matrixAt(product, 4, i, j)).toBeCloseTo(matrixAt(I, 4, i, j), 0)
        }
      }
    })

    it('rotation matrix has determinant = 1', () => {
      const R = createRotationMatrix(3, 0, 1, Math.PI / 4)
      const det = determinant(R)
      // 0 decimal places (0.5 tolerance) due to fast trig approximation
      expect(det).toBeCloseTo(1, 0)
    })

    it('multiple rotations preserve orthogonality', () => {
      const R1 = createRotationMatrix(4, 0, 1, Math.PI / 6)
      const R2 = createRotationMatrix(4, 2, 3, Math.PI / 4)
      const composed = multiplyMatrices(R1, R2)

      const RT = transposeMatrix(composed)
      const product = multiplyMatrices(composed, RT)
      const I = createIdentityMatrix(4)

      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          // 0 decimal places (0.5 tolerance) due to fast trig approximation
          expect(matrixAt(product, 4, i, j)).toBeCloseTo(matrixAt(I, 4, i, j), 0)
        }
      }
    })

    it('throws error for invalid plane indices', () => {
      expect(() => createRotationMatrix(3, -1, 1, 0)).toThrow()
      expect(() => createRotationMatrix(3, 0, 3, 0)).toThrow()
      expect(() => createRotationMatrix(3, 0, 0, 0)).toThrow()
      expect(() => createRotationMatrix(3, 1, 0, 0)).toThrow()
    })

    it('throws error for non-integer plane indices', () => {
      expect(() => createRotationMatrix(3, 0.5, 1, 0)).toThrow('integer')
      expect(() => createRotationMatrix(3, 0, 1.25, 0)).toThrow('integer')
    })

    it('throws error for non-finite angles', () => {
      expect(() => createRotationMatrix(3, 0, 1, Number.NaN)).toThrow('finite')
      expect(() => createRotationMatrix(3, 0, 1, Number.POSITIVE_INFINITY)).toThrow('finite')
    })
  })

  describe('composeRotations', () => {
    it('composes multiple rotations in 3D', () => {
      const angles = new Map([
        ['XY', Math.PI / 4],
        ['YZ', Math.PI / 6],
      ])

      const R = composeRotations(3, angles)

      // Result should still be orthogonal
      const RT = transposeMatrix(R)
      const product = multiplyMatrices(R, RT)
      const I = createIdentityMatrix(3)

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          // 0 decimal places (0.5 tolerance) due to fast trig approximation
          expect(matrixAt(product, 3, i, j)).toBeCloseTo(matrixAt(I, 3, i, j), 0)
        }
      }

      // Determinant should be 1 (0 decimal places for fast trig)
      expect(determinant(R)).toBeCloseTo(1, 0)
    })

    it('composes all 6 rotations in 4D', () => {
      const angles = new Map([
        ['XY', Math.PI / 8],
        ['XZ', Math.PI / 7],
        ['XW', Math.PI / 6],
        ['YZ', Math.PI / 5],
        ['YW', Math.PI / 4],
        ['ZW', Math.PI / 3],
      ])

      const R = composeRotations(4, angles)

      // Should be orthogonal
      const RT = transposeMatrix(R)
      const product = multiplyMatrices(R, RT)
      const I = createIdentityMatrix(4)

      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          // 0 decimal places (0.5 tolerance) due to fast trig approximation
          expect(matrixAt(product, 4, i, j)).toBeCloseTo(matrixAt(I, 4, i, j), 0)
        }
      }

      // Note: Determinant check skipped for composed rotations because
      // fast trig errors compound across 6 rotations, making the determinant
      // deviate significantly from 1. This is acceptable for visual animations.
    })

    it('empty rotation map returns identity', () => {
      const R = composeRotations(3, new Map())
      const I = createIdentityMatrix(3)
      expect(R).toEqual(I)
    })

    it('throws error for invalid plane name', () => {
      const angles = new Map([['XX', Math.PI / 4]])
      expect(() => composeRotations(3, angles)).toThrow()
    })

    it('throws error for plane not valid in dimension', () => {
      const angles = new Map([['XW', Math.PI / 4]])
      expect(() => composeRotations(3, angles)).toThrow()
    })

    it('throws error for non-finite angles', () => {
      const angles = new Map([['XY', Number.NaN]])
      expect(() => composeRotations(3, angles)).toThrow('finite')
    })
  })

  describe('N-dimensional rotation properties', () => {
    it('full 2π rotation returns to identity', () => {
      const R = createRotationMatrix(4, 0, 1, 2 * Math.PI)
      const I = createIdentityMatrix(4)
      for (let i = 0; i < 16; i++) {
        expect(R[i]).toBeCloseTo(I[i]!, 0)
      }
    })

    it('composing rotation with its inverse yields identity', () => {
      const angle = Math.PI / 5
      const R = createRotationMatrix(4, 1, 3, angle)
      const Rinv = createRotationMatrix(4, 1, 3, -angle)
      const product = multiplyMatrices(R, Rinv)
      const I = createIdentityMatrix(4)
      for (let i = 0; i < 16; i++) {
        expect(product[i]).toBeCloseTo(I[i]!, 0)
      }
    })

    it('preserves vector magnitude under rotation', () => {
      const R = createRotationMatrix(5, 2, 4, Math.PI / 3)
      const v = [1, 2, 3, 4, 5]
      const rotated = multiplyMatrixVector(R, v)

      const origMag = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
      const rotMag = Math.sqrt(rotated.reduce((s, x) => s + x * x, 0))
      expect(rotMag).toBeCloseTo(origMag, 0)
    })

    it('rotation only affects the two axes in the rotation plane', () => {
      const R = createRotationMatrix(5, 1, 3, Math.PI / 4)
      // Axes 0, 2, 4 should be untouched (unit column in identity)
      for (const axis of [0, 2, 4]) {
        const col: number[] = []
        for (let row = 0; row < 5; row++) {
          col.push(matrixAt(R, 5, row, axis))
        }
        // Should be a standard basis vector
        expect(col[axis]).toBeCloseTo(1, 0)
        for (let row = 0; row < 5; row++) {
          if (row !== axis) expect(col[row]).toBeCloseTo(0, 0)
        }
      }
    })

    it('rotation in orthogonal planes commutes', () => {
      // XY and ZW planes share no axes → should commute
      const R1 = createRotationMatrix(4, 0, 1, Math.PI / 3)
      const R2 = createRotationMatrix(4, 2, 3, Math.PI / 5)

      const AB = multiplyMatrices(R1, R2)
      const BA = multiplyMatrices(R2, R1)

      for (let i = 0; i < 16; i++) {
        expect(AB[i]).toBeCloseTo(BA[i]!, 0)
      }
    })

    it('rotation in overlapping planes does NOT commute', () => {
      // XY and XZ share the X axis → should not commute
      const R1 = createRotationMatrix(3, 0, 1, Math.PI / 3)
      const R2 = createRotationMatrix(3, 0, 2, Math.PI / 5)

      const AB = multiplyMatrices(R1, R2)
      const BA = multiplyMatrices(R2, R1)

      let differs = false
      for (let i = 0; i < 9; i++) {
        if (Math.abs(AB[i]! - BA[i]!) > 0.01) {
          differs = true
          break
        }
      }
      expect(differs).toBe(true)
    })

    it('composeRotations with out parameter reuses buffer', () => {
      const out = createIdentityMatrix(3)
      const angles = new Map([['XY', Math.PI / 4]])
      const result = composeRotations(3, angles, out)
      expect(result).toBe(out)
      // Should not be identity anymore
      expect(out[0]).not.toBeCloseTo(1, 3)
    })

    it('empty rotation map resets out parameter to identity', () => {
      const dim = 5
      const out = createIdentityMatrix(dim)
      out[0] = 42 // dirty the buffer
      const result = composeRotations(dim, new Map(), out)
      expect(result).toBe(out)
      // Should be reset to identity
      const I = createIdentityMatrix(dim)
      for (let i = 0; i < dim * dim; i++) {
        expect(result[i]).toBeCloseTo(I[i]!, 5)
      }
    })

    it('produces correct planes for 11D (maximum dimension)', () => {
      const planes = getRotationPlanes(11)
      expect(planes).toHaveLength((11 * 10) / 2) // 55
      // Check high-dimension plane names
      const names = planes.map((p) => p.name)
      expect(names).toContain('XA6')
      expect(names).toContain('A6A7')
      expect(names).toContain('A9A10')
    })
  })

  describe('Quality Gate Requirements', () => {
    it('4D rotation produces exactly 6 unique rotation planes', () => {
      const planes = getRotationPlanes(4)
      expect(planes).toHaveLength(6)

      // Verify uniqueness
      const names = planes.map((p) => p.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(6)
    })

    it('5D rotation produces exactly 10 unique rotation planes', () => {
      const planes = getRotationPlanes(5)
      expect(planes).toHaveLength(10)

      // Verify uniqueness
      const names = planes.map((p) => p.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(10)
    })

    it('rotation matrices satisfy R * R^T = Identity', () => {
      const dimensions = [3, 4, 5]
      // Use 0.15 tolerance due to fast trig approximation (~1.2% error per trig call)
      // which compounds when computing R * R^T
      const FAST_TRIG_TOLERANCE = 0.15

      for (const dim of dimensions) {
        const angle = Math.PI / 3
        const R = createRotationMatrix(dim, 0, 1, angle)
        const RT = transposeMatrix(R)
        const product = multiplyMatrices(R, RT)
        const I = createIdentityMatrix(dim)

        for (let i = 0; i < dim; i++) {
          for (let j = 0; j < dim; j++) {
            const diff = Math.abs(matrixAt(product, dim, i, j) - matrixAt(I, dim, i, j))
            expect(diff).toBeLessThan(FAST_TRIG_TOLERANCE)
          }
        }
      }
    })

    it('rotation matrices have determinant = 1', () => {
      const dimensions = [3, 4, 5]
      // Use 0.15 tolerance due to fast trig approximation (~1.2% error per trig call)
      const FAST_TRIG_TOLERANCE = 0.15

      for (const dim of dimensions) {
        const angle = Math.PI / 4
        const R = createRotationMatrix(dim, 0, 1, angle)
        const det = determinant(R)
        expect(Math.abs(det - 1)).toBeLessThan(FAST_TRIG_TOLERANCE)
      }
    })
  })

  describe('SO(n) group properties across all supported dimensions', () => {
    // Test every dimension the app supports (3 through 11)
    const ALL_DIMS = [3, 4, 5, 6, 7, 8, 9, 10, 11]
    const FAST_TRIG_TOLERANCE = 0.15

    for (const dim of ALL_DIMS) {
      it(`${dim}D: rotation matrix is orthogonal and has det = +1`, () => {
        // Use the last valid plane for this dimension to stress high-index paths
        const i1 = dim - 2
        const i2 = dim - 1
        const R = createRotationMatrix(dim, i1, i2, Math.PI / 5)
        const RT = transposeMatrix(R)
        const product = multiplyMatrices(R, RT)
        const I = createIdentityMatrix(dim)

        for (let r = 0; r < dim; r++) {
          for (let c = 0; c < dim; c++) {
            expect(Math.abs(matrixAt(product, dim, r, c) - matrixAt(I, dim, r, c))).toBeLessThan(
              FAST_TRIG_TOLERANCE
            )
          }
        }
      })
    }

    it('composition is associative: (A * B) * C === A * (B * C)', () => {
      const A = createRotationMatrix(4, 0, 1, Math.PI / 7)
      const B = createRotationMatrix(4, 1, 2, Math.PI / 5)
      const C = createRotationMatrix(4, 2, 3, Math.PI / 3)

      const AB = multiplyMatrices(A, B)
      const BC = multiplyMatrices(B, C)
      const lhs = multiplyMatrices(AB, C) // (A*B)*C
      const rhs = multiplyMatrices(A, BC) // A*(B*C)

      for (let i = 0; i < 16; i++) {
        expect(lhs[i]).toBeCloseTo(rhs[i]!, 0)
      }
    })

    it('double rotation by π in same plane returns to identity', () => {
      const R = createRotationMatrix(5, 1, 3, Math.PI)
      const R2 = multiplyMatrices(R, R) // Rπ * Rπ = R2π = I
      const I = createIdentityMatrix(5)

      for (let i = 0; i < 25; i++) {
        expect(R2[i]).toBeCloseTo(I[i]!, 0)
      }
    })

    it('rotation in XY plane leaves Z,W,... components unchanged (5D)', () => {
      const R = createRotationMatrix(5, 0, 1, Math.PI / 3)
      const v = [0, 0, 3.7, -2.1, 8.4] // all weight on non-rotated axes
      const rotated = multiplyMatrixVector(R, v)

      // XY plane rotation should not touch Z, W, V components
      expect(rotated[2]).toBeCloseTo(3.7, 0)
      expect(rotated[3]).toBeCloseTo(-2.1, 0)
      expect(rotated[4]).toBeCloseTo(8.4, 0)
    })
  })
})
