/**
 * Tests for GPU state packing/unpacking round-trip and buffer sizing.
 *
 * Buffer layout (MAX_K=14):
 * - rho: 14×14×2 = 392 floats (row-major, re/im pairs with MAX_K stride)
 * - metrics: 8 floats (purity, linearEntropy, vonNeumannEntropy,
 *            coherenceMagnitude, groundPopulation, maxK, pad, pad)
 * Total: 400 floats = 1600 bytes
 */
import { describe, expect, it } from 'vitest'

import { densityMatrixFromCoefficients, MAX_K } from '@/lib/physics/openQuantum/integrator'
import {
  computeActiveK,
  createPackedBuffer,
  OPEN_QUANTUM_BUFFER_BYTES,
  OPEN_QUANTUM_BUFFER_FLOATS,
  packForGPU,
  unpackFromGPU,
} from '@/lib/physics/openQuantum/statePacking'
import type { OpenQuantumMetrics } from '@/lib/physics/openQuantum/types'

/** RHO_FLOATS = MAX_K × MAX_K × 2 */
const RHO_FLOATS = MAX_K * MAX_K * 2

describe('buffer sizing', () => {
  it('matches MAX_K=14 layout: 400 floats, 1600 bytes', () => {
    expect(OPEN_QUANTUM_BUFFER_FLOATS).toBe(400)
    expect(OPEN_QUANTUM_BUFFER_BYTES).toBe(1600)
  })

  it('createPackedBuffer returns Float32Array of correct length', () => {
    const buf = createPackedBuffer()
    expect(buf).toBeInstanceOf(Float32Array)
    expect(buf.length).toBe(OPEN_QUANTUM_BUFFER_FLOATS)
  })
})

describe('packForGPU / unpackFromGPU round-trip', () => {
  it('preserves density matrix values for K=2', () => {
    const c = 1 / Math.sqrt(2)
    const rho = densityMatrixFromCoefficients([c, c], [0, 0], 2)
    const metrics: OpenQuantumMetrics = {
      purity: 1.0,
      linearEntropy: 0,
      vonNeumannEntropy: 0,
      coherenceMagnitude: 0.5,
      groundPopulation: 0.5,
      trace: 1.0,
    }

    const buf = createPackedBuffer()
    packForGPU(rho, metrics, buf)

    const unpacked = unpackFromGPU(buf, 2)

    // rho_{00} re = 0.5
    expect(unpacked.elements[0]).toBeCloseTo(0.5, 4)
    // rho_{11} re = 0.5 (K=2 source → unpacked back to K=2 stride)
    expect(unpacked.elements[2 * (1 * 2 + 1)]).toBeCloseTo(0.5, 4)
    // rho_{01} re = 0.5
    expect(unpacked.elements[2 * (0 * 2 + 1)]).toBeCloseTo(0.5, 4)
  })

  it('packs scalar metrics into correct buffer positions', () => {
    const rho = densityMatrixFromCoefficients([1, 0], [0, 0], 2)
    const metrics: OpenQuantumMetrics = {
      purity: 0.75,
      linearEntropy: 0.25,
      vonNeumannEntropy: 0.42,
      coherenceMagnitude: 0.33,
      groundPopulation: 0.9,
      trace: 1.0,
    }

    const buf = createPackedBuffer()
    packForGPU(rho, metrics, buf)

    // Metrics start at index RHO_FLOATS (=392)
    expect(buf[RHO_FLOATS]).toBeCloseTo(0.75, 4) // purity
    expect(buf[RHO_FLOATS + 1]).toBeCloseTo(0.25, 4) // linearEntropy
    expect(buf[RHO_FLOATS + 2]).toBeCloseTo(0.42, 4) // vonNeumannEntropy
    expect(buf[RHO_FLOATS + 3]).toBeCloseTo(0.33, 4) // coherenceMagnitude
    expect(buf[RHO_FLOATS + 4]).toBeCloseTo(0.9, 4) // groundPopulation
  })

  it('clamps activeK to the physical density-matrix basis size', () => {
    const rho = densityMatrixFromCoefficients([1, 0], [0, 0], 2)
    const metrics: OpenQuantumMetrics = {
      purity: 1,
      linearEntropy: 0,
      vonNeumannEntropy: 0,
      coherenceMagnitude: 0,
      groundPopulation: 1,
      trace: 1,
    }
    const buf = createPackedBuffer()
    packForGPU(rho, metrics, buf, 5)
    // maxK slot at RHO_FLOATS + 5
    expect(buf[RHO_FLOATS + 5]).toBe(2)
  })

  it('rejects density matrices larger than the fixed GPU layout', () => {
    const K = MAX_K + 1
    const rho = { K, elements: new Float64Array(K * K * 2) }
    const metrics: OpenQuantumMetrics = {
      purity: 1,
      linearEntropy: 0,
      vonNeumannEntropy: 0,
      coherenceMagnitude: 0,
      groundPopulation: 1,
      trace: 1,
    }

    expect(() => packForGPU(rho, metrics, createPackedBuffer())).toThrow(
      `packForGPU: K=${K} exceeds MAX_K=${MAX_K}`
    )
  })

  it('rejects undersized output buffers', () => {
    const rho = densityMatrixFromCoefficients([1, 0], [0, 0], 2)
    const metrics: OpenQuantumMetrics = {
      purity: 1,
      linearEntropy: 0,
      vonNeumannEntropy: 0,
      coherenceMagnitude: 0,
      groundPopulation: 1,
      trace: 1,
    }

    expect(() => packForGPU(rho, metrics, new Float32Array(16))).toThrow(
      `packForGPU: output buffer too small (expected >= ${OPEN_QUANTUM_BUFFER_FLOATS})`
    )
  })
})

describe('computeActiveK', () => {
  it('returns minK when all diagonal populations are zero', () => {
    // Bug caught: returns 0 for empty density matrix, causing zero-length
    // GPU loop and missing all quantum states.
    const K = 5
    const elements = new Float64Array(K * K * 2) // all zeros
    const rho = { K, elements }
    expect(computeActiveK(rho)).toBe(2) // default minK=2
  })

  it('returns K when last state has population above threshold', () => {
    // Bug caught: off-by-one in the lastActive+1 return value.
    const K = 4
    const elements = new Float64Array(K * K * 2)
    // Set ρ_{33} = 0.05 (above default threshold 0.01)
    elements[2 * (3 * K + 3)] = 0.05
    const rho = { K, elements }
    expect(computeActiveK(rho)).toBe(4) // lastActive=3, so 3+1=4
  })

  it('trims trailing unpopulated states', () => {
    // K=6 but only states 0,1,2 have population → returns 3
    const K = 6
    const elements = new Float64Array(K * K * 2)
    elements[2 * (0 * K + 0)] = 0.5 // ρ_{00}
    elements[2 * (1 * K + 1)] = 0.3 // ρ_{11}
    elements[2 * (2 * K + 2)] = 0.2 // ρ_{22}
    // States 3,4,5 have zero population
    const rho = { K, elements }
    expect(computeActiveK(rho)).toBe(3)
  })

  it('respects custom populationThreshold', () => {
    const K = 4
    const elements = new Float64Array(K * K * 2)
    elements[2 * (0 * K + 0)] = 0.9
    elements[2 * (1 * K + 1)] = 0.08 // above default 0.01 but below custom 0.1
    const rho = { K, elements }
    // With default threshold: lastActive=1, returns 2
    expect(computeActiveK(rho, 0.01)).toBe(2)
    // With higher threshold: lastActive=0, but minK=2 clamps to 2
    expect(computeActiveK(rho, 0.1)).toBe(2)
  })

  it('respects custom minK', () => {
    const K = 8
    const elements = new Float64Array(K * K * 2)
    elements[2 * (0 * K + 0)] = 1.0 // only ground state
    const rho = { K, elements }
    // lastActive=0, returns max(minK, 1) = minK
    expect(computeActiveK(rho, 0.01, 4)).toBe(4)
  })

  it('does not return an active basis larger than rho.K', () => {
    const K = 1
    const elements = new Float64Array(K * K * 2)
    elements[0] = 1
    const rho = { K, elements }
    expect(computeActiveK(rho)).toBe(1)
  })

  it('uses the documented minK floor when minK is non-finite', () => {
    const K = 5
    const elements = new Float64Array(K * K * 2)
    elements[0] = 1
    const rho = { K, elements }
    expect(computeActiveK(rho, 0.01, Number.NaN)).toBe(2)
  })
})

describe('unpackFromGPU', () => {
  it('rejects K larger than the fixed GPU layout', () => {
    expect(() => unpackFromGPU(createPackedBuffer(), MAX_K + 1)).toThrow(
      `unpackFromGPU: K=${MAX_K + 1} exceeds MAX_K=${MAX_K}`
    )
  })

  it('rejects undersized packed buffers', () => {
    expect(() => unpackFromGPU(new Float32Array(16), 2)).toThrow(
      `unpackFromGPU: buffer too small (expected >= ${OPEN_QUANTUM_BUFFER_FLOATS})`
    )
  })
})
