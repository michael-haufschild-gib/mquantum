/**
 * Tests for WebGPUResourcePool — GPU resource lifecycle management.
 *
 * Uses the mock GPUDevice from the test setup to verify allocation,
 * resize, ping-pong swapping, and disposal without a real GPU.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { WebGPURenderResourceConfig } from '@/rendering/webgpu/core/types'
import { WebGPUResourcePool } from '@/rendering/webgpu/core/WebGPUResourcePool'
import { mockWebGPU } from '@/tests/__mocks__/webgpu'

function descriptorDepthOrArrayLayers(size: GPUTextureDescriptor['size']): number {
  if (typeof size === 'number') return 1
  if (Array.isArray(size)) return size[2] ?? 1
  if (Symbol.iterator in Object(size)) {
    return [...(size as Iterable<number>)][2] ?? 1
  }
  return (size as { depthOrArrayLayers?: number }).depthOrArrayLayers ?? 1
}

describe('WebGPUResourcePool', () => {
  let pool: WebGPUResourcePool
  let device: GPUDevice

  beforeEach(() => {
    pool = new WebGPUResourcePool()
    device = mockWebGPU.device
    pool.initialize(device)
    pool.setSize(800, 600)
  })

  const screenConfig: Omit<WebGPURenderResourceConfig, 'id'> = {
    type: 'renderTarget',
    size: { mode: 'screen' },
    format: 'rgba16float',
  }

  it('allocates a resource on first getResource call', () => {
    pool.addResource({ id: 'test', ...screenConfig })
    const resource = pool.getResource('test')

    expect(resource).not.toBe(null)
    expect(resource!.width).toBe(800)
    expect(resource!.height).toBe(600)
  })

  it('returns same resource on repeated getResource calls', () => {
    pool.addResource({ id: 'test', ...screenConfig })
    const r1 = pool.getResource('test')
    const r2 = pool.getResource('test')
    expect(r1).toBe(r2)
  })

  it('reallocates an allocated resource when its allocation config changes', () => {
    pool.addResource({ id: 'test', ...screenConfig })
    const first = pool.getResource('test')
    const destroySpy = first!.texture.destroy

    pool.addResource({
      id: 'test',
      type: 'texture',
      size: { mode: 'fixed', width: 64, height: 32 },
      format: 'r8unorm',
    })
    const second = pool.getResource('test')

    expect(destroySpy).toHaveBeenCalled()
    expect(second).not.toBe(first)
    expect(second!.config.format).toBe('r8unorm')
    expect(second!.width).toBe(64)
    expect(second!.height).toBe(32)
  })

  it('does not reallocate when the same allocation config is re-added', () => {
    pool.addResource({ id: 'test', ...screenConfig })
    pool.getResource('test')
    const callsBefore = (device.createTexture as ReturnType<typeof import('vitest').vi.fn>).mock
      .calls.length

    pool.addResource({ id: 'test', ...screenConfig, persistent: true })

    const callsAfter = (device.createTexture as ReturnType<typeof import('vitest').vi.fn>).mock
      .calls.length
    expect(callsAfter).toBe(callsBefore)
  })

  it('returns null for unknown resource IDs', () => {
    expect(pool.getResource('nonexistent')).toBe(null)
    expect(pool.getTexture('nonexistent')).toBe(null)
    expect(pool.getTextureView('nonexistent')).toBe(null)
    expect(pool.getSampler('nonexistent')).toBe(null)
  })

  it('reallocates resources when size changes', () => {
    pool.addResource({ id: 'test', ...screenConfig })
    pool.getResource('test') // allocate

    pool.setSize(1920, 1080)
    const resource = pool.getResource('test')

    expect(resource!.width).toBe(1920)
    expect(resource!.height).toBe(1080)
  })

  it('sanitizes invalid viewport dimensions before allocating screen resources', () => {
    pool.setSize(Number.NaN, Number.POSITIVE_INFINITY)
    pool.addResource({ id: 'screen', ...screenConfig })

    const resource = pool.getResource('screen')

    expect(resource!.width).toBe(1)
    expect(resource!.height).toBe(1)
  })

  it('does not reallocate fixed-size resources on viewport resize', () => {
    pool.addResource({
      id: 'fixed',
      type: 'texture',
      size: { mode: 'fixed', width: 256, height: 256 },
    })
    pool.getResource('fixed') // allocate

    pool.setSize(1920, 1080)
    const resource = pool.getResource('fixed')

    expect(resource!.width).toBe(256)
    expect(resource!.height).toBe(256)
  })

  it('allocates fraction-sized resources correctly', () => {
    pool.addResource({
      id: 'half',
      type: 'renderTarget',
      size: { mode: 'fraction', fraction: 0.5 },
    })
    const resource = pool.getResource('half')

    expect(resource!.width).toBe(400)
    expect(resource!.height).toBe(300)
  })

  it('rounds fraction-sized resources up so odd viewports keep edge coverage', () => {
    pool.setSize(801, 601)
    pool.addResource({
      id: 'half-odd',
      type: 'renderTarget',
      size: { mode: 'fraction', fraction: 0.5 },
    })
    const resource = pool.getResource('half-odd')

    expect(resource!.width).toBe(401)
    expect(resource!.height).toBe(301)
  })

  it('sanitizes invalid fixed resource dimensions before texture allocation', () => {
    pool.addResource({
      id: 'invalid-fixed',
      type: 'texture',
      size: { mode: 'fixed', width: Number.NaN, height: -4 },
    })

    const resource = pool.getResource('invalid-fixed')

    expect(resource!.width).toBe(1)
    expect(resource!.height).toBe(1)
  })

  it('falls back to full screen size for invalid fraction resource scales', () => {
    pool.addResource({
      id: 'invalid-fraction',
      type: 'renderTarget',
      size: { mode: 'fraction', fraction: Number.POSITIVE_INFINITY },
    })

    const resource = pool.getResource('invalid-fraction')

    expect(resource!.width).toBe(800)
    expect(resource!.height).toBe(600)
  })

  it('sanitizes invalid texture allocation counts before createTexture', () => {
    pool.addResource({
      id: 'invalid-counts',
      type: 'texture',
      size: { mode: 'fixed', width: 8, height: 8 },
      sampleCount: 2,
      mipLevelCount: Number.NaN,
      arrayLayerCount: -6,
    })

    pool.getResource('invalid-counts')

    const createTexture = device.createTexture as ReturnType<typeof import('vitest').vi.fn>
    const descriptor = createTexture.mock.calls.at(-1)?.[0] as GPUTextureDescriptor
    expect(descriptor.sampleCount).toBe(1)
    expect(descriptor.mipLevelCount).toBe(1)
    expect(descriptorDepthOrArrayLayers(descriptor.size)).toBe(1)
  })

  it('allocates cubemap resources with six array layers by default', () => {
    pool.addResource({
      id: 'default-cubemap',
      type: 'cubemap',
      size: { mode: 'fixed', width: 16, height: 16 },
      format: 'rgba8unorm',
    })

    pool.getResource('default-cubemap')

    const createTexture = device.createTexture as ReturnType<typeof import('vitest').vi.fn>
    const descriptor = createTexture.mock.calls.at(-1)?.[0] as GPUTextureDescriptor
    expect(descriptorDepthOrArrayLayers(descriptor.size)).toBe(6)
    expect(pool.getVRAMUsage()).toBe(16 * 16 * 4 * 6)
  })

  it('adds storage binding usage for storageTexture resources by default', () => {
    pool.addResource({
      id: 'storage',
      type: 'storageTexture',
      size: { mode: 'fixed', width: 8, height: 8 },
    })

    pool.getResource('storage')

    const createTexture = device.createTexture as ReturnType<typeof import('vitest').vi.fn>
    const descriptor = createTexture.mock.calls.at(-1)?.[0] as GPUTextureDescriptor
    expect(descriptor.usage & GPUTextureUsage.STORAGE_BINDING).toBe(GPUTextureUsage.STORAGE_BINDING)
    expect(descriptor.usage & GPUTextureUsage.TEXTURE_BINDING).toBe(GPUTextureUsage.TEXTURE_BINDING)
  })

  it('enables and manages ping-pong resources', () => {
    pool.addResource({ id: 'pp', ...screenConfig })
    pool.enablePingPong('pp')

    const readView = pool.getReadTextureView('pp')
    const writeView = pool.getWriteTextureView('pp')

    // Read and write views should be different objects
    expect(readView).not.toBe(writeView)

    // After swap, they should exchange
    pool.swapPingPong('pp')
    const readView2 = pool.getReadTextureView('pp')
    expect(readView2).toBe(writeView)
  })

  it('returns the current ping-pong read resource from generic resource access', () => {
    pool.addResource({ id: 'pp', ...screenConfig })
    pool.enablePingPong('pp')

    const createTexture = device.createTexture as ReturnType<typeof import('vitest').vi.fn>
    const callsAfterEnable = createTexture.mock.calls.length
    const readBefore = pool.getReadTextureView('pp')
    const resourceBefore = pool.getResource('pp')
    const textureBefore = pool.getTexture('pp')
    const viewBefore = pool.getTextureView('pp')
    const callsAfterGenericAccess = createTexture.mock.calls.length

    expect(resourceBefore?.view).toBe(readBefore)
    expect(textureBefore).toBe(resourceBefore?.texture)
    expect(viewBefore).toBe(readBefore)
    expect(callsAfterGenericAccess).toBe(callsAfterEnable)

    pool.swapPingPong('pp')

    const readAfter = pool.getReadTextureView('pp')
    const resourceAfter = pool.getResource('pp')
    expect(resourceAfter?.view).toBe(readAfter)
    expect(resourceAfter).not.toBe(resourceBefore)
  })

  it('reports VRAM usage > 0 after allocation', () => {
    pool.addResource({ id: 'test', ...screenConfig })
    pool.getResource('test')

    const vram = pool.getVRAMUsage()
    expect(vram).toBeGreaterThan(0)
  })

  it('caches VRAM calculation (no recomputation without changes)', () => {
    pool.addResource({ id: 'test', ...screenConfig })
    pool.getResource('test')

    const v1 = pool.getVRAMUsage()
    const v2 = pool.getVRAMUsage()
    expect(v1).toBe(v2)
  })

  it('counts array layers, mip levels, and sample count in VRAM usage', () => {
    pool.addResource({
      id: 'cubemap',
      type: 'cubemap',
      size: { mode: 'fixed', width: 64, height: 32 },
      format: 'r8unorm',
      arrayLayerCount: 6,
      mipLevelCount: 3,
    })
    pool.addResource({
      id: 'msaa',
      type: 'renderTarget',
      size: { mode: 'fixed', width: 10, height: 10 },
      format: 'rgba8unorm',
      sampleCount: 4,
    })
    pool.getResource('cubemap')
    pool.getResource('msaa')

    const cubemapBytes = (64 * 32 + 32 * 16 + 16 * 8) * 6
    const msaaBytes = 10 * 10 * 4 * 4
    expect(pool.getVRAMUsage()).toBe(cubemapBytes + msaaBytes)
  })

  it('removes resources and frees GPU memory', () => {
    pool.addResource({ id: 'test', ...screenConfig })
    const resource = pool.getResource('test')
    const destroySpy = resource!.texture.destroy

    pool.removeResource('test')
    expect(destroySpy).toHaveBeenCalled()
    expect(pool.getResource('test')).toBe(null)
  })

  it('getAllResourceDimensions returns correct map', () => {
    pool.addResource({ id: 'a', ...screenConfig })
    pool.addResource({
      id: 'b',
      type: 'texture',
      size: { mode: 'fixed', width: 128, height: 128 },
    })
    pool.getResource('a')
    pool.getResource('b')

    const dims = pool.getAllResourceDimensions()
    expect(dims.get('a')).toEqual({ width: 800, height: 600 })
    expect(dims.get('b')).toEqual({ width: 128, height: 128 })
  })

  it('dispose clears all resources', () => {
    pool.addResource({ id: 'a', ...screenConfig })
    pool.addResource({ id: 'b', ...screenConfig })
    pool.getResource('a')
    pool.getResource('b')

    pool.dispose()

    expect(pool.getResource('a')).toBe(null)
    expect(pool.getResource('b')).toBe(null)
  })

  it('resizes ping-pong buffers when viewport changes', () => {
    pool.addResource({ id: 'pp', ...screenConfig })
    pool.enablePingPong('pp')

    // Verify initial dimensions via read/write views
    const readViewBefore = pool.getReadTextureView('pp')
    expect(readViewBefore).not.toBe(null)

    // Resize viewport — should reallocate both ping-pong buffers
    pool.setSize(1920, 1080)

    // After resize, views should be fresh (different objects)
    const readViewAfter = pool.getReadTextureView('pp')
    expect(readViewAfter).not.toBe(readViewBefore)

    // Verify dimensions are correct via getAllResourceDimensions
    const dims = pool.getAllResourceDimensions()
    expect(dims.get('pp')).toEqual({ width: 1920, height: 1080 })
  })

  it('reallocates ping-pong buffers when their allocation config changes', () => {
    pool.addResource({ id: 'pp', ...screenConfig })
    pool.enablePingPong('pp')
    const readViewBefore = pool.getReadTextureView('pp')

    pool.addResource({
      id: 'pp',
      type: 'renderTarget',
      size: { mode: 'fixed', width: 96, height: 48 },
      format: 'rgba8unorm',
    })

    const readViewAfter = pool.getReadTextureView('pp')
    expect(readViewAfter).not.toBe(readViewBefore)
    expect(pool.getAllResourceDimensions().get('pp')).toEqual({ width: 96, height: 48 })
  })

  it('removeResource cleans up ping-pong buffers', () => {
    pool.addResource({ id: 'pp', ...screenConfig })
    pool.enablePingPong('pp')

    const readView = pool.getReadTextureView('pp')
    expect(readView).not.toBe(null)

    pool.removeResource('pp')

    expect(pool.getReadTextureView('pp')).toBe(null)
    expect(pool.getWriteTextureView('pp')).toBe(null)
    expect(pool.getResource('pp')).toBe(null)
  })

  it('setSize is a no-op when dimensions are unchanged', () => {
    pool.addResource({ id: 'test', ...screenConfig })
    pool.getResource('test')

    // Same size — should not reallocate
    const callsBefore = (device.createTexture as ReturnType<typeof import('vitest').vi.fn>).mock
      .calls.length
    pool.setSize(800, 600)
    const callsAfter = (device.createTexture as ReturnType<typeof import('vitest').vi.fn>).mock
      .calls.length
    expect(callsAfter).toBe(callsBefore)
  })
})
