/**
 * Tests for rendererStore - WebGPU mode management
 *
 * @module tests/stores/rendererStore.test
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useRendererStore } from '@/stores/rendererStore'
import type { WebGPUCapabilityInfo } from '@/stores/rendererStore'

describe('rendererStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useRendererStore.getState().reset()
  })

  describe('initial state', () => {
    it('starts with webgpu mode', () => {
      const state = useRendererStore.getState()
      expect(state.mode).toBe('webgpu')
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

    it('sets mode to webgpu when supported', () => {
      useRendererStore.getState().completeDetection({
        supported: true,
      })

      expect(useRendererStore.getState().mode).toBe('webgpu')
      expect(useRendererStore.getState().webgpuStatus).toBe('supported')
    })

    it('shows fallback notification when webgpu not supported', () => {
      useRendererStore.getState().completeDetection({
        supported: false,
        unavailableReason: 'not_in_browser',
      })

      const state = useRendererStore.getState()
      expect(state.mode).toBe('webgpu')
      expect(state.webgpuStatus).toBe('unsupported')
      expect(state.showFallbackNotification).toBe(true)
    })
  })

  describe('handleDeviceLost', () => {
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

  describe('reset', () => {
    it('resets to initial state', () => {
      // Modify state
      useRendererStore.getState().completeDetection({ supported: true })

      // Reset
      useRendererStore.getState().reset()

      const state = useRendererStore.getState()
      expect(state.mode).toBe('webgpu')
      expect(state.webgpuStatus).toBe('unknown')
      expect(state.webgpuCapabilities).toBeNull()
      expect(state.detectionComplete).toBe(false)
    })
  })
})
