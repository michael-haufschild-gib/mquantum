import { describe, expect, it, vi } from 'vitest'
import type { WebGPURenderPass } from '@/rendering/webgpu/core/types'
import type { WebGPURenderGraph } from '@/rendering/webgpu/graph/WebGPURenderGraph'

interface ScenePassConfig {
  objectType: 'schroedinger'
  dimension: number
  bloomEnabled: boolean
  ssaoEnabled: boolean
  antiAliasingMethod: 'none' | 'fxaa' | 'smaa'
  bokehEnabled: boolean
  paperEnabled: boolean
  frameBlendingEnabled: boolean
  cinematicEnabled: boolean
  isosurface: boolean
  quantumMode: 'harmonicOscillator' | 'hydrogenND'
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  useDensityGrid: boolean
  temporalReprojectionEnabled: boolean
  colorAlgorithm:
    | 'monochromatic'
    | 'analogous'
    | 'cosine'
    | 'normal'
    | 'distance'
    | 'lch'
    | 'multiSource'
    | 'radial'
    | 'phase'
    | 'mixed'
    | 'blackbody'
  skyboxEnabled: boolean
  skyboxMode:
    | 'classic'
    | 'procedural_aurora'
    | 'procedural_nebula'
    | 'procedural_crystalline'
    | 'procedural_horizon'
    | 'procedural_ocean'
    | 'procedural_twilight'
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
}

function createPassConfig(overrides: Partial<ScenePassConfig> = {}): ScenePassConfig {
  return {
    objectType: 'schroedinger',
    dimension: 4,
    bloomEnabled: false,
    ssaoEnabled: false,
    antiAliasingMethod: 'none',
    bokehEnabled: false,
    paperEnabled: false,
    frameBlendingEnabled: false,
    cinematicEnabled: false,
    isosurface: false,
    quantumMode: 'harmonicOscillator',
    termCount: 1,
    useDensityGrid: false,
    temporalReprojectionEnabled: true,
    colorAlgorithm: 'monochromatic',
    skyboxEnabled: false,
    skyboxMode: 'classic',
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
  }

  return { graph, resources, passes }
}

describe('WebGPUScene temporal reprojection wiring', () => {
  it('creates Schrödinger renderer in quarter-res temporal mode when enabled', async () => {
    ensureGpuTextureUsageConstants()
    const { createObjectRenderer } = await import('@/rendering/webgpu/WebGPUScene')
    const renderer = createObjectRenderer('schroedinger', createPassConfig())

    if (!renderer) {
      throw new Error('Expected Schrödinger renderer to be created')
    }

    const outputResourceIds = renderer.config.outputs.map((output) => output.resourceId)
    expect(outputResourceIds).toEqual(['quarter-color', 'quarter-position'])
  })

  it('keeps isosurface rendering on full-resolution MRT outputs', async () => {
    ensureGpuTextureUsageConstants()
    const { createObjectRenderer } = await import('@/rendering/webgpu/WebGPUScene')
    const renderer = createObjectRenderer(
      'schroedinger',
      createPassConfig({
        isosurface: true,
      })
    )

    if (!renderer) {
      throw new Error('Expected Schrödinger renderer to be created')
    }

    const outputResourceIds = renderer.config.outputs.map((output) => output.resourceId)
    expect(outputResourceIds).toEqual(['object-color', 'normal-buffer', 'depth-buffer'])
  })

  it('adds quarter-res resources and temporal cloud pass when temporal reprojection is enabled', async () => {
    ensureGpuTextureUsageConstants()
    const { setupRenderPasses } = await import('@/rendering/webgpu/WebGPUScene')
    const { graph, resources, passes } = createGraphHarness()

    await setupRenderPasses(graph as unknown as WebGPURenderGraph, createPassConfig())

    expect(resources.has('quarter-color')).toBe(true)
    expect(resources.has('quarter-position')).toBe(true)
    expect(passes.some((pass) => pass.id === 'temporal-cloud')).toBe(true)

    expect(resources.get('quarter-color')).toMatchObject({
      type: 'texture',
      size: { mode: 'fraction', fraction: 0.5 },
      format: 'rgba16float',
    })
    expect(resources.get('quarter-position')).toMatchObject({
      type: 'texture',
      size: { mode: 'fraction', fraction: 0.5 },
      format: 'rgba32float',
    })

    const objectColorUsage = resources.get('object-color')?.usage as number
    expect((objectColorUsage & GPUTextureUsage.COPY_SRC) !== 0).toBe(true)
  })

  it('does not add temporal resources when the feature is disabled', async () => {
    ensureGpuTextureUsageConstants()
    const { setupRenderPasses } = await import('@/rendering/webgpu/WebGPUScene')
    const { graph, resources, passes } = createGraphHarness()

    await setupRenderPasses(
      graph as unknown as WebGPURenderGraph,
      createPassConfig({ temporalReprojectionEnabled: false })
    )

    expect(resources.has('quarter-color')).toBe(false)
    expect(resources.has('quarter-position')).toBe(false)
    expect(passes.some((pass) => pass.id === 'temporal-cloud')).toBe(false)

    const objectColorUsage = resources.get('object-color')?.usage as number
    expect((objectColorUsage & GPUTextureUsage.COPY_SRC) !== 0).toBe(false)
  })
})
