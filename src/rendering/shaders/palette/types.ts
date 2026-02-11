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

/**
 * Color algorithm selection.
 * Determines how the color palette is generated.
 *
 * - lch: Perceptually uniform LCH/Oklab color space
 * - multiSource: Blend multiple value sources for complex coloring
 * - radial: Color based on 3D distance from origin (spherical gradient)
 * - phaseCyclicUniform: Perceptually uniform cyclic phase map for arg(ψ)
 * - phaseDiverging: Signed diverging palette (Re(ψ) sign proxy)
 * - diverging: Zero-centered diverging map for Re(ψ) or Im(ψ)
 * - domainColoringPsi: Domain coloring for wavefunction phase + modulus
 * - relativePhase: Relative phase map hue=arg(conj(ψ_ref)*ψ), lightness≈|ψ|²
 */

export type ColorAlgorithm =
  | 'lch'
  | 'multiSource'
  | 'radial'
  | 'phase'
  | 'mixed'
  | 'phaseCyclicUniform'
  | 'phaseDiverging'
  | 'diverging'
  | 'domainColoringPsi'
  | 'relativePhase'
  | 'blackbody'
  | 'energy'

/**
 * Options for the Color Algorithm dropdown in the UI.
 */
export const COLOR_ALGORITHM_OPTIONS = [
  { value: 'lch' as const, label: 'LCH Perceptual' },
  { value: 'multiSource' as const, label: 'Multi-Source' },
  { value: 'radial' as const, label: 'Radial (from center)' },
  { value: 'phase' as const, label: 'Angular (XZ Rotation)' },
  { value: 'mixed' as const, label: 'Angular + Depth' },
  { value: 'phaseCyclicUniform' as const, label: 'Phase Cyclic Uniform' },
  { value: 'phaseDiverging' as const, label: 'Signed Phase Diverging' },
  { value: 'diverging' as const, label: 'Diverging (Re/Im)' },
  { value: 'domainColoringPsi' as const, label: 'Domain Coloring Psi' },
  { value: 'relativePhase' as const, label: 'Relative Phase (ref)' },
  { value: 'blackbody' as const, label: 'Blackbody (Heat)' },
  { value: 'energy' as const, label: 'Energy (Spectral)' },
] as const

/**
 * Map from ColorAlgorithm string to integer for shader uniform.
 */
export const COLOR_ALGORITHM_TO_INT: Record<ColorAlgorithm, number> = {
  lch: 0,
  multiSource: 1,
  radial: 2,
  phase: 3,
  mixed: 4,
  blackbody: 5,
  phaseCyclicUniform: 6,
  phaseDiverging: 7,
  domainColoringPsi: 8,
  diverging: 9,
  relativePhase: 10,
  energy: 11,
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

export type DomainColoringModulusMode = 'logPsiAbsSquared' | 'logPsiAbs'

export interface DomainColoringSettings {
  /** Log modulus source: log(|psi|^2) or log(|psi|) */
  modulusMode: DomainColoringModulusMode
  /** Toggle anti-aliased contour lines in log-modulus space */
  contoursEnabled: boolean
  /** Number of contour periods in the normalized log-modulus range */
  contourDensity: number
  /** Contour half-width in normalized line-distance space */
  contourWidth: number
  /** Blend strength for contour darkening */
  contourStrength: number
}

export interface PhaseDivergingSettings {
  /** Center color pinned at cos(phase) = 0 crossings. */
  neutralColor: string
  /** Positive wing color for cos(phase) > 0. */
  positiveColor: string
  /** Negative wing color for cos(phase) < 0. */
  negativeColor: string
}

export interface DivergingPsiSettings {
  /** Center color pinned at zero crossing. */
  neutralColor: string
  /** Positive wing color for signed values > 0. */
  positiveColor: string
  /** Negative wing color for signed values < 0. */
  negativeColor: string
  /** Intensity floor applied before sign-strength modulation. */
  intensityFloor: number
  /** Which wavefunction component to extract: 'real' = Re(psi), 'imag' = Im(psi). */
  component: 'real' | 'imag'
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
 * Default domain-coloring controls.
 */
export const DEFAULT_DOMAIN_COLORING_SETTINGS: DomainColoringSettings = {
  modulusMode: 'logPsiAbsSquared',
  contoursEnabled: true,
  contourDensity: 8.0,
  contourWidth: 0.08,
  contourStrength: 0.45,
}

export const DEFAULT_PHASE_DIVERGING_SETTINGS: PhaseDivergingSettings = {
  neutralColor: '#ebebeb',
  positiveColor: '#eb3d38',
  negativeColor: '#3866f2',
}

export const DEFAULT_DIVERGING_PSI_SETTINGS: DivergingPsiSettings = {
  neutralColor: '#d9d9d9',
  positiveColor: '#e83b3b',
  negativeColor: '#3166f5',
  intensityFloor: 0.2,
  component: 'real',
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
