import { describe, expect, it } from 'vitest'

import {
  DEFAULT_QUANTUM_WALK_CONFIG,
  type QuantumWalkConfig,
} from '@/lib/geometry/extended/quantumWalk'
import {
  packAbsorberUniforms,
  packWriteGridUniforms,
} from '@/rendering/webgpu/passes/QuantumWalkComputePassUniforms'
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
  it('accepts causalCurvature as a quantum-walk field view', () => {
    const fieldView: QuantumWalkConfig['fieldView'] = 'causalCurvature'
    expect(configWithFieldView(fieldView).fieldView).toBe('causalCurvature')
  })

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

  it('packs causalCurvature to write-grid fieldView enum 4 without moving coinEntropy', () => {
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

    expect(pack('coinEntropy')).toBe(3)
    expect(pack('causalCurvature')).toBe(4)
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

  it('reuses and clears write-grid uniform target buffers', () => {
    const first = packWriteGridUniforms(
      configWithFieldView('probability'),
      16 * 16 * 16,
      1,
      [16 * 16, 16, 1],
      undefined,
      undefined,
      undefined,
      1
    )
    const stale = new Uint32Array(first)
    stale[6] = 123

    const second = packWriteGridUniforms(
      { ...configWithFieldView('phase'), latticeDim: 1, gridSize: [16], spacing: [0.1] },
      16,
      1,
      [1],
      undefined,
      undefined,
      undefined,
      1,
      first
    )

    expect(second).toBe(first)
    expect(new Uint32Array(second)[3]).toBe(1)
    expect(new Uint32Array(second)[6]).toBe(0)
  })

  it('reuses and clears absorber uniform target buffers', () => {
    const config = configWithFieldView('probability')
    const first = packAbsorberUniforms(config, 16 * 16 * 16, [16 * 16, 16, 1], 0.75)
    const stale = new Uint32Array(first)
    stale[8] = 123

    const second = packAbsorberUniforms(
      { ...config, latticeDim: 1, gridSize: [16], spacing: [0.1] },
      16,
      [1],
      0.5,
      first
    )

    expect(second).toBe(first)
    expect(new Uint32Array(second)[1]).toBe(1)
    expect(new Uint32Array(second)[8]).toBe(0)
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

  it('writes causal Ricci theta from centered clamped coin-current expansion', () => {
    expect(qwWriteGridBlock).toContain('fn coinAxisCurrentAt')
    expect(qwWriteGridBlock).toContain('return dot(zPlus, zPlus) - dot(zMinus, zMinus)')
    expect(qwWriteGridBlock).toContain('fn offsetSiteClamped')
    expect(qwWriteGridBlock).toContain('clamp(i32((*coords)[axis]) + delta, 0, maxCoord)')
    expect(qwWriteGridBlock).toContain('fn causalExpansionAt')
    expect(qwWriteGridBlock).toContain(
      'let centeredCurrentDiff = coinAxisCurrentAt(plusSite, d) - coinAxisCurrentAt(minusSite, d)'
    )
    expect(qwWriteGridBlock).toContain(
      'theta += centeredCurrentDiff / (2.0 * max(params.spacing[d], 1e-12))'
    )
    expect(qwWriteGridBlock).toContain('fn causalCurvature')
    expect(qwWriteGridBlock).toContain('theta / max(rho, 1e-20)')
    expect(qwWriteGridBlock).toContain('1.0 - exp(-abs(')
    expect(qwWriteGridBlock).toContain('params.fieldView == 4u')
    expect(qwWriteGridBlock).toContain('nearestLatticeCoords(&coordsLo, &coordsHi, &fracs)')
    expect(qwWriteGridBlock).toContain(
      'let nnSite = ndToLinear(nnCoords, params.strides, params.latticeDim)'
    )
    expect(qwWriteGridBlock).toContain('let localRho = sumCoinStates(nnSite).prob')
    expect(qwWriteGridBlock).toContain(
      'let causalCurvatureValue = causalCurvature(&nnCoords, localRho)'
    )
    expect(qwWriteGridBlock).not.toContain('causalCurvature(&nnCoords, blendedProb)')
    expect(qwWriteGridBlock).toContain('displayScalar = causalCurvatureValue * densityGate')
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
