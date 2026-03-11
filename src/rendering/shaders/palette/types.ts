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

/**
 *
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
  | 'radialDistance'
  | 'hamiltonianDecomposition'
  | 'modeCharacter'
  | 'energyFlux'
  | 'kSpaceOccupation'
  | 'purityMap'
  | 'entropyMap'
  | 'coherenceMap'
  | 'viridis'
  | 'inferno'
  | 'densityContours'
  | 'phaseDensity'
  | 'particleAntiparticle'

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
  { value: 'radialDistance' as const, label: 'Radial Distance (Spectral)' },
  { value: 'hamiltonianDecomposition' as const, label: 'Hamiltonian Decomposition' },
  { value: 'modeCharacter' as const, label: 'Mode Character Map' },
  { value: 'energyFlux' as const, label: 'Energy Flux Map' },
  { value: 'kSpaceOccupation' as const, label: 'k-Space Occupation Map' },
  { value: 'purityMap' as const, label: 'Purity Map (Open Quantum)' },
  { value: 'entropyMap' as const, label: 'Entropy Map (Open Quantum)' },
  { value: 'coherenceMap' as const, label: 'Coherence Map (Open Quantum)' },
  { value: 'viridis' as const, label: 'Viridis' },
  { value: 'inferno' as const, label: 'Inferno' },
  { value: 'densityContours' as const, label: 'Density Contours' },
  { value: 'phaseDensity' as const, label: 'Phase-Density Composite' },
  { value: 'particleAntiparticle' as const, label: 'Upper / Lower Spinor' },
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
  radialDistance: 11,
  hamiltonianDecomposition: 12,
  modeCharacter: 13,
  energyFlux: 14,
  kSpaceOccupation: 15,
  purityMap: 16,
  entropyMap: 17,
  coherenceMap: 18,
  viridis: 19,
  inferno: 20,
  densityContours: 21,
  phaseDensity: 22,
  particleAntiparticle: 23,
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
 *
 */
export type DomainColoringModulusMode = 'logPsiAbsSquared' | 'logPsiAbs'

/**
 *
 */
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

/**
 *
 */
export interface PhaseDivergingSettings {
  /** Center color pinned at cos(phase) = 0 crossings. */
  neutralColor: string
  /** Positive wing color for cos(phase) > 0. */
  positiveColor: string
  /** Negative wing color for cos(phase) < 0. */
  negativeColor: string
}

/**
 *
 */
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
export const DEFAULT_COLOR_ALGORITHM: ColorAlgorithm = 'radialDistance'

/**
 * Returns the color algorithm options available for the given quantum mode.
 *
 * The 'relativePhase' algorithm requires a reference wavefunction
 * (arg(conj(psi_ref) * psi)), which does not exist for classical field modes.
 * All other algorithms work because sign-as-phase encoding provides meaningful
 * positive/negative coloring.
 *
 * @param quantumMode - Current quantum mode
 * @returns Filtered array of color algorithm options
 */
export function getAvailableColorAlgorithms(
  quantumMode: string,
  openQuantumEnabled: boolean = false,
): readonly (typeof COLOR_ALGORITHM_OPTIONS)[number][] {
  // Educational analysis algorithms — only available for free scalar field
  const educationalAlgos = new Set<string>([
    'hamiltonianDecomposition',
    'modeCharacter',
    'energyFlux',
    'kSpaceOccupation',
  ])

  // Open quantum algorithms — only available when density matrix mode is active
  const openQuantumAlgos = new Set<string>([
    'purityMap',
    'entropyMap',
    'coherenceMap',
  ])

  // TDSE / BEC compute modes render into a density grid texture
  // (R=density, G=logDensity, B=phase, A=potOverlay). Only algorithms that read
  // from the grid's R/B channels produce meaningful coloring. Geometric algorithms
  // (lch, radial, multiSource, radialDistance, phase, mixed) color by world-space
  // position and silently fall back to blackbody — remove them from the dropdown.
  if (quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics') {
    const computeValidAlgos = new Set<string>([
      'blackbody',          // R (density) → heat ramp
      'phaseCyclicUniform', // B (phase) → perceptual cyclic hue
      'phaseDiverging',     // B (phase) → signed diverging
      'diverging',          // B (phase) → zero-centered Re/Im
      'domainColoringPsi',  // R+B (density + phase) → domain coloring
      'viridis',            // R (density) → perceptually uniform scientific ramp
      'inferno',            // R (density) → high-contrast scientific ramp
      'densityContours',    // R (density) → viridis + isodensity contour lines
      'phaseDensity',       // R+B (density + phase) → hue=phase, brightness=density
    ])
    return COLOR_ALGORITHM_OPTIONS.filter((opt) => computeValidAlgos.has(opt.value))
  }

  // Dirac equation: same density grid channels as TDSE, plus particleAntiparticle
  // which reads R=upper spinor, G=lower spinor from the dual-channel field view.
  if (quantumMode === 'diracEquation') {
    const computeValidAlgos = new Set<string>([
      'blackbody',
      'phaseCyclicUniform',
      'phaseDiverging',
      'diverging',
      'domainColoringPsi',
      'viridis',
      'inferno',
      'densityContours',
      'phaseDensity',
      'particleAntiparticle',
    ])
    return COLOR_ALGORITHM_OPTIONS.filter((opt) => computeValidAlgos.has(opt.value))
  }

  if (quantumMode === 'freeScalarField') {
    // Free scalar has sign-proxy phase (0 or π) — exclude continuous-phase algorithms.
    // Also include educational analysis algorithms unique to this mode.
    const computeValidAlgos = new Set<string>([
      'blackbody',
      'phaseDiverging',
      'diverging',
      'viridis',
      'inferno',
      'densityContours',
      'hamiltonianDecomposition',
      'modeCharacter',
      'energyFlux',
      'kSpaceOccupation',
    ])
    return COLOR_ALGORITHM_OPTIONS.filter((opt) => computeValidAlgos.has(opt.value))
  }

  // Phase-dependent algorithms — meaningless in density matrix mode because the
  // grid's B channel stores coherenceFraction (0-1), not complex phase (0-2π).
  // Interpreting coherenceFraction as phase produces misleading colors.
  const phaseDependentAlgos = new Set<string>([
    'phase',
    'mixed',
    'phaseCyclicUniform',
    'phaseDiverging',
    'domainColoringPsi',
    'diverging',
    'relativePhase',
  ])

  // Dirac-only algorithms — require spinor field data not present in other modes
  const diracOnlyAlgos = new Set<string>(['particleAntiparticle'])

  // Non-freeScalar modes: exclude educational analysis algorithms, Dirac-only, and
  // conditionally include/exclude open quantum and phase-dependent algorithms
  return COLOR_ALGORITHM_OPTIONS.filter(
    (opt) =>
      !educationalAlgos.has(opt.value) &&
      !diracOnlyAlgos.has(opt.value) &&
      (!openQuantumAlgos.has(opt.value) || openQuantumEnabled) &&
      (!phaseDependentAlgos.has(opt.value) || !openQuantumEnabled)
  )
}

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
