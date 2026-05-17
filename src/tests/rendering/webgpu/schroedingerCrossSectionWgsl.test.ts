import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import {
  canUseGridOnly,
  type SchroedingerWGSLShaderConfig,
} from '@/rendering/webgpu/shaders/schroedinger/composeConfig'

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
    const { wgsl: isoTemporalWgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'harmonicOscillator',
      isosurface: true,
      temporalAccumulation: true,
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
    expect(isoTemporalWgsl).toContain('hitT = crossSection.hitT;')
    expect(isoTemporalWgsl).toContain('let hitPosModel = ro + rd * hitT;')
    expect(isoTemporalWgsl).toContain('output.worldPosition = vec4f(hitPosWorld, hitT);')
    expect(temporalWgsl).toContain('let crossSection = evaluateCrossSectionSample(')
    expect(temporalWgsl).toContain('output.color = vec4f(finalColor, finalAlpha);')
  })

  it('canUseGridOnly returns false when crossSectionEnabled is true', () => {
    const gridOnlyConfig: SchroedingerWGSLShaderConfig = {
      dimension: 5,
      useDensityGrid: true,
      colorAlgorithm: 11, // radialDistance — not in PHASE_COLOR_ALGS
      phaseMateriality: false,
      interference: false,
      nodal: false,
      probabilityCurrentEnabled: false,
      useDensityMatrix: false,
      crossSectionEnabled: false,
    }

    // Without cross-section → gridOnly eligible
    expect(canUseGridOnly(gridOnlyConfig, false)).toBe(true)

    // With cross-section → gridOnly must be false so real evalPsi is compiled
    expect(canUseGridOnly({ ...gridOnlyConfig, crossSectionEnabled: true }, false)).toBe(false)

    // Omitted crossSectionEnabled defaults to true → gridOnly is false (safe default)
    const { crossSectionEnabled: _, ...omitted } = gridOnlyConfig
    expect(canUseGridOnly(omitted, false)).toBe(false)
  })

  it('includes real quantum math when cross-section is active with density grid', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 5,
      quantumMode: 'harmonicOscillator',
      isosurface: false,
      useDensityGrid: true,
      colorAlgorithm: 11, // radialDistance — not a phase color algorithm
      phaseMateriality: false,
      interference: false,
      nodal: false,
      probabilityCurrentEnabled: false,
      crossSectionEnabled: true,
    })

    // gridOnly is false → real quantum math compiled, no stubs
    expect(wgsl).not.toContain('Quantum Math Stubs (grid-only)')
    expect(wgsl).toContain('fn evalPsi(')
    expect(wgsl).toContain('fn mapPosToND(')
  })
})
