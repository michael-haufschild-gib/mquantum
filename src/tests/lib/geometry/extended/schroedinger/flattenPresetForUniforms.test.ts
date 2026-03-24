/**
 * Tests for flattenPresetForUniforms — GPU uniform data packing.
 *
 * This function converts a QuantumPreset into typed arrays sized for GPU
 * uniform buffer upload. Bugs here cause silent GPU rendering corruption
 * (wrong quantum numbers, wrong coefficients) that is extremely hard to
 * diagnose from visual output alone.
 *
 * Verifies:
 * - Correct padding to MAX_DIM and MAX_TERMS
 * - Faithful preservation of input values
 * - Zero-fill for unused slots
 * - Coefficient interleaving (re, im pairs)
 */

import { describe, expect, it } from 'vitest'

import {
  flattenPresetForUniforms,
  generateQuantumPreset,
  type QuantumPreset,
} from '@/lib/geometry/extended/schroedinger/presets'
import { MAX_DIM, MAX_TERMS } from '@/rendering/webgpu/shaders/schroedinger/uniforms.wgsl'

describe('flattenPresetForUniforms', () => {
  it('omega array is padded to MAX_DIM with default 1.0 for missing entries', () => {
    const preset: QuantumPreset = {
      termCount: 1,
      omega: [0.8, 0.9, 1.1],
      quantumNumbers: [[0, 0, 0]],
      coefficients: [[1, 0]],
      energies: [1.4],
    }

    const { omega } = flattenPresetForUniforms(preset)
    expect(omega.length).toBe(MAX_DIM)
    expect(omega[0]).toBeCloseTo(0.8)
    expect(omega[1]).toBeCloseTo(0.9)
    expect(omega[2]).toBeCloseTo(1.1)
    // Remaining slots should be 0 (Float32Array default)
    for (let i = 3; i < MAX_DIM; i++) {
      expect(omega[i]).toBe(0)
    }
  })

  it('quantum numbers are flattened in row-major order with correct padding', () => {
    const preset: QuantumPreset = {
      termCount: 2,
      omega: [1, 1, 1],
      quantumNumbers: [
        [3, 1, 0],
        [0, 2, 4],
      ],
      coefficients: [
        [0.7, 0.1],
        [0.3, 0.6],
      ],
      energies: [2.5, 3.5],
    }

    const { quantum } = flattenPresetForUniforms(preset)
    expect(quantum.length).toBe(MAX_TERMS * MAX_DIM)

    // Term 0: [3, 1, 0, 0, 0, ..., 0] (padded to MAX_DIM)
    expect(quantum[0 * MAX_DIM + 0]).toBe(3)
    expect(quantum[0 * MAX_DIM + 1]).toBe(1)
    expect(quantum[0 * MAX_DIM + 2]).toBe(0)
    for (let j = 3; j < MAX_DIM; j++) {
      expect(quantum[0 * MAX_DIM + j]).toBe(0)
    }

    // Term 1: [0, 2, 4, 0, 0, ..., 0]
    expect(quantum[1 * MAX_DIM + 0]).toBe(0)
    expect(quantum[1 * MAX_DIM + 1]).toBe(2)
    expect(quantum[1 * MAX_DIM + 2]).toBe(4)
  })

  it('coefficients are interleaved as [re0, im0, re1, im1, ...]', () => {
    const preset: QuantumPreset = {
      termCount: 3,
      omega: [1, 1, 1],
      quantumNumbers: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      coefficients: [
        [0.5, 0.3],
        [-0.2, 0.7],
        [0.1, -0.4],
      ],
      energies: [1.5, 2.5, 2.0],
    }

    const { coeff } = flattenPresetForUniforms(preset)
    expect(coeff.length).toBe(MAX_TERMS * 2)

    expect(coeff[0]).toBeCloseTo(0.5) // re0
    expect(coeff[1]).toBeCloseTo(0.3) // im0
    expect(coeff[2]).toBeCloseTo(-0.2) // re1
    expect(coeff[3]).toBeCloseTo(0.7) // im1
    expect(coeff[4]).toBeCloseTo(0.1) // re2
    expect(coeff[5]).toBeCloseTo(-0.4) // im2
  })

  it('energy array is padded to MAX_TERMS', () => {
    const preset: QuantumPreset = {
      termCount: 2,
      omega: [1],
      quantumNumbers: [[0], [1]],
      coefficients: [
        [1, 0],
        [0, 1],
      ],
      energies: [0.5, 1.5],
    }

    const { energy } = flattenPresetForUniforms(preset)
    expect(energy.length).toBe(MAX_TERMS)
    expect(energy[0]).toBeCloseTo(0.5)
    expect(energy[1]).toBeCloseTo(1.5)
    for (let i = 2; i < MAX_TERMS; i++) {
      expect(energy[i]).toBe(0)
    }
  })

  it('returns all Float32Array/Int32Array types', () => {
    const preset = generateQuantumPreset(42, 4, 3, 3, 0.01)
    const result = flattenPresetForUniforms(preset)

    expect(result.omega).toBeInstanceOf(Float32Array)
    expect(result.quantum).toBeInstanceOf(Int32Array)
    expect(result.coeff).toBeInstanceOf(Float32Array)
    expect(result.energy).toBeInstanceOf(Float32Array)
  })

  it('roundtrips: flattened values match original preset data', () => {
    const preset = generateQuantumPreset(1234, 6, 5, 4, 0.05)
    const { omega, quantum, coeff, energy } = flattenPresetForUniforms(preset)

    // Verify omega values
    for (let j = 0; j < 6; j++) {
      expect(omega[j]).toBeCloseTo(preset.omega[j]!, 5)
    }

    // Verify quantum numbers
    for (let k = 0; k < 5; k++) {
      for (let j = 0; j < 6; j++) {
        expect(quantum[k * MAX_DIM + j]).toBe(preset.quantumNumbers[k]![j]!)
      }
    }

    // Verify coefficients
    for (let k = 0; k < 5; k++) {
      expect(coeff[k * 2]).toBeCloseTo(preset.coefficients[k]![0], 5)
      expect(coeff[k * 2 + 1]).toBeCloseTo(preset.coefficients[k]![1], 5)
    }

    // Verify energies
    for (let k = 0; k < 5; k++) {
      expect(energy[k]).toBeCloseTo(preset.energies[k]!, 5)
    }
  })

  it('unused term slots are zeroed', () => {
    const preset = generateQuantumPreset(42, 3, 2, 3, 0.01)
    const { quantum, coeff, energy } = flattenPresetForUniforms(preset)

    // Terms 2-7 (indices 2..MAX_TERMS-1) should be zero
    for (let k = 2; k < MAX_TERMS; k++) {
      for (let j = 0; j < MAX_DIM; j++) {
        expect(quantum[k * MAX_DIM + j]).toBe(0)
      }
      expect(coeff[k * 2]).toBe(0)
      expect(coeff[k * 2 + 1]).toBe(0)
      expect(energy[k]).toBe(0)
    }
  })
})
