const MAX_HISTORY = 8
const HISTORY_KEY = 'mquantum_color_history'

/**
 * Normalize persisted color history into a bounded string list.
 * @param raw - Persisted history payload
 * @returns Sanitized history entries
 */
function sanitizeColorHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .slice(0, MAX_HISTORY)
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

export { clampAlpha, handleSvArrowKey, HISTORY_KEY, MAX_HISTORY, sanitizeColorHistory }
