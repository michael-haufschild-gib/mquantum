/**
 * Regression: the TDSE/BEC slice readback indexed `ix·ny·nz + iy·nz + iz`,
 * exact only for D ≤ 3. On a 4D+ lattice it read the real axis 0 at site 0
 * (the lattice edge) with every other axis shifted by one.
 *
 * @module tests/rendering/webgpu/passes/TDSEStateSaveLoad/extractCenteredDensitySlice
 */

import { describe, expect, it } from 'vitest'

import { computeStrides } from '@/lib/math/ndArray'
import { extractCenteredDensitySlice } from '@/rendering/webgpu/passes/TDSEStateSaveLoad'

/** ψ with Re = 1 + flat index, Im = 0 → |ψ|² identifies the site read. */
function codedPsi(gridSize: number[]): { psi: Float32Array; total: number } {
  const total = gridSize.reduce((a, b) => a * b, 1)
  const psi = new Float32Array(2 * total)
  for (let i = 0; i < total; i++) psi[2 * i] = 1 + i
  return { psi, total }
}

function expectedSlice(gridSize: number[], axis: number): number[] {
  const strides = computeStrides(gridSize)
  const out: number[] = []
  for (let i = 0; i < gridSize[axis]!; i++) {
    let flat = 0
    for (let d = 0; d < gridSize.length; d++) {
      flat += (d === axis ? i : Math.floor(gridSize[d]! / 2)) * strides[d]!
    }
    out.push((1 + flat) ** 2)
  }
  return out
}

describe('extractCenteredDensitySlice', () => {
  it('slices a 4D lattice through the centre of every other axis', () => {
    const grid = [3, 4, 5, 2]
    const { psi, total } = codedPsi(grid)
    for (let axis = 0; axis < 3; axis++) {
      expect(Array.from(extractCenteredDensitySlice(psi, grid, axis, total))).toEqual(
        expectedSlice(grid, axis)
      )
    }
  })

  it('matches the 3D row-major layout (last axis fastest)', () => {
    const grid = [4, 3, 5]
    const { psi, total } = codedPsi(grid)
    // axis 1 at (ix, iz) = (2, 2): flat = 2·15 + i·5 + 2
    expect(Array.from(extractCenteredDensitySlice(psi, grid, 1, total))).toEqual(
      [32, 37, 42].map((f) => (1 + f) ** 2)
    )
  })

  it('returns one centre sample for an axis beyond the lattice', () => {
    const grid = [6]
    const { psi, total } = codedPsi(grid)
    expect(Array.from(extractCenteredDensitySlice(psi, grid, 2, total))).toEqual([(1 + 3) ** 2])
  })
})
