import { describe, expect, it } from 'vitest'

import {
  DEFAULT_QUANTUM_WALK_CONFIG,
  type QuantumWalkConfig,
} from '@/lib/geometry/extended/quantumWalk'
import { packWriteGridUniforms } from '@/rendering/webgpu/passes/QuantumWalkComputePassUniforms'
import {
  qwWriteGridBlock,
  qwWriteGridUniformsBlock,
} from '@/rendering/webgpu/shaders/schroedinger/compute/qwWriteGrid.wgsl'

function config(fieldView: QuantumWalkConfig['fieldView']): QuantumWalkConfig {
  return {
    ...DEFAULT_QUANTUM_WALK_CONFIG,
    latticeDim: 3,
    gridSize: [16, 16, 16],
    spacing: [0.1, 0.1, 0.1],
    initialPosition: [8, 8, 8],
    fieldView,
  }
}

describe('QuantumWalkComputePassUniforms', () => {
  it('maps ctcFractalCarpet to write-grid fieldView enum 5', () => {
    const buf = packWriteGridUniforms(
      config('ctcFractalCarpet'),
      16 * 16 * 16,
      1,
      [16 * 16, 16, 1],
      undefined,
      undefined,
      undefined,
      1
    )

    expect(new Uint32Array(buf)[3]).toBe(5)
  })

  it('packs live walkSteps into the reused padding word without moving following fields', () => {
    const basisX = new Float32Array([0.25, 0.5, 0.75])
    const buf = packWriteGridUniforms(
      config('ctcFractalCarpet'),
      16 * 16 * 16,
      2,
      [16 * 16, 16, 1],
      basisX,
      undefined,
      undefined,
      1.5,
      undefined,
      12345
    )
    const u32 = new Uint32Array(buf)
    const f32 = new Float32Array(buf)

    expect(u32[42]).toBe(12345)
    expect(u32[43]).toBe(0)
    expect(f32[44]).toBeCloseTo(0.25, 6)
    expect(f32[45]).toBeCloseTo(0.5, 6)
    expect(f32[46]).toBeCloseTo(0.75, 6)
  })

  it('overwrites stale walkSteps when reusing a target buffer', () => {
    const first = packWriteGridUniforms(
      config('ctcFractalCarpet'),
      16 * 16 * 16,
      1,
      [16 * 16, 16, 1],
      undefined,
      undefined,
      undefined,
      1,
      undefined,
      77
    )
    const second = packWriteGridUniforms(
      { ...config('probability'), steps: 3 },
      16 * 16 * 16,
      1,
      [16 * 16, 16, 1],
      undefined,
      undefined,
      undefined,
      1,
      first
    )

    expect(second).toBe(first)
    expect(new Uint32Array(second)[42]).toBe(3)
  })

  it('documents and consumes walkSteps for fieldView enum 5 in the write-grid shader', () => {
    expect(qwWriteGridUniformsBlock).toContain('5=ctcFractalCarpet')
    expect(qwWriteGridUniformsBlock).toContain('walkSteps: u32')
    expect(qwWriteGridBlock).toContain('params.fieldView == 5u')
    expect(qwWriteGridBlock).toContain('params.walkSteps % CTC_PERIOD')
    expect(qwWriteGridBlock).toContain('displayScalar = ctcFractalCarpet')
    expect(qwWriteGridBlock).toContain(
      'select(displayScalar * perpFalloff, displayScalar, params.fieldView == 5u)'
    )
  })
})
