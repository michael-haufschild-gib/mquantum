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

function ensureGpuTextureUsageConstants(): void {
  if (!('GPUTextureUsage' in globalThis)) {
    ;(globalThis as unknown as { GPUTextureUsage: Record<string, number> }).GPUTextureUsage = {
      TEXTURE_BINDING: 1 << 0,
      RENDER_ATTACHMENT: 1 << 1,
      COPY_SRC: 1 << 2,
      COPY_DST: 1 << 3,
    }
  }

  if (!('GPUBufferUsage' in globalThis)) {
    ;(globalThis as unknown as { GPUBufferUsage: Record<string, number> }).GPUBufferUsage = {
      UNIFORM: 1 << 0,
      COPY_DST: 1 << 1,
      VERTEX: 1 << 2,
      INDEX: 1 << 3,
      STORAGE: 1 << 4,
      COPY_SRC: 1 << 5,
      QUERY_RESOLVE: 1 << 6,
      MAP_READ: 1 << 7,
    }
  }
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
    representation: 'position',
    colorAlgorithm: 'mixed',
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
    getPass: vi.fn((id: string) => passes.find((pass) => pass.id === id)),
  }

  return { graph, resources, passes }
}

describe('WebGPUScene CAS sharpening', () => {
  it('maps render scale to CAS sharpness with threshold and clamp', async () => {
    ensureGpuTextureUsageConstants()
    const sceneModule = (await import('@/rendering/webgpu/WebGPUScene')) as unknown as Record<
      string,
      unknown
    >

    expect(typeof sceneModule['computeCasSharpnessFromRenderScale']).toBe('function')

    const computeCasSharpnessFromRenderScale = sceneModule['computeCasSharpnessFromRenderScale'] as (
      scale: number
    ) => number

    expect(computeCasSharpnessFromRenderScale(1.0)).toBe(0)
    expect(computeCasSharpnessFromRenderScale(0.95)).toBe(0)
    expect(computeCasSharpnessFromRenderScale(0.9)).toBeCloseTo(0.15, 6)
    expect(computeCasSharpnessFromRenderScale(0.5)).toBeCloseTo(0.7, 6)
    expect(computeCasSharpnessFromRenderScale(0.1)).toBeCloseTo(0.7, 6)
  })

  it('initializes ToScreenPass sharpness from render resolution scale', async () => {
    ensureGpuTextureUsageConstants()
    const sceneModule = (await import('@/rendering/webgpu/WebGPUScene')) as unknown as Record<
      string,
      unknown
    >

    expect(typeof sceneModule['setupRenderPasses']).toBe('function')
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
