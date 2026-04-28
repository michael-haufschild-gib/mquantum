/**
 * Tests for the Pauli spinor extended-state default configuration.
 *
 * `DEFAULT_PAULI_CONFIG` is the canonical "load this if no preset" record.
 * The shape is read by every code path that constructs a Pauli simulation:
 * shader uniform packers, store reset, URL deserialization, preset import.
 * A subtle drift (e.g. `gridSize[2]` becoming wrong, or `pmlTargetReflection`
 * becoming non-positive) silently corrupts the simulation without throwing
 * — these tests pin every invariant that callers depend on.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/pauli'

describe('DEFAULT_PAULI_CONFIG', () => {
  it('latticeDim default is 3 (Pauli is 2-component spinor in 3D)', () => {
    expect(DEFAULT_PAULI_CONFIG.latticeDim).toBe(3)
  })

  it('gridSize matches latticeDim and consists of FFT-friendly powers of 2', () => {
    expect(DEFAULT_PAULI_CONFIG.gridSize).toHaveLength(DEFAULT_PAULI_CONFIG.latticeDim)
    for (const N of DEFAULT_PAULI_CONFIG.gridSize) {
      expect(N).toBeGreaterThan(0)
      expect(Number.isInteger(N)).toBe(true)
      // Power-of-2 check: N & (N-1) === 0
      expect(N & (N - 1)).toBe(0)
    }
  })

  it('spacing has same length as gridSize and entries are strictly positive', () => {
    expect(DEFAULT_PAULI_CONFIG.spacing).toHaveLength(DEFAULT_PAULI_CONFIG.gridSize.length)
    for (const a of DEFAULT_PAULI_CONFIG.spacing) {
      expect(a).toBeGreaterThan(0)
      expect(Number.isFinite(a)).toBe(true)
    }
  })

  it('dt is small and positive (split-step Schroedinger stability)', () => {
    expect(DEFAULT_PAULI_CONFIG.dt).toBeGreaterThan(0)
    expect(DEFAULT_PAULI_CONFIG.dt).toBeLessThan(0.1)
  })

  it('stepsPerFrame is a positive integer', () => {
    expect(Number.isInteger(DEFAULT_PAULI_CONFIG.stepsPerFrame)).toBe(true)
    expect(DEFAULT_PAULI_CONFIG.stepsPerFrame).toBeGreaterThan(0)
  })

  it('hbar and mass are positive (physically valid)', () => {
    expect(DEFAULT_PAULI_CONFIG.hbar).toBeGreaterThan(0)
    expect(DEFAULT_PAULI_CONFIG.mass).toBeGreaterThan(0)
  })

  it('fieldType is the documented Stern-Gerlach default (gradient)', () => {
    // Set deliberately so the default visualization shows two-lobe splitting.
    expect(DEFAULT_PAULI_CONFIG.fieldType).toBe('gradient')
  })

  it('initialCondition is gaussianSuperposition (matches Stern-Gerlach demo)', () => {
    expect(DEFAULT_PAULI_CONFIG.initialCondition).toBe('gaussianSuperposition')
  })

  it('packetCenter and packetMomentum are sized for max dimension (11 entries)', () => {
    // Dimension can grow to 11 without re-allocation; the array carries the
    // full max-dimension layout to avoid resize-during-update bugs.
    expect(DEFAULT_PAULI_CONFIG.packetCenter).toHaveLength(11)
    expect(DEFAULT_PAULI_CONFIG.packetMomentum).toHaveLength(11)
  })

  it('packetWidth is positive (Gaussian sigma must be > 0)', () => {
    expect(DEFAULT_PAULI_CONFIG.packetWidth).toBeGreaterThan(0)
  })

  it('initialSpinDirection has the in-plane orientation (θ=π/2)', () => {
    // θ = π/2 on the Bloch sphere ⇒ equator ⇒ equal-superposition initial state.
    expect(DEFAULT_PAULI_CONFIG.initialSpinDirection[0]).toBeCloseTo(Math.PI / 2, 9)
    expect(DEFAULT_PAULI_CONFIG.initialSpinDirection[1]).toBe(0)
  })

  it('fieldStrength and gradientStrength are non-negative', () => {
    expect(DEFAULT_PAULI_CONFIG.fieldStrength).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_PAULI_CONFIG.gradientStrength).toBeGreaterThanOrEqual(0)
  })

  it('rotatingFrequency is finite (positive or zero, depending on field type)', () => {
    expect(Number.isFinite(DEFAULT_PAULI_CONFIG.rotatingFrequency)).toBe(true)
  })

  it('absorber config: enabled, narrow strip, very low reflection target', () => {
    expect(DEFAULT_PAULI_CONFIG.absorberEnabled).toBe(true)
    expect(DEFAULT_PAULI_CONFIG.absorberWidth).toBeGreaterThan(0)
    expect(DEFAULT_PAULI_CONFIG.absorberWidth).toBeLessThan(1)
    // Reflection coefficient must be strictly positive and small for stable PML.
    expect(DEFAULT_PAULI_CONFIG.pmlTargetReflection).toBeGreaterThan(0)
    expect(DEFAULT_PAULI_CONFIG.pmlTargetReflection).toBeLessThan(0.01)
  })

  it('diagnostics enabled by default (showing UI panel needs data)', () => {
    expect(DEFAULT_PAULI_CONFIG.diagnosticsEnabled).toBe(true)
    expect(Number.isInteger(DEFAULT_PAULI_CONFIG.diagnosticsInterval)).toBe(true)
    expect(DEFAULT_PAULI_CONFIG.diagnosticsInterval).toBeGreaterThan(0)
  })

  it('slice animation is off by default with sane speed/amplitude', () => {
    expect(DEFAULT_PAULI_CONFIG.sliceAnimationEnabled).toBe(false)
    expect(DEFAULT_PAULI_CONFIG.sliceSpeed).toBeGreaterThan(0)
    expect(DEFAULT_PAULI_CONFIG.sliceAmplitude).toBeGreaterThan(0)
    expect(DEFAULT_PAULI_CONFIG.sliceAmplitude).toBeLessThanOrEqual(1)
  })

  it('needsReset is true so the first init pass actually runs', () => {
    expect(DEFAULT_PAULI_CONFIG.needsReset).toBe(true)
  })

  it('slicePositions is empty at the default 3D config (no slots leak into the uniform)', () => {
    // Per source comment: empty for 3D, dynamically sized for higher dims by
    // initializePauliForDimension. A non-empty default would leak unused
    // slots into the WGSL uniform buffer.
    expect(DEFAULT_PAULI_CONFIG.slicePositions).toEqual([])
  })

  it('spin colors are valid RGB triples in [0, 1]', () => {
    for (const color of [DEFAULT_PAULI_CONFIG.spinUpColor, DEFAULT_PAULI_CONFIG.spinDownColor]) {
      expect(color).toHaveLength(3)
      for (const c of color) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })

  it('spin-up and spin-down colors are visually distinct (max-channel difference > 0.5)', () => {
    // Distinguishability check — accidentally setting both to white kills
    // the visualization.
    let maxDiff = 0
    for (let i = 0; i < 3; i++) {
      const d = Math.abs(
        DEFAULT_PAULI_CONFIG.spinUpColor[i]! - DEFAULT_PAULI_CONFIG.spinDownColor[i]!
      )
      if (d > maxDiff) maxDiff = d
    }
    expect(maxDiff).toBeGreaterThan(0.5)
  })

  it('fieldDirection is a 2-element [θ, φ] tuple', () => {
    expect(DEFAULT_PAULI_CONFIG.fieldDirection).toHaveLength(2)
  })

  it('default fieldView is spinDensity (the Stern-Gerlach two-lobe display)', () => {
    expect(DEFAULT_PAULI_CONFIG.fieldView).toBe('spinDensity')
  })

  it('default potentialType is none (no scalar trap competing with the magnetic gradient)', () => {
    expect(DEFAULT_PAULI_CONFIG.potentialType).toBe('none')
  })

  it('default autoScale is false (preserves absolute-amplitude semantics for the demo)', () => {
    expect(DEFAULT_PAULI_CONFIG.autoScale).toBe(false)
  })
})
