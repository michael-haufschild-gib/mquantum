/**
 * Tests for TBDR framebuffer invalidation optimization.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ResourcePool } from '@/rendering/graph/ResourcePool'

describe('ResourcePool.invalidateFramebuffers', () => {
  let pool: ResourcePool

  beforeEach(() => {
    pool = new ResourcePool()
    pool.updateSize(1920, 1080)
  })

  it('should invalidate non-persistent resources', () => {
    pool.register({
      id: 'intermediate',
      type: 'renderTarget',
      size: { mode: 'screen' },
    })

    // Allocate the resource
    const target = pool.get('intermediate')

    // Mock WebGL context
    const invalidateFramebuffer = vi.fn()
    const bindFramebuffer = vi.fn()
    const mockGl = {
      invalidateFramebuffer,
      bindFramebuffer,
      FRAMEBUFFER: 0x8D40,
      COLOR_ATTACHMENT0: 0x8CE0,
      DEPTH_ATTACHMENT: 0x8D00,
    }

    // Mock renderer with properties WeakMap
    const mockFramebuffer = { id: 1 }
    const propertiesMap = new WeakMap()
    propertiesMap.set(target!, { __webglFramebuffer: mockFramebuffer })

    const mockRenderer = {
      getContext: () => mockGl,
      properties: { get: (obj: object) => propertiesMap.get(obj) },
    }

    pool.invalidateFramebuffers(mockRenderer as any, new Set())

    expect(bindFramebuffer).toHaveBeenCalledWith(mockGl.FRAMEBUFFER, mockFramebuffer)
    expect(invalidateFramebuffer).toHaveBeenCalledWith(mockGl.FRAMEBUFFER, [mockGl.COLOR_ATTACHMENT0])
  })

  it('should skip ping-pong resources', () => {
    pool.register({
      id: 'temporal',
      type: 'renderTarget',
      size: { mode: 'screen' },
    })
    pool.get('temporal')

    const invalidateFramebuffer = vi.fn()
    const mockGl = {
      invalidateFramebuffer,
      bindFramebuffer: vi.fn(),
      FRAMEBUFFER: 0x8D40,
      COLOR_ATTACHMENT0: 0x8CE0,
    }

    const mockRenderer = {
      getContext: () => mockGl,
      properties: { get: () => ({ __webglFramebuffer: {} }) },
    }

    // Mark 'temporal' as ping-pong
    pool.invalidateFramebuffers(mockRenderer as any, new Set(['temporal']))

    expect(invalidateFramebuffer).not.toHaveBeenCalled()
  })

  it('should skip persistent resources', () => {
    pool.register({
      id: 'history',
      type: 'renderTarget',
      size: { mode: 'screen' },
      persistent: true,
    })
    pool.get('history')

    const invalidateFramebuffer = vi.fn()
    const mockGl = {
      invalidateFramebuffer,
      bindFramebuffer: vi.fn(),
      FRAMEBUFFER: 0x8D40,
      COLOR_ATTACHMENT0: 0x8CE0,
    }

    const mockRenderer = {
      getContext: () => mockGl,
      properties: { get: () => ({ __webglFramebuffer: {} }) },
    }

    pool.invalidateFramebuffers(mockRenderer as any, new Set())

    expect(invalidateFramebuffer).not.toHaveBeenCalled()
  })

  it('should invalidate depth attachment when depthBuffer is enabled', () => {
    pool.register({
      id: 'withDepth',
      type: 'renderTarget',
      size: { mode: 'screen' },
      depthBuffer: true,
    })
    pool.get('withDepth')

    const invalidateFramebuffer = vi.fn()
    const mockGl = {
      invalidateFramebuffer,
      bindFramebuffer: vi.fn(),
      FRAMEBUFFER: 0x8D40,
      COLOR_ATTACHMENT0: 0x8CE0,
      DEPTH_ATTACHMENT: 0x8D00,
    }

    const mockRenderer = {
      getContext: () => mockGl,
      properties: { get: () => ({ __webglFramebuffer: {} }) },
    }

    pool.invalidateFramebuffers(mockRenderer as any, new Set())

    // Should have called invalidateFramebuffer twice: color + depth
    expect(invalidateFramebuffer).toHaveBeenCalledTimes(2)
    expect(invalidateFramebuffer).toHaveBeenCalledWith(mockGl.FRAMEBUFFER, [mockGl.COLOR_ATTACHMENT0])
    expect(invalidateFramebuffer).toHaveBeenCalledWith(mockGl.FRAMEBUFFER, [mockGl.DEPTH_ATTACHMENT])
  })

  it('should invalidate all MRT color attachments', () => {
    pool.register({
      id: 'mrt3',
      type: 'mrt',
      size: { mode: 'screen' },
      attachmentCount: 3,
    })
    pool.get('mrt3')

    const invalidateFramebuffer = vi.fn()
    const COLOR_ATTACHMENT0 = 0x8CE0
    const mockGl = {
      invalidateFramebuffer,
      bindFramebuffer: vi.fn(),
      FRAMEBUFFER: 0x8D40,
      COLOR_ATTACHMENT0,
    }

    const mockRenderer = {
      getContext: () => mockGl,
      properties: { get: () => ({ __webglFramebuffer: {} }) },
    }

    pool.invalidateFramebuffers(mockRenderer as any, new Set())

    // Should invalidate all 3 color attachments
    expect(invalidateFramebuffer).toHaveBeenCalledWith(
      mockGl.FRAMEBUFFER,
      [COLOR_ATTACHMENT0, COLOR_ATTACHMENT0 + 1, COLOR_ATTACHMENT0 + 2]
    )
  })

  it('should handle WebGL1 gracefully (no invalidateFramebuffer)', () => {
    pool.register({
      id: 'test',
      type: 'renderTarget',
      size: { mode: 'screen' },
    })
    pool.get('test')

    // WebGL1 context without invalidateFramebuffer
    const mockGl = {
      invalidateFramebuffer: undefined,
      bindFramebuffer: vi.fn(),
    }

    const mockRenderer = {
      getContext: () => mockGl,
      properties: { get: () => ({ __webglFramebuffer: {} }) },
    }

    // Should not throw
    expect(() => {
      pool.invalidateFramebuffers(mockRenderer as any, new Set())
    }).not.toThrow()
  })

  it('should restore null framebuffer binding after invalidation', () => {
    pool.register({
      id: 'test',
      type: 'renderTarget',
      size: { mode: 'screen' },
    })
    pool.get('test')

    const bindFramebuffer = vi.fn()
    const mockGl = {
      invalidateFramebuffer: vi.fn(),
      bindFramebuffer,
      FRAMEBUFFER: 0x8D40,
      COLOR_ATTACHMENT0: 0x8CE0,
    }

    const mockRenderer = {
      getContext: () => mockGl,
      properties: { get: () => ({ __webglFramebuffer: {} }) },
    }

    pool.invalidateFramebuffers(mockRenderer as any, new Set())

    // Last call should restore null binding
    const lastCall = bindFramebuffer.mock.calls[bindFramebuffer.mock.calls.length - 1]
    expect(lastCall).toEqual([mockGl.FRAMEBUFFER, null])
  })
})
