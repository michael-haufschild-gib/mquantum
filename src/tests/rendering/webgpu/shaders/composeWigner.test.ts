/**
 * Tests for Wigner shader composition.
 *
 * Validates that composeWignerSpatialComputeShader includes the correct
 * quantum math modules for each mode, and that composeWignerReconstructComputeShader
 * produces a valid compute shader.
 *
 * These tests caught: missing Laguerre module for hydrogen Wigner, wrong
 * DIMENSION define, missing hydrogen stub in HO mode.
 *
 * @module tests/rendering/webgpu/shaders/composeWigner
 */

import { describe, expect, it } from 'vitest'

import { composeWignerReconstructComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeWignerReconstruct'
import { composeWignerSpatialComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeWignerSpatial'
import { generateMainBlockWigner2D } from '@/rendering/webgpu/shaders/schroedinger/mainWigner2D.wgsl'

describe('composeWignerSpatialComputeShader', () => {
  it('HO mode: includes Hermite, Laguerre, Wigner HO modules', () => {
    const { wgsl, modules, features } = composeWignerSpatialComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
    })

    expect(wgsl).toContain('ACTUAL_DIM')
    expect(wgsl).not.toContain('const DIMENSION: i32')
    expect(wgsl).toContain('@workgroup_size')
    expect(modules).toContain('Hermite Polynomials')
    expect(modules).toContain('Laguerre Polynomials')
    expect(modules).toContain('Wigner HO')
    // Should NOT include hydrogen modules in HO mode
    expect(modules).not.toContain('Spherical Harmonics')
    expect(modules).not.toContain('Hydrogen Radial')
    // But should include the stub
    expect(modules).toContain('Wigner Hydrogen Stub')
    expect(features).toContain('Harmonic Oscillator')
  })

  it('hydrogenND mode: includes spherical harmonics and hydrogen modules', () => {
    const { wgsl, modules, features } = composeWignerSpatialComputeShader({
      dimension: 5,
      quantumMode: 'hydrogenND',
    })

    expect(wgsl).toContain('ACTUAL_DIM')
    expect(wgsl).not.toContain('const DIMENSION: i32')
    expect(wgsl).toContain('HYDROGEN_MODE_ENABLED: bool = true')
    expect(modules).toContain('Spherical Harmonics')
    expect(modules).toContain('Hydrogen Radial')
    expect(modules).toContain('Wigner Hydrogen')
    // Should NOT include the stub
    expect(modules).not.toContain('Wigner Hydrogen Stub')
    expect(features).toContain('Hydrogen ND')
  })

  it('dimension clamped to [3, 11]', () => {
    const { wgsl } = composeWignerSpatialComputeShader({
      dimension: 2,
      quantumMode: 'harmonicOscillator',
    })
    // ACTUAL_DIM should be clamped to 3
    expect(wgsl).toContain('ACTUAL_DIM: i32 = 3')
  })

  it('high dimension (11D) produces valid WGSL', () => {
    const { wgsl, modules } = composeWignerSpatialComputeShader({
      dimension: 11,
      quantumMode: 'harmonicOscillator',
    })
    expect(wgsl).toContain('ACTUAL_DIM: i32 = 11')
    expect(wgsl).not.toContain('const DIMENSION: i32')
    expect(modules.length).toBeGreaterThan(5)
  })

  it('clamps omega consistently in diagonal Wigner phase-space radius', () => {
    const { wgsl } = composeWignerSpatialComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
    })

    const diagonalFn = wgsl.match(/fn wignerDiagonal[\s\S]*?return sign \/ PI/)?.[0] ?? ''
    expect(diagonalFn).toContain('let omegaSafe = max(omega, 1e-20);')
    expect(diagonalFn).toContain('let invOmega = 1.0 / omegaSafe;')
    expect(diagonalFn).toContain('let u2 = omegaSafe * x * x + p * p * invOmega;')
    expect(diagonalFn).not.toContain('let u2 = omega * x * x + p * p * invOmega;')
  })
})

describe('composeWignerReconstructComputeShader', () => {
  it('generates a valid compute shader with workgroup_size', () => {
    const { wgsl, modules, features } = composeWignerReconstructComputeShader()

    expect(wgsl).toContain('@workgroup_size')
    expect(modules).toContain('Reconstruct Main')
    expect(modules).toContain('Reconstruct Bindings')
    expect(features).toContain('Wigner Reconstruction')
    // The shader should contain compute entry point
    expect(wgsl).toContain('@compute')
  })

  it('does not include quantum math modules (reconstruction is pure texture read)', () => {
    const { modules } = composeWignerReconstructComputeShader()
    expect(modules).not.toContain('Hermite Polynomials')
    expect(modules).not.toContain('Laguerre Polynomials')
    expect(modules).not.toContain('Spherical Harmonics')
  })
})

describe('generateMainBlockWigner2D', () => {
  it('declares the same finite aspect fallback as Wigner cache grid upload', () => {
    const wgsl = generateMainBlockWigner2D(true)

    expect(wgsl).toContain('var aspect = 1.0;')
    expect(wgsl).toContain('if (camera.resolution.x > 0.0 && camera.resolution.y > 0.0)')
    expect(wgsl).toContain('aspect = camera.resolution.x / camera.resolution.y;')
    expect(wgsl).not.toContain('let aspect = camera.resolution.x / camera.resolution.y;')
  })
})
