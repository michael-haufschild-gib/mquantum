import { describe, expect, it, vi } from 'vitest'

import { WebGPUTemporalCloudPass } from '@/rendering/webgpu/passes/WebGPUTemporalCloudPass'
import { temporalReconstructionShader } from '@/rendering/webgpu/shaders/temporal/reconstruction.wgsl'

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

  const makeCtx = (
    accumulatedTime: number,
    missingTextureIds: Set<string> = new Set(),
    size = { width: 64, height: 64 }
  ) => ({
    device,
    encoder,
    size,
    frame: {
      frameNumber: Math.round(accumulatedTime * 60),
      delta: 1 / 60,
      time: accumulatedTime,
      size,
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
      if (missingTextureIds.has(id)) return null
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

  return { pass, makeCtx, device, pipelines, renderFullscreen }
}

function readLastUploadedBayerOffset(device: {
  queue: { writeBuffer: ReturnType<typeof vi.fn> }
}): [number | undefined, number | undefined] {
  const latestUpload = device.queue.writeBuffer.mock.calls.at(-1)?.[2]
  expect(latestUpload).toBeInstanceOf(ArrayBuffer)
  const snapshot = new Float32Array((latestUpload as ArrayBuffer).slice(0))
  return [snapshot[32], snapshot[33]]
}

describe('WebGPUTemporalCloudPass', () => {
  it('clamps reconstruction full-resolution pixels to quarter-resolution bounds', () => {
    expect(temporalReconstructionShader).toContain(
      'let quarterCoord = clamp(fullCoord / 2, vec2i(0), quarterDims - vec2i(1));'
    )
  })

  it('packs the current Bayer phase before advancing state for the next frame', () => {
    const { pass, makeCtx, device } = makeHarness()

    pass.execute(makeCtx(0))
    expect(readLastUploadedBayerOffset(device)).toEqual([0, 0])

    pass.execute(makeCtx(1 / 60))
    expect(readLastUploadedBayerOffset(device)).toEqual([1, 1])
  })

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

  it('invalidates history when a frame is skipped because temporal inputs are missing', () => {
    const { pass, makeCtx, pipelines, renderFullscreen } = makeHarness()

    pass.execute(makeCtx(0))
    renderFullscreen.mockClear()

    pass.execute(makeCtx(0, new Set(['quarter-position'])))
    expect(renderFullscreen).not.toHaveBeenCalled()

    pass.execute(makeCtx(0))

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

  it('restarts Bayer cycling when resize invalidates temporal history', () => {
    const { pass, makeCtx, device } = makeHarness()

    pass.execute(makeCtx(0))
    pass.execute(makeCtx(0))
    pass.execute(makeCtx(0))
    pass.execute(makeCtx(0))
    expect(readLastUploadedBayerOffset(device)).toEqual([0, 1])

    pass.execute(makeCtx(0))
    expect(readLastUploadedBayerOffset(device)).toEqual([0, 0])

    pass.execute(makeCtx(0, new Set(), { width: 96, height: 64 }))
    expect(readLastUploadedBayerOffset(device)).toEqual([0, 0])

    pass.execute(makeCtx(0, new Set(), { width: 96, height: 64 }))
    expect(readLastUploadedBayerOffset(device)).toEqual([1, 1])
  })
})
