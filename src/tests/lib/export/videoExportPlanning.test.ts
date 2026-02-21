import { describe, expect, it } from 'vitest'
import {
  computeRenderDimensions,
  computeSegmentDurationFrames,
  ensureEvenDimensions,
  resolveExportDimensions,
} from '@/lib/export/videoExportPlanning'

describe('videoExportPlanning', () => {
  describe('resolveExportDimensions', () => {
    it('maps preset resolutions correctly', () => {
      expect(resolveExportDimensions('720p', 1920, 1080)).toEqual({ width: 1280, height: 720 })
      expect(resolveExportDimensions('1080p', 1280, 720)).toEqual({ width: 1920, height: 1080 })
      expect(resolveExportDimensions('4k', 1280, 720)).toEqual({ width: 3840, height: 2160 })
    })

    it('uses custom resolution when requested', () => {
      expect(resolveExportDimensions('custom', 2559, 1439)).toEqual({ width: 2559, height: 1439 })
    })
  })

  describe('ensureEvenDimensions', () => {
    it('rounds down odd dimensions to even values', () => {
      expect(ensureEvenDimensions(2559, 1439)).toEqual({ width: 2558, height: 1438 })
      expect(ensureEvenDimensions(2560, 1440)).toEqual({ width: 2560, height: 1440 })
    })
  })

  describe('computeRenderDimensions', () => {
    it('returns export dimensions when crop is disabled', () => {
      expect(
        computeRenderDimensions({
          exportWidth: 1920,
          exportHeight: 1080,
          originalAspect: 16 / 9,
          maxTextureDimension2D: 8192,
          crop: { enabled: false, x: 0, y: 0, width: 1, height: 1 },
        })
      ).toEqual({ width: 1920, height: 1080 })
    })

    it('scales using crop region while preserving original aspect', () => {
      const result = computeRenderDimensions({
        exportWidth: 1080,
        exportHeight: 1920,
        originalAspect: 16 / 9,
        maxTextureDimension2D: 8192,
        crop: { enabled: true, x: 0.1, y: 0, width: 0.316, height: 1 },
      })

      expect(result.width).toBeGreaterThan(result.height)
      expect(result.width % 2).toBe(0)
      expect(result.height % 2).toBe(0)
      expect(result.height).toBeGreaterThanOrEqual(1920)
    })

    it('clamps render dimensions to max texture limit', () => {
      const result = computeRenderDimensions({
        exportWidth: 3840,
        exportHeight: 2160,
        originalAspect: 21 / 9,
        maxTextureDimension2D: 4096,
        crop: { enabled: true, x: 0, y: 0, width: 0.25, height: 1 },
      })

      expect(result.width).toBeLessThanOrEqual(4096)
      expect(result.height).toBeLessThanOrEqual(4096)
      expect(result.width % 2).toBe(0)
      expect(result.height % 2).toBe(0)
    })

    it('falls back to export dimensions when original aspect is non-positive', () => {
      const result = computeRenderDimensions({
        exportWidth: 1920,
        exportHeight: 1080,
        originalAspect: 0,
        maxTextureDimension2D: 8192,
        crop: { enabled: true, x: 0, y: 0, width: 0.5, height: 0.5 },
      })

      expect(result).toEqual({ width: 1920, height: 1080 })
    })

    it('falls back to internal 8192 clamp when max texture limit is non-finite', () => {
      const result = computeRenderDimensions({
        exportWidth: 3840,
        exportHeight: 2160,
        originalAspect: 16 / 9,
        maxTextureDimension2D: Number.NaN,
        crop: { enabled: true, x: 0, y: 0, width: 0.05, height: 1 },
      })

      expect(result.width).toBeLessThanOrEqual(8192)
      expect(result.height).toBeLessThanOrEqual(8192)
      expect(result.width % 2).toBe(0)
      expect(result.height % 2).toBe(0)
    })
  })

  describe('computeSegmentDurationFrames', () => {
    it('computes segmented frame count bounded by duration and min segment seconds', () => {
      const frames = computeSegmentDurationFrames({
        durationSeconds: 120,
        fps: 60,
        bitrateMbps: 12,
      })

      expect(frames).toBeGreaterThanOrEqual(5 * 60)
      expect(frames).toBeLessThanOrEqual(120 * 60)
    })

    it('uses full duration for short clips', () => {
      const frames = computeSegmentDurationFrames({
        durationSeconds: 4,
        fps: 30,
        bitrateMbps: 20,
      })

      expect(frames).toBe(4 * 30)
    })

    it('returns a finite minimum frame count for non-finite timing inputs', () => {
      const frames = computeSegmentDurationFrames({
        durationSeconds: Number.NaN,
        fps: Number.POSITIVE_INFINITY,
        bitrateMbps: Number.NaN,
      })

      expect(Number.isFinite(frames)).toBe(true)
      expect(frames).toBe(1)
    })
  })
})
