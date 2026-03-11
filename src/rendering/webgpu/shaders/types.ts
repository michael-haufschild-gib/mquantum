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
  | 0 // LCH/Oklab perceptual
  | 1 // Multi-source (Cosine)
  | 2 // Radial (Cosine)
  | 3 // Phase/Angular (HSL, wavefunction phase)
  | 4 // Mixed Phase+Distance (HSL, default)
  | 5 // Blackbody (analytic, no user color params)
  | 6 // Perceptually uniform cyclic phase map (Oklab)
  | 7 // Signed diverging phase map (HSL)
  | 8 // Domain coloring for wavefunctions (HSL + log-modulus contours)
  | 9 // Zero-centered diverging map for Re/Im(psi)
  | 10 // Relative phase to spatial reference arg(conj(psi_ref)*psi)
  | 11 // Radial distance spectral
  | 12 // Hamiltonian decomposition (K/G/V fractions)
  | 13 // Mode character map (wave-like vs mass-dominated)
  | 14 // Energy flux map (S direction + magnitude)
  | 15 // k-Space occupation map (FFT-based)
  | 16 // Purity map (global purity → saturation)
  | 17 // Entropy map (global von Neumann entropy → diverging scale)
  | 18 // Coherence map (spatial coherence fraction → color)
  | 19 // Viridis (perceptually uniform scientific colormap)
  | 20 // Inferno (high-contrast scientific colormap)
  | 21 // Density contours (isodensity lines on viridis ramp)
  | 22 // Phase-density composite (hue=phase, brightness=density)
  | 23 // Particle/antiparticle split (Dirac dual-channel)

/**
 * Lighting mode for compile-time optimization
 * Controls which lighting modules are included
 */
export type LightingMode =
  | 'none' // No lighting modules (~400 lines saved)
  | 'simple' // Basic diffuse only (no modules needed)
  | 'pbr' // GGX + Multi-Light

/**
 *
 */
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
   * - 0: Oklab only (LCH)
   * - 1,2: Cosine palette only
   * - 3,4,7,8,9,10,11: HSL + phase-aware logic
   * - 6: Oklab phase-aware cyclic map
   * - 5: No color modules (blackbody)
   * - 23: HSL (Dirac particle/antiparticle dual-channel)
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
