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

    it('floors NaN and negative inputs to the minimum 2', () => {
      // Codec-friendly minimum is 2 (H.264 chroma subsampling requires even
      // ≥ 2). NaN / Infinity / zero / negatives must collapse to the floor
      // rather than leaking into downstream GPU texture sizing.
      expect(ensureEvenDimensions(Number.NaN, 1440)).toEqual({ width: 2, height: 1440 })
      expect(ensureEvenDimensions(1920, Number.POSITIVE_INFINITY)).toEqual({
        width: 1920,
        height: 2,
      })
      expect(ensureEvenDimensions(-5, 10)).toEqual({ width: 2, height: 10 })
      expect(ensureEvenDimensions(0, 1)).toEqual({ width: 2, height: 2 })
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

    it('scales using crop region while preserving original aspect (landscape camera)', () => {
      // Pin exact dimensions so a future refactor that swaps max/min in
      // `scaleFactor` or flips the aspect branch is caught immediately.
      // Inputs: portrait export (1080×1920) of a landscape camera (16/9);
      // horizontal crop covers 31.6% of the preview → render surface
      // must be large enough that the cropped region still emits 1080×1920
      // at native resolution.
      const result = computeRenderDimensions({
        exportWidth: 1080,
        exportHeight: 1920,
        originalAspect: 16 / 9,
        maxTextureDimension2D: 8192,
        crop: { enabled: true, x: 0.1, y: 0, width: 0.316, height: 1 },
      })
      expect(result).toEqual({ width: 6076, height: 3418 })
    })

    it('scales portrait-camera crop with the inverse aspect branch', () => {
      // Portrait camera (9/16) drives the `originalAspect < 1` branch —
      // renderWidth is the scaleFactor root and renderHeight is
      // `round(renderWidth / aspect)`. A refactor that collapses both
      // branches into a single formula must match these numbers.
      // Derivation:
      //   scaleX = 1080/1 = 1080, scaleY = 1920/0.316 ≈ 6075.95
      //   scaleFactor = 6075.95
      //   renderWidth = 6076, renderHeight = round(6076 / (9/16)) = 10802
      //   Clamp to 8192: ratio = 8192/10802 ≈ 0.7584
      //   (4607, 8192) → ensureEvenDimensions → (4606, 8192)
      const result = computeRenderDimensions({
        exportWidth: 1080,
        exportHeight: 1920,
        originalAspect: 9 / 16,
        maxTextureDimension2D: 8192,
        crop: { enabled: true, x: 0, y: 0.1, width: 1, height: 0.316 },
      })
      expect(result).toEqual({ width: 4606, height: 8192 })
    })

    it('falls back to export dimensions when crop width is non-positive', () => {
      // crop.enabled=true but crop.width<=0 must still route through the
      // early-return path — otherwise division by zero would corrupt
      // scaleX and downstream renderWidth. Exercises the guard at
      // videoExportPlanning.ts:81-88.
      const result = computeRenderDimensions({
        exportWidth: 1920,
        exportHeight: 1080,
        originalAspect: 16 / 9,
        maxTextureDimension2D: 8192,
        crop: { enabled: true, x: 0, y: 0, width: 0, height: 1 },
      })
      expect(result).toEqual({ width: 1920, height: 1080 })
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

      // At 12 Mbps → 50 MB target ≈ 33.33 s per segment → 33.33 s × 60 fps.
      // The product underflows by one float ulp (33.333…336 × 60 ≈
      // 2000.0000000000002), so `Math.ceil` lifts to 2001. Pinning the
      // exact integer catches regressions that would silently double the
      // segment count and slip past the old 300 ≤ frames ≤ 7200 band.
      expect(frames).toBe(2001)
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
