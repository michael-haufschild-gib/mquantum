/**
 * Tests for observable expectation value computation.
 *
 * Verifies the CPU-side readback processing in ObservablesComputeSetup.
 *
 * @module tests/rendering/webgpu/passes/observablesCompute
 */

import { describe, expect, it } from 'vitest'

import { processObservablesReadback } from '@/rendering/webgpu/passes/ObservablesComputeSetup'

describe('processObservablesReadback', () => {
  it('returns null for zero norm', () => {
    const posData = new Float32Array([0, 0, 0, 0, 0])
    const momData = new Float32Array([0, 0, 0, 0, 0])
    expect(processObservablesReadback(posData, momData, 2, 1)).toBeNull()
  })

  it('computes position mean correctly', () => {
    // 2D case: norm=1, <x>=2, <x²>=5, <y>=0, <y²>=1
    const posData = new Float32Array([1.0, 2.0, 5.0, 0.0, 1.0])
    const momData = new Float32Array([1.0, 0.0, 0.5, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 2, 1.0)

    expect(result?.positionMean[0]).toBeCloseTo(2.0)
    expect(result?.positionMean[1]).toBeCloseTo(0.0)
  })

  it('computes variance as <x²> - <x>²', () => {
    // <x>=2, <x²>=5 → var = 5 - 4 = 1
    const posData = new Float32Array([1.0, 2.0, 5.0])
    const momData = new Float32Array([1.0, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.positionVariance[0]).toBeCloseTo(1.0)
  })

  it('computes momentum with ℏ scaling', () => {
    // <k>=3, ℏ=2 → <p> = ℏ<k> = 6
    const posData = new Float32Array([1.0, 0.0, 1.0])
    const momData = new Float32Array([1.0, 3.0, 10.0])
    const result = processObservablesReadback(posData, momData, 1, 2.0)

    expect(result!.momentumMean[0]).toBeCloseTo(6.0)
  })

  it('uncertainty product for minimum-uncertainty state', () => {
    // Gaussian: Δx=1, Δk=0.5 → Δp=ℏΔk=0.5 (ℏ=1) → ΔxΔp = 0.5 = ℏ/2
    // <x>=0, <x²>=1 → var_x=1, Δx=1
    // <k>=0, <k²>=0.25 → var_k=0.25, Δk=0.5, var_p=ℏ²·0.25=0.25, Δp=0.5
    const posData = new Float32Array([1.0, 0.0, 1.0])
    const momData = new Float32Array([1.0, 0.0, 0.25])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.uncertaintyProduct[0]).toBeCloseTo(0.5)
    expect(result!.activeDims).toBe(1)
  })

  it('reports activeDims correctly for 3D', () => {
    const posData = new Float32Array([1, 0, 1, 0, 1, 0, 1])
    const momData = new Float32Array([1, 0, 0.25, 0, 0.25, 0, 0.25])
    const result = processObservablesReadback(posData, momData, 3, 1.0)

    expect(result!.activeDims).toBe(3)
  })

  it('clamps negative variance to zero', () => {
    // Numerical noise: <x²>=0.9999, <x>=1.0001 → raw var < 0
    const posData = new Float32Array([1.0, 1.0001, 0.9999])
    const momData = new Float32Array([1.0, 0.0, 0.25])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.positionVariance[0]).toBeGreaterThanOrEqual(0)
  })
})
