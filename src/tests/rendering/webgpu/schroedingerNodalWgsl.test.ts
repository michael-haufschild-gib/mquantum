import { describe, expect, it } from 'vitest'
import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

describe('Schroedinger nodal WGSL composition', () => {
  it('composes physical nodal controls and removes the legacy density-band heuristic', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'harmonicOscillator',
      isosurface: false,
    })

    expect(wgsl).toContain('nodalDefinition: i32')
    expect(wgsl).toContain('nodalTolerance: f32')
    expect(wgsl).toContain('nodalFamilyFilter: i32')
    expect(wgsl).toContain('nodalLobeColoringEnabled: u32')
    expect(wgsl).toContain('nodalColorReal: vec3f')
    expect(wgsl).toContain('nodalColorImag: vec3f')
    expect(wgsl).toContain('nodalColorPositive: vec3f')
    expect(wgsl).toContain('nodalColorNegative: vec3f')
    expect(wgsl).toContain('nodalRenderMode: i32')

    expect(wgsl).toContain('const NODAL_DEFINITION_PSI_ABS')
    expect(wgsl).toContain('const NODAL_FAMILY_ALL')
    expect(wgsl).toContain('const NODAL_RENDER_MODE_SURFACE')
    expect(wgsl).toContain('fn computePhysicalNodalField(')
    expect(wgsl).toContain('fn findNodalSurfaceHit(')
    expect(wgsl).toContain('fn resolveSurfaceNodalDefinition(')
    expect(wgsl).toContain('amplitude: f32')
    expect(wgsl).toContain('let minAmplitudeScale = mix(5.5, 2.0, strengthT);')
    expect(wgsl).toContain('let minAmplitudeFloor = mix(8e-4, 2e-4, strengthT);')
    expect(wgsl).toContain('let minAmplitude = max(uniforms.nodalTolerance * minAmplitudeScale, minAmplitudeFloor);')
    expect(wgsl).toContain('if (max(prevSample.amplitude, currSample.amplitude) < minAmplitude)')
    expect(wgsl).toContain(
      'if (uniforms.nodalDefinition == NODAL_DEFINITION_PSI_ABS) {\n    return NODAL_DEFINITION_REAL;'
    )
    expect(wgsl).toContain('fn nodalCrossingMask(')
    expect(wgsl).toContain('hydrogenRadial(uniforms.principalN, uniforms.azimuthalL, r3D, uniforms.bohrRadius);')
    expect(wgsl).toContain('let signedDistance = abs(value) / gradMag;')
    expect(wgsl).toContain('let nodalScattered = mix(nodalColor, nodalColor * fogColor, 0.35);')
    expect(wgsl).toContain('transmittance *= (1.0 - nodalAlpha * 0.6);')
    expect(wgsl).toContain('if (minAbs <= epsSafe && span >= epsSafe * 0.5)')
    expect(wgsl).toContain('intensity = nodalBandMask(psiCenter.x, gradRe, eps) * crossingRe;')
    expect(wgsl).toContain('intensity = nodalBandMask(psiCenter.y, gradIm, eps) * crossingIm;')
    expect(wgsl).toContain('let crossingAny = max(max(crossingRe, crossingIm), crossingAbs);')
    expect(wgsl).toContain('intensity = nodalBandMask(psiAbsCenter, gradAbs, eps) * crossingAny;')
    expect(wgsl).toContain('let envelopeWeight = smoothstep(envelopeFloor, envelopeCeil, maxAbsPsi);')

    expect(wgsl).not.toContain('fn computeNodalIntensity(')
    expect(wgsl).not.toContain('lowDensityMask = 1.0 - smoothstep(1e-5, 2e-3, rho)')
    expect(wgsl).not.toContain('nodal.intensity * uniforms.nodalStrength * adaptiveStep * 2.5')
    expect(wgsl).not.toContain('intensity = nodalBandMask(psiAbs, gradAbs, eps);')
    expect(wgsl).not.toContain('fn nodalSliceMask(')
  })

  it('uses 3D hydrogen radial core in hydrogen-ND wavefunction evaluation', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 7,
      quantumMode: 'hydrogenND',
      isosurface: false,
    })

    expect(wgsl).toContain('if (hydrogenRadialEarlyExit(r3D, uniforms))')
    expect(wgsl).toContain('R_nl(r_3D) from the 3D hydrogen core')
    expect(wgsl).not.toContain('hydrogenRadialEarlyExit(rND, uniforms)')
    expect(wgsl).not.toContain(
      'hydrogenRadial(uniforms.principalN, uniforms.azimuthalL, rND, uniforms.bohrRadius);'
    )
  })

  it('keeps nodal controls active in isosurface mode', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 5,
      quantumMode: 'hydrogenND',
      isosurface: true,
    })

    expect(wgsl).toContain('let localSpan = stepLen * mix(3.0, 8.0, surfaceStrengthT);')
    expect(wgsl).toContain('findNodalSurfaceHit(ro, rd, localNear, localFar, animTime, schroedinger)')
    expect(wgsl).toContain('computePhysicalNodalField(p, animTime, schroedinger)')
    expect(wgsl).toContain('schroedinger.nodalRenderMode == NODAL_RENDER_MODE_SURFACE')
    expect(wgsl).not.toContain('let nodalSurfaceModeActive =')
  })
})
