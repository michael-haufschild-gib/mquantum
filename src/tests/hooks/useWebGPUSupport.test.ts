/**
 * useWebGPUSupport Hook Tests
 *
 * Tests for the WebGPU support detection hook.
 *
 * @module tests/hooks/useWebGPUSupport.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useWebGPUSupport } from '@/hooks/useWebGPUSupport'
import { useRendererStore } from '@/stores/rendererStore'

interface MockAdapterOptions {
  vendor?: string
  architecture?: string
  device?: string
  description?: string
  adapterFallbackFlag?: boolean
  infoFallbackFlag?: boolean
}

function createMockAdapter({
  vendor = 'Mock Vendor',
  architecture = 'Mock Architecture',
  device = 'Mock Device',
  description = 'Mock WebGPU Adapter',
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
    features: new Set() as GPUSupportedFeatures,
    limits: {} as GPUSupportedLimits,
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

      expect(result.current.capabilities).not.toBeNull()
      expect(result.current.capabilities?.supported).toBe(true)
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
      expect(state.webgpuCapabilities).not.toBeNull()
      expect(state.webgpuStatus).toBe('supported')
    })
  })
})
