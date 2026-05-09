import { describe, expect, it, vi } from 'vitest'

import { WebGPUSkyboxRenderer } from '@/rendering/webgpu/renderers/WebGPUSkyboxRenderer'

type TestableSkyboxRenderer = {
  uniformBindGroupLayout: GPUBindGroupLayout | null
  textureBindGroupLayout: GPUBindGroupLayout | null
  uniformBuffer: GPUBuffer | null
  placeholderCubeTexture: GPUTexture | null
  placeholderCubeSampler: GPUSampler | null
  loadedCubeTexture: GPUTexture | null
  recreateBindGroups: (device: GPUDevice) => void
}

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
