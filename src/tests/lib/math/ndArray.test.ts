import { describe, expect, it } from 'vitest'

import {
  computeStrides,
  linearToNDCoords,
  linearToNDCoordsInto,
  ndToLinearIdx,
} from '@/lib/math/ndArray'

describe('computeStrides', () => {
  it('returns empty array for 0-D grid', () => {
    expect(computeStrides([])).toEqual([])
  })

  it('returns [1] for 1-D grid', () => {
    expect(computeStrides([8])).toEqual([1])
  })

  it('computes row-major strides for 2-D grid', () => {
    // 4x8 grid: stride[0] = 8, stride[1] = 1
    expect(computeStrides([4, 8])).toEqual([8, 1])
  })

  it('computes row-major strides for 3-D grid', () => {
    // 4x8x16: stride[0] = 8*16=128, stride[1] = 16, stride[2] = 1
    expect(computeStrides([4, 8, 16])).toEqual([128, 16, 1])
  })

  it('computes strides for asymmetric grid', () => {
    expect(computeStrides([2, 3, 5, 7])).toEqual([105, 35, 7, 1])
  })
})

describe('linearToNDCoords', () => {
  it('converts linear index 0 to origin', () => {
    expect(linearToNDCoords(0, [4, 8])).toEqual([0, 0])
  })

  it('converts index to 2-D coords', () => {
    // idx 10 in 4x8 grid: row = 10/8 = 1, col = 10%8 = 2
    expect(linearToNDCoords(10, [4, 8])).toEqual([1, 2])
  })

  it('converts last index to max coords', () => {
    // idx 31 in 4x8 grid: row = 31/8 = 3, col = 31%8 = 7
    expect(linearToNDCoords(31, [4, 8])).toEqual([3, 7])
  })

  it('converts in 3-D grid', () => {
    // idx 137 in 4x8x16: 137/(8*16)=1 rem 9; 9/16=0 rem 9
    expect(linearToNDCoords(137, [4, 8, 16])).toEqual([1, 0, 9])
  })

  it('handles 1-D grid', () => {
    expect(linearToNDCoords(5, [10])).toEqual([5])
  })
})

describe('linearToNDCoordsInto', () => {
  it('writes coords into pre-allocated array', () => {
    const out = [0, 0]
    linearToNDCoordsInto(10, [4, 8], out)
    expect(out).toEqual([1, 2])
  })

  it('writes 3-D coords without allocating', () => {
    const out = [0, 0, 0]
    linearToNDCoordsInto(137, [4, 8, 16], out)
    expect(out).toEqual([1, 0, 9])
  })

  it('handles index 0', () => {
    const out = [99, 99]
    linearToNDCoordsInto(0, [4, 8], out)
    expect(out).toEqual([0, 0])
  })
})

describe('ndToLinearIdx', () => {
  it('converts origin to index 0', () => {
    const strides = computeStrides([4, 8])
    expect(ndToLinearIdx([0, 0], strides)).toBe(0)
  })

  it('converts 2-D coords to linear index', () => {
    const strides = computeStrides([4, 8])
    expect(ndToLinearIdx([1, 2], strides)).toBe(10)
  })

  it('converts 3-D coords to linear index', () => {
    const strides = computeStrides([4, 8, 16])
    expect(ndToLinearIdx([1, 0, 9], strides)).toBe(137)
  })

  it('round-trips with linearToNDCoords', () => {
    const gridSize = [3, 5, 7]
    const strides = computeStrides(gridSize)
    const totalSize = gridSize.reduce((a, b) => a * b, 1)

    for (let idx = 0; idx < totalSize; idx++) {
      const coords = linearToNDCoords(idx, gridSize)
      const recovered = ndToLinearIdx(coords, strides)
      expect(recovered).toBe(idx)
    }
  })
})
