import { describe, expect, it, vi } from 'vitest'

import { BindGroupCache } from '@/rendering/webgpu/core/BindGroupCache'

describe('BindGroupCache', () => {
  function mockBindGroup(label: string): GPUBindGroup {
    return { label } as unknown as GPUBindGroup
  }

  it('calls create on first access', () => {
    const cache = new BindGroupCache()
    const create = vi.fn(() => mockBindGroup('bg1'))
    const viewA = {} as GPUTextureView

    const result = cache.get([viewA], create)

    expect(create).toHaveBeenCalledTimes(1)
    expect(result).toBe(create.mock.results[0]!.value)
  })

  it('returns cached bind group when keys are stable', () => {
    const cache = new BindGroupCache()
    const viewA = {} as GPUTextureView
    const bg = mockBindGroup('stable')
    const create = vi.fn(() => bg)

    cache.get([viewA], create)
    const second = cache.get([viewA], create)

    expect(create).toHaveBeenCalledTimes(1)
    expect(second).toBe(bg)
  })

  it('recreates when a key reference changes', () => {
    const cache = new BindGroupCache()
    const viewA = {} as GPUTextureView
    const viewB = {} as GPUTextureView
    const create = vi.fn(() => mockBindGroup('new'))

    cache.get([viewA], create)
    cache.get([viewB], create)

    expect(create).toHaveBeenCalledTimes(2)
  })

  it('recreates when key array length changes', () => {
    const cache = new BindGroupCache()
    const viewA = {} as GPUTextureView
    const viewB = {} as GPUTextureView
    const create = vi.fn(() => mockBindGroup('new'))

    cache.get([viewA], create)
    cache.get([viewA, viewB], create)

    expect(create).toHaveBeenCalledTimes(2)
  })

  it('tracks multiple keys independently', () => {
    const cache = new BindGroupCache()
    const viewA = {} as GPUTextureView
    const viewB = {} as GPUTextureView
    const create = vi.fn(() => mockBindGroup('multi'))

    cache.get([viewA, viewB], create)
    // Same keys → cache hit
    cache.get([viewA, viewB], create)
    expect(create).toHaveBeenCalledTimes(1)

    // Second key changed → cache miss
    const viewC = {} as GPUTextureView
    cache.get([viewA, viewC], create)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('invalidate forces recreation on next get', () => {
    const cache = new BindGroupCache()
    const viewA = {} as GPUTextureView
    const create = vi.fn(() => mockBindGroup('inv'))

    cache.get([viewA], create)
    cache.invalidate()
    cache.get([viewA], create)

    expect(create).toHaveBeenCalledTimes(2)
  })

  it('empty keys creates once and always hits cache', () => {
    const cache = new BindGroupCache()
    const create = vi.fn(() => mockBindGroup('once'))

    cache.get([], create)
    cache.get([], create)
    cache.get([], create)

    expect(create).toHaveBeenCalledTimes(1)
  })
})
