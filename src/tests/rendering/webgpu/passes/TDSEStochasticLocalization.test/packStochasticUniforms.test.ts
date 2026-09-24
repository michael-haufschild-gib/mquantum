/**
 * Regression: CSL collapse centers were drawn over the RAW half-extent
 * N·spacing/2 while the collapse shader places sites with the effective
 * (compact / torus) spacing — with a torus period of 10 on a 16-site axis
 * (raw spacing 0.1) collapses covered only |x| ≤ 0.8 of the |x| ≤ 5 box.
 *
 * @module tests/rendering/webgpu/passes/TDSEStochasticLocalization/packStochasticUniforms
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import {
  createStochasticLocState,
  packStochasticUniforms,
} from '@/rendering/webgpu/passes/TDSEStochasticLocalization'

/** Max |center_d| over many batches (8 centers × 12 floats after an 8-float header). */
function maxCenterExtent(config: TdseConfig, axis: number): number {
  const state = createStochasticLocState()
  let maxAbs = 0
  for (let rep = 0; rep < 200; rep++) {
    const f32 = new Float32Array(packStochasticUniforms(config, state, 8, 100))
    for (let k = 0; k < 8; k++) maxAbs = Math.max(maxAbs, Math.abs(f32[8 + k * 12 + axis]!))
  }
  return maxAbs
}

describe('packStochasticUniforms', () => {
  it('spreads collapse centers over the torus-metric effective extent', () => {
    const cfg: TdseConfig = {
      ...DEFAULT_TDSE_CONFIG,
      latticeDim: 3,
      gridSize: [16, 16, 16],
      spacing: [0.1, 0.1, 0.1],
      metric: { kind: 'torus', torusPeriod: [10, 10, 10] },
      stochasticSeed: 7,
    }
    const extent = maxCenterExtent(cfg, 0)
    expect(extent).toBeGreaterThan(4) // raw cap was 16·0.1/2 = 0.8
    expect(extent).toBeLessThanOrEqual(5 + 1e-5)
  })

  it('keeps the raw half-extent on a flat lattice', () => {
    const cfg: TdseConfig = {
      ...DEFAULT_TDSE_CONFIG,
      latticeDim: 1,
      gridSize: [32],
      spacing: [0.1],
      compactDims: [false],
      metric: { kind: 'flat' },
      stochasticSeed: 7,
    }
    const extent = maxCenterExtent(cfg, 0)
    expect(extent).toBeGreaterThan(1.4)
    expect(extent).toBeLessThanOrEqual(1.6 + 1e-6)
  })
})
