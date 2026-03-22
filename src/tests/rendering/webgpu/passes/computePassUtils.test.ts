import { describe, expect, it } from 'vitest'

import {
  computeConfigHash,
  computeStrides,
  computeStridesPadded,
  DENSITY_GRID_SIZE,
  DIAG_DECIMATION,
  FFT_UNIFORM_SIZE,
  GRID_WG,
  LINEAR_WG,
  MAX_DIM,
  MAX_DISPATCH_PER_DIM,
  MAX_LINEAR_DISPATCH_SITES,
  nearestPow2,
  PACK_UNIFORM_SIZE,
  reduceGridToFit,
  sanitizeGridSizes,
} from '@/rendering/webgpu/passes/computePassUtils'

// ============================================================================
// nearestPow2
// ============================================================================

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

  it('always returns a power of 2', () => {
    for (let v = 0; v <= 300; v += 7) {
      const result = nearestPow2(v)
      expect(result & (result - 1)).toBe(0) // power-of-2 check
      expect(result).toBeGreaterThanOrEqual(2)
      expect(result).toBeLessThanOrEqual(128)
    }
  })
})

// ============================================================================
// reduceGridToFit
// ============================================================================

describe('reduceGridToFit', () => {
  it('returns the grid unchanged when total sites are within the limit', () => {
    const grid = [32, 32, 32] // 32768 sites
    expect(reduceGridToFit(grid)).toEqual([32, 32, 32])
  })

  it('halves the largest axis when total exceeds the limit', () => {
    const limit = 100
    const result = reduceGridToFit([16, 16], limit)
    const total = result.reduce((a, b) => a * b, 1)
    expect(total).toBeLessThanOrEqual(limit)
    // Should have reduced from 256 to fit within 100
    expect(result).toEqual([8, 8])
  })

  it('reduces multiple times until within the limit', () => {
    const limit = 10
    const result = reduceGridToFit([64, 64], limit)
    const total = result.reduce((a, b) => a * b, 1)
    expect(total).toBeLessThanOrEqual(limit)
  })

  it('does not mutate the input array', () => {
    const grid = [128, 128]
    const original = [...grid]
    reduceGridToFit(grid, 100)
    expect(grid).toEqual(original)
  })

  it('stops reducing when axes reach minimum of 2', () => {
    const result = reduceGridToFit([2, 2, 2], 1)
    // Cannot reduce below 2, so result stays at [2, 2, 2] = 8 > 1
    expect(result).toEqual([2, 2, 2])
  })

  it('preferentially halves the largest axis', () => {
    const result = reduceGridToFit([128, 8], 500)
    // 128*8=1024 > 500. Halve 128->64: 64*8=512 > 500. Halve 64->32: 32*8=256 <= 500.
    expect(result).toEqual([32, 8])
  })

  it('uses MAX_LINEAR_DISPATCH_SITES as default limit', () => {
    // A grid that fits the default limit should pass through
    const smallGrid = [16, 16, 16]
    expect(reduceGridToFit(smallGrid)).toEqual(smallGrid)
  })
})

// ============================================================================
// computeStrides
// ============================================================================

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

  it('stride[i] equals product of all dimensions after i', () => {
    const grid = [4, 8, 16]
    const strides = computeStrides(grid)
    expect(strides[0]).toBe(8 * 16)
    expect(strides[1]).toBe(16)
    expect(strides[2]).toBe(1)
  })

  it('linearizing with strides reproduces the linear index', () => {
    const grid = [3, 4, 5]
    const strides = computeStrides(grid)
    let linearIdx = 0
    for (let i = 0; i < grid[0]!; i++) {
      for (let j = 0; j < grid[1]!; j++) {
        for (let k = 0; k < grid[2]!; k++) {
          const computed = i * strides[0]! + j * strides[1]! + k * strides[2]!
          expect(computed).toBe(linearIdx)
          linearIdx++
        }
      }
    }
  })
})

// ============================================================================
// computeStridesPadded
// ============================================================================

describe('computeStridesPadded', () => {
  it('returns array of length MAX_DIM', () => {
    const strides = computeStridesPadded([32, 32, 32], 3)
    expect(strides).toHaveLength(MAX_DIM)
  })

  it('active dimensions match computeStrides output', () => {
    const grid = [4, 8, 16]
    const padded = computeStridesPadded(grid, 3)
    const unpadded = computeStrides(grid.slice(0, 3))
    for (let i = 0; i < 3; i++) {
      expect(padded[i]).toBe(unpadded[i])
    }
  })

  it('inactive dimensions are zero-padded', () => {
    const strides = computeStridesPadded([32, 32, 32, 0, 0], 3)
    for (let i = 3; i < MAX_DIM; i++) {
      expect(strides[i]).toBe(0)
    }
  })

  it('handles latticeDim=0 without error', () => {
    const strides = computeStridesPadded([], 0)
    expect(strides).toHaveLength(MAX_DIM)
    expect(strides.every((s) => s === 0)).toBe(true)
  })

  it('handles 1D grid correctly', () => {
    const strides = computeStridesPadded([64], 1)
    expect(strides[0]).toBe(1) // single dimension stride is 1
    for (let i = 1; i < MAX_DIM; i++) {
      expect(strides[i]).toBe(0)
    }
  })
})

// ============================================================================
// sanitizeGridSizes
// ============================================================================

describe('sanitizeGridSizes', () => {
  it('returns the same reference when grid is already valid', () => {
    const config = { gridSize: [32, 32, 32], latticeDim: 3 }
    const result = sanitizeGridSizes(config)
    expect(result).toBe(config) // same reference = no copy
  })

  it('snaps non-power-of-2 grid sizes to nearest power of 2', () => {
    const config = { gridSize: [30, 33, 65], latticeDim: 3 }
    const result = sanitizeGridSizes(config)
    result.gridSize.forEach((g) => {
      expect(g & (g - 1)).toBe(0) // power-of-2 check
    })
  })

  it('preserves other config properties', () => {
    const config = { gridSize: [30, 30], latticeDim: 2, spacing: [0.1, 0.1] }
    const result = sanitizeGridSizes(config)
    expect(result.spacing).toEqual([0.1, 0.1])
    expect(result.latticeDim).toBe(2)
  })

  it('reduces grids that exceed dispatch limits', () => {
    // 128^3 = 2,097,152 which exceeds MAX_LINEAR_DISPATCH_SITES (65535 * 64 = 4,194,240)
    // But 128^3 is actually within limits. Let's try something bigger:
    // 128^4 = 268,435,456 which would exceed limits
    const config = { gridSize: [128, 128, 128, 128], latticeDim: 4 }
    const result = sanitizeGridSizes(config)
    const totalSites = result.gridSize.slice(0, 4).reduce((a, b) => a * b, 1)
    expect(totalSites).toBeLessThanOrEqual(MAX_LINEAR_DISPATCH_SITES)
  })

  it('does not mutate the input config', () => {
    const config = { gridSize: [30, 30], latticeDim: 2 }
    const originalGrid = [...config.gridSize]
    sanitizeGridSizes(config)
    expect(config.gridSize).toEqual(originalGrid)
  })
})

// ============================================================================
// computeConfigHash
// ============================================================================

describe('computeConfigHash', () => {
  it('produces deterministic output', () => {
    const h1 = computeConfigHash([32, 32, 32], 3)
    const h2 = computeConfigHash([32, 32, 32], 3)
    expect(h1).toBe(h2)
  })

  it('different grid sizes produce different hashes', () => {
    const h1 = computeConfigHash([32, 32, 32], 3)
    const h2 = computeConfigHash([64, 32, 32], 3)
    expect(h1).not.toBe(h2)
  })

  it('different latticeDim produces different hashes', () => {
    const h1 = computeConfigHash([32, 32, 32], 2)
    const h2 = computeConfigHash([32, 32, 32], 3)
    expect(h1).not.toBe(h2)
  })

  it('hash is a non-empty string', () => {
    const h = computeConfigHash([32, 32], 2)
    expect(h.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Constant invariants (behavioral, not value assertions)
// ============================================================================

describe('constant invariants', () => {
  it('LINEAR_WG is a power of 2 (WGSL @workgroup_size constraint)', () => {
    expect(LINEAR_WG & (LINEAR_WG - 1)).toBe(0)
    expect(LINEAR_WG).toBeGreaterThan(0)
  })

  it('GRID_WG is a power of 2 (WGSL @workgroup_size constraint)', () => {
    expect(GRID_WG & (GRID_WG - 1)).toBe(0)
    expect(GRID_WG).toBeGreaterThan(0)
  })

  it('MAX_LINEAR_DISPATCH_SITES equals MAX_DISPATCH_PER_DIM * LINEAR_WG', () => {
    expect(MAX_LINEAR_DISPATCH_SITES).toBe(MAX_DISPATCH_PER_DIM * LINEAR_WG)
  })

  it('FFT_UNIFORM_SIZE is 16-byte aligned (WebGPU uniform buffer requirement)', () => {
    expect(FFT_UNIFORM_SIZE % 16).toBe(0)
  })

  it('PACK_UNIFORM_SIZE is 16-byte aligned (WebGPU uniform buffer requirement)', () => {
    expect(PACK_UNIFORM_SIZE % 16).toBe(0)
  })

  it('DENSITY_GRID_SIZE is positive and reasonable for GPU texture dimensions', () => {
    expect(DENSITY_GRID_SIZE).toBeGreaterThan(0)
    expect(DENSITY_GRID_SIZE).toBeLessThanOrEqual(256) // GPU 3D texture limit
  })

  it('MAX_DIM accommodates all supported dimensions (up to 11D + 1 padding)', () => {
    expect(MAX_DIM).toBeGreaterThanOrEqual(12)
  })

  it('DIAG_DECIMATION is positive (run diagnostics every N frames)', () => {
    expect(DIAG_DECIMATION).toBeGreaterThan(0)
  })
})
