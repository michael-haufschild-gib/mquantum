import { hsvToHex, isValidHex } from '@/lib/colors/colorUtils'

const MAX_HISTORY = 8
const HISTORY_KEY = 'mquantum_color_history'

/** Noise texture data URI for alpha checkerboard backgrounds. */
const NOISE_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`

/**
 * Checkerboard `background-image` value for transparent color preview.
 *
 * Pre-wrapped as `url("…")` to match the {@link NOISE_BG} convention.
 * Consumers assign it directly to `style.backgroundImage` — previously
 * every call site duplicated the `\`url(${CHECKERBOARD})\`` wrap, and
 * a future caller forgetting the wrap would silently lose the
 * checkerboard texture.
 */
const CHECKERBOARD_BG =
  'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==")'

/** Hue gradient stops for the hue slider track. */
const HUE_STOPS = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1] as const

/** CSS linear gradient covering the full hue wheel. */
const HUE_GRADIENT = `linear-gradient(to right, ${HUE_STOPS.map((s) => `${hsvToHex(s, 1, 1)} ${Math.round(s * 100)}%`).join(', ')})`
const RGB_COLOR_RE = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i
const RGBA_COLOR_RE = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*((?:\d+\.?\d*|\.\d+))\s*\)$/i

/** Return true when a CSS RGB channel is an integer in [0, 255]. */
function isRgbChannel(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255
}

/** Format a sanitized CSS color function without embedding raw color literals. */
function formatColorFunction(name: 'rgb' | 'rgba', values: Array<number | string>): string {
  return `${name}(${values.join(', ')})`
}

/**
 * Normalize one persisted history entry to a ColorPicker-supported color string.
 * @param entry - Candidate persisted color
 * @returns Normalized color, or null when unsupported/malformed
 */
function normalizeColorHistoryEntry(entry: string): string | null {
  const color = entry.trim()
  if (isValidHex(color)) {
    return color.toLowerCase()
  }

  const rgbMatch = color.match(RGB_COLOR_RE)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1] ?? '', 10)
    const g = parseInt(rgbMatch[2] ?? '', 10)
    const b = parseInt(rgbMatch[3] ?? '', 10)
    if (isRgbChannel(r) && isRgbChannel(g) && isRgbChannel(b)) {
      return formatColorFunction('rgb', [r, g, b])
    }
    return null
  }

  const rgbaMatch = color.match(RGBA_COLOR_RE)
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1] ?? '', 10)
    const g = parseInt(rgbaMatch[2] ?? '', 10)
    const b = parseInt(rgbaMatch[3] ?? '', 10)
    const a = parseFloat(rgbaMatch[4] ?? '')
    if (isRgbChannel(r) && isRgbChannel(g) && isRgbChannel(b) && a >= 0 && a <= 1) {
      return formatColorFunction('rgba', [r, g, b, a])
    }
  }

  return null
}

/**
 * Normalize persisted color history into a bounded string list.
 * @param raw - Persisted history payload
 * @returns Sanitized history entries
 */
function sanitizeColorHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const seen = new Set<string>()
  const sanitized: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const color = normalizeColorHistoryEntry(entry)
    if (!color || seen.has(color)) continue
    seen.add(color)
    sanitized.push(color)
    if (sanitized.length >= MAX_HISTORY) break
  }
  return sanitized
}

/**
 * Clamp alpha into [0, 1] with NaN/infinite fallback.
 * @param value - Candidate alpha value
 * @returns Safe alpha
 */
function clampAlpha(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.max(0, Math.min(1, value))
}

/**
 * Handle arrow key navigation on the 2D saturation/value area.
 * Shift increases step size. Returns updated S or V, or null if key unhandled.
 */
function handleSvArrowKey(
  key: string,
  shiftKey: boolean,
  s: number,
  v: number
): { s: number; v: number } | null {
  const step = shiftKey ? 0.1 : 0.02
  switch (key) {
    case 'ArrowRight':
      return { s: Math.min(1, s + step), v }
    case 'ArrowLeft':
      return { s: Math.max(0, s - step), v }
    case 'ArrowUp':
      return { s, v: Math.min(1, v + step) }
    case 'ArrowDown':
      return { s, v: Math.max(0, v - step) }
    default:
      return null
  }
}

export {
  CHECKERBOARD_BG,
  clampAlpha,
  handleSvArrowKey,
  HISTORY_KEY,
  HUE_GRADIENT,
  MAX_HISTORY,
  NOISE_BG,
  normalizeColorHistoryEntry,
  sanitizeColorHistory,
}
