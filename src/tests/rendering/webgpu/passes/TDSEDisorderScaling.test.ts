import { describe, expect, it } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import { uploadAndersonDisorderBuffer } from '@/rendering/webgpu/passes/TDSEComputePassCustomPotential'
import { computeTdseDisorderScaling } from '@/rendering/webgpu/passes/TDSEDisorderScaling'

function cfg(overrides: Partial<TdseConfig> = {}): TdseConfig {
  return { ...DEFAULT_TDSE_CONFIG, ...overrides }
}

function captureAndersonUpload(config: TdseConfig): { maxAbs: number; data: Float32Array } {
  const writes: Float32Array[] = []
  const device = {
    queue: {
      writeBuffer: (_buffer: GPUBuffer, _offset: number, data: Float32Array) => {
        writes.push(data)
      },
    },
  } as unknown as GPUDevice

  const maxAbs = uploadAndersonDisorderBuffer(device, {} as GPUBuffer, config)
  return { maxAbs, data: writes[0]! }
}

describe('computeTdseDisorderScaling', () => {
  it('uses the tightest compact effective spacing for W/t scaling', () => {
    const radius = 0.05
    const grid = 16
    const scaling = computeTdseDisorderScaling(
      cfg({
        latticeDim: 2,
        gridSize: [32, grid],
        spacing: [0.9, 0.9],
        compactDims: [false, true],
        compactRadii: [0.2, radius],
        hbar: 1.5,
        mass: 2,
        disorderStrength: 4,
      })
    )

    const dx = (2 * Math.PI * radius) / grid
    expect(scaling.dx).toBeCloseTo(dx, 12)
    expect(scaling.tEff).toBeCloseTo((1.5 * 1.5) / (2 * 2 * dx * dx), 8)
    expect(scaling.effectiveStrength).toBeCloseTo(4 * scaling.tEff, 8)
  })

  it('makes off-axis compact Anderson upload match an equivalent non-compact tight spacing', () => {
    const radius = 0.05
    const grid = 16
    const dx = (2 * Math.PI * radius) / grid
    const base = {
      potentialType: 'andersonDisorder' as const,
      latticeDim: 2,
      gridSize: [32, grid],
      hbar: 1,
      mass: 1,
      disorderStrength: 2,
      disorderSeed: 1234,
      disorderDistribution: 'uniform' as const,
    }
    const compact = captureAndersonUpload(
      cfg({
        ...base,
        spacing: [0.9, 0.9],
        compactDims: [false, true],
        compactRadii: [0.2, radius],
      })
    )
    const equivalent = captureAndersonUpload(
      cfg({
        ...base,
        spacing: [dx, 0.9],
        compactDims: [false, false],
        compactRadii: [0.2, radius],
      })
    )

    expect(Array.from(compact.data)).toEqual(Array.from(equivalent.data))
    expect(compact.maxAbs).toBe(equivalent.maxAbs)
  })

  it('falls back to finite scaling values for corrupted numeric config', () => {
    const scaling = computeTdseDisorderScaling(
      cfg({
        spacing: [Number.NaN],
        compactDims: [true],
        compactRadii: [Number.NaN],
        hbar: Number.POSITIVE_INFINITY,
        mass: Number.NaN,
        disorderStrength: Number.NaN,
      })
    )

    expect(scaling.dx).toBe(0.1)
    expect(scaling.hbar).toBe(1)
    expect(scaling.mass).toBe(1)
    expect(scaling.disorderStrength).toBe(0)
    expect(scaling.effectiveStrength).toBe(0)
  })
})
