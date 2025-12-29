/**
 * Device Capabilities Detection Tests
 *
 * Tests for the unified device capability detection module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isWebGL2Supported,
  detectDeviceCapabilities,
  DEFAULT_CAPABILITIES,
  MOBILE_DEFAULT_MAX_FPS,
  MOBILE_DEFAULT_RESOLUTION_SCALE,
} from '@/lib/deviceCapabilities'

// Mock detect-gpu module
vi.mock('detect-gpu', () => ({
  getGPUTier: vi.fn(),
}))

import { getGPUTier } from 'detect-gpu'

describe('deviceCapabilities', () => {
  describe('isWebGL2Supported', () => {
    let originalCreateElement: typeof document.createElement

    beforeEach(() => {
      originalCreateElement = document.createElement.bind(document)
    })

    afterEach(() => {
      document.createElement = originalCreateElement
    })

    it('should return true when WebGL2 context is available', () => {
      // Mock canvas with WebGL2 support
      document.createElement = vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue({}), // Non-null = supported
      })

      expect(isWebGL2Supported()).toBe(true)
    })

    it('should return false when WebGL2 context is not available', () => {
      // Mock canvas without WebGL2 support
      document.createElement = vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue(null),
      })

      expect(isWebGL2Supported()).toBe(false)
    })

    it('should return false when getContext throws', () => {
      // Mock canvas that throws
      document.createElement = vi.fn().mockReturnValue({
        getContext: vi.fn().mockImplementation(() => {
          throw new Error('WebGL not available')
        }),
      })

      expect(isWebGL2Supported()).toBe(false)
    })
  })

  describe('detectDeviceCapabilities', () => {
    let originalCreateElement: typeof document.createElement

    beforeEach(() => {
      originalCreateElement = document.createElement.bind(document)
      vi.clearAllMocks()
    })

    afterEach(() => {
      document.createElement = originalCreateElement
    })

    it('should return tier 0 when WebGL2 is not supported', async () => {
      // Mock no WebGL2 support
      document.createElement = vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue(null),
      })

      const result = await detectDeviceCapabilities()

      expect(result.webgl2Supported).toBe(false)
      expect(result.gpuTier).toBe(0)
      expect(result.detectionType).toBe('webgl2-missing')
    })

    it('should detect desktop GPU correctly', async () => {
      // Mock WebGL2 support
      document.createElement = vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue({}),
      })

      // Mock detect-gpu result for desktop
      vi.mocked(getGPUTier).mockResolvedValue({
        tier: 3,
        isMobile: false,
        type: 'BENCHMARK',
        gpu: 'nvidia geforce rtx 3080',
        fps: 60,
      })

      const result = await detectDeviceCapabilities()

      expect(result.webgl2Supported).toBe(true)
      expect(result.gpuTier).toBe(3)
      expect(result.isMobileGPU).toBe(false)
      expect(result.gpuName).toBe('nvidia geforce rtx 3080')
      expect(result.detectionType).toBe('BENCHMARK')
    })

    it('should detect mobile GPU correctly', async () => {
      // Mock WebGL2 support
      document.createElement = vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue({}),
      })

      // Mock detect-gpu result for mobile
      vi.mocked(getGPUTier).mockResolvedValue({
        tier: 2,
        isMobile: true,
        type: 'BENCHMARK',
        gpu: 'apple a14 gpu',
        fps: 35,
      })

      const result = await detectDeviceCapabilities()

      expect(result.webgl2Supported).toBe(true)
      expect(result.gpuTier).toBe(2)
      expect(result.isMobileGPU).toBe(true)
      expect(result.gpuName).toBe('apple a14 gpu')
    })

    it('should handle detect-gpu errors gracefully', async () => {
      // Mock WebGL2 support
      document.createElement = vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue({}),
      })

      // Mock detect-gpu throwing an error
      vi.mocked(getGPUTier).mockRejectedValue(new Error('Detection failed'))

      const result = await detectDeviceCapabilities()

      // Should fall back to tier 3 desktop
      expect(result.webgl2Supported).toBe(true)
      expect(result.gpuTier).toBe(3)
      expect(result.isMobileGPU).toBe(false)
      expect(result.detectionType).toBe('error')
    })

    it('should handle undefined isMobile gracefully', async () => {
      // Mock WebGL2 support
      document.createElement = vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue({}),
      })

      // Mock detect-gpu result with undefined isMobile
      vi.mocked(getGPUTier).mockResolvedValue({
        tier: 2,
        isMobile: undefined,
        type: 'BENCHMARK',
        gpu: undefined,
        fps: undefined,
      })

      const result = await detectDeviceCapabilities()

      expect(result.isMobileGPU).toBe(false)
      expect(result.gpuName).toBe('unknown')
    })
  })

  describe('constants', () => {
    it('should have correct default capabilities', () => {
      expect(DEFAULT_CAPABILITIES.webgl2Supported).toBe(false)
      expect(DEFAULT_CAPABILITIES.gpuTier).toBe(3)
      expect(DEFAULT_CAPABILITIES.isMobileGPU).toBe(false)
    })

    it('should have correct mobile defaults', () => {
      expect(MOBILE_DEFAULT_RESOLUTION_SCALE).toBe(0.75)
      expect(MOBILE_DEFAULT_MAX_FPS).toBe(30)
    })
  })
})
