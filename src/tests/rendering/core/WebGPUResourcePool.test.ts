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
