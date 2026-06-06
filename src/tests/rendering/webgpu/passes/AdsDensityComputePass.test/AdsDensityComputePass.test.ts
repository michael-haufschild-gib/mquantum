import { describe, expect, it } from 'vitest'

import {
  type AntiDeSitterConfig,
  DEFAULT_ANTI_DE_SITTER_CONFIG,
} from '@/lib/geometry/extended/antiDeSitter'
import {
  ADS_CONFIG_SIZE,
  computeAdsDensityConfigHash,
  writeAdsDensityConfigData,
} from '@/rendering/webgpu/passes/AdsDensityComputePass'

function config(overrides: Partial<AntiDeSitterConfig> = {}): AntiDeSitterConfig {
  return { ...DEFAULT_ANTI_DE_SITTER_CONFIG, ...overrides }
}

describe('AdsDensityComputePass config packing', () => {
  it('packs finite bound-state config into the WGSL uniform layout', () => {
    const data = new ArrayBuffer(ADS_CONFIG_SIZE)
    const hash = writeAdsDensityConfigData(
      data,
      config({ d: 4, n: 1, l: 2, m: -1, mL: 0.5, branch: 'standard', boundaryOverlay: true })
    )

    const i32 = new Int32Array(data)
    const f32 = new Float32Array(data)
    const u32 = new Uint32Array(data)

    expect(ADS_CONFIG_SIZE).toBe(48)
    expect(hash).toBe('4|1|2|-1|0.500000|standard|1|0|5.400000|0.720000')
    expect(i32[0]).toBe(4)
    expect(i32[1]).toBe(1)
    expect(i32[2]).toBe(2)
    expect(i32[3]).toBe(-1)
    expect(f32[4]).toBeCloseTo(0.5, 6)
    expect(f32[5]).toBeGreaterThan(0)
    expect(u32[6]).toBe(1)
    expect(f32[7]).toBeGreaterThan(0)
    expect(u32[8]).toBe(0)
    expect(f32[9]).toBeCloseTo(5.4, 6)
    expect(f32[10]).toBeCloseTo(0.72, 6)
    expect(f32[11]).toBe(0)
  })

  it('sanitizes malformed restored state before hashing or writing uniforms', () => {
    const data = new ArrayBuffer(ADS_CONFIG_SIZE)
    const hash = writeAdsDensityConfigData(
      data,
      config({
        d: Number.NaN,
        n: Number.POSITIVE_INFINITY,
        l: Number.NEGATIVE_INFINITY,
        m: Number.POSITIVE_INFINITY,
        mL: Number.POSITIVE_INFINITY,
        branch: 'bad-branch' as never,
        boundaryOverlay: true,
        chordalSieveEnabled: true,
        chordalSieveFrequency: Number.NaN,
        chordalSieveTwist: Number.NEGATIVE_INFINITY,
      })
    )

    const i32 = new Int32Array(data)
    const f32 = new Float32Array(data)
    const u32 = new Uint32Array(data)

    expect(hash).toBe('4|0|0|0|0.000000|standard|1|1|5.400000|0.720000')
    expect(computeAdsDensityConfigHash(config({ mL: Number.NaN }))).toBe(
      '4|0|0|0|0.000000|standard|0|0|5.400000|0.720000'
    )
    expect(i32[0]).toBe(4)
    expect(i32[1]).toBe(0)
    expect(i32[2]).toBe(0)
    expect(i32[3]).toBe(0)
    expect(u32[6]).toBe(1)

    expect(u32[8]).toBe(1)
    expect(f32[9]).toBeCloseTo(5.4, 6)
    expect(f32[10]).toBeCloseTo(0.72, 6)

    for (const slot of [4, 5, 7, 9, 10]) {
      expect(Number.isFinite(f32[slot])).toBe(true)
    }
  })

  it('hashes and packs Chordal Sieve controls into the extended uniform slots', () => {
    const data = new ArrayBuffer(ADS_CONFIG_SIZE)
    const hash = writeAdsDensityConfigData(
      data,
      config({
        chordalSieveEnabled: true,
        chordalSieveFrequency: 7.25,
        chordalSieveTwist: -1.5,
      })
    )

    const f32 = new Float32Array(data)
    const u32 = new Uint32Array(data)

    expect(hash).toBe('4|0|0|0|0.000000|standard|0|1|7.250000|-1.500000')
    expect(u32[8]).toBe(1)
    expect(f32[9]).toBeCloseTo(7.25, 6)
    expect(f32[10]).toBeCloseTo(-1.5, 6)
  })

  it('rejects undersized uniform buffers instead of writing partial config', () => {
    expect(() => writeAdsDensityConfigData(new ArrayBuffer(ADS_CONFIG_SIZE - 4), config())).toThrow(
      /AdsConfig buffer too small/
    )
  })
})
