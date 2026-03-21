/**
 * Tests for measurement orchestrator data flow.
 *
 * Verifies the wiring between sampling, collapse computation, and
 * callback invocation for both full and partial measurements.
 * Math.random is mocked for deterministic results.
 *
 * @module tests/lib/physics/measurementOrchestrator
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  executeFullMeasurement,
  executePartialMeasurement,
} from '@/lib/physics/measurementOrchestrator'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('executeFullMeasurement', () => {
  it('calls inject with collapsed state arrays of correct length', () => {
    // 4-site 1D wavefunction, all density at site 2
    const psiRe = new Float32Array([0, 0, 1, 0])
    const psiIm = new Float32Array([0, 0, 0, 0])
    const config = { latticeDim: 1, gridSize: [4], spacing: [1.0] }
    const inject = vi.fn()
    const record = vi.fn()

    executeFullMeasurement(psiRe, psiIm, config, 0.3, inject, record)

    expect(inject).toHaveBeenCalledTimes(1)
    const [collapsedRe, collapsedIm] = inject.mock.calls[0]!
    expect(collapsedRe).toBeInstanceOf(Float32Array)
    expect(collapsedIm).toBeInstanceOf(Float32Array)
    expect(collapsedRe.length).toBe(4)
    expect(collapsedIm.length).toBe(4)
  })

  it('calls record with correct position, density, and null axis', () => {
    const psiRe = new Float32Array([0, 0, 1, 0])
    const psiIm = new Float32Array([0, 0, 0, 0])
    const config = { latticeDim: 1, gridSize: [4], spacing: [1.0] }
    const inject = vi.fn()
    const record = vi.fn()

    executeFullMeasurement(psiRe, psiIm, config, 0.3, inject, record)

    expect(record).toHaveBeenCalledTimes(1)
    const [position, density, measuredAxis] = record.mock.calls[0]!
    expect(position).toHaveLength(1)
    // Only site 2 has density → must sample there
    expect(position[0]).toBeCloseTo(0.5) // (2 - 2 + 0.5) * 1
    expect(density).toBeCloseTo(1.0)
    expect(measuredAxis).toBeNull()
  })

  it('collapse is a Gaussian centered at the sampled position', () => {
    // 8-site 1D, delta at site 3
    const psiRe = new Float32Array([0, 0, 0, 2, 0, 0, 0, 0])
    const psiIm = new Float32Array(8).fill(0)
    const config = { latticeDim: 1, gridSize: [8], spacing: [0.5] }
    const sigma = 1.0
    const inject = vi.fn()
    const record = vi.fn()

    executeFullMeasurement(psiRe, psiIm, config, sigma, inject, record)

    const [collapsedRe] = inject.mock.calls[0]!
    // Collapsed state should peak at site 3
    let maxIdx = 0
    let maxVal = 0
    for (let i = 0; i < 8; i++) {
      if (collapsedRe[i] > maxVal) {
        maxVal = collapsedRe[i]
        maxIdx = i
      }
    }
    expect(maxIdx).toBe(3)
    expect(maxVal).toBeCloseTo(1.0) // exp(0) at center

    // Verify Gaussian decay: site 4 should be less than site 3
    expect(collapsedRe[4]).toBeLessThan(collapsedRe[3])
  })

  it('2D wavefunction produces correct position vector', () => {
    // 3x3 grid, all density at site (1,2) = index 5
    const psiRe = new Float32Array(9).fill(0)
    psiRe[5] = 1
    const psiIm = new Float32Array(9).fill(0)
    const config = { latticeDim: 2, gridSize: [3, 3], spacing: [1, 1] }
    const inject = vi.fn()
    const record = vi.fn()

    executeFullMeasurement(psiRe, psiIm, config, 0.3, inject, record)

    const [position] = record.mock.calls[0]!
    expect(position).toHaveLength(2)
    // (1,2) in 3x3: dim0 = (1-1.5+0.5)*1 = 0, dim1 = (2-1.5+0.5)*1 = 1
    expect(position[0]).toBeCloseTo(0)
    expect(position[1]).toBeCloseTo(1)
  })

  it('samples from known distribution with mocked RNG', () => {
    // 4-site: densities [1, 0, 0, 4], totalProb=5
    // CDF: [1, 1, 1, 5]
    const psiRe = new Float32Array([1, 0, 0, 2])
    const psiIm = new Float32Array(4).fill(0)
    const config = { latticeDim: 1, gridSize: [4], spacing: [1] }
    const inject = vi.fn()
    const record = vi.fn()

    // u = 0.1 * 5 = 0.5 < CDF[0]=1 → site 0
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    executeFullMeasurement(psiRe, psiIm, config, 0.5, inject, record)

    expect(record.mock.calls[0]![0][0]).toBeCloseTo(-1.5) // site 0 position
    expect(record.mock.calls[0]![1]).toBeCloseTo(1.0) // density at site 0
  })
})

describe('executePartialMeasurement', () => {
  it('calls inject with arrays matching input length', () => {
    // 4x4 grid, density at row 1
    const psiRe = new Float32Array(16).fill(0)
    for (let c = 0; c < 4; c++) psiRe[4 + c] = 1 // row 1
    const psiIm = new Float32Array(16).fill(0)
    const config = { latticeDim: 2, gridSize: [4, 4], spacing: [1, 1] }
    const inject = vi.fn()
    const record = vi.fn()

    executePartialMeasurement(psiRe, psiIm, config, 0, 0.3, inject, record)

    expect(inject).toHaveBeenCalledTimes(1)
    const [outRe, outIm] = inject.mock.calls[0]!
    expect(outRe.length).toBe(16)
    expect(outIm.length).toBe(16)
  })

  it('record receives position with only measured axis filled', () => {
    // 3x3 grid, density concentrated at row 1
    const psiRe = new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 0])
    const psiIm = new Float32Array(9).fill(0)
    const config = { latticeDim: 2, gridSize: [3, 3], spacing: [1, 1] }
    const inject = vi.fn()
    const record = vi.fn()

    executePartialMeasurement(psiRe, psiIm, config, 0, 0.3, inject, record)

    const [position, density, measuredAxis] = record.mock.calls[0]!
    expect(position).toHaveLength(2)
    // Measured axis (0) should have a finite grid index; unmeasured axis (1) should be 0
    expect(Number.isFinite(position[0])).toBe(true)
    expect(position[1]).toBe(0)
    expect(measuredAxis).toBe(0)
    // Marginal density at row 1 = 3
    expect(density).toBeCloseTo(3)
  })

  it('partial collapse preserves wavefunction structure in unmeasured axes', () => {
    // 3x3 grid: psi varies along axis 1 (columns) [1, 2, 3] for each row
    const psiRe = new Float32Array([1, 2, 3, 1, 2, 3, 1, 2, 3])
    const psiIm = new Float32Array(9).fill(0)
    const config = { latticeDim: 2, gridSize: [3, 3], spacing: [1, 1] }
    const inject = vi.fn()
    const record = vi.fn()

    // Collapse axis 0 with very wide sigma → envelope ≈ 1 → output ≈ input
    executePartialMeasurement(psiRe, psiIm, config, 0, 100, inject, record)

    const [outRe] = inject.mock.calls[0]!
    // Row with most envelope weight: ratios should be preserved
    // Find the row with largest values
    let bestRow = 0
    let bestVal = 0
    for (let r = 0; r < 3; r++) {
      if (outRe[r * 3] > bestVal) {
        bestVal = outRe[r * 3]
        bestRow = r
      }
    }
    const base = bestRow * 3
    expect(outRe[base + 1] / outRe[base]).toBeCloseTo(2, 1)
    expect(outRe[base + 2] / outRe[base]).toBeCloseTo(3, 1)
  })

  it('measures axis 1 instead of axis 0', () => {
    // 3x4 grid: density concentrated at column 2
    const psiRe = new Float32Array(12).fill(0)
    for (let r = 0; r < 3; r++) psiRe[r * 4 + 2] = 1
    const psiIm = new Float32Array(12).fill(0)
    const config = { latticeDim: 2, gridSize: [3, 4], spacing: [1, 0.5] }
    const inject = vi.fn()
    const record = vi.fn()

    executePartialMeasurement(psiRe, psiIm, config, 1, 0.3, inject, record)

    const [position, , measuredAxis] = record.mock.calls[0]!
    expect(measuredAxis).toBe(1)
    // position[0] (unmeasured) = 0, position[1] (measured) = computed
    expect(position[0]).toBe(0)
    // axis 1, size=4, spacing=0.5: index 2 → pos = (2 - 2 + 0.5) * 0.5 = 0.25
    expect(position[1]).toBeCloseTo(0.25)
  })
})
