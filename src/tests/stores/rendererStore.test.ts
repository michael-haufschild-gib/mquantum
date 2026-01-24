/**
 * Tests for rendererStore - WebGL/WebGPU mode management
 *
 * @module tests/stores/rendererStore.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRendererStore } from '@/stores/rendererStore'
import type { WebGPUCapabilityInfo } from '@/stores/rendererStore'

describe('rendererStore', () => {
  beforeEach(() => {
    // Clear localStorage mock before each test
    localStorage.clear()
    // Reset store to initial state
    useRendererStore.getState().reset()
  })

  describe('initial state', () => {
    it('starts with webgl mode before detection', () => {
      const state = useRendererStore.getState()
      expect(state.mode).toBe('webgl')
    })

    it('starts with webgpu as preferred mode by default', () => {
      const state = useRendererStore.getState()
      expect(state.preferredMode).toBe('webgpu')
    })

    it('has unknown webgpuStatus initially', () => {
      const state = useRendererStore.getState()
      expect(state.webgpuStatus).toBe('unknown')
    })

    it('has no capabilities initially', () => {
      const state = useRendererStore.getState()
      expect(state.webgpuCapabilities).toBeNull()
    })

    it('has detection not complete initially', () => {
      const state = useRendererStore.getState()
      expect(state.detectionComplete).toBe(false)
    })

    it('does not show fallback notification initially', () => {
      const state = useRendererStore.getState()
      expect(state.showFallbackNotification).toBe(false)
    })
  })

  describe('setPreferredMode', () => {
    it('persists webgl preference to localStorage', () => {
      useRendererStore.getState().setPreferredMode('webgl')
      expect(localStorage.getItem('mdim_preferred_renderer')).toBe('webgl')
    })

    it('persists webgpu preference to localStorage', () => {
      useRendererStore.getState().setPreferredMode('webgpu')
      expect(localStorage.getItem('mdim_preferred_renderer')).toBe('webgpu')
    })

    it('switches mode to webgl when webgl is preferred', () => {
      useRendererStore.getState().setPreferredMode('webgl')
      expect(useRendererStore.getState().mode).toBe('webgl')
    })

    it('shows fallback when webgpu preferred but not supported', () => {
      // First complete detection with WebGPU unsupported
      useRendererStore.getState().completeDetection({
        supported: false,
        unavailableReason: 'no_adapter',
      })

      // Then try to set preferred mode to webgpu
      useRendererStore.getState().setPreferredMode('webgpu')

      const state = useRendererStore.getState()
      expect(state.preferredMode).toBe('webgpu')
      expect(state.mode).toBe('webgl') // Falls back
      expect(state.showFallbackNotification).toBe(true)
    })

    it('switches to webgpu when supported and preferred', () => {
      // First complete detection with WebGPU supported
      useRendererStore.getState().completeDetection({
        supported: true,
        vendor: 'Test',
      })

      // Then set preferred mode to webgpu
      useRendererStore.getState().setPreferredMode('webgpu')

      const state = useRendererStore.getState()
      expect(state.preferredMode).toBe('webgpu')
      expect(state.mode).toBe('webgpu')
    })
  })

  describe('setWebGPUStatus', () => {
    it('updates webgpuStatus to checking', () => {
      useRendererStore.getState().setWebGPUStatus('checking')
      expect(useRendererStore.getState().webgpuStatus).toBe('checking')
    })

    it('updates webgpuStatus to supported', () => {
      useRendererStore.getState().setWebGPUStatus('supported')
      expect(useRendererStore.getState().webgpuStatus).toBe('supported')
    })

    it('updates webgpuStatus to unsupported', () => {
      useRendererStore.getState().setWebGPUStatus('unsupported')
      expect(useRendererStore.getState().webgpuStatus).toBe('unsupported')
    })
  })

  describe('completeDetection', () => {
    it('marks detection as complete', () => {
      useRendererStore.getState().completeDetection({
        supported: true,
        vendor: 'Test',
      })
      expect(useRendererStore.getState().detectionComplete).toBe(true)
    })

    it('sets capabilities from detection result', () => {
      const caps: WebGPUCapabilityInfo = {
        supported: true,
        vendor: 'Mock Vendor',
        architecture: 'Mock Arch',
        device: 'Mock Device',
      }
      useRendererStore.getState().completeDetection(caps)

      const state = useRendererStore.getState()
      expect(state.webgpuCapabilities).toEqual(caps)
    })

    it('switches to webgpu when supported and preferred', () => {
      // Default preferred mode is webgpu
      useRendererStore.getState().completeDetection({
        supported: true,
      })

      expect(useRendererStore.getState().mode).toBe('webgpu')
      expect(useRendererStore.getState().webgpuStatus).toBe('supported')
    })

    it('stays on webgl when webgpu not supported but preferred', () => {
      useRendererStore.getState().completeDetection({
        supported: false,
        unavailableReason: 'not_in_browser',
      })

      const state = useRendererStore.getState()
      expect(state.mode).toBe('webgl')
      expect(state.webgpuStatus).toBe('unsupported')
      expect(state.showFallbackNotification).toBe(true)
    })

    it('stays on webgl when user prefers webgl', () => {
      useRendererStore.getState().setPreferredMode('webgl')
      useRendererStore.getState().completeDetection({
        supported: true,
      })

      expect(useRendererStore.getState().mode).toBe('webgl')
      expect(useRendererStore.getState().showFallbackNotification).toBe(false)
    })
  })

  describe('handleDeviceLost', () => {
    it('switches to webgl mode', () => {
      // Start with webgpu mode
      useRendererStore.getState().completeDetection({ supported: true })
      expect(useRendererStore.getState().mode).toBe('webgpu')

      // Simulate device lost
      useRendererStore.getState().handleDeviceLost('GPU device removed')

      expect(useRendererStore.getState().mode).toBe('webgl')
    })

    it('marks webgpu as unsupported', () => {
      useRendererStore.getState().handleDeviceLost('Test reason')

      const state = useRendererStore.getState()
      expect(state.webgpuStatus).toBe('unsupported')
      expect(state.webgpuCapabilities?.unavailableReason).toBe('device_lost')
    })

    it('shows fallback notification', () => {
      useRendererStore.getState().handleDeviceLost('Test reason')
      expect(useRendererStore.getState().showFallbackNotification).toBe(true)
    })
  })

  describe('dismissFallbackNotification', () => {
    it('hides the fallback notification', () => {
      // Show notification
      useRendererStore.getState().handleDeviceLost('Test')
      expect(useRendererStore.getState().showFallbackNotification).toBe(true)

      // Dismiss
      useRendererStore.getState().dismissFallbackNotification()
      expect(useRendererStore.getState().showFallbackNotification).toBe(false)
    })
  })

  describe('forceWebGL', () => {
    it('switches to webgl mode', () => {
      useRendererStore.getState().completeDetection({ supported: true })
      useRendererStore.getState().forceWebGL('initialization_error')

      expect(useRendererStore.getState().mode).toBe('webgl')
    })

    it('marks webgpu as unsupported with reason', () => {
      useRendererStore.getState().forceWebGL('no_adapter')

      const state = useRendererStore.getState()
      expect(state.webgpuStatus).toBe('unsupported')
      expect(state.webgpuCapabilities?.unavailableReason).toBe('no_adapter')
    })

    it('shows notification for non-user reasons', () => {
      useRendererStore.getState().forceWebGL('initialization_error')
      expect(useRendererStore.getState().showFallbackNotification).toBe(true)
    })

    it('does not show notification for user_disabled', () => {
      useRendererStore.getState().forceWebGL('user_disabled')
      expect(useRendererStore.getState().showFallbackNotification).toBe(false)
    })
  })

  describe('reset', () => {
    it('resets to initial state', () => {
      // Modify state
      useRendererStore.getState().completeDetection({ supported: true })
      useRendererStore.getState().setPreferredMode('webgl')

      // Reset
      useRendererStore.getState().reset()

      const state = useRendererStore.getState()
      expect(state.mode).toBe('webgl')
      expect(state.webgpuStatus).toBe('unknown')
      expect(state.webgpuCapabilities).toBeNull()
      expect(state.detectionComplete).toBe(false)
    })

    it('respects persisted preference after reset', () => {
      // Set preference
      localStorage.setItem('mdim_preferred_renderer', 'webgl')

      // Reset
      useRendererStore.getState().reset()

      expect(useRendererStore.getState().preferredMode).toBe('webgl')
    })
  })

  describe('localStorage persistence', () => {
    it('loads webgl preference from localStorage', () => {
      localStorage.setItem('mdim_preferred_renderer', 'webgl')
      useRendererStore.getState().reset()

      expect(useRendererStore.getState().preferredMode).toBe('webgl')
    })

    it('loads webgpu preference from localStorage', () => {
      localStorage.setItem('mdim_preferred_renderer', 'webgpu')
      useRendererStore.getState().reset()

      expect(useRendererStore.getState().preferredMode).toBe('webgpu')
    })

    it('defaults to webgpu for invalid stored value', () => {
      localStorage.setItem('mdim_preferred_renderer', 'invalid')
      useRendererStore.getState().reset()

      expect(useRendererStore.getState().preferredMode).toBe('webgpu')
    })
  })
})
