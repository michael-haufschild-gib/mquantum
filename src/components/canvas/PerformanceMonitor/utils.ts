// --- Helper Functions ---
/**
 *
 * @param value
 * @param unit
 * @param decimals
 */
export function formatMetric(value: number, unit = '', decimals = 1): string {
  if (value === 0) return `0${unit}`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(decimals)}M${unit}`
  if (value >= 1_000) return `${(value / 1_000).toFixed(decimals)}k${unit}`
  return `${Math.round(value)}${unit}`
}

/**
 *
 * @param bytes
 * @param decimals
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`
}

/**
 *
 * @param fps
 * @param high
 * @param low
 */
export function getHealthColor(fps: number, high: number, low: number) {
  if (fps >= high)
    return {
      text: 'health-high',
      bg: 'bg-health-high',
      bgPulse: 'bg-health-high',
      stroke: 'var(--health-high-stroke)',
    }
  if (fps >= low)
    return {
      text: 'health-medium',
      bg: 'bg-health-medium',
      bgPulse: 'bg-health-medium',
      stroke: 'var(--health-medium-stroke)',
    }
  return {
    text: 'health-low',
    bg: 'bg-health-low',
    bgPulse: 'bg-health-low',
    stroke: 'var(--health-low-stroke)',
  }
}

/**
 *
 * @param key
 * @param objectType
 */
export function formatShaderName(key: string, objectType: string): string {
  if (key.toLowerCase() === 'object') {
    return objectType
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/-/g, ' ')
      .trim()
  }
  return key.replace(/^./, (str) => str.toUpperCase())
}

// --- Color helper for collapsed view ---
/** FPS threshold color classification: high (green), medium (yellow), low (red). */
export type FpsColorLevel = 'high' | 'medium' | 'low'
export const FPS_COLORS = {
  high: { text: 'health-high', bg: 'bg-health-high', stroke: 'var(--health-high-stroke)' },
  medium: { text: 'health-medium', bg: 'bg-health-medium', stroke: 'var(--health-medium-stroke)' },
  low: { text: 'health-low', bg: 'bg-health-low', stroke: 'var(--health-low-stroke)' },
} as const

/**
 *
 * @param fps
 */
export function getFpsColorLevel(fps: number): FpsColorLevel {
  if (fps >= 55) return 'high'
  if (fps >= 30) return 'medium'
  return 'low'
}

/**
 * Compute SVG sparkline points string from a numeric data array.
 *
 * Maps each value to an (x, y) coordinate string. X is evenly spaced across
 * `width`, Y is linearly scaled between `minY`/`maxY` and clamped to [0, height].
 *
 * @param data - Array of numeric values
 * @param width - SVG width in px
 * @param height - SVG height in px
 * @param minY - Minimum Y-axis value
 * @param maxY - Maximum Y-axis value
 * @returns Space-joined `"x,y"` pairs (no `M` prefix)
 */
export function computeSparklinePoints(
  data: number[],
  width: number,
  height: number,
  minY: number,
  maxY: number
): string {
  if (data.length < 2) return ''
  const range = maxY - minY
  if (range <= 0) {
    // Flat line at vertical center when all values are equal
    const midY = height * 0.5
    return data.map((_, i) => `${(i * width) / (data.length - 1)},${midY}`).join(' ')
  }
  const stepX = width / (data.length - 1)
  const points: string[] = new Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const x = i * stepX
    const normalizedY = Math.max(0, Math.min(1, (data[i]! - minY) / range))
    const y = height - normalizedY * height
    points[i] = `${x},${y}`
  }
  return points.join(' ')
}

/**
 * Format min/max FPS bounds for monitor labels.
 *
 * Uses a placeholder for uninitialized sentinel values such as Infinity.
 */
export function formatFpsBound(value: number): string {
  if (!Number.isFinite(value)) {
    return '--'
  }

  return Math.round(value).toString()
}
