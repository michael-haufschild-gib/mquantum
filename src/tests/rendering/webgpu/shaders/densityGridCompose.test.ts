/**
 * Tests for density grid compute shader composition with open quantum support.
 */
import { describe, expect, it } from 'vitest'
import { composeDensityGridComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/compose'

describe('composeDensityGridComputeShader — density matrix mode', () => {
  it('includes USE_DENSITY_MATRIX define when useDensityMatrix is true', () => {
    const { wgsl, features } = composeDensityGridComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      termCount: 2,
      storageFormat: 'rgba16float',
      useDensityMatrix: true,
    })

    expect(wgsl).toContain('const USE_DENSITY_MATRIX: bool = true;')
    expect(features).toContain('Density Matrix (Open Quantum)')
  })

  it('sets USE_DENSITY_MATRIX to false when disabled', () => {
    const { wgsl, features } = composeDensityGridComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      termCount: 2,
      storageFormat: 'r16float',
      useDensityMatrix: false,
    })

    expect(wgsl).toContain('const USE_DENSITY_MATRIX: bool = false;')
    expect(features).not.toContain('Density Matrix (Open Quantum)')
  })

  it('includes OpenQuantumUniforms struct when density matrix mode', () => {
    const { wgsl } = composeDensityGridComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      termCount: 2,
      storageFormat: 'rgba16float',
      useDensityMatrix: true,
    })

    expect(wgsl).toContain('OpenQuantumUniforms')
    expect(wgsl).toContain('getRho')
  })

  it('excludes OpenQuantumUniforms struct when not in density matrix mode', () => {
    const { wgsl } = composeDensityGridComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      termCount: 2,
      storageFormat: 'r16float',
      useDensityMatrix: false,
    })

    expect(wgsl).not.toContain('OpenQuantumUniforms')
  })

  it('includes singleBasis block for density matrix evaluation', () => {
    const { wgsl } = composeDensityGridComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      termCount: 2,
      storageFormat: 'rgba16float',
      useDensityMatrix: true,
    })

    expect(wgsl).toContain('evaluateSingleBasis')
  })

  it('excludes singleBasis block when not density matrix mode', () => {
    const { wgsl } = composeDensityGridComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      termCount: 2,
      storageFormat: 'r16float',
      useDensityMatrix: false,
    })

    expect(wgsl).not.toContain('evaluateSingleBasis')
  })

  it('includes open quantum bindings (binding 4) when density matrix mode', () => {
    const { wgsl } = composeDensityGridComputeShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      termCount: 2,
      storageFormat: 'rgba16float',
      useDensityMatrix: true,
    })

    expect(wgsl).toContain('@binding(4)')
  })
})
