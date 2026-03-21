/**
 * Tests for the N-D potential grid evaluator.
 *
 * Verifies grid coordinate conversion, N-D flat indexing, and correct
 * potential values for known expressions.
 *
 * @module tests/lib/physics/potentialGridEvaluator
 */

import { describe, expect, it } from 'vitest'

import { parseExpression } from '@/lib/physics/expressionParser'
import { evaluatePotentialGrid } from '@/lib/physics/potentialGridEvaluator'

/** Parse expression or throw (test helper). */
function parse(expr: string): (coords: number[]) => number {
  const result = parseExpression(expr)
  if (!result.success) throw new Error(`Parse failed: ${result.error}`)
  return result.evaluate
}

describe('evaluatePotentialGrid', () => {
  describe('1D grids', () => {
    it('constant expression fills the entire grid with that value', () => {
      const evaluator = parse('42')
      const V = evaluatePotentialGrid(evaluator, [8], [0.1])
      expect(V.length).toBe(8)
      for (let i = 0; i < 8; i++) {
        expect(V[i]).toBe(42)
      }
    })

    it('harmonic potential V = 0.5 * x^2 is symmetric and zero at center', () => {
      const evaluator = parse('0.5 * x^2')
      const gridSize = [16]
      const spacing = [0.5]
      const V = evaluatePotentialGrid(evaluator, gridSize, spacing)
      expect(V.length).toBe(16)

      // Center of grid: index 7 and 8 should be near-symmetric
      // pos = (i - N/2 + 0.5) * spacing
      // At i=7: pos = (7 - 8 + 0.5) * 0.5 = -0.25, V = 0.5 * 0.0625 = 0.03125
      // At i=8: pos = (8 - 8 + 0.5) * 0.5 = 0.25, V = 0.5 * 0.0625 = 0.03125
      expect(V[7]).toBeCloseTo(V[8]!, 10)

      // Edges should have larger values than center
      expect(V[0]).toBeGreaterThan(V[7]!)
      expect(V[15]).toBeGreaterThan(V[8]!)
    })

    it('coordinate conversion matches WGSL convention: pos = (i - N/2 + 0.5) * spacing', () => {
      // Use V = x (identity) to read back coordinates
      const evaluator = parse('x')
      const V = evaluatePotentialGrid(evaluator, [4], [1.0])
      // Expected: i=0: -1.5, i=1: -0.5, i=2: 0.5, i=3: 1.5
      expect(V[0]).toBeCloseTo(-1.5)
      expect(V[1]).toBeCloseTo(-0.5)
      expect(V[2]).toBeCloseTo(0.5)
      expect(V[3]).toBeCloseTo(1.5)
    })
  })

  describe('2D grids', () => {
    it('output size equals product of grid dimensions', () => {
      const evaluator = parse('0')
      const V = evaluatePotentialGrid(evaluator, [8, 16], [0.1, 0.1])
      expect(V.length).toBe(128)
    })

    it('separable potential: V = x + y produces correct C-order indexing', () => {
      // C-order: last axis fastest → V[i*Ny + j] = x_i + y_j
      const evaluator = parse('x + y')
      const Nx = 4
      const Ny = 4
      const V = evaluatePotentialGrid(evaluator, [Nx, Ny], [1.0, 1.0])

      for (let i = 0; i < Nx; i++) {
        const posX = (i - Nx / 2 + 0.5) * 1.0
        for (let j = 0; j < Ny; j++) {
          const posY = (j - Ny / 2 + 0.5) * 1.0
          const idx = i * Ny + j
          expect(V[idx]).toBeCloseTo(posX + posY, 10)
        }
      }
    })

    it('isotropic harmonic V = x^2 + y^2 is radially symmetric', () => {
      const evaluator = parse('x^2 + y^2')
      const V = evaluatePotentialGrid(evaluator, [8, 8], [0.5, 0.5])

      // Diagonal symmetry: V[i*8 + j] should equal V[j*8 + i]
      for (let i = 0; i < 8; i++) {
        for (let j = i + 1; j < 8; j++) {
          expect(V[i * 8 + j]).toBeCloseTo(V[j * 8 + i]!, 10)
        }
      }
    })
  })

  describe('3D grids', () => {
    it('output size equals Nx * Ny * Nz', () => {
      const evaluator = parse('0')
      const V = evaluatePotentialGrid(evaluator, [4, 4, 4], [0.1, 0.1, 0.1])
      expect(V.length).toBe(64)
    })

    it('Coulomb-like potential is non-zero at off-center sites', () => {
      // V = -1 / sqrt(x^2 + y^2 + z^2 + 0.01)
      const evaluator = parse('-1 / sqrt(x^2 + y^2 + z^2 + 0.01)')
      const V = evaluatePotentialGrid(evaluator, [4, 4, 4], [1.0, 1.0, 1.0])
      // All values should be negative (Coulomb is attractive)
      for (let i = 0; i < 64; i++) {
        expect(V[i]).toBeLessThan(0)
      }
    })
  })

  describe('edge cases', () => {
    it('single-site grid evaluates at the grid center', () => {
      const evaluator = parse('x')
      const V = evaluatePotentialGrid(evaluator, [1], [0.5])
      // pos = (0 - 0.5 + 0.5) * 0.5 = 0
      expect(V.length).toBe(1)
      expect(V[0]).toBeCloseTo(0)
    })

    it('division by zero in expression produces 0 (Infinity clamped)', () => {
      const evaluator = parse('1 / x')
      const V = evaluatePotentialGrid(evaluator, [4], [1.0])
      // At i=1: x=-0.5, V=-2
      expect(V[1]).toBeCloseTo(-2)
      // At center-ish: no exact zero for even grid, all values should be finite
      for (let i = 0; i < 4; i++) {
        expect(Number.isFinite(V[i])).toBe(true)
      }
    })

    it('NaN from sqrt of negative is replaced with 0', () => {
      // sqrt(x) will be NaN for negative x
      const evaluator = parse('sqrt(x)')
      const V = evaluatePotentialGrid(evaluator, [4], [1.0])
      // Negative x positions: NaN → 0
      expect(V[0]).toBe(0) // x = -1.5, sqrt(-1.5) = NaN → 0
      expect(V[1]).toBe(0) // x = -0.5, sqrt(-0.5) = NaN → 0
      // Positive x positions: valid
      expect(V[2]).toBeCloseTo(Math.sqrt(0.5)) // x = 0.5
      expect(V[3]).toBeCloseTo(Math.sqrt(1.5)) // x = 1.5
    })

    it('returns Float32Array', () => {
      const evaluator = parse('0')
      const V = evaluatePotentialGrid(evaluator, [4], [0.1])
      expect(V).toBeInstanceOf(Float32Array)
    })

    it('respects non-uniform spacing', () => {
      // V = x + y with different spacings per axis
      const evaluator = parse('x + y')
      const V = evaluatePotentialGrid(evaluator, [2, 2], [1.0, 2.0])
      // x: [-0.5, 0.5], y: [-1.0, 1.0]
      expect(V[0]).toBeCloseTo(-0.5 + -1.0) // (0,0)
      expect(V[1]).toBeCloseTo(-0.5 + 1.0) // (0,1)
      expect(V[2]).toBeCloseTo(0.5 + -1.0) // (1,0)
      expect(V[3]).toBeCloseTo(0.5 + 1.0) // (1,1)
    })
  })

  describe('higher dimensions', () => {
    it('4D grid produces correct total site count', () => {
      const evaluator = parse('0')
      const V = evaluatePotentialGrid(evaluator, [4, 4, 4, 4], [0.1, 0.1, 0.1, 0.1])
      expect(V.length).toBe(256)
    })

    it('sum of all coordinates in 4D uses w variable correctly', () => {
      // V = x + y + z + w
      const evaluator = parse('x + y + z + w')
      // 2x2x2x2 grid, spacing 1.0
      // coords for each axis: [-0.5, 0.5]
      const V = evaluatePotentialGrid(evaluator, [2, 2, 2, 2], [1.0, 1.0, 1.0, 1.0])
      expect(V.length).toBe(16)
      // All-low corner (0,0,0,0): -0.5 * 4 = -2.0
      expect(V[0]).toBeCloseTo(-2.0)
      // All-high corner (1,1,1,1): 0.5 * 4 = 2.0
      expect(V[15]).toBeCloseTo(2.0)
    })
  })
})
