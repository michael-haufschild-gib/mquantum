/**
 * WGSL Shader Types
 *
 * Type definitions shared across WGSL shader modules.
 *
 * @module rendering/webgpu/shaders/types
 */

/**
 * Color algorithm for compile-time optimization
 * When specified, only the required color module(s) are included
 */
export type ColorAlgorithm =
  | 0 // Monochromatic (HSL)
  | 1 // Analogous (HSL)
  | 2 // Cosine gradient
  | 3 // Normal-based (Cosine)
  | 4 // Distance-field (Cosine)
  | 5 // LCH/Oklab perceptual
  | 6 // Multi-source (Cosine)
  | 7 // Radial (Cosine)
  | 8 // Phase/Angular (HSL, wavefunction phase)
  | 9 // Mixed Phase+Distance (HSL, default)
  | 10 // Blackbody (analytic, no user color params)

/**
 * Lighting mode for compile-time optimization
 * Controls which lighting modules are included
 */
export type LightingMode =
  | 'none' // No lighting modules (~400 lines saved)
  | 'simple' // Basic diffuse only (no modules needed)
  | 'pbr' // GGX + Multi-Light

export interface WGSLShaderConfig {
  dimension: number
  temporal: boolean
  overrides?: string[]
  /** Enable SSS module compilation (conditionally compiled) */
  sss?: boolean
  /** Enable Nodal surface highlighting (conditionally compiled) */
  nodal?: boolean
  /** Enable Energy level coloring (conditionally compiled) */
  energyColor?: boolean
  /** Enable uncertainty-boundary emphasis effect (conditionally compiled) */
  uncertaintyBoundary?: boolean
  /**
   * Color algorithm for compile-time optimization
   * When specified, only the required color module(s) are included:
   * - 0,1: HSL only
   * - 2,3,4,6,7,8,9: Cosine palette only
   * - 5: Oklab only
   * - 10: No color modules (blackbody)
   * If undefined, all color modules included for runtime switching
   */
  colorAlgorithm?: ColorAlgorithm
  /**
   * Lighting mode for compile-time optimization
   * - 'none': No lighting modules (~400 lines saved)
   * - 'simple': Basic diffuse only
   * - 'pbr': GGX + Multi-Light
   * If undefined, defaults to 'pbr'
   */
  lightingMode?: LightingMode
}
