import { describe, expect, it, vi } from 'vitest'

import { destroyGpuResources } from '@/rendering/webgpu/utils/gpuResourceHelpers'

/** Minimal mock that satisfies the GPUBuffer/GPUTexture `destroy()` contract. */
function mockResource(): { destroy: ReturnType<typeof vi.fn> } {
  return { destroy: vi.fn() }
}

describe('destroyGpuResources', () => {
  it('calls destroy on every provided resource', () => {
    const a = mockResource()
    const b = mockResource()
    const c = mockResource()
    destroyGpuResources(
      a as unknown as GPUBuffer,
      b as unknown as GPUBuffer,
      c as unknown as GPUBuffer
    )
    expect(a.destroy).toHaveBeenCalledOnce()
    expect(b.destroy).toHaveBeenCalledOnce()
    expect(c.destroy).toHaveBeenCalledOnce()
  })

  it('skips null and undefined entries without throwing', () => {
    const a = mockResource()
    expect(() => {
      destroyGpuResources(null, a as unknown as GPUBuffer, undefined, null)
    }).not.toThrow()
    expect(a.destroy).toHaveBeenCalledOnce()
  })

  it('handles mixed GPUBuffer and GPUTexture inputs', () => {
    const buffer = mockResource()
    const texture = mockResource()
    destroyGpuResources(
      buffer as unknown as GPUBuffer,
      null,
      texture as unknown as GPUTexture,
      undefined
    )
    expect(buffer.destroy).toHaveBeenCalledOnce()
    expect(texture.destroy).toHaveBeenCalledOnce()
  })

  it('handles empty arguments', () => {
    expect(() => destroyGpuResources()).not.toThrow()
  })

  it('calls destroy in argument order', () => {
    const order: string[] = []
    const a = { destroy: vi.fn(() => order.push('a')) }
    const b = { destroy: vi.fn(() => order.push('b')) }
    const c = { destroy: vi.fn(() => order.push('c')) }
    destroyGpuResources(
      a as unknown as GPUBuffer,
      b as unknown as GPUTexture,
      c as unknown as GPUBuffer
    )
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('continues destroying later resources when one destroy throws', () => {
    const order: string[] = []
    const a = {
      destroy: vi.fn(() => {
        order.push('a')
        throw new Error('destroy failed')
      }),
    }
    const b = { destroy: vi.fn(() => order.push('b')) }

    expect(() =>
      destroyGpuResources(a as unknown as GPUBuffer, b as unknown as GPUTexture)
    ).not.toThrow()
    expect(order).toEqual(['a', 'b'])
    expect(a.destroy).toHaveBeenCalledOnce()
    expect(b.destroy).toHaveBeenCalledOnce()
  })
})
