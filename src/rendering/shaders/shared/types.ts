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
  | 8 // Phase/Angular (Cosine)
  | 9 // Mixed Phase+Distance (Cosine)
  | 10 // Blackbody (no dependencies)

/**
 * Lighting mode for compile-time optimization
 * Controls which lighting modules are included
 */
export type LightingMode =
  | 'none' // No lighting modules (~400 lines saved)
  | 'simple' // Basic diffuse only (no modules needed)
  | 'pbr' // GGX + Multi-Light (no IBL)
  | 'full' // GGX + Multi-Light + IBL (default)

export interface ShaderConfig {
  dimension: number
  shadows: boolean
  temporal: boolean
  ambientOcclusion: boolean
  overrides?: string[]
  /** Enable SSS module compilation (conditionally compiled) */
  sss?: boolean
  /** Enable Fresnel rim lighting module compilation (conditionally compiled) */
  fresnel?: boolean
  /** Enable Curl noise flow distortion (conditionally compiled) */
  curl?: boolean
  /** Enable Chromatic dispersion effect (conditionally compiled) */
  dispersion?: boolean
  /** Enable Nodal surface highlighting (conditionally compiled) */
  nodal?: boolean
  /** Enable Energy level coloring (conditionally compiled) */
  energyColor?: boolean
  /** Enable Uncertainty shimmer effect (conditionally compiled) */
  shimmer?: boolean
  /** Enable Edge erosion effect (conditionally compiled) */
  erosion?: boolean
  /**
   * Erosion noise type for compile-time optimization (D4)
   * 0=Worley (Billowy), 1=Perlin (Smooth), 2=Hybrid
   * If provided, eliminates runtime branching in getErosionNoise()
   * If undefined, falls back to runtime uniform uErosionNoiseType
   */
  erosionNoiseType?: 0 | 1 | 2
  /**
   * High quality erosion mode
   * true: Use 3×3×3 Worley and 4-sample curl (slower but higher quality)
   * false/undefined: Use 2×2×2 Worley and 2-sample pseudo-curl (faster)
   */
  erosionHQ?: boolean
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
   * - 'pbr': GGX + Multi-Light (no IBL)
   * - 'full': All lighting including IBL (default)
   * If undefined, defaults to 'full'
   */
  lightingMode?: LightingMode
}
