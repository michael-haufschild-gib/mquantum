import { describe, expect, it, vi } from 'vitest'

import { WebGPUSchrodingerRenderer } from '@/rendering/webgpu/renderers/WebGPUSchrodingerRenderer'

function createMockCtx() {
  const passEncoder = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
    end: vi.fn(),
  }

  return {
    ctx: {
      device: {},
      frame: {
        stores: {
          appearance: { appearanceVersion: 0 },
          pbr: { pbrVersion: 0 },
          performance: { qualityMultiplier: 1 },
          extended: { schroedinger: {} },
          animation: { accumulatedTime: 0 },
          geometry: { dimension: 3 },
          rotation: { version: 0 },
          transform: { uniformScale: 1, position: [0, 0, 0] },
          camera: {
            position: { x: 0, y: 0, z: 5 },
            near: 0.1,
            far: 100,
            fov: 50,
          },
          lighting: { version: 0, lightCount: 0 },
        },
        frameNumber: 1,
        delta: 0.016,
        time: 0,
      },
      size: { width: 1280, height: 720 },
      getWriteTarget: vi.fn(() => ({})),
      beginRenderPass: vi.fn(() => passEncoder),
    },
    passEncoder,
  }
}

describe('WebGPUSchrodingerRenderer material dirty-checking', () => {
  type TestRenderer = {
    execute: (ctx: unknown) => void
    updateMaterialUniforms: ReturnType<typeof vi.fn>
    [key: string]: unknown
  }

  function createRenderer() {
    const renderer = new WebGPUSchrodingerRenderer({ isosurface: true }) as unknown as TestRenderer

    renderer.device = { queue: { writeBuffer: vi.fn() } }
    renderer.renderPipeline = {}
    renderer.vertexBuffer = {}
    renderer.indexBuffer = {}
    renderer.cameraBindGroup = {}
    renderer.lightingBindGroup = {}
    renderer.objectBindGroup = {}
    renderer.indexCount = 6
    renderer.lastDiagnosticLog = Date.now()

    renderer.updateCameraUniforms = vi.fn()
    renderer.updateBasisVectors = vi.fn()
    renderer.updateSchroedingerUniforms = vi.fn()
    renderer.updateLightingUniforms = vi.fn()
    renderer.updateQualityUniforms = vi.fn()
    renderer.updateMaterialUniforms = vi.fn()

    return renderer
  }

  it('updates material uniforms when pbrVersion changes even if appearanceVersion is unchanged', () => {
    const renderer = createRenderer()

    const { ctx } = createMockCtx()

    renderer.execute(ctx)
    expect(renderer.updateMaterialUniforms).toHaveBeenCalledTimes(1)

    ctx.frame.frameNumber = 2
    ctx.frame.stores.pbr.pbrVersion = 1

    renderer.execute(ctx)
    expect(renderer.updateMaterialUniforms).toHaveBeenCalledTimes(2)
  })

  it('does not re-upload material uniforms when appearanceVersion and pbrVersion are both unchanged', () => {
    const renderer = createRenderer()
    const { ctx } = createMockCtx()

    renderer.execute(ctx)
    expect(renderer.updateMaterialUniforms).toHaveBeenCalledTimes(1)

    ctx.frame.frameNumber = 2
    renderer.execute(ctx)
    expect(renderer.updateMaterialUniforms).toHaveBeenCalledTimes(1)
  })
})

describe('WebGPUSchrodingerRenderer color algorithm uniform consistency', () => {
  function prepareRendererForUniformWrites(
    renderer: WebGPUSchrodingerRenderer
  ): WebGPUSchrodingerRenderer & { [key: string]: unknown } {
    const mutable = renderer as WebGPUSchrodingerRenderer & { [key: string]: unknown }
    mutable.device = { queue: { writeBuffer: vi.fn() } }
    mutable.schroedingerUniformBuffer = {}
    mutable.createBoundingGeometry = vi.fn()
    return mutable
  }

  it('keeps compile-time diverging algorithm in uniforms even if appearance switches to k-space', () => {
    const renderer = prepareRendererForUniformWrites(
      new WebGPUSchrodingerRenderer({
        quantumMode: 'harmonicOscillator',
        colorAlgorithm: 9,
      })
    )
    const { ctx } = createMockCtx()
    ctx.frame.stores.appearance = { appearanceVersion: 1, colorAlgorithm: 'kSpaceOccupation' }
    ctx.frame.stores.extended = {
      schroedingerVersion: 1,
      schroedinger: { quantumMode: 'harmonicOscillator' },
    }

    renderer.updateSchroedingerUniforms(ctx as unknown as Parameters<WebGPUSchrodingerRenderer['updateSchroedingerUniforms']>[0])

    expect((renderer['schroedingerIntView'] as Int32Array)[940 / 4]).toBe(9)
  })

  it('keeps compile-time k-space algorithm in free scalar uniforms even if appearance is relative phase', () => {
    const renderer = prepareRendererForUniformWrites(
      new WebGPUSchrodingerRenderer({
        quantumMode: 'freeScalarField',
        colorAlgorithm: 15,
      })
    )
    const { ctx } = createMockCtx()
    ctx.frame.stores.appearance = { appearanceVersion: 1, colorAlgorithm: 'relativePhase' }
    ctx.frame.stores.extended = {
      schroedingerVersion: 1,
      schroedinger: { quantumMode: 'freeScalarField' },
    }

    renderer.updateSchroedingerUniforms(ctx as unknown as Parameters<WebGPUSchrodingerRenderer['updateSchroedingerUniforms']>[0])

    expect((renderer['schroedingerIntView'] as Int32Array)[940 / 4]).toBe(15)
  })
})

describe('WebGPUSchrodingerRenderer HO preset regeneration', () => {
  function prepareRendererForUniformWrites(
    renderer: WebGPUSchrodingerRenderer
  ): WebGPUSchrodingerRenderer & { [key: string]: unknown } {
    const mutable = renderer as WebGPUSchrodingerRenderer & { [key: string]: unknown }
    mutable.device = { queue: { writeBuffer: vi.fn() } }
    mutable.schroedingerUniformBuffer = {}
    mutable.createBoundingGeometry = vi.fn()
    return mutable
  }

  it('regenerates cached preset when frequencySpread changes by UI slider step (0.0001)', () => {
    const renderer = prepareRendererForUniformWrites(
      new WebGPUSchrodingerRenderer({ quantumMode: 'harmonicOscillator' })
    )
    const { ctx } = createMockCtx()

    ctx.frame.stores.extended = {
      schroedingerVersion: 1,
      schroedinger: {
        quantumMode: 'harmonicOscillator',
        presetName: 'custom',
        seed: 42,
        termCount: 3,
        maxQuantumNumber: 6,
        frequencySpread: 0.01,
      },
    }

    renderer.updateSchroedingerUniforms(
      ctx as unknown as Parameters<WebGPUSchrodingerRenderer['updateSchroedingerUniforms']>[0]
    )

    expect((renderer['cachedPresetConfig'] as { frequencySpread: number }).frequencySpread).toBeCloseTo(
      0.01,
      6
    )

    ctx.frame.stores.extended.schroedingerVersion = 2
    ctx.frame.stores.extended.schroedinger.frequencySpread = 0.0101

    renderer.updateSchroedingerUniforms(
      ctx as unknown as Parameters<WebGPUSchrodingerRenderer['updateSchroedingerUniforms']>[0]
    )

    expect((renderer['cachedPresetConfig'] as { frequencySpread: number }).frequencySpread).toBeCloseTo(
      0.0101,
      6
    )
  })
})
