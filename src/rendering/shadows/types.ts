/**
 * Shadow System Types
 *
 * Type definitions for the mandelbulb soft shadow rendering system.
 * Supports quality presets and animation mode control.
 */

/** Shadow quality preset - controls sample count in shader */
export type ShadowQuality = 'low' | 'medium' | 'high' | 'ultra'

/** Shadow behavior during camera rotation/animation */
export type ShadowAnimationMode = 'pause' | 'low' | 'full'

/** Complete shadow settings interface */
export interface ShadowSettings {
  enabled: boolean
  quality: ShadowQuality
  softness: number
  animationMode: ShadowAnimationMode
}

/** Map shadow quality to shader integer (for uniform) */
export const SHADOW_QUALITY_TO_INT: Record<ShadowQuality, number> = {
  low: 0,
  medium: 1,
  high: 2,
  ultra: 3,
}

/** Map shader integer back to shadow quality */
export const INT_TO_SHADOW_QUALITY: Record<number, ShadowQuality> = {
  0: 'low',
  1: 'medium',
  2: 'high',
  3: 'ultra',
}

/** Map shadow animation mode to shader integer (for uniform) */
export const SHADOW_ANIMATION_MODE_TO_INT: Record<ShadowAnimationMode, number> = {
  pause: 0, // Disable shadows during animation
  low: 1, // Use low quality during animation
  full: 2, // Keep full quality during animation
}

/** Map shader integer back to shadow animation mode */
export const INT_TO_SHADOW_ANIMATION_MODE: Record<number, ShadowAnimationMode> = {
  0: 'pause',
  1: 'low',
  2: 'full',
}
