import { describe, expect, it, vi } from 'vitest'

import type { WebGPURenderPass } from '@/rendering/webgpu/core/types'
import type { WebGPURenderGraph } from '@/rendering/webgpu/graph/WebGPURenderGraph'
import { ToScreenPass } from '@/rendering/webgpu/passes/ToScreenPass'

interface ScenePassConfig {
  objectType: 'schroedinger'
  dimension: number
  bloomEnabled: boolean
  antiAliasingMethod: 'none' | 'fxaa' | 'smaa'
  paperEnabled: boolean
  frameBlendingEnabled: boolean
  isosurface: boolean
  quantumMode: 'harmonicOscillator' | 'hydrogenND'
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  nodalEnabled: boolean
  phaseMaterialityEnabled: boolean
  interferenceEnabled: boolean
  uncertaintyBoundaryEnabled: boolean
  temporalReprojectionEnabled: boolean
  eigenfunctionCacheEnabled: boolean
  analyticalGradientEnabled: boolean
  fastEigenInterpolationEnabled: boolean
  representation: 'position' | 'momentum'
  colorAlgorithm:
    | 'lch'
    | 'multiSource'
    | 'radial'
    | 'phase'
    | 'mixed'
    | 'blackbody'
    | 'phaseCyclicUniform'
    | 'phaseDiverging'
    | 'diverging'
    | 'relativePhase'
    | 'radialDistance'
    | 'domainColoringPsi'
  skyboxEnabled: boolean
  skyboxMode:
    | 'classic'
    | 'procedural_aurora'
    | 'procedural_nebula'
    | 'procedural_crystalline'
    | 'procedural_horizon'
    | 'procedural_ocean'
    | 'procedural_twilight'
  backgroundColor: string
  renderResolutionScale: number
}

function createPassConfig(overrides: Partial<ScenePassConfig> = {}): ScenePassConfig {
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
    representation: 'position',
    colorAlgorithm: 'radialDistance',
    skyboxEnabled: false,
    skyboxMode: 'classic',
    backgroundColor: '#232323',
    renderResolutionScale: 1,
    ...overrides,
  }
}

function createGraphHarness() {
  const resources = new Map<string, Record<string, unknown>>()
  const passes: WebGPURenderPass[] = []

  const graph = {
    addResource: vi.fn((id: string, config: Record<string, unknown>) => {
      resources.set(id, config)
    }),
    addPass: vi.fn(async (pass: WebGPURenderPass) => {
      passes.push(pass)
    }),
    addInitializedPass: vi.fn((pass: WebGPURenderPass) => {
      passes.push(pass)
    }),
    getPass: vi.fn((id: string) => passes.find((pass) => pass.id === id)),
    removePass: vi.fn((id: string) => {
      const idx = passes.findIndex((p) => p.id === id)
      if (idx >= 0) passes.splice(idx, 1)
    }),
    removeResource: vi.fn((id: string) => resources.delete(id)),
    getSetupContext: vi.fn(() => null),
  }

  return { graph, resources, passes }
}

describe('WebGPUScene CAS sharpening', () => {
  it('maps render scale to CAS sharpness with threshold and clamp', async () => {
    const sceneModule = (await import('@/rendering/webgpu/scenePassConfig')) as unknown as Record<
      string,
      unknown
    >

    const computeCasSharpnessFromRenderScale = sceneModule[
      'computeCasSharpnessFromRenderScale'
    ] as (scale: number) => number

    expect(computeCasSharpnessFromRenderScale(1.0)).toBe(0)
    expect(computeCasSharpnessFromRenderScale(0.95)).toBe(0)
    expect(computeCasSharpnessFromRenderScale(0.9)).toBeCloseTo(0.15, 6)
    expect(computeCasSharpnessFromRenderScale(0.5)).toBeCloseTo(0.7, 6)
    expect(computeCasSharpnessFromRenderScale(0.1)).toBeCloseTo(0.7, 6)
  })

  it('initializes ToScreenPass sharpness from render resolution scale', async () => {
    const sceneModule = (await import('@/rendering/webgpu/scenePassSetup')) as unknown as Record<
      string,
      unknown
    >

    const setupRenderPasses = sceneModule['setupRenderPasses'] as (
      graph: WebGPURenderGraph,
      config: ScenePassConfig
    ) => Promise<void>

    const { graph, passes } = createGraphHarness()
    await setupRenderPasses(
      graph as unknown as WebGPURenderGraph,
      createPassConfig({ renderResolutionScale: 0.9 })
    )

    const toScreen = passes.find((pass) => pass.id === 'toScreen')
    expect(toScreen).toBeInstanceOf(ToScreenPass)
    expect((toScreen as ToScreenPass).getSharpness()).toBeCloseTo(0.15, 6)
  })
})
