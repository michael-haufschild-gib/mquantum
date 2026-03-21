/**
 * Tests for observable expectation value computation.
 *
 * Verifies the CPU-side readback processing in ObservablesComputeSetup
 * and the dispatch gating logic in TDSEObservablesDispatch.
 *
 * @module tests/rendering/webgpu/passes/observablesCompute
 */

import { describe, expect, it } from 'vitest'

import {
  MAX_OBS_CHANNELS,
  processObservablesReadback,
} from '@/rendering/webgpu/passes/ObservablesComputeSetup'
import { shouldDispatchObs } from '@/rendering/webgpu/passes/TDSEObservablesDispatch'

describe('processObservablesReadback', () => {
  it('returns null for zero position norm', () => {
    const posData = new Float32Array([0, 0, 0, 0, 0, 0])
    const momData = new Float32Array([1, 0, 0.25, 0, 0.25, 0])
    expect(processObservablesReadback(posData, momData, 2, 1)).toBeNull()
  })

  it('returns null for zero momentum norm', () => {
    const posData = new Float32Array([1, 0, 1, 0, 1, 0])
    const momData = new Float32Array([0, 0, 0, 0, 0, 0])
    expect(processObservablesReadback(posData, momData, 2, 1)).toBeNull()
  })

  it('computes position mean correctly for 2D', () => {
    // 2D: [norm, x_mean, x_sq, y_mean, y_sq, V_energy]
    const posData = new Float32Array([1.0, 2.0, 5.0, 0.0, 1.0, 0.0])
    const momData = new Float32Array([1.0, 0.0, 0.5, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 2, 1.0)

    expect(result?.positionMean[0]).toBeCloseTo(2.0)
    expect(result?.positionMean[1]).toBeCloseTo(0.0)
  })

  it('computes variance as <x²> - <x>²', () => {
    // 1D: [norm, x_mean, x_sq, V_energy]
    // <x>=2, <x²>=5 → var = 5 - 4 = 1
    const posData = new Float32Array([1.0, 2.0, 5.0, 0.0])
    const momData = new Float32Array([1.0, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.positionVariance[0]).toBeCloseTo(1.0)
  })

  it('computes momentum with ℏ scaling', () => {
    // 1D: <k>=3, ℏ=2 → <p> = ℏ<k> = 6
    const posData = new Float32Array([1.0, 0.0, 1.0, 0.0])
    const momData = new Float32Array([1.0, 3.0, 10.0])
    const result = processObservablesReadback(posData, momData, 1, 2.0)

    expect(result!.momentumMean[0]).toBeCloseTo(6.0)
  })

  it('uncertainty product for minimum-uncertainty state', () => {
    // Gaussian: Δx=1, Δk=0.5 → Δp=ℏΔk=0.5 (ℏ=1) → ΔxΔp = 0.5 = ℏ/2
    const posData = new Float32Array([1.0, 0.0, 1.0, 0.0])
    const momData = new Float32Array([1.0, 0.0, 0.25])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.uncertaintyProduct[0]).toBeCloseTo(0.5)
    expect(result!.activeDims).toBe(1)
  })

  it('reports activeDims correctly for 3D', () => {
    // 3D: [norm, x0_mean, x0_sq, x1_mean, x1_sq, x2_mean, x2_sq, V_energy]
    const posData = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0])
    const momData = new Float32Array([1, 0, 0.25, 0, 0.25, 0, 0.25])
    const result = processObservablesReadback(posData, momData, 3, 1.0)

    expect(result!.activeDims).toBe(3)
  })

  it('clamps negative variance to zero', () => {
    // Numerical noise: <x²>=0.9999, <x>=1.0001 → raw var < 0
    const posData = new Float32Array([1.0, 1.0001, 0.9999, 0.0])
    const momData = new Float32Array([1.0, 0.0, 0.25])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.positionVariance[0]).toBeGreaterThanOrEqual(0)
  })

  it('includes potential energy in totalEnergy', () => {
    // 1D: norm=2, V_channel=6 → ⟨V⟩ = 6/2 = 3
    // Kinetic: ℏ²⟨k²⟩/(2m) = 1² * 0.5 / 2 = 0.25 (ℏ=1, <k²>=0.5)
    const posData = new Float32Array([2.0, 0.0, 1.0, 6.0])
    const momData = new Float32Array([1.0, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    const expectedKinetic = 0.5 / 2 // ℏ²⟨k²⟩/(2m) = 1*0.5/2 = 0.25
    const expectedPotential = 6.0 / 2.0 // V_raw / posNorm = 3
    expect(result!.totalEnergy).toBeCloseTo(expectedKinetic + expectedPotential)
  })

  it('totalEnergy is kinetic-only when potential channel is absent', () => {
    // Old-format data without V channel (shorter array)
    const posData = new Float32Array([1.0, 0.0, 1.0])
    const momData = new Float32Array([1.0, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    // Only kinetic: ℏ²⟨k²⟩/(2m) = 0.25
    expect(result!.totalEnergy).toBeCloseTo(0.25)
  })

  it('handles harmonic oscillator ground state ⟨V⟩ = ⟨T⟩ = E/2', () => {
    // For a 1D harmonic oscillator ground state (ℏω=1):
    // ⟨T⟩ = 0.25, ⟨V⟩ = 0.25, E = 0.5
    // Position: norm=1, <x>=0, <x²>=0.5 (σ²=0.5), V=0.5*ω²<x²>=0.25
    // Momentum: norm=1, <k>=0, <k²>=0.5 → T = ℏ²·0.5/2 = 0.25
    const posData = new Float32Array([1.0, 0.0, 0.5, 0.25])
    const momData = new Float32Array([1.0, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.totalEnergy).toBeCloseTo(0.5)
    // ΔxΔp should be exactly ℏ/2 for ground state
    expect(result!.uncertaintyProduct[0]).toBeCloseTo(0.5)
  })

  it('computes 11D observables without overflow', () => {
    // 11D: channels = 2 + 2*11 = 24 = MAX_OBS_CHANNELS
    const posData = new Float32Array(MAX_OBS_CHANNELS)
    const momData = new Float32Array(MAX_OBS_CHANNELS)
    posData[0] = 1 // norm
    momData[0] = 1 // knorm
    for (let d = 0; d < 11; d++) {
      posData[1 + d * 2] = 0 // <x_d> = 0
      posData[2 + d * 2] = 0.5 // <x_d²> = 0.5
      momData[1 + d * 2] = 0 // <k_d> = 0
      momData[2 + d * 2] = 0.5 // <k_d²> = 0.5
    }
    posData[23] = 2.75 // V channel

    const result = processObservablesReadback(posData, momData, 11, 1.0)

    expect(result!.activeDims).toBe(11)
    // All dimensions have same stats
    for (let d = 0; d < 11; d++) {
      expect(result!.positionMean[d]).toBeCloseTo(0)
      expect(result!.positionVariance[d]).toBeCloseTo(0.5)
      expect(result!.momentumMean[d]).toBeCloseTo(0)
    }
    // Total kinetic = 11 * ℏ²*0.5/2 = 2.75
    // Potential = 2.75/1 = 2.75
    expect(result!.totalEnergy).toBeCloseTo(5.5)
  })

  it('normalizes by position norm for potential energy', () => {
    // norm=4, V_raw=8 → ⟨V⟩ = 8/4 = 2
    const posData = new Float32Array([4.0, 0.0, 1.0, 8.0])
    const momData = new Float32Array([4.0, 0.0, 1.0])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    // Kinetic: ℏ²*(<k²>/momNorm)/(2m) = 1*(1/4)/2 = 0.125
    // Potential: 8/4 = 2
    expect(result!.totalEnergy).toBeCloseTo(2.125)
  })
})

describe('shouldDispatchObs', () => {
  const baseConfig = {
    diagnosticsEnabled: false,
    diagnosticsInterval: 10,
  } as Parameters<typeof shouldDispatchObs>[2]

  it('returns false when observables disabled', () => {
    expect(shouldDispatchObs(false, 100, baseConfig)).toBe(false)
  })

  it('returns true when frame counter reaches default decimation', () => {
    // DIAG_DECIMATION = 5, so frameCounter + 1 >= 5 → frameCounter >= 4
    expect(shouldDispatchObs(true, 4, baseConfig)).toBe(true)
  })

  it('returns false before default decimation threshold', () => {
    expect(shouldDispatchObs(true, 3, baseConfig)).toBe(false)
  })

  it('uses diagnosticsInterval when diagnostics enabled', () => {
    const config = { ...baseConfig, diagnosticsEnabled: true, diagnosticsInterval: 10 }
    expect(shouldDispatchObs(true, 8, config)).toBe(false)
    expect(shouldDispatchObs(true, 9, config)).toBe(true)
  })

  it('falls back to DIAG_DECIMATION when interval is 0', () => {
    const config = { ...baseConfig, diagnosticsEnabled: true, diagnosticsInterval: 0 }
    // DIAG_DECIMATION = 5
    expect(shouldDispatchObs(true, 4, config)).toBe(true)
    expect(shouldDispatchObs(true, 3, config)).toBe(false)
  })

  it('dispatches every frame when interval is 1', () => {
    const config = { ...baseConfig, diagnosticsEnabled: true, diagnosticsInterval: 1 }
    expect(shouldDispatchObs(true, 0, config)).toBe(true)
  })
})
