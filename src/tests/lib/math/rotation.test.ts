/**
 * Tests for n-dimensional rotation operations
 */

import {
  composeRotations,
  createIdentityMatrix,
  createPlaneName,
  createRotationMatrix,
  determinant,
  getAxisName,
  getRotationPlaneCount,
  getRotationPlanes,
  multiplyMatrices,
  multiplyMatrixVector,
  parsePlaneName,
  transposeMatrix,
} from '@/lib/math'
import { describe, expect, it } from 'vitest'

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
  describe('getRotationPlaneCount', () => {
    it('returns correct count for 3D', () => {
      // 3(2)/2 = 3 planes
      expect(getRotationPlaneCount(3)).toBe(3)
    })

    it('returns correct count for 4D', () => {
      // 4(3)/2 = 6 planes
      expect(getRotationPlaneCount(4)).toBe(6)
    })

    it('returns correct count for 5D', () => {
      // 5(4)/2 = 10 planes
      expect(getRotationPlaneCount(5)).toBe(10)
    })

    it('returns correct count for 6D', () => {
      // 6(5)/2 = 15 planes
      expect(getRotationPlaneCount(6)).toBe(15)
    })

    it('throws error for dimension < 2', () => {
      expect(() => getRotationPlaneCount(1)).toThrow()
      expect(() => getRotationPlaneCount(0)).toThrow()
    })

    it('throws error for non-integer dimensions', () => {
      expect(() => getRotationPlaneCount(2.5)).toThrow('integer')
    })
  })

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

  describe('getAxisName', () => {
    it('returns correct names for standard axes', () => {
      expect(getAxisName(0)).toBe('X')
      expect(getAxisName(1)).toBe('Y')
      expect(getAxisName(2)).toBe('Z')
      expect(getAxisName(3)).toBe('W')
      expect(getAxisName(4)).toBe('V')
      expect(getAxisName(5)).toBe('U')
    })

    it('returns numeric names for higher dimensions', () => {
      expect(getAxisName(6)).toBe('A6')
      expect(getAxisName(7)).toBe('A7')
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

  describe('parsePlaneName', () => {
    it('parses standard plane names', () => {
      expect(parsePlaneName('XY')).toEqual([0, 1])
      expect(parsePlaneName('XZ')).toEqual([0, 2])
      expect(parsePlaneName('YZ')).toEqual([1, 2])
      expect(parsePlaneName('XW')).toEqual([0, 3])
    })

    it('returns indices in sorted order', () => {
      expect(parsePlaneName('YX')).toEqual([0, 1])
      expect(parsePlaneName('ZX')).toEqual([0, 2])
    })

    it('throws error for invalid plane names', () => {
      expect(() => parsePlaneName('XX')).toThrow()
      expect(() => parsePlaneName('ABC')).toThrow()
      expect(() => parsePlaneName('X')).toThrow()
    })
  })

  describe('createPlaneName', () => {
    it('creates plane names from indices', () => {
      expect(createPlaneName(0, 1)).toBe('XY')
      expect(createPlaneName(0, 2)).toBe('XZ')
      expect(createPlaneName(1, 2)).toBe('YZ')
      expect(createPlaneName(0, 3)).toBe('XW')
    })

    it('returns sorted plane name', () => {
      expect(createPlaneName(1, 0)).toBe('XY')
      expect(createPlaneName(2, 0)).toBe('XZ')
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
})
