/**
 * WebGPU Device error path tests.
 *
 * Tests initialization failures, device loss handling, and recovery.
 * These complement the happy-path tests by exercising failure modes
 * that the mocked WebGPU context can simulate.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('WebGPUDevice initialization errors', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns failure when navigator.gpu is unavailable', async () => {
    const originalGpu = navigator.gpu
    const gpuDescriptor = Object.getOwnPropertyDescriptor(navigator, 'gpu')

    // Delete the property entirely so 'gpu' in navigator returns false
    delete (navigator as Partial<Navigator> & { gpu?: GPU }).gpu

    try {
      const { WebGPUDevice } = await import('@/rendering/webgpu/core/WebGPUDevice')
      const deviceMgr = WebGPUDevice.getInstance()
      const canvas = document.createElement('canvas')

      const result = await deviceMgr.initialize(canvas)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('not supported')
      }
    } finally {
      if (gpuDescriptor) {
        Object.defineProperty(navigator, 'gpu', gpuDescriptor)
      } else {
        Object.defineProperty(navigator, 'gpu', {
          writable: true,
          configurable: true,
          value: originalGpu,
        })
      }
    }
  })

  it('returns failure when adapter request returns null', async () => {
    const originalGpu = navigator.gpu
    const mockGpu = {
      ...originalGpu,
      requestAdapter: vi.fn().mockResolvedValue(null),
      getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
    }

    Object.defineProperty(navigator, 'gpu', {
      writable: true,
      configurable: true,
      value: mockGpu,
    })

    try {
      const { WebGPUDevice } = await import('@/rendering/webgpu/core/WebGPUDevice')
      const deviceMgr = WebGPUDevice.getInstance()
      const canvas = document.createElement('canvas')

      const result = await deviceMgr.initialize(canvas)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('adapter')
      }
    } finally {
      Object.defineProperty(navigator, 'gpu', {
        writable: true,
        configurable: true,
        value: originalGpu,
      })
    }
  })

  it('returns failure when device request throws', async () => {
    const originalGpu = navigator.gpu
    const mockAdapter = {
      features: new Set(),
      limits: {
        maxStorageBufferBindingSize: 128 * 1024 * 1024,
        maxUniformBufferBindingSize: 65536,
        maxComputeWorkgroupSizeX: 256,
        maxComputeWorkgroupSizeY: 256,
        maxComputeWorkgroupSizeZ: 64,
        maxComputeInvocationsPerWorkgroup: 256,
        maxBindGroups: 4,
        maxTextureDimension2D: 8192,
      },
      info: { vendor: 'Test', architecture: '', device: '', description: '' },
      requestDevice: vi.fn().mockRejectedValue(new Error('Device creation failed')),
    }

    const mockGpu = {
      requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
      getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
      wgslLanguageFeatures: new Set(),
    }

    Object.defineProperty(navigator, 'gpu', {
      writable: true,
      configurable: true,
      value: mockGpu,
    })

    try {
      const { WebGPUDevice } = await import('@/rendering/webgpu/core/WebGPUDevice')
      const deviceMgr = WebGPUDevice.getInstance()
      const canvas = document.createElement('canvas')

      const result = await deviceMgr.initialize(canvas)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Device creation failed')
      }
    } finally {
      Object.defineProperty(navigator, 'gpu', {
        writable: true,
        configurable: true,
        value: originalGpu,
      })
    }
  })
})

describe('WebGPUDevice device loss', () => {
  it('notifies registered callbacks on device loss', async () => {
    vi.resetModules()

    const { WebGPUDevice } = await import('@/rendering/webgpu/core/WebGPUDevice')
    const deviceMgr = WebGPUDevice.getInstance()

    const callback = vi.fn()
    deviceMgr.onDeviceLost(callback)

    // Trigger device lost through internal method
    const internals = deviceMgr as unknown as { handleDeviceLost: (reason: string) => void }
    if (typeof internals.handleDeviceLost === 'function') {
      internals.handleDeviceLost('destroyed')
      expect(callback).toHaveBeenCalledWith('destroyed')
    }
  })

  it('unregisters device loss callback on cleanup', async () => {
    vi.resetModules()

    const { WebGPUDevice } = await import('@/rendering/webgpu/core/WebGPUDevice')
    const deviceMgr = WebGPUDevice.getInstance()

    const callback = vi.fn()
    const unsubscribe = deviceMgr.onDeviceLost(callback)
    unsubscribe()

    const internals = deviceMgr as unknown as { handleDeviceLost: (reason: string) => void }
    if (typeof internals.handleDeviceLost === 'function') {
      internals.handleDeviceLost('destroyed')
      expect(callback).not.toHaveBeenCalled()
    }
  })
})
