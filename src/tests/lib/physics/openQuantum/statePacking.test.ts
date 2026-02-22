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
import {
  createPackedBuffer,
  packForGPU,
  unpackFromGPU,
  OPEN_QUANTUM_BUFFER_FLOATS,
  OPEN_QUANTUM_BUFFER_BYTES,
} from '@/lib/physics/openQuantum/statePacking'
import { densityMatrixFromCoefficients, MAX_K } from '@/lib/physics/openQuantum/integrator'
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

  it('packs activeK into buffer when provided', () => {
    const rho = densityMatrixFromCoefficients([1], [0], 1)
    const metrics: OpenQuantumMetrics = {
      purity: 1, linearEntropy: 0, vonNeumannEntropy: 0,
      coherenceMagnitude: 0, groundPopulation: 1, trace: 1,
    }
    const buf = createPackedBuffer()
    packForGPU(rho, metrics, buf, 5)
    // maxK slot at RHO_FLOATS + 5
    expect(buf[RHO_FLOATS + 5]).toBe(5)
  })
})
