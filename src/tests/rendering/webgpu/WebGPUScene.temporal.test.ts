import { describe, expect, it, vi } from 'vitest'
import type { WebGPURenderPass } from '@/rendering/webgpu/core/types'
import type { WebGPURenderGraph } from '@/rendering/webgpu/graph/WebGPURenderGraph'
import { parseHexColorToLinearRgb } from '@/rendering/webgpu/utils/color'
import { ScenePass } from '@/rendering/webgpu/passes/ScenePass'

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
    colorAlgorithm: 'radialDistance',
    skyboxEnabled: false,
    skyboxMode: 'classic',
    backgroundColor: '#232323',
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
  it('maps domainColoringPsi to compile-time colorAlgorithm=8', async () => {
    ensureGpuTextureUsageConstants()
    const { createObjectRenderer } = await import('@/rendering/webgpu/WebGPUScene')
    const renderer = createObjectRenderer(
      'schroedinger',
      createPassConfig({
        colorAlgorithm: 'domainColoringPsi',
      })
    ) as unknown as { rendererConfig?: { colorAlgorithm?: number } } | null

    if (!renderer) {
      throw new Error('Expected Schrödinger renderer to be created')
    }

    expect(renderer.rendererConfig?.colorAlgorithm).toBe(8)
  })

  it('maps diverging to compile-time colorAlgorithm=9', async () => {
    ensureGpuTextureUsageConstants()
    const { createObjectRenderer } = await import('@/rendering/webgpu/WebGPUScene')
    const renderer = createObjectRenderer(
      'schroedinger',
      createPassConfig({
        colorAlgorithm: 'diverging',
      })
    ) as unknown as { rendererConfig?: { colorAlgorithm?: number } } | null

    if (!renderer) {
      throw new Error('Expected Schrödinger renderer to be created')
    }

    expect(renderer.rendererConfig?.colorAlgorithm).toBe(9)
  })

  it('maps relativePhase to compile-time colorAlgorithm=10', async () => {
    ensureGpuTextureUsageConstants()
    const { createObjectRenderer } = await import('@/rendering/webgpu/WebGPUScene')
    const renderer = createObjectRenderer(
      'schroedinger',
      createPassConfig({
        colorAlgorithm: 'relativePhase',
      })
    ) as unknown as { rendererConfig?: { colorAlgorithm?: number } } | null

    if (!renderer) {
      throw new Error('Expected Schrödinger renderer to be created')
    }

    expect(renderer.rendererConfig?.colorAlgorithm).toBe(10)
  })

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

  it('uses quarter-res temporal outputs for isosurface + temporal mode', async () => {
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

    // Isosurface + temporal uses quarter-res temporal outputs (temporal takes priority)
    const outputResourceIds = renderer.config.outputs.map((output) => output.resourceId)
    expect(outputResourceIds).toEqual(['quarter-color', 'quarter-position'])
  })

  it('uses full-resolution MRT outputs for isosurface without temporal', async () => {
    ensureGpuTextureUsageConstants()
    const { createObjectRenderer } = await import('@/rendering/webgpu/WebGPUScene')
    const renderer = createObjectRenderer(
      'schroedinger',
      createPassConfig({
        isosurface: true,
        temporalReprojectionEnabled: false,
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

    // object-color always includes COPY_SRC to avoid resource recreation on temporal toggle
    const objectColorUsage = resources.get('object-color')?.usage as number
    expect((objectColorUsage & GPUTextureUsage.COPY_SRC) !== 0).toBe(true)
  })

  it('uses configured background color for no-skybox scene clear pass', async () => {
    ensureGpuTextureUsageConstants()
    const { setupRenderPasses } = await import('@/rendering/webgpu/WebGPUScene')
    const { graph, passes } = createGraphHarness()
    const backgroundColor = '#4080ff'

    await setupRenderPasses(
      graph as unknown as WebGPURenderGraph,
      createPassConfig({
        skyboxEnabled: false,
        backgroundColor,
      })
    )

    const scenePass = passes.find((pass) => pass.id === 'scene') as
      | ({ getClearColor?: () => { r: number; g: number; b: number; a: number } } & WebGPURenderPass)
      | undefined
    expect(scenePass).toBeDefined()
    expect(typeof scenePass?.getClearColor).toBe('function')

    const clearColor = scenePass?.getClearColor?.()
    const expected = parseHexColorToLinearRgb(backgroundColor, [0, 0, 0])

    expect(clearColor).toMatchObject({
      r: expected[0],
      g: expected[1],
      b: expected[2],
      a: 1,
    })
  })
})

describe('WebGPUScene background color runtime updates', () => {
  it('updates scene pass clear color without requiring pass rebuild', async () => {
    const sceneModule = (await import('@/rendering/webgpu/WebGPUScene')) as unknown as Record<
      string,
      unknown
    >

    expect(typeof sceneModule['updateScenePassBackgroundColor']).toBe('function')

    const updateScenePassBackgroundColor = sceneModule['updateScenePassBackgroundColor'] as (args: {
      graph: Pick<WebGPURenderGraph, 'getPass'>
      skyboxEnabled: boolean
      backgroundColor: string
    }) => void

    const scenePass = new ScenePass({
      outputResource: 'scene-render',
      mode: 'clear',
      clearColor: { r: 0, g: 0, b: 0, a: 1 },
    })

    const graph = {
      getPass: vi.fn((id: string) => (id === 'scene' ? scenePass : undefined)),
    } as unknown as Pick<WebGPURenderGraph, 'getPass'>

    const backgroundColor = '#4080ff'
    updateScenePassBackgroundColor({
      graph,
      skyboxEnabled: false,
      backgroundColor,
    })

    const expected = parseHexColorToLinearRgb(backgroundColor, [0, 0, 0])
    expect(scenePass.getClearColor()).toEqual({
      r: expected[0],
      g: expected[1],
      b: expected[2],
      a: 1,
    })
    expect(graph.getPass).toHaveBeenCalledWith('scene')
  })

  it('does not update scene pass clear color when skybox is enabled', async () => {
    const sceneModule = (await import('@/rendering/webgpu/WebGPUScene')) as unknown as Record<
      string,
      unknown
    >

    expect(typeof sceneModule['updateScenePassBackgroundColor']).toBe('function')

    const updateScenePassBackgroundColor = sceneModule['updateScenePassBackgroundColor'] as (args: {
      graph: Pick<WebGPURenderGraph, 'getPass'>
      skyboxEnabled: boolean
      backgroundColor: string
    }) => void

    const scenePass = new ScenePass({
      outputResource: 'scene-render',
      mode: 'clear',
      clearColor: { r: 0.25, g: 0.25, b: 0.25, a: 1 },
    })
    const initial = scenePass.getClearColor()
    const graph = {
      getPass: vi.fn(() => scenePass),
    } as unknown as Pick<WebGPURenderGraph, 'getPass'>

    updateScenePassBackgroundColor({
      graph,
      skyboxEnabled: true,
      backgroundColor: '#ff0000',
    })

    expect(scenePass.getClearColor()).toEqual(initial)
    expect(graph.getPass).not.toHaveBeenCalled()
  })
})
