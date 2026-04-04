import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { canUseGridOnly } from '@/rendering/webgpu/shaders/schroedinger/composeConfig'

describe('Schroedinger cross-section WGSL composition', () => {
  it('includes cross-section uniforms and compositing helpers in volumetric mode', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 5,
      quantumMode: 'harmonicOscillator',
      isosurface: false,
      useDensityGrid: false,
    })

    expect(wgsl).toContain('crossSectionEnabled: u32')
    expect(wgsl).toContain('crossSectionPlane: vec4f')
    expect(wgsl).toContain('crossSectionWindow: vec4f')
    expect(wgsl).toContain('crossSectionAutoWindow: u32')
    expect(wgsl).toContain('crossSectionPlaneColor: vec4f')
    expect(wgsl).toContain('const CROSS_SECTION_COMPOSITE_SLICE_ONLY')
    expect(wgsl).toContain('fn evaluateCrossSectionSample(')
    expect(wgsl).toContain('schroedinger.crossSectionEnabled != 0u')
  })

  it('composes cross-section overlay logic for isosurface and temporal paths', () => {
    const { wgsl: isoWgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
      isosurface: true,
      useDensityGrid: false,
    })
    const { wgsl: temporalWgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'harmonicOscillator',
      isosurface: false,
      temporalAccumulation: true,
      useDensityGrid: false,
    })

    expect(isoWgsl).toContain('let crossSection = evaluateCrossSectionSample(')
    expect(isoWgsl).toContain(
      'schroedinger.crossSectionCompositeMode == CROSS_SECTION_COMPOSITE_SLICE_ONLY'
    )
    expect(temporalWgsl).toContain('let crossSection = evaluateCrossSectionSample(')
    expect(temporalWgsl).toContain('output.color = vec4f(finalColor, finalAlpha);')
  })

  it('disables gridOnly when crossSectionEnabled is true, preserving real evalPsi', () => {
    // Config that would be gridOnly WITHOUT cross-section:
    // useDensityGrid=true, non-phase color alg, no quantum effects
    const gridOnlyBase = {
      dimension: 5,
      quantumMode: 'harmonicOscillator' as const,
      isosurface: false,
      useDensityGrid: true,
      colorAlgorithm: 11, // radialDistance — not a phase color algorithm
      phaseMateriality: false,
      interference: false,
      nodal: false,
      probabilityCurrentEnabled: false,
      useDensityMatrix: false,
      crossSectionEnabled: false,
    }

    // Without cross-section → gridOnly=true → stubs
    expect(canUseGridOnly(gridOnlyBase, false)).toBe(true)
    const { wgsl: gridOnlyWgsl } = composeSchroedingerShader(gridOnlyBase)
    expect(gridOnlyWgsl).toContain('Quantum Math Stubs (grid-only)')

    // With cross-section → gridOnly=false → real quantum math
    const withCrossSection = { ...gridOnlyBase, crossSectionEnabled: true }
    expect(canUseGridOnly(withCrossSection, false)).toBe(false)
    const { wgsl: crossSectionWgsl } = composeSchroedingerShader(withCrossSection)
    expect(crossSectionWgsl).not.toContain('Quantum Math Stubs (grid-only)')
    expect(crossSectionWgsl).toContain('fn evalPsi(')
    expect(crossSectionWgsl).toContain('fn mapPosToND(')
  })
})
