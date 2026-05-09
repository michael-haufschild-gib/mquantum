/**
 * useDeviceCapabilities Hook Tests
 *
 * Tests for the device capability detection hook.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities'
import { MOBILE_DEFAULT_MAX_FPS, MOBILE_DEFAULT_RESOLUTION_SCALE } from '@/lib/deviceCapabilities'
import { useLightingStore } from '@/stores/lightingStore'
import { usePerformanceStore } from '@/stores/performanceStore'

// Mock the deviceCapabilities module
vi.mock('@/lib/deviceCapabilities', async () => {
  const actual = await vi.importActual('@/lib/deviceCapabilities')
  return {
    ...actual,
    detectDeviceCapabilities: vi.fn(),
  }
})

import { detectDeviceCapabilities } from '@/lib/deviceCapabilities'

describe('useDeviceCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem('mdim_render_resolution_scale')
    localStorage.removeItem('mdim_max_fps')
    // Reset stores to initial state
    usePerformanceStore.setState({
      gpuTier: 3,
      isMobileGPU: false,
      gpuName: 'unknown',
      deviceCapabilitiesDetected: false,
      renderResolutionScale: 1.0,
      maxFps: 60,
    })
    useLightingStore.getState().reset()
  })

  afterEach(() => {
    localStorage.removeItem('mdim_render_resolution_scale')
    localStorage.removeItem('mdim_max_fps')
    vi.restoreAllMocks()
  })

  it('should detect desktop GPU and not apply mobile defaults', async () => {
    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      gpuTier: 3,
      isMobileGPU: false,
      gpuName: 'nvidia geforce rtx 3080',
      detectionType: 'BENCHMARK',
      estimatedFps: 60,
    })

    renderHook(() => useDeviceCapabilities())

    await waitFor(() => {
      expect(usePerformanceStore.getState().deviceCapabilitiesDetected).toBe(true)
    })

    // Should NOT apply mobile defaults
    expect(usePerformanceStore.getState().renderResolutionScale).toBe(1.0)
    expect(usePerformanceStore.getState().maxFps).toBe(60)
    expect(usePerformanceStore.getState().isMobileGPU).toBe(false)
    expect(usePerformanceStore.getState().gpuTier).toBe(3)
  })

  it('should detect mobile GPU and apply mobile defaults', async () => {
    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      gpuTier: 2,
      isMobileGPU: true,
      gpuName: 'apple a14 gpu',
      detectionType: 'BENCHMARK',
      estimatedFps: 35,
    })

    renderHook(() => useDeviceCapabilities())

    await waitFor(() => {
      expect(usePerformanceStore.getState().deviceCapabilitiesDetected).toBe(true)
    })

    // Should apply mobile defaults
    expect(usePerformanceStore.getState().renderResolutionScale).toBe(
      MOBILE_DEFAULT_RESOLUTION_SCALE
    )
    expect(usePerformanceStore.getState().maxFps).toBe(MOBILE_DEFAULT_MAX_FPS)
    expect(usePerformanceStore.getState().isMobileGPU).toBe(true)
    expect(usePerformanceStore.getState().gpuTier).toBe(2)
  })

  it('applies mobile defaults when persisted preference strings are malformed', async () => {
    localStorage.setItem('mdim_render_resolution_scale', '0.75junk')
    localStorage.setItem('mdim_max_fps', '45fps')

    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      gpuTier: 2,
      isMobileGPU: true,
      gpuName: 'apple a14 gpu',
      detectionType: 'BENCHMARK',
      estimatedFps: 35,
    })

    renderHook(() => useDeviceCapabilities())

    await waitFor(() => {
      expect(usePerformanceStore.getState().deviceCapabilitiesDetected).toBe(true)
    })

    expect(usePerformanceStore.getState().renderResolutionScale).toBe(
      MOBILE_DEFAULT_RESOLUTION_SCALE
    )
    expect(usePerformanceStore.getState().maxFps).toBe(MOBILE_DEFAULT_MAX_FPS)
  })

  it('preserves explicit performance preferences on mobile GPUs', async () => {
    localStorage.setItem('mdim_render_resolution_scale', '0.72')
    localStorage.setItem('mdim_max_fps', '48')
    usePerformanceStore.setState({
      renderResolutionScale: 0.72,
      maxFps: 48,
    })

    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      gpuTier: 1,
      isMobileGPU: true,
      gpuName: 'adreno mobile gpu',
      detectionType: 'BENCHMARK',
      estimatedFps: 28,
    })

    renderHook(() => useDeviceCapabilities())

    await waitFor(() => {
      expect(usePerformanceStore.getState().deviceCapabilitiesDetected).toBe(true)
    })

    expect(usePerformanceStore.getState().renderResolutionScale).toBe(0.72)
    expect(usePerformanceStore.getState().maxFps).toBe(48)
  })

  it('removes spotlights on mobile GPUs while preserving the default point light', async () => {
    const spotId = useLightingStore.getState().addLight('spot')
    expect(spotId).toBe(useLightingStore.getState().selectedLightId)
    expect(useLightingStore.getState().lights.map((light) => light.type)).toEqual(['point', 'spot'])

    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      gpuTier: 1,
      isMobileGPU: true,
      gpuName: 'mali mobile gpu',
      detectionType: 'BENCHMARK',
      estimatedFps: 24,
    })

    renderHook(() => useDeviceCapabilities())

    await waitFor(() => {
      expect(usePerformanceStore.getState().deviceCapabilitiesDetected).toBe(true)
    })

    expect(useLightingStore.getState().lights.map((light) => light.type)).toEqual(['point'])
    expect(useLightingStore.getState().selectedLightId).toBeNull()
  })

  it('should handle detect-gpu failure gracefully (tier 3 fallback)', async () => {
    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      gpuTier: 3,
      isMobileGPU: false,
      gpuName: 'detection-failed',
      detectionType: 'error',
      estimatedFps: undefined,
    })

    renderHook(() => useDeviceCapabilities())

    await waitFor(() => {
      expect(usePerformanceStore.getState().deviceCapabilitiesDetected).toBe(true)
    })

    expect(usePerformanceStore.getState().gpuTier).toBe(3)
    // Should NOT apply mobile defaults for fallback
    expect(usePerformanceStore.getState().renderResolutionScale).toBe(1.0)
  })

  it('should only run detection once', async () => {
    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      gpuTier: 3,
      isMobileGPU: false,
      gpuName: 'test gpu',
      detectionType: 'BENCHMARK',
      estimatedFps: 60,
    })

    const { rerender } = renderHook(() => useDeviceCapabilities())

    await waitFor(() => {
      expect(usePerformanceStore.getState().deviceCapabilitiesDetected).toBe(true)
    })

    // Rerender multiple times
    rerender()
    rerender()
    rerender()

    // Should only have called detection once
    expect(detectDeviceCapabilities).toHaveBeenCalledTimes(1)
  })
})
