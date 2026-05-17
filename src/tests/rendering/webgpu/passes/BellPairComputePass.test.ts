/**
 * Tests for the pure uniform packer used by BellPairComputePass.
 *
 * Catches the original bug: the apparatus shader was config-invariant
 * because the BellPairConfig was discarded before reaching the uniform
 * buffer. These tests assert that visibility, detection efficiency, and
 * the four Bloch-sphere axes round-trip into the byte layout the WGSL
 * struct expects.
 */
import { describe, expect, it } from 'vitest'

import { createDefaultBellPairConfig } from '@/lib/geometry/extended/bellPair'
import {
  BELL_APPARATUS_UNIFORM_BYTES,
  packBellApparatusUniforms,
} from '@/rendering/webgpu/passes/BellPairComputePass'

const F32_INDEX = {
  gridSize: 0,
  liveSAbs: 1,
  liveLhvAbs: 2,
  totalTrials: 3,
  armOffset: 4,
  sourceSigma: 5,
  analyzerSigma: 6,
  worldScale: 7,
  visibility: 8,
  detectionEfficiency: 9,
  lobeOffset: 10,
  primedLobeScale: 11,
  aliceAxis0: 12,
  aliceAxisPrime0: 16,
  bobAxis0: 20,
  bobAxisPrime0: 24,
} as const

function asViews(buf: ArrayBuffer) {
  return { u32: new Uint32Array(buf), f32: new Float32Array(buf) }
}

describe('packBellApparatusUniforms', () => {
  it('produces a buffer of the documented size (112 bytes, multiple of 16)', () => {
    expect(BELL_APPARATUS_UNIFORM_BYTES).toBe(112)
    expect(BELL_APPARATUS_UNIFORM_BYTES % 16).toBe(0)
    const buf = packBellApparatusUniforms(createDefaultBellPairConfig(), 64, 2, 0, 0, 0)
    expect(buf.byteLength).toBe(BELL_APPARATUS_UNIFORM_BYTES)
  })

  it('encodes the grid size as u32 and the live stats as f32', () => {
    const buf = packBellApparatusUniforms(createDefaultBellPairConfig(), 96, 2, 2.7, 1.8, 12_345)
    const { u32, f32 } = asViews(buf)
    expect(u32[F32_INDEX.gridSize]).toBe(96)
    expect(f32[F32_INDEX.liveSAbs]).toBeCloseTo(2.7, 5)
    expect(f32[F32_INDEX.liveLhvAbs]).toBeCloseTo(1.8, 5)
    expect(f32[F32_INDEX.totalTrials]).toBeCloseTo(12_345, 0)
  })

  it('clamps visibility and detectionEfficiency to [0, 1]', () => {
    const cfg = createDefaultBellPairConfig()
    cfg.visibility = -0.5
    cfg.detectionEfficiency = 7
    const { f32 } = asViews(packBellApparatusUniforms(cfg, 64, 2, 0, 0, 0))
    expect(f32[F32_INDEX.visibility]).toBe(0)
    expect(f32[F32_INDEX.detectionEfficiency]).toBe(1)
  })

  it('round-trips visibility=0.42 and η=0.84', () => {
    const cfg = createDefaultBellPairConfig()
    cfg.visibility = 0.42
    cfg.detectionEfficiency = 0.84
    const { f32 } = asViews(packBellApparatusUniforms(cfg, 64, 2, 0, 0, 0))
    expect(f32[F32_INDEX.visibility]).toBeCloseTo(0.42, 5)
    expect(f32[F32_INDEX.detectionEfficiency]).toBeCloseTo(0.84, 5)
  })

  it('writes Alice canonical axis (θ=π/2, φ=0) as unit +x', () => {
    const cfg = createDefaultBellPairConfig() // canonical CHSH defaults
    const { f32 } = asViews(packBellApparatusUniforms(cfg, 64, 2, 0, 0, 0))
    expect(f32[F32_INDEX.aliceAxis0 + 0]).toBeCloseTo(1, 5)
    expect(f32[F32_INDEX.aliceAxis0 + 1]).toBeCloseTo(0, 5)
    expect(f32[F32_INDEX.aliceAxis0 + 2]).toBeCloseTo(0, 5)
  })

  it('writes Alice primed axis (θ=π/2, φ=π/2) as unit +y', () => {
    const cfg = createDefaultBellPairConfig()
    const { f32 } = asViews(packBellApparatusUniforms(cfg, 64, 2, 0, 0, 0))
    expect(f32[F32_INDEX.aliceAxisPrime0 + 0]).toBeCloseTo(0, 5)
    expect(f32[F32_INDEX.aliceAxisPrime0 + 1]).toBeCloseTo(1, 5)
    expect(f32[F32_INDEX.aliceAxisPrime0 + 2]).toBeCloseTo(0, 5)
  })

  it('writes Bob unprimed axis (θ=π/2, φ=π/4) as unit (√2/2, √2/2, 0)', () => {
    const cfg = createDefaultBellPairConfig()
    const { f32 } = asViews(packBellApparatusUniforms(cfg, 64, 2, 0, 0, 0))
    const inv2 = Math.SQRT1_2
    expect(f32[F32_INDEX.bobAxis0 + 0]).toBeCloseTo(inv2, 5)
    expect(f32[F32_INDEX.bobAxis0 + 1]).toBeCloseTo(inv2, 5)
    expect(f32[F32_INDEX.bobAxis0 + 2]).toBeCloseTo(0, 5)
  })

  it('axis pad slots are not used (each vec3 occupies 4 f32 slots = 16 bytes)', () => {
    const cfg = createDefaultBellPairConfig()
    // Use a config that exercises distinct axis values per slot
    cfg.aliceAxis = [Math.PI / 3, 0.7]
    cfg.aliceAxisPrime = [Math.PI / 4, 1.1]
    cfg.bobAxis = [Math.PI / 2.5, 0.3]
    cfg.bobAxisPrime = [Math.PI / 6, 1.9]
    const { f32 } = asViews(packBellApparatusUniforms(cfg, 64, 2, 0, 0, 0))
    // Every vec3<f32> starts at a 16-byte boundary; slots 15, 19, 23, 27
    // are the trailing 4-byte pad of each vec3 — those should stay zero.
    expect(f32[15]).toBe(0)
    expect(f32[19]).toBe(0)
    expect(f32[23]).toBe(0)
    expect(f32[27]).toBe(0)
  })
})
