import { describe, expect, it, vi } from 'vitest'

import { WebGPUTemporalCloudPass } from '@/rendering/webgpu/passes/WebGPUTemporalCloudPass'

const IDENTITY_4X4 = {
  elements: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
}

function makeTexture(label: string) {
  return {
    label,
    createView: vi.fn(() => ({ label: `${label}-view` })),
    destroy: vi.fn(),
  }
}

function makeHarness() {
  const pass = new WebGPUTemporalCloudPass({
    quarterColorInput: 'quarter-color',
    quarterPositionInput: 'quarter-position',
    outputResource: 'object-color',
  }) as unknown as {
    device: unknown
    pipelines: unknown
    execute: (ctx: unknown) => void
    renderFullscreen: ReturnType<typeof vi.fn>
  }

  const device = {
    createTexture: vi.fn(({ label }: { label: string }) => makeTexture(label)),
    createBindGroup: vi.fn(() => ({ label: 'bind-group' })),
    queue: { writeBuffer: vi.fn() },
  }
  const encoder = { copyTextureToTexture: vi.fn() }
  const renderPass = {
    end: vi.fn(),
  }
  const quarterColorView = { label: 'quarter-color-view' }
  const quarterPositionView = { label: 'quarter-position-view' }
  const outputView = { label: 'object-color-view' }
  const outputTexture = { label: 'object-color-texture' }
  const pipelines = {
    reprojectionPipeline: { label: 'reprojection-pipeline' },
    reconstructionPipeline: { label: 'reconstruction-pipeline' },
    reprojectionBGL0: {},
    reprojectionBGL1: {},
    reconstructionBGL0: {},
    reconstructionBGL1: {},
    temporalUniformBuffer: {},
    linearSampler: {},
    nearestSampler: {},
  }
  const renderFullscreen = vi.fn()

  pass.device = device
  pass.pipelines = pipelines
  pass.renderFullscreen = renderFullscreen

  const makeCtx = (accumulatedTime: number) => ({
    device,
    encoder,
    size: { width: 64, height: 64 },
    frame: {
      frameNumber: Math.round(accumulatedTime * 60),
      delta: 1 / 60,
      time: accumulatedTime,
      size: { width: 64, height: 64 },
      stores: {
        animation: { accumulatedTime },
        camera: {
          viewProjectionMatrix: IDENTITY_4X4,
          position: { x: 0, y: 0, z: 4 },
        },
      },
    },
    getTexture: vi.fn(() => null),
    getTextureView: vi.fn((id: string) => {
      if (id === 'quarter-color') return quarterColorView
      if (id === 'quarter-position') return quarterPositionView
      return null
    }),
    getWriteTarget: vi.fn((id: string) => (id === 'object-color' ? outputView : null)),
    getReadTextureView: vi.fn(() => null),
    getSampler: vi.fn(() => null),
    getResource: vi.fn((id: string) =>
      id === 'object-color' ? { texture: outputTexture, view: outputView } : null
    ),
    beginRenderPass: vi.fn(() => renderPass),
    beginComputePass: vi.fn(() => null),
    getCanvasTextureView: vi.fn(() => outputView),
  })

  return { pass, makeCtx, pipelines, renderFullscreen }
}

describe('WebGPUTemporalCloudPass', () => {
  it('invalidates history before reprojection when animation time advances', () => {
    const { pass, makeCtx, pipelines, renderFullscreen } = makeHarness()

    pass.execute(makeCtx(0))
    expect(renderFullscreen).toHaveBeenCalledTimes(1)
    expect(renderFullscreen).toHaveBeenCalledWith(
      expect.anything(),
      pipelines.reconstructionPipeline,
      expect.any(Array)
    )

    renderFullscreen.mockClear()
    pass.execute(makeCtx(1 / 60))

    expect(renderFullscreen).toHaveBeenCalledTimes(1)
    expect(renderFullscreen).toHaveBeenCalledWith(
      expect.anything(),
      pipelines.reconstructionPipeline,
      expect.any(Array)
    )
    expect(renderFullscreen).not.toHaveBeenCalledWith(
      expect.anything(),
      pipelines.reprojectionPipeline,
      expect.any(Array)
    )
  })
})
