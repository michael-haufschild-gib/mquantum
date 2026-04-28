import { describe, expect, it } from 'vitest'

import {
  DEFAULT_QUANTUM_WALK_CONFIG,
  type QuantumWalkConfig,
} from '@/lib/geometry/extended/quantumWalk'
import { packWriteGridUniforms } from '@/rendering/webgpu/passes/QuantumWalkComputePassUniforms'
import { qwWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/qwWriteGrid.wgsl'

function configWithFieldView(fieldView: QuantumWalkConfig['fieldView']): QuantumWalkConfig {
  return {
    ...DEFAULT_QUANTUM_WALK_CONFIG,
    fieldView,
    latticeDim: 3,
    gridSize: [16, 16, 16],
    spacing: [0.1, 0.1, 0.1],
    initialPosition: [8, 8, 8],
  }
}

function normalizedCoinEntropy(corners: number[][], weights: number[]): number {
  const coinCount = corners[0]?.length ?? 0
  const blended = Array.from({ length: coinCount }, () => 0)
  for (let corner = 0; corner < corners.length; corner++) {
    for (let coin = 0; coin < coinCount; coin++) {
      blended[coin] = blended[coin]! + weights[corner]! * corners[corner]![coin]!
    }
  }
  const total = blended.reduce((sum, p) => sum + p, 0)
  const entropy = blended.reduce((sum, p) => {
    const q = p / total
    return sum + (q > 0 ? -q * Math.log(q) : 0)
  }, 0)
  return entropy / Math.log(coinCount)
}

describe('QuantumWalk coin entropy field view', () => {
  it('packs coinEntropy to write-grid fieldView enum 3', () => {
    const buf = packWriteGridUniforms(
      configWithFieldView('coinEntropy'),
      16 * 16 * 16,
      1,
      [16 * 16, 16, 1],
      undefined,
      undefined,
      undefined,
      1
    )
    expect(new Uint32Array(buf)[3]).toBe(3)
  })

  it('keeps existing quantum-walk field-view enums stable', () => {
    const pack = (fieldView: QuantumWalkConfig['fieldView']) =>
      new Uint32Array(
        packWriteGridUniforms(
          configWithFieldView(fieldView),
          16 * 16 * 16,
          1,
          [16 * 16, 16, 1],
          undefined,
          undefined,
          undefined,
          1
        )
      )[3]

    expect(pack('probability')).toBe(0)
    expect(pack('phase')).toBe(1)
    expect(pack('coinState')).toBe(2)
  })

  it('writes normalized local coin Shannon entropy in the QW write-grid shader', () => {
    expect(qwWriteGridBlock).toContain('fn coinProbabilityAt')
    expect(qwWriteGridBlock).toContain(
      'for (var coinIdx: u32 = 0u; coinIdx < params.numCoinStates; coinIdx++)'
    )
    expect(qwWriteGridBlock).toContain('var blendedCoinProb: f32 = 0.0')
    expect(qwWriteGridBlock).toContain('blendedCoinProb += w * coinProbabilityAt(sIdx, coinIdx)')
    expect(qwWriteGridBlock).toContain('let q = blendedCoinProb * invBlendedProb')
    expect(qwWriteGridBlock).toContain('entropySum += -q * log(max(q, 1e-20))')
    expect(qwWriteGridBlock).toContain('log(max(f32(params.numCoinStates), 2.0))')
    expect(qwWriteGridBlock).toContain('params.fieldView == 3u')
    expect(qwWriteGridBlock).toContain('displayScalar = coinEntropy * densityGate')
    expect(qwWriteGridBlock).not.toContain('entropyRaw')
  })

  it('models interpolated pure coin corners as mixed renderer-local entropy', () => {
    const entropy = normalizedCoinEntropy(
      [
        [1, 0],
        [0, 1],
      ],
      [0.5, 0.5]
    )
    expect(entropy).toBeCloseTo(1, 6)
  })
})
