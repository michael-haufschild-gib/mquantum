/**
 * useDeviceCapabilities Hook Tests
 *
 * Tests for the device capability detection hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities'
import { usePerformanceStore } from '@/stores/performanceStore'
import { MOBILE_DEFAULT_MAX_FPS, MOBILE_DEFAULT_RESOLUTION_SCALE } from '@/lib/deviceCapabilities'

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
    // Reset stores to initial state
    usePerformanceStore.setState({
      gpuTier: 3,
      isMobileGPU: false,
      gpuName: 'unknown',
      deviceCapabilitiesDetected: false,
      renderResolutionScale: 1.0,
      maxFps: 60,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return webgl2Supported as true initially', () => {
    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      webgl2Supported: true,
      gpuTier: 3,
      isMobileGPU: false,
      gpuName: 'test gpu',
      detectionType: 'BENCHMARK',
      estimatedFps: 60,
    })

    const { result } = renderHook(() => useDeviceCapabilities())

    // Before detection completes, should assume true
    expect(result.current.webgl2Supported).toBe(true)
  })

  it('should detect desktop GPU and not apply mobile defaults', async () => {
    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      webgl2Supported: true,
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
      webgl2Supported: true,
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

  it('should handle WebGL2 not supported', async () => {
    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      webgl2Supported: false,
      gpuTier: 0,
      isMobileGPU: false,
      gpuName: 'unsupported',
      detectionType: 'webgl2-missing',
      estimatedFps: undefined,
    })

    renderHook(() => useDeviceCapabilities())

    await waitFor(() => {
      expect(usePerformanceStore.getState().deviceCapabilitiesDetected).toBe(true)
    })

    expect(usePerformanceStore.getState().gpuTier).toBe(0)
    // Should NOT apply mobile defaults for unsupported
    expect(usePerformanceStore.getState().renderResolutionScale).toBe(1.0)
  })

  it('should only run detection once', async () => {
    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      webgl2Supported: true,
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

  it('should return correct webgl2Supported after detection', async () => {
    vi.mocked(detectDeviceCapabilities).mockResolvedValue({
      webgl2Supported: false,
      gpuTier: 0,
      isMobileGPU: false,
      gpuName: 'unsupported',
      detectionType: 'webgl2-missing',
      estimatedFps: undefined,
    })

    const { result } = renderHook(() => useDeviceCapabilities())

    await waitFor(() => {
      expect(usePerformanceStore.getState().deviceCapabilitiesDetected).toBe(true)
    })

    // After detection, should reflect actual support
    expect(result.current.webgl2Supported).toBe(false)
  })
})
