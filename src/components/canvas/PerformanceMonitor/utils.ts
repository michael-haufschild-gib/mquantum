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
