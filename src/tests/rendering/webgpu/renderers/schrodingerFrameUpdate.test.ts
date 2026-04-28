/**
 * Pure-function tests for schrodingerFrameUpdate.
 *
 * Most of the file is GPU-coupled (computeCameraUpdate, computeBasisUpdate,
 * computeSchroedingerUpdate read store snapshots from a WebGPURenderContext),
 * but `quantizeBoundingRadius` is pure and drives the geometry-rebuild
 * threshold. A bug here would either thrash the GPU pipeline (rebuild on
 * every micro-change in radius) or cause stale geometry (rebuild never
 * fires).
 */
import { describe, expect, it } from 'vitest'

import { quantizeBoundingRadius } from '@/rendering/webgpu/renderers/boundingRadiusQuantize'

describe('quantizeBoundingRadius', () => {
  // Quant step = 0.05; rebuild threshold = 0.05.
  it('returns null when the change is below the rebuild threshold', () => {
    // Same value → ceil(2.0 / 0.05)*0.05 = 2.0; |2.0 − 2.0| = 0 < 0.05.
    expect(quantizeBoundingRadius(2.0, 2.0)).toBeNull()
    // raw 1.99 → ceil quantizes to 2.0; current 2.0 → diff 0 → null.
    expect(quantizeBoundingRadius(1.99, 2.0)).toBeNull()
  })

  it('returns the quantized value when |Δ| meets the rebuild threshold', () => {
    // 2.05 - 2.0 = 0.05 → exactly threshold → rebuild
    expect(quantizeBoundingRadius(2.05, 2.0)).toBeCloseTo(2.05, 6)
  })

  it('rounds the raw value UP to the next 0.05 step (Math.ceil)', () => {
    // 2.06 ceil to 0.05 → 2.10
    expect(quantizeBoundingRadius(2.06, 1.0)).toBeCloseTo(2.1, 6)
    // 2.001 ceil to 0.05 → 2.05
    expect(quantizeBoundingRadius(2.001, 1.0)).toBeCloseTo(2.05, 6)
  })

  it('returns null when the quantized result is within threshold of current', () => {
    // raw 2.001 → quantized 2.05; current 2.05 → diff 0 → no rebuild.
    expect(quantizeBoundingRadius(2.001, 2.05)).toBeNull()
  })

  it('handles a downward shrink: smaller raw than current, rebuild only if outside threshold', () => {
    // raw 1.95 ceil → 1.95; current 2.10 → diff 0.15 ≥ 0.05 → rebuild.
    expect(quantizeBoundingRadius(1.95, 2.1)).toBeCloseTo(1.95, 6)
  })
})
