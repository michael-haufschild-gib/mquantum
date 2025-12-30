/**
 * Tests for exportStore
 */

import { getCompressionFactor, getRecommendedBitrate, useExportStore } from '@/stores/exportStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
const mockRevokeObjectURL = vi.fn()

vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
})

describe('exportStore', () => {
  beforeEach(() => {
    // Reset store first (this may call revokeObjectURL)
    useExportStore.getState().reset()
    // Then clear mocks so tests start fresh
    vi.clearAllMocks()
  })

  describe('setPreviewUrl', () => {
    it('should set preview URL', () => {
      useExportStore.getState().setPreviewUrl('blob:test-url')
      expect(useExportStore.getState().previewUrl).toBe('blob:test-url')
    })

    it('should revoke previous URL when setting new one', () => {
      useExportStore.getState().setPreviewUrl('blob:first-url')
      useExportStore.getState().setPreviewUrl('blob:second-url')

      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:first-url')
    })

    it('should not revoke if setting same URL', () => {
      useExportStore.getState().setPreviewUrl('blob:same-url')
      mockRevokeObjectURL.mockClear()
      useExportStore.getState().setPreviewUrl('blob:same-url')

      expect(mockRevokeObjectURL).not.toHaveBeenCalled()
    })

    it('should not revoke if previous URL was null', () => {
      useExportStore.getState().setPreviewUrl('blob:new-url')
      // First call shouldn't revoke anything
      expect(mockRevokeObjectURL).not.toHaveBeenCalled()
    })
  })

  describe('setError', () => {
    it('should set error message', () => {
      useExportStore.getState().setError('Test error')
      expect(useExportStore.getState().error).toBe('Test error')
    })

    it('should clear error when set to null', () => {
      useExportStore.getState().setError('Test error')
      useExportStore.getState().setError(null)
      expect(useExportStore.getState().error).toBeNull()
    })
  })

  describe('updateSettings', () => {
    it('should update single setting', () => {
      useExportStore.getState().updateSettings({ fps: 30 })
      expect(useExportStore.getState().settings.fps).toBe(30)
    })

    it('should update multiple settings', () => {
      useExportStore.getState().updateSettings({
        fps: 24,
        resolution: '4k',
        bitrate: 50,
      })

      const settings = useExportStore.getState().settings
      expect(settings.fps).toBe(24)
      expect(settings.resolution).toBe('4k')
      expect(settings.bitrate).toBe(50)
    })

    it('should preserve other settings', () => {
      const originalDuration = useExportStore.getState().settings.duration
      useExportStore.getState().updateSettings({ fps: 30 })
      expect(useExportStore.getState().settings.duration).toBe(originalDuration)
    })

    it('should update custom dimensions', () => {
      useExportStore.getState().updateSettings({
        resolution: 'custom',
        customWidth: 2560,
        customHeight: 1440,
      })

      const settings = useExportStore.getState().settings
      expect(settings.resolution).toBe('custom')
      expect(settings.customWidth).toBe(2560)
      expect(settings.customHeight).toBe(1440)
    })

    it('auto-adjusts bitrate when resolution or fps changes (unless bitrate is explicitly set)', () => {
      // Establish a known base
      useExportStore.getState().updateSettings({ resolution: '1080p', fps: 30 })
      const bitrate30 = useExportStore.getState().settings.bitrate
      expect(bitrate30).toBe(getRecommendedBitrate('1080p', 30))

      // Changing fps should change bitrate (auto)
      useExportStore.getState().updateSettings({ fps: 60 })
      expect(useExportStore.getState().settings.bitrate).toBe(getRecommendedBitrate('1080p', 60))

      // Explicit bitrate disables auto adjustment for that update
      useExportStore.getState().updateSettings({ resolution: '4k', bitrate: 50 })
      expect(useExportStore.getState().settings.bitrate).toBe(50)
    })
  })

  describe('reset', () => {
    it('should revoke previewUrl on reset', () => {
      useExportStore.getState().setPreviewUrl('blob:to-revoke')
      mockRevokeObjectURL.mockClear()
      useExportStore.getState().reset()

      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:to-revoke')
    })

    it('should preserve settings on reset', () => {
      useExportStore.getState().updateSettings({ fps: 30, duration: 10 })
      useExportStore.getState().reset()

      // Settings should not change
      expect(useExportStore.getState().settings.fps).toBe(30)
      expect(useExportStore.getState().settings.duration).toBe(10)
    })
  })

  describe('Mode/tier selection (recalculateMode)', () => {
    it('computes estimatedSizeMB with compression factor and selects tier/mode', () => {
      // Force a known browser type for deterministic mode selection
      useExportStore.setState({ browserType: 'standard' })

      // Set avc with CBR => compression factor 0.55
      // Theoretical: (bitrate * duration)/8, then multiply by compression factor
      // With bitrate=160, duration=10: theoretical=200MB, compressed=200*0.55=110MB
      useExportStore.getState().updateSettings({ bitrate: 160, duration: 10, bitrateMode: 'constant' })
      useExportStore.getState().setModalOpen(true) // triggers recalculateMode

      const theoreticalSize = (160 * 10) / 8 // 200MB
      const expectedSize = theoreticalSize * getCompressionFactor('avc', 'constant') // 200 * 0.55 = 110MB
      expect(useExportStore.getState().estimatedSizeMB).toBeCloseTo(expectedSize)

      // Standard browser => segmented for >=100MB
      expect(useExportStore.getState().exportMode).toBe('segmented')
      // 110MB => medium tier (50-150)
      expect(useExportStore.getState().exportTier).toBe('medium')

      useExportStore.setState({ browserType: 'chromium-capable' })
      useExportStore.getState().recalculateMode()
      expect(useExportStore.getState().exportMode).toBe('stream')

      // Large tier: bitrate=280, duration=10 => theoretical=350MB, compressed=192.5MB (>=150)
      useExportStore.getState().updateSettings({ bitrate: 280, duration: 10 })
      expect(useExportStore.getState().exportTier).toBe('large')
    })

    it('applies different compression factors for different codecs', () => {
      // AVC CBR: 0.55
      useExportStore.getState().updateSettings({ codec: 'avc', bitrateMode: 'constant', bitrate: 80, duration: 10 })
      const avcSize = useExportStore.getState().estimatedSizeMB
      expect(avcSize).toBeCloseTo((80 * 10) / 8 * 0.55) // 55MB

      // AV1 CBR: 0.32 (most efficient)
      useExportStore.getState().updateSettings({ codec: 'av1' })
      const av1Size = useExportStore.getState().estimatedSizeMB
      expect(av1Size).toBeCloseTo((80 * 10) / 8 * 0.32) // 32MB

      // AV1 is more efficient than AVC
      expect(av1Size).toBeLessThan(avcSize)
    })

    it('applies VBR mode reduction to compression factor', () => {
      useExportStore.getState().updateSettings({ codec: 'avc', bitrateMode: 'constant', bitrate: 80, duration: 10 })
      const cbrSize = useExportStore.getState().estimatedSizeMB

      useExportStore.getState().updateSettings({ bitrateMode: 'variable' })
      const vbrSize = useExportStore.getState().estimatedSizeMB

      // VBR should be ~20% smaller (factor *= 0.80)
      expect(vbrSize).toBeCloseTo(cbrSize * 0.80)
    })

    it('exportModeOverride wins over auto selection', () => {
      useExportStore.setState({ browserType: 'chromium-capable' })
      // Use high bitrate to exceed auto threshold
      useExportStore.getState().updateSettings({ bitrate: 200, duration: 10 }) // would choose stream
      expect(useExportStore.getState().exportMode).toBe('stream')

      useExportStore.getState().setExportModeOverride('segmented')
      expect(useExportStore.getState().exportMode).toBe('segmented')
    })
  })

  describe('getCompressionFactor', () => {
    it('returns correct factors for each codec in CBR mode', () => {
      expect(getCompressionFactor('avc', 'constant')).toBe(0.55)
      expect(getCompressionFactor('hevc', 'constant')).toBe(0.42)
      expect(getCompressionFactor('vp9', 'constant')).toBe(0.42)
      expect(getCompressionFactor('av1', 'constant')).toBe(0.32)
    })

    it('applies 20% reduction for VBR mode', () => {
      expect(getCompressionFactor('avc', 'variable')).toBeCloseTo(0.55 * 0.80)
      expect(getCompressionFactor('av1', 'variable')).toBeCloseTo(0.32 * 0.80)
    })

    it('shows codec efficiency ranking: AV1 > HEVC/VP9 > AVC', () => {
      const avc = getCompressionFactor('avc', 'constant')
      const hevc = getCompressionFactor('hevc', 'constant')
      const vp9 = getCompressionFactor('vp9', 'constant')
      const av1 = getCompressionFactor('av1', 'constant')

      // Lower factor = better compression = smaller files
      expect(av1).toBeLessThan(hevc)
      expect(av1).toBeLessThan(vp9)
      expect(hevc).toBeLessThan(avc)
      expect(vp9).toBeLessThan(avc)
    })
  })

  describe('getRecommendedBitrate', () => {
    it('scales bitrate by resolution and fps and clamps to [4, 100]', () => {
      expect(getRecommendedBitrate('720p', 30)).toBe(8)
      expect(getRecommendedBitrate('1080p', 60)).toBe(24) // 12 * 2
      expect(getRecommendedBitrate('4k', 60)).toBe(70) // 35 * 2
      expect(getRecommendedBitrate('1080p', 1)).toBe(4) // clamps low
      expect(getRecommendedBitrate('4k', 999)).toBe(100) // clamps high
    })

    it('scales custom resolution bitrate by pixel ratio vs 1080p', () => {
      // 2560x1440 is ~1.777... of 1080p pixels => base 12*ratio ~ 21.33 => round 21 at 30fps
      expect(getRecommendedBitrate('custom', 30, 2560, 1440)).toBe(21)
    })
  })
})
