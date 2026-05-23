import type { CropValues } from './CropBox'

interface CropPixels {
  x: number
  y: number
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function finiteFraction(value: number, fallback: number): number {
  return Number.isFinite(value) ? clamp(value, 0, 1) : fallback
}

/**
 * Resolve normalized crop values to a non-empty integer source rect.
 *
 * The modal can receive crop state from direct store/debug writes and from
 * layout edge cases where a crop box temporarily has zero rendered size. PNG
 * export needs a strictly positive canvas, so invalid crop fractions recover to
 * the full image while valid subpixel crops clamp to at least one source pixel.
 */
export function resolveCropPixels(
  crop: CropValues,
  naturalWidth: number,
  naturalHeight: number
): CropPixels | null {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth < 1 ||
    naturalHeight < 1
  ) {
    return null
  }

  const imageWidth = Math.floor(naturalWidth)
  const imageHeight = Math.floor(naturalHeight)
  const xFraction = finiteFraction(crop.x, 0)
  const yFraction = finiteFraction(crop.y, 0)
  const widthFraction = Number.isFinite(crop.width) && crop.width > 0 ? clamp(crop.width, 0, 1) : 1
  const heightFraction =
    Number.isFinite(crop.height) && crop.height > 0 ? clamp(crop.height, 0, 1) : 1

  const x = clamp(Math.round(xFraction * imageWidth), 0, imageWidth - 1)
  const y = clamp(Math.round(yFraction * imageHeight), 0, imageHeight - 1)
  const width = clamp(Math.round(widthFraction * imageWidth), 1, imageWidth - x)
  const height = clamp(Math.round(heightFraction * imageHeight), 1, imageHeight - y)

  return { x, y, width, height }
}
