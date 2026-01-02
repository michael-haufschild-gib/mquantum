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

  describe('Export mode selection', () => {
    it('defaults to in-memory mode', () => {
      expect(useExportStore.getState().exportMode).toBe('in-memory')
    })

    it('setExportModeOverride changes the export mode', () => {
      useExportStore.getState().setExportModeOverride('stream')
      expect(useExportStore.getState().exportMode).toBe('stream')

      useExportStore.getState().setExportModeOverride('segmented')
      expect(useExportStore.getState().exportMode).toBe('segmented')

      useExportStore.getState().setExportModeOverride('in-memory')
      expect(useExportStore.getState().exportMode).toBe('in-memory')
    })

    it('setting override to null reverts to in-memory', () => {
      useExportStore.getState().setExportModeOverride('stream')
      expect(useExportStore.getState().exportMode).toBe('stream')

      useExportStore.getState().setExportModeOverride(null)
      expect(useExportStore.getState().exportMode).toBe('in-memory')
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
      expect(getCompressionFactor('avc', 'variable')).toBeCloseTo(0.55 * 0.8)
      expect(getCompressionFactor('av1', 'variable')).toBeCloseTo(0.32 * 0.8)
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

  describe('Crop Calculation and Preset System', () => {
    /**
     * Helper to verify a crop region is properly centered.
     * For a centered crop: x + width/2 = 0.5 AND y + height/2 = 0.5
     */
    const verifyCropCentered = (crop: { x: number; y: number; width: number; height: number }) => {
      const horizontalCenter = crop.x + crop.width / 2
      const verticalCenter = crop.y + crop.height / 2
      expect(horizontalCenter).toBeCloseTo(0.5, 5)
      expect(verticalCenter).toBeCloseTo(0.5, 5)
    }

    /**
     * Verify crop boundaries are valid (0-1 range, non-negative dimensions)
     */
    const verifyCropBoundaries = (crop: {
      x: number
      y: number
      width: number
      height: number
    }) => {
      expect(crop.x).toBeGreaterThanOrEqual(0)
      expect(crop.y).toBeGreaterThanOrEqual(0)
      expect(crop.width).toBeGreaterThan(0)
      expect(crop.height).toBeGreaterThan(0)
      expect(crop.x + crop.width).toBeLessThanOrEqual(1.0001) // Allow tiny floating point error
      expect(crop.y + crop.height).toBeLessThanOrEqual(1.0001)
    }

    /**
     * Verify the crop region has the expected output aspect ratio.
     * The actual pixels aspect ratio is: (crop.width * canvasWidth) / (crop.height * canvasHeight)
     * = (crop.width / crop.height) * canvasRatio
     */
    const verifyCropAspectRatio = (
      crop: { width: number; height: number },
      canvasRatio: number,
      targetRatio: number
    ) => {
      const actualRatio = (crop.width / crop.height) * canvasRatio
      expect(actualRatio).toBeCloseTo(targetRatio, 3)
    }

    describe('calculateCropForRatio via applyPreset', () => {
      // Test with various canvas aspect ratios
      const canvasRatios = {
        '16:9': 16 / 9,
        '4:3': 4 / 3,
        '1:1': 1,
        '9:16': 9 / 16,
        '21:9': 21 / 9,
      }

      // Test all preset crop ratios
      const presetCropRatios = {
        instagram: 1,
        tiktok: 9 / 16,
        'youtube-shorts': 9 / 16,
        cinematic: 21 / 9,
        'square-60fps': 1,
      }

      describe('Centering invariant', () => {
        Object.entries(canvasRatios).forEach(([canvasName, canvasRatio]) => {
          Object.entries(presetCropRatios).forEach(([presetName, _cropRatio]) => {
            it(`${presetName} preset on ${canvasName} canvas should be centered`, () => {
              // Set canvas aspect ratio
              useExportStore.getState().setCanvasAspectRatio(canvasRatio)

              // Apply preset
              useExportStore.getState().applyPreset(presetName)

              const { crop } = useExportStore.getState().settings
              expect(crop.enabled).toBe(true)
              verifyCropCentered(crop)
              verifyCropBoundaries(crop)
            })
          })
        })
      })

      describe('Aspect ratio correctness', () => {
        Object.entries(canvasRatios).forEach(([canvasName, canvasRatio]) => {
          Object.entries(presetCropRatios).forEach(([presetName, targetRatio]) => {
            it(`${presetName} on ${canvasName} canvas should produce ${targetRatio.toFixed(3)} aspect ratio`, () => {
              useExportStore.getState().setCanvasAspectRatio(canvasRatio)
              useExportStore.getState().applyPreset(presetName)

              const { crop } = useExportStore.getState().settings
              verifyCropAspectRatio(crop, canvasRatio, targetRatio)
            })
          })
        })
      })

      describe('Specific crop calculations for 16:9 canvas', () => {
        beforeEach(() => {
          useExportStore.getState().setCanvasAspectRatio(16 / 9)
        })

        it('Instagram (1:1) should crop horizontally, leaving full height', () => {
          useExportStore.getState().applyPreset('instagram')
          const { crop } = useExportStore.getState().settings

          // Canvas wider than target → horizontal crop
          // cropWidth = 1 / (16/9) = 9/16 = 0.5625
          expect(crop.width).toBeCloseTo(9 / 16, 5)
          expect(crop.height).toBe(1)
          expect(crop.y).toBe(0)
          // x should center it: (1 - 0.5625) / 2 = 0.21875
          expect(crop.x).toBeCloseTo((1 - 9 / 16) / 2, 5)
        })

        it('TikTok (9:16) should crop horizontally even more', () => {
          useExportStore.getState().applyPreset('tiktok')
          const { crop } = useExportStore.getState().settings

          // Canvas (16:9) is much wider than target (9:16)
          // cropWidth = (9/16) / (16/9) = (9/16) * (9/16) = 81/256 ≈ 0.316
          const expectedWidth = 9 / 16 / (16 / 9)
          expect(crop.width).toBeCloseTo(expectedWidth, 5)
          expect(crop.height).toBe(1)
          expect(crop.x).toBeCloseTo((1 - expectedWidth) / 2, 5)
        })

        it('Cinematic (21:9) should crop vertically, leaving full width', () => {
          useExportStore.getState().applyPreset('cinematic')
          const { crop } = useExportStore.getState().settings

          // Canvas (16:9) is narrower than target (21:9)
          // cropHeight = (16/9) / (21/9) = 16/21 ≈ 0.762
          const expectedHeight = 16 / 9 / (21 / 9)
          expect(crop.width).toBe(1)
          expect(crop.height).toBeCloseTo(expectedHeight, 5)
          expect(crop.x).toBe(0)
          expect(crop.y).toBeCloseTo((1 - expectedHeight) / 2, 5)
        })
      })

      describe('Specific crop calculations for 4:3 canvas', () => {
        beforeEach(() => {
          useExportStore.getState().setCanvasAspectRatio(4 / 3)
        })

        it('Instagram (1:1) should crop horizontally', () => {
          useExportStore.getState().applyPreset('instagram')
          const { crop } = useExportStore.getState().settings

          // Canvas (4:3 = 1.333) wider than target (1:1)
          // cropWidth = 1 / (4/3) = 3/4 = 0.75
          expect(crop.width).toBeCloseTo(0.75, 5)
          expect(crop.height).toBe(1)
          expect(crop.x).toBeCloseTo(0.125, 5) // (1 - 0.75) / 2
        })

        it('TikTok (9:16) should crop horizontally', () => {
          useExportStore.getState().applyPreset('tiktok')
          const { crop } = useExportStore.getState().settings

          // Canvas (4:3) wider than target (9:16)
          const expectedWidth = 9 / 16 / (4 / 3)
          expect(crop.width).toBeCloseTo(expectedWidth, 5)
          expect(crop.height).toBe(1)
        })
      })

      describe('Specific crop calculations for 9:16 (portrait) canvas', () => {
        beforeEach(() => {
          useExportStore.getState().setCanvasAspectRatio(9 / 16)
        })

        it('Instagram (1:1) should crop vertically', () => {
          useExportStore.getState().applyPreset('instagram')
          const { crop } = useExportStore.getState().settings

          // Canvas (9:16 = 0.5625) is narrower than target (1:1)
          // cropHeight = (9/16) / 1 = 9/16 = 0.5625
          expect(crop.width).toBe(1)
          expect(crop.height).toBeCloseTo(9 / 16, 5)
          expect(crop.x).toBe(0)
          expect(crop.y).toBeCloseTo((1 - 9 / 16) / 2, 5)
        })

        it('TikTok (9:16) should use full frame (same aspect)', () => {
          useExportStore.getState().applyPreset('tiktok')
          const { crop } = useExportStore.getState().settings

          // Canvas matches target aspect ratio exactly
          // Both are 9:16, so full frame (with tiny floating point tolerance)
          expect(crop.width).toBeCloseTo(1, 5)
          expect(crop.height).toBeCloseTo(1, 5)
        })
      })
    })

    describe('Presets without cropRatio', () => {
      const nonCropPresets = ['landscape-1080p', 'landscape-720p', 'twitter-video', 'high-q']

      nonCropPresets.forEach((presetName) => {
        it(`${presetName} should have crop disabled`, () => {
          useExportStore.getState().setCanvasAspectRatio(16 / 9)
          useExportStore.getState().applyPreset(presetName)

          const { crop } = useExportStore.getState().settings
          expect(crop.enabled).toBe(false)
        })
      })
    })

    describe('Preset settings besides crop', () => {
      it('Instagram preset should set correct resolution and settings', () => {
        useExportStore.getState().applyPreset('instagram')
        const settings = useExportStore.getState().settings

        expect(settings.resolution).toBe('custom')
        expect(settings.customWidth).toBe(1080)
        expect(settings.customHeight).toBe(1080)
        expect(settings.fps).toBe(30)
        expect(settings.duration).toBe(60)
      })

      it('TikTok preset should set 9:16 portrait dimensions', () => {
        useExportStore.getState().applyPreset('tiktok')
        const settings = useExportStore.getState().settings

        expect(settings.customWidth).toBe(1080)
        expect(settings.customHeight).toBe(1920)
      })

      it('Cinematic preset should set 21:9 ultrawide dimensions', () => {
        useExportStore.getState().applyPreset('cinematic')
        const settings = useExportStore.getState().settings

        expect(settings.customWidth).toBe(3840)
        expect(settings.customHeight).toBe(1634)
        expect(settings.fps).toBe(24)
      })
    })

    describe('Manual crop settings', () => {
      it('should allow manual crop coordinates via updateSettings', () => {
        useExportStore.getState().updateSettings({
          crop: {
            enabled: true,
            x: 0.1,
            y: 0.2,
            width: 0.5,
            height: 0.6,
          },
        })

        const { crop } = useExportStore.getState().settings
        expect(crop.enabled).toBe(true)
        expect(crop.x).toBe(0.1)
        expect(crop.y).toBe(0.2)
        expect(crop.width).toBe(0.5)
        expect(crop.height).toBe(0.6)
      })

      it('should allow disabling crop', () => {
        // First enable crop
        useExportStore.getState().applyPreset('instagram')
        expect(useExportStore.getState().settings.crop.enabled).toBe(true)

        // Then disable it (spread existing crop to satisfy TypeScript, updateSettings does deep merge)
        const existingCrop = useExportStore.getState().settings.crop
        useExportStore.getState().updateSettings({
          crop: { ...existingCrop, enabled: false },
        })
        expect(useExportStore.getState().settings.crop.enabled).toBe(false)
      })
    })

    describe('Edge cases', () => {
      it('should handle very wide canvas (21:9) with portrait target', () => {
        useExportStore.getState().setCanvasAspectRatio(21 / 9)
        useExportStore.getState().applyPreset('tiktok') // 9:16 target

        const { crop } = useExportStore.getState().settings
        verifyCropCentered(crop)
        verifyCropBoundaries(crop)
        verifyCropAspectRatio(crop, 21 / 9, 9 / 16)
      })

      it('should handle very tall canvas (9:21) with landscape target', () => {
        useExportStore.getState().setCanvasAspectRatio(9 / 21)
        useExportStore.getState().applyPreset('cinematic') // 21:9 target

        const { crop } = useExportStore.getState().settings
        verifyCropCentered(crop)
        verifyCropBoundaries(crop)
        verifyCropAspectRatio(crop, 9 / 21, 21 / 9)
      })

      it('should handle 1:1 canvas with any preset', () => {
        useExportStore.getState().setCanvasAspectRatio(1)

        // Instagram on square should be full frame
        useExportStore.getState().applyPreset('instagram')
        let { crop } = useExportStore.getState().settings
        expect(crop.width).toBeCloseTo(1, 5)
        expect(crop.height).toBeCloseTo(1, 5)

        // TikTok (9:16 = 0.5625) on square (1:1) - canvas is wider than target
        // So we crop HORIZONTALLY: width = 0.5625/1 = 0.5625, height = 1
        useExportStore.getState().applyPreset('tiktok')
        crop = useExportStore.getState().settings.crop
        expect(crop.width).toBeCloseTo(9 / 16, 5)
        expect(crop.height).toBe(1)
        verifyCropCentered(crop)

        // Cinematic (21:9 = 2.33) on square (1:1) - canvas is narrower than target
        // So we crop VERTICALLY: width = 1, height = 1/(21/9) = 9/21
        useExportStore.getState().applyPreset('cinematic')
        crop = useExportStore.getState().settings.crop
        expect(crop.width).toBe(1)
        expect(crop.height).toBeCloseTo(9 / 21, 5)
        verifyCropCentered(crop)
      })
    })
  })
})
