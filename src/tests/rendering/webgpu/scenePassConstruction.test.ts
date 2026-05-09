import { describe, expect, it } from 'vitest'

import type { PassConfig } from '@/rendering/webgpu/scenePassConfig'
import { constructPPPasses } from '@/rendering/webgpu/scenePassConstruction'

function makePassConfig(overrides: Partial<PassConfig> = {}): PassConfig {
  return {
    objectType: 'schroedinger',
    dimension: 4,
    bloomEnabled: false,
    antiAliasingMethod: 'none',
    paperEnabled: false,
    frameBlendingEnabled: false,
    isosurface: false,
    quantumMode: 'harmonicOscillator',
    termCount: 1,
    nodalEnabled: false,
    phaseMaterialityEnabled: false,
    interferenceEnabled: false,
    uncertaintyBoundaryEnabled: false,
    temporalReprojectionEnabled: true,
    eigenfunctionCacheEnabled: true,
    analyticalGradientEnabled: true,
    fastEigenInterpolationEnabled: true,
    colorAlgorithm: 'radialDistance',
    representation: 'position',
    openQuantumEnabled: false,
    crossSectionEnabled: false,
    probabilityCurrentEnabled: false,
    densityGridResolution: 96,
    skyboxEnabled: false,
    skyboxMode: 'classic',
    backgroundColor: '#232323',
    ...overrides,
  }
}

type SkyboxPassInternals = {
  skyboxConfig: {
    sun: boolean
    vignette: boolean
  }
}

describe('constructPPPasses', () => {
  it('enables skybox sun effect so procedural sunIntensity reaches the shader', () => {
    const passes = constructPPPasses(
      makePassConfig({
        skyboxEnabled: true,
        skyboxMode: 'procedural_twilight',
      })
    )

    const skyboxPass = passes[0]?.pass as unknown as SkyboxPassInternals
    expect(skyboxPass.skyboxConfig.sun).toBe(true)
    expect(skyboxPass.skyboxConfig.vignette).toBe(false)
  })
})
