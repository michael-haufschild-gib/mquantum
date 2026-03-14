/**
 * Unit tests for Pauli spinor physics config constraints.
 *
 * The actual SU(2) rotation and split-step physics run in WGSL on the GPU.
 * These tests verify the CPU-side config values that feed into the shaders
 * produce physically valid parameters.
 */

import { describe, it, expect } from 'vitest'
import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/types'

describe('Pauli physics config constraints', () => {
  // === Lattice and grid ===

  it('default grid sizes are powers of 2 (required for FFT)', () => {
    for (const size of DEFAULT_PAULI_CONFIG.gridSize) {
      expect(Math.log2(size) % 1).toBe(0)
    }
  })

  it('default spacing is positive', () => {
    for (const dx of DEFAULT_PAULI_CONFIG.spacing) {
      expect(dx).toBeGreaterThan(0)
    }
  })

  it('gridSize and spacing arrays match latticeDim', () => {
    expect(DEFAULT_PAULI_CONFIG.gridSize).toHaveLength(DEFAULT_PAULI_CONFIG.latticeDim)
    expect(DEFAULT_PAULI_CONFIG.spacing).toHaveLength(DEFAULT_PAULI_CONFIG.latticeDim)
  })

  // === Physical constants ===

  it('hbar is positive and within valid range', () => {
    expect(DEFAULT_PAULI_CONFIG.hbar).toBeGreaterThan(0)
    expect(DEFAULT_PAULI_CONFIG.hbar).toBeLessThanOrEqual(10)
  })

  it('mass is positive', () => {
    expect(DEFAULT_PAULI_CONFIG.mass).toBeGreaterThan(0)
  })

  it('dt is positive and within clamping bounds', () => {
    expect(DEFAULT_PAULI_CONFIG.dt).toBeGreaterThanOrEqual(0.0001)
    expect(DEFAULT_PAULI_CONFIG.dt).toBeLessThanOrEqual(0.1)
  })

  // === Magnetic field ===

  it('fieldStrength is non-negative', () => {
    expect(DEFAULT_PAULI_CONFIG.fieldStrength).toBeGreaterThanOrEqual(0)
  })

  it('fieldDirection is a [theta, phi] pair with valid spherical angles', () => {
    const [theta, phi] = DEFAULT_PAULI_CONFIG.fieldDirection
    expect(theta).toBeGreaterThanOrEqual(0)
    expect(theta).toBeLessThanOrEqual(Math.PI)
    expect(phi).toBeGreaterThanOrEqual(0)
    expect(phi).toBeLessThanOrEqual(2 * Math.PI)
  })

  // === Spin state ===

  it('initialSpinDirection has valid spherical angles', () => {
    const [theta, phi] = DEFAULT_PAULI_CONFIG.initialSpinDirection
    expect(theta).toBeGreaterThanOrEqual(0)
    expect(theta).toBeLessThanOrEqual(Math.PI)
    expect(phi).toBeGreaterThanOrEqual(0)
    expect(phi).toBeLessThanOrEqual(2 * Math.PI)
  })

  // === Bounding radius computation ===

  it('lattice extent is computable from gridSize and spacing', () => {
    const latticeDim = DEFAULT_PAULI_CONFIG.latticeDim
    let maxExtent = 0
    for (let d = 0; d < latticeDim; d++) {
      const Ld = DEFAULT_PAULI_CONFIG.gridSize[d] * DEFAULT_PAULI_CONFIG.spacing[d]
      if (Ld > maxExtent) maxExtent = Ld
    }
    // Must produce a positive bounding radius
    expect(maxExtent).toBeGreaterThan(0)
    const boundR = (maxExtent / 2) * 1.15
    expect(boundR).toBeGreaterThan(0)
  })

  // === Absorber boundary ===

  it('absorberWidth is between 0 and 1 (fraction of grid)', () => {
    expect(DEFAULT_PAULI_CONFIG.absorberWidth).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_PAULI_CONFIG.absorberWidth).toBeLessThanOrEqual(1)
  })

  it('absorberStrength is non-negative', () => {
    expect(DEFAULT_PAULI_CONFIG.absorberStrength).toBeGreaterThanOrEqual(0)
  })

  // === Spin colors ===

  it('spinUpColor and spinDownColor are in [0,1] range (GPU-ready)', () => {
    for (const c of DEFAULT_PAULI_CONFIG.spinUpColor) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
    for (const c of DEFAULT_PAULI_CONFIG.spinDownColor) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  // === Wave packet parameters ===

  it('packetCenter and packetMomentum have 11 elements (max dimension slots)', () => {
    expect(DEFAULT_PAULI_CONFIG.packetCenter).toHaveLength(11)
    expect(DEFAULT_PAULI_CONFIG.packetMomentum).toHaveLength(11)
  })

  it('packetWidth is positive', () => {
    expect(DEFAULT_PAULI_CONFIG.packetWidth).toBeGreaterThan(0)
  })
})
