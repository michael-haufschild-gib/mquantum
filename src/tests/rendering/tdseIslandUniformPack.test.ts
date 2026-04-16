/**
 * Structural unit test for the analog-Hawking island overlay fields of the
 * TDSE uniform buffer. Drives {@link writeTdseUniforms} directly and inspects
 * the packed 928-byte ArrayBuffer at indices 204..207 to confirm the writer
 *
 *   - emits `islandOverlayEnabled = 1` and the triple (center, radius, boost)
 *     when the overlay is on AND radius > 0,
 *   - zeros out every island field (including boost, reset to 1.0) when the
 *     overlay is off or the radius is zero,
 *   - clamps `islandBoost` into [1.0, 4.0] at the packer boundary.
 *
 * The shader-side membership predicate is exercised by
 * `islandMask.test.ts`; this file covers the plumbing between the
 * page-curve store and the GPU uniform.
 *
 * @module tests/rendering/tdseIslandUniformPack
 */

import { describe, expect, it } from 'vitest'

import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import { TDSE_UNIFORM_SIZE } from '@/rendering/webgpu/passes/TDSEComputePassBuffers'
import { writeTdseUniforms } from '@/rendering/webgpu/passes/TDSEComputePassUniforms'

interface CapturedPack {
  enabled: number
  centerX0: number
  radius: number
  boost: number
  size: number
}

/** Build a minimal valid `TdseConfig` + invoke `writeTdseUniforms` against a stub device. */
function packAndCapture(overrides: Partial<TdseConfig>): CapturedPack {
  const config: TdseConfig = { ...DEFAULT_TDSE_CONFIG, ...overrides }
  const data = new ArrayBuffer(TDSE_UNIFORM_SIZE)
  const u32 = new Uint32Array(data)
  const f32 = new Float32Array(data)
  let captured: ArrayBuffer | null = null
  const stub = {
    queue: {
      writeBuffer: (_b: unknown, _o: number, src: ArrayBuffer) => {
        captured = src.slice(0)
      },
    },
  }
  writeTdseUniforms(stub as unknown as GPUDevice, {} as unknown as GPUBuffer, data, u32, f32, {
    config,
    totalSites: config.gridSize.reduce((a, b) => a * b, 1),
    simTime: 0,
    maxDensity: 1,
    initialMaxDensity: 1,
    autoScaleMaxGain: 20,
    strides: [1, config.gridSize[0]!, config.gridSize[0]! * config.gridSize[1]!],
    needsInit: false,
  })
  if (!captured) throw new Error('writeTdseUniforms did not invoke writeBuffer')
  const capBuf = captured as ArrayBuffer
  const cu32 = new Uint32Array(capBuf)
  const cf32 = new Float32Array(capBuf)
  return {
    enabled: cu32[204] ?? 0,
    centerX0: cf32[205] ?? 0,
    radius: cf32[206] ?? 0,
    boost: cf32[207] ?? 0,
    size: capBuf.byteLength,
  }
}

describe('TDSE uniform pack — analog-Hawking island overlay', () => {
  it('struct size is 928 bytes (island + v1/v2 metric rows + W6 overlay row)', () => {
    expect(TDSE_UNIFORM_SIZE).toBe(928)
  })

  it('writes active island triple when overlay is enabled and radius is positive', () => {
    const packed = packAndCapture({
      islandOverlayEnabled: true,
      islandCenterX0: 1.25,
      islandRadiusWs: 0.8,
      islandBoost: 1.8,
    })
    expect(packed.enabled).toBe(1)
    expect(packed.centerX0).toBeCloseTo(1.25, 5)
    expect(packed.radius).toBeCloseTo(0.8, 5)
    expect(packed.boost).toBeCloseTo(1.8, 5)
    expect(packed.size).toBe(928)
  })

  it('preserves a negative centerX0 (encoding the white-hole side)', () => {
    const packed = packAndCapture({
      islandOverlayEnabled: true,
      islandCenterX0: -2.5,
      islandRadiusWs: 0.4,
      islandBoost: 2.0,
    })
    expect(packed.enabled).toBe(1)
    expect(packed.centerX0).toBeCloseTo(-2.5, 5)
  })

  it('zeroes every island field when overlay is disabled — boost falls back to 1.0', () => {
    // Stale data on the config must not leak into the GPU uniform.
    const packed = packAndCapture({
      islandOverlayEnabled: false,
      islandCenterX0: 3.14,
      islandRadiusWs: 5.0,
      islandBoost: 3.5,
    })
    expect(packed.enabled).toBe(0)
    expect(packed.centerX0).toBe(0)
    expect(packed.radius).toBe(0)
    expect(packed.boost).toBe(1)
  })

  it('zeroes island fields when radius is zero, even if overlay is enabled', () => {
    const packed = packAndCapture({
      islandOverlayEnabled: true,
      islandCenterX0: 1.0,
      islandRadiusWs: 0,
      islandBoost: 2.0,
    })
    expect(packed.enabled).toBe(0)
    expect(packed.radius).toBe(0)
    expect(packed.boost).toBe(1)
  })

  it('clamps islandBoost into [1.0, 4.0] at the pack boundary', () => {
    const tooLow = packAndCapture({
      islandOverlayEnabled: true,
      islandCenterX0: 1,
      islandRadiusWs: 0.5,
      islandBoost: 0.1,
    })
    expect(tooLow.boost).toBe(1.0)
    const tooHigh = packAndCapture({
      islandOverlayEnabled: true,
      islandCenterX0: 1,
      islandRadiusWs: 0.5,
      islandBoost: 999,
    })
    expect(tooHigh.boost).toBe(4.0)
    const nan = packAndCapture({
      islandOverlayEnabled: true,
      islandCenterX0: 1,
      islandRadiusWs: 0.5,
      islandBoost: Number.NaN,
    })
    expect(nan.boost).toBe(1.0)
  })

  it('uses defaults (off, 0, 0, 1.0) when the optional fields are absent', () => {
    // DEFAULT_TDSE_CONFIG does not set any island field — all slots should
    // be zeroed/default without throwing or NaN-ing.
    const packed = packAndCapture({})
    expect(packed.enabled).toBe(0)
    expect(packed.centerX0).toBe(0)
    expect(packed.radius).toBe(0)
    expect(packed.boost).toBe(1)
  })
})
