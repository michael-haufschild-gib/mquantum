import { describe, it, expect } from 'vitest'
import {
  nearestPow2,
  computeStrides,
  DENSITY_GRID_SIZE,
  LINEAR_WG,
  GRID_WG,
  MAX_DIM,
  FFT_UNIFORM_SIZE,
  PACK_UNIFORM_SIZE,
  DIAG_DECIMATION,
} from '@/rendering/webgpu/passes/computePassUtils'

describe('nearestPow2', () => {
  it('returns 2 for values below 2', () => {
    expect(nearestPow2(0)).toBe(2)
    expect(nearestPow2(1)).toBe(2)
  })

  it('returns the input when it is already a power of 2', () => {
    expect(nearestPow2(2)).toBe(2)
    expect(nearestPow2(4)).toBe(4)
    expect(nearestPow2(8)).toBe(8)
    expect(nearestPow2(16)).toBe(16)
    expect(nearestPow2(32)).toBe(32)
    expect(nearestPow2(64)).toBe(64)
    expect(nearestPow2(128)).toBe(128)
  })

  it('rounds to nearest power of 2', () => {
    expect(nearestPow2(3)).toBe(4)
    expect(nearestPow2(5)).toBe(4)
    expect(nearestPow2(6)).toBe(8)
    expect(nearestPow2(7)).toBe(8)
    expect(nearestPow2(12)).toBe(16)
    expect(nearestPow2(48)).toBe(64)
    expect(nearestPow2(96)).toBe(128)
  })

  it('clamps to maximum of 128', () => {
    expect(nearestPow2(200)).toBe(128)
    expect(nearestPow2(256)).toBe(128)
    expect(nearestPow2(1000)).toBe(128)
  })
})

describe('computeStrides', () => {
  it('computes row-major strides for 1D grid', () => {
    expect(computeStrides([64])).toEqual([1])
  })

  it('computes row-major strides for 2D grid', () => {
    expect(computeStrides([32, 64])).toEqual([64, 1])
  })

  it('computes row-major strides for 3D grid', () => {
    expect(computeStrides([4, 8, 16])).toEqual([128, 16, 1])
  })

  it('last stride is always 1', () => {
    const strides = computeStrides([10, 20, 30, 40])
    expect(strides[strides.length - 1]).toBe(1)
  })

  it('product of strides and grid sizes is consistent', () => {
    const grid = [4, 8, 16]
    const strides = computeStrides(grid)
    // stride[0] should equal product of remaining dimensions
    expect(strides[0]).toBe(8 * 16)
    expect(strides[1]).toBe(16)
    expect(strides[2]).toBe(1)
  })
})

describe('shared constants', () => {
  it('DENSITY_GRID_SIZE is 96', () => {
    expect(DENSITY_GRID_SIZE).toBe(96)
  })

  it('LINEAR_WG is 64', () => {
    expect(LINEAR_WG).toBe(64)
  })

  it('GRID_WG is 4', () => {
    expect(GRID_WG).toBe(4)
  })

  it('MAX_DIM is 12', () => {
    expect(MAX_DIM).toBe(12)
  })

  it('FFT_UNIFORM_SIZE is 32 bytes', () => {
    expect(FFT_UNIFORM_SIZE).toBe(32)
  })

  it('PACK_UNIFORM_SIZE is 16 bytes', () => {
    expect(PACK_UNIFORM_SIZE).toBe(16)
  })

  it('DIAG_DECIMATION is 5', () => {
    expect(DIAG_DECIMATION).toBe(5)
  })
})
