/**
 * Validation and sanitization utilities for export store settings.
 *
 * Extracted from exportStore.ts to reduce file size. Contains type guards,
 * sanitization functions for text overlay and crop patches, and bitrate heuristics.
 *
 * @module stores/utils/exportValidation
 */

import type {
  CropSettings,
  ExportFormat,
  ExportResolution,
  ExportSettings,
  TextOverlaySettings,
  VideoCodec,
} from '../exportStore'

// ---------------------------------------------------------------------------
// Bitrate heuristics
// ---------------------------------------------------------------------------

/**
 * Get compression factor for realistic file size estimation.
 *
 * @param codec - The video codec being used
 * @param bitrateMode - CBR (constant) or VBR (variable)
 * @returns Factor to multiply theoretical size by (0.0 - 1.0)
 */
export const getCompressionFactor = (
  codec: VideoCodec,
  bitrateMode: 'constant' | 'variable'
): number => {
  const codecFactors: Record<VideoCodec, number> = {
    avc: 0.55,
    hevc: 0.42,
    vp9: 0.42,
    av1: 0.32,
  }
  let factor = codecFactors[codec] ?? 0.5
  if (bitrateMode === 'variable') {
    factor *= 0.8
  }
  return factor
}

/**
 * Calculate recommended bitrate based on resolution and FPS.
 *
 * @param resolution - The video resolution preset
 * @param fps - The target frames per second
 * @param customWidth - Optional custom width in pixels
 * @param customHeight - Optional custom height in pixels
 * @returns Recommended bitrate in Mbps
 */
export const getRecommendedBitrate = (
  resolution: ExportResolution,
  fps: number,
  customWidth?: number,
  customHeight?: number
): number => {
  const baseBitrates: Record<ExportResolution, number> = {
    '720p': 8,
    '1080p': 12,
    '4k': 35,
    custom: 12,
  }

  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30
  const safeResolution: ExportResolution = resolution in baseBitrates ? resolution : '1080p'
  let baseBitrate = baseBitrates[safeResolution]

  if (
    safeResolution === 'custom' &&
    typeof customWidth === 'number' &&
    Number.isFinite(customWidth) &&
    customWidth > 0 &&
    typeof customHeight === 'number' &&
    Number.isFinite(customHeight) &&
    customHeight > 0
  ) {
    const pixels1080p = 1920 * 1080
    baseBitrate = Math.round(12 * ((customWidth * customHeight) / pixels1080p))
  }

  const recommendedBitrate = Math.round(baseBitrate * (safeFps / 30))
  if (!Number.isFinite(recommendedBitrate)) return 12
  return Math.max(4, Math.min(100, recommendedBitrate))
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const clampToRange = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export const clampMin = (value: number, min: number): number => Math.max(min, value)

export const isExportFormat = (value: unknown): value is ExportFormat =>
  value === 'mp4' || value === 'webm'

export const isVideoCodec = (value: unknown): value is VideoCodec =>
  value === 'avc' || value === 'hevc' || value === 'vp9' || value === 'av1'

export const isExportResolution = (value: unknown): value is ExportResolution =>
  value === '720p' || value === '1080p' || value === '4k' || value === 'custom'

export const isBitrateMode = (value: unknown): value is ExportSettings['bitrateMode'] =>
  value === 'constant' || value === 'variable'

export const isHardwareAcceleration = (
  value: unknown
): value is ExportSettings['hardwareAcceleration'] =>
  value === 'no-preference' || value === 'prefer-hardware' || value === 'prefer-software'

export const isRotation = (value: unknown): value is ExportSettings['rotation'] =>
  value === 0 || value === 90 || value === 180 || value === 270

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

/** Sanitize and clamp text overlay settings patch. Returns cleaned patch. */
export function sanitizeTextOverlayPatch(
  raw: Partial<TextOverlaySettings>
): Partial<TextOverlaySettings> {
  const patch = { ...raw }

  const sanitizeFiniteNumber = (
    key: 'fontSize' | 'fontWeight' | 'letterSpacing' | 'opacity' | 'shadowBlur' | 'padding'
  ): number | undefined => {
    const value = patch[key]
    if (value === undefined) return undefined
    if (!Number.isFinite(value)) {
      if (import.meta.env.DEV) {
        console.warn(`[exportStore] Ignoring invalid textOverlay.${key} update:`, value)
      }
      delete patch[key]
      return undefined
    }
    return value
  }

  const fontSize = sanitizeFiniteNumber('fontSize')
  if (fontSize !== undefined) patch.fontSize = clampMin(fontSize, 1)

  const fontWeight = sanitizeFiniteNumber('fontWeight')
  if (fontWeight !== undefined) patch.fontWeight = clampToRange(Math.round(fontWeight), 100, 900)

  sanitizeFiniteNumber('letterSpacing')

  const opacity = sanitizeFiniteNumber('opacity')
  if (opacity !== undefined) patch.opacity = clampToRange(opacity, 0, 1)

  const shadowBlur = sanitizeFiniteNumber('shadowBlur')
  if (shadowBlur !== undefined) patch.shadowBlur = clampMin(shadowBlur, 0)

  const padding = sanitizeFiniteNumber('padding')
  if (padding !== undefined) patch.padding = clampMin(padding, 0)

  if ('enabled' in patch && typeof patch.enabled !== 'boolean') {
    if (import.meta.env.DEV) {
      console.warn('[exportStore] Ignoring invalid textOverlay.enabled update:', patch.enabled)
    }
    delete patch.enabled
  }

  for (const key of ['text', 'fontFamily', 'color', 'shadowColor'] as const) {
    if (key in patch && typeof patch[key] !== 'string') {
      if (import.meta.env.DEV) {
        console.warn(`[exportStore] Ignoring invalid textOverlay.${key} update:`, patch[key])
      }
      delete patch[key]
    }
  }

  if (
    'verticalPlacement' in patch &&
    patch.verticalPlacement !== 'top' &&
    patch.verticalPlacement !== 'center' &&
    patch.verticalPlacement !== 'bottom'
  ) {
    if (import.meta.env.DEV) {
      console.warn(
        '[exportStore] Ignoring invalid textOverlay.verticalPlacement update:',
        patch.verticalPlacement
      )
    }
    delete patch.verticalPlacement
  }

  if (
    'horizontalPlacement' in patch &&
    patch.horizontalPlacement !== 'left' &&
    patch.horizontalPlacement !== 'center' &&
    patch.horizontalPlacement !== 'right'
  ) {
    if (import.meta.env.DEV) {
      console.warn(
        '[exportStore] Ignoring invalid textOverlay.horizontalPlacement update:',
        patch.horizontalPlacement
      )
    }
    delete patch.horizontalPlacement
  }

  return patch
}

/** Sanitize and clamp crop settings patch. Returns cleaned patch. */
export function sanitizeCropPatch(raw: Partial<CropSettings>): Partial<CropSettings> {
  const patch = { ...raw }
  const clampUnitRange = (v: number) => Math.max(0, Math.min(1, v))

  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const value = patch[key]
    if (value === undefined) continue
    if (!Number.isFinite(value)) {
      if (import.meta.env.DEV) {
        console.warn(`[exportStore] Ignoring invalid crop.${key} update:`, value)
      }
      delete patch[key]
    } else {
      patch[key] = clampUnitRange(value)
    }
  }

  if ('enabled' in patch && typeof patch.enabled !== 'boolean') {
    if (import.meta.env.DEV) {
      console.warn('[exportStore] Ignoring invalid crop.enabled update:', patch.enabled)
    }
    delete patch.enabled
  }

  return patch
}
