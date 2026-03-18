/**
 * Tests for rendererStore - WebGPU detection lifecycle
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { WebGPUCapabilityInfo } from '@/stores/rendererStore'
import { useRendererStore } from '@/stores/rendererStore'

describe('rendererStore', () => {
  beforeEach(() => {
    useRendererStore.getState().reset()
  })

  it('completeDetection stores capabilities and marks detection done', () => {
    const caps: WebGPUCapabilityInfo = {
      supported: true,
      vendor: 'Mock Vendor',
      architecture: 'Mock Arch',
      device: 'Mock Device',
    }
    useRendererStore.getState().completeDetection(caps)

    const state = useRendererStore.getState()
    expect(state.detectionComplete).toBe(true)
    expect(state.webgpuCapabilities).toEqual(caps)
    expect(state.mode).toBe('webgpu')
    expect(state.webgpuStatus).toBe('supported')
    expect(state.showFallbackNotification).toBe(false)
  })

  it('completeDetection shows fallback notification when unsupported', () => {
    useRendererStore.getState().completeDetection({
      supported: false,
      unavailableReason: 'not_in_browser',
    })

    const state = useRendererStore.getState()
    expect(state.webgpuStatus).toBe('unsupported')
    expect(state.showFallbackNotification).toBe(true)
    expect(state.webgpuCapabilities?.unavailableReason).toBe('not_in_browser')
  })

  it('handleDeviceLost marks unsupported and shows notification', () => {
    useRendererStore.getState().handleDeviceLost('GPU process crashed')

    const state = useRendererStore.getState()
    expect(state.webgpuStatus).toBe('unsupported')
    expect(state.webgpuCapabilities?.unavailableReason).toBe('device_lost')
    expect(state.showFallbackNotification).toBe(true)
  })

  it('dismissFallbackNotification hides the notification', () => {
    useRendererStore.getState().handleDeviceLost('Test')
    useRendererStore.getState().dismissFallbackNotification()

    expect(useRendererStore.getState().showFallbackNotification).toBe(false)
  })

  it('setWebGPUStatus transitions through lifecycle states', () => {
    for (const status of ['checking', 'supported', 'unsupported'] as const) {
      useRendererStore.getState().setWebGPUStatus(status)
      expect(useRendererStore.getState().webgpuStatus).toBe(status)
    }
  })

  it('reset restores pre-detection state after full lifecycle', () => {
    useRendererStore.getState().completeDetection({ supported: true, vendor: 'NVIDIA' })
    useRendererStore.getState().reset()

    const state = useRendererStore.getState()
    expect(state.mode).toBe('webgpu')
    expect(state.webgpuStatus).toBe('unknown')
    expect(state.webgpuCapabilities).toBeNull()
    expect(state.detectionComplete).toBe(false)
    expect(state.showFallbackNotification).toBe(false)
  })
})
