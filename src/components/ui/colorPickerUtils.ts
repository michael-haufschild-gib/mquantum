const MAX_HISTORY = 8
const HISTORY_KEY = 'mdimension_color_history'

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

export { MAX_HISTORY, HISTORY_KEY, sanitizeColorHistory, clampAlpha }
