import { describe, expect, it } from 'vitest'
import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

describe('Schroedinger nodal WGSL composition', () => {
  it('composes physical nodal controls and removes the legacy density-band heuristic', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'harmonicOscillator',
      isosurface: false,
      useDensityGrid: false,
    })

    expect(wgsl).toContain('nodalDefinition: i32')
    expect(wgsl).toContain('nodalTolerance: f32')
    expect(wgsl).toContain('nodalFamilyFilter: i32')
    expect(wgsl).toContain('nodalLobeColoringEnabled: u32')
    expect(wgsl).toContain('nodalColorReal: vec3f')
    expect(wgsl).toContain('nodalColorImag: vec3f')
    expect(wgsl).toContain('nodalColorPositive: vec3f')
    expect(wgsl).toContain('nodalColorNegative: vec3f')

    expect(wgsl).toContain('const NODAL_DEFINITION_PSI_ABS')
    expect(wgsl).toContain('const NODAL_FAMILY_ALL')
    expect(wgsl).toContain('fn computePhysicalNodalField(')

    expect(wgsl).not.toContain('fn computeNodalIntensity(')
    expect(wgsl).not.toContain('lowDensityMask = 1.0 - smoothstep(1e-5, 2e-3, rho)')
  })
})
