import { describe, expect, it } from 'vitest'

import type { ExportSettings } from '@/stores/runtime/exportStore'
import {
  clampMin,
  clampToRange,
  getCompressionFactor,
  getRecommendedBitrate,
  isBitrateMode,
  isExportFormat,
  isExportResolution,
  isFiniteNumber,
  isHardwareAcceleration,
  isRotation,
  isVideoCodec,
  sanitizeCropPatch,
  sanitizeTextOverlayPatch,
  stripInvalidEnum,
} from '@/stores/utils/exportValidation'

describe('getCompressionFactor', () => {
  it('returns per-codec constant-bitrate factors', () => {
    expect(getCompressionFactor('avc', 'constant')).toBe(0.55)
    expect(getCompressionFactor('hevc', 'constant')).toBe(0.42)
    expect(getCompressionFactor('vp9', 'constant')).toBe(0.42)
    expect(getCompressionFactor('av1', 'constant')).toBe(0.32)
  })

  it('applies 0.8 multiplier for variable bitrate', () => {
    expect(getCompressionFactor('avc', 'variable')).toBeCloseTo(0.55 * 0.8)
    expect(getCompressionFactor('av1', 'variable')).toBeCloseTo(0.32 * 0.8)
  })
})

describe('getRecommendedBitrate', () => {
  it('scales base bitrate by FPS ratio', () => {
    const at30 = getRecommendedBitrate('1080p', 30)
    const at60 = getRecommendedBitrate('1080p', 60)
    expect(at60).toBe(at30 * 2)
  })

  it('uses resolution-specific base bitrates', () => {
    expect(getRecommendedBitrate('720p', 30)).toBe(8)
    expect(getRecommendedBitrate('1080p', 30)).toBe(12)
    expect(getRecommendedBitrate('4k', 30)).toBe(35)
  })

  it('clamps result to [4, 100]', () => {
    expect(getRecommendedBitrate('720p', 1)).toBe(4)
    expect(getRecommendedBitrate('4k', 120)).toBeLessThanOrEqual(100)
  })

  it('falls back to 30fps for non-finite FPS', () => {
    expect(getRecommendedBitrate('1080p', NaN)).toBe(12)
    expect(getRecommendedBitrate('1080p', Infinity)).toBe(12)
    expect(getRecommendedBitrate('1080p', 0)).toBe(12)
    expect(getRecommendedBitrate('1080p', -10)).toBe(12)
  })

  it('scales custom resolution by pixel count relative to 1080p', () => {
    // 3840x2160 = 4x the pixels of 1920x1080
    const bitrate = getRecommendedBitrate('custom', 30, 3840, 2160)
    expect(bitrate).toBe(48)
  })

  it('ignores custom dimensions when resolution is not custom', () => {
    const without = getRecommendedBitrate('1080p', 30)
    const withCustomDims = getRecommendedBitrate('1080p', 30, 7680, 4320)
    expect(withCustomDims).toBe(without)
  })

  it('ignores non-finite or non-positive custom dimensions', () => {
    expect(getRecommendedBitrate('custom', 30, NaN, 1080)).toBe(12)
    expect(getRecommendedBitrate('custom', 30, 1920, -1)).toBe(12)
    expect(getRecommendedBitrate('custom', 30, 0, 1080)).toBe(12)
  })
})

describe('type guards', () => {
  describe('isFiniteNumber', () => {
    it('accepts finite numbers', () => {
      expect(isFiniteNumber(0)).toBe(true)
      expect(isFiniteNumber(-42.5)).toBe(true)
      expect(isFiniteNumber(1e10)).toBe(true)
    })

    it('rejects non-finite numbers and non-numbers', () => {
      expect(isFiniteNumber(NaN)).toBe(false)
      expect(isFiniteNumber(Infinity)).toBe(false)
      expect(isFiniteNumber(-Infinity)).toBe(false)
      expect(isFiniteNumber('5')).toBe(false)
      expect(isFiniteNumber(null)).toBe(false)
      expect(isFiniteNumber(undefined)).toBe(false)
    })
  })

  describe('isExportFormat', () => {
    it('accepts valid formats', () => {
      expect(isExportFormat('mp4')).toBe(true)
      expect(isExportFormat('webm')).toBe(true)
    })

    it('rejects invalid formats', () => {
      expect(isExportFormat('avi')).toBe(false)
      expect(isExportFormat('')).toBe(false)
      expect(isExportFormat(123)).toBe(false)
    })
  })

  describe('isVideoCodec', () => {
    it('accepts all valid codecs', () => {
      for (const codec of ['avc', 'hevc', 'vp9', 'av1']) {
        expect(isVideoCodec(codec)).toBe(true)
      }
    })

    it('rejects invalid values', () => {
      expect(isVideoCodec('h264')).toBe(false)
      expect(isVideoCodec(null)).toBe(false)
    })
  })

  describe('isExportResolution', () => {
    it('accepts all valid resolutions', () => {
      for (const res of ['720p', '1080p', '4k', 'custom']) {
        expect(isExportResolution(res)).toBe(true)
      }
    })

    it('rejects invalid values', () => {
      expect(isExportResolution('2k')).toBe(false)
      expect(isExportResolution(1080)).toBe(false)
    })
  })

  describe('isBitrateMode', () => {
    it('accepts constant and variable', () => {
      expect(isBitrateMode('constant')).toBe(true)
      expect(isBitrateMode('variable')).toBe(true)
    })

    it('rejects other values', () => {
      expect(isBitrateMode('adaptive')).toBe(false)
    })
  })

  describe('isHardwareAcceleration', () => {
    it('accepts valid options', () => {
      expect(isHardwareAcceleration('no-preference')).toBe(true)
      expect(isHardwareAcceleration('prefer-hardware')).toBe(true)
      expect(isHardwareAcceleration('prefer-software')).toBe(true)
    })

    it('rejects invalid options', () => {
      expect(isHardwareAcceleration('gpu')).toBe(false)
    })
  })

  describe('isRotation', () => {
    it('accepts valid rotation angles', () => {
      expect(isRotation(0)).toBe(true)
      expect(isRotation(90)).toBe(true)
      expect(isRotation(180)).toBe(true)
      expect(isRotation(270)).toBe(true)
    })

    it('rejects invalid angles', () => {
      expect(isRotation(45)).toBe(false)
      expect(isRotation(360)).toBe(false)
      expect(isRotation('90')).toBe(false)
    })
  })
})

describe('clampToRange', () => {
  it('clamps below minimum', () => {
    expect(clampToRange(-5, 0, 1)).toBe(0)
  })

  it('clamps above maximum', () => {
    expect(clampToRange(10, 0, 1)).toBe(1)
  })

  it('preserves in-range values', () => {
    expect(clampToRange(0.5, 0, 1)).toBe(0.5)
  })
})

describe('clampMin', () => {
  it('clamps below minimum', () => {
    expect(clampMin(-1, 0)).toBe(0)
  })

  it('preserves values at or above minimum', () => {
    expect(clampMin(5, 0)).toBe(5)
    expect(clampMin(0, 0)).toBe(0)
  })
})

describe('sanitizeTextOverlayPatch', () => {
  it('passes through valid complete patch', () => {
    const patch = {
      fontSize: 24,
      fontWeight: 400,
      opacity: 0.8,
      shadowBlur: 3,
      padding: 10,
      text: 'Hello',
      fontFamily: 'Arial',
      color: '#ffffff',
      shadowColor: '#000000',
      enabled: true,
      verticalPlacement: 'top' as const,
      horizontalPlacement: 'center' as const,
    }
    const result = sanitizeTextOverlayPatch(patch)
    expect(result.fontSize).toBe(24)
    expect(result.fontWeight).toBe(400)
    expect(result.opacity).toBe(0.8)
    expect(result.text).toBe('Hello')
    expect(result.enabled).toBe(true)
  })

  it('clamps fontSize to minimum 1', () => {
    const result = sanitizeTextOverlayPatch({ fontSize: -5 })
    expect(result.fontSize).toBe(1)
  })

  it('clamps fontWeight to [100, 900] and rounds', () => {
    expect(sanitizeTextOverlayPatch({ fontWeight: 50 }).fontWeight).toBe(100)
    expect(sanitizeTextOverlayPatch({ fontWeight: 1000 }).fontWeight).toBe(900)
    expect(sanitizeTextOverlayPatch({ fontWeight: 450.7 }).fontWeight).toBe(451)
  })

  it('clamps opacity to [0, 1]', () => {
    expect(sanitizeTextOverlayPatch({ opacity: -0.5 }).opacity).toBe(0)
    expect(sanitizeTextOverlayPatch({ opacity: 2 }).opacity).toBe(1)
  })

  it('clamps shadowBlur and padding to minimum 0', () => {
    expect(sanitizeTextOverlayPatch({ shadowBlur: -10 }).shadowBlur).toBe(0)
    expect(sanitizeTextOverlayPatch({ padding: -5 }).padding).toBe(0)
  })

  it('strips NaN numeric fields', () => {
    const result = sanitizeTextOverlayPatch({
      fontSize: NaN,
      opacity: Infinity,
      text: 'kept',
    })
    expect(result).not.toHaveProperty('fontSize')
    expect(result).not.toHaveProperty('opacity')
    expect(result.text).toBe('kept')
  })

  it('strips non-boolean enabled', () => {
    const result = sanitizeTextOverlayPatch({
      enabled: 'yes' as unknown as boolean,
    })
    expect(result).not.toHaveProperty('enabled')
  })

  it('strips non-string text fields', () => {
    const result = sanitizeTextOverlayPatch({
      text: 123 as unknown as string,
      color: null as unknown as string,
    })
    expect(result).not.toHaveProperty('text')
    expect(result).not.toHaveProperty('color')
  })

  it('strips invalid placement values', () => {
    const result = sanitizeTextOverlayPatch({
      verticalPlacement: 'middle' as 'top',
      horizontalPlacement: 'start' as 'left',
    })
    expect(result).not.toHaveProperty('verticalPlacement')
    expect(result).not.toHaveProperty('horizontalPlacement')
  })

  it('preserves valid placement values', () => {
    const result = sanitizeTextOverlayPatch({
      verticalPlacement: 'bottom',
      horizontalPlacement: 'right',
    })
    expect(result.verticalPlacement).toBe('bottom')
    expect(result.horizontalPlacement).toBe('right')
  })
})

describe('sanitizeCropPatch', () => {
  it('clamps spatial fields to [0, 1]', () => {
    const result = sanitizeCropPatch({ x: -0.5, y: 1.5, width: 2, height: -1 })
    expect(result.x).toBe(0)
    expect(result.y).toBe(1)
    expect(result.width).toBe(1)
    expect(result.height).toBe(0)
  })

  it('strips NaN spatial fields', () => {
    const result = sanitizeCropPatch({ x: NaN, width: 0.5 })
    expect(result).not.toHaveProperty('x')
    expect(result.width).toBe(0.5)
  })

  it('strips non-boolean enabled', () => {
    const result = sanitizeCropPatch({ enabled: 1 as unknown as boolean })
    expect(result).not.toHaveProperty('enabled')
  })

  it('preserves valid enabled boolean', () => {
    expect(sanitizeCropPatch({ enabled: true }).enabled).toBe(true)
    expect(sanitizeCropPatch({ enabled: false }).enabled).toBe(false)
  })

  it('passes through valid crop region unchanged', () => {
    const input = { x: 0.1, y: 0.2, width: 0.5, height: 0.3 }
    const result = sanitizeCropPatch(input)
    expect(result).toEqual(input)
  })

  it('keeps full crop patches inside unit bounds', () => {
    const result = sanitizeCropPatch({ x: 0.8, y: 0.75, width: 0.5, height: 0.4 })
    expect(result.x).toBe(0.5)
    expect(result.y).toBe(0.6)
    expect(result.width).toBe(0.5)
    expect(result.height).toBe(0.4)
  })
})

describe('stripInvalidEnum', () => {
  it('keeps valid enum values', () => {
    const settings: Partial<ExportSettings> = { format: 'mp4' }
    stripInvalidEnum(settings, 'format', isExportFormat)
    expect(settings.format).toBe('mp4')
  })

  it('deletes invalid enum values', () => {
    const settings: Partial<ExportSettings> = { format: 'avi' as ExportSettings['format'] }
    stripInvalidEnum(settings, 'format', isExportFormat)
    expect(settings).not.toHaveProperty('format')
  })

  it('does nothing when field is undefined', () => {
    const settings: Partial<ExportSettings> = { fps: 30 }
    stripInvalidEnum(settings, 'format', isExportFormat)
    expect(settings).toEqual({ fps: 30 })
  })

  it('works with all enum validators', () => {
    const s1: Partial<ExportSettings> = { codec: 'fake' as ExportSettings['codec'] }
    stripInvalidEnum(s1, 'codec', isVideoCodec)
    expect(s1).not.toHaveProperty('codec')

    const s2: Partial<ExportSettings> = { resolution: '1080p' }
    stripInvalidEnum(s2, 'resolution', isExportResolution)
    expect(s2.resolution).toBe('1080p')

    const s3: Partial<ExportSettings> = { bitrateMode: 'variable' }
    stripInvalidEnum(s3, 'bitrateMode', isBitrateMode)
    expect(s3.bitrateMode).toBe('variable')

    const s4: Partial<ExportSettings> = { hardwareAcceleration: 'prefer-hardware' }
    stripInvalidEnum(s4, 'hardwareAcceleration', isHardwareAcceleration)
    expect(s4.hardwareAcceleration).toBe('prefer-hardware')

    const s5: Partial<ExportSettings> = { rotation: 90 }
    stripInvalidEnum(s5, 'rotation', isRotation)
    expect(s5.rotation).toBe(90)
  })
})
