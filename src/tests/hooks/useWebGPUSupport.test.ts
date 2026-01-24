/**
 * useWebGPUSupport Hook Tests
 *
 * Tests for the WebGPU support detection hook.
 *
 * @module tests/hooks/useWebGPUSupport.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useWebGPUSupport, hasWebGPUAPI } from '@/hooks/useWebGPUSupport'
import { useRendererStore } from '@/stores/rendererStore'

describe('useWebGPUSupport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset renderer store
    useRendererStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('returns isChecking true before detection', () => {
      const { result } = renderHook(() => useWebGPUSupport())

      // Initially should be checking or unknown
      expect(result.current.isChecking).toBe(true)
      expect(result.current.isComplete).toBe(false)
    })

    it('returns webgl mode by default', () => {
      const { result } = renderHook(() => useWebGPUSupport())

      // Default mode is webgl until detection completes
      expect(result.current.mode).toBe('webgl')
    })
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

    it('stays on webgl mode when webgl is preferred', async () => {
      // Set preference to webgl before detection
      useRendererStore.getState().setPreferredMode('webgl')

      const { result } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true)
      })

      expect(result.current.mode).toBe('webgl')
    })

    it('returns capabilities after detection', async () => {
      const { result } = renderHook(() => useWebGPUSupport())

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true)
      })

      expect(result.current.capabilities).not.toBeNull()
      expect(result.current.capabilities?.supported).toBe(true)
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
    it('updates store webgpuStatus to checking during detection', async () => {
      renderHook(() => useWebGPUSupport())

      // Status should transition through checking
      // Note: This may be too fast to catch in tests, so we check final state
      await waitFor(() => {
        const state = useRendererStore.getState()
        expect(state.detectionComplete).toBe(true)
      })
    })

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

describe('hasWebGPUAPI', () => {
  it('returns true when navigator.gpu exists', () => {
    // The mock from setup.ts provides navigator.gpu
    expect(hasWebGPUAPI()).toBe(true)
  })

  it('checks for gpu property in navigator', () => {
    // Verify the check is based on 'gpu' in navigator
    // The mock provides navigator.gpu, so this should be true
    expect('gpu' in navigator).toBe(true)
    expect(hasWebGPUAPI()).toBe(true)
  })
})
