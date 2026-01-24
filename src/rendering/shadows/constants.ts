/**
 * Shadow System Constants
 *
 * Default values, options, labels, and tooltips for the shadow system.
 */

import type { ShadowAnimationMode, ShadowQuality } from './types'

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_SHADOW_ENABLED = false
export const DEFAULT_SHADOW_QUALITY: ShadowQuality = 'medium'
export const DEFAULT_SHADOW_SOFTNESS = 1.0
export const DEFAULT_SHADOW_ANIMATION_MODE: ShadowAnimationMode = 'low'

// =============================================================================
// Softness Range
// =============================================================================

export const SHADOW_SOFTNESS_RANGE = {
  min: 0.0,
  max: 2.0,
  step: 0.1,
  default: 1.0,
} as const

// =============================================================================
// Quality Options
// =============================================================================

export const SHADOW_QUALITY_OPTIONS: ShadowQuality[] = ['low', 'medium', 'high', 'ultra']

export const SHADOW_QUALITY_LABELS: Record<ShadowQuality, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
}

export const SHADOW_QUALITY_TOOLTIPS: Record<ShadowQuality, string> = {
  low: 'Fast rendering, visible stepping in shadow gradients',
  medium: 'Balanced quality and performance',
  high: 'Smooth shadows with minimal artifacts',
  ultra: 'Highest quality, recommended for screenshots only',
}

// =============================================================================
// Animation Mode Options
// =============================================================================

export const SHADOW_ANIMATION_MODE_OPTIONS: ShadowAnimationMode[] = ['pause', 'low', 'full']

export const SHADOW_ANIMATION_MODE_LABELS: Record<ShadowAnimationMode, string> = {
  pause: 'Pause during animation',
  low: 'Low quality during animation',
  full: 'Full quality always',
}

export const SHADOW_ANIMATION_MODE_TOOLTIPS: Record<ShadowAnimationMode, string> = {
  pause: 'Disable shadows during rotation for best performance',
  low: 'Use low quality shadows during rotation for smooth interaction',
  full: 'Maintain selected quality always (may affect performance)',
}

// =============================================================================
// URL Serialization Keys
// =============================================================================

export const URL_KEY_SHADOW_ENABLED = 'se'
export const URL_KEY_SHADOW_QUALITY = 'sq'
export const URL_KEY_SHADOW_SOFTNESS = 'ss'
export const URL_KEY_SHADOW_ANIMATION_MODE = 'sa'
