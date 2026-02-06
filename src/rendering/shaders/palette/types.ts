/**
 * Color Palette Type Definitions
 *
 * Shared types for the unified color palette system.
 * Used by both shaders and UI components.
 *
 * @see docs/prd/enhanced-visuals-rendering-pipeline.md
 */

// ============================================================================
// Color Algorithm System
// ============================================================================

import { isPolytopeType, type ObjectType } from '@/lib/geometry/types'

/**
 * Color algorithm selection.
 * Determines how the color palette is generated.
 *
 * - monochromatic: Same hue, varying lightness only (based on base color)
 * - analogous: Hue varies ±30° from base color
 * - cosine: Smooth cosine gradient palette (Inigo Quilez technique)
 * - normal: Color based on surface normal direction
 * - distance: Color based on distance field value (orbit trap)
 * - lch: Perceptually uniform LCH/Oklab color space
 * - multiSource: Blend multiple value sources for complex coloring
 * - radial: Color based on 3D distance from origin (spherical gradient)
 */

export type ColorAlgorithm =
  | 'monochromatic'
  | 'analogous'
  | 'cosine'
  | 'normal'
  | 'distance'
  | 'lch'
  | 'multiSource'
  | 'radial'
  | 'phase'
  | 'mixed'
  | 'blackbody'

/**
 * Options for the Color Algorithm dropdown in the UI.
 */
export const COLOR_ALGORITHM_OPTIONS = [
  { value: 'monochromatic' as const, label: 'Monochromatic' },
  { value: 'analogous' as const, label: 'Analogous' },
  { value: 'cosine' as const, label: 'Cosine Gradient' },
  { value: 'normal' as const, label: 'Normal-Based' },
  { value: 'distance' as const, label: 'Distance Field' },
  { value: 'lch' as const, label: 'LCH Perceptual' },
  { value: 'multiSource' as const, label: 'Multi-Source' },
  { value: 'radial' as const, label: 'Radial (from center)' },
  { value: 'phase' as const, label: 'Angular (XZ Rotation)' },
  { value: 'mixed' as const, label: 'Angular + Depth' },
  { value: 'blackbody' as const, label: 'Blackbody (Heat)' },
] as const

/**
 * Map from ColorAlgorithm string to integer for shader uniform.
 */
export const COLOR_ALGORITHM_TO_INT: Record<ColorAlgorithm, number> = {
  monochromatic: 0,
  analogous: 1,
  cosine: 2,
  normal: 3,
  distance: 4,
  lch: 5,
  multiSource: 6,
  radial: 7,
  phase: 8,
  mixed: 9,
  blackbody: 10,
}

/**
 * Color algorithms that are only meaningful for Schroedinger (quantum wavefunction).
 * These use quantum-specific data that only exists for Schroedinger objects.
 * Note: 'phase' and 'mixed' use geometric position, not quantum data, so they're
 * available for all object types except blackhole.
 */
export const QUANTUM_ONLY_ALGORITHMS: readonly ColorAlgorithm[] = [] as const

/**
 * Color algorithms that use geometric angular/position data.
 * These work for all object types.
 * Uses azimuth angle in XZ plane for coloring.
 */
export const GEOMETRIC_PHASE_ALGORITHMS: readonly ColorAlgorithm[] = ['phase', 'mixed'] as const

/**
 * Check if a color algorithm is quantum-specific (Schroedinger only).
 * @param algorithm - The color algorithm to check
 * @returns True if the algorithm is quantum-only
 */
export function isQuantumOnlyAlgorithm(algorithm: ColorAlgorithm): boolean {
  return QUANTUM_ONLY_ALGORITHMS.includes(algorithm)
}

/**
 * Check if a color algorithm is geometric-phase-based.
 * @param algorithm - The color algorithm to check
 * @returns True if the algorithm uses geometric phase
 */
export function isGeometricPhaseAlgorithm(algorithm: ColorAlgorithm): boolean {
  return GEOMETRIC_PHASE_ALGORITHMS.includes(algorithm)
}

/**
 * Black hole algorithms - empty since blackhole type is removed.
 */
export const BLACKHOLE_ONLY_ALGORITHMS: readonly ColorAlgorithm[] = [] as const

/**
 * Check if a color algorithm is black-hole-specific.
 * @param algorithm - The color algorithm to check
 * @returns Always false since blackhole type is removed
 */
export function isBlackHoleOnlyAlgorithm(_algorithm: ColorAlgorithm): boolean {
  return false
}

/**
 * Polytope algorithms - empty since polytope types are removed.
 */
export const POLYTOPE_ONLY_ALGORITHMS: readonly ColorAlgorithm[] = [] as const

/**
 * Check if a color algorithm is polytope-specific.
 * @param algorithm - The color algorithm to check
 * @returns Always false since polytope types are removed
 */
export function isPolytopeOnlyAlgorithm(_algorithm: ColorAlgorithm): boolean {
  return false
}

/**
 * Check if a color algorithm is available for a specific object type.
 * Encapsulates the logic for showing/hiding algorithms based on object capability.
 *
 * @param algorithm - The color algorithm to check
 * @param objectType - The object type to check availability for
 * @returns True if the algorithm can be used with the object type
 */
export function isColorAlgorithmAvailable(
  algorithm: ColorAlgorithm,
  _objectType: ObjectType
): boolean {
  // Special case: Blackbody is available for Schroedinger
  if (algorithm === 'blackbody') {
    return true
  }

  // Quantum algorithms only for Schroedinger
  if (isQuantumOnlyAlgorithm(algorithm)) {
    return true
  }

  // Geometric phase algorithms available for all
  if (isGeometricPhaseAlgorithm(algorithm)) {
    return true
  }

  // Black hole algorithms - none exist now
  if (isBlackHoleOnlyAlgorithm(algorithm)) {
    return false
  }

  // Polytope algorithms - none exist now
  if (isPolytopeOnlyAlgorithm(algorithm)) {
    return isPolytopeType(_objectType)
  }

  // All other algorithms are available for all objects
  return true
}

/**
 * Cosine palette coefficients for the Inigo Quilez technique.
 * Formula: color = a + b * cos(2π * (c * t + d))
 *
 * Each array represents [R, G, B] components.
 */
export interface CosineCoefficients {
  /** Base offset - shifts the entire palette */
  a: [number, number, number]
  /** Amplitude - controls color intensity range */
  b: [number, number, number]
  /** Frequency - how many color cycles */
  c: [number, number, number]
  /** Phase - shifts colors along the gradient */
  d: [number, number, number]
}

/**
 * Distribution controls for remapping the input value (t).
 * Applied before palette lookup to shape color distribution.
 */
export interface DistributionSettings {
  /** Power curve exponent (0.25-4.0). <1 expands darks, >1 expands lights */
  power: number
  /** Number of palette cycles (0.5-5.0). >1 repeats the gradient */
  cycles: number
  /** Offset shift (0.0-1.0). Slides the gradient start point */
  offset: number
}

/**
 * Default cosine coefficients (Crimson Fade - smooth red to pink gradient).
 * Uses half-cycle frequency for smooth, non-rainbow gradients.
 */
export const DEFAULT_COSINE_COEFFICIENTS: CosineCoefficients = {
  a: [0.6, 0.2, 0.3],
  b: [0.4, 0.3, 0.3],
  c: [0.5, 0.5, 0.5],
  d: [0.0, 0.0, 0.0],
}

/**
 * Default distribution settings (no transformation).
 */
export const DEFAULT_DISTRIBUTION: DistributionSettings = {
  power: 1.0,
  cycles: 1.0,
  offset: 0.0,
}

/**
 * Default color algorithm for new sessions.
 */
export const DEFAULT_COLOR_ALGORITHM: ColorAlgorithm = 'mixed'

/**
 * Multi-source weight configuration for blending different value sources.
 */
export interface MultiSourceWeights {
  /** Weight for depth/iteration value */
  depth: number
  /** Weight for orbit trap value (fractals only) */
  orbitTrap: number
  /** Weight for normal direction */
  normal: number
}

/**
 * Default multi-source weights.
 */
export const DEFAULT_MULTI_SOURCE_WEIGHTS: MultiSourceWeights = {
  depth: 0.5,
  orbitTrap: 0.3,
  normal: 0.2,
}

// ============================================================================
// LCH Preset System
// ============================================================================

/**
 * LCH preset configuration with lightness and chroma values.
 */
export interface LchPreset {
  value: string
  label: string
  lightness: number
  chroma: number
}

/**
 * Built-in LCH presets for perceptually uniform coloring.
 */
export const LCH_PRESET_OPTIONS: LchPreset[] = [
  { value: 'vibrant', label: 'Vibrant', lightness: 0.7, chroma: 0.15 },
  { value: 'pastel', label: 'Pastel', lightness: 0.85, chroma: 0.08 },
  { value: 'deep', label: 'Deep', lightness: 0.5, chroma: 0.2 },
  { value: 'muted', label: 'Muted', lightness: 0.65, chroma: 0.06 },
  { value: 'neon', label: 'Neon', lightness: 0.75, chroma: 0.25 },
  { value: 'earth', label: 'Earth Tones', lightness: 0.55, chroma: 0.1 },
  { value: 'candy', label: 'Candy', lightness: 0.8, chroma: 0.18 },
  { value: 'jewel', label: 'Jewel Tones', lightness: 0.45, chroma: 0.22 },
]
