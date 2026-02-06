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
    expect(wgsl).toContain('fn nodalCrossingMask(')
    expect(wgsl).toContain('hydrogenRadial(uniforms.principalN, uniforms.azimuthalL, r3D, uniforms.bohrRadius);')
    expect(wgsl).toContain('let signedDistance = abs(value) / gradMag;')
    expect(wgsl).toContain('let nodalScattered = nodalColor * fogColor;')
    expect(wgsl).toContain('transmittance *= (1.0 - nodalAlpha);')
    expect(wgsl).toContain('transmittance *= vec3f(1.0 - nodalAlpha);')
    // Smooth spatial fade matching Gaussian envelope falloff
    expect(wgsl).toContain('nodalRadialFade = 1.0 - smoothstep(0.25, 0.65, r2 / boundR2)')
    // Strict sign change in crossing mask
    expect(wgsl).toContain('if (minF >= 0.0 || maxF <= 0.0)')
    expect(wgsl).toContain('intensity = nodalBandMask(psiCenter.x, gradRe, eps) * crossingRe;')
    expect(wgsl).toContain('intensity = nodalBandMask(psiCenter.y, gradIm, eps) * crossingIm;')
    expect(wgsl).toContain('let crossingAny = max(crossingRe, crossingIm);')
    expect(wgsl).toContain('intensity = nodalBandMask(psiAbsCenter, gradAbs, eps) * crossingAny;')

    expect(wgsl).not.toContain('fn computeNodalIntensity(')
    expect(wgsl).not.toContain('lowDensityMask = 1.0 - smoothstep(1e-5, 2e-3, rho)')
    expect(wgsl).not.toContain('nodal.intensity * uniforms.nodalStrength * adaptiveStep * 2.5')
    expect(wgsl).not.toContain('intensity = nodalBandMask(psiAbs, gradAbs, eps);')
  })

  it('keeps non-emissive nodal compositing in density-grid path', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'harmonicOscillator',
      isosurface: false,
      useDensityGrid: true,
    })

    // Grid path: smooth spatial fade matching Gaussian envelope falloff
    expect(wgsl).toContain('nodalRadialFadeGrid = 1.0 - smoothstep(0.25, 0.65, nodalR2Grid / nodalBoundR2Grid)')
    expect(wgsl).toContain('transmittance *= (1.0 - nodalAlpha);')
    expect(wgsl).not.toContain('nodal.intensity * uniforms.nodalStrength * stepLen * 2.5')
  })

  it('uses 3D hydrogen radial core in hydrogen-ND wavefunction evaluation', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 7,
      quantumMode: 'hydrogenND',
      isosurface: false,
      useDensityGrid: false,
    })

    expect(wgsl).toContain('if (hydrogenRadialEarlyExit(r3D, uniforms))')
    expect(wgsl).toContain('R_nl(r_3D) from the 3D hydrogen core')
    expect(wgsl).not.toContain('hydrogenRadialEarlyExit(rND, uniforms)')
    expect(wgsl).not.toContain(
      'hydrogenRadial(uniforms.principalN, uniforms.azimuthalL, rND, uniforms.bohrRadius);'
    )
  })
})
