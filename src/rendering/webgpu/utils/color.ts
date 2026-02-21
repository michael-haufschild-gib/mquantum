/**
 * WebGPU Color Utilities
 *
 * WebGPU lighting shaders operate in linear space. Colors coming from Zustand stores
 * (hex strings like `#RRGGBB`) are sRGB and must be converted to linear to match
 * WebGL/Three.js `Color(...).convertSRGBToLinear()` behavior.
 *
 * @module rendering/webgpu/utils/color
 */

/** RGB triplet with channels normalized to [0, 1]. */
export type Rgb = readonly [number, number, number]
const LINEAR_COLOR_CACHE_MAX_ENTRIES = 512
const linearColorCache = new Map<string, Rgb>()

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Convert a single sRGB channel to linear using the standard sRGB transfer function.
 * Matches Three.js `Color.convertSRGBToLinear()` behavior.
 */
export function srgbToLinearChannel(c: number): number {
  const clamped = clamp01(c)
  return clamped <= 0.04045 ? clamped / 12.92 : Math.pow((clamped + 0.055) / 1.055, 2.4)
}

/**
 * Parse a hex color string to sRGB RGB channels in [0, 1].
 * Supports `#RGB`, `#RRGGBB`, and `#RRGGBBAA` (alpha ignored).
 */
export function parseHexColorToSrgbRgb(hex: string): Rgb | null {
  if (!hex || typeof hex !== 'string') return null
  const normalized = hex.trim()
  if (!normalized) return null
  const cleaned = normalized.startsWith('#') ? normalized.slice(1) : normalized

  const expanded =
    cleaned.length === 3
      ? `${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`
      : cleaned.length === 6 || cleaned.length === 8
        ? cleaned.slice(0, 6)
        : null

  if (!expanded) return null
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null

  const value = Number.parseInt(expanded, 16)
  if (!Number.isFinite(value)) return null

  const r = ((value >> 16) & 0xff) / 255
  const g = ((value >> 8) & 0xff) / 255
  const b = (value & 0xff) / 255
  return [r, g, b]
}

/**
 * Parse a hex sRGB color string to linear RGB channels in [0, 1].
 * Returns `fallback` when parsing fails.
 */
export function parseHexColorToLinearRgb(hex: string, fallback: Rgb = [1, 1, 1]): Rgb {
  if (hex && typeof hex === 'string') {
    const cacheKey = hex.trim().toLowerCase()
    const cached = linearColorCache.get(cacheKey)
    if (cached) {
      return cached
    }
  }

  const srgb = parseHexColorToSrgbRgb(hex)
  if (!srgb) return fallback
  const linear: Rgb = [
    srgbToLinearChannel(srgb[0]),
    srgbToLinearChannel(srgb[1]),
    srgbToLinearChannel(srgb[2]),
  ]
  const cacheKey = hex.trim().toLowerCase()
  if (linearColorCache.size >= LINEAR_COLOR_CACHE_MAX_ENTRIES) {
    linearColorCache.clear()
  }
  linearColorCache.set(cacheKey, linear)
  return linear
}
