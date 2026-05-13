/**
 * useWebGPUSupport Hook Tests
 *
 * Tests for the WebGPU support detection hook.
 *
 * @module tests/hooks/useWebGPUSupport.test
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useWebGPUSupport } from '@/hooks/useWebGPUSupport'
import { useRendererStore } from '@/stores/runtime/rendererStore'

interface MockAdapterOptions {
  vendor?: string
  architecture?: string
  device?: string
  description?: string
  features?: GPUFeatureName[]
  limits?: Partial<Record<keyof GPUSupportedLimits, number>>
  adapterFallbackFlag?: boolean
  infoFallbackFlag?: boolean
}

function createMockAdapter({
  vendor = 'Mock Vendor',
  architecture = 'Mock Architecture',
  device = 'Mock Device',
  description = 'Mock WebGPU Adapter',
  features = [],
  limits = {},
  adapterFallbackFlag,
  infoFallbackFlag,
}: MockAdapterOptions = {}): GPUAdapter {
  const info: GPUAdapterInfo & { isFallbackAdapter?: boolean } = {
    vendor,
    architecture,
    device,
    description,
  } as GPUAdapterInfo & { isFallbackAdapter?: boolean }

  if (typeof infoFallbackFlag === 'boolean') {
    info.isFallbackAdapter = infoFallbackFlag
  }

  const adapter = {
    features: new Set(features) as GPUSupportedFeatures,
    limits: limits as unknown as GPUSupportedLimits,
    info,
    requestDevice: vi.fn().mockResolvedValue({
      destroy: vi.fn(),
    } as unknown as GPUDevice),
  } as unknown as GPUAdapter & { isFallbackAdapter?: boolean }

  if (typeof adapterFallbackFlag === 'boolean') {
    adapter.isFallbackAdapter = adapterFallbackFlag
  }

  return adapter as GPUAdapter
}

describe('useWebGPUSupport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset renderer store
    useRendererStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('WebGPU detection', () => {
    it('reports not_in_browser when navigator.gpu exists but is undefined', async () => {
      const originalGpu = navigator.gpu
      Object.defineProperty(navigator, 'gpu', {
        writable: true,
        configurable: true,
        value: undefined,
      })

      try {
        const { result } = renderHook(() => useWebGPUSupport())

        await waitFor(() => {
          expect(result.current.isComplete).toBe(true)
        })

        expect(result.current.isSupported).toBe(false)
        expect(result.current.capabilities?.unavailableReason).toBe('not_in_browser')
      } finally {
        Object.defineProperty(navigator, 'gpu', {
          writable: true,
          configurable: true,
          value: originalGpu,
        })
      }
    })

    it('detects WebGPU support when navigator.gpu exists', async () => {
      // The mock from setup.ts provides navigator.gpu
      const { result } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true)
      })

      expect(result.current.isChecking).toBe(false)
      expect(result.current.isSupported).toBe(true)
    })

    it('switches to webgpu mode when supported and preferred', async () => {
      // Default preference is webgpu
      const { result } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true)
      })

      expect(result.current.mode).toBe('webgpu')
    })

    it('returns capabilities after detection', async () => {
      const { result } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true)
      })

      expect(result.current.capabilities?.supported).toBe(true)
    })

    it('probes WebGPU support with the production device descriptor', async () => {
      const adapter = createMockAdapter({
        features: ['timestamp-query', 'texture-compression-bc'],
        limits: {
          maxStorageBufferBindingSize: 134217728,
          maxUniformBufferBindingSize: 65536,
          maxComputeWorkgroupSizeX: 256,
          maxComputeWorkgroupSizeY: 256,
          maxComputeWorkgroupSizeZ: 64,
          maxComputeInvocationsPerWorkgroup: 256,
          maxComputeWorkgroupStorageSize: 16384,
          maxBindGroups: 4,
          maxTextureDimension2D: 8192,
        },
      })
      vi.mocked(navigator.gpu.requestAdapter).mockResolvedValueOnce(adapter)

      const { result } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true)
      })

      expect(adapter.requestDevice).toHaveBeenCalledWith({
        requiredFeatures: ['timestamp-query', 'texture-compression-bc'],
        requiredLimits: {
          maxStorageBufferBindingSize: 134217728,
          maxUniformBufferBindingSize: 65536,
          maxComputeWorkgroupSizeX: 256,
          maxComputeWorkgroupSizeY: 256,
          maxComputeWorkgroupSizeZ: 64,
          maxComputeInvocationsPerWorkgroup: 256,
          maxComputeWorkgroupStorageSize: 16384,
          maxBindGroups: 4,
          maxTextureDimension2D: 8192,
        },
      })
    })

    it('uses explicit adapter fallback flag when available', async () => {
      vi.mocked(navigator.gpu.requestAdapter).mockResolvedValueOnce(
        createMockAdapter({ adapterFallbackFlag: false })
      )
      const { result } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true)
      })

      expect(result.current.capabilities?.adapterMode).toBe('hardware')
      expect(result.current.capabilities?.isFallbackAdapter).toBe(false)
      expect(result.current.capabilities?.adapterModeEstimated).toBe(false)
    })

    it('uses explicit adapter.info.isFallbackAdapter when adapter-level flag is missing', async () => {
      vi.mocked(navigator.gpu.requestAdapter).mockResolvedValueOnce(
        createMockAdapter({ infoFallbackFlag: true })
      )
      const { result } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true)
      })

      expect(result.current.capabilities?.adapterMode).toBe('software')
      expect(result.current.capabilities?.isFallbackAdapter).toBe(true)
      expect(result.current.capabilities?.adapterModeEstimated).toBe(false)
    })

    it('falls back to heuristic estimation when no explicit fallback flag is exposed', async () => {
      vi.mocked(navigator.gpu.requestAdapter).mockResolvedValueOnce(
        createMockAdapter({
          vendor: 'Google Inc.',
          architecture: 'SwiftShader Device (Subzero)',
          description: 'SwiftShader Device',
        })
      )
      const { result } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true)
      })

      expect(result.current.capabilities?.adapterMode).toBe('software')
      expect(result.current.capabilities?.isFallbackAdapter).toBeUndefined()
      expect(result.current.capabilities?.adapterModeEstimated).toBe(true)
    })
  })

  describe('detection runs only once', () => {
    it('does not re-run detection on rerender', async () => {
      const { result, rerender } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true)
      })

      // Rerender
      rerender()

      // Should still be complete without re-running
      expect(result.current.isComplete).toBe(true)
      expect(result.current.isChecking).toBe(false)
    })

    it('does not re-run detection when already complete', async () => {
      // First hook call
      const { result: result1 } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result1.current.isComplete).toBe(true)
      })

      // Second hook call (different component)
      const { result: result2 } = renderHook(() => useWebGPUSupport())

      // Should immediately be complete without checking
      expect(result2.current.isComplete).toBe(true)
      expect(result2.current.isChecking).toBe(false)
    })
  })

  describe('store integration', () => {
    it('updates store with detection results', async () => {
      renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(useRendererStore.getState().detectionComplete).toBe(true)
      })

      const state = useRendererStore.getState()
      expect(state.webgpuStatus).toBe('supported')
      expect(state.webgpuCapabilities?.supported).toBe(true)
    })
  })
})
