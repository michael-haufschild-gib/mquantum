import type { CropSettings, ExportResolution } from '@/stores/exportStore'

/**
 * Pixel dimensions in width/height order.
 */
export interface Dimensions {
  width: number
  height: number
}

/**
 * Inputs required to compute internal render dimensions for export.
 */
export interface ComputeRenderDimensionsArgs {
  exportWidth: number
  exportHeight: number
  originalAspect: number
  maxTextureDimension2D: number
  crop: CropSettings
}

/**
 * Inputs required to compute segment frame count for chunked exports.
 */
export interface ComputeSegmentDurationFramesArgs {
  durationSeconds: number
  fps: number
  bitrateMbps: number
  targetSegmentMB?: number
  minSegmentSeconds?: number
}

/**
 * Resolve output pixel dimensions from export resolution settings.
 */
export function resolveExportDimensions(
  resolution: ExportResolution,
  customWidth: number,
  customHeight: number
): Dimensions {
  if (resolution === '4k') {
    return { width: 3840, height: 2160 }
  }

  if (resolution === '720p') {
    return { width: 1280, height: 720 }
  }

  if (resolution === 'custom') {
    return { width: customWidth, height: customHeight }
  }

  return { width: 1920, height: 1080 }
}

/**
 * Normalize dimensions to codec-friendly even values.
 */
export function ensureEvenDimensions(width: number, height: number): Dimensions {
  const normalizedWidth = Number.isFinite(width) ? width : 2
  const normalizedHeight = Number.isFinite(height) ? height : 2
  const safeWidth = Math.max(2, Math.floor(normalizedWidth / 2) * 2)
  const safeHeight = Math.max(2, Math.floor(normalizedHeight / 2) * 2)
  return { width: safeWidth, height: safeHeight }
}

/**
 * Compute internal render size for export.
 *
 * With crop enabled, render at the original camera aspect ratio so crop coordinates
 * remain visually aligned with the preview, then crop/scale to final export size.
 */
export function computeRenderDimensions({
  exportWidth,
  exportHeight,
  originalAspect,
  maxTextureDimension2D,
  crop,
}: ComputeRenderDimensionsArgs): Dimensions {
  if (
    !crop.enabled ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    !Number.isFinite(originalAspect) ||
    originalAspect <= 0
  ) {
    return ensureEvenDimensions(exportWidth, exportHeight)
  }

  const scaleX = exportWidth / crop.width
  const scaleY = exportHeight / crop.height
  const scaleFactor = Math.max(scaleX, scaleY)

  let renderWidth: number
  let renderHeight: number

  if (originalAspect >= 1) {
    renderHeight = Math.round(scaleFactor)
    renderWidth = Math.round(renderHeight * originalAspect)
  } else {
    renderWidth = Math.round(scaleFactor)
    renderHeight = Math.round(renderWidth / originalAspect)
  }

  const finiteTextureLimit =
    Number.isFinite(maxTextureDimension2D) && maxTextureDimension2D > 0
      ? maxTextureDimension2D
      : 8192
  const safeLimit = Math.max(2, Math.min(finiteTextureLimit, 8192))
  if (renderWidth > safeLimit || renderHeight > safeLimit) {
    const ratio = Math.min(safeLimit / renderWidth, safeLimit / renderHeight)
    renderWidth = Math.floor(renderWidth * ratio)
    renderHeight = Math.floor(renderHeight * ratio)
  }

  return ensureEvenDimensions(renderWidth, renderHeight)
}

/**
 * Compute frames per segment for segmented export mode.
 *
 * Targets approximately 50 MB segments, bounded to [minSegmentSeconds, durationSeconds].
 */
export function computeSegmentDurationFrames({
  durationSeconds,
  fps,
  bitrateMbps,
  targetSegmentMB = 50,
  minSegmentSeconds = 5,
}: ComputeSegmentDurationFramesArgs): number {
  const safeDurationSeconds = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 1
  const safeBitrateMbps = Number.isFinite(bitrateMbps) && bitrateMbps > 0 ? bitrateMbps : 0
  const safeTargetSegmentMB = Number.isFinite(targetSegmentMB) && targetSegmentMB > 0 ? targetSegmentMB : 50
  const safeMinSegmentSeconds =
    Number.isFinite(minSegmentSeconds) && minSegmentSeconds > 0 ? minSegmentSeconds : 1

  const fullDurationFrames = Math.max(1, Math.ceil(safeDurationSeconds * safeFps))
  if (safeDurationSeconds <= safeMinSegmentSeconds) {
    return fullDurationFrames
  }

  const targetSizeBytes = safeTargetSegmentMB * 1024 * 1024
  const bitrateBps = safeBitrateMbps * 1024 * 1024
  const calculatedSegmentSeconds =
    targetSizeBytes > 0 && bitrateBps > 0
      ? (targetSizeBytes * 8) / bitrateBps
      : safeDurationSeconds

  const segmentSeconds = Math.max(
    safeMinSegmentSeconds,
    Math.min(safeDurationSeconds, calculatedSegmentSeconds)
  )
  const segmentFrames = Math.max(1, Math.ceil(segmentSeconds * safeFps))

  return Math.min(fullDurationFrames, segmentFrames)
}
