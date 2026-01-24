/**
 * Tests for MRTStateManager.
 *
 * Verifies automatic MRT (Multiple Render Target) state management
 * through renderer patching.
 */

import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getAttachmentCount, isMRTTarget, MRTStateManager } from '@/rendering/graph/MRTStateManager'

describe('MRTStateManager', () => {
  let mockGlContext: WebGL2RenderingContext
  let mockRenderer: THREE.WebGLRenderer
  let originalSetRenderTarget: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGlContext = {
      BACK: 0x0405, // gl.BACK constant for default framebuffer
      COLOR_ATTACHMENT0: 0x8ce0,
      COLOR_ATTACHMENT1: 0x8ce1,
      COLOR_ATTACHMENT2: 0x8ce2,
      COLOR_ATTACHMENT3: 0x8ce3,
      drawBuffers: vi.fn(),
      getExtension: vi.fn(() => null),
    } as unknown as WebGL2RenderingContext

    originalSetRenderTarget = vi.fn()

    mockRenderer = {
      getContext: vi.fn(() => mockGlContext),
      setRenderTarget: originalSetRenderTarget,
      render: vi.fn(),
      getRenderTarget: vi.fn(() => null),
    } as unknown as THREE.WebGLRenderer
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initialization', () => {
    it('should patch renderer.setRenderTarget on initialize', () => {
      const manager = new MRTStateManager()
      const originalFn = mockRenderer.setRenderTarget

      manager.initialize(mockRenderer)

      // setRenderTarget should be replaced
      expect(mockRenderer.setRenderTarget).not.toBe(originalFn)
      expect(manager.isInitialized()).toBe(true)
    })

    it('should only initialize once for same renderer', () => {
      const manager = new MRTStateManager()

      manager.initialize(mockRenderer)
      const patchedFn = mockRenderer.setRenderTarget

      manager.initialize(mockRenderer)

      // Should remain the same patched function
      expect(mockRenderer.setRenderTarget).toBe(patchedFn)
    })

    it('should restore original on dispose', () => {
      const manager = new MRTStateManager()
      manager.initialize(mockRenderer)

      manager.dispose()

      // After dispose, setRenderTarget should be restored (bound to renderer)
      // Use type assertion since we know the underlying mock
      expect(manager.isInitialized()).toBe(false)
      // Verify the original mock is called when invoking the restored function
      mockRenderer.setRenderTarget(null)
      expect(originalSetRenderTarget).toHaveBeenCalled()
    })
  })

  describe('automatic drawBuffers configuration', () => {
    it('should configure single attachment for null target (screen)', () => {
      const manager = new MRTStateManager()
      manager.initialize(mockRenderer)

      mockRenderer.setRenderTarget(null)

      expect(originalSetRenderTarget).toHaveBeenCalledWith(null, undefined, undefined)
      // Default framebuffer (screen) uses gl.BACK, not COLOR_ATTACHMENT0
      expect(mockGlContext.drawBuffers).toHaveBeenCalledWith([mockGlContext.BACK])
    })

    it('should configure single attachment for simple target', () => {
      const manager = new MRTStateManager()
      manager.initialize(mockRenderer)
      const target = new THREE.WebGLRenderTarget(100, 100)

      mockRenderer.setRenderTarget(target)

      expect(mockGlContext.drawBuffers).toHaveBeenCalledWith([mockGlContext.COLOR_ATTACHMENT0])
    })

    it('should configure 2 attachments for 2-MRT target', () => {
      const manager = new MRTStateManager()
      manager.initialize(mockRenderer)
      const target = new THREE.WebGLRenderTarget(100, 100, { count: 2 })
      target.textures = [new THREE.Texture(), new THREE.Texture()]

      mockRenderer.setRenderTarget(target)

      expect(mockGlContext.drawBuffers).toHaveBeenCalledWith([
        mockGlContext.COLOR_ATTACHMENT0,
        mockGlContext.COLOR_ATTACHMENT1,
      ])
    })

    it('should configure 3 attachments for 3-MRT target', () => {
      const manager = new MRTStateManager()
      manager.initialize(mockRenderer)
      const target = new THREE.WebGLRenderTarget(100, 100, { count: 3 })
      target.textures = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()]

      mockRenderer.setRenderTarget(target)

      expect(mockGlContext.drawBuffers).toHaveBeenCalledWith([
        mockGlContext.COLOR_ATTACHMENT0,
        mockGlContext.COLOR_ATTACHMENT1,
        mockGlContext.COLOR_ATTACHMENT2,
      ])
    })

    it('should cache state and skip redundant drawBuffers calls', () => {
      const manager = new MRTStateManager()
      manager.initialize(mockRenderer)
      const target = new THREE.WebGLRenderTarget(100, 100)

      mockRenderer.setRenderTarget(target)
      mockRenderer.setRenderTarget(target)
      mockRenderer.setRenderTarget(target)

      // Only called once due to caching (count stays same)
      expect(mockGlContext.drawBuffers).toHaveBeenCalledTimes(1)
    })

    it('should update when switching between different attachment counts', () => {
      const manager = new MRTStateManager()
      manager.initialize(mockRenderer)

      const target1 = new THREE.WebGLRenderTarget(100, 100)
      const target3 = new THREE.WebGLRenderTarget(100, 100, { count: 3 })
      target3.textures = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()]

      mockRenderer.setRenderTarget(target1)
      mockRenderer.setRenderTarget(target3)
      mockRenderer.setRenderTarget(target1)

      expect(mockGlContext.drawBuffers).toHaveBeenCalledTimes(3)
    })
  })

  describe('context loss handling', () => {
    it('should reset state on invalidateForContextLoss', () => {
      const manager = new MRTStateManager()
      manager.initialize(mockRenderer)
      const target = new THREE.WebGLRenderTarget(100, 100)

      mockRenderer.setRenderTarget(target)
      expect(mockGlContext.drawBuffers).toHaveBeenCalledTimes(1)

      manager.invalidateForContextLoss()

      // After context loss, gl is null, so drawBuffers won't be called
      // The state is reset internally (currentAttachmentCount = -1, gl = null)
      // To verify reset, reinitialize with new context and check that
      // drawBuffers is called again even for same attachment count

      // Create new mock for restored context
      const newMockGl = {
        BACK: 0x0405,
        COLOR_ATTACHMENT0: 0x8ce0,
        COLOR_ATTACHMENT1: 0x8ce1,
        drawBuffers: vi.fn(),
        getExtension: vi.fn(() => null),
      } as unknown as WebGL2RenderingContext

      const newMockRenderer = {
        getContext: vi.fn(() => newMockGl),
        setRenderTarget: vi.fn(),
        render: vi.fn(),
        getRenderTarget: vi.fn(() => null),
      } as unknown as THREE.WebGLRenderer

      manager.reinitialize(newMockRenderer)

      // Now set same target - should call drawBuffers since state was reset
      newMockRenderer.setRenderTarget(target)
      expect(newMockGl.drawBuffers).toHaveBeenCalledTimes(1)
    })

    it('should reinitialize after context restore', () => {
      const manager = new MRTStateManager()
      manager.initialize(mockRenderer)
      manager.invalidateForContextLoss()

      // Create new mock for restored context
      const newMockGl = {
        BACK: 0x0405,
        COLOR_ATTACHMENT0: 0x8ce0,
        COLOR_ATTACHMENT1: 0x8ce1,
        drawBuffers: vi.fn(),
        getExtension: vi.fn(() => null),
      } as unknown as WebGL2RenderingContext

      const newMockRenderer = {
        getContext: vi.fn(() => newMockGl),
        setRenderTarget: vi.fn(),
        render: vi.fn(),
        getRenderTarget: vi.fn(() => null),
      } as unknown as THREE.WebGLRenderer

      manager.reinitialize(newMockRenderer)

      expect(manager.isInitialized()).toBe(true)
    })

    it('should force sync on invalidateState', () => {
      const manager = new MRTStateManager()
      manager.initialize(mockRenderer)
      const target = new THREE.WebGLRenderTarget(100, 100)

      mockRenderer.setRenderTarget(target)
      expect(mockGlContext.drawBuffers).toHaveBeenCalledTimes(1)

      manager.invalidateState()

      // Next call should reconfigure even for same count
      mockRenderer.setRenderTarget(target)
      expect(mockGlContext.drawBuffers).toHaveBeenCalledTimes(2)
    })
  })
})

describe('isMRTTarget', () => {
  it('should return false for null target', () => {
    expect(isMRTTarget(null)).toBe(false)
  })

  it('should return false for single-attachment target', () => {
    const target = new THREE.WebGLRenderTarget(100, 100)
    expect(isMRTTarget(target)).toBe(false)
  })

  it('should return true for MRT target with 2+ textures', () => {
    const target = new THREE.WebGLRenderTarget(100, 100, { count: 3 })
    target.textures = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()]
    expect(isMRTTarget(target)).toBe(true)
  })

  it('should return false for target with empty textures array', () => {
    const target = new THREE.WebGLRenderTarget(100, 100)
    target.textures = []
    expect(isMRTTarget(target)).toBe(false)
  })
})

describe('getAttachmentCount', () => {
  it('should return 1 for null target (screen)', () => {
    expect(getAttachmentCount(null)).toBe(1)
  })

  it('should return 1 for single-attachment target', () => {
    const target = new THREE.WebGLRenderTarget(100, 100)
    expect(getAttachmentCount(target)).toBe(1)
  })

  it('should return correct count for MRT targets', () => {
    const target2 = new THREE.WebGLRenderTarget(100, 100, { count: 2 })
    target2.textures = [new THREE.Texture(), new THREE.Texture()]
    expect(getAttachmentCount(target2)).toBe(2)

    const target3 = new THREE.WebGLRenderTarget(100, 100, { count: 3 })
    target3.textures = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()]
    expect(getAttachmentCount(target3)).toBe(3)
  })
})
