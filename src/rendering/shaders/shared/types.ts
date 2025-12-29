/**
 * @deprecated OpacityMode is no longer used for raymarching fractals (mandelbulb, julia, schroedinger, blackhole).
 * These types are always rendered as fully opaque (solid mode).
 */
export type OpacityMode = 'solid' | 'simpleAlpha' | 'layeredSurfaces' | 'volumetricDensity';

export interface ShaderConfig {
  dimension: number;
  shadows: boolean;
  temporal: boolean;
  ambientOcclusion: boolean;
  overrides?: string[];
  /** Enable SSS module compilation (conditionally compiled) */
  sss?: boolean;
  /** Enable Fresnel rim lighting module compilation (conditionally compiled) */
  fresnel?: boolean;
  /** Enable Curl noise flow distortion (conditionally compiled) */
  curl?: boolean;
  /** Enable Chromatic dispersion effect (conditionally compiled) */
  dispersion?: boolean;
  /** Enable Nodal surface highlighting (conditionally compiled) */
  nodal?: boolean;
  /** Enable Energy level coloring (conditionally compiled) */
  energyColor?: boolean;
  /** Enable Uncertainty shimmer effect (conditionally compiled) */
  shimmer?: boolean;
  /** Enable Edge erosion effect (conditionally compiled) */
  erosion?: boolean;
  /**
   * Erosion noise type for compile-time optimization (D4)
   * 0=Worley (Billowy), 1=Perlin (Smooth), 2=Hybrid
   * If provided, eliminates runtime branching in getErosionNoise()
   * If undefined, falls back to runtime uniform uErosionNoiseType
   */
  erosionNoiseType?: 0 | 1 | 2;
}