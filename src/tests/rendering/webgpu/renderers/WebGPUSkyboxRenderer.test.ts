import { describe, expect, it, vi } from 'vitest'

import {
  SKYBOX_VERTEX_UNIFORMS_BIND_SIZE,
  SKYBOX_VERTEX_UNIFORMS_LAYOUT,
  SKYBOX_VERTEX_UNIFORMS_OFFSET,
} from '@/rendering/webgpu/renderers/skyboxLayout'
import { WebGPUSkyboxRenderer } from '@/rendering/webgpu/renderers/WebGPUSkyboxRenderer'

type TestableSkyboxRenderer = {
  device: GPUDevice | null
  uniformBindGroupLayout: GPUBindGroupLayout | null
  textureBindGroupLayout: GPUBindGroupLayout | null
  uniformBuffer: GPUBuffer | null
  placeholderCubeTexture: GPUTexture | null
  placeholderCubeSampler: GPUSampler | null
  loadedCubeTexture: GPUTexture | null
  recreateBindGroups: (device: GPUDevice) => void
  updateVertexUniforms: (ctx: unknown) => void
}

const VERTEX_SLOT = SKYBOX_VERTEX_UNIFORMS_LAYOUT.index

function textureReturning(view: GPUTextureView): GPUTexture {
  return {
    createView: vi.fn(() => view),
  } as unknown as GPUTexture
}

function bindGroupDevice() {
  const createBindGroup = vi.fn((descriptor: GPUBindGroupDescriptor) => {
    return { descriptor } as unknown as GPUBindGroup
  })

  return {
    device: { createBindGroup } as unknown as GPUDevice,
    createBindGroup,
  }
}

function seededRenderer(
  placeholderTexture: GPUTexture,
  loadedTexture: GPUTexture | null
): TestableSkyboxRenderer {
  const renderer = new WebGPUSkyboxRenderer() as unknown as TestableSkyboxRenderer
  renderer.uniformBindGroupLayout = {} as GPUBindGroupLayout
  renderer.textureBindGroupLayout = {} as GPUBindGroupLayout
  renderer.uniformBuffer = {} as GPUBuffer
  renderer.placeholderCubeTexture = placeholderTexture
  renderer.placeholderCubeSampler = {} as GPUSampler
  renderer.loadedCubeTexture = loadedTexture
  return renderer
}

function textureBindGroupDescriptor(createBindGroup: ReturnType<typeof vi.fn>) {
  const call = createBindGroup.mock.calls.find(([descriptor]) => {
    return (descriptor as GPUBindGroupDescriptor).label === 'skybox-texture-bg'
  })

  return call?.[0] as GPUBindGroupDescriptor | undefined
}

describe('WebGPUSkyboxRenderer bind group recreation', () => {
  it('preserves a loaded classic cubemap across pipeline recreation', () => {
    const placeholderView = { label: 'placeholder-view' } as unknown as GPUTextureView
    const loadedView = { label: 'loaded-view' } as unknown as GPUTextureView
    const placeholderTexture = textureReturning(placeholderView)
    const loadedTexture = textureReturning(loadedView)
    const renderer = seededRenderer(placeholderTexture, loadedTexture)
    const { device, createBindGroup } = bindGroupDevice()

    renderer.recreateBindGroups(device)

    const descriptor = textureBindGroupDescriptor(createBindGroup)
    const entries = descriptor?.entries as GPUBindGroupEntry[] | undefined
    expect(entries?.[0]?.resource).toBe(loadedView)
    expect(loadedTexture.createView).toHaveBeenCalledWith({ dimension: 'cube' })
    expect(placeholderTexture.createView).not.toHaveBeenCalled()
  })

  it('falls back to placeholder texture before a classic cubemap loads', () => {
    const placeholderView = { label: 'placeholder-view' } as unknown as GPUTextureView
    const placeholderTexture = textureReturning(placeholderView)
    const renderer = seededRenderer(placeholderTexture, null)
    const { device, createBindGroup } = bindGroupDevice()

    renderer.recreateBindGroups(device)

    const descriptor = textureBindGroupDescriptor(createBindGroup)
    const entries = descriptor?.entries as GPUBindGroupEntry[] | undefined
    expect(entries?.[0]?.resource).toBe(placeholderView)
    expect(placeholderTexture.createView).toHaveBeenCalledWith({ dimension: 'cube' })
  })
})

describe('WebGPUSkyboxRenderer vertex uniform safety', () => {
  it('writes finite fallback matrices when camera and rotation state are corrupt', () => {
    let capturedOffset = -1
    let capturedData: number[] = []
    const writeBuffer = vi.fn((_buffer: GPUBuffer, offset: number, data: Float32Array) => {
      capturedOffset = offset
      capturedData = Array.from(data)
    })
    const renderer = new WebGPUSkyboxRenderer() as unknown as TestableSkyboxRenderer
    renderer.device = { queue: { writeBuffer } } as unknown as GPUDevice
    renderer.uniformBuffer = {} as GPUBuffer

    renderer.updateVertexUniforms({
      frame: {
        stores: {
          environment: { skyboxRotation: Number.NaN },
          camera: {
            viewMatrix: {
              elements: [1, 0, 0, 0, 0, Number.NaN, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1],
            },
            projectionMatrix: { elements: [1, 0, 0] },
          },
        },
      },
    })

    expect(capturedOffset).toBe(SKYBOX_VERTEX_UNIFORMS_OFFSET)
    expect(capturedData.length).toBe(SKYBOX_VERTEX_UNIFORMS_BIND_SIZE / 4)
    expect(capturedData.every(Number.isFinite)).toBe(true)
    expect(capturedData[VERTEX_SLOT.modelViewMatrix + 0]).toBe(1)
    expect(capturedData[VERTEX_SLOT.modelViewMatrix + 5]).toBe(1)
    expect(capturedData[VERTEX_SLOT.modelViewMatrix + 10]).toBe(1)
    expect(capturedData[VERTEX_SLOT.modelViewMatrix + 15]).toBe(1)
    expect(capturedData[VERTEX_SLOT.projectionMatrix + 0]).toBe(1)
    expect(capturedData[VERTEX_SLOT.projectionMatrix + 5]).toBe(1)
    expect(capturedData[VERTEX_SLOT.projectionMatrix + 10]).toBe(1)
    expect(capturedData[VERTEX_SLOT.projectionMatrix + 15]).toBe(1)
  })
})
