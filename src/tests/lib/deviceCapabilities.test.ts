/**
 * Device Capabilities Detection Tests
 *
 * Tests for the unified device capability detection module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { detectDeviceCapabilities } from '@/lib/deviceCapabilities'

// Mock detect-gpu module
vi.mock('detect-gpu', () => ({
  getGPUTier: vi.fn(),
}))

import { getGPUTier } from 'detect-gpu'

describe('deviceCapabilities', () => {
  describe('detectDeviceCapabilities', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should detect desktop GPU correctly', async () => {
      vi.mocked(getGPUTier).mockResolvedValue({
        tier: 3,
        isMobile: false,
        type: 'BENCHMARK',
        gpu: 'nvidia geforce rtx 3080',
        fps: 60,
      })

      const result = await detectDeviceCapabilities()

      expect(result.gpuTier).toBe(3)
      expect(result.isMobileGPU).toBe(false)
      expect(result.gpuName).toBe('nvidia geforce rtx 3080')
      expect(result.detectionType).toBe('BENCHMARK')
    })

    it('should detect mobile GPU correctly', async () => {
      vi.mocked(getGPUTier).mockResolvedValue({
        tier: 2,
        isMobile: true,
        type: 'BENCHMARK',
        gpu: 'apple a14 gpu',
        fps: 35,
      })

      const result = await detectDeviceCapabilities()

      expect(result.gpuTier).toBe(2)
      expect(result.isMobileGPU).toBe(true)
      expect(result.gpuName).toBe('apple a14 gpu')
    })

    it('should handle detect-gpu errors gracefully', async () => {
      vi.mocked(getGPUTier).mockRejectedValue(new Error('Detection failed'))

      const result = await detectDeviceCapabilities()

      // Should fail closed so detection errors do not unlock high-cost paths.
      expect(result.gpuTier).toBe(0)
      expect(result.isMobileGPU).toBe(false)
      expect(result.detectionType).toBe('error')
    })

    it('should normalize malformed detect-gpu payloads to safe defaults', async () => {
      vi.mocked(getGPUTier).mockResolvedValue({
        tier: 99,
        isMobile: undefined,
        type: undefined as unknown as 'BENCHMARK',
        gpu: '',
        fps: Number.NaN,
      })

      const result = await detectDeviceCapabilities()

      expect(result.gpuTier).toBe(0)
      expect(result.isMobileGPU).toBe(false)
      expect(result.gpuName).toBe('unknown')
      expect(result.detectionType).toBe('unknown')
      expect(result.estimatedFps).toBeUndefined()
    })

    it('should handle undefined isMobile gracefully', async () => {
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
})
